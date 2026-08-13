use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use hmac::{Hmac, Mac};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::ai_proxy::ProxyError;

const SERVICE: &str = "com.nebutra.cutout";
const RECEIPT_KEY_ACCOUNT: &str = "host:multimodal-receipt:v1";

type HmacSha256 = Hmac<Sha256>;
const MAX_PLAYBACK_BYTES: usize = 64 * 1024 * 1024;
const PLAYBACK_TIMEOUT_SECS: u64 = 30;
const PLAYBACK_DECODER: &str = "avfoundation-asset-image-generator-v1";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultimodalHostContext {
    pub request_id: String,
    pub run_id: String,
    pub semantic_role: Option<String>,
    pub node_id: Option<String>,
    pub capability_id: Option<String>,
    #[serde(default)]
    pub accepted_reference_artifact_ids: Vec<String>,
    #[serde(default)]
    pub lock_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MultimodalArtifactEvidence {
    pub artifact_id: String,
    pub sha256: String,
    pub media_type: String,
    pub byte_length: usize,
    pub decoded: bool,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u64>,
    pub frame_rate: Option<f64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub sample_tables_readable: Option<bool>,
    pub playback_verified: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackPromotionEvidence {
    pub source_receipt_hash: String,
    pub decoder: String,
    pub representative_frames: u32,
    pub non_blank_frames: u32,
    pub pixel_evidence_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MultimodalReceiptPayload {
    protocol: String,
    receipt_id: String,
    request_id: String,
    run_id: String,
    provider_id: String,
    provider_kind: String,
    model: String,
    route_id: String,
    operation: String,
    semantic_role: Option<String>,
    node_id: Option<String>,
    capability_id: Option<String>,
    accepted_reference_artifact_ids: Vec<String>,
    lock_ids: Vec<String>,
    status: String,
    artifact: MultimodalArtifactEvidence,
    started_at: u64,
    completed_at: u64,
    remote_task_id_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    playback_promotion: Option<PlaybackPromotionEvidence>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultimodalHostReceipt {
    pub protocol: String,
    pub receipt_id: String,
    pub receipt_hash: String,
    pub request_id: String,
    pub run_id: String,
    pub provider_id: String,
    pub provider_kind: String,
    pub model: String,
    pub route_id: String,
    pub operation: String,
    pub semantic_role: Option<String>,
    pub node_id: Option<String>,
    pub capability_id: Option<String>,
    pub accepted_reference_artifact_ids: Vec<String>,
    pub lock_ids: Vec<String>,
    pub status: String,
    pub artifact: MultimodalArtifactEvidence,
    pub started_at: u64,
    pub completed_at: u64,
    pub remote_task_id_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playback_promotion: Option<PlaybackPromotionEvidence>,
    pub signature: String,
}

impl MultimodalHostReceipt {
    fn payload(&self) -> MultimodalReceiptPayload {
        MultimodalReceiptPayload {
            protocol: self.protocol.clone(),
            receipt_id: self.receipt_id.clone(),
            request_id: self.request_id.clone(),
            run_id: self.run_id.clone(),
            provider_id: self.provider_id.clone(),
            provider_kind: self.provider_kind.clone(),
            model: self.model.clone(),
            route_id: self.route_id.clone(),
            operation: self.operation.clone(),
            semantic_role: self.semantic_role.clone(),
            node_id: self.node_id.clone(),
            capability_id: self.capability_id.clone(),
            accepted_reference_artifact_ids: self.accepted_reference_artifact_ids.clone(),
            lock_ids: self.lock_ids.clone(),
            status: self.status.clone(),
            artifact: self.artifact.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
            remote_task_id_hash: self.remote_task_id_hash.clone(),
            playback_promotion: self.playback_promotion.clone(),
        }
    }
}

fn signing_key_cache() -> &'static Mutex<Option<Vec<u8>>> {
    static CACHE: OnceLock<Mutex<Option<Vec<u8>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn signing_key() -> Result<Vec<u8>, ProxyError> {
    let mut cache = signing_key_cache()
        .lock()
        .map_err(|_| ProxyError::Keychain)?;
    if let Some(key) = cache.as_ref() {
        return Ok(key.clone());
    }
    let entry = Entry::new(SERVICE, RECEIPT_KEY_ACCOUNT).map_err(|_| ProxyError::Keychain)?;
    let encoded = match entry.get_password() {
        Ok(value) => value,
        Err(KeyringError::NoEntry) => {
            let value = format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            entry
                .set_password(&value)
                .map_err(|_| ProxyError::Keychain)?;
            value
        }
        Err(_) => return Err(ProxyError::Keychain),
    };
    let key = encoded.into_bytes();
    if key.len() < 32 {
        return Err(ProxyError::Keychain);
    }
    *cache = Some(key.clone());
    Ok(key)
}

fn payload_bytes(payload: &MultimodalReceiptPayload) -> Result<Vec<u8>, ProxyError> {
    serde_json::to_vec(payload)
        .map_err(|_| ProxyError::Request("could not encode multimodal Host receipt".into()))
}

fn sign_hash(hash: &str, key: &[u8]) -> Result<String, ProxyError> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|_| ProxyError::Keychain)?;
    mac.update(hash.as_bytes());
    Ok(hex_digest(&mac.finalize().into_bytes()))
}

fn verify_hash(hash: &str, signature: &str, key: &[u8]) -> Result<(), ProxyError> {
    let signature = decode_hex(signature).ok_or_else(|| {
        ProxyError::Request("multimodal Host receipt signature is invalid".into())
    })?;
    let mut mac = HmacSha256::new_from_slice(key).map_err(|_| ProxyError::Keychain)?;
    mac.update(hash.as_bytes());
    mac.verify_slice(&signature)
        .map_err(|_| ProxyError::Request("multimodal Host receipt signature is invalid".into()))
}

pub(crate) fn sign_host_payload<T: Serialize>(payload: &T) -> Result<(String, String), ProxyError> {
    let bytes = serde_json::to_vec(payload)
        .map_err(|_| ProxyError::Request("could not encode Host receipt".into()))?;
    let receipt_hash = sha256(&bytes);
    let signature = sign_hash(&receipt_hash, &signing_key()?)?;
    Ok((receipt_hash, signature))
}

pub(crate) fn verify_host_payload<T: Serialize>(
    payload: &T,
    receipt_hash: &str,
    signature: &str,
) -> Result<(), ProxyError> {
    let bytes = serde_json::to_vec(payload)
        .map_err(|_| ProxyError::Request("could not encode Host receipt".into()))?;
    let expected_hash = sha256(&bytes);
    if receipt_hash != expected_hash {
        return Err(ProxyError::Request("Host receipt hash is invalid".into()));
    }
    verify_hash(receipt_hash, signature, &signing_key()?)
}

pub fn sha256(bytes: &[u8]) -> String {
    hex_digest(&Sha256::digest(bytes))
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex(value: &str) -> Option<Vec<u8>> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
}

fn validate_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && !value.chars().any(char::is_control)
        && !value.contains("Bearer ")
        && !value.starts_with("sk-")
}

fn validate_route_binding(
    model: &str,
    operation: &str,
    route_id: &str,
    accepted_reference_artifact_ids: &[String],
    lock_ids: &[String],
) -> Result<(), ProxyError> {
    if route_id != format!("route:dashscope:{model}:{operation}") {
        return Err(ProxyError::Request(
            "multimodal Host receipt route binding is invalid".into(),
        ));
    }
    let wan27 = model == "wan2.7-i2v-2026-04-25";
    let image_to_video = operation == "image-to-video";
    if wan27 != image_to_video
        || (image_to_video && (accepted_reference_artifact_ids.len() != 1 || lock_ids.is_empty()))
    {
        return Err(ProxyError::Request(
            "multimodal image-to-video receipt binding is invalid".into(),
        ));
    }
    Ok(())
}

pub fn artifact_evidence(
    bytes: &[u8],
    media_type: &str,
    width: Option<u32>,
    height: Option<u32>,
) -> MultimodalArtifactEvidence {
    let digest = sha256(bytes);
    MultimodalArtifactEvidence {
        artifact_id: format!("artifact:sha256:{digest}"),
        sha256: digest,
        media_type: media_type.to_string(),
        byte_length: bytes.len(),
        decoded: true,
        width,
        height,
        duration_ms: None,
        frame_rate: None,
        video_codec: None,
        audio_codec: None,
        sample_tables_readable: None,
        playback_verified: None,
    }
}

#[allow(clippy::too_many_arguments)]
pub fn issue_receipt(
    context: &MultimodalHostContext,
    provider_id: &str,
    model: &str,
    operation: &str,
    artifact: MultimodalArtifactEvidence,
    started_at: u64,
    completed_at: u64,
    remote_task_id: Option<&str>,
) -> Result<MultimodalHostReceipt, ProxyError> {
    let route_id = format!("route:dashscope:{model}:{operation}");
    let receipt_id = format!("receipt:multimodal:{}", uuid::Uuid::new_v4().simple());
    let remote_task_id_hash = remote_task_id.map(|value| sha256(value.as_bytes()));
    let payload = MultimodalReceiptPayload {
        protocol: "cutout.multimodal-host-receipt.v1".into(),
        receipt_id,
        request_id: context.request_id.clone(),
        run_id: context.run_id.clone(),
        provider_id: provider_id.to_string(),
        provider_kind: "dashscope".into(),
        model: model.to_string(),
        route_id,
        operation: operation.to_string(),
        semantic_role: context.semantic_role.clone(),
        node_id: context.node_id.clone(),
        capability_id: context.capability_id.clone(),
        accepted_reference_artifact_ids: context.accepted_reference_artifact_ids.clone(),
        lock_ids: context.lock_ids.clone(),
        status: "succeeded".into(),
        artifact,
        started_at,
        completed_at,
        remote_task_id_hash,
        playback_promotion: None,
    };
    validate_route_binding(
        &payload.model,
        &payload.operation,
        &payload.route_id,
        &payload.accepted_reference_artifact_ids,
        &payload.lock_ids,
    )?;
    if completed_at < started_at
        || !validate_identifier(&payload.request_id)
        || !validate_identifier(&payload.run_id)
        || !validate_identifier(&payload.provider_id)
        || !validate_identifier(&payload.model)
        || payload
            .semantic_role
            .iter()
            .chain(payload.node_id.iter())
            .chain(payload.capability_id.iter())
            .chain(payload.accepted_reference_artifact_ids.iter())
            .chain(payload.lock_ids.iter())
            .any(|value| !validate_identifier(value))
    {
        return Err(ProxyError::Request(
            "invalid multimodal Host context".into(),
        ));
    }
    let receipt_hash = sha256(&payload_bytes(&payload)?);
    let signature = sign_hash(&receipt_hash, &signing_key()?)?;
    Ok(MultimodalHostReceipt {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash,
        request_id: payload.request_id,
        run_id: payload.run_id,
        provider_id: payload.provider_id,
        provider_kind: payload.provider_kind,
        model: payload.model,
        route_id: payload.route_id,
        operation: payload.operation,
        semantic_role: payload.semantic_role,
        node_id: payload.node_id,
        capability_id: payload.capability_id,
        accepted_reference_artifact_ids: payload.accepted_reference_artifact_ids,
        lock_ids: payload.lock_ids,
        status: payload.status,
        artifact: payload.artifact,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        remote_task_id_hash: payload.remote_task_id_hash,
        playback_promotion: payload.playback_promotion,
        signature,
    })
}

fn verify_receipt(
    receipt: &MultimodalHostReceipt,
    artifact_bytes: &[u8],
) -> Result<MultimodalArtifactEvidence, ProxyError> {
    if receipt.protocol != "cutout.multimodal-host-receipt.v1"
        || receipt.status != "succeeded"
        || receipt.completed_at < receipt.started_at
        || receipt.artifact.byte_length != artifact_bytes.len()
        || receipt.artifact.sha256 != sha256(artifact_bytes)
        || receipt.artifact.artifact_id != format!("artifact:sha256:{}", receipt.artifact.sha256)
    {
        return Err(ProxyError::Request(
            "multimodal Host receipt does not match artifact bytes".into(),
        ));
    }
    validate_route_binding(
        &receipt.model,
        &receipt.operation,
        &receipt.route_id,
        &receipt.accepted_reference_artifact_ids,
        &receipt.lock_ids,
    )?;
    validate_playback_promotion(receipt)?;
    let expected_hash = sha256(&payload_bytes(&receipt.payload())?);
    if receipt.receipt_hash != expected_hash {
        return Err(ProxyError::Request(
            "multimodal Host receipt hash is invalid".into(),
        ));
    }
    verify_hash(&receipt.receipt_hash, &receipt.signature, &signing_key()?)?;
    Ok(receipt.artifact.clone())
}

fn validate_playback_promotion(receipt: &MultimodalHostReceipt) -> Result<(), ProxyError> {
    let promoted = receipt.artifact.playback_verified == Some(true);
    match (promoted, receipt.playback_promotion.as_ref()) {
        (false, None) => Ok(()),
        (true, Some(promotion))
            if receipt.artifact.media_type == "video/mp4"
                && receipt.artifact.sample_tables_readable == Some(true)
                && promotion.decoder == PLAYBACK_DECODER
                && promotion.representative_frames == 3
                && promotion.non_blank_frames == promotion.representative_frames
                && decode_hex(&promotion.source_receipt_hash).is_some()
                && decode_hex(&promotion.pixel_evidence_hash).is_some() =>
        {
            Ok(())
        }
        _ => Err(ProxyError::Request(
            "multimodal playback promotion evidence is invalid".into(),
        )),
    }
}

fn validate_playback_candidate(
    receipt: &MultimodalHostReceipt,
    artifact: &MultimodalArtifactEvidence,
) -> Result<(), ProxyError> {
    if artifact.media_type != "video/mp4"
        || artifact.decoded != true
        || artifact.sample_tables_readable != Some(true)
        || artifact.playback_verified != Some(false)
        || artifact.width.is_none()
        || artifact.height.is_none()
        || artifact.duration_ms.is_none()
        || artifact.frame_rate.is_none()
        || artifact.video_codec.is_none()
        || receipt.playback_promotion.is_some()
    {
        return Err(ProxyError::Request(
            "multimodal artifact is not eligible for playback promotion".into(),
        ));
    }
    Ok(())
}

fn frame_is_non_blank(
    bytes: &[u8],
    width: usize,
    height: usize,
    bytes_per_row: usize,
    bytes_per_pixel: usize,
) -> bool {
    let packed = match width.checked_mul(bytes_per_pixel) {
        Some(value) if value > 0 && bytes_per_row >= value => value,
        _ => return false,
    };
    let required = match bytes_per_row.checked_mul(height) {
        Some(value) if value <= bytes.len() => value,
        _ => return false,
    };
    let bytes = &bytes[..required];
    let mut minimum = vec![u8::MAX; bytes_per_pixel];
    let mut maximum = vec![u8::MIN; bytes_per_pixel];
    for row in 0..height {
        let pixels = &bytes[row * bytes_per_row..row * bytes_per_row + packed];
        for pixel in pixels.chunks_exact(bytes_per_pixel) {
            for (channel, value) in pixel.iter().enumerate() {
                minimum[channel] = minimum[channel].min(*value);
                maximum[channel] = maximum[channel].max(*value);
            }
        }
    }
    minimum
        .iter()
        .zip(maximum.iter())
        .filter(|(minimum, maximum)| maximum.saturating_sub(**minimum) > 4)
        .count()
        >= 2
}

fn issue_playback_receipt(
    source: &MultimodalHostReceipt,
    pixel_evidence_hash: String,
    non_blank_frames: u32,
    started_at: u64,
    completed_at: u64,
) -> Result<MultimodalHostReceipt, ProxyError> {
    let mut artifact = source.artifact.clone();
    artifact.playback_verified = Some(true);
    let payload = MultimodalReceiptPayload {
        protocol: source.protocol.clone(),
        receipt_id: format!(
            "receipt:multimodal-playback:{}",
            uuid::Uuid::new_v4().simple()
        ),
        request_id: source.request_id.clone(),
        run_id: source.run_id.clone(),
        provider_id: source.provider_id.clone(),
        provider_kind: source.provider_kind.clone(),
        model: source.model.clone(),
        route_id: source.route_id.clone(),
        operation: source.operation.clone(),
        semantic_role: source.semantic_role.clone(),
        node_id: source.node_id.clone(),
        capability_id: source.capability_id.clone(),
        accepted_reference_artifact_ids: source.accepted_reference_artifact_ids.clone(),
        lock_ids: source.lock_ids.clone(),
        status: source.status.clone(),
        artifact,
        started_at,
        completed_at,
        remote_task_id_hash: source.remote_task_id_hash.clone(),
        playback_promotion: Some(PlaybackPromotionEvidence {
            source_receipt_hash: source.receipt_hash.clone(),
            decoder: PLAYBACK_DECODER.into(),
            representative_frames: 3,
            non_blank_frames,
            pixel_evidence_hash,
        }),
    };
    let receipt_hash = sha256(&payload_bytes(&payload)?);
    let signature = sign_hash(&receipt_hash, &signing_key()?)?;
    Ok(MultimodalHostReceipt {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash,
        request_id: payload.request_id,
        run_id: payload.run_id,
        provider_id: payload.provider_id,
        provider_kind: payload.provider_kind,
        model: payload.model,
        route_id: payload.route_id,
        operation: payload.operation,
        semantic_role: payload.semantic_role,
        node_id: payload.node_id,
        capability_id: payload.capability_id,
        accepted_reference_artifact_ids: payload.accepted_reference_artifact_ids,
        lock_ids: payload.lock_ids,
        status: payload.status,
        artifact: payload.artifact,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        remote_task_id_hash: payload.remote_task_id_hash,
        playback_promotion: payload.playback_promotion,
        signature,
    })
}

#[cfg(target_os = "macos")]
fn decode_representative_frames(
    artifact_bytes: &[u8],
    duration_ms: u64,
) -> Result<(String, u32), ProxyError> {
    use std::fs::OpenOptions;
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    use objc2_av_foundation::{AVAsset, AVAssetImageGenerator};
    use objc2_core_graphics::{CGDataProvider, CGImage};
    use objc2_core_media::CMTime;
    use objc2_foundation::{NSString, NSURL};

    let path = std::env::temp_dir().join(format!(
        "cutout-playback-{}.mp4",
        uuid::Uuid::new_v4().simple()
    ));
    struct RemoveFile(std::path::PathBuf);
    impl Drop for RemoveFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }
    let _remove = RemoveFile(path.clone());
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
        .map_err(|_| ProxyError::Request("could not stage video playback bytes".into()))?;
    file.write_all(artifact_bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| ProxyError::Request("could not stage video playback bytes".into()))?;
    drop(file);

    let path = NSString::from_str(
        path.to_str()
            .ok_or_else(|| ProxyError::Request("video playback path is invalid".into()))?,
    );
    let url = NSURL::fileURLWithPath(&path);
    let asset = unsafe { AVAsset::assetWithURL(&url) };
    let generator = unsafe { AVAssetImageGenerator::assetImageGeneratorWithAsset(&asset) };
    unsafe {
        generator.setAppliesPreferredTrackTransform(true);
    }
    let duration_seconds = duration_ms as f64 / 1_000.0;
    let times = [
        0.05_f64.min(duration_seconds * 0.1),
        duration_seconds * 0.5,
        (duration_seconds - 0.05).max(duration_seconds * 0.9),
    ];
    let mut pixel_hasher = Sha256::new();
    let mut non_blank_frames = 0_u32;
    for seconds in times {
        // The synchronous API is confined to this blocking worker. The command
        // owner applies a hard timeout and never signs a late result.
        #[allow(deprecated)]
        let image = unsafe {
            generator.copyCGImageAtTime_actualTime_error(
                CMTime::with_seconds(seconds.max(0.0), 600),
                std::ptr::null_mut(),
            )
        }
        .map_err(|_| ProxyError::Request("AVFoundation could not decode video frame".into()))?;
        let width = CGImage::width(Some(&image));
        let height = CGImage::height(Some(&image));
        let bits_per_pixel = CGImage::bits_per_pixel(Some(&image));
        let bytes_per_row = CGImage::bytes_per_row(Some(&image));
        let bytes_per_pixel = bits_per_pixel / 8;
        if width == 0 || height == 0 || !(3..=8).contains(&bytes_per_pixel) {
            return Err(ProxyError::Request(
                "AVFoundation returned invalid decoded frame metadata".into(),
            ));
        }
        let provider = CGImage::data_provider(Some(&image)).ok_or_else(|| {
            ProxyError::Request("AVFoundation returned no decoded pixel provider".into())
        })?;
        let data = CGDataProvider::data(Some(&provider)).ok_or_else(|| {
            ProxyError::Request("AVFoundation returned no decoded pixel bytes".into())
        })?;
        let length = usize::try_from(data.length()).map_err(|_| {
            ProxyError::Request("AVFoundation decoded pixel length is invalid".into())
        })?;
        if length == 0 || data.byte_ptr().is_null() {
            return Err(ProxyError::Request(
                "AVFoundation returned empty decoded pixel bytes".into(),
            ));
        }
        let bytes = unsafe { std::slice::from_raw_parts(data.byte_ptr(), length) };
        if frame_is_non_blank(bytes, width, height, bytes_per_row, bytes_per_pixel) {
            non_blank_frames += 1;
        }
        pixel_hasher.update((width as u64).to_le_bytes());
        pixel_hasher.update((height as u64).to_le_bytes());
        pixel_hasher.update(bytes);
    }
    if non_blank_frames != times.len() as u32 {
        return Err(ProxyError::Request(
            "AVFoundation decoded a blank representative frame".into(),
        ));
    }
    Ok((hex_digest(&pixel_hasher.finalize()), non_blank_frames))
}

