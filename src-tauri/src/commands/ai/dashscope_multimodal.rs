use std::collections::HashMap;
use std::io::Cursor;
use std::time::Duration;

use base64::Engine;
use futures_util::StreamExt;
use mp4::{MediaType, Mp4Reader, TrackType};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use reqwest::multipart::{Form, Part};
use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use super::ai_proxy::{
    build_client_for_target, enforce_host, enforce_resolved_host, request_error_message,
    request_with_secret, run_cancellable_proxy_request, AiProxyCancellationState, ProxyError,
};
use super::commerce_held_out::{
    held_out_request_hash, recover_held_out_response, settle_held_out_response,
};
use super::keys::read_secret;
use super::multimodal_receipt::{
    artifact_evidence, issue_receipt, sha256, MultimodalArtifactEvidence, MultimodalHostContext,
    MultimodalHostReceipt,
};
use super::providers::{load_providers_sync, ProviderKind, ProviderWireProtocol};

const DASHSCOPE_COMPATIBLE_BASE: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_CHAT_ENDPOINT: &str =
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DASHSCOPE_VIDEO_ENDPOINT: &str =
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis";
const DASHSCOPE_UPLOAD_ENDPOINT: &str = "https://dashscope.aliyuncs.com/api/v1/uploads";
const DASHSCOPE_TASK_ENDPOINT: &str = "https://dashscope.aliyuncs.com/api/v1/tasks";
const MAX_JSON_BYTES: usize = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES: usize = 64 * 1024 * 1024;
const MAX_VISION_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_ATTEMPTS: usize = 3;
const MAX_POLLS: usize = 80;
const WORKFLOW_TIMEOUT_SECS: u64 = 600;
const WAN27_IMAGE_TO_VIDEO_MODEL: &str = "wan2.7-i2v-2026-04-25";
const WAN27_MAXIMUM_SEED: i64 = i32::MAX as i64;
const MAX_REFERENCE_IMAGE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Deserialize)]
struct DashScopeUploadPolicyEnvelope {
    data: DashScopeUploadPolicy,
}

#[derive(Debug, Deserialize)]
struct DashScopeUploadPolicy {
    upload_host: String,
    upload_dir: String,
    oss_access_key_id: String,
    signature: String,
    policy: String,
    x_oss_object_acl: String,
    x_oss_forbid_overwrite: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashScopeStructuredTextResult {
    media_type: String,
    data: String,
    receipt: MultimodalHostReceipt,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashScopeVideoResult {
    media_type: String,
    data: String,
    receipt: MultimodalHostReceipt,
}

#[derive(Debug)]
struct BoundedResponse {
    status: StatusCode,
    retry_after: Option<Duration>,
    content_type: Option<String>,
    body: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RequestRetryPolicy {
    SingleAttempt,
    Transient,
}

impl RequestRetryPolicy {
    fn maximum_attempts(self) -> usize {
        match self {
            Self::SingleAttempt => 1,
            Self::Transient => MAX_ATTEMPTS,
        }
    }
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
            let mut headers = auth_headers();
            if inject_secret(&mut headers, &secret).is_err() {
                return;
            }
            // The local owner is already terminal. Remote cancellation is
            // deliberately best effort and never changes the local result.
            let _ = client.delete(task_url).headers(headers).send().await;
        });
    }
}

fn validate_provider_binding(app: &AppHandle, provider_id: &str) -> Result<(), ProxyError> {
    let provider = load_providers_sync(app)
        .map_err(|_| ProxyError::ProviderNotConfigured)?
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .ok_or(ProxyError::ProviderNotConfigured)?;
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

fn validate_common_text(value: &str, maximum: usize, label: &str) -> Result<(), ProxyError> {
    if value.trim().is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        return Err(ProxyError::Request(format!("invalid DashScope {label}")));
    }
    Ok(())
}

