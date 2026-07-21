//! PNG → SVG vectorization commands.
//!
//! `vectorize_local_vtracer` is fully offline. `vectorize_vectorizer_ai` uses
//! the Vectorizer.AI direct API; the API Secret is stored via the local file
//! secret store (`commands::secret_store`) and injected inside Rust, never
//! returned to JS.

use std::time::Duration;

use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};

use crate::commands::secret_store;

const VECTORIZER_ENDPOINT: &str = "https://api.vectorizer.ai/api/v1/vectorize";
const HTTP_TIMEOUT_SECS: u64 = 240;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorizeSvgResult {
    pub svg: String,
}

#[derive(Debug, thiserror::Error)]
pub enum VectorizeError {
    #[error("image bytes must not be empty")]
    EmptyImage,
    #[error("API Id must not be empty")]
    EmptyApiId,
    #[error("API Secret must not be empty")]
    EmptySecret,
    #[error("no Vectorizer.AI API Secret configured for this API Id")]
    MissingSecret,
    #[error("invalid API mode: {0}")]
    InvalidMode(String),
    #[error("invalid image: {0}")]
    InvalidImage(String),
    #[error("local vectorization failed: {0}")]
    Local(String),
    #[error("secret store error: {0}")]
    Store(String),
    #[error("HTTP client error: {0}")]
    Http(String),
    #[error("Vectorizer.AI API error: {0}")]
    Api(String),
    #[error("Vectorizer.AI returned non-SVG output")]
    NonSvg,
}

impl Serialize for VectorizeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for VectorizeError {
    fn from(e: std::io::Error) -> Self {
        VectorizeError::Store(e.to_string())
    }
}

#[derive(Debug, Deserialize)]
struct ApiErrorEnvelope {
    error: Option<ApiErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    message: Option<String>,
}

fn vectorizer_account(api_id: &str) -> String {
    format!("vectorizer:{api_id}")
}

fn normalize_api_id(api_id: &str) -> Result<String, VectorizeError> {
    let trimmed = api_id.trim();
    if trimmed.is_empty() {
        return Err(VectorizeError::EmptyApiId);
    }
    Ok(trimmed.to_string())
}

fn read_vectorizer_secret(api_id: &str) -> Result<String, VectorizeError> {
    secret_store::get(&vectorizer_account(api_id))?.ok_or(VectorizeError::MissingSecret)
}

fn key_status_inner(api_id: &str) -> Result<bool, VectorizeError> {
    let api_id = normalize_api_id(api_id)?;
    Ok(secret_store::exists(&vectorizer_account(&api_id))?)
}

fn validate_mode(mode: Option<String>) -> Result<String, VectorizeError> {
    let mode = mode.unwrap_or_else(|| "production".to_string());
    match mode.as_str() {
        "production" | "preview" | "test" | "test_preview" => Ok(mode),
        other => Err(VectorizeError::InvalidMode(other.to_string())),
    }
}

fn api_error_message(status: reqwest::StatusCode, body: &[u8]) -> String {
    let raw = String::from_utf8_lossy(body);
    if let Ok(parsed) = serde_json::from_str::<ApiErrorEnvelope>(&raw) {
        if let Some(message) = parsed.error.and_then(|e| e.message) {
            if !message.trim().is_empty() {
                return format!("{status}: {message}");
            }
        }
    }

    let compact = raw.trim();
    if compact.is_empty() {
        return status.to_string();
    }
    let preview: String = compact.chars().take(500).collect();
    format!("{status}: {preview}")
}

fn bytes_to_color_image(bytes: &[u8]) -> Result<vtracer::ColorImage, VectorizeError> {
    if bytes.is_empty() {
        return Err(VectorizeError::EmptyImage);
    }
    let rgba = image::load_from_memory(bytes)
        .map_err(|e| VectorizeError::InvalidImage(e.to_string()))?
        .to_rgba8();
    Ok(vtracer::ColorImage {
        pixels: rgba.as_raw().to_vec(),
        width: rgba.width() as usize,
        height: rgba.height() as usize,
    })
}

