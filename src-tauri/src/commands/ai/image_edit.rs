//! 垫图 (reference-conditioned image edit) via OpenAI `POST {baseUrl}/images/edits`.
//!
//! The edits endpoint is **multipart/form-data** (not the JSON string body the
//! [`super::ai_proxy`] transport carries), so it gets its own command instead of
//! overloading the string-body proxy. The flow mirrors `ai_proxy_request`: read
//! the real key from the keychain, inject the auth header, POST the form, and
//! return the base64 image(s) the model produced (`data[].b64_json`). The secret
//! exists only in Rust and never enters the webview, disk, or an error string.
//!
//! Only OpenAI-shaped kinds (`openai` / `openai-compatible`) are accepted — the
//! edits endpoint is an OpenAI shape; other kinds have no `/images/edits`.

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart::{Form, Part};
use serde::Serialize;
use tauri::AppHandle;

use super::ai_proxy::{
    buffered_timeout_for_url, build_client_for_target, enforce_host, enforce_resolved_host,
    request_error_message, resolve_provider_request, ProxyError,
};
use super::auth_header::auth_headers;
use super::keys::read_secret;
use super::providers::{ProviderKind, ProviderWireProtocol};

/// Base64-encoded PNG image(s) returned from the edits endpoint. gpt-image always
/// answers base64 (`data[].b64_json`); the webview decodes to bytes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEditResult {
    /// One base64 PNG per returned image (`data[].b64_json`), in response order.
    pub images: Vec<String>,
}

/// Whether the provider `kind`'s `/images/edits` endpoint is OpenAI-shaped.
fn is_openai_shaped(kind: &str) -> bool {
    matches!(kind, "openai" | "openai-compatible")
}

/// Build the multipart form for an edits request: `model`, `prompt`, optional
/// `size`, `input_fidelity` (caller defaults it to `high` for 垫图), and one
/// repeated `image` parts per reference image (PNG mime + filename). OpenAI's
/// multipart contract names the field `image`; repeating that field represents
/// multiple references. The bracketed `image[]` spelling is rejected by some
/// otherwise OpenAI-compatible relays. Pure (no I/O, no
/// secret) so it is unit-testable in isolation.
fn build_edit_form(
    model: &str,
    prompt: &str,
    images: Vec<Vec<u8>>,
    size: Option<&str>,
    input_fidelity: &str,
) -> Form {
    let mut form = Form::new()
        .text("model", model.to_string())
        .text("prompt", prompt.to_string())
        .text("input_fidelity", input_fidelity.to_string());
    if let Some(size) = size {
        form = form.text("size", size.to_string());
    }
    for (i, bytes) in images.into_iter().enumerate() {
        // `image/png` is a valid mime literal, so `mime_str` cannot fail here.
        let part = Part::bytes(bytes)
            .file_name(format!("reference-{i}.png"))
            .mime_str("image/png")
            .expect("image/png is a valid mime type");
        form = form.part("image", part);
    }
    form
}

/// Parse `{ data: [{ b64_json }] }` → the base64 strings. A missing/empty `data`
/// array or absent `b64_json` fields yield an error (the model returned no image).
fn parse_edit_response(body: &str) -> Result<Vec<String>, ProxyError> {
    let parsed: serde_json::Value =
        serde_json::from_str(body).map_err(|e| ProxyError::Request(e.to_string()))?;
    let images: Vec<String> = parsed
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("b64_json").and_then(|b| b.as_str()))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if images.is_empty() {
        return Err(ProxyError::Request(
            "no image in edits response".to_string(),
        ));
    }
    Ok(images)
}

/// Build the injected auth header map for the edits request. Only the keychain
/// auth header is set — reqwest's `.multipart(form)` sets `content-type` (with
/// the boundary) itself, so we must NOT set it here.
fn build_auth_headers(
    kind: ProviderKind,
    wire_protocol: Option<ProviderWireProtocol>,
    secret: &str,
) -> Result<HeaderMap, ProxyError> {
    let effective = kind
        .effective_wire_protocol(wire_protocol)
        .map_err(ProxyError::UnsupportedWireProtocol)?;
    if !matches!(
        effective,
        Some(ProviderWireProtocol::Responses | ProviderWireProtocol::ChatCompletions)
    ) {
        return Err(ProxyError::UnsupportedWireProtocol(
            "image edit requires an OpenAI wire protocol".to_string(),
        ));
    }
    let injected =
        auth_headers(kind, wire_protocol, secret).map_err(ProxyError::UnsupportedWireProtocol)?;
    let mut map = HeaderMap::new();
    for (name, value) in injected {
        let hn = HeaderName::from_bytes(name.as_bytes()).map_err(|_| ProxyError::BadHeader)?;
        let mut hv = HeaderValue::from_str(&value).map_err(|_| ProxyError::BadHeader)?;
        hv.set_sensitive(true); // hint: keep out of any header logging
        map.insert(hn, hv);
    }
    Ok(map)
}

