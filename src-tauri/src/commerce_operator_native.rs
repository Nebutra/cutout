use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{
    de::{self, SeqAccess, Visitor},
    Deserialize, Deserializer, Serialize,
};
use serde_json::{json, Value};
use std::fmt;
use std::io::{Read, Write};
use tauri::Manager;

use crate::commands::ai::{
    ai_proxy::AiProxyCancellationState,
    commerce_held_out::{
        assert_registered_held_out_execution, create_commerce_held_out_commitment_with_recovery,
        replay_database_path_for_app_data, verify_commerce_held_out_attestation,
        CommerceHeldOutChallengeSelection, CommerceHeldOutCommitment,
        CommerceHeldOutEvaluatorAttestation, CommerceHeldOutInputManifest,
    },
    commerce_source_ingest::{
        ai_ingest_competition_source_image, verify_commerce_source_ingest_receipt,
        CommerceSourceIngestReceipt,
    },
    dashscope_image::{ai_dashscope_image, DashScopeImageOperation},
    dashscope_multimodal::{
        ai_dashscope_structured_text, ai_dashscope_video, ai_dashscope_vision_json,
    },
    keys::{enable_commerce_operator_vault, key_status, store_commerce_operator_key},
    multimodal_receipt::{
        promote_multimodal_video_playback, verify_multimodal_host_artifact, MultimodalHostContext,
        MultimodalHostReceipt,
    },
    providers::load_providers,
};

const PROTOCOL: &str = "cutout.commerce-operator-native.v1";
const MAXIMUM_REQUEST_BYTES: u64 = 128 * 1024 * 1024;
const MAXIMUM_BINARY_BYTES: usize = 64 * 1024 * 1024;
const CREDENTIAL_SETUP_PROTOCOL: &str = "cutout.commerce-credential-setup.v1";
const COMMERCE_PROVIDER_ID: &str = "dashscope-qwen-image3";
const MAXIMUM_CREDENTIAL_SETUP_BYTES: u64 = 8 * 1024;

#[derive(Debug, PartialEq, Eq)]
struct BoundedBytes(Vec<u8>);

impl BoundedBytes {
    fn into_inner(self) -> Vec<u8> {
        self.0
    }
}

fn decode_base64_bounded(value: &str, maximum_bytes: usize) -> Result<Vec<u8>, &'static str> {
    let maximum_encoded_bytes = maximum_bytes.div_ceil(3).saturating_mul(4);
    if value.is_empty() || value.len() > maximum_encoded_bytes {
        return Err("encoded bytes exceed the native Commerce limit");
    }
    let bytes = BASE64
        .decode(value)
        .map_err(|_| "encoded bytes are not strict base64")?;
    if bytes.is_empty() || bytes.len() > maximum_bytes {
        return Err("decoded bytes exceed the native Commerce limit");
    }
    Ok(bytes)
}

impl<'de> Deserialize<'de> for BoundedBytes {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct BoundedBytesVisitor;