fn vision_reference_content(bytes: &[u8]) -> Result<Value, ProxyError> {
    if bytes.is_empty() || bytes.len() > MAX_VIDEO_BYTES {
        return Err(ProxyError::Request(
            "DashScope vision reference exceeds its byte limit".into(),
        ));
    }
    let (content_type, media_type) = match image::guess_format(bytes) {
        Ok(image::ImageFormat::Png) if bytes.len() <= MAX_VISION_IMAGE_BYTES => {
            ("image_url", "image/png")
        }
        Ok(image::ImageFormat::Jpeg) if bytes.len() <= MAX_VISION_IMAGE_BYTES => {
            ("image_url", "image/jpeg")
        }
        Ok(image::ImageFormat::WebP) if bytes.len() <= MAX_VISION_IMAGE_BYTES => {
            ("image_url", "image/webp")
        }
        _ if inspect_mp4(bytes).is_ok() => ("video_url", "video/mp4"),
        _ => {
            return Err(ProxyError::Request(
                "DashScope vision reference format is unsupported".into(),
            ))
        }
    };
    let url = format!(
        "data:{media_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
    Ok(if content_type == "image_url" {
        json!({ "type": "image_url", "image_url": { "url": url } })
    } else {
        json!({ "type": "video_url", "video_url": { "url": url } })
    })
}

async fn structured_json(
    app: AppHandle,
    provider_id: String,
    model: String,
    operation: &'static str,
    system: String,
    prompt: String,
    output_schema: Value,
    reference_image: Option<Vec<u8>>,
    host_context: MultimodalHostContext,
) -> Result<DashScopeStructuredTextResult, ProxyError> {
    let reference_content = match (operation, model.as_str(), reference_image.as_deref()) {
        ("structured-text", "qwen3.8-max", None) => None,
        ("vision-ocr", "qwen3-vl-plus", Some(bytes)) => {
            let expected = format!("artifact:sha256:{}", sha256(bytes));
            if host_context.accepted_reference_artifact_ids.as_slice() != [expected] {
                return Err(ProxyError::Request(
                    "DashScope vision reference does not match its signed Host context".into(),
                ));
            }
            Some(vision_reference_content(bytes)?)
        }
        _ => {
            return Err(ProxyError::Request(format!(
                "unsupported DashScope {operation} model contract"
            )))
        }
    };
    validate_common_text(&system, 200_000, &format!("{operation} system prompt"))?;
    validate_common_text(&prompt, 200_000, &format!("{operation} prompt"))?;
    let schema_bytes = serde_json::to_vec(&output_schema)
        .map_err(|_| ProxyError::Request("invalid structured output schema".into()))?;
    if schema_bytes.len() > 256 * 1024 || !output_schema.is_object() {
        return Err(ProxyError::Request(
            "invalid structured output schema".into(),
        ));
    }
    let replay = if let Some(commitment_hash) = host_context.held_out_commitment_hash.as_deref() {
        let node_id = host_context.node_id.as_deref().ok_or_else(|| {
            ProxyError::Request(
                "held-out multimodal receipt requires an exact native Plan node".into(),
            )
        })?;
        let slot_id = format!("multimodal:{node_id}");
        let request_hash = held_out_request_hash(&json!({
            "operation": operation,
            "providerId": provider_id,
            "model": model,
            "system": system,
            "prompt": prompt,
            "outputSchema": output_schema,
            "referenceImageSha256": reference_image.as_deref().map(sha256),
            "hostContext": host_context,
        }))?;
        if let Some(response) = recover_held_out_response(
            &app,
            commitment_hash,
            &host_context.run_id,
            &slot_id,
            &request_hash,
        )? {
            return Ok(response);
        }
        Some((commitment_hash.to_string(), slot_id, request_hash))
    } else {
        None
    };
    validate_provider_binding(&app, &provider_id)?;
    let started_at = unix_millis()?;
    let secret = read_secret(&provider_id).map_err(ProxyError::from)?;
    let user_content = reference_content.map_or_else(
        || Value::String(prompt.clone()),
        |reference| {
            json!([
                reference,
                { "type": "text", "text": prompt }
            ])
        },
    );
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user_content }
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": { "name": "cutout_output", "strict": true, "schema": output_schema }
        },
        "stream": false
    });
    let response = request_with_secret(
        "dashscope",
        Some(ProviderWireProtocol::ChatCompletions),
        DASHSCOPE_CHAT_ENDPOINT,
        "POST",
        HashMap::from([("content-type".into(), "application/json".into())]),
        Some(body.to_string()),
        &secret,
    )
    .await?;
    if !(200..300).contains(&response.status) {
        return Err(ProxyError::Request(format!(
            "DashScope structured-text request failed: HTTP {}",
            response.status
        )));
    }
    let envelope: Value = serde_json::from_str(&response.body)
        .map_err(|_| ProxyError::Request("invalid DashScope structured-text response".into()))?;
    let content = envelope
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| ProxyError::Request("invalid DashScope structured-text response".into()))?;
    let decoded: Value = serde_json::from_str(content)
        .map_err(|_| ProxyError::Request("DashScope returned malformed structured JSON".into()))?;
    let validator = jsonschema::JSONSchema::compile(&output_schema)
        .map_err(|_| ProxyError::Request("invalid structured output schema".into()))?;
    if !validator.is_valid(&decoded) {
        return Err(ProxyError::Request(
            "DashScope structured JSON did not match the requested schema".into(),
        ));
    }
    let bytes = serde_json::to_vec(&decoded)
        .map_err(|_| ProxyError::Request("could not encode structured JSON".into()))?;
    if bytes.is_empty() || bytes.len() > MAX_JSON_BYTES {
        return Err(ProxyError::Request(
            "DashScope structured JSON exceeded byte limit".into(),
        ));
    }
    let receipt = issue_receipt(
        &host_context,
        &provider_id,
        &model,
        operation,
        artifact_evidence(&bytes, "application/json", None, None),
        started_at,
        unix_millis()?,
        None,
    )?;
    let result = DashScopeStructuredTextResult {
        media_type: "application/json".into(),
        data: base64::engine::general_purpose::STANDARD.encode(bytes),
        receipt,
    };
    if let Some((commitment_hash, slot_id, request_hash)) = replay {
        return settle_held_out_response(
            &app,
            &commitment_hash,
            &host_context.run_id,
            &slot_id,
            &request_hash,
            &result.receipt.receipt_hash,
            &result,
        );
    }
    Ok(result)
}

fn auth_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert("x-dashscope-async", HeaderValue::from_static("enable"));
    headers
}

