//! Foreground color reconstruction for an already-estimated alpha matte.
//!
//! This is a Rust adaptation of PyMatting's MIT-licensed multi-level
//! foreground estimator. Source provenance and license are retained under
//! `vendor/pymatting`.

const REGULARIZATION: f32 = 1e-5;
const GRADIENT_WEIGHT: f32 = 1.0;
const SMALL_SIZE: usize = 32;
const SMALL_ITERATIONS: usize = 10;
const BIG_ITERATIONS: usize = 2;
const TRANSPARENT_ALPHA_THRESHOLD: u8 = 8;
pub(crate) const CHROMA_BACKGROUND_DISTANCE_SQUARED: f64 = 64.0;
pub(crate) const ADAPTIVE_CHROMA_BACKGROUND_MAX_DISTANCE_SQUARED: f64 = 4_096.0;
pub(crate) const CHROMA_EDGE_BAND_RADIUS: usize = 6;
const ADAPTIVE_CHROMA_NEUTRAL_DISTANCE_FRACTION: f64 = 0.25;
const ADAPTIVE_CHROMA_THRESHOLD_HEADROOM: f64 = 1.25;
const ADAPTIVE_CHROMA_THRESHOLD_OFFSET: f64 = 16.0;

fn resize_nearest_rgb(
    source: &[[f32; 3]],
    source_width: usize,
    source_height: usize,
    width: usize,
    height: usize,
) -> Vec<[f32; 3]> {
    let mut output = vec![[0.0; 3]; width * height];
    for y in 0..height {
        let source_y = (y * source_height / height).min(source_height - 1);
        for x in 0..width {
            let source_x = (x * source_width / width).min(source_width - 1);
            output[y * width + x] = source[source_y * source_width + source_x];
        }
    }
    output
}

fn resize_nearest_scalar(
    source: &[f32],
    source_width: usize,
    source_height: usize,
    width: usize,
    height: usize,
) -> Vec<f32> {
    let mut output = vec![0.0; width * height];
    for y in 0..height {
        let source_y = (y * source_height / height).min(source_height - 1);
        for x in 0..width {
            let source_x = (x * source_width / width).min(source_width - 1);
            output[y * width + x] = source[source_y * source_width + source_x];
        }
    }
    output
}

fn pyramid_levels(width: usize, height: usize) -> usize {
    let maximum = width.max(height);
    let mut side = 1_usize;
    let mut levels = 0_usize;
    while side < maximum {
        side = side.saturating_mul(2);
        levels += 1;
    }
    levels
}

fn level_size(original: usize, level: usize, levels: usize) -> usize {
    if levels == 0 {
        return original;
    }
    (original as f64)
        .powf(level as f64 / levels as f64)
        .round()
        .max(1.0) as usize
}