#[cfg(not(target_os = "macos"))]
fn decode_representative_frames(
    _artifact_bytes: &[u8],
    _duration_ms: u64,
) -> Result<(String, u32), ProxyError> {
    Err(ProxyError::Request(
        "capability-required: trusted video playback verification requires macOS AVFoundation"
            .into(),
    ))
}

#[tauri::command]
pub async fn verify_multimodal_host_artifact(
    receipt: MultimodalHostReceipt,
    artifact_bytes: Vec<u8>,
) -> Result<MultimodalArtifactEvidence, ProxyError> {
    verify_receipt(&receipt, &artifact_bytes)
}

#[tauri::command]
pub async fn promote_multimodal_video_playback(
    receipt: MultimodalHostReceipt,
    artifact_bytes: Vec<u8>,
) -> Result<MultimodalHostReceipt, ProxyError> {
    if artifact_bytes.is_empty() || artifact_bytes.len() > MAX_PLAYBACK_BYTES {
        return Err(ProxyError::Request(
            "video playback artifact exceeds the bounded input contract".into(),
        ));
    }
    let artifact = verify_receipt(&receipt, &artifact_bytes)?;
    validate_playback_candidate(&receipt, &artifact)?;
    let duration_ms = artifact
        .duration_ms
        .ok_or_else(|| ProxyError::Request("video playback duration evidence is missing".into()))?;
    let started_at = unix_millis()?;
    let decoded = tauri::async_runtime::spawn_blocking(move || {
        decode_representative_frames(&artifact_bytes, duration_ms)
    });
    let (pixel_evidence_hash, non_blank_frames) =
        tokio::time::timeout(Duration::from_secs(PLAYBACK_TIMEOUT_SECS), decoded)
            .await
            .map_err(|_| {
                ProxyError::Request("AVFoundation playback verification timed out".into())
            })?
            .map_err(|_| ProxyError::Request("AVFoundation playback worker failed".into()))??;
    issue_playback_receipt(
        &receipt,
        pixel_evidence_hash,
        non_blank_frames,
        started_at,
        unix_millis()?,
    )
}

