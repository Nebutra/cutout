//! Native Qwen image generation/editing through DashScope's reviewed API.
//!
//! The persisted Provider remains Chat Completions for text. Image work never
//! uses compatible-mode: this command binds the same provider id and keychain
//! secret to DashScope's fixed native endpoint. Rust owns bounded result
//! downloads plus polling and cancellation for exact asynchronous contracts.

use std::time::Duration;

use base64::Engine;
use futures_util::StreamExt;
use image::GenericImageView;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use super::ai_proxy::{
    build_client_for_target, enforce_host, enforce_resolved_host, request_error_message,
    run_cancellable_proxy_request, AiProxyCancellationState, ProxyError,
};
use super::commerce_held_out::{
    held_out_request_hash, recover_held_out_response, settle_held_out_response,
};
use super::keys::read_secret;
use super::multimodal_receipt::{
    artifact_evidence, issue_receipt, sha256, MultimodalHostContext, MultimodalHostReceipt,
};
use super::providers::{load_providers_sync, ProviderConfig, ProviderKind, ProviderWireProtocol};

const DASHSCOPE_COMPATIBLE_BASE: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_IMAGE_ENDPOINT: &str =
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DASHSCOPE_TASK_ENDPOINT: &str = "https://dashscope.aliyuncs.com/api/v1/tasks";
const MAX_JSON_BYTES: usize = 1024 * 1024;
const IMAGE_3_MAX_INPUT_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const LEGACY_MAX_INPUT_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const LEGACY_MAX_TOTAL_INPUT_BYTES: usize = 64 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_BYTES: usize = 32 * 1024 * 1024;
const MAX_OUTPUT_IMAGES: usize = 6;
const IMAGE_3_MAX_REQUEST_IMAGES: usize = 3;
const LEGACY_MAX_REQUEST_IMAGES: usize = 32;
const MAX_ATTEMPTS: usize = 3;
const MAX_POLLS: usize = 80;
const WORKFLOW_TIMEOUT_SECS: u64 = 600;
const IMAGE_REQUEST_TIMEOUT_SECS: u64 = 540;
const RESULT_RESOLUTION_KIND: &str = "openai-compatible";

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DashScopeImageOperation {
    Generation,
    Edit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DashScopeRequestMode {
    Synchronous,
    Asynchronous,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DashScopeSizeContract {
    Image3,
    Legacy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DashScopeNativeContract {
    mode: DashScopeRequestMode,
    size: DashScopeSizeContract,
    max_request_images: usize,
    max_input_image_bytes: usize,
    max_total_input_bytes: usize,
}

const IMAGE_3_CONTRACT: DashScopeNativeContract = DashScopeNativeContract {
    mode: DashScopeRequestMode::Synchronous,
    size: DashScopeSizeContract::Image3,
    max_request_images: IMAGE_3_MAX_REQUEST_IMAGES,
    max_input_image_bytes: IMAGE_3_MAX_INPUT_IMAGE_BYTES,
    max_total_input_bytes: IMAGE_3_MAX_REQUEST_IMAGES * IMAGE_3_MAX_INPUT_IMAGE_BYTES,
};

const LEGACY_ASYNC_CONTRACT: DashScopeNativeContract = DashScopeNativeContract {
    mode: DashScopeRequestMode::Asynchronous,
    size: DashScopeSizeContract::Legacy,
    max_request_images: LEGACY_MAX_REQUEST_IMAGES,
    max_input_image_bytes: LEGACY_MAX_INPUT_IMAGE_BYTES,
    max_total_input_bytes: LEGACY_MAX_TOTAL_INPUT_BYTES,
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashScopeImageAsset {
    pub(crate) media_type: String,
    pub(crate) data: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DashScopeImageResult {
    pub(crate) images: Vec<DashScopeImageAsset>,
    pub(crate) receipts: Vec<MultimodalHostReceipt>,
}

#[derive(Debug)]
struct BoundedResponse {
    status: StatusCode,
    retry_after: Option<Duration>,
    content_type: Option<String>,
    body: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
enum ParsedOutput {
    Complete(Vec<String>),
    Pending(String),
}

struct RemoteTaskCancel {
    task_id: String,
    secret: String,
    armed: bool,
}

impl RemoteTaskCancel {
    fn new(task_id: String, secret: String) -> Self {
        Self {
            task_id,
            secret,
            armed: true,
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for RemoteTaskCancel {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let task_id = self.task_id.clone();
        let secret = self.secret.clone();
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        runtime.spawn(async move {
            let task_url = format!("{DASHSCOPE_TASK_ENDPOINT}/{task_id}");
            if enforce_host("dashscope", &task_url).is_err() {
                return;
            }
            let Ok(target) = enforce_resolved_host("dashscope", &task_url).await else {
                return;
            };
            let Ok(client) = build_client_for_target(Some(30), &target) else {
                return;
            };
            let Ok(headers) = auth_headers(&secret, DashScopeRequestMode::Synchronous) else {
                return;
            };
            // Provider cancellation is best effort because the local owner is
            // already terminal. No response content or error is retained.
            let _ = client.delete(task_url).headers(headers).send().await;
        });
    }
}

pub(crate) fn validate_provider_record(
    provider: &ProviderConfig,
    provider_id: &str,
) -> Result<(), ProxyError> {
    if provider.id != provider_id {
        return Err(ProxyError::ProviderNotConfigured);
    }
    if !provider.enabled {
        return Err(ProxyError::ProviderDisabled);
    }
    if provider.kind != ProviderKind::Dashscope
        || provider.wire_protocol != Some(ProviderWireProtocol::ChatCompletions)
    {
        return Err(ProxyError::ProviderBinding);
    }
    let base = provider
        .base_url
        .as_deref()
        .unwrap_or(DASHSCOPE_COMPATIBLE_BASE)
        .trim_end_matches('/');
    if base != DASHSCOPE_COMPATIBLE_BASE {
        return Err(ProxyError::ProviderBinding);
    }
    Ok(())
}

fn validate_provider_binding(app: &AppHandle, provider_id: &str) -> Result<(), ProxyError> {
    let provider = load_providers_sync(app)
        .map_err(|_| ProxyError::ProviderNotConfigured)?
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .ok_or(ProxyError::ProviderNotConfigured)?;
    validate_provider_record(&provider, provider_id)
}

fn validate_request(
    operation: DashScopeImageOperation,
    model: &str,
    prompt: &str,
    images: &[Vec<u8>],
    size: Option<&str>,
) -> Result<DashScopeNativeContract, ProxyError> {
    let contract = native_contract(model, operation)
        .ok_or_else(|| ProxyError::Request("unsupported DashScope image model contract".into()))?;
    if model.is_empty()
        || model.len() > 300
        || model.chars().any(char::is_control)
        || prompt.trim().is_empty()
        || prompt.len() > 200_000
    {
        return Err(ProxyError::Request(
            "invalid DashScope image request".into(),
        ));
    }
    if operation == DashScopeImageOperation::Generation && !images.is_empty() {
        return Err(ProxyError::Request(
            "DashScope generation cannot discard reference images".into(),
        ));
    }
    if operation == DashScopeImageOperation::Edit && images.is_empty() {
        return Err(ProxyError::Request(
            "DashScope edit requires at least one reference image".into(),
        ));
    }
    if images.len() > contract.max_request_images
        || images
            .iter()
            .any(|image| image.len() > contract.max_input_image_bytes)
        || images.iter().map(Vec::len).sum::<usize>() > contract.max_total_input_bytes
        || images
            .iter()
            .any(|image| detect_image_media_type(image).is_none())
    {
        return Err(ProxyError::Request(
            "DashScope reference image boundary rejected".into(),
        ));
    }
    if size.is_some_and(|value| normalize_size(value, contract.size).is_none()) {
        return Err(ProxyError::Request("invalid DashScope image size".into()));
    }
    Ok(contract)
}

fn validate_reference_bindings(
    operation: DashScopeImageOperation,
    images: &[Vec<u8>],
    host_context: Option<&MultimodalHostContext>,
) -> Result<(), ProxyError> {
    let Some(context) = host_context else {
        return Ok(());
    };
    let expected = &context.accepted_reference_artifact_ids;
    match operation {
        DashScopeImageOperation::Generation if !expected.is_empty() => {
            return Err(ProxyError::Request(
                "DashScope image generation cannot claim accepted references".into(),
            ));
        }
        DashScopeImageOperation::Edit if expected.len() != images.len() => {
            return Err(ProxyError::Request(
                "DashScope image edit reference count does not match its signed context".into(),
            ));
        }
        _ => {}
    }
    for (bytes, artifact_id) in images.iter().zip(expected) {
        if artifact_id
            != &format!(
                "artifact:sha256:{}",
                super::multimodal_receipt::sha256(bytes)
            )
        {
            return Err(ProxyError::Request(
                "DashScope image edit reference bytes do not match the accepted artifact".into(),
            ));
        }
    }
    Ok(())
}

fn native_contract(
    model: &str,
    operation: DashScopeImageOperation,
) -> Option<DashScopeNativeContract> {
    if matches!(model, "qwen-image-3.0" | "qwen-image-3.0-pro") {
        return Some(IMAGE_3_CONTRACT);
    }
    let legacy_generation = matches!(
        model,
        "qwen-image-2.0"
            | "qwen-image-2.0-2026-03-03"
            | "qwen-image-2.0-pro"
            | "qwen-image-2.0-pro-2026-03-03"
            | "qwen-image-2.0-pro-2026-04-22"
            | "qwen-image-2.0-pro-2026-06-22"
            | "qwen-image-max"
            | "qwen-image-max-2025-12-30"
            | "qwen-image-plus"
            | "qwen-image-plus-2026-01-09"
    );
    let legacy_edit = matches!(
        model,
        "qwen-image-2.0-pro-2026-06-22" | "qwen-image-edit" | "qwen-image-edit-2511"
    );
    match operation {
        DashScopeImageOperation::Generation if legacy_generation => Some(LEGACY_ASYNC_CONTRACT),
        DashScopeImageOperation::Edit if legacy_edit => Some(LEGACY_ASYNC_CONTRACT),
        _ => None,
    }
}

fn normalize_size(size: &str, contract: DashScopeSizeContract) -> Option<String> {
    let normalized = size.replace('x', "*");
    let (width, height) = normalized.split_once('*')?;
    if width.is_empty()
        || height.is_empty()
        || !width.bytes().all(|byte| byte.is_ascii_digit())
        || !height.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    let width: u32 = width.parse().ok()?;
    let height: u32 = height.parse().ok()?;
    let valid = match contract {
        DashScopeSizeContract::Image3 => {
            let area = u64::from(width) * u64::from(height);
            area >= 512_u64 * 512
                && area <= 2048_u64 * 2048
                && u64::from(width) <= u64::from(height) * 8
                && u64::from(height) <= u64::from(width) * 8
        }
        DashScopeSizeContract::Legacy => width > 0 && width <= 4096 && height > 0 && height <= 4096,
    };
    valid.then(|| format!("{width}*{height}"))
}

fn build_request_body(
    operation: DashScopeImageOperation,
    model: &str,
    prompt: &str,
    images: &[Vec<u8>],
    size: Option<&str>,
    contract: DashScopeNativeContract,
) -> Value {
    let mut content = Vec::with_capacity(images.len() + 1);
    if operation == DashScopeImageOperation::Edit {
        for image in images {
            let media_type = detect_image_media_type(image).expect("validated image media type");
            let encoded = base64::engine::general_purpose::STANDARD.encode(image);
            content.push(json!({ "image": format!("data:{media_type};base64,{encoded}") }));
        }
    }
    content.push(json!({ "text": prompt }));
    let mut parameters = json!({
        "n": 1,
        "prompt_extend": true,
        "watermark": false,
    });
    if let Some(size) = size.and_then(|value| normalize_size(value, contract.size)) {
        parameters["size"] = Value::String(size);
    }
    json!({
        "model": model,
        "input": { "messages": [{ "role": "user", "content": content }] },
        "parameters": parameters,
    })
}

fn auth_headers(secret: &str, mode: DashScopeRequestMode) -> Result<HeaderMap, ProxyError> {
    let mut headers = HeaderMap::new();
    let mut auth =
        HeaderValue::from_str(&format!("Bearer {secret}")).map_err(|_| ProxyError::BadHeader)?;
    auth.set_sensitive(true);
    headers.insert(AUTHORIZATION, auth);
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if mode == DashScopeRequestMode::Asynchronous {
        headers.insert("x-dashscope-async", HeaderValue::from_static("enable"));
    }
    Ok(headers)
}

fn is_retryable_status(status: StatusCode) -> bool {
    status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

fn is_retry_safe_method(method: &Method) -> bool {
    method == Method::GET || method == Method::HEAD
}

fn retry_delay(attempt: usize, retry_after: Option<Duration>) -> Duration {
    retry_after
        .unwrap_or_else(|| Duration::from_millis(250 * (1_u64 << attempt.min(4))))
        .min(Duration::from_secs(5))
}

async fn read_bounded_response(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<BoundedResponse, ProxyError> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(ProxyError::Request(
            "provider response exceeded byte limit".into(),
        ));
    }
    let status = response.status();
    let retry_after = response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(Duration::from_secs);
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|_| ProxyError::Request("provider response body failed".into()))?;
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err(ProxyError::Request(
                "provider response exceeded byte limit".into(),
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(BoundedResponse {
        status,
        retry_after,
        content_type,
        body,
    })
}

async fn request_json(
    client: &reqwest::Client,
    method: Method,
    url: &str,
    headers: &HeaderMap,
    body: Option<&Value>,
) -> Result<Vec<u8>, ProxyError> {
    let retry_safe = is_retry_safe_method(&method);
    for attempt in 0..MAX_ATTEMPTS {
        let mut request = client.request(method.clone(), url).headers(headers.clone());
        if let Some(body) = body {
            request = request.json(body);
        }
        match request.send().await {
            Ok(response) => {
                let response = read_bounded_response(response, MAX_JSON_BYTES).await?;
                if response.status.is_success() {
                    return Ok(response.body);
                }
                if retry_safe && is_retryable_status(response.status) && attempt + 1 < MAX_ATTEMPTS
                {
                    tokio::time::sleep(retry_delay(attempt, response.retry_after)).await;
                    continue;
                }
                return Err(provider_http_error(response.status, &response.body));
            }
            Err(error) if retry_safe && attempt + 1 < MAX_ATTEMPTS && !error.is_builder() => {
                tokio::time::sleep(retry_delay(attempt, None)).await;
            }
            Err(error) => {
                if !retry_safe && error.is_timeout() {
                    return Err(ProxyError::Request(
                        "DashScope image write timed out; automatic retry is disabled because the Provider does not expose an idempotency key"
                            .into(),
                    ));
                }
                return Err(ProxyError::Request(request_error_message(&error)));
            }
        }
    }
    Err(ProxyError::Request(
        "DashScope retry budget exhausted".into(),
    ))
}

fn provider_http_error(status: StatusCode, body: &[u8]) -> ProxyError {
    let value = serde_json::from_slice::<Value>(body).ok();
    let code = value
        .as_ref()
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 80
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        });
    let provider_message = value
        .as_ref()
        .and_then(|value| value.get("message"))
        .and_then(Value::as_str)
        .map(|message| message.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|message| {
            let lower = message.to_ascii_lowercase();
            !message.is_empty()
                && message.chars().count() <= 320
                && !message.chars().any(char::is_control)
                && ![
                    "bearer ", "api key", "apikey", "api_key", "token", "secret", "http://",
                    "https://", "oss-",
                ]
                .iter()
                .any(|marker| lower.contains(marker))
        });
    let detail = provider_message
        .map(|message| format!(": {message}"))
        .unwrap_or_default();
    ProxyError::Request(match code {
        Some(code) => format!(
            "DashScope image request failed: HTTP {} ({code}){detail}",
            status.as_u16(),
        ),
        None => format!(
            "DashScope image request failed: HTTP {}{detail}",
            status.as_u16()
        ),
    })
}

fn parse_output(body: &[u8], mode: DashScopeRequestMode) -> Result<ParsedOutput, ProxyError> {
    let value: Value = serde_json::from_slice(body)
        .map_err(|_| ProxyError::Request("invalid DashScope image response".into()))?;
    if value.get("code").and_then(Value::as_str).is_some() {
        return Err(ProxyError::Request("DashScope image request failed".into()));
    }
    let output = value
        .get("output")
        .and_then(Value::as_object)
        .ok_or_else(|| ProxyError::Request("invalid DashScope image response".into()))?;
    if mode == DashScopeRequestMode::Synchronous {
        if output.contains_key("task_id")
            || output.contains_key("task_status")
            || output.contains_key("results")
        {
            return Err(ProxyError::Request(
                "invalid synchronous DashScope image response".into(),
            ));
        }
        let urls = extract_choice_urls(output);
        if urls.is_empty() || urls.len() > MAX_OUTPUT_IMAGES {
            return Err(ProxyError::Request(
                "invalid DashScope image result count".into(),
            ));
        }
        return Ok(ParsedOutput::Complete(urls));
    }
    let status = output.get("task_status").and_then(Value::as_str);
    if matches!(status, Some("FAILED" | "CANCELED" | "UNKNOWN")) {
        return Err(ProxyError::Request("DashScope image task failed".into()));
    }
    let urls = extract_result_urls(output);
    if matches!(status, Some("SUCCEEDED")) || (!urls.is_empty() && status.is_none()) {
        if urls.is_empty() || urls.len() > MAX_OUTPUT_IMAGES {
            return Err(ProxyError::Request(
                "invalid DashScope image result count".into(),
            ));
        }
        return Ok(ParsedOutput::Complete(urls));
    }
    let task_id = output
        .get("task_id")
        .and_then(Value::as_str)
        .ok_or_else(|| ProxyError::Request("invalid DashScope image response".into()))?;
    uuid::Uuid::parse_str(task_id)
        .map_err(|_| ProxyError::Request("invalid DashScope image task id".into()))?;
    match status {
        None | Some("PENDING" | "RUNNING") => Ok(ParsedOutput::Pending(task_id.to_string())),
        _ => Err(ProxyError::Request(
            "unknown DashScope image task status".into(),
        )),
    }
}

fn extract_result_urls(output: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(results) = output.get("results").and_then(Value::as_array) {
        urls.extend(results.iter().filter_map(|result| {
            result
                .get("url")
                .and_then(Value::as_str)
                .map(str::to_string)
        }));
    }
    urls.extend(extract_choice_urls(output));
    urls
}

fn extract_choice_urls(output: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(choices) = output.get("choices").and_then(Value::as_array) {
        for choice in choices {
            let content = choice
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(Value::as_array);
            if let Some(content) = content {
                urls.extend(content.iter().filter_map(|part| {
                    part.get("image")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                }));
            }
        }
    }
    urls
}

fn enforce_result_url(url: &str) -> Result<(), ProxyError> {
    let parsed = reqwest::Url::parse(url).map_err(|_| ProxyError::BadUrl)?;
    let host = parsed.host_str().ok_or(ProxyError::BadUrl)?;
    let labels = host.split('.').collect::<Vec<_>>();
    let regional_result_host = matches!(labels.as_slice(), [result, region, "aliyuncs", "com"]
        if result.strip_prefix("dashscope-result-").is_some_and(|value| !value.is_empty())
            && region.strip_prefix("oss-cn-").is_some_and(|value| !value.is_empty()));
    let accelerated_result_host = matches!(labels.as_slice(), [bucket, "oss-accelerate", "aliyuncs", "com"]
    if bucket.strip_prefix("dashscope-").is_some_and(|token| {
        !token.is_empty()
            && token.len() <= 32
            && token
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
            && !token.starts_with('-')
            && !token.ends_with('-')
    }));
    if parsed.scheme() != "https"
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !(regional_result_host || accelerated_result_host)
    {
        return Err(ProxyError::DisallowedHost);
    }
    Ok(())
}

async fn resolve_result_target(url: &str) -> Result<super::ai_proxy::ResolvedTarget, ProxyError> {
    enforce_result_url(url).map_err(|error| result_origin_error("URL policy", url, error))?;
    // The result-origin allowlist above is the authority for Provider-produced
    // OSS URLs. Reuse the generic remote resolver only for public-address
    // validation and DNS pinning; the `dashscope` kind owns API-origin policy.
    enforce_resolved_host(RESULT_RESOLUTION_KIND, url)
        .await
        .map_err(|error| result_origin_error("DNS policy", url, error))
}

fn result_origin_error(stage: &str, url: &str, error: ProxyError) -> ProxyError {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_else(|| "invalid-url".into());
    ProxyError::Request(format!(
        "DashScope result {stage} rejected for host {host}: {error}"
    ))
}

async fn download_image(url: &str) -> Result<(DashScopeImageAsset, Vec<u8>, u32, u32), ProxyError> {
    let target = resolve_result_target(url).await?;
    let client = build_client_for_target(Some(IMAGE_REQUEST_TIMEOUT_SECS), &target)?;
    for attempt in 0..MAX_ATTEMPTS {
        match client.get(url).send().await {
            Ok(response) => {
                let response = read_bounded_response(response, MAX_OUTPUT_IMAGE_BYTES).await?;
                if response.status.is_success() {
                    let detected = detect_image_media_type(&response.body).ok_or_else(|| {
                        ProxyError::Request("invalid DashScope image bytes".into())
                    })?;
                    let dimensions = image::load_from_memory(&response.body)
                        .map_err(|_| ProxyError::Request("invalid DashScope image pixels".into()))?
                        .dimensions();
                    if response.content_type.as_deref().is_some_and(|value| {
                        !value.to_ascii_lowercase().starts_with("image/")
                            && !value
                                .to_ascii_lowercase()
                                .starts_with("application/octet-stream")
                    }) {
                        return Err(ProxyError::Request(
                            "invalid DashScope image content type".into(),
                        ));
                    }
                    return Ok((
                        DashScopeImageAsset {
                            media_type: detected.to_string(),
                            data: base64::engine::general_purpose::STANDARD.encode(&response.body),
                        },
                        response.body,
                        dimensions.0,
                        dimensions.1,
                    ));
                }
                if is_retryable_status(response.status) && attempt + 1 < MAX_ATTEMPTS {
                    tokio::time::sleep(retry_delay(attempt, response.retry_after)).await;
                    continue;
                }
                return Err(provider_http_error(response.status, &response.body));
            }
            Err(error) if attempt + 1 < MAX_ATTEMPTS && !error.is_builder() => {
                tokio::time::sleep(retry_delay(attempt, None)).await;
            }
            Err(error) => {
                return Err(ProxyError::Request(if error.is_timeout() {
                    "DashScope image download timed out".into()
                } else {
                    "DashScope image download failed".into()
                }))
            }
        }
    }
    Err(ProxyError::Request(
        "DashScope download retry budget exhausted".into(),
    ))
}

fn detect_image_media_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

pub(crate) async fn execute(
    app: AppHandle,
    provider_id: String,
    operation: DashScopeImageOperation,
    model: String,
    prompt: String,
    images: Vec<Vec<u8>>,
    size: Option<String>,
    host_context: Option<MultimodalHostContext>,
) -> Result<DashScopeImageResult, ProxyError> {
    validate_request(operation, &model, &prompt, &images, size.as_deref())?;
    validate_reference_bindings(operation, &images, host_context.as_ref())?;
    let replay = if let Some(context) = host_context
        .as_ref()
        .filter(|context| context.held_out_commitment_hash.is_some())
    {
        let commitment_hash = context.held_out_commitment_hash.as_deref().unwrap();
        let node_id = context.node_id.as_deref().ok_or_else(|| {
            ProxyError::Request(
                "held-out multimodal receipt requires an exact native Plan node".into(),
            )
        })?;
        let slot_id = format!("multimodal:{node_id}");
        let operation_id = match operation {
            DashScopeImageOperation::Generation => "image-generation",
            DashScopeImageOperation::Edit => "image-edit",
        };
        let image_hashes = images.iter().map(|image| sha256(image)).collect::<Vec<_>>();
        let request_hash = held_out_request_hash(&json!({
            "operation": operation_id,
            "providerId": provider_id,
            "model": model,
            "prompt": prompt,
            "inputImageSha256": image_hashes,
            "size": size,
            "hostContext": context,
        }))?;
        if let Some(response) = recover_held_out_response(
            &app,
            commitment_hash,
            &context.run_id,
            &slot_id,
            &request_hash,
        )? {
            return Ok(response);
        }
        Some((
            commitment_hash.to_string(),
            context.run_id.clone(),
            slot_id,
            request_hash,
        ))
    } else {
        None
    };
    validate_provider_binding(&app, &provider_id)?;
    let secret = read_secret(&provider_id).map_err(ProxyError::from)?;
    let result = execute_bound(
        provider_id,
        operation,
        model,
        prompt,
        images,
        size,
        host_context,
        secret,
    )
    .await?;
    if let Some((commitment_hash, run_id, slot_id, request_hash)) = replay {
        if result.images.len() != 1 || result.receipts.len() != 1 {
            return Err(ProxyError::Request(
                "held-out image execution requires exactly one retained output".into(),
            ));
        }
        return settle_held_out_response(
            &app,
            &commitment_hash,
            &run_id,
            &slot_id,
            &request_hash,
            &result.receipts[0].receipt_hash,
            &result,
        );
    }
    Ok(result)
}

pub(crate) async fn execute_bound(
    provider_id: String,
    operation: DashScopeImageOperation,
    model: String,
    prompt: String,
    images: Vec<Vec<u8>>,
    size: Option<String>,
    host_context: Option<MultimodalHostContext>,
    secret: String,
) -> Result<DashScopeImageResult, ProxyError> {
    let contract = validate_request(operation, &model, &prompt, &images, size.as_deref())?;
    validate_reference_bindings(operation, &images, host_context.as_ref())?;
    let started_at = unix_millis()?;
    enforce_host("dashscope", DASHSCOPE_IMAGE_ENDPOINT)?;
    let target = enforce_resolved_host("dashscope", DASHSCOPE_IMAGE_ENDPOINT).await?;
    let client = build_client_for_target(Some(IMAGE_REQUEST_TIMEOUT_SECS), &target)?;
    let headers = auth_headers(&secret, contract.mode)?;
    let request = build_request_body(
        operation,
        &model,
        &prompt,
        &images,
        size.as_deref(),
        contract,
    );
    let submitted = request_json(
        &client,
        Method::POST,
        DASHSCOPE_IMAGE_ENDPOINT,
        &headers,
        Some(&request),
    )
    .await?;
    let mut output = parse_output(&submitted, contract.mode)?;
    let mut remote_cancel = match &output {
        ParsedOutput::Pending(task_id) => {
            Some(RemoteTaskCancel::new(task_id.clone(), secret.clone()))
        }
        ParsedOutput::Complete(_) => None,
    };
    for poll in 0..MAX_POLLS {
        match output {
            ParsedOutput::Complete(urls) => {
                if let Some(cancel) = remote_cancel.as_mut() {
                    cancel.disarm();
                }
                let mut assets = Vec::with_capacity(urls.len());
                let mut receipts = Vec::with_capacity(urls.len());
                for url in urls {
                    let (asset, bytes, width, height) = download_image(&url).await?;
                    if let Some(context) = host_context.as_ref() {
                        let operation = match operation {
                            DashScopeImageOperation::Generation => "image-generation",
                            DashScopeImageOperation::Edit => "image-edit",
                        };
                        receipts.push(issue_receipt(
                            context,
                            &provider_id,
                            &model,
                            operation,
                            artifact_evidence(&bytes, &asset.media_type, Some(width), Some(height)),
                            started_at,
                            unix_millis()?,
                            None,
                        )?);
                    }
                    assets.push(asset);
                }
                let result = DashScopeImageResult {
                    images: assets,
                    receipts,
                };
                return Ok(result);
            }
            ParsedOutput::Pending(ref task_id) => {
                if poll + 1 == MAX_POLLS {
                    break;
                }
                tokio::time::sleep(
                    Duration::from_millis(500 * (1_u64 << poll.min(3))).min(Duration::from_secs(5)),
                )
                .await;
                let task_url = format!("{DASHSCOPE_TASK_ENDPOINT}/{task_id}");
                enforce_host("dashscope", &task_url)?;
                let task_target = enforce_resolved_host("dashscope", &task_url).await?;
                let task_client = build_client_for_target(Some(60), &task_target)?;
                let body = request_json(
                    &task_client,
                    Method::GET,
                    &task_url,
                    &auth_headers(&secret, DashScopeRequestMode::Synchronous)?,
                    None,
                )
                .await?;
                output = parse_output(&body, DashScopeRequestMode::Asynchronous)?;
            }
        }
    }
    Err(ProxyError::Request("DashScope image task timed out".into()))
}

#[tauri::command]
pub async fn ai_dashscope_image(
    app: AppHandle,
    cancellations: State<'_, AiProxyCancellationState>,
    request_id: Option<String>,
    provider_id: String,
    operation: DashScopeImageOperation,
    model: String,
    prompt: String,
    images: Vec<Vec<u8>>,
    size: Option<String>,
    host_context: Option<MultimodalHostContext>,
) -> Result<DashScopeImageResult, ProxyError> {
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        tokio::time::timeout(
            Duration::from_secs(WORKFLOW_TIMEOUT_SECS),
            execute(
                app,
                provider_id,
                operation,
                model,
                prompt,
                images,
                size,
                host_context,
            ),
        )
        .await
        .map_err(|_| ProxyError::Request("DashScope image workflow timed out".into()))?
    })
    .await
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

    fn png() -> Vec<u8> {
        b"\x89PNG\r\n\x1a\nrest".to_vec()
    }

    fn png_with_len(len: usize) -> Vec<u8> {
        let mut bytes = vec![0; len.max(8)];
        bytes[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        bytes
    }

    fn jpeg() -> Vec<u8> {
        vec![0xff, 0xd8, 0xff, 0xe0]
    }

    fn webp() -> Vec<u8> {
        b"RIFF\0\0\0\0WEBP".to_vec()
    }

    #[test]
    fn image_3_request_bodies_preserve_exact_models_and_ordered_references() {
        for model in ["qwen-image-3.0", "qwen-image-3.0-pro"] {
            let edit_contract = validate_request(
                DashScopeImageOperation::Edit,
                model,
                "keep all three",
                &[png(), png(), png()],
                Some("1024x1024"),
            )
            .unwrap();
            assert_eq!(edit_contract.mode, DashScopeRequestMode::Synchronous);
            let body = build_request_body(
                DashScopeImageOperation::Edit,
                model,
                "keep all three",
                &[png(), png(), png()],
                Some("1024x1024"),
                edit_contract,
            );
            assert_eq!(body["model"], model);
            let content = body["input"]["messages"][0]["content"].as_array().unwrap();
            assert_eq!(content.len(), 4);
            for part in &content[..3] {
                assert!(part["image"]
                    .as_str()
                    .unwrap()
                    .starts_with("data:image/png;base64,"));
            }
            assert_eq!(content[3]["text"], "keep all three");
            assert_eq!(body["parameters"]["size"], "1024*1024");

            let generation_contract = validate_request(
                DashScopeImageOperation::Generation,
                model,
                "generate",
                &[],
                None,
            )
            .unwrap();
            let generation = build_request_body(
                DashScopeImageOperation::Generation,
                model,
                "generate",
                &[],
                None,
                generation_contract,
            );
            assert_eq!(generation["model"], model);
            assert_eq!(
                generation["input"]["messages"][0]["content"],
                json!([{ "text": "generate" }])
            );
        }
    }

    #[test]
    fn generation_rejects_references_instead_of_dropping_them() {
        assert!(validate_request(
            DashScopeImageOperation::Generation,
            "qwen-image-2.0-pro",
            "prompt",
            &[png()],
            None,
        )
        .is_err());
    }

    #[test]
    fn signed_image_edit_context_binds_each_reference_to_its_exact_bytes() {
        let reference = png();
        let artifact_id = format!(
            "artifact:sha256:{}",
            super::super::multimodal_receipt::sha256(&reference)
        );
        let context = MultimodalHostContext {
            request_id: "request:image-edit".into(),
            run_id: "run:commerce".into(),
            held_out_commitment_hash: None,
            semantic_role: Some("main-image".into()),
            node_id: Some("outcome:commerce:main-image:step:1".into()),
            capability_id: Some("capability:commerce-image".into()),
            accepted_reference_artifact_ids: vec![artifact_id],
            lock_ids: vec!["lock:commerce-product-identity".into()],
        };
        assert!(validate_reference_bindings(
            DashScopeImageOperation::Edit,
            std::slice::from_ref(&reference),
            Some(&context),
        )
        .is_ok());

        let drifted = vec![0xff, 0xd8, 0xff, 0xe0];
        assert!(validate_reference_bindings(
            DashScopeImageOperation::Edit,
            &[drifted],
            Some(&context),
        )
        .is_err());

        let mut extra = context.clone();
        extra
            .accepted_reference_artifact_ids
            .push(format!("artifact:sha256:{}", "f".repeat(64)));
        assert!(validate_reference_bindings(
            DashScopeImageOperation::Edit,
            &[reference],
            Some(&extra),
        )
        .is_err());
    }

    #[test]
    fn image_3_headers_and_response_are_synchronous() {
        for model in ["qwen-image-3.0", "qwen-image-3.0-pro"] {
            let contract = native_contract(model, DashScopeImageOperation::Generation).unwrap();
            let headers = auth_headers("secret", contract.mode).unwrap();
            assert!(!headers.contains_key("x-dashscope-async"));
        }
        let sync = br#"{"output":{"choices":[{"message":{"content":[{"image":"https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/a.png?Expires=1"}]}}]}}"#;
        assert!(
            matches!(parse_output(sync, DashScopeRequestMode::Synchronous), Ok(ParsedOutput::Complete(urls)) if urls.len() == 1)
        );
        let pending = br#"{"output":{"task_id":"0385dc79-5ff8-4d82-bcb6-000000000000","task_status":"PENDING"}}"#;
        assert!(parse_output(pending, DashScopeRequestMode::Synchronous).is_err());
    }

    #[test]
    fn exact_legacy_contracts_retain_async_headers_and_response_parsing() {
        let contract =
            native_contract("qwen-image-plus", DashScopeImageOperation::Generation).unwrap();
        assert_eq!(contract.mode, DashScopeRequestMode::Asynchronous);
        let headers = auth_headers("secret", contract.mode).unwrap();
        assert_eq!(headers["x-dashscope-async"], "enable");
        let pending = br#"{"output":{"task_id":"0385dc79-5ff8-4d82-bcb6-000000000000","task_status":"PENDING"}}"#;
        assert!(matches!(
            parse_output(pending, DashScopeRequestMode::Asynchronous),
            Ok(ParsedOutput::Pending(_))
        ));
        let complete = br#"{"output":{"task_id":"0385dc79-5ff8-4d82-bcb6-000000000000","task_status":"SUCCEEDED","results":[{"url":"https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/a.png?Expires=1"}]}}"#;
        assert!(
            matches!(parse_output(complete, DashScopeRequestMode::Asynchronous), Ok(ParsedOutput::Complete(urls)) if urls.len() == 1)
        );
    }

    #[test]
    fn image_3_edit_enforces_reference_count_bytes_and_media_subset() {
        let model = "qwen-image-3.0";
        assert!(validate_request(
            DashScopeImageOperation::Edit,
            model,
            "prompt",
            &[png(), jpeg(), webp()],
            None,
        )
        .is_ok());
        assert!(
            validate_request(DashScopeImageOperation::Edit, model, "prompt", &[], None,).is_err()
        );
        assert!(validate_request(
            DashScopeImageOperation::Edit,
            model,
            "prompt",
            &[png(), png(), png(), png()],
            None,
        )
        .is_err());
        let at_limit = png_with_len(IMAGE_3_MAX_INPUT_IMAGE_BYTES);
        assert!(validate_request(
            DashScopeImageOperation::Edit,
            model,
            "prompt",
            &[at_limit.clone()],
            None,
        )
        .is_ok());
        let over_limit = png_with_len(IMAGE_3_MAX_INPUT_IMAGE_BYTES + 1);
        assert!(validate_request(
            DashScopeImageOperation::Edit,
            model,
            "prompt",
            &[over_limit],
            None,
        )
        .is_err());
        assert!(validate_request(
            DashScopeImageOperation::Edit,
            model,
            "prompt",
            &[b"GIF89a".to_vec()],
            None,
        )
        .is_err());
    }

    #[test]
    fn image_3_size_enforces_pixel_area_and_aspect_ratio() {
        let contract = DashScopeSizeContract::Image3;
        assert_eq!(
            normalize_size("512x512", contract).as_deref(),
            Some("512*512")
        );
        assert_eq!(
            normalize_size("4096*1024", contract).as_deref(),
            Some("4096*1024")
        );
        assert_eq!(
            normalize_size("4096*512", contract).as_deref(),
            Some("4096*512")
        );
        assert!(normalize_size("511*512", contract).is_none());
        assert!(normalize_size("4097*1024", contract).is_none());
        assert!(normalize_size("4096*511", contract).is_none());
    }

    #[test]
    fn marketing_aliases_and_cross_operation_legacy_models_are_rejected() {
        for model in ["Qwen-Image-3.0", "image-3", "image-3-pro"] {
            assert!(validate_request(
                DashScopeImageOperation::Generation,
                model,
                "prompt",
                &[],
                None,
            )
            .is_err());
        }
        assert!(
            native_contract("qwen-image-edit-2511", DashScopeImageOperation::Generation).is_none()
        );
        assert!(native_contract("qwen-image-plus", DashScopeImageOperation::Edit).is_none());
    }

    #[test]
    fn result_download_origin_is_closed() {
        for url in [
            "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/a.png?Expires=1",
            "https://dashscope-a717.oss-accelerate.aliyuncs.com/a.png?Expires=1&Signature=x",
        ] {
            assert!(enforce_result_url(url).is_ok(), "expected {url} to pass");
            assert!(
                enforce_host(RESULT_RESOLUTION_KIND, url).is_ok(),
                "expected {url} to reach public DNS resolution"
            );
        }

        for url in [
            "https://evil.aliyuncs.com/a.png",
            "https://other-bucket.oss-accelerate.aliyuncs.com/a.png",
            "http://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/a.png",
            "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com.evil.test/a.png",
            "https://dashscope-result-sh.extra.oss-cn-shanghai.aliyuncs.com/a.png",
            "https://dashscope-a717.oss-accelerate.aliyuncs.com.evil.test/a.png",
            "https://dashscope-a717.extra.oss-accelerate.aliyuncs.com/a.png",
            "https://dashscope-result-.oss-cn-.aliyuncs.com/a.png",
            "https://127.0.0.1/a.png",
        ] {
            assert!(enforce_result_url(url).is_err(), "expected {url} to fail");
        }
    }

    #[test]
    fn retries_only_reviewed_transient_statuses() {
        assert!(is_retryable_status(StatusCode::REQUEST_TIMEOUT));
        assert!(is_retryable_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable_status(StatusCode::BAD_GATEWAY));
        assert!(!is_retryable_status(StatusCode::BAD_REQUEST));
        assert!(!is_retryable_status(StatusCode::UNAUTHORIZED));
        assert!(is_retry_safe_method(&Method::GET));
        assert!(is_retry_safe_method(&Method::HEAD));
        assert!(!is_retry_safe_method(&Method::POST));
        assert!(!is_retry_safe_method(&Method::DELETE));
    }

    #[test]
    fn malformed_payloads_and_unbounded_inputs_fail_closed() {
        assert!(parse_output(
            br#"{"output":{"choices":[]}}"#,
            DashScopeRequestMode::Synchronous,
        )
        .is_err());
        assert!(parse_output(br#"not-json"#, DashScopeRequestMode::Synchronous).is_err());
        assert!(validate_request(
            DashScopeImageOperation::Edit,
            "qwen-image-edit",
            "prompt",
            &[],
            None,
        )
        .is_err());
        assert!(normalize_size("99999x1", DashScopeSizeContract::Image3).is_none());
    }

    #[test]
    fn provider_failures_retain_only_safe_bounded_diagnostics() {
        let safe = provider_http_error(
            StatusCode::BAD_REQUEST,
            br#"{"code":"InvalidParameter","message":"The size field is unsupported for this request."}"#,
        );
        let ProxyError::Request(safe_message) = safe else {
            panic!("expected sanitized request failure");
        };
        assert_eq!(
            safe_message,
            "DashScope image request failed: HTTP 400 (InvalidParameter): The size field is unsupported for this request."
        );

        let error = provider_http_error(
            StatusCode::BAD_REQUEST,
            br#"{"code":"InvalidParameter","message":"Bearer private-secret"}"#,
        );
        let ProxyError::Request(message) = error else {
            panic!("expected sanitized request failure");
        };
        assert_eq!(
            message,
            "DashScope image request failed: HTTP 400 (InvalidParameter)"
        );
        assert!(!message.contains("private-secret"));

        let url = provider_http_error(
            StatusCode::BAD_REQUEST,
            br#"{"code":"InvalidParameter","message":"inspect https://oss-example.invalid/signed?token=secret"}"#,
        );
        let ProxyError::Request(url_message) = url else {
            panic!("expected sanitized request failure");
        };
        assert_eq!(
            url_message,
            "DashScope image request failed: HTTP 400 (InvalidParameter)"
        );
    }
}