pub(crate) fn estimate_foreground_ml(
    image: &[[f32; 3]],
    alpha: &[f32],
    width: usize,
    height: usize,
) -> Result<Vec<[f32; 3]>, &'static str> {
    let pixel_count = width
        .checked_mul(height)
        .ok_or("foreground estimator dimensions overflowed")?;
    if width == 0 || height == 0 || image.len() != pixel_count || alpha.len() != pixel_count {
        return Err("foreground estimator input dimensions are invalid");
    }
    if alpha
        .iter()
        .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        || image
            .iter()
            .flatten()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
    {
        return Err("foreground estimator input values are invalid");
    }

    let mut foreground_mean = [0.0_f32; 3];
    let mut background_mean = [0.0_f32; 3];
    let mut foreground_count = 0_u32;
    let mut background_count = 0_u32;
    for (pixel, alpha) in image.iter().zip(alpha) {
        if *alpha > 0.9 {
            for channel in 0..3 {
                foreground_mean[channel] += pixel[channel];
            }
            foreground_count += 1;
        }
        if *alpha < 0.1 {
            for channel in 0..3 {
                background_mean[channel] += pixel[channel];
            }
            background_count += 1;
        }
    }
    if foreground_count == 0 || background_count == 0 {
        return Err("foreground estimator requires known foreground and background pixels");
    }
    for channel in 0..3 {
        foreground_mean[channel] /= foreground_count as f32 + 1e-5;
        background_mean[channel] /= background_count as f32 + 1e-5;
    }

    let levels = pyramid_levels(width, height);
    let mut previous_width = 1_usize;
    let mut previous_height = 1_usize;
    let mut previous_foreground = vec![foreground_mean];
    let mut previous_background = vec![background_mean];

    for level in 0..=levels {
        let level_width = level_size(width, level, levels);
        let level_height = level_size(height, level, levels);
        let level_image = resize_nearest_rgb(image, width, height, level_width, level_height);
        let level_alpha = resize_nearest_scalar(alpha, width, height, level_width, level_height);
        let mut foreground = resize_nearest_rgb(
            &previous_foreground,
            previous_width,
            previous_height,
            level_width,
            level_height,
        );
        let mut background = resize_nearest_rgb(
            &previous_background,
            previous_width,
            previous_height,
            level_width,
            level_height,
        );
        let iterations = if level_width <= SMALL_SIZE && level_height <= SMALL_SIZE {
            SMALL_ITERATIONS
        } else {
            BIG_ITERATIONS
        };

        for _ in 0..iterations {
            for y in 0..level_height {
                for x in 0..level_width {
                    let index = y * level_width + x;
                    let foreground_alpha = level_alpha[index];
                    let background_alpha = 1.0 - foreground_alpha;
                    let mut a00 = foreground_alpha * foreground_alpha;
                    let a01 = foreground_alpha * background_alpha;
                    let mut a11 = background_alpha * background_alpha;
                    let mut b0 = [0.0_f32; 3];
                    let mut b1 = [0.0_f32; 3];
                    for channel in 0..3 {
                        b0[channel] = foreground_alpha * level_image[index][channel];
                        b1[channel] = background_alpha * level_image[index][channel];
                    }

                    let neighbours = [
                        (x.saturating_sub(1), y),
                        ((x + 1).min(level_width - 1), y),
                        (x, y.saturating_sub(1)),
                        (x, (y + 1).min(level_height - 1)),
                    ];
                    for (neighbour_x, neighbour_y) in neighbours {
                        let neighbour = neighbour_y * level_width + neighbour_x;
                        let gradient = (foreground_alpha - level_alpha[neighbour]).abs();
                        let weight = REGULARIZATION + GRADIENT_WEIGHT * gradient;
                        a00 += weight;
                        a11 += weight;
                        for channel in 0..3 {
                            b0[channel] += weight * foreground[neighbour][channel];
                            b1[channel] += weight * background[neighbour][channel];
                        }
                    }

                    let inverse_determinant = 1.0 / (a00 * a11 - a01 * a01);
                    let inverse_00 = inverse_determinant * a11;
                    let inverse_01 = inverse_determinant * -a01;
                    let inverse_11 = inverse_determinant * a00;
                    for channel in 0..3 {
                        foreground[index][channel] =
                            (inverse_00 * b0[channel] + inverse_01 * b1[channel]).clamp(0.0, 1.0);
                        background[index][channel] =
                            (inverse_01 * b0[channel] + inverse_11 * b1[channel]).clamp(0.0, 1.0);
                    }
                }
            }
        }

        previous_width = level_width;
        previous_height = level_height;
        previous_foreground = foreground;
        previous_background = background;
    }

    Ok(previous_foreground)
}

fn bt601_chroma(color: [u8; 3]) -> (i32, i32) {
    let red = i32::from(color[0]);
    let green = i32::from(color[1]);
    let blue = i32::from(color[2]);
    let cb = ((-38 * red - 74 * green + 112 * blue + 128) >> 8) + 128;
    let cr = ((112 * red - 94 * green - 18 * blue + 128) >> 8) + 128;
    (cb, cr)
}