fn unix_millis() -> Result<u64, ProxyError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| ProxyError::Request("system clock is unavailable".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_decoder_rejects_malformed_signatures() {
        assert!(decode_hex(&"a".repeat(64)).is_some());
        assert!(decode_hex("abc").is_none());
        assert!(decode_hex(&"z".repeat(64)).is_none());
    }

    #[test]
    fn artifact_identity_is_derived_from_bytes() {
        let evidence = artifact_evidence(b"hello", "application/json", None, None);
        assert_eq!(evidence.byte_length, 5);
        assert_eq!(
            evidence.artifact_id,
            format!("artifact:sha256:{}", evidence.sha256)
        );
        assert!(evidence.decoded);
    }

    #[test]
    fn image_to_video_receipt_requires_exact_model_reference_and_locks() {
        let reference = vec![format!("artifact:sha256:{}", "a".repeat(64))];
        let locks = vec!["lock:commerce-product-identity".into()];
        assert!(validate_route_binding(
            "wan2.7-i2v-2026-04-25",
            "image-to-video",
            "route:dashscope:wan2.7-i2v-2026-04-25:image-to-video",
            &reference,
            &locks,
        )
        .is_ok());
        assert!(validate_route_binding(
            "wan2.7-i2v-2026-04-25",
            "text-to-video",
            "route:dashscope:wan2.7-i2v-2026-04-25:text-to-video",
            &[],
            &[],
        )
        .is_err());
        assert!(validate_route_binding(
            "wan2.7-i2v-2026-04-25",
            "image-to-video",
            "route:dashscope:wan2.7-i2v-2026-04-25:image-to-video",
            &[],
            &locks,
        )
        .is_err());
        assert!(validate_route_binding(
            "wan2.7-i2v-2026-04-25",
            "image-to-video",
            "route:dashscope:wrong:image-to-video",
            &reference,
            &locks,
        )
        .is_err());
    }

    #[test]
    fn playback_promotion_requires_video_container_and_native_proof() {
        let mut receipt = unsigned_test_receipt();
        assert!(validate_playback_candidate(&receipt, &receipt.artifact).is_ok());
        receipt.artifact.media_type = "image/png".into();
        assert!(validate_playback_candidate(&receipt, &receipt.artifact).is_err());
        receipt.artifact.media_type = "video/mp4".into();
        receipt.artifact.playback_verified = Some(true);
        assert!(validate_playback_candidate(&receipt, &receipt.artifact).is_err());
        assert!(validate_playback_promotion(&receipt).is_err());
    }

    #[test]
    fn blank_pixel_buffers_fail_closed() {
        assert!(!frame_is_non_blank(&[0; 16], 2, 2, 8, 4));
        assert!(!frame_is_non_blank(
            &[0, 0, 0, 255, 0, 0, 0, 255],
            2,
            1,
            8,
            4
        ));
        assert!(!frame_is_non_blank(
            &[0, 0, 0, 255, 20, 0, 0, 255],
            2,
            1,
            8,
            4
        ));
        assert!(frame_is_non_blank(
            &[0, 0, 0, 255, 20, 20, 20, 255],
            2,
            1,
            8,
            4
        ));
        assert!(!frame_is_non_blank(&[0; 8], 2, 2, 8, 4));
    }

    fn unsigned_test_receipt() -> MultimodalHostReceipt {
        let artifact = MultimodalArtifactEvidence {
            artifact_id: format!("artifact:sha256:{}", "a".repeat(64)),
            sha256: "a".repeat(64),
            media_type: "video/mp4".into(),
            byte_length: 3,
            decoded: true,
            width: Some(1280),
            height: Some(720),
            duration_ms: Some(5_000),
            frame_rate: Some(30.0),
            video_codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            sample_tables_readable: Some(true),
            playback_verified: Some(false),
        };
        MultimodalHostReceipt {
            protocol: "cutout.multimodal-host-receipt.v1".into(),
            receipt_id: "receipt:test".into(),
            receipt_hash: "b".repeat(64),
            request_id: "request:test".into(),
            run_id: "run:test".into(),
            provider_id: "provider:test".into(),
            provider_kind: "dashscope".into(),
            model: "wan2.6-t2v".into(),
            route_id: "route:dashscope:wan2.6-t2v:text-to-video".into(),
            operation: "text-to-video".into(),
            semantic_role: Some("product-video".into()),
            node_id: None,
            capability_id: None,
            accepted_reference_artifact_ids: vec![],
            lock_ids: vec![],
            status: "succeeded".into(),
            artifact,
            started_at: 1,
            completed_at: 2,
            remote_task_id_hash: Some("c".repeat(64)),
            playback_promotion: None,
            signature: "d".repeat(64),
        }
    }
}