fn inject_secret(headers: &mut HeaderMap, secret: &str) -> Result<(), ProxyError> {
    let mut auth =
        HeaderValue::from_str(&format!("Bearer {secret}")).map_err(|_| ProxyError::BadHeader)?;
    auth.set_sensitive(true);
    headers.insert(AUTHORIZATION, auth);
    Ok(())
}

fn is_retryable(status: StatusCode) -> bool {
    status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

fn retry_delay(attempt: usize, retry_after: Option<Duration>) -> Duration {
    retry_after
        .unwrap_or_else(|| Duration::from_millis(250 * (1_u64 << attempt.min(4))))
        .min(Duration::from_secs(5))
}

fn normalize_wan27_seed(seed: i64) -> Result<u32, ProxyError> {
    if !(0..=WAN27_MAXIMUM_SEED).contains(&seed) {
        return Err(ProxyError::Request(
            "invalid DashScope image-to-video seed".into(),
        ));
    }
    Ok(seed as u32)
}

fn validate_video_contract(
    model: &str,
    resolution: &str,
    ratio: &str,
    duration_seconds: u64,
    seed: Option<i64>,
    host_context: &MultimodalHostContext,
) -> Result<(), ProxyError> {
    if model == WAN27_IMAGE_TO_VIDEO_MODEL {
        if resolution != "1080P"
            || ratio != "16:9"
            || duration_seconds != 5
            || host_context.accepted_reference_artifact_ids.len() != 1
            || host_context.lock_ids.is_empty()
        {
            return Err(ProxyError::Request(
                "invalid DashScope image-to-video reference contract".into(),
            ));
        }
        let seed = seed
            .ok_or_else(|| ProxyError::Request("invalid DashScope image-to-video seed".into()))?;
        normalize_wan27_seed(seed)?;
        return Ok(());
    }
    if model != "wan2.6-t2v"
        || !matches!(resolution, "720P" | "1080P")
        || ratio != "16:9"
        || duration_seconds != 5
        || seed.is_some()
    {
        return Err(ProxyError::Request(
            "unsupported DashScope video contract".into(),
        ));
    }
    if !host_context.accepted_reference_artifact_ids.is_empty() {
        return Err(ProxyError::Request(
            "DashScope text-to-video cannot discard accepted image references".into(),
        ));
    }
    Ok(())
}

fn validate_video_reference(
    model: &str,
    reference_image: Option<&[u8]>,
    host_context: &MultimodalHostContext,
) -> Result<(), ProxyError> {
    if model != WAN27_IMAGE_TO_VIDEO_MODEL {
        if reference_image.is_some() {
            return Err(ProxyError::Request(
                "DashScope text-to-video cannot accept reference image bytes".into(),
            ));
        }
        return Ok(());
    }
    let bytes = reference_image.ok_or_else(|| {
        ProxyError::Request("DashScope image-to-video requires retained reference bytes".into())
    })?;
    if bytes.is_empty() || bytes.len() > MAX_REFERENCE_IMAGE_BYTES {
        return Err(ProxyError::Request(
            "DashScope image-to-video reference bytes exceed the bounded contract".into(),
        ));
    }
    let expected = host_context
        .accepted_reference_artifact_ids
        .first()
        .ok_or_else(|| ProxyError::Request("missing accepted image artifact".into()))?;
    if expected
        != &format!(
            "artifact:sha256:{}",
            super::multimodal_receipt::sha256(bytes)
        )
    {
        return Err(ProxyError::Request(
            "DashScope image-to-video reference bytes do not match the accepted artifact".into(),
        ));
    }
    Ok(())
}

fn image_extension_and_media_type(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("png", "image/png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some(("jpg", "image/jpeg"))
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("webp", "image/webp"))
    } else {
        None
    }
}

fn validate_upload_policy(policy: &DashScopeUploadPolicy) -> Result<(), ProxyError> {
    let parsed = reqwest::Url::parse(&policy.upload_host).map_err(|_| ProxyError::BadUrl)?;
    let host = parsed.host_str().ok_or(ProxyError::BadUrl)?;
    let oss_host =
        host.ends_with(".aliyuncs.com") && (host.contains(".oss-") || host.starts_with("oss-"));
    let safe_directory = policy.upload_dir.starts_with("dashscope-instant/")
        && policy.upload_dir.len() <= 1024
        && !policy.upload_dir.split('/').any(|segment| segment == "..")
        && policy
            .upload_dir
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'_' | b'.'));
    let safe_field = |value: &str| {
        !value.is_empty() && value.len() <= 8 * 1024 && !value.chars().any(char::is_control)
    };
    if parsed.scheme() != "https"
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !oss_host
        || !safe_directory
        || !safe_field(&policy.oss_access_key_id)
        || !safe_field(&policy.signature)
        || !safe_field(&policy.policy)
        || !safe_field(&policy.x_oss_object_acl)
        || !safe_field(&policy.x_oss_forbid_overwrite)
    {
        return Err(ProxyError::Request(
            "invalid DashScope temporary upload policy".into(),
        ));
    }
    enforce_host("dashscope", &policy.upload_host)
}