fn chroma_distance_squared(rgba: &[u8], index: usize, background: [u8; 3]) -> f64 {
    let offset = index * 4;
    f64::from(bt601_chroma_distance_squared(
        [rgba[offset], rgba[offset + 1], rgba[offset + 2]],
        background,
    ))
}

pub(crate) fn bt601_chroma_distance_squared(pixel: [u8; 3], background: [u8; 3]) -> u32 {
    let (pixel_cb, pixel_cr) = bt601_chroma(pixel);
    let (background_cb, background_cr) = bt601_chroma(background);
    let delta_cb = pixel_cb - background_cb;
    let delta_cr = pixel_cr - background_cr;
    (delta_cb * delta_cb + delta_cr * delta_cr) as u32
}

fn background_edge_band(background: &[bool], width: usize, height: usize) -> Vec<bool> {
    let mut expanded = background.to_vec();
    let mut band = vec![false; background.len()];
    for _ in 0..CHROMA_EDGE_BAND_RADIUS {
        let previous = expanded.clone();
        for y in 0..height {
            for x in 0..width {
                let index = y * width + x;
                if previous[index] {
                    continue;
                }
                let touches_background = (x > 0 && previous[index - 1])
                    || (x + 1 < width && previous[index + 1])
                    || (y > 0 && previous[index - width])
                    || (y + 1 < height && previous[index + width]);
                if touches_background {
                    expanded[index] = true;
                    band[index] = true;
                }
            }
        }
    }
    band
}

fn border_indices(width: usize, height: usize) -> Vec<usize> {
    let mut indices = Vec::with_capacity(width.saturating_mul(2) + height.saturating_mul(2));
    let last_row = (height - 1) * width;
    for x in 0..width {
        indices.push(x);
        if height > 1 {
            indices.push(last_row + x);
        }
    }
    for y in 1..height.saturating_sub(1) {
        indices.push(y * width);
        if width > 1 {
            indices.push(y * width + width - 1);
        }
    }
    indices
}

fn neutral_chroma_distance_squared(background_color: [u8; 3]) -> f64 {
    let (background_cb, background_cr) = bt601_chroma(background_color);
    f64::from(
        (background_cb - 128) * (background_cb - 128)
            + (background_cr - 128) * (background_cr - 128),
    )
}

fn adaptive_border_distance_squared(
    rgba: &[u8],
    width: usize,
    height: usize,
    background_color: [u8; 3],
) -> Result<f64, &'static str> {
    let neutral_distance_squared = neutral_chroma_distance_squared(background_color);
    let maximum_safe_distance = (neutral_distance_squared
        * ADAPTIVE_CHROMA_NEUTRAL_DISTANCE_FRACTION)
        .min(ADAPTIVE_CHROMA_BACKGROUND_MAX_DISTANCE_SQUARED);
    let maximum_border_distance = border_indices(width, height)
        .into_iter()
        .filter(|index| rgba[index * 4 + 3] >= TRANSPARENT_ALPHA_THRESHOLD)
        .map(|index| chroma_distance_squared(rgba, index, background_color))
        .fold(0.0_f64, f64::max);
    let threshold = (maximum_border_distance * ADAPTIVE_CHROMA_THRESHOLD_HEADROOM
        + ADAPTIVE_CHROMA_THRESHOLD_OFFSET)
        .max(CHROMA_BACKGROUND_DISTANCE_SQUARED);
    if threshold >= maximum_safe_distance {
        return Err("generation board border contains non-background pixels");
    }
    Ok(threshold)
}

