use image::ColorType;
use serde::Serialize;
use std::io::Cursor;

const MAX_INPUT_BYTES: usize = 64 * 1024 * 1024;
const MAX_DIMENSION: u32 = 16_384;
const MAX_PIXELS: u64 = 100_000_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundSegmentationCapabilities {
    available: bool,
    platform: &'static str,
    backend: &'static str,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundSegmentationResult {
    png_bytes: Vec<u8>,
    width: u32,
    height: u32,
    instance_count: usize,
    backend: &'static str,
}

#[tauri::command]
pub fn foreground_segmentation_capabilities() -> ForegroundSegmentationCapabilities {
    capability()
}

#[tauri::command]
pub async fn foreground_segment(bytes: Vec<u8>) -> Result<ForegroundSegmentationResult, String> {
    validate_source(&bytes)?;
    tauri::async_runtime::spawn_blocking(move || segment_platform(&bytes))
        .await
        .map_err(|error| format!("Foreground segmentation worker failed: {error}"))?
}

fn validate_source(bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("Foreground segmentation requires a non-empty image.".into());
    }
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(format!(
            "Foreground segmentation input exceeds the {} byte limit.",
            MAX_INPUT_BYTES
        ));
    }
    let (width, height) = image::io::Reader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Foreground segmentation input is not a valid supported image.".to_string())?
        .into_dimensions()
        .map_err(|_| "Foreground segmentation input is not a valid supported image.".to_string())?;
    if width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err("Foreground segmentation image dimensions are unsupported.".into());
    }
    if u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("Foreground segmentation image exceeds the pixel limit.".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn capability() -> ForegroundSegmentationCapabilities {
    use objc2_foundation::{NSOperatingSystemVersion, NSProcessInfo};

    let available =
        NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
            majorVersion: 14,
            minorVersion: 0,
            patchVersion: 0,
        });
    ForegroundSegmentationCapabilities {
        available,
        platform: "macos",
        backend: if available {
            "apple-vision"
        } else {
            "unavailable"
        },
        reason: (!available).then(|| {
            "capability-required: Apple Vision foreground segmentation requires macOS 14 or newer."
                .to_string()
        }),
    }
}

#[cfg(not(target_os = "macos"))]
fn capability() -> ForegroundSegmentationCapabilities {
    ForegroundSegmentationCapabilities {
        available: false,
        platform: std::env::consts::OS,
        backend: "unavailable",
        reason: Some(
            "capability-required: foreground segmentation is available only on macOS 14 or newer."
                .to_string(),
        ),
    }
}

#[cfg(target_os = "macos")]
fn segment_platform(bytes: &[u8]) -> Result<ForegroundSegmentationResult, String> {
    use objc2::{rc::Retained, runtime::AnyObject, AnyThread};
    use objc2_core_video::{
        kCVPixelFormatType_32BGRA, CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow,
        CVPixelBufferGetDataSize, CVPixelBufferGetHeight, CVPixelBufferGetPixelFormatType,
        CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags,
        CVPixelBufferUnlockBaseAddress,
    };
    use objc2_foundation::{NSArray, NSData, NSDictionary};
    use objc2_vision::{
        VNGenerateForegroundInstanceMaskRequest, VNImageOption, VNImageRequestHandler, VNRequest,
    };

    let host = capability();
    if !host.available {
        return Err(host.reason.unwrap_or_else(|| {
            "capability-required: foreground segmentation is unavailable.".into()
        }));
    }

    let data = NSData::with_bytes(bytes);
    let options = NSDictionary::<VNImageOption, AnyObject>::new();
    let handler = VNImageRequestHandler::initWithData_options(
        VNImageRequestHandler::alloc(),
        &data,
        &options,
    );
    let request = unsafe { VNGenerateForegroundInstanceMaskRequest::new() };
    let requests: Retained<NSArray<VNRequest>> = NSArray::from_slice(&[&request]);
    handler
        .performRequests_error(&requests)
        .map_err(|error| format!("Apple Vision foreground request failed: {error:?}"))?;
    let results = unsafe { request.results() }
        .ok_or_else(|| "Apple Vision returned no foreground observations.".to_string())?;
    let observation = results
        .firstObject()
        .ok_or_else(|| "Apple Vision found no foreground instances.".to_string())?;
    let instances = unsafe { observation.allInstances() };
    let instance_count = instances.count();
    if instance_count == 0 {
        return Err("Apple Vision found no foreground instances.".into());
    }
    let buffer = unsafe {
        observation
            .generateMaskedImageOfInstances_fromRequestHandler_croppedToInstancesExtent_error(
                &instances, &handler, false,
            )
            .map_err(|error| {
                format!("Apple Vision could not render the foreground mask: {error:?}")
            })?
    };
    if CVPixelBufferGetPixelFormatType(&buffer) != kCVPixelFormatType_32BGRA {
        return Err("Apple Vision returned an unsupported pixel-buffer format.".into());
    }
    let lock_flags = CVPixelBufferLockFlags::ReadOnly;
    let lock = unsafe { CVPixelBufferLockBaseAddress(&buffer, lock_flags) };
    if lock != 0 {
        return Err(format!(
            "Apple Vision pixel buffer could not be locked ({lock})."
        ));
    }
    struct Unlock<'a> {
        buffer: &'a objc2_core_video::CVPixelBuffer,
        flags: CVPixelBufferLockFlags,
    }
    impl Drop for Unlock<'_> {
        fn drop(&mut self) {
            unsafe {
                CVPixelBufferUnlockBaseAddress(self.buffer, self.flags);
            }
        }
    }
    let _unlock = Unlock {
        buffer: &buffer,
        flags: lock_flags,
    };
    let width = CVPixelBufferGetWidth(&buffer);
    let height = CVPixelBufferGetHeight(&buffer);
    let bytes_per_row = CVPixelBufferGetBytesPerRow(&buffer);
    validate_output_dimensions(width, height)?;
    let source_len = bytes_per_row
        .checked_mul(height)
        .ok_or_else(|| "Foreground pixel buffer size overflowed.".to_string())?;
    if source_len > CVPixelBufferGetDataSize(&buffer) {
        return Err("Apple Vision returned a truncated pixel buffer.".into());
    }
    let base = CVPixelBufferGetBaseAddress(&buffer).cast::<u8>();
    if base.is_null() {
        return Err("Apple Vision returned a pixel buffer without an address.".into());
    }
    let source = unsafe { std::slice::from_raw_parts(base, source_len) };
    let rgba = convert_bgra_rows(source, width, height, bytes_per_row)?;
    let mut png_bytes = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png_bytes)
        .encode(&rgba, width as u32, height as u32, ColorType::Rgba8)
        .map_err(|error| format!("Foreground PNG encoding failed: {error}"))?;
    Ok(ForegroundSegmentationResult {
        png_bytes,
        width: width as u32,
        height: height as u32,
        instance_count,
        backend: "apple-vision",
    })
}