#[tauri::command]
pub async fn set_vectorizer_api_key(
    api_id: String,
    api_secret: String,
) -> Result<(), VectorizeError> {
    let api_id = normalize_api_id(&api_id)?;
    if api_secret.is_empty() {
        return Err(VectorizeError::EmptySecret);
    }
    secret_store::set(&vectorizer_account(&api_id), &api_secret)?;
    Ok(())
}

#[tauri::command]
pub async fn vectorizer_key_status(api_id: String) -> Result<bool, VectorizeError> {
    key_status_inner(&api_id)
}

#[tauri::command]
pub async fn delete_vectorizer_api_key(api_id: String) -> Result<(), VectorizeError> {
    let api_id = normalize_api_id(&api_id)?;
    secret_store::delete(&vectorizer_account(&api_id))?;
    Ok(())
}

#[tauri::command]
pub async fn vectorize_local_vtracer(bytes: Vec<u8>) -> Result<VectorizeSvgResult, VectorizeError> {
    let img = bytes_to_color_image(&bytes)?;
    let svg = vtracer::convert(img, vtracer::Config::default())
        .map_err(VectorizeError::Local)?
        .to_string();
    Ok(VectorizeSvgResult { svg })
}

#[tauri::command]
pub async fn vectorize_vectorizer_ai(
    api_id: String,
    bytes: Vec<u8>,
    mode: Option<String>,
) -> Result<VectorizeSvgResult, VectorizeError> {
    if bytes.is_empty() {
        return Err(VectorizeError::EmptyImage);
    }

    let api_id = normalize_api_id(&api_id)?;
    let api_secret = read_vectorizer_secret(&api_id)?;
    let mode = validate_mode(mode)?;

    let image = Part::bytes(bytes)
        .file_name("slice.png")
        .mime_str("image/png")
        .map_err(|e| VectorizeError::Http(e.to_string()))?;
    let form = Form::new()
        .part("image", image)
        .text("mode", mode)
        .text("output.file_format", "svg")
        .text("output.svg.fixed_size", "true");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| VectorizeError::Http(e.to_string()))?;
    let response = client
        .post(VECTORIZER_ENDPOINT)
        .basic_auth(api_id, Some(api_secret))
        .multipart(form)
        .send()
        .await
        .map_err(|e| VectorizeError::Http(e.to_string()))?;

    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|e| VectorizeError::Http(e.to_string()))?;
    if !status.is_success() {
        return Err(VectorizeError::Api(api_error_message(status, &body)));
    }

    let svg = String::from_utf8(body.to_vec()).map_err(|e| VectorizeError::Api(e.to_string()))?;
    if !svg.contains("<svg") {
        return Err(VectorizeError::NonSvg);
    }
    Ok(VectorizeSvgResult { svg })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn validate_mode_allows_vectorizer_modes() {
        for mode in ["production", "preview", "test", "test_preview"] {
            assert_eq!(validate_mode(Some(mode.to_string())).unwrap(), mode);
        }
    }

    #[test]
    fn validate_mode_rejects_unknown_values() {
        let err = validate_mode(Some("fast".to_string())).unwrap_err();
        assert!(matches!(err, VectorizeError::InvalidMode(_)));
    }

    #[test]
    fn api_error_uses_structured_message_when_present() {
        let status = reqwest::StatusCode::BAD_REQUEST;
        let body = br#"{"error":{"message":"bad image"}}"#;
        assert_eq!(
            api_error_message(status, body),
            "400 Bad Request: bad image"
        );
    }

    #[test]
    fn local_vtracer_converts_png_bytes_to_svg() {
        let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
        let mut png = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut png), image::ImageOutputFormat::Png)
            .unwrap();

        let color_image = bytes_to_color_image(&png).unwrap();
        let svg = vtracer::convert(color_image, vtracer::Config::default())
            .unwrap()
            .to_string();

        assert!(svg.contains("<svg"));
    }
}