fn reconstruct_chroma_foreground_with_threshold(
    rgba: &[u8],
    width: usize,
    height: usize,
    background_color: [u8; 3],
    background_distance_squared: f64,
) -> Result<Vec<u8>, &'static str> {
    let size = width
        .checked_mul(height)
        .ok_or("chroma trimap dimensions overflowed")?;
    if width == 0 || height == 0 || rgba.len() != size.saturating_mul(4) {
        return Err("chroma trimap dimensions are invalid");
    }
    let background = (0..size)
        .map(|index| {
            rgba[index * 4 + 3] < TRANSPARENT_ALPHA_THRESHOLD
                || chroma_distance_squared(rgba, index, background_color)
                    <= background_distance_squared
        })
        .collect::<Vec<_>>();
    if background.iter().all(|value| *value) || background.iter().all(|value| !*value) {
        return Err("chroma trimap requires both foreground and background pixels");
    }
    let edge_band = background_edge_band(&background, width, height);
    let neutral_distance_squared = neutral_chroma_distance_squared(background_color);
    if neutral_distance_squared <= background_distance_squared {
        return Err("generation board does not have enough chroma separation");
    }

    let mut image_rgb = Vec::with_capacity(size);
    let mut alpha = Vec::with_capacity(size);
    for index in 0..size {
        let offset = index * 4;
        image_rgb.push([
            f32::from(rgba[offset]) / 255.0,
            f32::from(rgba[offset + 1]) / 255.0,
            f32::from(rgba[offset + 2]) / 255.0,
        ]);
        let source_alpha = f64::from(rgba[offset + 3]) / 255.0;
        let matte_alpha = if background[index] {
            0.0
        } else if edge_band[index] {
            let distance = chroma_distance_squared(rgba, index, background_color);
            let normalized = ((distance - background_distance_squared)
                / (neutral_distance_squared - background_distance_squared))
                .clamp(0.0, 1.0)
                .sqrt();
            let smooth = normalized * normalized * (3.0 - 2.0 * normalized);
            source_alpha.min(smooth)
        } else {
            source_alpha
        };
        alpha.push(matte_alpha as f32);
    }

    let foreground = estimate_foreground_ml(&image_rgb, &alpha, width, height)?;
    let mut output = vec![0_u8; rgba.len()];
    for index in 0..size {
        let offset = index * 4;
        let output_alpha = (alpha[index] * 255.0).round().clamp(0.0, 255.0) as u8;
        if output_alpha < TRANSPARENT_ALPHA_THRESHOLD {
            continue;
        }
        for channel in 0..3 {
            output[offset + channel] = (foreground[index][channel] * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
        }
        output[offset + 3] = output_alpha;
    }
    Ok(output)
}

pub(crate) fn reconstruct_chroma_foreground(
    rgba: &[u8],
    width: usize,
    height: usize,
    background_color: [u8; 3],
) -> Result<Vec<u8>, &'static str> {
    reconstruct_chroma_foreground_with_threshold(
        rgba,
        width,
        height,
        background_color,
        CHROMA_BACKGROUND_DISTANCE_SQUARED,
    )
}

pub(crate) fn reconstruct_adaptive_chroma_foreground(
    rgba: &[u8],
    width: usize,
    height: usize,
    background_color: [u8; 3],
) -> Result<(Vec<u8>, f64), &'static str> {
    let threshold = adaptive_border_distance_squared(rgba, width, height, background_color)?;
    let output = reconstruct_chroma_foreground_with_threshold(
        rgba,
        width,
        height,
        background_color,
        threshold,
    )?;
    Ok((output, threshold))
}