fn validate_output_dimensions(width: usize, height: usize) -> Result<(), String> {
    let width =
        u64::try_from(width).map_err(|_| "Foreground output width is unsupported.".to_string())?;
    let height = u64::try_from(height)
        .map_err(|_| "Foreground output height is unsupported.".to_string())?;
    if width == 0
        || height == 0
        || width > u64::from(MAX_DIMENSION)
        || height > u64::from(MAX_DIMENSION)
        || width
            .checked_mul(height)
            .is_none_or(|pixels| pixels > MAX_PIXELS)
    {
        return Err("Foreground segmentation output dimensions are unsupported.".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn segment_platform(_bytes: &[u8]) -> Result<ForegroundSegmentationResult, String> {
    Err(
        "capability-required: foreground segmentation is available only on macOS 14 or newer."
            .into(),
    )
}

fn convert_bgra_rows(
    source: &[u8],
    width: usize,
    height: usize,
    bytes_per_row: usize,
) -> Result<Vec<u8>, String> {
    let packed = width
        .checked_mul(4)
        .ok_or_else(|| "Foreground pixel width overflowed.".to_string())?;
    let source_len = bytes_per_row
        .checked_mul(height)
        .ok_or_else(|| "Foreground pixel buffer size overflowed.".to_string())?;
    if bytes_per_row < packed || source.len() < source_len {
        return Err("Foreground pixel buffer rows are truncated.".into());
    }
    let output_len = packed
        .checked_mul(height)
        .ok_or_else(|| "Foreground output size overflowed.".to_string())?;
    let mut rgba = vec![0; output_len];
    for row in 0..height {
        let input = &source[row * bytes_per_row..row * bytes_per_row + packed];
        let output = &mut rgba[row * packed..(row + 1) * packed];
        for (bgra, rgba) in input.chunks_exact(4).zip(output.chunks_exact_mut(4)) {
            rgba.copy_from_slice(&[bgra[2], bgra[1], bgra[0], bgra[3]]);
        }
    }
    Ok(rgba)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_invalid_sources() {
        assert!(validate_source(&[]).unwrap_err().contains("non-empty"));
        assert!(validate_source(&[1, 2, 3])
            .unwrap_err()
            .contains("valid supported image"));
    }

    #[test]
    fn converts_row_padded_bgra_without_copying_padding() {
        let source = [
            1, 2, 3, 4, 5, 6, 7, 8, 99, 99, 99, 99, 9, 10, 11, 12, 13, 14, 15, 16, 88, 88, 88, 88,
        ];
        assert_eq!(
            convert_bgra_rows(&source, 2, 2, 12).unwrap(),
            [3, 2, 1, 4, 7, 6, 5, 8, 11, 10, 9, 12, 15, 14, 13, 16]
        );
    }

    #[test]
    fn rejects_unsafe_output_dimensions() {
        assert!(validate_output_dimensions(0, 1).is_err());
        assert!(validate_output_dimensions(MAX_DIMENSION as usize + 1, 1).is_err());
        assert!(validate_output_dimensions(10_001, 10_001).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "requires the macOS 14 Apple Vision runtime"]
    fn apple_vision_smoke_segments_a_real_png_fixture() {
        if !capability().available {
            return;
        }
        let result = segment_platform(include_bytes!("../../icons/icon.png")).unwrap();
        assert!(result.width > 0);
        assert!(result.height > 0);
        assert!(result.instance_count > 0);
        assert!(result.png_bytes.starts_with(&[137, 80, 78, 71]));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn unsupported_hosts_fail_closed() {
        assert!(!capability().available);
        assert!(segment_platform(&[1])
            .unwrap_err()
            .contains("capability-required"));
    }
}
