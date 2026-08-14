//! Native execution and retained-evidence boundary for Game Asset generation.
//!
//! Renderer input may describe a run, but only this module owns the canonical
//! preview, single-use direct execution, exact Provider calls and the signed
//! authorization closure over their returned receipts and bytes.

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::future::Future;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops::FilterType, ColorType, GenericImageView};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

use super::ai_proxy::{run_cancellable_proxy_request, AiProxyCancellationState, ProxyError};
use super::dashscope_image::{self, DashScopeImageOperation, DashScopeImageResult};
use super::multimodal_receipt::{
    sha256, sign_host_payload, verify_host_payload, verify_receipt, MultimodalHostContext,
    MultimodalHostReceipt,
};

const PREVIEW_PROTOCOL: &str = "cutout.game-asset-generation-preview.v2";
const AUTHORIZATION_PROTOCOL: &str = "cutout.game-asset-generation-authorization.v2";
const ACCEPTANCE_PREVIEW_PROTOCOL: &str = "cutout.game-asset-semantic-acceptance-preview.v1";
const ACCEPTANCE_PROTOCOL: &str = "cutout.game-asset-semantic-acceptance.v1";
const PLAN_PROTOCOL: &str = "game-asset.plan.v1";
const MODELS: [&str; 2] = ["qwen-image-3.0", "qwen-image-3.0-pro"];
const MAX_ROLES: usize = 16;
const MAX_EVIDENCE: usize = 128;
const MAX_RETAINED_BYTES: usize = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 96 * 1024 * 1024;
const MAX_RETAINED_BASE64_CHARACTERS: usize = (MAX_RETAINED_BYTES / 3) * 4 + 4;
const MAX_OUTPUT_BASE64_CHARACTERS: usize = (MAX_OUTPUT_BYTES / 3) * 4 + 4;
const MAX_PROMPT_BYTES: usize = 40_000;
const PREVIEW_TTL_MS: u64 = 15 * 60 * 1_000;
const MAX_ACTIVE_PREVIEWS: usize = 32;
const MAX_REMEMBERED_ACCEPTANCES: usize = 1_024;
const ROLE_TIMEOUT_SECS: u64 = 600;
const RUN_TIMEOUT_SECS: u64 = ROLE_TIMEOUT_SECS * MAX_ROLES as u64;
const ALPHA_THRESHOLD: u8 = 8;
const CUTOUT_WHITE_THRESHOLD: u8 = 246;
const LEGACY_CUTOUT_IMPLEMENTATION: &str =
    "cutout-white-border-flood-matte-rust-image-0.23-v1";
const CUTOUT_IMPLEMENTATION: &str =
    "cutout-white-border-flood-matte-normalize-anchor-rust-image-0.23-v2";
const CUTOUT_SCALE_POLICY: &str = "contain-preserve-aspect";
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 100_000_000;

#[derive(Default)]
pub struct GameAssetGenerationState {
    previews: Mutex<HashMap<String, StoredPreview>>,
    semantic_acceptances: Mutex<SemanticAcceptanceState>,
}