pub(crate) fn reconstruct_spatial_chroma_foreground(
    rgba: &[u8],
    width: usize,
    height: usize,
    background_field: &[[u8; 3]],
    background_distance_squared: f64,
) -> Result<Vec<u8>, &'static str> {
    let size = width
        .checked_mul(height)
        .ok_or("spatial chroma trimap dimensions overflowed")?;
    if width == 0
        || height == 0
        || rgba.len() != size.saturating_mul(4)
        || background_field.len() != size
        || !background_distance_squared.is_finite()
        || !(64.0..=4096.0).contains(&background_distance_squared)
    {
        return Err("spatial chroma trimap dimensions or threshold are invalid");
    }

    let eligible = (0..size)
        .map(|index| {
            rgba[index * 4 + 3] < TRANSPARENT_ALPHA_THRESHOLD
                || chroma_distance_squared(rgba, index, background_field[index])
                    <= background_distance_squared
        })
        .collect::<Vec<_>>();
    let mut background = vec![false; size];
    let mut queue = Vec::with_capacity(size);
    for index in border_indices(width, height) {
        if eligible[index] && !background[index] {
            background[index] = true;
            queue.push(index);
        }
    }
    let mut head = 0;
    while head < queue.len() {
        let index = queue[head];
        head += 1;
        let x = index % width;
        let y = index / width;
        for neighbor in [
            x.checked_sub(1).map(|_| index - 1),
            (x + 1 < width).then_some(index + 1),
            y.checked_sub(1).map(|_| index - width),
            (y + 1 < height).then_some(index + width),
        ]
        .into_iter()
        .flatten()
        {
            if eligible[neighbor] && !background[neighbor] {
                background[neighbor] = true;
                queue.push(neighbor);
            }
        }
    }
    if background.iter().all(|value| *value) || background.iter().all(|value| !*value) {
        return Err("spatial chroma trimap requires both foreground and background pixels");
    }
    if border_indices(width, height)
        .iter()
        .any(|index| !background[*index])
    {
        return Err("spatial generation board border contains non-background pixels");
    }

    let edge_band = background_edge_band(&background, width, height);
    let mut image_rgb = Vec::with_capacity(size);
    let mut alpha = Vec::with_capacity(size);
    for index in 0..size {
        let offset = index * 4;
        image_rgb.push([
            f32::from(rgba[offset]) / 255.0,
            f32::from(rgba[offset + 1]) / 255.0,
            f32::from(rgba[offset + 2]) / 255.0,
        ]);
        let source_alpha = f64::from(rgba[offset + 3]) / 255.0;
        let neutral_distance_squared = neutral_chroma_distance_squared(background_field[index]);
        if neutral_distance_squared <= background_distance_squared {
            return Err("spatial generation board does not have enough chroma separation");
        }
        let matte_alpha = if background[index] {
            0.0
        } else if edge_band[index] {
            let distance = chroma_distance_squared(rgba, index, background_field[index]);
            let normalized = ((distance - background_distance_squared)
                / (neutral_distance_squared - background_distance_squared))
                .clamp(0.0, 1.0)
                .sqrt();
            let smooth = normalized * normalized * (3.0 - 2.0 * normalized);
            source_alpha.min(smooth)
        } else {
            source_alpha
        };
        alpha.push(matte_alpha as f32);
    }

    let foreground = estimate_foreground_ml(&image_rgb, &alpha, width, height)?;
    let mut output = vec![0_u8; rgba.len()];
    for index in 0..size {
        let offset = index * 4;
        let output_alpha = (alpha[index] * 255.0).round().clamp(0.0, 255.0) as u8;
        if output_alpha < TRANSPARENT_ALPHA_THRESHOLD {
            continue;
        }
        for channel in 0..3 {
            output[offset + channel] = (foreground[index][channel] * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
        }
        output[offset + 3] = output_alpha;
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconstructs_a_composited_edge_toward_the_known_foreground() {
        let width = 5;
        let height = 5;
        let foreground = [0.1_f32, 0.2, 0.3];
        let background = [1.0_f32, 0.0, 1.0];
        let mut image = vec![background; width * height];
        let mut alpha = vec![0.0_f32; width * height];
        for y in 1..4 {
            for x in 1..4 {
                let index = y * width + x;
                alpha[index] = if x == 1 { 0.5 } else { 1.0 };
                for channel in 0..3 {
                    image[index][channel] = alpha[index] * foreground[channel]
                        + (1.0 - alpha[index]) * background[channel];
                }
            }
        }

        let estimated = estimate_foreground_ml(&image, &alpha, width, height).unwrap();
        let edge = estimated[2 * width + 1];
        let composite = image[2 * width + 1];
        let estimated_error = edge
            .iter()
            .zip(foreground)
            .map(|(actual, expected)| (actual - expected).abs())
            .sum::<f32>();
        let composite_error = composite
            .iter()
            .zip(foreground)
            .map(|(actual, expected)| (actual - expected).abs())
            .sum::<f32>();
        assert!(estimated_error < composite_error);
    }

    #[test]
    fn rejects_malformed_or_unanchored_mattes() {
        assert!(estimate_foreground_ml(&[], &[], 0, 0).is_err());
        assert!(estimate_foreground_ml(&[[0.0; 3]], &[1.0], 1, 1).is_err());
    }

    #[test]
    fn chroma_trimap_removes_key_spill_before_returning_straight_rgba() {
        let width = 9;
        let height = 9;
        let board = [255_u8, 0, 255];
        let foreground = [20_u8, 40, 80];
        let blended = [138_u8, 20, 168];
        let mut rgba = vec![0_u8; width * height * 4];
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[board[0], board[1], board[2], 255]);
        }
        for y in 2..7 {
            for x in 2..7 {
                let pixel = if x == 2 || x == 6 || y == 2 || y == 6 {
                    blended
                } else {
                    foreground
                };
                let offset = (y * width + x) * 4;
                rgba[offset..offset + 4].copy_from_slice(&[pixel[0], pixel[1], pixel[2], 255]);
            }
        }

        let output = reconstruct_chroma_foreground(&rgba, width, height, board).unwrap();
        assert_eq!(&output[..4], &[0, 0, 0, 0]);
        let edge = &output[(4 * width + 2) * 4..(4 * width + 2) * 4 + 4];
        let reconstructed_error = (0..3)
            .map(|channel| (i16::from(edge[channel]) - i16::from(foreground[channel])).abs())
            .sum::<i16>();
        let contaminated_error = (0..3)
            .map(|channel| (i16::from(blended[channel]) - i16::from(foreground[channel])).abs())
            .sum::<i16>();
        assert!(edge[3] > TRANSPARENT_ALPHA_THRESHOLD && edge[3] < 255);
        assert!(reconstructed_error < contaminated_error);
    }

    #[test]
    fn adaptive_border_model_removes_realistic_board_variation_without_erasing_subject() {
        let width = 17;
        let height = 17;
        let background = [237_u8, 1, 189];
        let foreground = [30_u8, 50, 80];
        let mut rgba = vec![0_u8; width * height * 4];
        for y in 0..height {
            for x in 0..width {
                let offset = (y * width + x) * 4;
                let drift = ((x + y) % 7) as u8;
                rgba[offset..offset + 4].copy_from_slice(&[
                    background[0].saturating_add(drift * 4),
                    background[1],
                    background[2].saturating_sub(drift * 4),
                    255,
                ]);
            }
        }
        for y in 5..12 {
            for x in 6..11 {
                let offset = (y * width + x) * 4;
                rgba[offset..offset + 4].copy_from_slice(&[
                    foreground[0],
                    foreground[1],
                    foreground[2],
                    255,
                ]);
            }
        }

        let fixed = reconstruct_chroma_foreground(&rgba, width, height, background).unwrap();
        assert!(border_indices(width, height)
            .iter()
            .any(|index| fixed[index * 4 + 3] >= TRANSPARENT_ALPHA_THRESHOLD));
        let (adaptive, threshold) =
            reconstruct_adaptive_chroma_foreground(&rgba, width, height, background).unwrap();
        assert!(threshold > CHROMA_BACKGROUND_DISTANCE_SQUARED);
        assert!(border_indices(width, height)
            .iter()
            .all(|index| adaptive[index * 4 + 3] < TRANSPARENT_ALPHA_THRESHOLD));
        assert_eq!(adaptive[(8 * width + 8) * 4 + 3], 255);
    }

    #[test]
    fn adaptive_border_model_rejects_non_background_edge_pixels() {
        let width = 9;
        let height = 9;
        let background = [255_u8, 0, 255];
        let mut rgba = vec![0_u8; width * height * 4];
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[background[0], background[1], background[2], 255]);
        }
        rgba[..4].copy_from_slice(&[0, 0, 0, 255]);

        assert!(reconstruct_adaptive_chroma_foreground(&rgba, width, height, background).is_err());
    }
}