async fn upload_reference_image(secret: &str, bytes: &[u8]) -> Result<String, ProxyError> {
    let (extension, media_type) = image_extension_and_media_type(bytes).ok_or_else(|| {
        ProxyError::Request("invalid DashScope image-to-video reference image".into())
    })?;
    let policy_url =
        format!("{DASHSCOPE_UPLOAD_ENDPOINT}?action=getPolicy&model={WAN27_IMAGE_TO_VIDEO_MODEL}");
    let mut policy_headers = HeaderMap::new();
    inject_secret(&mut policy_headers, secret)?;
    policy_headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    let response = request_bounded(
        Method::GET,
        &policy_url,
        &policy_headers,
        None,
        MAX_JSON_BYTES,
        RequestRetryPolicy::Transient,
    )
    .await?;
    if !response.status.is_success() {
        return Err(ProxyError::Request(format!(
            "DashScope upload policy request failed: HTTP {}",
            response.status.as_u16()
        )));
    }
    let envelope: DashScopeUploadPolicyEnvelope = serde_json::from_slice(&response.body)
        .map_err(|_| ProxyError::Request("invalid DashScope upload policy response".into()))?;
    let policy = envelope.data;
    validate_upload_policy(&policy)?;
    let digest = super::multimodal_receipt::sha256(bytes);
    let filename = format!("{digest}.{extension}");
    let object_key = format!("{}/{}", policy.upload_dir.trim_end_matches('/'), filename);
    let part = Part::bytes(bytes.to_vec())
        .file_name(filename)
        .mime_str(media_type)
        .map_err(|_| ProxyError::Request("invalid reference image media type".into()))?;
    let form = Form::new()
        .text("OSSAccessKeyId", policy.oss_access_key_id)
        .text("Signature", policy.signature)
        .text("policy", policy.policy)
        .text("x-oss-object-acl", policy.x_oss_object_acl)
        .text("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite)
        .text("key", object_key.clone())
        .text("success_action_status", "200")
        .part("file", part);
    let target = enforce_resolved_host("dashscope", &policy.upload_host).await?;
    let client = build_client_for_target(Some(120), &target)?;
    let upload = client
        .post(&policy.upload_host)
        .multipart(form)
        .send()
        .await
        .map_err(|error| ProxyError::Request(request_error_message(&error)))?;
    if !upload.status().is_success() {
        return Err(ProxyError::Request(format!(
            "DashScope reference upload failed: HTTP {}",
            upload.status().as_u16()
        )));
    }
    let object_url = format!("oss://{object_key}");
    if !object_url.starts_with("oss://dashscope-instant/") || object_url.len() > 2_048 {
        return Err(ProxyError::Request(
            "invalid DashScope temporary object binding".into(),
        ));
    }
    Ok(object_url)
}

async fn read_bounded_response(
    response: reqwest::Response,
    maximum: usize,
) -> Result<BoundedResponse, ProxyError> {
    if response
        .content_length()
        .is_some_and(|length| length > maximum as u64)
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
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|_| ProxyError::Request("provider response body failed".into()))?;
        if body.len().saturating_add(chunk.len()) > maximum {
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

async fn request_bounded(
    method: Method,
    url: &str,
    headers: &HeaderMap,
    body: Option<&Value>,
    maximum: usize,
    retry_policy: RequestRetryPolicy,
) -> Result<BoundedResponse, ProxyError> {
    enforce_host("dashscope", url)?;
    let target = enforce_resolved_host("dashscope", url).await?;
    let client = build_client_for_target(Some(120), &target)?;
    let maximum_attempts = retry_policy.maximum_attempts();
    for attempt in 0..maximum_attempts {
        let mut request = client.request(method.clone(), url).headers(headers.clone());
        if let Some(body) = body {
            request = request.json(body);
        }
        match request.send().await {
            Ok(response) => {
                let response = read_bounded_response(response, maximum).await?;
                if response.status.is_success()
                    || !is_retryable(response.status)
                    || attempt + 1 == maximum_attempts
                {
                    return Ok(response);
                }
                tokio::time::sleep(retry_delay(attempt, response.retry_after)).await;
            }
            Err(error) if attempt + 1 < maximum_attempts && !error.is_builder() => {
                tokio::time::sleep(retry_delay(attempt, None)).await;
            }
            Err(error) => return Err(ProxyError::Request(request_error_message(&error))),
        }
    }
    Err(ProxyError::Request(
        "DashScope retry budget exhausted".into(),
    ))
}

fn parse_task(body: &[u8]) -> Result<(String, String, Option<String>), ProxyError> {
    let value: Value = serde_json::from_slice(body)
        .map_err(|_| ProxyError::Request("invalid DashScope video response".into()))?;
    let output = value
        .get("output")
        .and_then(Value::as_object)
        .ok_or_else(|| ProxyError::Request("invalid DashScope video response".into()))?;
    let task_id = output
        .get("task_id")
        .and_then(Value::as_str)
        .ok_or_else(|| ProxyError::Request("invalid DashScope video task id".into()))?;
    uuid::Uuid::parse_str(task_id)
        .map_err(|_| ProxyError::Request("invalid DashScope video task id".into()))?;
    let status = output
        .get("task_status")
        .and_then(Value::as_str)
        .unwrap_or("PENDING");
    if !matches!(
        status,
        "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED"
    ) {
        return Err(ProxyError::Request(
            "unknown DashScope video task status".into(),
        ));
    }
    let url = output
        .get("video_url")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            output
                .get("results")
                .and_then(Value::as_array)
                .and_then(|results| results.first())
                .and_then(|result| result.get("url"))
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    Ok((task_id.to_string(), status.to_string(), url))
}

fn enforce_result_url(url: &str) -> Result<(), ProxyError> {
    let parsed = reqwest::Url::parse(url).map_err(|_| ProxyError::BadUrl)?;
    let host = parsed.host_str().ok_or(ProxyError::BadUrl)?;
    let labels = host.split('.').collect::<Vec<_>>();
    let allowed_host = matches!(labels.as_slice(), [result, region, "aliyuncs", "com"]
        if result.strip_prefix("dashscope-result-").is_some_and(|value| !value.is_empty())
            && region.strip_prefix("oss-cn-").is_some_and(|value| !value.is_empty()));
    if parsed.scheme() != "https"
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !allowed_host
    {
        return Err(ProxyError::DisallowedHost);
    }
    enforce_host("dashscope", url)
}

fn inspect_mp4(bytes: &[u8]) -> Result<MultimodalArtifactEvidence, ProxyError> {
    let size = bytes.len() as u64;
    let mut reader = Mp4Reader::read_header(Cursor::new(bytes), size)
        .map_err(|_| ProxyError::Request("invalid DashScope MP4 container".into()))?;
    let mut video = None;
    let mut representative_samples = None;
    let mut audio_codec = None;
    for track in reader.tracks().values() {
        match track.track_type().ok() {
            Some(TrackType::Video) if video.is_none() => {
                let media = track
                    .media_type()
                    .map_err(|_| ProxyError::Request("unsupported DashScope video codec".into()))?;
                let codec = match media {
                    MediaType::H264 => "h264",
                    MediaType::H265 => "h265",
                    MediaType::VP9 => "vp9",
                    _ => {
                        return Err(ProxyError::Request(
                            "unsupported DashScope video codec".into(),
                        ))
                    }
                };
                let count = track.sample_count();
                if count == 0
                    || track.width() == 0
                    || track.height() == 0
                    || track.frame_rate() <= 0.0
                {
                    return Err(ProxyError::Request(
                        "invalid DashScope video sample table".into(),
                    ));
                }
                representative_samples = Some((track.track_id(), [1, count / 2 + 1, count]));
                video = Some((
                    track.width() as u32,
                    track.height() as u32,
                    track.frame_rate(),
                    codec,
                ));
            }
            Some(TrackType::Audio) => {
                if track.media_type().ok() == Some(MediaType::AAC) {
                    audio_codec = Some("aac".to_string());
                }
            }
            _ => {}
        }
    }
    let (width, height, frame_rate, video_codec) = video
        .ok_or_else(|| ProxyError::Request("DashScope MP4 has no supported video track".into()))?;
    let (track_id, sample_ids) = representative_samples
        .ok_or_else(|| ProxyError::Request("DashScope MP4 sample table is unavailable".into()))?;
    for sample_id in sample_ids {
        if reader
            .read_sample(track_id, sample_id)
            .ok()
            .flatten()
            .is_none_or(|sample| sample.bytes.is_empty())
        {
            return Err(ProxyError::Request(
                "invalid DashScope video samples".into(),
            ));
        }
    }
    let duration_ms = reader.duration().as_millis() as u64;
    if duration_ms == 0 {
        return Err(ProxyError::Request(
            "DashScope MP4 duration is invalid".into(),
        ));
    }
    let mut evidence = artifact_evidence(bytes, "video/mp4", Some(width), Some(height));
    evidence.duration_ms = Some(duration_ms);
    evidence.frame_rate = Some(frame_rate);
    evidence.video_codec = Some(video_codec.into());
    evidence.audio_codec = audio_codec;
    evidence.sample_tables_readable = Some(true);
    // Pure Rust container validation reads representative timed samples but
    // does not decode pixels. A later media QA owner may promote this only
    // after full playback/decode evidence.
    evidence.playback_verified = Some(false);
    Ok(evidence)
}

async fn video(
    app: AppHandle,
    provider_id: String,
    model: String,
    prompt: String,
    resolution: String,
    ratio: String,
    duration_seconds: u64,
    seed: Option<i64>,
    reference_image: Option<Vec<u8>>,
    host_context: MultimodalHostContext,
) -> Result<DashScopeVideoResult, ProxyError> {
    validate_common_text(&prompt, 200_000, "video prompt")?;
    validate_video_contract(
        &model,
        &resolution,
        &ratio,
        duration_seconds,
        seed,
        &host_context,
    )?;
    validate_video_reference(&model, reference_image.as_deref(), &host_context)?;
    let replay = if let Some(commitment_hash) = host_context.held_out_commitment_hash.as_deref() {
        let node_id = host_context.node_id.as_deref().ok_or_else(|| {
            ProxyError::Request(
                "held-out multimodal receipt requires an exact native Plan node".into(),
            )
        })?;
        let slot_id = format!("multimodal:{node_id}");
        let request_hash = held_out_request_hash(&json!({
            "operation": "video",
            "providerId": provider_id,
            "model": model,
            "prompt": prompt,
            "resolution": resolution,
            "ratio": ratio,
            "durationSeconds": duration_seconds,
            "seed": seed,
            "referenceImageSha256": reference_image.as_deref().map(sha256),
            "hostContext": host_context,
        }))?;
        if let Some(response) = recover_held_out_response(
            &app,
            commitment_hash,
            &host_context.run_id,
            &slot_id,
            &request_hash,
        )? {
            return Ok(response);
        }
        Some((commitment_hash.to_string(), slot_id, request_hash))
    } else {
        None
    };
    validate_provider_binding(&app, &provider_id)?;
    let started_at = unix_millis()?;
    let secret = read_secret(&provider_id).map_err(ProxyError::from)?;
    let mut headers = auth_headers();
    inject_secret(&mut headers, &secret)?;
    let image_to_video = model == WAN27_IMAGE_TO_VIDEO_MODEL;
    let reference_url = if image_to_video {
        Some(upload_reference_image(&secret, reference_image.as_deref().unwrap()).await?)
    } else {
        None
    };
    if image_to_video {
        headers.insert(
            "x-dashscope-ossresourceresolve",
            HeaderValue::from_static("enable"),
        );
    }
    let request = if let Some(reference_url) = reference_url {
        json!({
            "model": model,
            "input": {
                "prompt": prompt,
                "negative_prompt": "morphing, product identity drift, altered logo, changed color, added parts, text, captions, flicker, scene cuts",
                "media": [{ "type": "first_frame", "url": reference_url }]
            },
            "parameters": {
                "resolution": resolution,
                "ratio": ratio,
                "duration": duration_seconds,
                "seed": seed.unwrap(),
                "prompt_extend": false,
                "watermark": false
            }
        })
    } else {
        json!({
            "model": model,
            "input": { "prompt": prompt },
            "parameters": {
                "resolution": resolution,
                "ratio": ratio,
                "duration": duration_seconds,
                "prompt_extend": true,
                "watermark": false
            }
        })
    };
    let submitted = request_bounded(
        Method::POST,
        DASHSCOPE_VIDEO_ENDPOINT,
        &headers,
        Some(&request),
        MAX_JSON_BYTES,
        RequestRetryPolicy::SingleAttempt,
    )
    .await?;
    if !submitted.status.is_success() {
        return Err(ProxyError::Request(format!(
            "DashScope video request failed: HTTP {}",
            submitted.status.as_u16()
        )));
    }
    let (task_id, _, _) = parse_task(&submitted.body)?;
    let mut remote_cancel = RemoteTaskCancel::new(task_id.clone(), secret.clone());
    let mut result_url = None;
    for poll in 0..MAX_POLLS {
        if poll > 0 {
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
        let task_url = format!("{DASHSCOPE_TASK_ENDPOINT}/{task_id}");
        let response = request_bounded(
            Method::GET,
            &task_url,
            &headers,
            None,
            MAX_JSON_BYTES,
            RequestRetryPolicy::Transient,
        )
        .await?;
        if !response.status.is_success() {
            return Err(ProxyError::Request(format!(
                "DashScope video task failed: HTTP {}",
                response.status.as_u16()
            )));
        }
        let (_, status, url) = parse_task(&response.body)?;
        match status.as_str() {
            "SUCCEEDED" => {
                result_url = url;
                break;
            }
            "FAILED" | "CANCELED" => {
                return Err(ProxyError::Request("DashScope video task failed".into()))
            }
            _ => {}
        }
    }
    let result_url =
        result_url.ok_or_else(|| ProxyError::Request("DashScope video task timed out".into()))?;
    enforce_result_url(&result_url)?;
    let download = request_bounded(
        Method::GET,
        &result_url,
        &HeaderMap::new(),
        None,
        MAX_VIDEO_BYTES,
        RequestRetryPolicy::Transient,
    )
    .await?;
    if !download.status.is_success() {
        return Err(ProxyError::Request(format!(
            "DashScope video download failed: HTTP {}",
            download.status.as_u16()
        )));
    }
    if download.content_type.as_deref().is_some_and(|value| {
        let value = value.to_ascii_lowercase();
        !value.starts_with("video/mp4") && !value.starts_with("application/octet-stream")
    }) {
        return Err(ProxyError::Request(
            "invalid DashScope video content type".into(),
        ));
    }
    let artifact = inspect_mp4(&download.body)?;
    let receipt = issue_receipt(
        &host_context,
        &provider_id,
        &model,
        if image_to_video {
            "image-to-video"
        } else {
            "text-to-video"
        },
        artifact,
        started_at,
        unix_millis()?,
        Some(&task_id),
    )?;
    let result = DashScopeVideoResult {
        media_type: "video/mp4".into(),
        data: base64::engine::general_purpose::STANDARD.encode(download.body),
        receipt,
    };
    // Keep cancellation armed through download validation, receipt signing,
    // and result construction so a dropped/late workflow cannot publish.
    remote_cancel.disarm();
    if let Some((commitment_hash, slot_id, request_hash)) = replay {
        return settle_held_out_response(
            &app,
            &commitment_hash,
            &host_context.run_id,
            &slot_id,
            &request_hash,
            &result.receipt.receipt_hash,
            &result,
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn ai_dashscope_structured_text(
    app: AppHandle,
    cancellations: State<'_, AiProxyCancellationState>,
    request_id: Option<String>,
    provider_id: String,
    model: String,
    system: String,
    prompt: String,
    output_schema: Value,
    host_context: MultimodalHostContext,
) -> Result<DashScopeStructuredTextResult, ProxyError> {
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        tokio::time::timeout(
            Duration::from_secs(WORKFLOW_TIMEOUT_SECS),
            structured_json(
                app,
                provider_id,
                model,
                "structured-text",
                system,
                prompt,
                output_schema,
                None,
                host_context,
            ),
        )
        .await
        .map_err(|_| ProxyError::Request("DashScope structured-text workflow timed out".into()))?
    })
    .await
}

#[tauri::command]
pub async fn ai_dashscope_vision_json(
    app: AppHandle,
    cancellations: State<'_, AiProxyCancellationState>,
    request_id: Option<String>,
    provider_id: String,
    model: String,
    system: String,
    prompt: String,
    output_schema: Value,
    reference_image: Vec<u8>,
    host_context: MultimodalHostContext,
) -> Result<DashScopeStructuredTextResult, ProxyError> {
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        tokio::time::timeout(
            Duration::from_secs(WORKFLOW_TIMEOUT_SECS),
            structured_json(
                app,
                provider_id,
                model,
                "vision-ocr",
                system,
                prompt,
                output_schema,
                Some(reference_image),
                host_context,
            ),
        )
        .await
        .map_err(|_| ProxyError::Request("DashScope vision workflow timed out".into()))?
    })
    .await
}

#[tauri::command]
pub async fn ai_dashscope_video(
    app: AppHandle,
    cancellations: State<'_, AiProxyCancellationState>,
    request_id: Option<String>,
    provider_id: String,
    model: String,
    prompt: String,
    resolution: String,
    ratio: String,
    duration_seconds: u64,
    seed: Option<i64>,
    reference_image: Option<Vec<u8>>,
    host_context: MultimodalHostContext,
) -> Result<DashScopeVideoResult, ProxyError> {
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        tokio::time::timeout(
            Duration::from_secs(WORKFLOW_TIMEOUT_SECS),
            video(
                app,
                provider_id,
                model,
                prompt,
                resolution,
                ratio,
                duration_seconds,
                seed,
                reference_image,
                host_context,
            ),
        )
        .await
        .map_err(|_| ProxyError::Request("DashScope video workflow timed out".into()))?
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

    #[test]
    fn task_parser_rejects_unknown_and_malformed_states() {
        let pending = br#"{"output":{"task_id":"0385dc79-5ff8-4d82-bcb6-000000000000","task_status":"PENDING"}}"#;
        assert_eq!(parse_task(pending).unwrap().1, "PENDING");
        let unknown = br#"{"output":{"task_id":"0385dc79-5ff8-4d82-bcb6-000000000000","task_status":"QUEUED_FOREVER"}}"#;
        assert!(parse_task(unknown).is_err());
        assert!(parse_task(br#"{"output":{}}"#).is_err());
    }

    #[test]
    fn result_download_origin_is_closed() {
        assert!(enforce_result_url(
            "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/a.mp4?Expires=1"
        )
        .is_ok());
        assert!(enforce_result_url("https://evil.aliyuncs.com/a.mp4").is_err());
        assert!(enforce_result_url(
            "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com.evil.test/a.mp4"
        )
        .is_err());
    }

    #[test]
    fn transient_status_contract_is_bounded() {
        assert!(is_retryable(StatusCode::REQUEST_TIMEOUT));
        assert!(is_retryable(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable(StatusCode::BAD_GATEWAY));
        assert!(!is_retryable(StatusCode::BAD_REQUEST));
        assert!(retry_delay(99, Some(Duration::from_secs(100))) <= Duration::from_secs(5));
        assert_eq!(RequestRetryPolicy::SingleAttempt.maximum_attempts(), 1);
        assert_eq!(
            RequestRetryPolicy::Transient.maximum_attempts(),
            MAX_ATTEMPTS
        );
    }

    #[test]
    fn wan27_image_to_video_seed_range_is_inclusive_and_does_not_wrap() {
        assert_eq!(normalize_wan27_seed(0).unwrap(), 0);
        assert_eq!(
            normalize_wan27_seed(WAN27_MAXIMUM_SEED).unwrap(),
            i32::MAX as u32
        );
        assert!(normalize_wan27_seed(-1).is_err());
        assert!(normalize_wan27_seed(WAN27_MAXIMUM_SEED + 1).is_err());
    }

    #[test]
    fn wan27_image_to_video_requires_exact_retained_reference_bytes() {
        let reference = b"\x89PNG\r\n\x1a\nreference".to_vec();
        let context = MultimodalHostContext {
            request_id: "request:wan27".into(),
            run_id: "run:wan27".into(),
            held_out_commitment_hash: None,
            semantic_role: Some("product-video".into()),
            node_id: Some("outcome:product-video".into()),
            capability_id: Some("capability:image-to-video".into()),
            accepted_reference_artifact_ids: vec![format!(
                "artifact:sha256:{}",
                super::super::multimodal_receipt::sha256(&reference)
            )],
            lock_ids: vec!["lock:commerce-product-identity".into()],
        };
        assert!(validate_video_contract(
            WAN27_IMAGE_TO_VIDEO_MODEL,
            "1080P",
            "16:9",
            5,
            Some(388_708_715),
            &context,
        )
        .is_ok());
        assert!(
            validate_video_reference(WAN27_IMAGE_TO_VIDEO_MODEL, Some(&reference), &context,)
                .is_ok()
        );
        assert!(validate_video_reference(WAN27_IMAGE_TO_VIDEO_MODEL, None, &context).is_err());
        assert!(validate_video_reference(
            WAN27_IMAGE_TO_VIDEO_MODEL,
            Some(b"\x89PNG\r\n\x1a\ndrift"),
            &context,
        )
        .is_err());

        let mut missing_reference = context.clone();
        missing_reference.accepted_reference_artifact_ids.clear();
        assert!(format!(
            "{:?}",
            validate_video_contract(
                WAN27_IMAGE_TO_VIDEO_MODEL,
                "1080P",
                "16:9",
                5,
                Some(388_708_715),
                &missing_reference,
            )
            .unwrap_err()
        )
        .contains("reference contract"));

        let mut text_context = context;
        text_context.accepted_reference_artifact_ids.clear();
        assert!(validate_video_contract(
            WAN27_IMAGE_TO_VIDEO_MODEL,
            "1080P",
            "16:9",
            5,
            Some(WAN27_MAXIMUM_SEED + 1),
            &text_context,
        )
        .is_err());
        assert!(
            validate_video_contract("wan2.6-t2v", "1080P", "16:9", 5, None, &text_context,).is_ok()
        );
    }

    #[test]
    fn temporary_upload_policy_is_closed_to_reviewed_oss_hosts_and_namespace() {
        let policy = DashScopeUploadPolicy {
            upload_host: "https://dashscope-instant.oss-cn-beijing.aliyuncs.com".into(),
            upload_dir: "dashscope-instant/user/run".into(),
            oss_access_key_id: "temporary-access-key".into(),
            signature: "temporary-signature".into(),
            policy: "temporary-policy".into(),
            x_oss_object_acl: "private".into(),
            x_oss_forbid_overwrite: "true".into(),
        };
        assert!(validate_upload_policy(&policy).is_ok());

        let mut hostile = DashScopeUploadPolicy { ..policy };
        hostile.upload_host = "https://evil.example/upload".into();
        assert!(validate_upload_policy(&hostile).is_err());
        hostile.upload_host = "https://dashscope-instant.oss-cn-beijing.aliyuncs.com".into();
        hostile.upload_dir = "other-tenant/../../escape".into();
        assert!(validate_upload_policy(&hostile).is_err());
    }

    #[test]
    fn remote_task_cancellation_stays_armed_until_publication() {
        let mut cancellation = RemoteTaskCancel::new(
            "0385dc79-5ff8-4d82-bcb6-000000000000".into(),
            "test-secret".into(),
        );
        assert!(cancellation.armed);
        cancellation.disarm();
        assert!(!cancellation.armed);
    }

    #[test]
    fn malformed_mp4_is_rejected_before_receipt() {
        assert!(inspect_mp4(b"not an mp4").is_err());
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    #[ignore = "requires CUTOUT_MULTIMODAL_VIDEO_FIXTURE with retained real MP4 bytes"]
    async fn retained_video_passes_native_playback_promotion_when_fixture_is_supplied() {
        let path = std::env::var("CUTOUT_MULTIMODAL_VIDEO_FIXTURE")
            .expect("CUTOUT_MULTIMODAL_VIDEO_FIXTURE must name a retained real MP4");
        let bytes = std::fs::read(path).expect("read retained MP4 fixture");
        let artifact = inspect_mp4(&bytes).expect("inspect retained MP4 fixture");
        let context = MultimodalHostContext {
            request_id: "request:retained-video-smoke".into(),
            run_id: "run:retained-video-smoke".into(),
            held_out_commitment_hash: None,
            semantic_role: Some("product-video".into()),
            node_id: Some("outcome:commerce:product-video".into()),
            capability_id: Some("capability:video-generation".into()),
            accepted_reference_artifact_ids: vec![],
            lock_ids: vec!["lock:commerce-product-identity".into()],
        };
        let receipt = issue_receipt(
            &context,
            "provider:retained-video-smoke",
            "wan2.6-t2v",
            "text-to-video",
            artifact,
            1,
            2,
            None,
        )
        .expect("issue retained MP4 fixture receipt");
        let promoted =
            crate::commands::ai::multimodal_receipt::promote_multimodal_video_playback_inner(
                None,
                receipt,
                bytes.clone(),
            )
            .await
            .expect("promote retained MP4 fixture playback");
        assert_eq!(promoted.artifact.playback_verified, Some(true));
        assert_eq!(
            promoted
                .playback_promotion
                .as_ref()
                .map(|evidence| evidence.non_blank_frames),
            Some(3)
        );
        crate::commands::ai::multimodal_receipt::verify_multimodal_host_artifact(promoted, bytes)
            .await
            .expect("verify promoted retained MP4 fixture receipt");
    }
}