#[derive(Default)]
struct SemanticAcceptanceState {
    previews: HashMap<String, StoredSemanticAcceptancePreview>,
    pending_receipts: HashSet<String>,
    accepted: VecDeque<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceReference {
    id: String,
    revision: String,
    content_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedEvidenceInput {
    reference: EvidenceReference,
    media_type: String,
    artifact_bytes_base64: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SchemaReference {
    id: String,
    version: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PixelSize {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnchorPoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GameRole {
    id: String,
    asset_id: String,
    action: String,
    direction: String,
    frame_index: u32,
    output_schema: SchemaReference,
    identity_lock: EvidenceReference,
    scale_lock: EvidenceReference,
    expected_alpha_size: PixelSize,
    anchor_lock: EvidenceReference,
    anchor: String,
    expected_anchor: AnchorPoint,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Delivery {
    format_id: String,
    frame_width: u32,
    frame_height: u32,
    columns: u32,
    rows: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GamePlan {
    version: String,
    id: String,
    asset_id: String,
    kind: String,
    view: String,
    art_direction_evidence: Vec<EvidenceReference>,
    reference_artifacts: Vec<EvidenceReference>,
    roles: Vec<GameRole>,
    delivery: Delivery,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RehearsalIdentity {
    id: String,
    revision: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RolePromptInput {
    role_id: String,
    prompt: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetGenerationPreviewInput {
    identity: RehearsalIdentity,
    run_id: String,
    provider_id: String,
    model: String,
    plan: Value,
    retained_evidence: Vec<RetainedEvidenceInput>,
    roles: Vec<RolePromptInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetGenerationPreview {
    protocol: String,
    plan_id: String,
    request_digest: String,
    run_id: String,
    game_plan_id: String,
    provider_id: String,
    model: String,
    role_ids: Vec<String>,
    reference_artifact_ids: Vec<String>,
    output_size: String,
    processor_implementation: String,
    expires_at: u64,
    execution_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredRoleRequest {
    role_id: String,
    request_id: String,
    prompt: String,
    prompt_hash: String,
    semantic_role: String,
    node_id: String,
    capability_id: String,
    accepted_reference_artifact_ids: Vec<String>,
    lock_ids: Vec<String>,
}

#[derive(Clone)]
struct StoredPreview {
    preview: GameAssetGenerationPreview,
    identity: RehearsalIdentity,
    plan: GamePlan,
    plan_value: Value,
    reference_bytes: Vec<Vec<u8>>,
    roles: Vec<StoredRoleRequest>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AlphaBounds {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PixelEvidence {
    implementation: String,
    alpha_threshold: u8,
    decoded_width: u32,
    decoded_height: u32,
    alpha_bounds: AlphaBounds,
    edge_contact: bool,
    anchor: AnchorPoint,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RasterProcessingEvidence {
    protocol: String,
    implementation: String,
    white_threshold: u8,
    background_alpha_max: u8,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
    output_byte_length: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_alpha_bounds: Option<AlphaBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    frame_size: Option<PixelSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    alpha_target: Option<PixelSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expected_anchor: Option<AnchorPoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    anchor_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scale_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resized_subject_size: Option<PixelSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    placement: Option<AlphaBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_alpha_bounds: Option<AlphaBounds>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthorizedRoleRequest {
    role_id: String,
    request_id: String,
    prompt: String,
    prompt_hash: String,
    semantic_role: String,
    node_id: String,
    capability_id: String,
    accepted_reference_artifact_ids: Vec<String>,
    lock_ids: Vec<String>,
    anchor_policy: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthorizedRoleOutput {
    role_id: String,
    receipt_id: String,
    receipt_hash: String,
    source_artifact_id: String,
    source_artifact_sha256: String,
    artifact_id: String,
    artifact_sha256: String,
    processing_evidence: RasterProcessingEvidence,
    pixel_evidence: PixelEvidence,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorizationPayload {
    protocol: String,
    receipt_id: String,
    plan_id: String,
    request_digest: String,
    execution_id: String,
    execution_mode: String,
    identity: RehearsalIdentity,
    run_id: String,
    provider_id: String,
    model: String,
    game_plan_id: String,
    game_plan_hash: String,
    output_size: String,
    processor_implementation: String,
    role_requests: Vec<AuthorizedRoleRequest>,
    outputs: Vec<AuthorizedRoleOutput>,
    status: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetGenerationAuthorization {
    protocol: String,
    receipt_id: String,
    receipt_hash: String,
    plan_id: String,
    request_digest: String,
    execution_id: String,
    execution_mode: String,
    identity: RehearsalIdentity,
    run_id: String,
    provider_id: String,
    model: String,
    game_plan_id: String,
    game_plan_hash: String,
    output_size: String,
    processor_implementation: String,
    role_requests: Vec<AuthorizedRoleRequest>,
    outputs: Vec<AuthorizedRoleOutput>,
    status: String,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticAcceptanceDecision {
    role_id: String,
    reference_continuity: String,
    role_readability: String,
    style_consistency: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetSemanticAcceptancePreview {
    protocol: String,
    preview_id: String,
    review_digest: String,
    generation_receipt_id: String,
    generation_receipt_hash: String,
    plan_id: String,
    run_id: String,
    role_ids: Vec<String>,
    artifact_ids: Vec<String>,
    expires_at: u64,
    requires_approval: bool,
}

#[derive(Clone)]
struct StoredSemanticAcceptancePreview {
    preview: GameAssetSemanticAcceptancePreview,
    authorization: GameAssetGenerationAuthorization,
    decisions: Vec<SemanticAcceptanceDecision>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SemanticAcceptancePayload {
    protocol: String,
    receipt_id: String,
    generation_receipt_id: String,
    generation_receipt_hash: String,
    plan_id: String,
    run_id: String,
    producer_id: String,
    reviewer_kind: String,
    approval_id: String,
    decisions: Vec<SemanticAcceptanceDecision>,
    outputs: Vec<AuthorizedRoleOutput>,
    accepted_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetSemanticAcceptance {
    protocol: String,
    receipt_id: String,
    receipt_hash: String,
    generation_receipt_id: String,
    generation_receipt_hash: String,
    plan_id: String,
    run_id: String,
    producer_id: String,
    reviewer_kind: String,
    approval_id: String,
    decisions: Vec<SemanticAcceptanceDecision>,
    outputs: Vec<AuthorizedRoleOutput>,
    accepted_at: u64,
    signature: String,
}

impl GameAssetSemanticAcceptance {
    fn payload(&self) -> SemanticAcceptancePayload {
        SemanticAcceptancePayload {
            protocol: self.protocol.clone(),
            receipt_id: self.receipt_id.clone(),
            generation_receipt_id: self.generation_receipt_id.clone(),
            generation_receipt_hash: self.generation_receipt_hash.clone(),
            plan_id: self.plan_id.clone(),
            run_id: self.run_id.clone(),
            producer_id: self.producer_id.clone(),
            reviewer_kind: self.reviewer_kind.clone(),
            approval_id: self.approval_id.clone(),
            decisions: self.decisions.clone(),
            outputs: self.outputs.clone(),
            accepted_at: self.accepted_at,
        }
    }
}

impl GameAssetGenerationAuthorization {
    fn payload(&self) -> AuthorizationPayload {
        AuthorizationPayload {
            protocol: self.protocol.clone(),
            receipt_id: self.receipt_id.clone(),
            plan_id: self.plan_id.clone(),
            request_digest: self.request_digest.clone(),
            execution_id: self.execution_id.clone(),
            execution_mode: self.execution_mode.clone(),
            identity: self.identity.clone(),
            run_id: self.run_id.clone(),
            provider_id: self.provider_id.clone(),
            model: self.model.clone(),
            game_plan_id: self.game_plan_id.clone(),
            game_plan_hash: self.game_plan_hash.clone(),
            output_size: self.output_size.clone(),
            processor_implementation: self.processor_implementation.clone(),
            role_requests: self.role_requests.clone(),
            outputs: self.outputs.clone(),
            status: self.status.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedRoleOutput {
    role_id: String,
    receipt: MultimodalHostReceipt,
    source_media_type: String,
    source_artifact_bytes_base64: String,
    media_type: String,
    artifact_bytes_base64: String,
    processing_evidence: RasterProcessingEvidence,
    pixel_evidence: PixelEvidence,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetGenerationApplyResult {
    status: String,
    outputs: Vec<RetainedRoleOutput>,
    authorization: Option<GameAssetGenerationAuthorization>,
    error: Option<String>,
}

fn unix_millis() -> Result<u64, ProxyError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| ProxyError::Request("system clock is unavailable".into()))
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && !value.chars().any(char::is_control)
        && !credential_shaped(value)
}

fn credential_shaped(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    if lower.contains("bearer ")
        || ["api_key=", "api-key=", "apikey=", "token=", "secret="]
            .iter()
            .any(|marker| lower.contains(marker))
    {
        return true;
    }
    value
        .split(|character: char| {
            character.is_whitespace() || matches!(character, ':' | '=' | ',' | ';')
        })
        .any(|token| {
            let normalized = token.trim_matches(|character: char| {
                matches!(character, '"' | '\'' | '(' | ')' | '[' | ']')
            });
            normalized.len() >= 11
                && ["sk-", "rk-", "pk-"]
                    .iter()
                    .any(|prefix| normalized.to_ascii_lowercase().starts_with(prefix))
        })
}

fn valid_prompt(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= MAX_PROMPT_BYTES
        && !value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\t'))
        && !credential_shaped(value)
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn canonical_hash<T: Serialize>(value: &T) -> Result<String, ProxyError> {
    canonicalize_json(
        serde_json::to_value(value).map_err(|_| {
            ProxyError::Request("could not canonicalize Game Asset evidence".into())
        })?,
    )
    .and_then(|value| {
        serde_json::to_vec(&value)
            .map_err(|_| ProxyError::Request("could not canonicalize Game Asset evidence".into()))
    })
    .map(|bytes| sha256(&bytes))
}

fn canonicalize_json(value: Value) -> Result<Value, ProxyError> {
    match value {
        Value::Array(values) => values
            .into_iter()
            .map(canonicalize_json)
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        Value::Object(values) => values
            .into_iter()
            .map(|(key, value)| canonicalize_json(value).map(|value| (key, value)))
            .collect::<Result<BTreeMap<_, _>, _>>()
            .and_then(|values| {
                serde_json::to_value(values).map_err(|_| {
                    ProxyError::Request("could not canonicalize Game Asset evidence".into())
                })
            }),
        scalar => Ok(scalar),
    }
}

fn detect_media(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if serde_json::from_slice::<Value>(bytes).is_ok() {
        Some("application/json")
    } else {
        None
    }
}

fn decode_evidence(input: &RetainedEvidenceInput) -> Result<Vec<u8>, ProxyError> {
    if input.artifact_bytes_base64.len() > MAX_RETAINED_BASE64_CHARACTERS {
        return Err(ProxyError::Request(
            "Game Asset retained evidence exceeds its per-item encoded byte budget".into(),
        ));
    }
    let bytes = STANDARD.decode(&input.artifact_bytes_base64).map_err(|_| {
        ProxyError::Request("Game Asset retained evidence is not valid base64".into())
    })?;
    if bytes.is_empty()
        || sha256(&bytes) != input.reference.content_hash
        || detect_media(&bytes) != Some(input.media_type.as_str())
    {
        return Err(ProxyError::Request(
            "Game Asset retained evidence does not match its declared hash or media type".into(),
        ));
    }
    if input.reference.id.starts_with("artifact:sha256:")
        && input.reference.id != format!("artifact:sha256:{}", input.reference.content_hash)
    {
        return Err(ProxyError::Request(
            "Game Asset artifact reference is not content-addressed".into(),
        ));
    }
    Ok(bytes)
}

fn exact_references(plan: &GamePlan) -> Result<Vec<EvidenceReference>, ProxyError> {
    let mut references = BTreeMap::new();
    for reference in plan
        .art_direction_evidence
        .iter()
        .chain(plan.reference_artifacts.iter())
        .chain(
            plan.roles
                .iter()
                .flat_map(|role| [&role.identity_lock, &role.scale_lock, &role.anchor_lock]),
        )
    {
        let key = format!("{}@{}", reference.id, reference.revision);
        if references
            .insert(key.clone(), reference.clone())
            .is_some_and(|prior: EvidenceReference| prior.content_hash != reference.content_hash)
        {
            return Err(ProxyError::Request(format!(
                "Game Asset plan has conflicting evidence references: {key}"
            )));
        }
    }
    Ok(references.into_values().collect())
}

fn role_locks(
    plan_hash: &str,
    plan: &GamePlan,
    role: &GameRole,
) -> Result<Vec<String>, ProxyError> {
    let mut references = BTreeMap::new();
    for reference in plan
        .art_direction_evidence
        .iter()
        .chain(plan.reference_artifacts.iter())
        .chain([&role.identity_lock, &role.scale_lock, &role.anchor_lock])
    {
        references.insert(
            format!("{}@{}", reference.id, reference.revision),
            reference,
        );
    }
    let mut locks = vec![format!("game-asset-plan:sha256:{plan_hash}")];
    for reference in references.into_values() {
        locks.push(format!(
            "game-asset-evidence:sha256:{}",
            canonical_hash(reference)?
        ));
    }
    Ok(locks)
}

fn validate_plan(plan: &GamePlan) -> Result<(), ProxyError> {
    if plan.version != PLAN_PROTOCOL
        || !valid_id(&plan.id)
        || !valid_id(&plan.asset_id)
        || !matches!(
            plan.kind.as_str(),
            "player" | "npc" | "creature" | "prop" | "fx" | "projectile" | "impact" | "layered-map"
        )
        || !matches!(plan.view.as_str(), "topdown" | "side" | "three-quarter")
        || plan.art_direction_evidence.is_empty()
        || plan.reference_artifacts.is_empty()
        || plan.reference_artifacts.len() > 3
        || plan.roles.is_empty()
        || plan.roles.len() > MAX_ROLES
        || plan.delivery.frame_width == 0
        || plan.delivery.frame_height == 0
        || u64::from(plan.delivery.frame_width) * u64::from(plan.delivery.frame_height) < 512 * 512
        || u64::from(plan.delivery.frame_width) * u64::from(plan.delivery.frame_height)
            > 2048 * 2048
        || u64::from(plan.delivery.frame_width) > u64::from(plan.delivery.frame_height) * 8
        || u64::from(plan.delivery.frame_height) > u64::from(plan.delivery.frame_width) * 8
        || u64::from(plan.delivery.columns) * u64::from(plan.delivery.rows)
            < plan.roles.len() as u64
    {
        return Err(ProxyError::Request(
            "Game Asset generation plan is outside the bounded native contract".into(),
        ));
    }
    let mut roles = HashSet::new();
    for role in &plan.roles {
        if !valid_id(&role.id)
            || role.asset_id != plan.asset_id
            || role.output_schema.id != "game-asset.frame"
            || role.output_schema.version != 1
            || !matches!(
                role.anchor.as_str(),
                "center" | "bottom" | "feet" | "ignition-baseline"
            )
            || role.expected_alpha_size.width == 0
            || role.expected_alpha_size.height == 0
            || role.expected_alpha_size.width > plan.delivery.frame_width
            || role.expected_alpha_size.height > plan.delivery.frame_height
            || !role.expected_anchor.x.is_finite()
            || !role.expected_anchor.y.is_finite()
            || role.expected_anchor.x < 0.0
            || role.expected_anchor.y < 0.0
            || role.expected_anchor.x > f64::from(plan.delivery.frame_width)
            || role.expected_anchor.y > f64::from(plan.delivery.frame_height)
            || !roles.insert(role.id.as_str())
        {
            return Err(ProxyError::Request(
                "Game Asset role closure is invalid".into(),
            ));
        }
    }
    for reference in exact_references(plan)? {
        if !valid_id(&reference.id)
            || !valid_id(&reference.revision)
            || !valid_hash(&reference.content_hash)
        {
            return Err(ProxyError::Request(
                "Game Asset evidence reference is invalid".into(),
            ));
        }
    }
    Ok(())
}

fn preview_request(
    input: GameAssetGenerationPreviewInput,
    now: u64,
) -> Result<StoredPreview, ProxyError> {
    if !MODELS.contains(&input.model.as_str())
        || !valid_id(&input.identity.id)
        || !valid_id(&input.identity.revision)
        || !valid_id(&input.run_id)
        || !valid_id(&input.provider_id)
        || input.retained_evidence.is_empty()
        || input.retained_evidence.len() > MAX_EVIDENCE
    {
        return Err(ProxyError::Request(
            "Game Asset generation preview identity or route is invalid".into(),
        ));
    }
    let plan: GamePlan = serde_json::from_value(input.plan.clone())
        .map_err(|_| ProxyError::Request("Game Asset generation plan is invalid".into()))?;
    validate_plan(&plan)?;
    let expected = exact_references(&plan)?;
    let mut evidence = input.retained_evidence;
    evidence.sort_by(|left, right| {
        (&left.reference.id, &left.reference.revision)
            .cmp(&(&right.reference.id, &right.reference.revision))
    });
    if evidence.len() != expected.len()
        || evidence
            .iter()
            .zip(&expected)
            .any(|(actual, expected)| actual.reference != *expected)
    {
        return Err(ProxyError::Request(
            "Game Asset retained evidence does not close over the exact plan".into(),
        ));
    }
    let mut decoded = Vec::with_capacity(evidence.len());
    let mut retained_bytes = 0_usize;
    for item in &evidence {
        let bytes = decode_evidence(item)?;
        retained_bytes = retained_bytes.checked_add(bytes.len()).ok_or_else(|| {
            ProxyError::Request("Game Asset retained evidence byte accounting overflowed".into())
        })?;
        if retained_bytes > MAX_RETAINED_BYTES {
            return Err(ProxyError::Request(
                "Game Asset retained evidence exceeds its byte budget".into(),
            ));
        }
        decoded.push(bytes);
    }
    let evidence_bytes = evidence
        .iter()
        .zip(decoded)
        .map(|(item, bytes)| {
            (
                format!("{}@{}", item.reference.id, item.reference.revision),
                bytes,
            )
        })
        .collect::<BTreeMap<_, _>>();
    let reference_bytes = plan
        .reference_artifacts
        .iter()
        .map(|reference| {
            let key = format!("{}@{}", reference.id, reference.revision);
            let bytes = evidence_bytes.get(&key).cloned().ok_or_else(|| {
                ProxyError::Request("Game Asset image reference bytes are missing".into())
            })?;
            if !reference.id.starts_with("artifact:sha256:")
                || !matches!(
                    detect_media(&bytes),
                    Some("image/png" | "image/jpeg" | "image/webp")
                )
            {
                return Err(ProxyError::Request(
                    "Game Asset generation references must be retained content-addressed images"
                        .into(),
                ));
            }
            Ok(bytes)
        })
        .collect::<Result<Vec<_>, ProxyError>>()?;
    let prompts = input
        .roles
        .into_iter()
        .map(|role| (role.role_id, role.prompt))
        .collect::<BTreeMap<_, _>>();
    if prompts.len() != plan.roles.len()
        || plan
            .roles
            .iter()
            .any(|role| !prompts.contains_key(&role.id))
    {
        return Err(ProxyError::Request(
            "Game Asset role prompts do not match the exact plan closure".into(),
        ));
    }
    let plan_hash = canonical_hash(&input.plan)?;
    let accepted_reference_artifact_ids = plan
        .reference_artifacts
        .iter()
        .map(|reference| reference.id.clone())
        .collect::<Vec<_>>();
    let roles = plan
        .roles
        .iter()
        .map(|role| {
            let prompt = prompts.get(&role.id).cloned().unwrap_or_default();
            if !valid_prompt(&prompt) {
                return Err(ProxyError::Request(
                    "Game Asset role prompt is invalid".into(),
                ));
            }
            Ok(StoredRoleRequest {
                role_id: role.id.clone(),
                request_id: format!("request:game-asset:{}", uuid::Uuid::new_v4().simple()),
                prompt_hash: sha256(prompt.as_bytes()),
                prompt,
                semantic_role: role.id.clone(),
                node_id: format!("node:game-asset-frame:{}", role.id),
                capability_id: "capability:image-generation".into(),
                accepted_reference_artifact_ids: accepted_reference_artifact_ids.clone(),
                lock_ids: role_locks(&plan_hash, &plan, role)?,
            })
        })
        .collect::<Result<Vec<_>, ProxyError>>()?;
    let output_size = format!(
        "{}x{}",
        plan.delivery.frame_width, plan.delivery.frame_height
    );
    let digest_value = serde_json::json!({
        "identity": input.identity,
        "runId": input.run_id,
        "providerId": input.provider_id,
        "model": input.model,
        "plan": input.plan,
        "retainedEvidence": evidence.iter().map(|item| serde_json::json!({
            "reference": item.reference,
            "mediaType": item.media_type,
            "byteLength": evidence_bytes.get(&format!("{}@{}", item.reference.id, item.reference.revision)).map(Vec::len).unwrap_or(0),
        })).collect::<Vec<_>>(),
        "roles": roles,
        "outputSize": output_size,
        "processorImplementation": CUTOUT_IMPLEMENTATION,
    });
    let request_digest = canonical_hash(&digest_value)?;
    let plan_id = format!("game-asset-preview:sha256:{request_digest}");
    Ok(StoredPreview {
        preview: GameAssetGenerationPreview {
            protocol: PREVIEW_PROTOCOL.into(),
            plan_id,
            request_digest,
            run_id: input.run_id,
            game_plan_id: plan.id.clone(),
            provider_id: input.provider_id,
            model: input.model,
            role_ids: plan.roles.iter().map(|role| role.id.clone()).collect(),
            reference_artifact_ids: accepted_reference_artifact_ids,
            output_size,
            processor_implementation: CUTOUT_IMPLEMENTATION.into(),
            expires_at: now + PREVIEW_TTL_MS,
            execution_mode: "byok-direct".into(),
        },
        identity: input.identity,
        plan,
        plan_value: input.plan,
        reference_bytes,
        roles,
    })
}

fn decode_bounded_image(bytes: &[u8]) -> Result<image::DynamicImage, ProxyError> {
    let dimensions = image::io::Reader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| ProxyError::Request("Game Asset output pixels could not be decoded".into()))?
        .into_dimensions()
        .map_err(|_| ProxyError::Request("Game Asset output pixels could not be decoded".into()))?;
    if dimensions.0 == 0
        || dimensions.1 == 0
        || dimensions.0 > MAX_IMAGE_DIMENSION
        || dimensions.1 > MAX_IMAGE_DIMENSION
        || u64::from(dimensions.0) * u64::from(dimensions.1) > MAX_IMAGE_PIXELS
    {
        return Err(ProxyError::Request(
            "Game Asset output dimensions exceed the decoded pixel budget".into(),
        ));
    }
    image::load_from_memory(bytes)
        .map_err(|_| ProxyError::Request("Game Asset output pixels could not be decoded".into()))
}

fn is_cutout_background_pixel(rgba: &[u8], index: usize) -> bool {
    let offset = index * 4;
    rgba[offset + 3] < ALPHA_THRESHOLD
        || (rgba[offset] >= CUTOUT_WHITE_THRESHOLD
            && rgba[offset + 1] >= CUTOUT_WHITE_THRESHOLD
            && rgba[offset + 2] >= CUTOUT_WHITE_THRESHOLD)
}

fn enqueue_cutout_background(rgba: &[u8], index: usize, seen: &mut [bool], queue: &mut Vec<usize>) {
    if seen[index] {
        return;
    }
    seen[index] = true;
    if is_cutout_background_pixel(rgba, index) {
        queue.push(index);
    }
}

fn unpremultiply_white(channel: u8, alpha: u8) -> u8 {
    let recovered =
        (f64::from(channel) * 255.0 - 255.0 * (255.0 - f64::from(alpha))) / f64::from(alpha);
    recovered.round().clamp(0.0, 255.0) as u8
}

fn soften_cutout_edges(rgba: &mut [u8], background: &[bool], width: usize, height: usize) {
    if width < 3 || height < 3 {
        return;
    }
    for y in 1..height - 1 {
        for x in 1..width - 1 {
            let index = y * width + x;
            if background[index]
                || !(background[index - 1]
                    || background[index + 1]
                    || background[index - width]
                    || background[index + width])
            {
                continue;
            }
            let offset = index * 4;
            let red = 255.0 - f64::from(rgba[offset]);
            let green = 255.0 - f64::from(rgba[offset + 1]);
            let blue = 255.0 - f64::from(rgba[offset + 2]);
            let distance = (red * red + green * green + blue * blue).sqrt();
            let t = ((distance - 24.0) / (96.0 - 24.0)).clamp(0.0, 1.0);
            let smooth = t * t * (3.0 - 2.0 * t);
            let alpha = rgba[offset + 3].min((smooth * 255.0).round().clamp(1.0, 255.0) as u8);
            rgba[offset + 3] = alpha;
            if alpha < 250 {
                rgba[offset] = unpremultiply_white(rgba[offset], alpha);
                rgba[offset + 1] = unpremultiply_white(rgba[offset + 1], alpha);
                rgba[offset + 2] = unpremultiply_white(rgba[offset + 2], alpha);
            }
        }
    }
}

fn matte_cutout(source_bytes: &[u8]) -> Result<image::RgbaImage, ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let mut rgba = image.to_rgba8().into_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let size = width_usize.checked_mul(height_usize).ok_or_else(|| {
        ProxyError::Request("Game Asset output pixel accounting overflowed".into())
    })?;
    let mut seen = vec![false; size];
    let mut background = vec![false; size];
    let mut queue = Vec::with_capacity(size);
    let last_row = (height_usize - 1) * width_usize;
    for x in 0..width_usize {
        enqueue_cutout_background(&rgba, x, &mut seen, &mut queue);
        enqueue_cutout_background(&rgba, last_row + x, &mut seen, &mut queue);
    }
    for y in 0..height_usize {
        enqueue_cutout_background(&rgba, y * width_usize, &mut seen, &mut queue);
        enqueue_cutout_background(
            &rgba,
            y * width_usize + width_usize - 1,
            &mut seen,
            &mut queue,
        );
    }
    let mut head = 0;
    while head < queue.len() {
        let index = queue[head];
        head += 1;
        background[index] = true;
        let x = index % width_usize;
        let y = index / width_usize;
        if x > 0 {
            enqueue_cutout_background(&rgba, index - 1, &mut seen, &mut queue);
        }
        if x + 1 < width_usize {
            enqueue_cutout_background(&rgba, index + 1, &mut seen, &mut queue);
        }
        if y > 0 {
            enqueue_cutout_background(&rgba, index - width_usize, &mut seen, &mut queue);
        }
        if y + 1 < height_usize {
            enqueue_cutout_background(&rgba, index + width_usize, &mut seen, &mut queue);
        }
    }
    for (index, is_background) in background.iter().enumerate() {
        if *is_background {
            rgba[index * 4 + 3] = 0;
        }
    }
    soften_cutout_edges(&mut rgba, &background, width_usize, height_usize);
    image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
        ProxyError::Request("Game Asset cutout pixels could not be reconstructed".into())
    })
}

fn alpha_bounds_from_rgba(image: &image::RgbaImage) -> Result<AlphaBounds, ProxyError> {
    let (width, height) = image.dimensions();
    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel.0[3] > ALPHA_THRESHOLD {
            found = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }
    if !found {
        return Err(ProxyError::Request(
            "Game Asset output contains no retained alpha pixels".into(),
        ));
    }
    Ok(AlphaBounds {
        x: min_x,
        y: min_y,
        width: max_x - min_x + 1,
        height: max_y - min_y + 1,
    })
}

fn anchor_for_bounds(
    bounds: &AlphaBounds,
    anchor_policy: &str,
) -> Result<AnchorPoint, ProxyError> {
    match anchor_policy {
        "center" => Ok(AnchorPoint {
            x: f64::from(bounds.x) + f64::from(bounds.width) / 2.0,
            y: f64::from(bounds.y) + f64::from(bounds.height) / 2.0,
        }),
        "bottom" | "feet" => Ok(AnchorPoint {
            x: f64::from(bounds.x) + f64::from(bounds.width) / 2.0,
            y: f64::from(bounds.y + bounds.height),
        }),
        "ignition-baseline" => Ok(AnchorPoint {
            x: f64::from(bounds.x),
            y: f64::from(bounds.y) + f64::from(bounds.height) / 2.0,
        }),
        _ => Err(ProxyError::Request(
            "Game Asset anchor policy is unsupported".into(),
        )),
    }
}

fn encode_cutout_png(image: &image::RgbaImage) -> Result<Vec<u8>, ProxyError> {
    let mut output_bytes = Vec::new();
    image::codecs::png::PngEncoder::new(&mut output_bytes)
        .encode(
            image.as_raw(),
            image.width(),
            image.height(),
            ColorType::Rgba8,
        )
        .map_err(|_| ProxyError::Request("Game Asset cutout PNG could not be encoded".into()))?;
    Ok(output_bytes)
}

fn contain_subject_size(source: &AlphaBounds, target: &PixelSize) -> PixelSize {
    let source_width = u64::from(source.width);
    let source_height = u64::from(source.height);
    let target_width = u64::from(target.width);
    let target_height = u64::from(target.height);
    if target_width * source_height <= target_height * source_width {
        PixelSize {
            width: target.width,
            height: ((source_height * target_width + source_width / 2) / source_width)
                .clamp(1, target_height) as u32,
        }
    } else {
        PixelSize {
            width: ((source_width * target_height + source_height / 2) / source_height)
                .clamp(1, target_width) as u32,
            height: target.height,
        }
    }
}

fn deterministic_cutout_legacy(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let image = matte_cutout(source_bytes)?;
    let output_bytes = encode_cutout_png(&image)?;
    let output_artifact_sha256 = sha256(&output_bytes);
    let output_artifact_id = format!("artifact:sha256:{output_artifact_sha256}");
    let evidence = RasterProcessingEvidence {
        protocol: "cutout.game-asset-raster-processing.v1".into(),
        implementation: LEGACY_CUTOUT_IMPLEMENTATION.into(),
        white_threshold: CUTOUT_WHITE_THRESHOLD,
        background_alpha_max: ALPHA_THRESHOLD,
        source_artifact_id: source_artifact_id.into(),
        source_artifact_sha256: source_artifact_sha256.into(),
        output_artifact_id,
        output_artifact_sha256,
        output_byte_length: output_bytes.len(),
        source_alpha_bounds: None,
        frame_size: None,
        alpha_target: None,
        expected_anchor: None,
        anchor_policy: None,
        scale_policy: None,
        resized_subject_size: None,
        placement: None,
        output_alpha_bounds: None,
    };
    Ok((output_bytes, evidence))
}

fn deterministic_cutout(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    if frame_size.width == 0
        || frame_size.height == 0
        || alpha_target.width == 0
        || alpha_target.height == 0
        || alpha_target.width > frame_size.width
        || alpha_target.height > frame_size.height
        || !expected_anchor.x.is_finite()
        || !expected_anchor.y.is_finite()
    {
        return Err(ProxyError::Request(
            "Game Asset cutout normalization geometry is invalid".into(),
        ));
    }
    let matted = matte_cutout(source_bytes)?;
    let source_alpha_bounds = alpha_bounds_from_rgba(&matted)?;
    let cropped = image::imageops::crop_imm(
        &matted,
        source_alpha_bounds.x,
        source_alpha_bounds.y,
        source_alpha_bounds.width,
        source_alpha_bounds.height,
    )
    .to_image();
    let contained_size = contain_subject_size(&source_alpha_bounds, alpha_target);
    let resized = image::imageops::resize(
        &cropped,
        contained_size.width,
        contained_size.height,
        FilterType::Lanczos3,
    );
    let resized_alpha_bounds = alpha_bounds_from_rgba(&resized)?;
    let subject = image::imageops::crop_imm(
        &resized,
        resized_alpha_bounds.x,
        resized_alpha_bounds.y,
        resized_alpha_bounds.width,
        resized_alpha_bounds.height,
    )
    .to_image();
    let resized_subject_size = PixelSize {
        width: subject.width(),
        height: subject.height(),
    };
    if resized_subject_size.width > alpha_target.width
        || resized_subject_size.height > alpha_target.height
    {
        return Err(ProxyError::Request(
            "Game Asset normalized subject exceeds its planned alpha envelope".into(),
        ));
    }
    let local_bounds = AlphaBounds {
        x: 0,
        y: 0,
        width: subject.width(),
        height: subject.height(),
    };
    let local_anchor = anchor_for_bounds(&local_bounds, anchor_policy)?;
    let placement_x = (expected_anchor.x - local_anchor.x).round();
    let placement_y = (expected_anchor.y - local_anchor.y).round();
    if placement_x < 0.0
        || placement_y < 0.0
        || placement_x + f64::from(subject.width()) > f64::from(frame_size.width)
        || placement_y + f64::from(subject.height()) > f64::from(frame_size.height)
    {
        return Err(ProxyError::Request(
            "Game Asset normalized subject cannot fit at its planned anchor".into(),
        ));
    }
    let placement = AlphaBounds {
        x: placement_x as u32,
        y: placement_y as u32,
        width: subject.width(),
        height: subject.height(),
    };
    let mut canvas = image::RgbaImage::from_pixel(
        frame_size.width,
        frame_size.height,
        image::Rgba([0, 0, 0, 0]),
    );
    for (x, y, pixel) in subject.enumerate_pixels() {
        canvas.put_pixel(placement.x + x, placement.y + y, *pixel);
    }
    let output_alpha_bounds = alpha_bounds_from_rgba(&canvas)?;
    let output_anchor = anchor_for_bounds(&output_alpha_bounds, anchor_policy)?;
    if (output_anchor.x - expected_anchor.x).abs() > 0.5
        || (output_anchor.y - expected_anchor.y).abs() > 0.5
    {
        return Err(ProxyError::Request(
            "Game Asset normalized subject cannot satisfy its raster anchor".into(),
        ));
    }
    let output_bytes = encode_cutout_png(&canvas)?;
    let output_artifact_sha256 = sha256(&output_bytes);
    let output_artifact_id = format!("artifact:sha256:{output_artifact_sha256}");
    let evidence = RasterProcessingEvidence {
        protocol: "cutout.game-asset-raster-processing.v1".into(),
        implementation: CUTOUT_IMPLEMENTATION.into(),
        white_threshold: CUTOUT_WHITE_THRESHOLD,
        background_alpha_max: ALPHA_THRESHOLD,
        source_artifact_id: source_artifact_id.into(),
        source_artifact_sha256: source_artifact_sha256.into(),
        output_artifact_id,
        output_artifact_sha256,
        output_byte_length: output_bytes.len(),
        source_alpha_bounds: Some(source_alpha_bounds),
        frame_size: Some(frame_size.clone()),
        alpha_target: Some(alpha_target.clone()),
        expected_anchor: Some(expected_anchor.clone()),
        anchor_policy: Some(anchor_policy.into()),
        scale_policy: Some(CUTOUT_SCALE_POLICY.into()),
        resized_subject_size: Some(resized_subject_size),
        placement: Some(placement),
        output_alpha_bounds: Some(output_alpha_bounds),
    };
    Ok((output_bytes, evidence))
}

fn inspect_pixels(bytes: &[u8], anchor_policy: &str) -> Result<PixelEvidence, ProxyError> {
    let image = decode_bounded_image(bytes)?;
    let (decoded_width, decoded_height) = image.dimensions();
    let rgba = image.to_rgba8();
    let alpha_bounds = alpha_bounds_from_rgba(&rgba)?;
    let right = alpha_bounds.x + alpha_bounds.width;
    let bottom = alpha_bounds.y + alpha_bounds.height;
    let anchor = anchor_for_bounds(&alpha_bounds, anchor_policy)?;
    Ok(PixelEvidence {
        implementation: "rgba-alpha-bounds-v1".into(),
        alpha_threshold: ALPHA_THRESHOLD,
        decoded_width,
        decoded_height,
        edge_contact: alpha_bounds.x == 0
            || alpha_bounds.y == 0
            || right == decoded_width
            || bottom == decoded_height,
        alpha_bounds,
        anchor,
    })
}

fn issue_authorization(
    stored: &StoredPreview,
    execution_id: String,
    started_at: u64,
    outputs: &[RetainedRoleOutput],
    completed_at: u64,
) -> Result<GameAssetGenerationAuthorization, ProxyError> {
    let payload = AuthorizationPayload {
        protocol: AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-authorization:{}",
            uuid::Uuid::new_v4().simple()
        ),
        plan_id: stored.preview.plan_id.clone(),
        request_digest: stored.preview.request_digest.clone(),
        execution_id,
        execution_mode: "byok-direct".into(),
        identity: stored.identity.clone(),
        run_id: stored.preview.run_id.clone(),
        provider_id: stored.preview.provider_id.clone(),
        model: stored.preview.model.clone(),
        game_plan_id: stored.plan.id.clone(),
        game_plan_hash: canonical_hash(&stored.plan_value)?,
        output_size: stored.preview.output_size.clone(),
        processor_implementation: stored.preview.processor_implementation.clone(),
        role_requests: stored
            .roles
            .iter()
            .map(|role| {
                Ok(AuthorizedRoleRequest {
                    role_id: role.role_id.clone(),
                    request_id: role.request_id.clone(),
                    prompt: role.prompt.clone(),
                    prompt_hash: role.prompt_hash.clone(),
                    semantic_role: role.semantic_role.clone(),
                    node_id: role.node_id.clone(),
                    capability_id: role.capability_id.clone(),
                    accepted_reference_artifact_ids: role.accepted_reference_artifact_ids.clone(),
                    lock_ids: role.lock_ids.clone(),
                    anchor_policy: stored
                        .plan
                        .roles
                        .iter()
                        .find(|candidate| candidate.id == role.role_id)
                        .map(|candidate| candidate.anchor.clone())
                        .ok_or_else(|| {
                            ProxyError::Request(
                                "Game Asset role disappeared from its previewed plan".into(),
                            )
                        })?,
                })
            })
            .collect::<Result<Vec<_>, ProxyError>>()?,
        outputs: outputs
            .iter()
            .map(|output| AuthorizedRoleOutput {
                role_id: output.role_id.clone(),
                receipt_id: output.receipt.receipt_id.clone(),
                receipt_hash: output.receipt.receipt_hash.clone(),
                source_artifact_id: output.receipt.artifact.artifact_id.clone(),
                source_artifact_sha256: output.receipt.artifact.sha256.clone(),
                artifact_id: output.processing_evidence.output_artifact_id.clone(),
                artifact_sha256: output.processing_evidence.output_artifact_sha256.clone(),
                processing_evidence: output.processing_evidence.clone(),
                pixel_evidence: output.pixel_evidence.clone(),
            })
            .collect(),
        status: "succeeded".into(),
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetGenerationAuthorization {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash,
        plan_id: payload.plan_id,
        request_digest: payload.request_digest,
        execution_id: payload.execution_id,
        execution_mode: payload.execution_mode,
        identity: payload.identity,
        run_id: payload.run_id,
        provider_id: payload.provider_id,
        model: payload.model,
        game_plan_id: payload.game_plan_id,
        game_plan_hash: payload.game_plan_hash,
        output_size: payload.output_size,
        processor_implementation: payload.processor_implementation,
        role_requests: payload.role_requests,
        outputs: payload.outputs,
        status: payload.status,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

fn validate_semantic_decisions(
    authorization: &GameAssetGenerationAuthorization,
    decisions: &[SemanticAcceptanceDecision],
) -> Result<(), ProxyError> {
    if decisions.len() != authorization.role_requests.len()
        || decisions
            .iter()
            .zip(&authorization.role_requests)
            .any(|(decision, request)| {
                decision.role_id != request.role_id
                    || decision.reference_continuity != "accepted"
                    || decision.role_readability != "accepted"
                    || decision.style_consistency != "accepted"
            })
    {
        return Err(ProxyError::Request(
            "Game Asset semantic decisions must accept every exact authorized role".into(),
        ));
    }
    Ok(())
}

fn issue_semantic_acceptance(
    authorization: &GameAssetGenerationAuthorization,
    approval_id: String,
    decisions: Vec<SemanticAcceptanceDecision>,
    accepted_at: u64,
) -> Result<GameAssetSemanticAcceptance, ProxyError> {
    validate_semantic_decisions(authorization, &decisions)?;
    if accepted_at < authorization.completed_at {
        return Err(ProxyError::Request(
            "Game Asset semantic acceptance predates generation completion".into(),
        ));
    }
    let payload = SemanticAcceptancePayload {
        protocol: ACCEPTANCE_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-semantic-acceptance:{}",
            uuid::Uuid::new_v4().simple()
        ),
        generation_receipt_id: authorization.receipt_id.clone(),
        generation_receipt_hash: authorization.receipt_hash.clone(),
        plan_id: authorization.plan_id.clone(),
        run_id: authorization.run_id.clone(),
        producer_id: authorization.provider_id.clone(),
        reviewer_kind: "native-local-human".into(),
        approval_id,
        decisions,
        outputs: authorization.outputs.clone(),
        accepted_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetSemanticAcceptance {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash,
        generation_receipt_id: payload.generation_receipt_id,
        generation_receipt_hash: payload.generation_receipt_hash,
        plan_id: payload.plan_id,
        run_id: payload.run_id,
        producer_id: payload.producer_id,
        reviewer_kind: payload.reviewer_kind,
        approval_id: payload.approval_id,
        decisions: payload.decisions,
        outputs: payload.outputs,
        accepted_at: payload.accepted_at,
        signature,
    })
}

#[tauri::command]
pub fn preview_game_asset_generation(
    state: State<'_, GameAssetGenerationState>,
    input: GameAssetGenerationPreviewInput,
) -> Result<GameAssetGenerationPreview, ProxyError> {
    let now = unix_millis()?;
    let stored = preview_request(input, now)?;
    let preview = stored.preview.clone();
    let mut previews = state
        .previews
        .lock()
        .map_err(|_| ProxyError::Request("Game Asset preview state is unavailable".into()))?;
    previews.retain(|_, candidate| candidate.preview.expires_at > now);
    if previews.len() >= MAX_ACTIVE_PREVIEWS {
        return Err(ProxyError::Request(
            "Game Asset generation preview capacity is exhausted".into(),
        ));
    }
    previews.insert(preview.plan_id.clone(), stored);
    Ok(preview)
}

struct GameAssetRoleExecution {
    provider_id: String,
    model: String,
    prompt: String,
    reference_bytes: Vec<Vec<u8>>,
    output_size: String,
    context: MultimodalHostContext,
}

async fn execute_stored_preview<F, Fut>(
    stored: StoredPreview,
    mut execute_role: F,
) -> Result<GameAssetGenerationApplyResult, ProxyError>
where
    F: FnMut(GameAssetRoleExecution) -> Fut,
    Fut: Future<Output = Result<DashScopeImageResult, ProxyError>>,
{
    let execution_id = format!("execution:game-asset:{}", uuid::Uuid::new_v4().simple());
    let started_at = unix_millis()?;
    let run_started = tokio::time::Instant::now();
    let run_timeout = Duration::from_secs(RUN_TIMEOUT_SECS);
    let mut outputs = Vec::with_capacity(stored.roles.len());
    let mut output_bytes = 0_usize;
    for role in &stored.roles {
        let Some(remaining) = run_timeout.checked_sub(run_started.elapsed()) else {
            return Ok(GameAssetGenerationApplyResult {
                status: "partial".into(),
                outputs,
                authorization: None,
                error: Some("Game Asset generation exceeded its total run deadline".into()),
            });
        };
        let context = MultimodalHostContext {
            request_id: role.request_id.clone(),
            run_id: stored.preview.run_id.clone(),
            held_out_commitment_hash: None,
            semantic_role: Some(role.semantic_role.clone()),
            node_id: Some(role.node_id.clone()),
            capability_id: Some(role.capability_id.clone()),
            accepted_reference_artifact_ids: role.accepted_reference_artifact_ids.clone(),
            lock_ids: role.lock_ids.clone(),
        };
        let result = tokio::time::timeout(
            remaining.min(Duration::from_secs(ROLE_TIMEOUT_SECS)),
            execute_role(GameAssetRoleExecution {
                provider_id: stored.preview.provider_id.clone(),
                model: stored.preview.model.clone(),
                prompt: role.prompt.clone(),
                reference_bytes: stored.reference_bytes.clone(),
                output_size: stored.preview.output_size.clone(),
                context,
            }),
        )
        .await;
        let result = match result {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => {
                return Ok(GameAssetGenerationApplyResult {
                    status: "partial".into(),
                    outputs,
                    authorization: None,
                    error: Some(error.to_string()),
                })
            }
            Err(_) => {
                return Ok(GameAssetGenerationApplyResult {
                    status: "partial".into(),
                    outputs,
                    authorization: None,
                    error: Some("Game Asset role generation timed out".into()),
                })
            }
        };
        if result.images.len() != 1 || result.receipts.len() != 1 {
            return Ok(GameAssetGenerationApplyResult {
                status: "partial".into(),
                outputs,
                authorization: None,
                error: Some(
                    "Game Asset role generation did not return exactly one artifact".into(),
                ),
            });
        }
        let image = &result.images[0];
        let receipt = &result.receipts[0];
        if image.data.len() > MAX_OUTPUT_BASE64_CHARACTERS {
            return Ok(GameAssetGenerationApplyResult {
                status: "partial".into(),
                outputs,
                authorization: None,
                error: Some("Game Asset output exceeded its encoded byte budget".into()),
            });
        }
        let bytes = match STANDARD.decode(&image.data) {
            Ok(bytes) => bytes,
            Err(_) => {
                return Ok(GameAssetGenerationApplyResult {
                    status: "partial".into(),
                    outputs,
                    authorization: None,
                    error: Some("Game Asset output base64 is invalid".into()),
                })
            }
        };
        if verify_receipt(receipt, &bytes).is_err() {
            return Ok(GameAssetGenerationApplyResult {
                status: "partial".into(),
                outputs,
                authorization: None,
                error: Some("Game Asset output receipt verification failed".into()),
            });
        }
        let Some(plan_role) = stored
            .plan
            .roles
            .iter()
            .find(|candidate| candidate.id == role.role_id)
        else {
            return Ok(GameAssetGenerationApplyResult {
                status: "partial".into(),
                outputs,
                authorization: None,
                error: Some("Game Asset role disappeared from its previewed plan".into()),
            });
        };
        let frame_size = PixelSize {
            width: stored.plan.delivery.frame_width,
            height: stored.plan.delivery.frame_height,
        };
        let (processed_bytes, processing_evidence) = match deterministic_cutout(
            &bytes,
            &receipt.artifact.artifact_id,
            &receipt.artifact.sha256,
            &frame_size,
            &plan_role.expected_alpha_size,
            &plan_role.expected_anchor,
            &plan_role.anchor,
        ) {
            Ok(processed) => processed,
            Err(error) => {
                return Ok(GameAssetGenerationApplyResult {
                    status: "partial".into(),
                    outputs,
                    authorization: None,
                    error: Some(error.to_string()),
                })
            }
        };
        output_bytes = output_bytes
            .checked_add(bytes.len())
            .and_then(|total| total.checked_add(processed_bytes.len()))
            .ok_or_else(|| {
                ProxyError::Request("Game Asset output byte accounting overflowed".into())
            })?;
        if output_bytes > MAX_OUTPUT_BYTES {
            return Ok(GameAssetGenerationApplyResult {
                status: "partial".into(),
                outputs,
                authorization: None,
                error: Some(
                    "Game Asset generation exceeded its total retained output byte budget".into(),
                ),
            });
        }
        let pixel_evidence = match inspect_pixels(&processed_bytes, &plan_role.anchor) {
            Ok(evidence) => evidence,
            Err(error) => {
                return Ok(GameAssetGenerationApplyResult {
                    status: "partial".into(),
                    outputs,
                    authorization: None,
                    error: Some(error.to_string()),
                })
            }
        };
        outputs.push(RetainedRoleOutput {
            role_id: role.role_id.clone(),
            receipt: receipt.clone(),
            source_media_type: image.media_type.clone(),
            source_artifact_bytes_base64: image.data.clone(),
            media_type: "image/png".into(),
            artifact_bytes_base64: STANDARD.encode(&processed_bytes),
            processing_evidence,
            pixel_evidence,
        });
    }
    let completed_at = unix_millis()?;
    let authorization =
        issue_authorization(&stored, execution_id, started_at, &outputs, completed_at)?;
    Ok(GameAssetGenerationApplyResult {
        status: "succeeded".into(),
        outputs,
        authorization: Some(authorization),
        error: None,
    })
}

#[tauri::command]
pub async fn apply_game_asset_generation(
    app: AppHandle,
    state: State<'_, GameAssetGenerationState>,
    cancellations: State<'_, AiProxyCancellationState>,
    plan_id: String,
    request_id: Option<String>,
) -> Result<GameAssetGenerationApplyResult, ProxyError> {
    let stored = state
        .previews
        .lock()
        .map_err(|_| ProxyError::Request("Game Asset preview state is unavailable".into()))?
        .remove(&plan_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset generation preview is missing, expired, or already consumed".into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset generation preview expired".into(),
        ));
    }
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        execute_stored_preview(stored, move |request| {
            dashscope_image::execute(
                app.clone(),
                request.provider_id,
                DashScopeImageOperation::Edit,
                request.model,
                request.prompt,
                request.reference_bytes,
                Some(request.output_size),
                Some(request.context),
            )
        })
        .await
    })
    .await
}

fn verify_generation_authorization(
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
) -> Result<GameAssetGenerationAuthorization, ProxyError> {
    if authorization.protocol != AUTHORIZATION_PROTOCOL
        || authorization.status != "succeeded"
        || !MODELS.contains(&authorization.model.as_str())
        || !matches!(
            authorization.processor_implementation.as_str(),
            LEGACY_CUTOUT_IMPLEMENTATION | CUTOUT_IMPLEMENTATION
        )
        || authorization.execution_mode != "byok-direct"
        || authorization.completed_at < authorization.started_at
        || authorization.outputs.len() != authorization.role_requests.len()
        || authorization.outputs.len() != outputs.len()
        || outputs.is_empty()
        || outputs.len() > MAX_ROLES
        || outputs.iter().fold(0_usize, |total, output| {
            total
                .saturating_add(output.source_artifact_bytes_base64.len())
                .saturating_add(output.artifact_bytes_base64.len())
        }) > MAX_OUTPUT_BASE64_CHARACTERS.saturating_mul(2)
    {
        return Err(ProxyError::Request(
            "Game Asset generation authorization closure is invalid".into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    let mut verified = Vec::with_capacity(outputs.len());
    let mut retained_output_bytes = 0_usize;
    for output in outputs {
        let source_bytes = STANDARD
            .decode(&output.source_artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request("Game Asset retained source base64 is invalid".into())
            })?;
        let bytes = STANDARD
            .decode(&output.artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request("Game Asset retained output base64 is invalid".into())
            })?;
        retained_output_bytes = retained_output_bytes
            .checked_add(source_bytes.len())
            .and_then(|total| total.checked_add(bytes.len()))
            .ok_or_else(|| {
                ProxyError::Request("Game Asset retained output byte accounting overflowed".into())
            })?;
        if retained_output_bytes > MAX_OUTPUT_BYTES {
            return Err(ProxyError::Request(
                "Game Asset retained outputs exceed the total byte budget".into(),
            ));
        }
        verify_receipt(&output.receipt, &source_bytes)?;
        let request = authorization
            .role_requests
            .iter()
            .find(|request| request.role_id == output.role_id)
            .ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset retained output has no authorized role request".into(),
                )
            })?;
        if sha256(request.prompt.as_bytes()) != request.prompt_hash
            || output.receipt.request_id != request.request_id
            || output.receipt.run_id != authorization.run_id
            || output.receipt.provider_id != authorization.provider_id
            || output.receipt.model != authorization.model
            || output.receipt.semantic_role.as_deref() != Some(request.semantic_role.as_str())
            || output.receipt.node_id.as_deref() != Some(request.node_id.as_str())
            || output.receipt.capability_id.as_deref() != Some(request.capability_id.as_str())
            || output.receipt.accepted_reference_artifact_ids
                != request.accepted_reference_artifact_ids
            || output.receipt.lock_ids != request.lock_ids
            || output.source_media_type != output.receipt.artifact.media_type
            || output.media_type != "image/png"
            || output.processing_evidence.implementation
                != authorization.processor_implementation
        {
            return Err(ProxyError::Request(
                "Game Asset retained output drifted from its approved role request".into(),
            ));
        }
        let (reprocessed_bytes, processing_evidence) =
            if authorization.processor_implementation == LEGACY_CUTOUT_IMPLEMENTATION {
                deterministic_cutout_legacy(
                    &source_bytes,
                    &output.receipt.artifact.artifact_id,
                    &output.receipt.artifact.sha256,
                )?
            } else {
                let frame_size = output.processing_evidence.frame_size.as_ref().ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset normalized output is missing its frame geometry".into(),
                    )
                })?;
                let alpha_target =
                    output.processing_evidence.alpha_target.as_ref().ok_or_else(|| {
                        ProxyError::Request(
                            "Game Asset normalized output is missing its alpha envelope".into(),
                        )
                    })?;
                let expected_anchor = output
                    .processing_evidence
                    .expected_anchor
                    .as_ref()
                    .ok_or_else(|| {
                        ProxyError::Request(
                            "Game Asset normalized output is missing its expected anchor".into(),
                        )
                    })?;
                let anchor_policy = output
                    .processing_evidence
                    .anchor_policy
                    .as_deref()
                    .ok_or_else(|| {
                        ProxyError::Request(
                            "Game Asset normalized output is missing its anchor policy".into(),
                        )
                    })?;
                if authorization.output_size
                    != format!("{}x{}", frame_size.width, frame_size.height)
                    || anchor_policy != request.anchor_policy
                    || output.processing_evidence.scale_policy.as_deref()
                        != Some(CUTOUT_SCALE_POLICY)
                {
                    return Err(ProxyError::Request(
                        "Game Asset normalized output drifted from its authorized geometry".into(),
                    ));
                }
                deterministic_cutout(
                    &source_bytes,
                    &output.receipt.artifact.artifact_id,
                    &output.receipt.artifact.sha256,
                    frame_size,
                    alpha_target,
                    expected_anchor,
                    anchor_policy,
                )?
            };
        if reprocessed_bytes != bytes || processing_evidence != output.processing_evidence {
            return Err(ProxyError::Request(
                "Game Asset processed output cannot be reproduced from its retained source bytes"
                    .into(),
            ));
        }
        let pixel_evidence = inspect_pixels(&bytes, &request.anchor_policy)?;
        if pixel_evidence != output.pixel_evidence {
            return Err(ProxyError::Request(
                "Game Asset pixel evidence does not match retained output bytes".into(),
            ));
        }
        verified.push(AuthorizedRoleOutput {
            role_id: output.role_id,
            receipt_id: output.receipt.receipt_id,
            receipt_hash: output.receipt.receipt_hash,
            source_artifact_id: output.receipt.artifact.artifact_id,
            source_artifact_sha256: output.receipt.artifact.sha256,
            artifact_id: output.processing_evidence.output_artifact_id.clone(),
            artifact_sha256: output.processing_evidence.output_artifact_sha256.clone(),
            processing_evidence: output.processing_evidence,
            pixel_evidence: output.pixel_evidence,
        });
    }
    if verified != authorization.outputs {
        return Err(ProxyError::Request(
            "Game Asset retained outputs do not match the signed authorization".into(),
        ));
    }
    Ok(authorization)
}

#[tauri::command]
pub async fn verify_game_asset_generation_authorization(
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
) -> Result<GameAssetGenerationAuthorization, ProxyError> {
    verify_generation_authorization(authorization, outputs)
}

#[tauri::command]
pub async fn preview_game_asset_semantic_acceptance(
    state: State<'_, GameAssetGenerationState>,
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
    decisions: Vec<SemanticAcceptanceDecision>,
) -> Result<GameAssetSemanticAcceptancePreview, ProxyError> {
    let authorization = verify_generation_authorization(authorization, outputs)?;
    validate_semantic_decisions(&authorization, &decisions)?;
    let now = unix_millis()?;
    let review_digest = canonical_hash(&serde_json::json!({
        "generationReceiptId": &authorization.receipt_id,
        "generationReceiptHash": &authorization.receipt_hash,
        "planId": &authorization.plan_id,
        "runId": &authorization.run_id,
        "decisions": &decisions,
        "outputs": &authorization.outputs,
    }))?;
    let preview = GameAssetSemanticAcceptancePreview {
        protocol: ACCEPTANCE_PREVIEW_PROTOCOL.into(),
        preview_id: format!("game-asset-acceptance-preview:sha256:{review_digest}"),
        review_digest,
        generation_receipt_id: authorization.receipt_id.clone(),
        generation_receipt_hash: authorization.receipt_hash.clone(),
        plan_id: authorization.plan_id.clone(),
        run_id: authorization.run_id.clone(),
        role_ids: authorization
            .role_requests
            .iter()
            .map(|request| request.role_id.clone())
            .collect(),
        artifact_ids: authorization
            .outputs
            .iter()
            .map(|output| output.artifact_id.clone())
            .collect(),
        expires_at: now + PREVIEW_TTL_MS,
        requires_approval: true,
    };
    let mut acceptances = state.semantic_acceptances.lock().map_err(|_| {
        ProxyError::Request("Game Asset semantic acceptance state is unavailable".into())
    })?;
    acceptances
        .previews
        .retain(|_, candidate| candidate.preview.expires_at > now);
    if acceptances.accepted.contains(&authorization.receipt_id)
        || acceptances
            .pending_receipts
            .contains(&authorization.receipt_id)
    {
        return Err(ProxyError::Request(
            "Game Asset generation evidence is already accepted or under confirmation".into(),
        ));
    }
    if acceptances.previews.len() >= MAX_ACTIVE_PREVIEWS
        && !acceptances.previews.contains_key(&preview.preview_id)
    {
        return Err(ProxyError::Request(
            "Game Asset semantic acceptance preview capacity is exhausted".into(),
        ));
    }
    acceptances.previews.insert(
        preview.preview_id.clone(),
        StoredSemanticAcceptancePreview {
            preview: preview.clone(),
            authorization,
            decisions,
        },
    );
    Ok(preview)
}

#[tauri::command]
pub async fn apply_game_asset_semantic_acceptance(
    app: AppHandle,
    state: State<'_, GameAssetGenerationState>,
    preview_id: String,
) -> Result<GameAssetSemanticAcceptance, ProxyError> {
    let stored = state
        .semantic_acceptances
        .lock()
        .map_err(|_| {
            ProxyError::Request("Game Asset semantic acceptance state is unavailable".into())
        })?
        .previews
        .remove(&preview_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset semantic acceptance preview is missing, expired, or already consumed"
                    .into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset semantic acceptance preview expired".into(),
        ));
    }
    {
        let mut acceptances = state.semantic_acceptances.lock().map_err(|_| {
            ProxyError::Request("Game Asset semantic acceptance state is unavailable".into())
        })?;
        if acceptances
            .accepted
            .contains(&stored.authorization.receipt_id)
            || !acceptances
                .pending_receipts
                .insert(stored.authorization.receipt_id.clone())
        {
            return Err(ProxyError::Request(
                "Game Asset generation evidence is already accepted or under confirmation".into(),
            ));
        }
    }
    let approval = crate::commands::native_approval::require_native_confirmation(
        &app,
        "Accept Game Asset semantics",
        &format!(
            "Accept {} exact Game Asset role(s) from run {} only if you reviewed the displayed retained images for reference continuity, role readability, and style consistency.",
            stored.decisions.len(),
            stored.authorization.run_id,
        ),
    )
    .await;
    let result = match approval {
        Ok(approval_id) => unix_millis().and_then(|accepted_at| {
            issue_semantic_acceptance(
                &stored.authorization,
                approval_id,
                stored.decisions,
                accepted_at,
            )
        }),
        Err(error) => Err(ProxyError::Request(error)),
    };
    let mut acceptances = state.semantic_acceptances.lock().map_err(|_| {
        ProxyError::Request("Game Asset semantic acceptance state is unavailable".into())
    })?;
    acceptances
        .pending_receipts
        .remove(&stored.authorization.receipt_id);
    if result.is_ok() {
        if acceptances.accepted.len() >= MAX_REMEMBERED_ACCEPTANCES {
            acceptances.accepted.pop_front();
        }
        acceptances
            .accepted
            .push_back(stored.authorization.receipt_id.clone());
    }
    result
}

#[tauri::command]
pub async fn verify_game_asset_semantic_acceptance(
    acceptance: GameAssetSemanticAcceptance,
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
) -> Result<GameAssetSemanticAcceptance, ProxyError> {
    let authorization = verify_generation_authorization(authorization, outputs)?;
    if acceptance.protocol != ACCEPTANCE_PROTOCOL
        || acceptance.generation_receipt_id != authorization.receipt_id
        || acceptance.generation_receipt_hash != authorization.receipt_hash
        || acceptance.plan_id != authorization.plan_id
        || acceptance.run_id != authorization.run_id
        || acceptance.producer_id != authorization.provider_id
        || acceptance.reviewer_kind != "native-local-human"
        || acceptance.outputs != authorization.outputs
        || acceptance.accepted_at < authorization.completed_at
    {
        return Err(ProxyError::Request(
            "Game Asset semantic acceptance drifted from its exact generation evidence".into(),
        ));
    }
    validate_semantic_decisions(&authorization, &acceptance.decisions)?;
    verify_host_payload(
        &acceptance.payload(),
        &acceptance.receipt_hash,
        &acceptance.signature,
    )?;
    Ok(acceptance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_inspection_uses_returned_alpha_bytes() {
        let mut image = image::RgbaImage::new(8, 8);
        for y in 3..7 {
            for x in 2..6 {
                image.put_pixel(x, y, image::Rgba([10, 20, 30, 255]));
            }
        }
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        let evidence = inspect_pixels(&bytes, "feet").unwrap();
        assert_eq!(
            evidence.alpha_bounds,
            AlphaBounds {
                x: 2,
                y: 3,
                width: 4,
                height: 4
            }
        );
        assert_eq!(evidence.anchor, AnchorPoint { x: 4.0, y: 7.0 });
        assert!(!evidence.edge_contact);
    }

    #[test]
    fn pixel_inspection_rejects_empty_alpha() {
        let image = image::RgbaImage::new(8, 8);
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        assert!(inspect_pixels(&bytes, "center").is_err());
    }

    #[test]
    fn prompts_allow_reviewable_multiline_text_but_reject_credentials() {
        assert!(valid_prompt(
            "Keep the silhouette readable.\nUse the locked reference."
        ));
        assert!(!valid_prompt("Authorization: Bearer private-token"));
        assert!(!valid_prompt("use sk-12345678 for this role"));
        assert!(!valid_prompt("bad\0prompt"));
    }

    #[test]
    fn semantic_acceptance_requires_every_authorized_role_and_dimension() {
        let authorization = GameAssetGenerationAuthorization {
            protocol: AUTHORIZATION_PROTOCOL.into(),
            receipt_id: "receipt:generation".into(),
            receipt_hash: "a".repeat(64),
            plan_id: format!("game-asset-preview:sha256:{}", "b".repeat(64)),
            request_digest: "b".repeat(64),
            execution_id: "execution:game-asset:test".into(),
            execution_mode: "byok-direct".into(),
            identity: RehearsalIdentity {
                id: "identity:game".into(),
                revision: "revision:1".into(),
            },
            run_id: "run:game".into(),
            provider_id: "provider:dashscope".into(),
            model: "qwen-image-3.0-pro".into(),
            game_plan_id: "plan:game".into(),
            game_plan_hash: "c".repeat(64),
            output_size: "1024x1024".into(),
            processor_implementation: CUTOUT_IMPLEMENTATION.into(),
            role_requests: vec![AuthorizedRoleRequest {
                role_id: "role:idle".into(),
                request_id: "request:idle".into(),
                prompt: "Idle role".into(),
                prompt_hash: sha256(b"Idle role"),
                semantic_role: "role:idle".into(),
                node_id: "node:game-asset-frame:role:idle".into(),
                capability_id: "capability:image-generation".into(),
                accepted_reference_artifact_ids: vec![format!(
                    "artifact:sha256:{}",
                    "d".repeat(64)
                )],
                lock_ids: vec![format!("game-asset-plan:sha256:{}", "c".repeat(64))],
                anchor_policy: "feet".into(),
            }],
            outputs: vec![],
            status: "succeeded".into(),
            started_at: 1,
            completed_at: 2,
            signature: "e".repeat(64),
        };
        let accepted = SemanticAcceptanceDecision {
            role_id: "role:idle".into(),
            reference_continuity: "accepted".into(),
            role_readability: "accepted".into(),
            style_consistency: "accepted".into(),
        };
        assert!(validate_semantic_decisions(&authorization, &[accepted.clone()]).is_ok());
        assert!(validate_semantic_decisions(
            &authorization,
            &[SemanticAcceptanceDecision {
                role_readability: "rejected".into(),
                ..accepted
            }]
        )
        .is_err());
        assert!(validate_semantic_decisions(&authorization, &[]).is_err());
        assert!(issue_semantic_acceptance(
            &authorization,
            "native-approval.semantic".into(),
            vec![SemanticAcceptanceDecision {
                role_id: "role:idle".into(),
                reference_continuity: "accepted".into(),
                role_readability: "accepted".into(),
                style_consistency: "accepted".into(),
            }],
            authorization.completed_at - 1,
        )
        .is_err());
    }

    #[test]
    fn deterministic_cutout_trims_scales_and_anchors_reproducibly() {
        let mut image = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 255, 255, 255]));
        for y in 2..6 {
            for x in 2..6 {
                image.put_pixel(x, y, image::Rgba([20, 40, 80, 255]));
            }
        }
        let mut source = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut source),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        let source_hash = sha256(&source);
        let source_id = format!("artifact:sha256:{source_hash}");
        let frame_size = PixelSize {
            width: 8,
            height: 8,
        };
        let alpha_target = PixelSize {
            width: 6,
            height: 6,
        };
        let expected_anchor = AnchorPoint { x: 4.0, y: 7.0 };
        let (first, evidence) = deterministic_cutout(
            &source,
            &source_id,
            &source_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        let (second, repeated_evidence) = deterministic_cutout(
            &source,
            &source_id,
            &source_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        assert_eq!(first, second);
        assert_eq!(evidence, repeated_evidence);
        assert_eq!(evidence.implementation, CUTOUT_IMPLEMENTATION);
        assert_eq!(evidence.source_artifact_id, source_id);
        assert_eq!(evidence.source_artifact_sha256, source_hash);
        assert_eq!(evidence.output_artifact_sha256, sha256(&first));
        assert_eq!(
            evidence.source_alpha_bounds,
            Some(AlphaBounds {
                x: 2,
                y: 2,
                width: 4,
                height: 4,
            })
        );
        let processed = image::load_from_memory(&first).unwrap().to_rgba8();
        assert_eq!(processed.get_pixel(0, 0).0[3], 0);
        assert_eq!(processed.get_pixel(3, 3).0[3], 255);
        assert_eq!(
            inspect_pixels(&first, "feet").unwrap().alpha_bounds,
            AlphaBounds {
                x: 1,
                y: 1,
                width: 6,
                height: 6,
            }
        );
        assert_eq!(inspect_pixels(&first, "feet").unwrap().anchor, expected_anchor);
    }

    #[test]
    fn legacy_cutout_remains_byte_reproducible_for_retained_v1_evidence() {
        let mut image = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 255, 255, 255]));
        for y in 2..6 {
            for x in 2..6 {
                image.put_pixel(x, y, image::Rgba([20, 40, 80, 255]));
            }
        }
        let mut source = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut source),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        let source_hash = sha256(&source);
        let source_id = format!("artifact:sha256:{source_hash}");
        let (output, evidence) =
            deterministic_cutout_legacy(&source, &source_id, &source_hash).unwrap();

        assert_eq!(evidence.implementation, LEGACY_CUTOUT_IMPLEMENTATION);
        assert!(evidence.source_alpha_bounds.is_none());
        assert_eq!(
            inspect_pixels(&output, "feet").unwrap().alpha_bounds,
            AlphaBounds {
                x: 2,
                y: 2,
                width: 4,
                height: 4,
            }
        );
    }

    #[test]
    #[ignore = "requires CUTOUT_REAL_GAME_PREVIEW_INPUT generated from retained real bytes"]
    fn accepts_the_exact_renderer_preview_payload_without_gui_automation() {
        let path = std::env::var("CUTOUT_REAL_GAME_PREVIEW_INPUT")
            .expect("CUTOUT_REAL_GAME_PREVIEW_INPUT is required");
        let bytes = std::fs::read(path).expect("could not read the renderer preview payload");
        let input: GameAssetGenerationPreviewInput =
            serde_json::from_slice(&bytes).expect("renderer preview payload is not strict JSON");
        let stored = preview_request(input, 1_000).expect("native preview rejected renderer input");

        assert_eq!(stored.preview.protocol, PREVIEW_PROTOCOL);
        assert_eq!(stored.preview.model, "qwen-image-3.0-pro");
        assert_eq!(stored.preview.role_ids.len(), 4);
        assert_eq!(stored.roles.len(), 4);
        assert_eq!(stored.reference_bytes.len(), 1);
        assert_eq!(stored.preview.execution_mode, "byok-direct");
        assert!(stored
            .preview
            .plan_id
            .starts_with("game-asset-preview:sha256:"));
    }

    #[test]
    #[ignore = "requires retained real input, the configured Cutout Provider file, keychain access, network, and paid Qwen execution"]
    fn executes_and_retains_a_real_qwen_game_asset_run_without_gui_automation() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create the real Game Asset rehearsal runtime");
        runtime.block_on(async {
            let input_path = std::env::var("CUTOUT_REAL_GAME_PREVIEW_INPUT")
                .expect("CUTOUT_REAL_GAME_PREVIEW_INPUT is required");
            let provider_path = std::env::var("CUTOUT_REAL_PROVIDER_CONFIG")
                .expect("CUTOUT_REAL_PROVIDER_CONFIG is required");
            let input_bytes = std::fs::read(input_path)
                .expect("could not read the retained real Game Asset request");
            let input: GameAssetGenerationPreviewInput = serde_json::from_slice(&input_bytes)
                .expect("the retained Game Asset request is not strict JSON");
            let provider_bytes = std::fs::read(provider_path)
                .expect("could not read Cutout's non-secret Provider configuration");
            let providers: Vec<super::super::providers::ProviderConfig> =
                serde_json::from_slice(&provider_bytes)
                    .expect("Cutout's Provider configuration is invalid");
            let provider = providers
                .iter()
                .find(|provider| provider.id == input.provider_id)
                .expect("the retained request Provider is not configured");
            dashscope_image::validate_provider_record(provider, &input.provider_id)
                .expect("the retained request is not bound to an enabled native DashScope Provider");
            if provider.default_model != input.model {
                panic!("the retained request model differs from its configured Provider model");
            }
            let secret = super::super::keys::read_secret(&input.provider_id)
                .expect("the retained request Provider key is unavailable in Cutout's keychain");
            let stored = preview_request(input.clone(), unix_millis().unwrap())
                .expect("native preview rejected the retained real Game Asset request");
            let result = execute_stored_preview(stored, move |request| {
                let secret = secret.clone();
                async move {
                    dashscope_image::execute_bound(
                        request.provider_id,
                        DashScopeImageOperation::Edit,
                        request.model,
                        request.prompt,
                        request.reference_bytes,
                        Some(request.output_size),
                        Some(request.context),
                        secret,
                    )
                    .await
                }
            })
            .await
            .expect("the native Game Asset execution boundary failed");
            let serialized_result = serde_json::to_vec_pretty(&result)
                .expect("could not encode the native apply result");
            let authorization = result.authorization.clone();
            let attempt_id = authorization
                .as_ref()
                .map(|authorization| authorization.receipt_hash.clone())
                .unwrap_or_else(|| format!("partial-sha256-{}", sha256(&serialized_result)));
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("the repository root is unavailable")
                .join(".trellis/tasks/08-13-sprite-production-workflow/research/production-rehearsal-2026-08-14/native-qwen-run")
                .join(attempt_id);
            std::fs::create_dir_all(&root)
                .expect("could not create the content-addressed rehearsal directory");
            for (index, output) in result.outputs.iter().enumerate() {
                let source = STANDARD
                    .decode(&output.source_artifact_bytes_base64)
                    .expect("retained source bytes are invalid");
                let processed = STANDARD
                    .decode(&output.artifact_bytes_base64)
                    .expect("retained processed bytes are invalid");
                let source_extension = match output.source_media_type.as_str() {
                    "image/jpeg" => "jpg",
                    "image/webp" => "webp",
                    _ => "png",
                };
                std::fs::write(
                    root.join(format!("frame-{:02}-source.{source_extension}", index + 1)),
                    source,
                )
                .expect("could not retain a Provider source frame");
                std::fs::write(
                    root.join(format!("frame-{:02}-cutout.png", index + 1)),
                    processed,
                )
                .expect("could not retain a deterministic Cutout frame");
            }
            std::fs::write(root.join("apply-result.json"), &serialized_result)
                .expect("could not retain the native apply result");
            if result.status != "succeeded" {
                println!("REAL_GAME_ATTEMPT={}", root.display());
                panic!(
                    "real Game Asset generation was partial: {}",
                    result.error.as_deref().unwrap_or("unknown failure")
                );
            }
            let authorization = authorization.expect("successful generation lacks signed authorization");
            verify_generation_authorization(authorization.clone(), result.outputs.clone())
                .expect("the retained real Game Asset execution failed native reverification");
            let frames = result
                .outputs
                .iter()
                .map(|output| {
                    serde_json::json!({
                        "roleId": output.role_id,
                        "receipt": output.receipt,
                        "sourceArtifactBytesBase64": output.source_artifact_bytes_base64,
                        "artifactBytesBase64": output.artifact_bytes_base64,
                        "processingEvidence": output.processing_evidence,
                        "pixelEvidence": output.pixel_evidence,
                    })
                })
                .collect::<Vec<_>>();
            let bundle = serde_json::json!({
                "schema": "game-asset.production-rehearsal.v1",
                "identity": input.identity,
                "runId": input.run_id,
                "plan": input.plan,
                "authorization": authorization,
                "retainedEvidence": input.retained_evidence,
                "frames": frames,
            });
            std::fs::write(
                root.join("bundle.json"),
                serde_json::to_vec_pretty(&bundle).expect("could not encode the rehearsal bundle"),
            )
            .expect("could not retain the rehearsal bundle");
            println!("REAL_GAME_BUNDLE={}", root.join("bundle.json").display());
        });
    }
}