        impl<'de> Visitor<'de> for BoundedBytesVisitor {
            type Value = BoundedBytes;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a non-empty bounded byte array or strict base64 string")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                decode_base64_bounded(value, MAXIMUM_BINARY_BYTES)
                    .map(BoundedBytes)
                    .map_err(E::custom)
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                self.visit_str(&value)
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut bytes = Vec::with_capacity(
                    sequence
                        .size_hint()
                        .unwrap_or_default()
                        .min(MAXIMUM_BINARY_BYTES),
                );
                while let Some(byte) = sequence.next_element::<u8>()? {
                    if bytes.len() == MAXIMUM_BINARY_BYTES {
                        return Err(de::Error::custom(
                            "decoded bytes exceed the native Commerce limit",
                        ));
                    }
                    bytes.push(byte);
                }
                if bytes.is_empty() {
                    return Err(de::Error::custom("decoded bytes must not be empty"));
                }
                Ok(BoundedBytes(bytes))
            }
        }

        deserializer.deserialize_any(BoundedBytesVisitor)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeRequest {
    protocol: String,
    job_id: String,
    cancellation_id: Option<String>,
    command: NativeCommand,
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum NativeCommand {
    ProviderPreflight,
    CommitmentCreate,
    SourceIngest,
    SourceReceiptVerify,
    StructuredText,
    VisionJson,
    ImageEdit,
    ImageToVideo,
    ReceiptVerify,
    PlaybackPromote,
    AdmissionVerify,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeResponse {
    protocol: &'static str,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<NativeError>,
}

#[derive(Debug, Serialize)]
struct NativeError {
    code: &'static str,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CredentialSetupRequest {
    protocol: String,
    secret: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialSetupResponse {
    protocol: &'static str,
    configured: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProviderPreflightPayload {
    provider_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommitmentPayload {
    evaluator_challenge: CommerceHeldOutChallengeSelection,
    input_manifest: CommerceHeldOutInputManifest,
    retained_commitment: Option<CommerceHeldOutCommitment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceIngestPayload {
    operation_request_id: String,
    run_id: String,
    held_out_commitment_hash: String,
    fact_id: String,
    source_file: String,
    source_pointer: String,
    source_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StructuredTextPayload {
    provider_id: String,
    model: String,
    system: String,
    prompt: String,
    output_schema: Value,
    host_context: MultimodalHostContext,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VisionJsonPayload {
    provider_id: String,
    model: String,
    system: String,
    prompt: String,
    output_schema: Value,
    reference_image: BoundedBytes,
    host_context: MultimodalHostContext,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImagePayload {
    provider_id: String,
    model: String,
    operation: DashScopeImageOperation,
    prompt: String,
    images: Vec<BoundedBytes>,
    size: Option<String>,
    host_context: MultimodalHostContext,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VideoPayload {
    provider_id: String,
    model: String,
    prompt: String,
    resolution: String,
    ratio: String,
    duration_seconds: u64,
    seed: Option<i64>,
    reference_image: BoundedBytes,
    host_context: MultimodalHostContext,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactPayload {
    receipt: MultimodalHostReceipt,
    artifact_bytes: BoundedBytes,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceArtifactPayload {
    receipt: CommerceSourceIngestReceipt,
    artifact_bytes: BoundedBytes,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdmissionPayload {
    commitment: CommerceHeldOutCommitment,
    evaluator_attestation: CommerceHeldOutEvaluatorAttestation,
    rehearsal_bundle: Value,
}

fn valid_job_id(value: &str) -> bool {
    (16..=80).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn decode_payload<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|_| "native Commerce payload is invalid".into())
}

fn result_value<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|_| "native Commerce response is unavailable".into())
}

fn assert_execution_context(
    app: &tauri::AppHandle,
    context: &MultimodalHostContext,
) -> Result<(), String> {
    let commitment_hash = context
        .held_out_commitment_hash
        .as_deref()
        .ok_or_else(|| "native Commerce operation requires a held-out commitment".to_string())?;
    if context.semantic_role.as_deref().map_or(true, str::is_empty)
        || context.node_id.as_deref().map_or(true, str::is_empty)
        || context.capability_id.as_deref().map_or(true, str::is_empty)
    {
        return Err("native Commerce operation requires the exact frozen Plan context".into());
    }
    assert_registered_held_out_execution(app, commitment_hash, &context.run_id)
        .map_err(|error| error.to_string())
}

async fn dispatch(app: &tauri::AppHandle, request: NativeRequest) -> Result<Value, String> {
    if request.protocol != PROTOCOL || !valid_job_id(&request.job_id) {
        return Err("native Commerce request identity is invalid".into());
    }
    let cancellations = app.state::<AiProxyCancellationState>();
    match request.command {
        NativeCommand::ProviderPreflight => {
            let payload: ProviderPreflightPayload = decode_payload(request.payload)?;
            let providers = load_providers(app.clone())
                .await
                .map_err(|_| "Commerce Provider configuration is unavailable".to_string())?;
            let has_key = key_status(payload.provider_id)
                .await
                .map_err(|_| "Commerce Provider credential status is unavailable".to_string())?;
            result_value(json!({ "providers": providers, "hasKey": has_key }))
        }
        NativeCommand::CommitmentCreate => {
            let payload: CommitmentPayload = decode_payload(request.payload)?;
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|_| "held-out Commerce replay store is unavailable".to_string())?;
            let database_path =
                replay_database_path_for_app_data(&app_data).map_err(|error| error.to_string())?;
            result_value(
                create_commerce_held_out_commitment_with_recovery(
                    &database_path,
                    payload.evaluator_challenge,
                    payload.input_manifest,
                    payload.retained_commitment,
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::SourceIngest => {
            let payload: SourceIngestPayload = decode_payload(request.payload)?;
            assert_registered_held_out_execution(
                app,
                &payload.held_out_commitment_hash,
                &payload.run_id,
            )
            .map_err(|error| error.to_string())?;
            result_value(
                ai_ingest_competition_source_image(
                    app.clone(),
                    cancellations,
                    request.cancellation_id,
                    payload.operation_request_id,
                    payload.run_id,
                    Some(payload.held_out_commitment_hash),
                    payload.fact_id,
                    payload.source_file,
                    payload.source_pointer,
                    payload.source_url,
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::SourceReceiptVerify => {
            let payload: SourceArtifactPayload = decode_payload(request.payload)?;
            result_value(
                verify_commerce_source_ingest_receipt(
                    payload.receipt,
                    payload.artifact_bytes.into_inner(),
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::StructuredText => {
            let payload: StructuredTextPayload = decode_payload(request.payload)?;
            assert_execution_context(app, &payload.host_context)?;
            result_value(
                ai_dashscope_structured_text(
                    app.clone(),
                    cancellations,
                    request.cancellation_id,
                    payload.provider_id,
                    payload.model,
                    payload.system,
                    payload.prompt,
                    payload.output_schema,
                    payload.host_context,
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::VisionJson => {
            let payload: VisionJsonPayload = decode_payload(request.payload)?;
            assert_execution_context(app, &payload.host_context)?;
            result_value(
                ai_dashscope_vision_json(
                    app.clone(),
                    cancellations,
                    request.cancellation_id,
                    payload.provider_id,
                    payload.model,
                    payload.system,
                    payload.prompt,
                    payload.output_schema,
                    payload.reference_image.into_inner(),
                    payload.host_context,
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::ImageEdit => {
            let payload: ImagePayload = decode_payload(request.payload)?;
            assert_execution_context(app, &payload.host_context)?;
            if !matches!(payload.operation, DashScopeImageOperation::Edit) {
                return Err(
                    "Commerce operator accepts reference-conditioned image edit only".into(),
                );
            }
            result_value(
                ai_dashscope_image(
                    app.clone(),
                    cancellations,
                    request.cancellation_id,
                    payload.provider_id,
                    payload.operation,
                    payload.model,
                    payload.prompt,
                    payload
                        .images
                        .into_iter()
                        .map(BoundedBytes::into_inner)
                        .collect(),
                    payload.size,
                    Some(payload.host_context),
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::ImageToVideo => {
            let payload: VideoPayload = decode_payload(request.payload)?;
            assert_execution_context(app, &payload.host_context)?;
            result_value(
                ai_dashscope_video(
                    app.clone(),
                    cancellations,
                    request.cancellation_id,
                    payload.provider_id,
                    payload.model,
                    payload.prompt,
                    payload.resolution,
                    payload.ratio,
                    payload.duration_seconds,
                    payload.seed,
                    Some(payload.reference_image.into_inner()),
                    payload.host_context,
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::ReceiptVerify => {
            let payload: ArtifactPayload = decode_payload(request.payload)?;
            result_value(
                verify_multimodal_host_artifact(
                    payload.receipt,
                    payload.artifact_bytes.into_inner(),
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::PlaybackPromote => {
            let payload: ArtifactPayload = decode_payload(request.payload)?;
            let commitment_hash = payload.receipt.held_out_commitment_hash().ok_or_else(|| {
                "native Commerce playback requires a held-out commitment".to_string()
            })?;
            assert_registered_held_out_execution(app, commitment_hash, payload.receipt.run_id())
                .map_err(|error| error.to_string())?;
            result_value(
                promote_multimodal_video_playback(
                    app.clone(),
                    payload.receipt,
                    payload.artifact_bytes.into_inner(),
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
        NativeCommand::AdmissionVerify => {
            let payload: AdmissionPayload = decode_payload(request.payload)?;
            result_value(
                verify_commerce_held_out_attestation(
                    app.clone(),
                    payload.commitment,
                    payload.evaluator_attestation,
                    payload.rehearsal_bundle,
                )
                .await
                .map_err(|error| error.to_string())?,
            )
        }
    }
}

fn read_bounded_stdin() -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(MAXIMUM_REQUEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "native Commerce standard input is unavailable".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAXIMUM_REQUEST_BYTES {
        return Err("native Commerce request exceeds its input limit".into());
    }
    Ok(bytes)
}

fn decode_credential_setup(bytes: &[u8]) -> Result<CredentialSetupRequest, String> {
    let request: CredentialSetupRequest = serde_json::from_slice(bytes)
        .map_err(|_| "Commerce credential setup request is invalid".to_string())?;
    if request.protocol != CREDENTIAL_SETUP_PROTOCOL
        || request.secret.len() < 20
        || request.secret.len() > 4_096
        || !request.secret.starts_with("sk-")
        || request.secret.chars().any(char::is_whitespace)
        || request.secret.chars().any(char::is_control)
    {
        return Err("Commerce credential setup request is invalid".into());
    }
    Ok(request)
}

pub fn run_credential_setup() -> Result<(), String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(MAXIMUM_CREDENTIAL_SETUP_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Commerce credential setup input is unavailable".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAXIMUM_CREDENTIAL_SETUP_BYTES {
        return Err("Commerce credential setup request exceeds its input limit".into());
    }
    let request = decode_credential_setup(&bytes)?;
    store_commerce_operator_key(COMMERCE_PROVIDER_ID, &request.secret)
        .map_err(|_| "Commerce credential setup failed".to_string())?;
    let response = CredentialSetupResponse {
        protocol: CREDENTIAL_SETUP_PROTOCOL,
        configured: true,
    };
    serde_json::to_writer(std::io::stdout(), &response)
        .map_err(|_| "Commerce credential setup response is unavailable".to_string())?;
    std::io::stdout()
        .write_all(b"\n")
        .map_err(|_| "Commerce credential setup response is unavailable".to_string())?;
    Ok(())
}

pub fn run() -> Result<(), String> {
    enable_commerce_operator_vault();
    let bytes = read_bounded_stdin()?;
    let request: NativeRequest = serde_json::from_slice(&bytes)
        .map_err(|_| "native Commerce request is invalid".to_string())?;

    let mut context = crate::application_context();
    context.config_mut().app.windows.clear();
    let app = tauri::Builder::default()
        .manage(AiProxyCancellationState::default())
        .build(context)
        .map_err(|_| "native Commerce Host could not initialize".to_string())?;
    if !app.webview_windows().is_empty() {
        return Err("native Commerce Host window policy failed".into());
    }
    let handle = app.handle().clone();
    let response = match tauri::async_runtime::block_on(dispatch(&handle, request)) {
        Ok(result) => NativeResponse {
            protocol: PROTOCOL,
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(message) => NativeResponse {
            protocol: PROTOCOL,
            ok: false,
            result: None,
            error: Some(NativeError {
                code: "native-request-failed",
                message,
            }),
        },
    };
    let encoded = serde_json::to_vec(&response)
        .map_err(|_| "native Commerce response is unavailable".to_string())?;
    std::io::stdout()
        .write_all(&encoded)
        .map_err(|_| "native Commerce response could not be written".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_union_rejects_generic_commands_and_unknown_fields() {
        let generic = br#"{"protocol":"cutout.commerce-operator-native.v1","jobId":"job_0123456789abcdef","command":"provider-invoke","payload":{}}"#;
        assert!(serde_json::from_slice::<NativeRequest>(generic).is_err());
        let path = br#"{"protocol":"cutout.commerce-operator-native.v1","jobId":"job_0123456789abcdef","command":"provider-preflight","payload":{"providerId":"p"},"projectRoot":"/tmp"}"#;
        assert!(serde_json::from_slice::<NativeRequest>(path).is_err());
    }

    #[test]
    fn opaque_job_id_is_bounded() {
        assert!(valid_job_id("job_0123456789abcdef"));
        assert!(!valid_job_id("../job"));
        assert!(!valid_job_id(&"a".repeat(81)));
    }

    #[test]
    fn bounded_bytes_accept_number_arrays_and_strict_base64() {
        let array: BoundedBytes = serde_json::from_str("[0,1,2,255]").unwrap();
        let encoded: BoundedBytes = serde_json::from_str(r#""AAEC/w==""#).unwrap();
        assert_eq!(array, BoundedBytes(vec![0, 1, 2, 255]));
        assert_eq!(encoded, array);
    }

    #[test]
    fn bounded_bytes_reject_invalid_base64_and_values() {
        assert!(serde_json::from_str::<BoundedBytes>(r#""AAE*""#).is_err());
        assert!(serde_json::from_str::<BoundedBytes>("[]").is_err());
        assert!(serde_json::from_str::<BoundedBytes>("[256]").is_err());
    }

    #[test]
    fn base64_length_is_checked_before_and_after_decode() {
        assert!(decode_base64_bounded("AAEC", 2).is_err());
        assert!(decode_base64_bounded("AAAAA===", 8).is_err());
        assert!(decode_base64_bounded("", 8).is_err());
    }

    #[test]
    fn credential_setup_accepts_only_the_fixed_protocol_and_secret_shape() {
        let valid = serde_json::json!({
            "protocol": CREDENTIAL_SETUP_PROTOCOL,
            "secret": format!("sk-{}", "a".repeat(32)),
        });
        assert!(decode_credential_setup(&serde_json::to_vec(&valid).unwrap()).is_ok());
        for invalid in [
            serde_json::json!({
                "protocol": "other",
                "secret": format!("sk-{}", "a".repeat(32)),
            }),
            serde_json::json!({
                "protocol": CREDENTIAL_SETUP_PROTOCOL,
                "secret": "not-a-key",
            }),
            serde_json::json!({
                "protocol": CREDENTIAL_SETUP_PROTOCOL,
                "secret": format!("sk-{} x", "a".repeat(32)),
            }),
            serde_json::json!({
                "protocol": CREDENTIAL_SETUP_PROTOCOL,
                "secret": format!("sk-{}", "a".repeat(32)),
                "providerId": "other",
            }),
        ] {
            assert!(decode_credential_setup(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
    }
}
