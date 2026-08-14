//! Fixed-origin source-image ingestion for Commerce production evidence.
//!
//! This is not a general URL fetcher. It accepts only the reviewed competition
//! OSS origin/path, pins validated public DNS answers, disables redirects,
//! decodes bounded image bytes, and signs their exact fact/URL binding.

use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::StreamExt;
use image::GenericImageView;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, State};

use super::ai_proxy::{
    build_client_for_target, enforce_resolved_host, run_cancellable_proxy_request,
    AiProxyCancellationState, ProxyError,
};
use super::commerce_held_out::{
    held_out_request_hash, recover_held_out_response, settle_held_out_response,
};
use super::multimodal_receipt::{sha256, sign_host_payload, verify_host_payload};

const REVIEWED_SOURCE_HOST: &str = "aib-innovation-oss.oss-accelerate.aliyuncs.com";
const REVIEWED_SOURCE_ORIGIN: &str = "https://aib-innovation-oss.oss-accelerate.aliyuncs.com";
const REVIEWED_SOURCE_PATH_PREFIX: &str = "/AI_Business/";
const MAX_SOURCE_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const SOURCE_TIMEOUT_SECS: u64 = 120;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommerceSourceIngestContext {
    request_id: String,
    run_id: String,
    #[serde(default)]
    held_out_commitment_hash: Option<String>,
    fact_id: String,
    source_file: String,
    source_pointer: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommerceSourceFetchPolicy {
    policy_id: String,
    origin: String,
    path_prefix: String,
    redirects: String,
    dns_binding: String,
    maximum_bytes: usize,
    timeout_ms: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommerceSourceIngestArtifact {
    artifact_id: String,
    sha256: String,
    media_type: String,
    byte_length: usize,
    decoded: bool,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommerceSourceIngestPayload {
    protocol: String,
    receipt_id: String,
    request_id: String,
    run_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    held_out_commitment_hash: Option<String>,
    fact_id: String,
    source_file: String,
    source_pointer: String,
    source_origin: String,
    source_path: String,
    source_url_sha256: String,
    fetch_policy: CommerceSourceFetchPolicy,
    status: String,
    artifact: CommerceSourceIngestArtifact,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommerceSourceIngestReceipt {
    protocol: String,
    receipt_id: String,
    receipt_hash: String,
    request_id: String,
    run_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    held_out_commitment_hash: Option<String>,
    fact_id: String,
    source_file: String,
    source_pointer: String,
    source_origin: String,
    source_path: String,
    source_url_sha256: String,
    fetch_policy: CommerceSourceFetchPolicy,
    status: String,
    artifact: CommerceSourceIngestArtifact,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl CommerceSourceIngestReceipt {
    pub(crate) fn run_id(&self) -> &str {
        &self.run_id
    }

    pub(crate) fn held_out_commitment_hash(&self) -> Option<&str> {
        self.held_out_commitment_hash.as_deref()
    }

    pub(crate) fn receipt_hash(&self) -> &str {
        &self.receipt_hash
    }

    pub(crate) fn started_at(&self) -> u64 {
        self.started_at
    }

    pub(crate) fn completed_at(&self) -> u64 {
        self.completed_at
    }

    pub(crate) fn binds_selected_source(
        &self,
        fact_id: &str,
        source_file: &str,
        source_pointer: &str,
        source_descriptor: &str,
    ) -> bool {
        reviewed_source_url(source_descriptor).is_ok_and(|url| {
            self.fact_id == fact_id
                && self.source_file == source_file
                && self.source_pointer == source_pointer
                && self.source_origin == REVIEWED_SOURCE_ORIGIN
                && self.source_path == url.path()
                && self.source_url_sha256 == sha256(source_descriptor.as_bytes())
        })
    }
}

impl CommerceSourceIngestReceipt {
    fn payload(&self) -> CommerceSourceIngestPayload {
        CommerceSourceIngestPayload {
            protocol: self.protocol.clone(),
            receipt_id: self.receipt_id.clone(),
            request_id: self.request_id.clone(),
            run_id: self.run_id.clone(),
            held_out_commitment_hash: self.held_out_commitment_hash.clone(),
            fact_id: self.fact_id.clone(),
            source_file: self.source_file.clone(),
            source_pointer: self.source_pointer.clone(),
            source_origin: self.source_origin.clone(),
            source_path: self.source_path.clone(),
            source_url_sha256: self.source_url_sha256.clone(),
            fetch_policy: self.fetch_policy.clone(),
            status: self.status.clone(),
            artifact: self.artifact.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommerceSourceIngestResult {
    receipt: CommerceSourceIngestReceipt,
    media_type: String,
    data: String,
}

fn unix_millis() -> Result<u64, ProxyError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| ProxyError::Request("system clock is unavailable".into()))
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_context(context: &CommerceSourceIngestContext) -> bool {
    [&context.request_id, &context.run_id, &context.fact_id]
        .iter()
        .all(|value| {
            !value.is_empty() && value.len() <= 240 && !value.chars().any(char::is_control)
        })
        && context
            .held_out_commitment_hash
            .as_deref()
            .is_none_or(valid_hash)
        && !context.source_file.is_empty()
        && context.source_file.len() <= 512
        && !context.source_file.starts_with('/')
        && !context
            .source_file
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        && context.source_pointer.starts_with('/')
        && context.source_pointer.len() <= 2_000
        && !context.source_pointer.chars().any(char::is_control)
}

fn reviewed_source_url(value: &str) -> Result<reqwest::Url, ProxyError> {
    let parsed = reqwest::Url::parse(value).map_err(|_| ProxyError::BadUrl)?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(REVIEWED_SOURCE_HOST)
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !parsed.path().starts_with(REVIEWED_SOURCE_PATH_PREFIX)
        || parsed.path().len() <= REVIEWED_SOURCE_PATH_PREFIX.len()
    {
        return Err(ProxyError::DisallowedHost);
    }
    Ok(parsed)
}

fn artifact(bytes: &[u8]) -> Result<CommerceSourceIngestArtifact, ProxyError> {
    if bytes.is_empty() || bytes.len() > MAX_SOURCE_IMAGE_BYTES {
        return Err(ProxyError::Request(
            "Commerce source image exceeds its byte limit".into(),
        ));
    }
    let media_type = match image::guess_format(bytes) {
        Ok(image::ImageFormat::Png) => "image/png",
        Ok(image::ImageFormat::Jpeg) => "image/jpeg",
        Ok(image::ImageFormat::WebP) => "image/webp",
        _ => {
            return Err(ProxyError::Request(
                "Commerce source image format is unsupported".into(),
            ))
        }
    };
    let decoded = image::load_from_memory(bytes)
        .map_err(|_| ProxyError::Request("Commerce source image could not be decoded".into()))?;
    let (width, height) = decoded.dimensions();
    if width == 0 || height == 0 {
        return Err(ProxyError::Request(
            "Commerce source image dimensions are invalid".into(),
        ));
    }
    let digest = sha256(bytes);
    Ok(CommerceSourceIngestArtifact {
        artifact_id: format!("artifact:sha256:{digest}"),
        sha256: digest,
        media_type: media_type.into(),
        byte_length: bytes.len(),
        decoded: true,
        width,
        height,
    })
}

fn issue_receipt(
    context: CommerceSourceIngestContext,
    source_url: &str,
    parsed: &reqwest::Url,
    artifact: CommerceSourceIngestArtifact,
    started_at: u64,
    completed_at: u64,
) -> Result<CommerceSourceIngestReceipt, ProxyError> {
    if !valid_context(&context) || completed_at < started_at {
        return Err(ProxyError::Request(
            "Commerce source ingest context is invalid".into(),
        ));
    }
    let payload = CommerceSourceIngestPayload {
        protocol: "cutout.commerce-source-ingest-receipt.v1".into(),
        receipt_id: format!(
            "receipt:commerce-source-ingest:{}",
            uuid::Uuid::new_v4().simple()
        ),
        request_id: context.request_id,
        run_id: context.run_id,
        held_out_commitment_hash: context.held_out_commitment_hash,
        fact_id: context.fact_id,
        source_file: context.source_file,
        source_pointer: context.source_pointer,
        source_origin: REVIEWED_SOURCE_ORIGIN.into(),
        source_path: parsed.path().into(),
        source_url_sha256: sha256(source_url.as_bytes()),
        fetch_policy: CommerceSourceFetchPolicy {
            policy_id: "qianwen-commerce-product-image-source.v1".into(),
            origin: REVIEWED_SOURCE_ORIGIN.into(),
            path_prefix: REVIEWED_SOURCE_PATH_PREFIX.into(),
            redirects: "disabled".into(),
            dns_binding: "public-resolved-and-pinned".into(),
            maximum_bytes: MAX_SOURCE_IMAGE_BYTES,
            timeout_ms: SOURCE_TIMEOUT_SECS * 1_000,
        },
        status: "succeeded".into(),
        artifact,
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    let receipt = CommerceSourceIngestReceipt {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash,
        request_id: payload.request_id,
        run_id: payload.run_id,
        held_out_commitment_hash: payload.held_out_commitment_hash,
        fact_id: payload.fact_id,
        source_file: payload.source_file,
        source_pointer: payload.source_pointer,
        source_origin: payload.source_origin,
        source_path: payload.source_path,
        source_url_sha256: payload.source_url_sha256,
        fetch_policy: payload.fetch_policy,
        status: payload.status,
        artifact: payload.artifact,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    };
    Ok(receipt)
}

pub(crate) fn verify_receipt(
    receipt: &CommerceSourceIngestReceipt,
    bytes: &[u8],
) -> Result<CommerceSourceIngestReceipt, ProxyError> {
    let expected_artifact = artifact(bytes)?;
    if receipt.protocol != "cutout.commerce-source-ingest-receipt.v1"
        || receipt.source_origin != REVIEWED_SOURCE_ORIGIN
        || !receipt.source_path.starts_with(REVIEWED_SOURCE_PATH_PREFIX)
        || receipt.fetch_policy.policy_id != "qianwen-commerce-product-image-source.v1"
        || receipt.fetch_policy.origin != REVIEWED_SOURCE_ORIGIN
        || receipt.fetch_policy.path_prefix != REVIEWED_SOURCE_PATH_PREFIX
        || receipt.fetch_policy.redirects != "disabled"
        || receipt.fetch_policy.dns_binding != "public-resolved-and-pinned"
        || receipt.fetch_policy.maximum_bytes != MAX_SOURCE_IMAGE_BYTES
        || receipt.fetch_policy.timeout_ms != SOURCE_TIMEOUT_SECS * 1_000
        || receipt.status != "succeeded"
        || receipt.artifact != expected_artifact
        || receipt.completed_at < receipt.started_at
    {
        return Err(ProxyError::Request(
            "Commerce source ingest receipt binding is invalid".into(),
        ));
    }
    verify_host_payload(
        &receipt.payload(),
        &receipt.receipt_hash,
        &receipt.signature,
    )?;
    Ok(receipt.clone())
}

#[tauri::command]
pub async fn ai_ingest_competition_source_image(
    app: AppHandle,
    cancellations: State<'_, AiProxyCancellationState>,
    request_id: Option<String>,
    operation_request_id: String,
    run_id: String,
    held_out_commitment_hash: Option<String>,
    fact_id: String,
    source_file: String,
    source_pointer: String,
    source_url: String,
) -> Result<CommerceSourceIngestResult, ProxyError> {
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        let replay = if let Some(commitment_hash) = held_out_commitment_hash.as_deref() {
            let slot_id = format!("source-ingest:{fact_id}");
            let request_hash = held_out_request_hash(&json!({
                "operation": "commerce-source-ingest",
                "requestId": operation_request_id,
                "runId": run_id,
                "factId": fact_id,
                "sourceFile": source_file,
                "sourcePointer": source_pointer,
                "sourceUrlSha256": sha256(source_url.as_bytes()),
            }))?;
            if let Some(response) =
                recover_held_out_response(&app, commitment_hash, &run_id, &slot_id, &request_hash)?
            {
                return Ok(response);
            }
            Some((commitment_hash.to_string(), slot_id, request_hash))
        } else {
            None
        };
        let started_at = unix_millis()?;
        let parsed = reviewed_source_url(&source_url)?;
        let context = CommerceSourceIngestContext {
            request_id: operation_request_id,
            run_id: run_id.clone(),
            held_out_commitment_hash,
            fact_id,
            source_file,
            source_pointer,
        };
        if !valid_context(&context) {
            return Err(ProxyError::Request(
                "Commerce source ingest context is invalid".into(),
            ));
        }
        let target = enforce_resolved_host("dashscope", &source_url).await?;
        let client = build_client_for_target(Some(SOURCE_TIMEOUT_SECS), &target)?;
        let response = client
            .get(parsed.clone())
            .send()
            .await
            .map_err(|_| ProxyError::Request("Commerce source image request failed".into()))?;
        if response.status() != StatusCode::OK {
            return Err(ProxyError::Request(format!(
                "Commerce source image request failed with HTTP {}",
                response.status().as_u16()
            )));
        }
        let declared = response.content_length();
        if declared.is_some_and(|length| length == 0 || length > MAX_SOURCE_IMAGE_BYTES as u64) {
            return Err(ProxyError::Request(
                "Commerce source image exceeds its byte limit".into(),
            ));
        }
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|_| ProxyError::Request("Commerce source image body failed".into()))?;
            if bytes.len().saturating_add(chunk.len()) > MAX_SOURCE_IMAGE_BYTES {
                return Err(ProxyError::Request(
                    "Commerce source image exceeds its byte limit".into(),
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        let artifact = artifact(&bytes)?;
        let receipt = issue_receipt(
            context,
            &source_url,
            &parsed,
            artifact.clone(),
            started_at,
            unix_millis()?,
        )?;
        let result = CommerceSourceIngestResult {
            receipt,
            media_type: artifact.media_type,
            data: base64::engine::general_purpose::STANDARD.encode(bytes),
        };
        if let Some((commitment_hash, slot_id, request_hash)) = replay {
            return settle_held_out_response(
                &app,
                &commitment_hash,
                &run_id,
                &slot_id,
                &request_hash,
                &result.receipt.receipt_hash,
                &result,
            );
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn verify_commerce_source_ingest_receipt(
    receipt: CommerceSourceIngestReceipt,
    artifact_bytes: Vec<u8>,
) -> Result<CommerceSourceIngestReceipt, ProxyError> {
    verify_receipt(&receipt, &artifact_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reviewed_url_is_exact_and_does_not_broaden_to_arbitrary_fetch() {
        assert!(reviewed_source_url(
            "https://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/a/product.jpg?Expires=1&Signature=x"
        ).is_ok());
        for value in [
            "http://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/a.jpg",
            "https://evil.aliyuncs.com/AI_Business/a.jpg",
            "https://aib-innovation-oss.oss-accelerate.aliyuncs.com/other/a.jpg",
            "https://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/",
        ] {
            assert!(reviewed_source_url(value).is_err(), "{value}");
        }
    }

    #[test]
    fn receipt_rejects_url_and_byte_drift_before_signature_acceptance() {
        let bytes = {
            let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([1, 2, 3, 255]));
            let mut output = Vec::new();
            image::DynamicImage::ImageRgba8(image)
                .write_to(
                    &mut std::io::Cursor::new(&mut output),
                    image::ImageOutputFormat::Png,
                )
                .unwrap();
            output
        };
        let source_url = "https://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/a/product.png?Expires=1&Signature=x";
        let parsed = reviewed_source_url(source_url).unwrap();
        let receipt = issue_receipt(
            CommerceSourceIngestContext {
                request_id: "request:test".into(),
                run_id: "run:test".into(),
                held_out_commitment_hash: None,
                fact_id: "fact:media.image".into(),
                source_file: "product.json".into(),
                source_pointer: "/productImage/images/0".into(),
            },
            source_url,
            &parsed,
            artifact(&bytes).unwrap(),
            1,
            2,
        )
        .unwrap();
        assert!(verify_receipt(&receipt, &bytes).is_ok());
        let mut rebound = receipt.clone();
        rebound.source_path = "/AI_Business/b/product.png".into();
        assert!(verify_receipt(&rebound, &bytes).is_err());
        let mut changed = bytes.clone();
        changed.push(0);
        assert!(verify_receipt(&receipt, &changed).is_err());
        let mut rebound_commitment = receipt.clone();
        rebound_commitment.held_out_commitment_hash = Some("a".repeat(64));
        assert!(verify_receipt(&rebound_commitment, &bytes).is_err());
    }
}