/// 垫图: reference-conditioned generation via `POST {base_url}/images/edits`.
///
/// `images` are the raw reference-image bytes (one or more; sent as repeated
/// `image` fields).
/// `input_fidelity` defaults to `"high"` (preserves the reference's style, which
/// is what 垫图 wants). The real key is read from the keychain and injected here;
/// non-2xx responses surface the HTTP status (secret-free), like the other proxy
/// paths.
#[tauri::command]
pub async fn ai_image_edit(
    app: AppHandle,
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    base_url: String,
    model: String,
    prompt: String,
    images: Vec<Vec<u8>>,
    size: Option<String>,
    input_fidelity: Option<String>,
) -> Result<ImageEditResult, ProxyError> {
    // The edits endpoint is OpenAI-shaped only (defensive; the webview already
    // gates the call on an OpenAI-compatible provider).
    if !is_openai_shaped(&kind) {
        return Err(ProxyError::UnknownKind);
    }
    if images.is_empty() {
        return Err(ProxyError::Request(
            "at least one reference image is required".to_string(),
        ));
    }

    let url = format!("{}/images/edits", base_url.trim_end_matches('/'));
    let (provider, effective_protocol) =
        resolve_provider_request(&app, &provider_id, &kind, wire_protocol, &url)?;
    enforce_host(provider.kind.as_str(), &url)?;
    let target = enforce_resolved_host(provider.kind.as_str(), &url).await?;
    let secret = read_secret(&provider_id).map_err(ProxyError::from)?;
    let header_map = build_auth_headers(provider.kind, Some(effective_protocol), &secret)?;

    let fidelity = input_fidelity.as_deref().unwrap_or("high");
    let form = build_edit_form(&model, &prompt, images, size.as_deref(), fidelity);

    // Image edits can take several minutes on production models; use the image
    // endpoint timeout instead of the shorter text/probe cap.
    let client = build_client_for_target(Some(buffered_timeout_for_url(&url)), &target)?;
    let resp = client
        .post(&url)
        .headers(header_map)
        .multipart(form)
        .send()
        .await
        .map_err(|e| ProxyError::Request(request_error_message(&e)))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| ProxyError::Request(request_error_message(&e)))?;
    if !status.is_success() {
        // Surface the status (never the secret) like `ai_proxy_request`.
        return Err(ProxyError::Request(format!(
            "images/edits failed: HTTP {}",
            status.as_u16()
        )));
    }

    Ok(ImageEditResult {
        images: parse_edit_response(&body)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_shaped_accepts_openai_kinds_only() {
        assert!(is_openai_shaped("openai"));
        assert!(is_openai_shaped("openai-compatible"));
        assert!(!is_openai_shaped("anthropic"));
        assert!(!is_openai_shaped("google"));
        assert!(!is_openai_shaped("gateway"));
        assert!(!is_openai_shaped(""));
    }

    #[test]
    fn build_edit_form_produces_a_multipart_form() {
        // The `image/png` mime and non-panicking construction are the contract;
        // reqwest hides part contents, so assert a boundary was assigned.
        let form = build_edit_form(
            "gpt-image-1",
            "redraw as assets",
            vec![vec![1, 2, 3], vec![4, 5, 6]],
            Some("1024x1024"),
            "high",
        );
        assert!(!form.boundary().is_empty());
    }

    #[test]
    fn build_edit_form_without_size_is_ok() {
        let form = build_edit_form("m", "p", vec![vec![0u8]], None, "high");
        assert!(!form.boundary().is_empty());
    }

    #[test]
    fn parse_edit_response_extracts_b64_in_order() {
        let body = r#"{ "data": [ { "b64_json": "AAA" }, { "b64_json": "BBB" } ] }"#;
        assert_eq!(
            parse_edit_response(body).unwrap(),
            vec!["AAA".to_string(), "BBB".to_string()]
        );
    }

    #[test]
    fn parse_edit_response_errors_on_empty_or_missing_data() {
        assert!(parse_edit_response(r#"{ "data": [] }"#).is_err());
        assert!(parse_edit_response(r#"{ "data": [ { "url": "x" } ] }"#).is_err());
        assert!(parse_edit_response(r#"{ "error": { "message": "bad" } }"#).is_err());
    }

    #[test]
    fn parse_edit_response_errors_on_non_json() {
        assert!(parse_edit_response("not json at all").is_err());
    }

    #[test]
    fn build_auth_headers_injects_bearer_and_marks_sensitive() {
        let map = build_auth_headers(ProviderKind::Openai, None, "sk-secret").unwrap();
        assert_eq!(map.get("authorization").unwrap(), "Bearer sk-secret");
        assert!(map.get("authorization").unwrap().is_sensitive());
        // No content-type — reqwest sets the multipart boundary itself.
        assert!(map.get("content-type").is_none());
    }

    #[test]
    fn build_auth_headers_rejects_non_openai_protocol() {
        assert!(matches!(
            build_auth_headers(
                ProviderKind::OpenaiCompatible,
                Some(ProviderWireProtocol::AnthropicMessages),
                "k"
            ),
            Err(ProxyError::UnsupportedWireProtocol(_))
        ));
    }
}
