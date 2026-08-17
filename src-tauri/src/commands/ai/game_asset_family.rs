//! Native multi-action Game Asset family authority.
//!
//! Family acceptance is intentionally above the atomic generation protocols.
//! Every entry point replays those protocols and reconstructs repaired clips;
//! renderer-authored merged clips, readiness, measurements, and accepted ids are
//! not part of this command surface.

use std::{
    collections::{BTreeMap, HashMap, HashSet, VecDeque},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

use super::{
    ai_proxy::ProxyError,
    game_asset_generation::{
        self, GameAssetActionClip, GameAssetActionSheetAuthorization, GameAssetActionSheetPartial,
        GameAssetActionSheetPartialAuthorization, GameAssetActionSheetPartialRepairAuthorization,
        GameAssetActionSheetPartialReprocessAuthorization, GameAssetActionSheetRepairAuthorization,
        GameAssetActionSource, GameAssetGenerationAuthorization, RetainedActionSheetRepairOutput,
        RetainedRoleOutput,
    },
    multimodal_receipt::{sha256, sign_host_payload, verify_host_payload},
};

const FAMILY_PLAN_PROTOCOL: &str = "game-asset.family-plan.v1";
const FAMILY_ACCEPTANCE_PREVIEW_PROTOCOL: &str = "cutout.game-asset-family-acceptance-preview.v1";
const FAMILY_ACCEPTANCE_PROTOCOL: &str = "game-asset.family-acceptance.v1";
const GROUNDED_NORMALIZATION_PREVIEW_PROTOCOL: &str =
    "cutout.game-asset-grounded-normalization-preview.v1";
const GROUNDED_NORMALIZATION_AUTHORIZATION_PROTOCOL: &str =
    "cutout.game-asset-grounded-normalization-authorization.v1";
const SCALE_PROFILE_PROTOCOL: &str = "game-asset.scale-profile.v1";
const FAMILY_BUNDLE_PROTOCOL: &str = "game-asset.family-bundle.v1";
const FAMILY_VERIFIER_IMPLEMENTATION: &str =
    "cutout-game-asset-family-native-replay-rust-image-0.23-v1";
const FAMILY_ATLAS_COMPILER: &str = "cutout-game-asset-family-atlas-rust-image-0.23-v1";
const ACTION_SHEET_NO_GROUND_CONSTRAINT: &str =
    "Do not render a ground plane, floor line, contact shadow, or horizontal baseline beneath any subject.";
const ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT: &str =
    "Keep every subject, weapon, and effect spatially isolated inside its own cell; nothing may cross a cell boundary.";
const FAMILY_TIMING_POLICY: &str = "game-asset-family-observed-timing.v1";
const PIXEL_MEASUREMENT_IMPLEMENTATION: &str = "rgba-alpha-bounds-v1";
const SCALE_POLICY: &str = "contain-preserve-aspect";
const PREVIEW_TTL_MS: u64 = 10 * 60 * 1_000;
const MAX_ACTIVE_PREVIEWS: usize = 8;
const MAX_REMEMBERED_ACCEPTANCES: usize = 64;
const MAX_GROUPS: usize = 32;
const MAX_ROLES_PER_GROUP: usize = 16;
const MAX_TOTAL_RETAINED_BYTES: usize = 384 * 1024 * 1024;
const MAX_ATLASES: usize = 32;
const MAX_ATLAS_DIMENSION: u32 = 16_384;
const MAX_ATLAS_PIXELS: u64 = 100_000_000;

#[derive(Default)]
pub struct GameAssetFamilyState {
    inner: Mutex<GameAssetFamilyAcceptanceState>,
    grounded_normalization_previews: Mutex<HashMap<String, StoredGroundedNormalizationPreview>>,
}

#[derive(Default)]
struct GameAssetFamilyAcceptanceState {
    previews: HashMap<String, StoredFamilyAcceptancePreview>,
    pending: HashSet<String>,
    accepted: VecDeque<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EvidenceReference {
    id: String,
    revision: String,
    content_hash: String,
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SchemaReference {
    id: String,
    version: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AtomicRole {
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AtomicDelivery {
    format_id: String,
    frame_width: u32,
    frame_height: u32,
    columns: u32,
    rows: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AtomicPlan {
    version: String,
    id: String,
    asset_id: String,
    kind: String,
    view: String,
    art_direction_evidence: Vec<EvidenceReference>,
    reference_artifacts: Vec<EvidenceReference>,
    roles: Vec<AtomicRole>,
    delivery: AtomicDelivery,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(
    tag = "strategy",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum FamilySourcePlan {
    CoherentGrid {
        rows: u32,
        columns: u32,
        initial_provider_call_budget: u32,
    },
    RoleIsolated {
        role_ids: Vec<String>,
        initial_provider_call_budget: u32,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FamilyTiming {
    frame_duration_ms: u32,
    looping: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FamilyGroup {
    id: String,
    label: String,
    component: String,
    compatibility_class: String,
    action: String,
    direction: String,
    dependencies: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    synchronized_body_group_id: Option<String>,
    timing: FamilyTiming,
    source: FamilySourcePlan,
    source_brief: String,
    plan: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MasterSelection {
    policy: String,
    priority_group_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FamilyDelivery {
    format_id: String,
    atlas_policy: String,
    body_fx_policy: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FamilyPlan {
    version: String,
    id: String,
    asset_id: String,
    kind: String,
    view: String,
    identity_reference: EvidenceReference,
    art_direction_evidence: EvidenceReference,
    groups: Vec<FamilyGroup>,
    master_selection: MasterSelection,
    delivery: FamilyDelivery,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SheetAuthorizationIdentity {
    receipt_id: String,
    receipt_hash: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AtomicAuthorizationIdentity {
    receipt_id: String,
    receipt_hash: String,
    game_plan_id: String,
    game_plan_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepairAuthorizationIdentity {
    receipt_id: String,
    receipt_hash: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClipFrame {
    role_id: String,
    source_artifact_id: String,
    artifact_id: String,
    artifact_sha256: String,
    artifact_bytes_base64: String,
    duration_ms: u32,
    anchor: AnchorPoint,
    processing_evidence: Value,
    pixel_evidence: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionClip {
    version: String,
    id: String,
    family_plan_id: String,
    group_id: String,
    atomic_plan_id: String,
    atomic_plan_hash: String,
    source_id: String,
    frames: Vec<ClipFrame>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PartialClip {
    version: String,
    id: String,
    family_plan_id: String,
    group_id: String,
    atomic_plan_id: String,
    atomic_plan_hash: String,
    source_id: String,
    frame_duration_ms: u32,
    looping: bool,
    frames: Vec<ClipFrame>,
    failures: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptArtifactView {
    artifact_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptView {
    artifact: ReceiptArtifactView,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RetainedOutputView {
    role_id: String,
    receipt: ReceiptView,
    source_media_type: String,
    source_artifact_bytes_base64: String,
    media_type: String,
    artifact_bytes_base64: String,
    processing_evidence: Value,
    pixel_evidence: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessingEvidenceView {
    implementation: String,
    frame_size: PixelSize,
    alpha_target: PixelSize,
    expected_anchor: AnchorPoint,
    anchor_policy: String,
    scale_policy: String,
    output_alpha_bounds: AlphaBounds,
    output_artifact_id: String,
    output_artifact_sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PixelEvidenceView {
    implementation: String,
    decoded_width: u32,
    decoded_height: u32,
    alpha_bounds: AlphaBounds,
    edge_contact: bool,
    anchor: AnchorPoint,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AlphaBounds {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoherentSheetEvidence {
    authorization: GameAssetActionSheetAuthorization,
    source: GameAssetActionSource,
    clip: GameAssetActionClip,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompleteSheetRepairEvidence {
    parent_authorization: GameAssetActionSheetAuthorization,
    parent_source: GameAssetActionSource,
    parent_clip: GameAssetActionClip,
    repair_authorization: GameAssetActionSheetRepairAuthorization,
    outputs: Vec<RetainedActionSheetRepairOutput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartialSheetRepairEvidence {
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    repair_authorization: GameAssetActionSheetPartialRepairAuthorization,
    outputs: Vec<RetainedActionSheetRepairOutput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalPartialReprocessEvidence {
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    reprocess_authorization: GameAssetActionSheetPartialReprocessAuthorization,
    clip: GameAssetActionClip,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoleIsolatedEvidence {
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", content = "evidence", rename_all = "kebab-case")]
pub enum FamilyRetainedEvidence {
    CoherentSheet(CoherentSheetEvidence),
    CompleteSheetRepair(CompleteSheetRepairEvidence),
    PartialSheetRepair(PartialSheetRepairEvidence),
    LocalPartialReprocess(LocalPartialReprocessEvidence),
    RoleIsolatedAtomicGeneration(RoleIsolatedEvidence),
    GroundedNormalizationMigration(GroundedNormalizationMigrationEvidence),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", content = "evidence", rename_all = "kebab-case")]
pub enum GroundedNormalizationParentEvidence {
    CoherentSheet(CoherentSheetEvidence),
    CompleteSheetRepair(CompleteSheetRepairEvidence),
    PartialSheetRepair(PartialSheetRepairEvidence),
    RoleIsolatedAtomicGeneration(RoleIsolatedEvidence),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetGroundedNormalizationPreviewInput {
    parent_family_plan: Value,
    successor_family_plan: Value,
    parent_evidence: GroundedNormalizationParentEvidence,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FamilySemanticDecision {
    group_id: String,
    role_id: String,
    reference_continuity: String,
    role_readability: String,
    style_consistency: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetFamilyProductionInput {
    family_plan: Value,
    retained_evidence: Vec<FamilyRetainedEvidence>,
    decisions: Vec<FamilySemanticDecision>,
    #[serde(default)]
    historical_scale_profile: Option<GameAssetScaleProfile>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum FamilySourceKind {
    CoherentSheet,
    CompleteSheetRepair,
    PartialSheetRepair,
    LocalPartialReprocess,
    RoleIsolatedAtomicGeneration,
    GroundedNormalizationMigration,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NormalizationContract {
    processor_implementation: String,
    frame_size: PixelSize,
    alpha_target: PixelSize,
    expected_anchor: AnchorPoint,
    anchor_policy: String,
    identity_lock: EvidenceReference,
    scale_lock: EvidenceReference,
    scale_policy: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GroundedNormalizationFrameLineage {
    parent_role_id: String,
    successor_role_id: String,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GroundedNormalizationAuthorizationPayload {
    protocol: String,
    receipt_id: String,
    preview_id: String,
    request_digest: String,
    parent_family_plan_id: String,
    parent_family_plan_hash: String,
    successor_family_plan_id: String,
    successor_family_plan_hash: String,
    parent_group_id: String,
    successor_group_id: String,
    parent_atomic_plan_id: String,
    parent_atomic_plan_hash: String,
    successor_atomic_plan_id: String,
    successor_atomic_plan_hash: String,
    parent_authority_receipt_id: String,
    parent_authority_receipt_hash: String,
    parent_clip_id: String,
    parent_clip_hash: String,
    successor_clip_id: String,
    successor_clip_hash: String,
    processor_implementation: String,
    scale_policy: String,
    frame_lineage: Vec<GroundedNormalizationFrameLineage>,
    execution_mode: String,
    provider_calls: u32,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetGroundedNormalizationAuthorization {
    protocol: String,
    receipt_id: String,
    receipt_hash: String,
    preview_id: String,
    request_digest: String,
    parent_family_plan_id: String,
    parent_family_plan_hash: String,
    successor_family_plan_id: String,
    successor_family_plan_hash: String,
    parent_group_id: String,
    successor_group_id: String,
    parent_atomic_plan_id: String,
    parent_atomic_plan_hash: String,
    successor_atomic_plan_id: String,
    successor_atomic_plan_hash: String,
    parent_authority_receipt_id: String,
    parent_authority_receipt_hash: String,
    parent_clip_id: String,
    parent_clip_hash: String,
    successor_clip_id: String,
    successor_clip_hash: String,
    processor_implementation: String,
    scale_policy: String,
    frame_lineage: Vec<GroundedNormalizationFrameLineage>,
    execution_mode: String,
    provider_calls: u32,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl GameAssetGroundedNormalizationAuthorization {
    fn payload(&self) -> GroundedNormalizationAuthorizationPayload {
        GroundedNormalizationAuthorizationPayload {
            protocol: self.protocol.clone(),
            receipt_id: self.receipt_id.clone(),
            preview_id: self.preview_id.clone(),
            request_digest: self.request_digest.clone(),
            parent_family_plan_id: self.parent_family_plan_id.clone(),
            parent_family_plan_hash: self.parent_family_plan_hash.clone(),
            successor_family_plan_id: self.successor_family_plan_id.clone(),
            successor_family_plan_hash: self.successor_family_plan_hash.clone(),
            parent_group_id: self.parent_group_id.clone(),
            successor_group_id: self.successor_group_id.clone(),
            parent_atomic_plan_id: self.parent_atomic_plan_id.clone(),
            parent_atomic_plan_hash: self.parent_atomic_plan_hash.clone(),
            successor_atomic_plan_id: self.successor_atomic_plan_id.clone(),
            successor_atomic_plan_hash: self.successor_atomic_plan_hash.clone(),
            parent_authority_receipt_id: self.parent_authority_receipt_id.clone(),
            parent_authority_receipt_hash: self.parent_authority_receipt_hash.clone(),
            parent_clip_id: self.parent_clip_id.clone(),
            parent_clip_hash: self.parent_clip_hash.clone(),
            successor_clip_id: self.successor_clip_id.clone(),
            successor_clip_hash: self.successor_clip_hash.clone(),
            processor_implementation: self.processor_implementation.clone(),
            scale_policy: self.scale_policy.clone(),
            frame_lineage: self.frame_lineage.clone(),
            execution_mode: self.execution_mode.clone(),
            provider_calls: self.provider_calls,
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroundedNormalizationMigrationEvidence {
    parent_family_plan: Value,
    parent_evidence: GroundedNormalizationParentEvidence,
    authorization: GameAssetGroundedNormalizationAuthorization,
    clip: ActionClip,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetGroundedNormalizationPreview {
    protocol: String,
    plan_id: String,
    request_digest: String,
    parent_family_plan_id: String,
    parent_family_plan_hash: String,
    successor_family_plan_id: String,
    successor_family_plan_hash: String,
    parent_group_id: String,
    successor_group_id: String,
    parent_clip_id: String,
    successor_clip_id: String,
    role_ids: Vec<String>,
    source_artifact_ids: Vec<String>,
    output_artifact_ids: Vec<String>,
    processor_implementation: String,
    scale_policy: String,
    execution_mode: String,
    provider_calls: u32,
    expires_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedGameAssetGroundedNormalization {
    authorization: GameAssetGroundedNormalizationAuthorization,
    clip: ActionClip,
}

#[derive(Debug, Clone)]
struct PreparedGroundedNormalization {
    preview: GameAssetGroundedNormalizationPreview,
    parent: AdmittedClip,
    successor_family_plan_hash: String,
    successor_atomic_plan: AtomicPlan,
    successor_clip: ActionClip,
    successor_clip_hash: String,
    frame_lineage: Vec<GroundedNormalizationFrameLineage>,
}

#[derive(Debug, Clone)]
struct StoredGroundedNormalizationPreview {
    prepared: PreparedGroundedNormalization,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdoptedScaleProfile {
    profile_id: String,
    profile_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ScaleProfilePayload {
    version: String,
    family_plan_id: String,
    master_clip_id: String,
    master_clip_hash: String,
    compatible_classes: Vec<String>,
    canvas: PixelSize,
    measured_alpha_size: PixelSize,
    anchor_policy: String,
    measured_anchor: AnchorPoint,
    identity_lock: EvidenceReference,
    measurement_implementation: String,
    normalization_contract: NormalizationContract,
    #[serde(skip_serializing_if = "Option::is_none")]
    adopted_from: Option<AdoptedScaleProfile>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetScaleProfile {
    version: String,
    id: String,
    family_plan_id: String,
    master_clip_id: String,
    master_clip_hash: String,
    compatible_classes: Vec<String>,
    canvas: PixelSize,
    measured_alpha_size: PixelSize,
    anchor_policy: String,
    measured_anchor: AnchorPoint,
    identity_lock: EvidenceReference,
    measurement_implementation: String,
    normalization_contract: NormalizationContract,
    #[serde(skip_serializing_if = "Option::is_none")]
    adopted_from: Option<AdoptedScaleProfile>,
}

impl GameAssetScaleProfile {
    fn payload(&self) -> ScaleProfilePayload {
        ScaleProfilePayload {
            version: self.version.clone(),
            family_plan_id: self.family_plan_id.clone(),
            master_clip_id: self.master_clip_id.clone(),
            master_clip_hash: self.master_clip_hash.clone(),
            compatible_classes: self.compatible_classes.clone(),
            canvas: self.canvas.clone(),
            measured_alpha_size: self.measured_alpha_size.clone(),
            anchor_policy: self.anchor_policy.clone(),
            measured_anchor: self.measured_anchor.clone(),
            identity_lock: self.identity_lock.clone(),
            measurement_implementation: self.measurement_implementation.clone(),
            normalization_contract: self.normalization_contract.clone(),
            adopted_from: self.adopted_from.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FamilyRelationship {
    body_group_id: String,
    fx_group_id: String,
    origin: AnchorPoint,
}

#[derive(Debug, Clone)]
struct AdmittedClip {
    group_id: String,
    source_kind: FamilySourceKind,
    authority_receipt_id: String,
    authority_receipt_hash: String,
    clip: ActionClip,
    clip_hash: String,
    atomic_plan: AtomicPlan,
}

#[derive(Debug, Clone)]
struct VerifiedFamilyClosure {
    family_plan: FamilyPlan,
    family_plan_hash: String,
    clips: Vec<AdmittedClip>,
    scale_profile: GameAssetScaleProfile,
    scale_profile_hash: String,
    relationships: Vec<FamilyRelationship>,
    decisions: Vec<FamilySemanticDecision>,
}

fn unix_millis() -> Result<u64, ProxyError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| ProxyError::Request("Game Asset family clock is unavailable".into()))
}

fn parse_serialized<T, U>(value: &T, message: &str) -> Result<U, ProxyError>
where
    T: Serialize,
    U: for<'de> Deserialize<'de>,
{
    serde_json::to_value(value)
        .ok()
        .and_then(|value| serde_json::from_value(value).ok())
        .ok_or_else(|| ProxyError::Request(message.into()))
}

fn parse_atomic_plan(group: &FamilyGroup) -> Result<AtomicPlan, ProxyError> {
    serde_json::from_value(group.plan.clone()).map_err(|_| {
        ProxyError::Request(format!(
            "Game Asset family group {} has an invalid atomic plan",
            group.id
        ))
    })
}

fn dependency_graph_is_acyclic(groups: &[(&str, &[String])]) -> bool {
    let mut resolved = HashSet::new();
    while resolved.len() < groups.len() {
        let ready = groups
            .iter()
            .filter(|(group_id, dependencies)| {
                !resolved.contains(*group_id)
                    && dependencies
                        .iter()
                        .all(|dependency| resolved.contains(dependency.as_str()))
            })
            .map(|(group_id, _)| *group_id)
            .collect::<Vec<_>>();
        if ready.is_empty() {
            return false;
        }
        resolved.extend(ready);
    }
    true
}

fn validate_family_plan(plan: &FamilyPlan) -> Result<Vec<AtomicPlan>, ProxyError> {
    if plan.version != FAMILY_PLAN_PROTOCOL
        || plan.groups.is_empty()
        || plan.groups.len() > MAX_GROUPS
        || plan.master_selection.policy != "first-accepted-grounded-body"
        || plan.delivery.format_id != FAMILY_BUNDLE_PROTOCOL
        || plan.delivery.atlas_policy != "canonical-action-direction-frame"
        || plan.delivery.body_fx_policy != "detached-origin-synchronized"
    {
        return Err(ProxyError::Request(
            "Game Asset family plan protocol or bounded delivery policy is invalid".into(),
        ));
    }
    let group_ids = plan
        .groups
        .iter()
        .map(|group| group.id.as_str())
        .collect::<HashSet<_>>();
    if group_ids.len() != plan.groups.len()
        || plan.master_selection.priority_group_ids.is_empty()
        || plan
            .master_selection
            .priority_group_ids
            .iter()
            .collect::<HashSet<_>>()
            .len()
            != plan.master_selection.priority_group_ids.len()
    {
        return Err(ProxyError::Request(
            "Game Asset family groups and master priorities must be unique".into(),
        ));
    }

    let mut atomic_plans = Vec::with_capacity(plan.groups.len());
    let mut atomic_ids = HashSet::new();
    for group in &plan.groups {
        let atomic = parse_atomic_plan(group)?;
        if atomic.version != "game-asset.plan.v1"
            || atomic.asset_id != plan.asset_id
            || atomic.view != plan.view
            || atomic.roles.is_empty()
            || atomic.roles.len() > MAX_ROLES_PER_GROUP
            || !atomic_ids.insert(atomic.id.clone())
            || atomic.art_direction_evidence.len() != 1
            || atomic.art_direction_evidence[0] != plan.art_direction_evidence
            || !atomic
                .reference_artifacts
                .contains(&plan.identity_reference)
            || group.timing.frame_duration_ms == 0
            || group.dependencies.iter().collect::<HashSet<_>>().len() != group.dependencies.len()
            || group.dependencies.iter().any(|dependency| {
                dependency == &group.id || !group_ids.contains(dependency.as_str())
            })
            || atomic.roles.iter().any(|role| {
                role.asset_id != plan.asset_id
                    || role.action != group.action
                    || role.direction != group.direction
                    || role.expected_alpha_size.width > atomic.delivery.frame_width
                    || role.expected_alpha_size.height > atomic.delivery.frame_height
            })
            || atomic
                .roles
                .iter()
                .map(|role| role.id.as_str())
                .collect::<HashSet<_>>()
                .len()
                != atomic.roles.len()
        {
            return Err(ProxyError::Request(format!(
                "Game Asset family group {} drifted from its exact atomic plan",
                group.id
            )));
        }
        match &group.source {
            FamilySourcePlan::CoherentGrid {
                rows,
                columns,
                initial_provider_call_budget,
            } if *rows > 0
                && *columns > 0
                && rows.saturating_mul(*columns) as usize == atomic.roles.len()
                && *initial_provider_call_budget == 1 => {}
            FamilySourcePlan::RoleIsolated {
                role_ids,
                initial_provider_call_budget,
            } if role_ids
                == &atomic
                    .roles
                    .iter()
                    .map(|role| role.id.clone())
                    .collect::<Vec<_>>()
                && *initial_provider_call_budget as usize == atomic.roles.len() => {}
            _ => {
                return Err(ProxyError::Request(format!(
                    "Game Asset family group {} source strategy does not close its roles",
                    group.id
                )));
            }
        }
        if group.component == "detached-fx" {
            let body_id = group.synchronized_body_group_id.as_ref().ok_or_else(|| {
                ProxyError::Request("Detached Game Asset FX lacks its body relationship".into())
            })?;
            if !group.dependencies.contains(body_id) {
                return Err(ProxyError::Request(
                    "Detached Game Asset FX relationship is not an explicit dependency".into(),
                ));
            }
        } else if group.synchronized_body_group_id.is_some() {
            return Err(ProxyError::Request(
                "Only detached Game Asset FX may bind a synchronized body".into(),
            ));
        }
        atomic_plans.push(atomic);
    }
    if plan
        .master_selection
        .priority_group_ids
        .iter()
        .any(|group_id| {
            plan.groups
                .iter()
                .find(|group| &group.id == group_id)
                .is_none_or(|group| group.compatibility_class != "grounded-body")
        })
    {
        return Err(ProxyError::Request(
            "Game Asset family masters must be grounded body groups".into(),
        ));
    }
    let dependency_graph = plan
        .groups
        .iter()
        .map(|group| (group.id.as_str(), group.dependencies.as_slice()))
        .collect::<Vec<_>>();
    if !dependency_graph_is_acyclic(&dependency_graph) {
        return Err(ProxyError::Request(
            "Game Asset family dependencies contain a cycle".into(),
        ));
    }
    Ok(atomic_plans)
}

fn authorization_identity<T: Serialize>(
    value: &T,
) -> Result<SheetAuthorizationIdentity, ProxyError> {
    parse_serialized(value, "Game Asset family authorization identity is invalid")
}

fn atomic_authorization_identity<T: Serialize>(
    value: &T,
) -> Result<AtomicAuthorizationIdentity, ProxyError> {
    parse_serialized(
        value,
        "Game Asset family atomic authorization identity is invalid",
    )
}

fn repair_authorization_identity<T: Serialize>(
    value: &T,
) -> Result<RepairAuthorizationIdentity, ProxyError> {
    parse_serialized(
        value,
        "Game Asset family repair authorization identity is invalid",
    )
}

fn group_index_by_id(plan: &FamilyPlan, group_id: &str) -> Result<usize, ProxyError> {
    plan.groups
        .iter()
        .position(|group| group.id == group_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset retained evidence belongs to an unknown family group".into(),
            )
        })
}

fn group_index_by_atomic_id(
    atomic_plans: &[AtomicPlan],
    atomic_plan_id: &str,
) -> Result<usize, ProxyError> {
    let matches = atomic_plans
        .iter()
        .enumerate()
        .filter(|(_, plan)| plan.id == atomic_plan_id)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        return Err(ProxyError::Request(
            "Game Asset retained atomic evidence does not identify exactly one family group".into(),
        ));
    }
    Ok(matches[0])
}

fn output_view<T: Serialize>(value: &T) -> Result<RetainedOutputView, ProxyError> {
    parse_serialized(value, "Game Asset retained family output is invalid")
}

fn replacement_frame(
    output: &RetainedOutputView,
    duration_ms: u32,
) -> Result<ClipFrame, ProxyError> {
    if output.media_type != "image/png"
        || !matches!(
            output.source_media_type.as_str(),
            "image/png" | "image/jpeg" | "image/webp"
        )
        || output.source_artifact_bytes_base64.is_empty()
    {
        return Err(ProxyError::Request(
            "Game Asset replacement media closure is invalid".into(),
        ));
    }
    let processing: ProcessingEvidenceView =
        serde_json::from_value(output.processing_evidence.clone()).map_err(|_| {
            ProxyError::Request("Game Asset replacement processing evidence is incomplete".into())
        })?;
    let pixels: PixelEvidenceView =
        serde_json::from_value(output.pixel_evidence.clone()).map_err(|_| {
            ProxyError::Request("Game Asset replacement pixel evidence is incomplete".into())
        })?;
    Ok(ClipFrame {
        role_id: output.role_id.clone(),
        source_artifact_id: output.receipt.artifact.artifact_id.clone(),
        artifact_id: processing.output_artifact_id,
        artifact_sha256: processing.output_artifact_sha256,
        artifact_bytes_base64: output.artifact_bytes_base64.clone(),
        duration_ms,
        anchor: pixels.anchor,
        processing_evidence: output.processing_evidence.clone(),
        pixel_evidence: output.pixel_evidence.clone(),
    })
}

fn reconstruct_complete_repair(
    parent: &ActionClip,
    authorization: &GameAssetActionSheetRepairAuthorization,
    outputs: &[RetainedActionSheetRepairOutput],
    duration_ms: u32,
) -> Result<ActionClip, ProxyError> {
    let authorization_identity = repair_authorization_identity(authorization)?;
    let replacements = outputs
        .iter()
        .map(output_view)
        .collect::<Result<Vec<_>, _>>()?;
    let by_role = replacements
        .iter()
        .map(|output| (output.role_id.as_str(), output))
        .collect::<HashMap<_, _>>();
    if by_role.len() != replacements.len() {
        return Err(ProxyError::Request(
            "Game Asset complete-sheet repair outputs contain duplicate roles".into(),
        ));
    }
    let frames = parent
        .frames
        .iter()
        .map(|frame| {
            by_role
                .get(frame.role_id.as_str())
                .map(|output| replacement_frame(output, duration_ms))
                .unwrap_or_else(|| Ok(frame.clone()))
        })
        .collect::<Result<Vec<_>, ProxyError>>()?;
    if frames
        .iter()
        .filter(|frame| by_role.contains_key(frame.role_id.as_str()))
        .count()
        != replacements.len()
    {
        return Err(ProxyError::Request(
            "Game Asset complete-sheet repair output role is absent from its parent clip".into(),
        ));
    }
    let identity = game_asset_generation::canonical_hash(&serde_json::json!({
        "parentClipId": &parent.id,
        "parentAuthorizationReceiptHash": authorization_identity.parent_authorization_receipt_hash,
        "repairAuthorizationReceiptHash": authorization_identity.receipt_hash,
        "frames": &frames,
    }))?;
    Ok(ActionClip {
        version: "game-asset.action-clip.v1".into(),
        id: format!("clip:game-asset-action-sheet-repair:{identity}"),
        family_plan_id: parent.family_plan_id.clone(),
        group_id: parent.group_id.clone(),
        atomic_plan_id: parent.atomic_plan_id.clone(),
        atomic_plan_hash: parent.atomic_plan_hash.clone(),
        source_id: parent.source_id.clone(),
        frames,
    })
}

fn reconstruct_partial_repair(
    partial: &PartialClip,
    authorization: &GameAssetActionSheetPartialRepairAuthorization,
    outputs: &[RetainedActionSheetRepairOutput],
    atomic_plan: &AtomicPlan,
    looping: bool,
) -> Result<ActionClip, ProxyError> {
    if partial.version != "game-asset.action-sheet-partial.v1"
        || partial.looping != looping
        || partial.failures.is_empty()
    {
        return Err(ProxyError::Request(
            "Game Asset partial-sheet parent protocol is invalid".into(),
        ));
    }
    let authorization_identity = repair_authorization_identity(authorization)?;
    let replacements = outputs
        .iter()
        .map(output_view)
        .collect::<Result<Vec<_>, _>>()?;
    let replacement_by_role = replacements
        .iter()
        .map(|output| (output.role_id.as_str(), output))
        .collect::<HashMap<_, _>>();
    let preserved_by_role = partial
        .frames
        .iter()
        .map(|frame| (frame.role_id.as_str(), frame))
        .collect::<HashMap<_, _>>();
    if replacement_by_role.len() != replacements.len()
        || preserved_by_role.len() != partial.frames.len()
    {
        return Err(ProxyError::Request(
            "Game Asset partial-sheet repair roles are duplicated".into(),
        ));
    }
    let frames = atomic_plan
        .roles
        .iter()
        .map(|role| match (
            preserved_by_role.get(role.id.as_str()),
            replacement_by_role.get(role.id.as_str()),
        ) {
            (Some(frame), None) => Ok((*frame).clone()),
            (None, Some(output)) => replacement_frame(output, partial.frame_duration_ms),
            _ => Err(ProxyError::Request(
                "Game Asset partial-sheet repair does not reconstruct exactly one frame per role".into(),
            )),
        })
        .collect::<Result<Vec<_>, _>>()?;
    let identity = game_asset_generation::canonical_hash(&serde_json::json!({
        "parentPartialId": &partial.id,
        "parentAuthorizationReceiptHash": authorization_identity.parent_authorization_receipt_hash,
        "repairAuthorizationReceiptHash": authorization_identity.receipt_hash,
        "frames": &frames,
    }))?;
    Ok(ActionClip {
        version: "game-asset.action-clip.v1".into(),
        id: format!("clip:game-asset-action-sheet-partial-repair:{identity}"),
        family_plan_id: partial.family_plan_id.clone(),
        group_id: partial.group_id.clone(),
        atomic_plan_id: partial.atomic_plan_id.clone(),
        atomic_plan_hash: partial.atomic_plan_hash.clone(),
        source_id: partial.source_id.clone(),
        frames,
    })
}

fn reconstruct_role_isolated(
    family_plan_id: &str,
    group: &FamilyGroup,
    atomic_plan: &AtomicPlan,
    authorization: &GameAssetGenerationAuthorization,
    outputs: &[RetainedRoleOutput],
) -> Result<ActionClip, ProxyError> {
    let identity = atomic_authorization_identity(authorization)?;
    let output_views = outputs
        .iter()
        .map(output_view)
        .collect::<Result<Vec<_>, _>>()?;
    if output_views.len() != atomic_plan.roles.len()
        || output_views
            .iter()
            .zip(&atomic_plan.roles)
            .any(|(output, role)| output.role_id != role.id)
    {
        return Err(ProxyError::Request(
            "Game Asset role-isolated outputs drifted from atomic role order".into(),
        ));
    }
    let frames = output_views
        .iter()
        .map(|output| replacement_frame(output, group.timing.frame_duration_ms))
        .collect::<Result<Vec<_>, _>>()?;
    let clip_identity = game_asset_generation::canonical_hash(&serde_json::json!({
        "authorizationReceiptHash": &identity.receipt_hash,
        "familyPlanId": family_plan_id,
        "groupId": &group.id,
        "frames": &frames,
    }))?;
    Ok(ActionClip {
        version: "game-asset.action-clip.v1".into(),
        id: format!("clip:game-asset-role-isolated:{clip_identity}"),
        family_plan_id: family_plan_id.into(),
        group_id: group.id.clone(),
        atomic_plan_id: atomic_plan.id.clone(),
        atomic_plan_hash: identity.game_plan_hash,
        source_id: format!("source:game-asset-role-isolated:{}", identity.receipt_hash),
        frames,
    })
}

fn normalization_contract(
    frame: &ClipFrame,
    role: &AtomicRole,
    plan: &AtomicPlan,
) -> Result<(NormalizationContract, PixelEvidenceView, AlphaBounds), ProxyError> {
    let processing: ProcessingEvidenceView =
        serde_json::from_value(frame.processing_evidence.clone()).map_err(|_| {
            ProxyError::Request(
                "Game Asset family requires normalized native processing evidence".into(),
            )
        })?;
    let pixels: PixelEvidenceView = serde_json::from_value(frame.pixel_evidence.clone())
        .map_err(|_| ProxyError::Request("Game Asset family pixel evidence is invalid".into()))?;
    let expected_frame = PixelSize {
        width: plan.delivery.frame_width,
        height: plan.delivery.frame_height,
    };
    let expected_alpha_target = role.expected_alpha_size.clone();
    let expected_scale_policy = if processing.implementation
        == game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION
    {
        game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY
    } else if game_asset_generation::is_spatial_board_cutout_implementation(
        &processing.implementation,
    ) {
        game_asset_generation::SPATIAL_BOARD_CUTOUT_SCALE_POLICY
    } else {
        SCALE_POLICY
    };
    if processing.frame_size != expected_frame
        || processing.alpha_target != expected_alpha_target
        || processing.expected_anchor != role.expected_anchor
        || processing.anchor_policy != role.anchor
        || processing.scale_policy != expected_scale_policy
        || processing.output_artifact_id != frame.artifact_id
        || processing.output_artifact_sha256 != frame.artifact_sha256
        || pixels.implementation != PIXEL_MEASUREMENT_IMPLEMENTATION
        || pixels.decoded_width != expected_frame.width
        || pixels.decoded_height != expected_frame.height
        || pixels.edge_contact
        || pixels.alpha_bounds != processing.output_alpha_bounds
        || pixels.anchor != frame.anchor
        || pixels
            .alpha_bounds
            .x
            .saturating_add(pixels.alpha_bounds.width)
            > pixels.decoded_width
        || pixels
            .alpha_bounds
            .y
            .saturating_add(pixels.alpha_bounds.height)
            > pixels.decoded_height
    {
        return Err(ProxyError::Request(
            "Game Asset family frame drifted from its verified normalization contract".into(),
        ));
    }
    Ok((
        NormalizationContract {
            processor_implementation: processing.implementation,
            frame_size: expected_frame,
            alpha_target: expected_alpha_target,
            expected_anchor: role.expected_anchor.clone(),
            anchor_policy: role.anchor.clone(),
            identity_lock: role.identity_lock.clone(),
            scale_lock: role.scale_lock.clone(),
            scale_policy: expected_scale_policy.into(),
        },
        pixels,
        processing.output_alpha_bounds,
    ))
}

fn same_scale_contract(left: &NormalizationContract, right: &NormalizationContract) -> bool {
    left.processor_implementation == right.processor_implementation
        && left.frame_size == right.frame_size
        && left.alpha_target == right.alpha_target
        && left.expected_anchor == right.expected_anchor
        && left.anchor_policy == right.anchor_policy
        && left.identity_lock == right.identity_lock
        && left.scale_lock == right.scale_lock
        && left.scale_policy == right.scale_policy
}

fn validate_clip(
    family_plan: &FamilyPlan,
    family_plan_hash: &str,
    group: &FamilyGroup,
    atomic: &AtomicPlan,
    clip: &ActionClip,
) -> Result<String, ProxyError> {
    let atomic_hash = game_asset_generation::canonical_hash(&group.plan)?;
    if clip.version != "game-asset.action-clip.v1"
        || clip.family_plan_id != family_plan.id
        || clip.group_id != group.id
        || clip.atomic_plan_id != atomic.id
        || clip.atomic_plan_hash != atomic_hash
        || clip.frames.len() != atomic.roles.len()
        || clip.frames.iter().zip(&atomic.roles).any(|(frame, role)| {
            frame.role_id != role.id || frame.duration_ms != group.timing.frame_duration_ms
        })
        || family_plan_hash.len() != 64
    {
        return Err(ProxyError::Request(format!(
            "Game Asset family clip for {} drifted from its canonical group closure",
            group.id
        )));
    }
    for (frame, role) in clip.frames.iter().zip(&atomic.roles) {
        normalization_contract(frame, role, atomic)?;
    }
    game_asset_generation::canonical_hash(clip)
}

fn validate_decisions(
    family_plan: &FamilyPlan,
    atomic_plans: &[AtomicPlan],
    decisions: &[FamilySemanticDecision],
) -> Result<(), ProxyError> {
    let expected = family_plan
        .groups
        .iter()
        .zip(atomic_plans)
        .flat_map(|(group, plan)| {
            plan.roles
                .iter()
                .map(move |role| (group.id.as_str(), role.id.as_str()))
        })
        .collect::<Vec<_>>();
    if decisions.len() != expected.len()
        || decisions
            .iter()
            .zip(expected)
            .any(|(decision, (group_id, role_id))| {
                decision.group_id != group_id
                    || decision.role_id != role_id
                    || decision.reference_continuity != "accepted"
                    || decision.role_readability != "accepted"
                    || decision.style_consistency != "accepted"
            })
    {
        return Err(ProxyError::Request(
            "Game Asset family semantic decisions must accept every exact role in canonical order"
                .into(),
        ));
    }
    Ok(())
}

fn derive_scale_profile(
    family_plan: &FamilyPlan,
    clips: &[AdmittedClip],
    historical: Option<&GameAssetScaleProfile>,
) -> Result<(GameAssetScaleProfile, String), ProxyError> {
    let master_group_id = family_plan
        .master_selection
        .priority_group_ids
        .iter()
        .find(|group_id| clips.iter().any(|clip| &clip.group_id == *group_id))
        .ok_or_else(|| {
            ProxyError::Request("Game Asset family has no accepted grounded master".into())
        })?;
    let master = clips
        .iter()
        .find(|clip| &clip.group_id == master_group_id)
        .ok_or_else(|| ProxyError::Request("Game Asset family master clip is missing".into()))?;
    let first_role =
        master.atomic_plan.roles.first().ok_or_else(|| {
            ProxyError::Request("Game Asset family master clip has no roles".into())
        })?;
    let first_frame =
        master.clip.frames.first().ok_or_else(|| {
            ProxyError::Request("Game Asset family master clip has no frames".into())
        })?;
    let (master_contract, first_pixels, first_bounds) =
        normalization_contract(first_frame, first_role, &master.atomic_plan)?;
    let mut measured_width = first_bounds.width;
    let mut measured_height = first_bounds.height;
    for (frame, role) in master.clip.frames.iter().zip(&master.atomic_plan.roles) {
        let (contract, pixels, bounds) = normalization_contract(frame, role, &master.atomic_plan)?;
        if !same_scale_contract(&master_contract, &contract)
            || (pixels.anchor.x - first_pixels.anchor.x).abs() > 0.5
            || (pixels.anchor.y - first_pixels.anchor.y).abs() > 0.5
        {
            return Err(ProxyError::Request(
                "Game Asset family master has normalization or anchor drift".into(),
            ));
        }
        measured_width = measured_width.max(bounds.width);
        measured_height = measured_height.max(bounds.height);
    }
    for admitted in clips {
        let group = family_plan
            .groups
            .iter()
            .find(|group| group.id == admitted.group_id)
            .expect("admitted clips were aligned to family groups");
        if group.compatibility_class != "grounded-body" {
            continue;
        }
        for (frame, role) in admitted.clip.frames.iter().zip(&admitted.atomic_plan.roles) {
            let (contract, _, _) = normalization_contract(frame, role, &admitted.atomic_plan)?;
            if !same_scale_contract(&master_contract, &contract) {
                return Err(ProxyError::Request(format!(
                    "Grounded Game Asset group {} is incompatible with the master scale profile",
                    group.id
                )));
            }
        }
    }
    let adopted_from = historical
        .map(|profile| {
            let profile_hash = game_asset_generation::canonical_hash(&profile.payload())?;
            if profile.version != SCALE_PROFILE_PROTOCOL
                || profile.id != format!("scale-profile:{profile_hash}")
                || profile.compatible_classes != ["grounded-body"]
                || profile.measurement_implementation != PIXEL_MEASUREMENT_IMPLEMENTATION
                || profile.normalization_contract != master_contract
            {
                return Err(ProxyError::Request(
                    "Historical Game Asset scale profile adoption requires exact normalization equality"
                        .into(),
                ));
            }
            Ok(AdoptedScaleProfile {
                profile_id: profile.id.clone(),
                profile_hash,
            })
        })
        .transpose()?;
    let payload = ScaleProfilePayload {
        version: SCALE_PROFILE_PROTOCOL.into(),
        family_plan_id: family_plan.id.clone(),
        master_clip_id: master.clip.id.clone(),
        master_clip_hash: master.clip_hash.clone(),
        compatible_classes: vec!["grounded-body".into()],
        canvas: master_contract.frame_size.clone(),
        measured_alpha_size: PixelSize {
            width: measured_width,
            height: measured_height,
        },
        anchor_policy: master_contract.anchor_policy.clone(),
        measured_anchor: first_pixels.anchor,
        identity_lock: master_contract.identity_lock.clone(),
        measurement_implementation: PIXEL_MEASUREMENT_IMPLEMENTATION.into(),
        normalization_contract: master_contract,
        adopted_from,
    };
    let profile_hash = game_asset_generation::canonical_hash(&payload)?;
    Ok((
        GameAssetScaleProfile {
            version: payload.version,
            id: format!("scale-profile:{profile_hash}"),
            family_plan_id: payload.family_plan_id,
            master_clip_id: payload.master_clip_id,
            master_clip_hash: payload.master_clip_hash,
            compatible_classes: payload.compatible_classes,
            canvas: payload.canvas,
            measured_alpha_size: payload.measured_alpha_size,
            anchor_policy: payload.anchor_policy,
            measured_anchor: payload.measured_anchor,
            identity_lock: payload.identity_lock,
            measurement_implementation: payload.measurement_implementation,
            normalization_contract: payload.normalization_contract,
            adopted_from: payload.adopted_from,
        },
        profile_hash,
    ))
}

fn derive_relationships(
    family_plan: &FamilyPlan,
    clips: &[AdmittedClip],
) -> Result<Vec<FamilyRelationship>, ProxyError> {
    family_plan
        .groups
        .iter()
        .filter(|group| group.component == "detached-fx")
        .map(|fx| {
            let body_group_id = fx.synchronized_body_group_id.as_ref().ok_or_else(|| {
                ProxyError::Request("Detached Game Asset FX lacks a synchronized body".into())
            })?;
            let body_group = family_plan
                .groups
                .iter()
                .find(|group| &group.id == body_group_id)
                .ok_or_else(|| {
                    ProxyError::Request("Detached Game Asset FX body group is missing".into())
                })?;
            let body = clips
                .iter()
                .find(|clip| &clip.group_id == body_group_id)
                .ok_or_else(|| {
                    ProxyError::Request("Detached Game Asset FX body is missing".into())
                })?;
            let effect = clips
                .iter()
                .find(|clip| clip.group_id == fx.id)
                .ok_or_else(|| {
                    ProxyError::Request("Detached Game Asset FX clip is missing".into())
                })?;
            if body.clip.frames.len() != effect.clip.frames.len()
                || body_group.timing.frame_duration_ms != fx.timing.frame_duration_ms
            {
                return Err(ProxyError::Request(
                    "Detached Game Asset FX timing does not synchronize with its body".into(),
                ));
            }
            let origin = effect
                .atomic_plan
                .roles
                .first()
                .map(|role| role.expected_anchor.clone())
                .ok_or_else(|| {
                    ProxyError::Request("Detached Game Asset FX body has no anchor".into())
                })?;
            Ok(FamilyRelationship {
                body_group_id: body_group_id.clone(),
                fx_group_id: fx.id.clone(),
                origin,
            })
        })
        .collect()
}

fn parent_evidence_as_family(
    evidence: GroundedNormalizationParentEvidence,
) -> FamilyRetainedEvidence {
    match evidence {
        GroundedNormalizationParentEvidence::CoherentSheet(value) => {
            FamilyRetainedEvidence::CoherentSheet(value)
        }
        GroundedNormalizationParentEvidence::CompleteSheetRepair(value) => {
            FamilyRetainedEvidence::CompleteSheetRepair(value)
        }
        GroundedNormalizationParentEvidence::PartialSheetRepair(value) => {
            FamilyRetainedEvidence::PartialSheetRepair(value)
        }
        GroundedNormalizationParentEvidence::RoleIsolatedAtomicGeneration(value) => {
            FamilyRetainedEvidence::RoleIsolatedAtomicGeneration(value)
        }
    }
}

async fn admit_original_evidence(
    family_plan: &FamilyPlan,
    family_plan_hash: &str,
    atomic_plans: &[AtomicPlan],
    evidence: FamilyRetainedEvidence,
) -> Result<(usize, AdmittedClip), ProxyError> {
    let (group_index, source_kind, receipt_id, receipt_hash, clip) = match evidence {
        FamilyRetainedEvidence::CoherentSheet(retained) => {
            let identity = authorization_identity(&retained.authorization)?;
            let index = group_index_by_id(family_plan, &identity.group_id)?;
            let group = &family_plan.groups[index];
            if identity.family_plan_id != family_plan.id
                || identity.family_plan_hash != family_plan_hash
                || identity.game_plan_id != atomic_plans[index].id
                || identity.game_plan_hash != game_asset_generation::canonical_hash(&group.plan)?
            {
                return Err(ProxyError::Request(
                    "Coherent Game Asset authority drifted from the family plan".into(),
                ));
            }
            if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                return Err(ProxyError::Request(
                    "Coherent Game Asset evidence disagrees with the family source strategy".into(),
                ));
            }
            game_asset_generation::verify_game_asset_action_sheet_authorization(
                retained.authorization.clone(),
                group.plan.clone(),
                retained.source.clone(),
                retained.clip.clone(),
            )?;
            let clip: ActionClip = parse_serialized(
                &retained.clip,
                "Verified coherent Game Asset clip is invalid",
            )?;
            (
                index,
                FamilySourceKind::CoherentSheet,
                identity.receipt_id,
                identity.receipt_hash,
                clip,
            )
        }
        FamilyRetainedEvidence::CompleteSheetRepair(retained) => {
            let identity = repair_authorization_identity(&retained.repair_authorization)?;
            let index = group_index_by_id(family_plan, &identity.group_id)?;
            let group = &family_plan.groups[index];
            if identity.family_plan_id != family_plan.id
                || identity.family_plan_hash != family_plan_hash
                || identity.game_plan_id != atomic_plans[index].id
                || identity.game_plan_hash != game_asset_generation::canonical_hash(&group.plan)?
            {
                return Err(ProxyError::Request(
                    "Complete-sheet repair authority drifted from the family plan".into(),
                ));
            }
            if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                return Err(ProxyError::Request(
                    "Complete-sheet repair disagrees with the family source strategy".into(),
                ));
            }
            game_asset_generation::verify_game_asset_action_sheet_repair_authorization(
                retained.repair_authorization.clone(),
                group.plan.clone(),
                retained.parent_authorization.clone(),
                retained.parent_source.clone(),
                retained.parent_clip.clone(),
                retained.outputs.clone(),
            )?;
            let parent: ActionClip = parse_serialized(
                &retained.parent_clip,
                "Verified Game Asset repair parent clip is invalid",
            )?;
            let clip = reconstruct_complete_repair(
                &parent,
                &retained.repair_authorization,
                &retained.outputs,
                group.timing.frame_duration_ms,
            )?;
            (
                index,
                FamilySourceKind::CompleteSheetRepair,
                identity.receipt_id,
                identity.receipt_hash,
                clip,
            )
        }
        FamilyRetainedEvidence::PartialSheetRepair(retained) => {
            let identity = repair_authorization_identity(&retained.repair_authorization)?;
            let index = group_index_by_id(family_plan, &identity.group_id)?;
            let group = &family_plan.groups[index];
            if identity.family_plan_id != family_plan.id
                || identity.family_plan_hash != family_plan_hash
                || identity.game_plan_id != atomic_plans[index].id
                || identity.game_plan_hash != game_asset_generation::canonical_hash(&group.plan)?
            {
                return Err(ProxyError::Request(
                    "Partial-sheet repair authority drifted from the family plan".into(),
                ));
            }
            if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                return Err(ProxyError::Request(
                    "Partial-sheet repair disagrees with the family source strategy".into(),
                ));
            }
            game_asset_generation::verify_game_asset_action_sheet_partial_repair_authorization(
                retained.repair_authorization.clone(),
                group.plan.clone(),
                retained.parent_authorization.clone(),
                retained.parent_source.clone(),
                retained.parent_partial.clone(),
                retained.outputs.clone(),
            )?;
            let partial: PartialClip = parse_serialized(
                &retained.parent_partial,
                "Verified Game Asset partial repair parent is invalid",
            )?;
            let clip = reconstruct_partial_repair(
                &partial,
                &retained.repair_authorization,
                &retained.outputs,
                &atomic_plans[index],
                group.timing.looping,
            )?;
            (
                index,
                FamilySourceKind::PartialSheetRepair,
                identity.receipt_id,
                identity.receipt_hash,
                clip,
            )
        }
        FamilyRetainedEvidence::RoleIsolatedAtomicGeneration(retained) => {
            let identity = atomic_authorization_identity(&retained.authorization)?;
            let index = group_index_by_atomic_id(atomic_plans, &identity.game_plan_id)?;
            let group = &family_plan.groups[index];
            if !matches!(group.source, FamilySourcePlan::RoleIsolated { .. }) {
                return Err(ProxyError::Request(
                    "Role-isolated Game Asset evidence disagrees with the family source strategy"
                        .into(),
                ));
            }
            game_asset_generation::verify_game_asset_generation_authorization(
                retained.authorization.clone(),
                retained.outputs.clone(),
            )
            .await?;
            let clip = reconstruct_role_isolated(
                &family_plan.id,
                group,
                &atomic_plans[index],
                &retained.authorization,
                &retained.outputs,
            )?;
            (
                index,
                FamilySourceKind::RoleIsolatedAtomicGeneration,
                identity.receipt_id,
                identity.receipt_hash,
                clip,
            )
        }
        FamilyRetainedEvidence::GroundedNormalizationMigration(_) => {
            return Err(ProxyError::Request(
                "A grounded normalization migration cannot be used as original Provider authority"
                    .into(),
            ));
        }
        FamilyRetainedEvidence::LocalPartialReprocess(_) => {
            return Err(ProxyError::Request(
                "A local partial reprocess cannot be used as original grounded normalization authority"
                    .into(),
            ));
        }
    };
    let group = &family_plan.groups[group_index];
    let atomic = &atomic_plans[group_index];
    let expected_atomic_hash = game_asset_generation::canonical_hash(&group.plan)?;
    let authority_identity_ok = match source_kind {
        FamilySourceKind::RoleIsolatedAtomicGeneration => {
            clip.atomic_plan_id == atomic.id && clip.atomic_plan_hash == expected_atomic_hash
        }
        _ => clip.family_plan_id == family_plan.id,
    };
    if !authority_identity_ok {
        return Err(ProxyError::Request(
            "Game Asset family authority drifted from its plan identity".into(),
        ));
    }
    let clip_hash = validate_clip(family_plan, family_plan_hash, group, atomic, &clip)?;
    Ok((
        group_index,
        AdmittedClip {
            group_id: group.id.clone(),
            source_kind,
            authority_receipt_id: receipt_id,
            authority_receipt_hash: receipt_hash,
            clip,
            clip_hash,
            atomic_plan: atomic.clone(),
        },
    ))
}

fn group_reference_indices(
    ids: &[String],
    groups: &[FamilyGroup],
) -> Result<Vec<usize>, ProxyError> {
    ids.iter()
        .map(|id| {
            groups
                .iter()
                .position(|group| &group.id == id)
                .ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset successor plan contains an unknown group reference".into(),
                    )
                })
        })
        .collect()
}

fn source_strategy_shape_matches(parent: &FamilySourcePlan, successor: &FamilySourcePlan) -> bool {
    match (parent, successor) {
        (
            FamilySourcePlan::CoherentGrid {
                rows: parent_rows,
                columns: parent_columns,
                initial_provider_call_budget: parent_budget,
            },
            FamilySourcePlan::CoherentGrid {
                rows: successor_rows,
                columns: successor_columns,
                initial_provider_call_budget: successor_budget,
            },
        ) => {
            parent_rows == successor_rows
                && parent_columns == successor_columns
                && parent_budget == successor_budget
        }
        (
            FamilySourcePlan::RoleIsolated {
                role_ids: parent_roles,
                initial_provider_call_budget: parent_budget,
            },
            FamilySourcePlan::RoleIsolated {
                role_ids: successor_roles,
                initial_provider_call_budget: successor_budget,
            },
        ) => parent_roles.len() == successor_roles.len() && parent_budget == successor_budget,
        _ => false,
    }
}

fn successor_source_brief_matches(
    compatibility_class: &str,
    parent: &str,
    successor: &str,
) -> bool {
    if compatibility_class != "detached-fx" {
        return parent == successor;
    }
    let mut expected = parent.to_string();
    for constraint in [
        ACTION_SHEET_NO_GROUND_CONSTRAINT,
        ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT,
    ] {
        if !parent.contains(constraint) {
            expected.push('\n');
            expected.push_str(constraint);
        }
    }
    successor == expected
}

fn grounded_safe_alpha_target(
    role: &AtomicRole,
    delivery: &AtomicDelivery,
) -> Result<PixelSize, ProxyError> {
    const SAFE_MARGIN: u32 = 32;
    if role.anchor != "feet"
        || !role.expected_anchor.x.is_finite()
        || role.expected_anchor.x < 0.0
        || role.expected_anchor.x > f64::from(delivery.frame_width)
    {
        return Err(ProxyError::Request(
            "Grounded Game Asset normalization requires a bounded feet anchor".into(),
        ));
    }
    let left = role.expected_anchor.x.floor() as u32;
    let right = (f64::from(delivery.frame_width) - role.expected_anchor.x).floor() as u32;
    let safe_half_width = left.min(right).checked_sub(SAFE_MARGIN).ok_or_else(|| {
        ProxyError::Request("Grounded Game Asset frame has no safe horizontal canvas".into())
    })?;
    let width = safe_half_width.checked_mul(2).ok_or_else(|| {
        ProxyError::Request("Grounded Game Asset safe canvas width overflowed".into())
    })?;
    if width < role.expected_alpha_size.width
        || role.expected_alpha_size.height > delivery.frame_height
    {
        return Err(ProxyError::Request(
            "Grounded Game Asset safe canvas cannot contain its parent envelope".into(),
        ));
    }
    Ok(PixelSize {
        width,
        height: role.expected_alpha_size.height,
    })
}

fn expected_grounded_scale_lock(
    parent: &AtomicRole,
    successor: &AtomicRole,
) -> Result<EvidenceReference, ProxyError> {
    let hash = game_asset_generation::canonical_hash(&serde_json::json!({
        "version": "game-asset.grounded-normalization-lock.v1",
        "parentScaleLock": &parent.scale_lock,
        "expectedAlphaSize": &successor.expected_alpha_size,
        "processorImplementation": game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION,
        "scalePolicy": game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY,
    }))?;
    Ok(EvidenceReference {
        id: format!("evidence:game-asset-grounded-normalization-lock:{hash}"),
        revision: format!("revision:sha256:{hash}"),
        content_hash: hash,
    })
}

fn validate_grounded_successor(
    parent: &FamilyPlan,
    parent_atomic: &[AtomicPlan],
    successor: &FamilyPlan,
    successor_atomic: &[AtomicPlan],
) -> Result<(), ProxyError> {
    if parent.id == successor.id
        || parent.asset_id == successor.asset_id
        || parent.kind != successor.kind
        || parent.view != successor.view
        || parent.identity_reference != successor.identity_reference
        || parent.art_direction_evidence != successor.art_direction_evidence
        || parent.delivery != successor.delivery
        || parent.groups.len() != successor.groups.len()
        || parent_atomic.len() != successor_atomic.len()
        || group_reference_indices(&parent.master_selection.priority_group_ids, &parent.groups)?
            != group_reference_indices(
                &successor.master_selection.priority_group_ids,
                &successor.groups,
            )?
    {
        return Err(ProxyError::Request(
            "Grounded Game Asset successor changed identity, delivery, or family topology".into(),
        ));
    }
    for index in 0..parent.groups.len() {
        let parent_group = &parent.groups[index];
        let successor_group = &successor.groups[index];
        let parent_plan = &parent_atomic[index];
        let successor_plan = &successor_atomic[index];
        let parent_sync = parent_group
            .synchronized_body_group_id
            .as_ref()
            .map(|id| group_reference_indices(std::slice::from_ref(id), &parent.groups))
            .transpose()?;
        let successor_sync = successor_group
            .synchronized_body_group_id
            .as_ref()
            .map(|id| group_reference_indices(std::slice::from_ref(id), &successor.groups))
            .transpose()?;
        if parent_group.id == successor_group.id
            || parent_plan.id == successor_plan.id
            || parent_group.label != successor_group.label
            || parent_group.component != successor_group.component
            || parent_group.compatibility_class != successor_group.compatibility_class
            || parent_group.action != successor_group.action
            || parent_group.direction != successor_group.direction
            || parent_group.timing != successor_group.timing
            || !successor_source_brief_matches(
                &parent_group.compatibility_class,
                &parent_group.source_brief,
                &successor_group.source_brief,
            )
            || !source_strategy_shape_matches(&parent_group.source, &successor_group.source)
            || group_reference_indices(&parent_group.dependencies, &parent.groups)?
                != group_reference_indices(&successor_group.dependencies, &successor.groups)?
            || parent_sync != successor_sync
            || parent_plan.version != successor_plan.version
            || parent_plan.asset_id == successor_plan.asset_id
            || successor_plan.asset_id != successor.asset_id
            || parent_plan.kind != successor_plan.kind
            || parent_plan.view != successor_plan.view
            || parent_plan.art_direction_evidence != successor_plan.art_direction_evidence
            || parent_plan.reference_artifacts != successor_plan.reference_artifacts
            || parent_plan.delivery != successor_plan.delivery
            || parent_plan.roles.len() != successor_plan.roles.len()
        {
            return Err(ProxyError::Request(format!(
                "Grounded Game Asset successor group {} changed non-migration semantics",
                parent_group.id
            )));
        }
        let grounded = parent_group.compatibility_class == "grounded-body";
        for (parent_role, successor_role) in parent_plan.roles.iter().zip(&successor_plan.roles) {
            if parent_role.id == successor_role.id
                || parent_role.asset_id == successor_role.asset_id
                || successor_role.asset_id != successor.asset_id
                || parent_role.action != successor_role.action
                || parent_role.direction != successor_role.direction
                || parent_role.frame_index != successor_role.frame_index
                || parent_role.output_schema != successor_role.output_schema
                || parent_role.identity_lock != successor_role.identity_lock
                || parent_role.anchor_lock != successor_role.anchor_lock
                || parent_role.anchor != successor_role.anchor
                || parent_role.expected_anchor != successor_role.expected_anchor
            {
                return Err(ProxyError::Request(
                    "Grounded Game Asset successor role changed identity or anchor semantics"
                        .into(),
                ));
            }
            if grounded {
                if successor_role.expected_alpha_size
                    != grounded_safe_alpha_target(parent_role, &parent_plan.delivery)?
                    || successor_role.scale_lock
                        != expected_grounded_scale_lock(parent_role, successor_role)?
                {
                    return Err(ProxyError::Request(
                        "Grounded Game Asset successor lacks the exact safe envelope and processor-bound scale lock"
                            .into(),
                    ));
                }
            } else if successor_role.expected_alpha_size != parent_role.expected_alpha_size
                || successor_role.scale_lock != parent_role.scale_lock
            {
                return Err(ProxyError::Request(
                    "Non-grounded Game Asset geometry changed during grounded normalization".into(),
                ));
            }
        }
    }
    Ok(())
}

fn derive_grounded_clip(
    parent: &AdmittedClip,
    parent_family_plan_hash: &str,
    successor_family_plan: &FamilyPlan,
    successor_family_plan_hash: &str,
    successor_group: &FamilyGroup,
    successor_atomic: &AtomicPlan,
) -> Result<(ActionClip, String, Vec<GroundedNormalizationFrameLineage>), ProxyError> {
    if successor_group.compatibility_class != "grounded-body"
        || successor_group.component != "body"
        || parent.clip.frames.len() != successor_atomic.roles.len()
    {
        return Err(ProxyError::Request(
            "Only complete grounded body clips may enter family normalization".into(),
        ));
    }
    let mut frames = Vec::with_capacity(parent.clip.frames.len());
    let mut frame_lineage = Vec::with_capacity(parent.clip.frames.len());
    for ((parent_frame, parent_role), successor_role) in parent
        .clip
        .frames
        .iter()
        .zip(&parent.atomic_plan.roles)
        .zip(&successor_atomic.roles)
    {
        let source_bytes = STANDARD
            .decode(&parent_frame.artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request("Grounded Game Asset parent frame base64 is invalid".into())
            })?;
        if sha256(&source_bytes) != parent_frame.artifact_sha256
            || parent_frame.artifact_id
                != format!("artifact:sha256:{}", parent_frame.artifact_sha256)
        {
            return Err(ProxyError::Request(
                "Grounded Game Asset parent frame bytes drifted from authority".into(),
            ));
        }
        let (output_bytes, processing, pixels) =
            game_asset_generation::derive_verified_alpha_grounded_frame(
                &source_bytes,
                &parent_frame.artifact_id,
                &parent_frame.artifact_sha256,
                successor_atomic.delivery.frame_width,
                successor_atomic.delivery.frame_height,
                successor_role.expected_alpha_size.width,
                successor_role.expected_alpha_size.height,
                successor_role.expected_anchor.x,
                successor_role.expected_anchor.y,
                &successor_role.anchor,
            )?;
        let processing_value = serde_json::to_value(&processing).map_err(|_| {
            ProxyError::Request("Grounded Game Asset processing evidence is invalid".into())
        })?;
        let pixel_value = serde_json::to_value(&pixels).map_err(|_| {
            ProxyError::Request("Grounded Game Asset pixel evidence is invalid".into())
        })?;
        let processing_view: ProcessingEvidenceView =
            serde_json::from_value(processing_value.clone()).map_err(|_| {
                ProxyError::Request("Grounded Game Asset processing evidence is incomplete".into())
            })?;
        let pixel_view: PixelEvidenceView =
            serde_json::from_value(pixel_value.clone()).map_err(|_| {
                ProxyError::Request("Grounded Game Asset pixel evidence is incomplete".into())
            })?;
        frame_lineage.push(GroundedNormalizationFrameLineage {
            parent_role_id: parent_role.id.clone(),
            successor_role_id: successor_role.id.clone(),
            source_artifact_id: parent_frame.artifact_id.clone(),
            source_artifact_sha256: parent_frame.artifact_sha256.clone(),
            output_artifact_id: processing_view.output_artifact_id.clone(),
            output_artifact_sha256: processing_view.output_artifact_sha256.clone(),
        });
        frames.push(ClipFrame {
            role_id: successor_role.id.clone(),
            source_artifact_id: parent_frame.artifact_id.clone(),
            artifact_id: processing_view.output_artifact_id,
            artifact_sha256: processing_view.output_artifact_sha256,
            artifact_bytes_base64: STANDARD.encode(output_bytes),
            duration_ms: successor_group.timing.frame_duration_ms,
            anchor: pixel_view.anchor,
            processing_evidence: processing_value,
            pixel_evidence: pixel_value,
        });
    }
    let successor_atomic_hash = game_asset_generation::canonical_hash(&successor_group.plan)?;
    let clip_identity = game_asset_generation::canonical_hash(&serde_json::json!({
        "parentAuthorityReceiptHash": &parent.authority_receipt_hash,
        "parentClipId": &parent.clip.id,
        "parentClipHash": &parent.clip_hash,
        "parentFamilyPlanHash": parent_family_plan_hash,
        "successorFamilyPlanHash": successor_family_plan_hash,
        "processorImplementation": game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION,
        "scalePolicy": game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY,
        "frames": &frames,
    }))?;
    let clip = ActionClip {
        version: "game-asset.action-clip.v1".into(),
        id: format!("clip:game-asset-grounded-normalization:{clip_identity}"),
        family_plan_id: successor_family_plan.id.clone(),
        group_id: successor_group.id.clone(),
        atomic_plan_id: successor_atomic.id.clone(),
        atomic_plan_hash: successor_atomic_hash,
        source_id: format!(
            "source:game-asset-grounded-normalization:{}",
            parent.clip_hash
        ),
        frames,
    };
    let clip_hash = validate_clip(
        successor_family_plan,
        successor_family_plan_hash,
        successor_group,
        successor_atomic,
        &clip,
    )?;
    Ok((clip, clip_hash, frame_lineage))
}

async fn prepare_grounded_normalization(
    input: GameAssetGroundedNormalizationPreviewInput,
    now: u64,
) -> Result<PreparedGroundedNormalization, ProxyError> {
    let parent_family_plan: FamilyPlan = serde_json::from_value(input.parent_family_plan.clone())
        .map_err(|_| {
        ProxyError::Request("Grounded Game Asset parent family plan is invalid".into())
    })?;
    let successor_family_plan: FamilyPlan =
        serde_json::from_value(input.successor_family_plan.clone()).map_err(|_| {
            ProxyError::Request("Grounded Game Asset successor family plan is invalid".into())
        })?;
    let parent_atomic = validate_family_plan(&parent_family_plan)?;
    let successor_atomic = validate_family_plan(&successor_family_plan)?;
    validate_grounded_successor(
        &parent_family_plan,
        &parent_atomic,
        &successor_family_plan,
        &successor_atomic,
    )?;
    let parent_family_plan_hash = game_asset_generation::canonical_hash(&input.parent_family_plan)?;
    let successor_family_plan_hash =
        game_asset_generation::canonical_hash(&input.successor_family_plan)?;
    if parent_family_plan_hash == successor_family_plan_hash {
        return Err(ProxyError::Request(
            "Grounded Game Asset successor must be a new frozen family revision".into(),
        ));
    }
    let (group_index, parent) = admit_original_evidence(
        &parent_family_plan,
        &parent_family_plan_hash,
        &parent_atomic,
        parent_evidence_as_family(input.parent_evidence),
    )
    .await?;
    let parent_group = &parent_family_plan.groups[group_index];
    let successor_group = &successor_family_plan.groups[group_index];
    if parent_group.compatibility_class != "grounded-body"
        || successor_group.compatibility_class != "grounded-body"
    {
        return Err(ProxyError::Request(
            "Grounded normalization cannot migrate FX, projectile, impact, or airborne groups"
                .into(),
        ));
    }
    let (successor_clip, successor_clip_hash, frame_lineage) = derive_grounded_clip(
        &parent,
        &parent_family_plan_hash,
        &successor_family_plan,
        &successor_family_plan_hash,
        successor_group,
        &successor_atomic[group_index],
    )?;
    let request_digest = game_asset_generation::canonical_hash(&serde_json::json!({
        "protocol": GROUNDED_NORMALIZATION_PREVIEW_PROTOCOL,
        "parentFamilyPlanId": &parent_family_plan.id,
        "parentFamilyPlanHash": &parent_family_plan_hash,
        "successorFamilyPlanId": &successor_family_plan.id,
        "successorFamilyPlanHash": &successor_family_plan_hash,
        "parentGroupId": &parent_group.id,
        "successorGroupId": &successor_group.id,
        "parentAuthorityReceiptId": &parent.authority_receipt_id,
        "parentAuthorityReceiptHash": &parent.authority_receipt_hash,
        "parentClipId": &parent.clip.id,
        "parentClipHash": &parent.clip_hash,
        "successorClipId": &successor_clip.id,
        "successorClipHash": &successor_clip_hash,
        "processorImplementation": game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION,
        "scalePolicy": game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY,
        "frameLineage": &frame_lineage,
        "executionMode": "deterministic-local-derivation",
        "providerCalls": 0,
    }))?;
    let preview = GameAssetGroundedNormalizationPreview {
        protocol: GROUNDED_NORMALIZATION_PREVIEW_PROTOCOL.into(),
        plan_id: format!("game-asset-grounded-normalization-preview:sha256:{request_digest}"),
        request_digest,
        parent_family_plan_id: parent_family_plan.id,
        parent_family_plan_hash,
        successor_family_plan_id: successor_family_plan.id.clone(),
        successor_family_plan_hash: successor_family_plan_hash.clone(),
        parent_group_id: parent_group.id.clone(),
        successor_group_id: successor_group.id.clone(),
        parent_clip_id: parent.clip.id.clone(),
        successor_clip_id: successor_clip.id.clone(),
        role_ids: successor_atomic[group_index]
            .roles
            .iter()
            .map(|role| role.id.clone())
            .collect(),
        source_artifact_ids: frame_lineage
            .iter()
            .map(|frame| frame.source_artifact_id.clone())
            .collect(),
        output_artifact_ids: frame_lineage
            .iter()
            .map(|frame| frame.output_artifact_id.clone())
            .collect(),
        processor_implementation: game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION
            .into(),
        scale_policy: game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY.into(),
        execution_mode: "deterministic-local-derivation".into(),
        provider_calls: 0,
        expires_at: now + PREVIEW_TTL_MS,
    };
    Ok(PreparedGroundedNormalization {
        preview,
        parent,
        successor_family_plan_hash,
        successor_atomic_plan: successor_atomic[group_index].clone(),
        successor_clip,
        successor_clip_hash,
        frame_lineage,
    })
}

fn issue_grounded_normalization(
    prepared: &PreparedGroundedNormalization,
    started_at: u64,
    completed_at: u64,
) -> Result<GameAssetGroundedNormalizationAuthorization, ProxyError> {
    let payload = GroundedNormalizationAuthorizationPayload {
        protocol: GROUNDED_NORMALIZATION_AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-grounded-normalization:{}",
            uuid::Uuid::new_v4().simple()
        ),
        preview_id: prepared.preview.plan_id.clone(),
        request_digest: prepared.preview.request_digest.clone(),
        parent_family_plan_id: prepared.preview.parent_family_plan_id.clone(),
        parent_family_plan_hash: prepared.preview.parent_family_plan_hash.clone(),
        successor_family_plan_id: prepared.preview.successor_family_plan_id.clone(),
        successor_family_plan_hash: prepared.preview.successor_family_plan_hash.clone(),
        parent_group_id: prepared.preview.parent_group_id.clone(),
        successor_group_id: prepared.preview.successor_group_id.clone(),
        parent_atomic_plan_id: prepared.parent.atomic_plan.id.clone(),
        parent_atomic_plan_hash: prepared.parent.clip.atomic_plan_hash.clone(),
        successor_atomic_plan_id: prepared.successor_atomic_plan.id.clone(),
        successor_atomic_plan_hash: prepared.successor_clip.atomic_plan_hash.clone(),
        parent_authority_receipt_id: prepared.parent.authority_receipt_id.clone(),
        parent_authority_receipt_hash: prepared.parent.authority_receipt_hash.clone(),
        parent_clip_id: prepared.parent.clip.id.clone(),
        parent_clip_hash: prepared.parent.clip_hash.clone(),
        successor_clip_id: prepared.successor_clip.id.clone(),
        successor_clip_hash: prepared.successor_clip_hash.clone(),
        processor_implementation: game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION
            .into(),
        scale_policy: game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY.into(),
        frame_lineage: prepared.frame_lineage.clone(),
        execution_mode: "deterministic-local-derivation".into(),
        provider_calls: 0,
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetGroundedNormalizationAuthorization {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash,
        preview_id: payload.preview_id,
        request_digest: payload.request_digest,
        parent_family_plan_id: payload.parent_family_plan_id,
        parent_family_plan_hash: payload.parent_family_plan_hash,
        successor_family_plan_id: payload.successor_family_plan_id,
        successor_family_plan_hash: payload.successor_family_plan_hash,
        parent_group_id: payload.parent_group_id,
        successor_group_id: payload.successor_group_id,
        parent_atomic_plan_id: payload.parent_atomic_plan_id,
        parent_atomic_plan_hash: payload.parent_atomic_plan_hash,
        successor_atomic_plan_id: payload.successor_atomic_plan_id,
        successor_atomic_plan_hash: payload.successor_atomic_plan_hash,
        parent_authority_receipt_id: payload.parent_authority_receipt_id,
        parent_authority_receipt_hash: payload.parent_authority_receipt_hash,
        parent_clip_id: payload.parent_clip_id,
        parent_clip_hash: payload.parent_clip_hash,
        successor_clip_id: payload.successor_clip_id,
        successor_clip_hash: payload.successor_clip_hash,
        processor_implementation: payload.processor_implementation,
        scale_policy: payload.scale_policy,
        frame_lineage: payload.frame_lineage,
        execution_mode: payload.execution_mode,
        provider_calls: payload.provider_calls,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

async fn verify_grounded_normalization_closure(
    authorization: &GameAssetGroundedNormalizationAuthorization,
    input: GameAssetGroundedNormalizationPreviewInput,
    clip: &ActionClip,
) -> Result<PreparedGroundedNormalization, ProxyError> {
    let prepared = prepare_grounded_normalization(input, authorization.started_at).await?;
    if authorization.protocol != GROUNDED_NORMALIZATION_AUTHORIZATION_PROTOCOL
        || authorization.preview_id != prepared.preview.plan_id
        || authorization.request_digest != prepared.preview.request_digest
        || authorization.parent_family_plan_id != prepared.preview.parent_family_plan_id
        || authorization.parent_family_plan_hash != prepared.preview.parent_family_plan_hash
        || authorization.successor_family_plan_id != prepared.preview.successor_family_plan_id
        || authorization.successor_family_plan_hash != prepared.successor_family_plan_hash
        || authorization.parent_group_id != prepared.preview.parent_group_id
        || authorization.successor_group_id != prepared.preview.successor_group_id
        || authorization.parent_atomic_plan_id != prepared.parent.atomic_plan.id
        || authorization.parent_atomic_plan_hash != prepared.parent.clip.atomic_plan_hash
        || authorization.successor_atomic_plan_id != prepared.successor_atomic_plan.id
        || authorization.successor_atomic_plan_hash != prepared.successor_clip.atomic_plan_hash
        || authorization.parent_authority_receipt_id != prepared.parent.authority_receipt_id
        || authorization.parent_authority_receipt_hash != prepared.parent.authority_receipt_hash
        || authorization.parent_clip_id != prepared.parent.clip.id
        || authorization.parent_clip_hash != prepared.parent.clip_hash
        || authorization.successor_clip_id != prepared.successor_clip.id
        || authorization.successor_clip_hash != prepared.successor_clip_hash
        || authorization.processor_implementation
            != game_asset_generation::GROUNDED_NORMALIZATION_IMPLEMENTATION
        || authorization.scale_policy != game_asset_generation::GROUNDED_NORMALIZATION_SCALE_POLICY
        || authorization.frame_lineage != prepared.frame_lineage
        || authorization.execution_mode != "deterministic-local-derivation"
        || authorization.provider_calls != 0
        || authorization.completed_at < authorization.started_at
        || clip != &prepared.successor_clip
    {
        return Err(ProxyError::Request(
            "Grounded Game Asset normalization drifted from replayed parent bytes or successor authority"
                .into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    Ok(prepared)
}

#[tauri::command]
pub async fn preview_game_asset_grounded_normalization(
    state: State<'_, GameAssetFamilyState>,
    input: GameAssetGroundedNormalizationPreviewInput,
) -> Result<GameAssetGroundedNormalizationPreview, ProxyError> {
    let now = unix_millis()?;
    let prepared = prepare_grounded_normalization(input, now).await?;
    let preview = prepared.preview.clone();
    let mut previews = state
        .grounded_normalization_previews
        .lock()
        .map_err(|_| ProxyError::Request("Grounded Game Asset state is unavailable".into()))?;
    previews.retain(|_, stored| stored.prepared.preview.expires_at > now);
    if previews.len() >= MAX_ACTIVE_PREVIEWS && !previews.contains_key(&preview.plan_id) {
        return Err(ProxyError::Request(
            "Grounded Game Asset normalization preview capacity is exhausted".into(),
        ));
    }
    previews.insert(
        preview.plan_id.clone(),
        StoredGroundedNormalizationPreview { prepared },
    );
    Ok(preview)
}

#[tauri::command]
pub async fn apply_game_asset_grounded_normalization(
    state: State<'_, GameAssetFamilyState>,
    plan_id: String,
) -> Result<AppliedGameAssetGroundedNormalization, ProxyError> {
    let stored = state
        .grounded_normalization_previews
        .lock()
        .map_err(|_| ProxyError::Request("Grounded Game Asset state is unavailable".into()))?
        .remove(&plan_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Grounded Game Asset normalization preview is missing, expired, or consumed".into(),
            )
        })?;
    let started_at = unix_millis()?;
    if stored.prepared.preview.expires_at <= started_at {
        return Err(ProxyError::Request(
            "Grounded Game Asset normalization preview expired".into(),
        ));
    }
    let authorization = issue_grounded_normalization(&stored.prepared, started_at, unix_millis()?)?;
    Ok(AppliedGameAssetGroundedNormalization {
        authorization,
        clip: stored.prepared.successor_clip,
    })
}

#[tauri::command]
pub async fn verify_game_asset_grounded_normalization_authorization(
    authorization: GameAssetGroundedNormalizationAuthorization,
    input: GameAssetGroundedNormalizationPreviewInput,
    clip: ActionClip,
) -> Result<GameAssetGroundedNormalizationAuthorization, ProxyError> {
    verify_grounded_normalization_closure(&authorization, input, &clip).await?;
    Ok(authorization)
}

async fn build_verified_closure(
    input: GameAssetFamilyProductionInput,
) -> Result<VerifiedFamilyClosure, ProxyError> {
    let family_plan: FamilyPlan = serde_json::from_value(input.family_plan.clone())
        .map_err(|_| ProxyError::Request("Game Asset family plan is invalid".into()))?;
    let atomic_plans = validate_family_plan(&family_plan)?;
    validate_decisions(&family_plan, &atomic_plans, &input.decisions)?;
    if input.retained_evidence.len() != family_plan.groups.len() {
        return Err(ProxyError::Request(
            "Game Asset family evidence must close every exact action group".into(),
        ));
    }
    let family_plan_hash = game_asset_generation::canonical_hash(&input.family_plan)?;
    let mut admitted_by_group: Vec<Option<AdmittedClip>> = vec![None; family_plan.groups.len()];

    for evidence in input.retained_evidence {
        let (group_index, source_kind, receipt_id, receipt_hash, clip) = match evidence {
            FamilyRetainedEvidence::CoherentSheet(retained) => {
                let identity = authorization_identity(&retained.authorization)?;
                let index = group_index_by_id(&family_plan, &identity.group_id)?;
                let group = &family_plan.groups[index];
                if identity.family_plan_id != family_plan.id
                    || identity.family_plan_hash != family_plan_hash
                    || identity.game_plan_id != atomic_plans[index].id
                    || identity.game_plan_hash
                        != game_asset_generation::canonical_hash(&group.plan)?
                {
                    return Err(ProxyError::Request(
                        "Coherent Game Asset authority drifted from the family plan".into(),
                    ));
                }
                if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                    return Err(ProxyError::Request(
                        "Coherent Game Asset evidence disagrees with the family source strategy"
                            .into(),
                    ));
                }
                game_asset_generation::verify_game_asset_action_sheet_authorization(
                    retained.authorization.clone(),
                    group.plan.clone(),
                    retained.source.clone(),
                    retained.clip.clone(),
                )?;
                let clip: ActionClip = parse_serialized(
                    &retained.clip,
                    "Verified coherent Game Asset clip is invalid",
                )?;
                (
                    index,
                    FamilySourceKind::CoherentSheet,
                    identity.receipt_id,
                    identity.receipt_hash,
                    clip,
                )
            }
            FamilyRetainedEvidence::CompleteSheetRepair(retained) => {
                let identity = repair_authorization_identity(&retained.repair_authorization)?;
                let index = group_index_by_id(&family_plan, &identity.group_id)?;
                let group = &family_plan.groups[index];
                if identity.family_plan_id != family_plan.id
                    || identity.family_plan_hash != family_plan_hash
                    || identity.game_plan_id != atomic_plans[index].id
                    || identity.game_plan_hash
                        != game_asset_generation::canonical_hash(&group.plan)?
                {
                    return Err(ProxyError::Request(
                        "Complete-sheet repair authority drifted from the family plan".into(),
                    ));
                }
                if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                    return Err(ProxyError::Request(
                        "Complete-sheet repair disagrees with the family source strategy".into(),
                    ));
                }
                game_asset_generation::verify_game_asset_action_sheet_repair_authorization(
                    retained.repair_authorization.clone(),
                    group.plan.clone(),
                    retained.parent_authorization.clone(),
                    retained.parent_source.clone(),
                    retained.parent_clip.clone(),
                    retained.outputs.clone(),
                )?;
                let parent: ActionClip = parse_serialized(
                    &retained.parent_clip,
                    "Verified Game Asset repair parent clip is invalid",
                )?;
                let clip = reconstruct_complete_repair(
                    &parent,
                    &retained.repair_authorization,
                    &retained.outputs,
                    group.timing.frame_duration_ms,
                )?;
                (
                    index,
                    FamilySourceKind::CompleteSheetRepair,
                    identity.receipt_id,
                    identity.receipt_hash,
                    clip,
                )
            }
            FamilyRetainedEvidence::PartialSheetRepair(retained) => {
                let identity = repair_authorization_identity(&retained.repair_authorization)?;
                let index = group_index_by_id(&family_plan, &identity.group_id)?;
                let group = &family_plan.groups[index];
                if identity.family_plan_id != family_plan.id
                    || identity.family_plan_hash != family_plan_hash
                    || identity.game_plan_id != atomic_plans[index].id
                    || identity.game_plan_hash
                        != game_asset_generation::canonical_hash(&group.plan)?
                {
                    return Err(ProxyError::Request(
                        "Partial-sheet repair authority drifted from the family plan".into(),
                    ));
                }
                if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                    return Err(ProxyError::Request(
                        "Partial-sheet repair disagrees with the family source strategy".into(),
                    ));
                }
                game_asset_generation::verify_game_asset_action_sheet_partial_repair_authorization(
                    retained.repair_authorization.clone(),
                    group.plan.clone(),
                    retained.parent_authorization.clone(),
                    retained.parent_source.clone(),
                    retained.parent_partial.clone(),
                    retained.outputs.clone(),
                )?;
                let partial: PartialClip = parse_serialized(
                    &retained.parent_partial,
                    "Verified Game Asset partial repair parent is invalid",
                )?;
                let clip = reconstruct_partial_repair(
                    &partial,
                    &retained.repair_authorization,
                    &retained.outputs,
                    &atomic_plans[index],
                    group.timing.looping,
                )?;
                (
                    index,
                    FamilySourceKind::PartialSheetRepair,
                    identity.receipt_id,
                    identity.receipt_hash,
                    clip,
                )
            }
            FamilyRetainedEvidence::LocalPartialReprocess(retained) => {
                let identity = repair_authorization_identity(&retained.reprocess_authorization)?;
                let index = group_index_by_id(&family_plan, &identity.group_id)?;
                let group = &family_plan.groups[index];
                if identity.family_plan_id != family_plan.id
                    || identity.family_plan_hash != family_plan_hash
                    || identity.game_plan_id != atomic_plans[index].id
                    || identity.game_plan_hash
                        != game_asset_generation::canonical_hash(&group.plan)?
                {
                    return Err(ProxyError::Request(
                        "Local partial reprocess authority drifted from the family plan".into(),
                    ));
                }
                if !matches!(group.source, FamilySourcePlan::CoherentGrid { .. }) {
                    return Err(ProxyError::Request(
                        "Local partial reprocess disagrees with the family source strategy".into(),
                    ));
                }
                game_asset_generation::verify_game_asset_action_sheet_partial_reprocess_authorization(
                    retained.reprocess_authorization.clone(),
                    group.plan.clone(),
                    retained.parent_authorization,
                    retained.parent_source,
                    retained.parent_partial,
                    retained.clip.clone(),
                )?;
                let clip: ActionClip = parse_serialized(
                    &retained.clip,
                    "Verified local partial reprocess clip is invalid",
                )?;
                (
                    index,
                    FamilySourceKind::LocalPartialReprocess,
                    identity.receipt_id,
                    identity.receipt_hash,
                    clip,
                )
            }
            FamilyRetainedEvidence::RoleIsolatedAtomicGeneration(retained) => {
                let identity = atomic_authorization_identity(&retained.authorization)?;
                let index = group_index_by_atomic_id(&atomic_plans, &identity.game_plan_id)?;
                let group = &family_plan.groups[index];
                if !matches!(group.source, FamilySourcePlan::RoleIsolated { .. }) {
                    return Err(ProxyError::Request(
                        "Role-isolated Game Asset evidence disagrees with the family source strategy"
                            .into(),
                    ));
                }
                game_asset_generation::verify_game_asset_generation_authorization(
                    retained.authorization.clone(),
                    retained.outputs.clone(),
                )
                .await?;
                let clip = reconstruct_role_isolated(
                    &family_plan.id,
                    group,
                    &atomic_plans[index],
                    &retained.authorization,
                    &retained.outputs,
                )?;
                (
                    index,
                    FamilySourceKind::RoleIsolatedAtomicGeneration,
                    identity.receipt_id,
                    identity.receipt_hash,
                    clip,
                )
            }
            FamilyRetainedEvidence::GroundedNormalizationMigration(retained) => {
                let input = GameAssetGroundedNormalizationPreviewInput {
                    parent_family_plan: retained.parent_family_plan,
                    successor_family_plan: input.family_plan.clone(),
                    parent_evidence: retained.parent_evidence,
                };
                verify_grounded_normalization_closure(
                    &retained.authorization,
                    input,
                    &retained.clip,
                )
                .await?;
                let index =
                    group_index_by_id(&family_plan, &retained.authorization.successor_group_id)?;
                (
                    index,
                    FamilySourceKind::GroundedNormalizationMigration,
                    retained.authorization.receipt_id,
                    retained.authorization.receipt_hash,
                    retained.clip,
                )
            }
        };
        if admitted_by_group[group_index].is_some() {
            return Err(ProxyError::Request(
                "Game Asset family contains duplicate evidence for one action group".into(),
            ));
        }
        let group = &family_plan.groups[group_index];
        let atomic = &atomic_plans[group_index];
        let expected_atomic_hash = game_asset_generation::canonical_hash(&group.plan)?;
        let authority_identity_ok = match source_kind {
            FamilySourceKind::RoleIsolatedAtomicGeneration => {
                clip.atomic_plan_id == atomic.id && clip.atomic_plan_hash == expected_atomic_hash
            }
            _ => clip.family_plan_id == family_plan.id,
        };
        if !authority_identity_ok {
            return Err(ProxyError::Request(
                "Game Asset family authority drifted from its plan identity".into(),
            ));
        }
        let clip_hash = validate_clip(&family_plan, &family_plan_hash, group, atomic, &clip)?;
        admitted_by_group[group_index] = Some(AdmittedClip {
            group_id: group.id.clone(),
            source_kind,
            authority_receipt_id: receipt_id,
            authority_receipt_hash: receipt_hash,
            clip,
            clip_hash,
            atomic_plan: atomic.clone(),
        });
    }
    let clips = admitted_by_group
        .into_iter()
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| ProxyError::Request("Game Asset family evidence is incomplete".into()))?;
    let (scale_profile, scale_profile_hash) = derive_scale_profile(
        &family_plan,
        &clips,
        input.historical_scale_profile.as_ref(),
    )?;
    let relationships = derive_relationships(&family_plan, &clips)?;
    Ok(VerifiedFamilyClosure {
        family_plan,
        family_plan_hash,
        clips,
        scale_profile,
        scale_profile_hash,
        relationships,
        decisions: input.decisions,
    })
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AcceptedClipReference {
    group_id: String,
    clip_id: String,
    clip_hash: String,
    source_kind: FamilySourceKind,
    authority_receipt_id: String,
    authority_receipt_hash: String,
    status: String,
}

fn accepted_clip_references(closure: &VerifiedFamilyClosure) -> Vec<AcceptedClipReference> {
    closure
        .clips
        .iter()
        .map(|clip| AcceptedClipReference {
            group_id: clip.group_id.clone(),
            clip_id: clip.clip.id.clone(),
            clip_hash: clip.clip_hash.clone(),
            source_kind: clip.source_kind,
            authority_receipt_id: clip.authority_receipt_id.clone(),
            authority_receipt_hash: clip.authority_receipt_hash.clone(),
            status: "accepted".into(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetFamilyAcceptancePreview {
    protocol: String,
    preview_id: String,
    review_digest: String,
    family_plan_id: String,
    family_plan_hash: String,
    scale_profile: GameAssetScaleProfile,
    scale_profile_hash: String,
    clips: Vec<AcceptedClipReference>,
    synchronized_relationships: Vec<FamilyRelationship>,
    role_ids: Vec<String>,
    artifact_ids: Vec<String>,
    expires_at: u64,
    requires_approval: bool,
}

#[derive(Debug, Clone)]
struct StoredFamilyAcceptancePreview {
    preview: GameAssetFamilyAcceptancePreview,
    closure: VerifiedFamilyClosure,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FamilyAcceptancePayload {
    version: String,
    receipt_id: String,
    family_plan_id: String,
    family_plan_hash: String,
    scale_profile_id: String,
    scale_profile_hash: String,
    accepted_clips: Vec<AcceptedClipReference>,
    synchronized_relationships: Vec<FamilyRelationship>,
    decisions: Vec<FamilySemanticDecision>,
    verifier_implementation_hash: String,
    reviewer_kind: String,
    approval_id: String,
    accepted_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetFamilyAcceptance {
    version: String,
    receipt_id: String,
    receipt_hash: String,
    family_plan_id: String,
    family_plan_hash: String,
    scale_profile_id: String,
    scale_profile_hash: String,
    accepted_clips: Vec<AcceptedClipReference>,
    synchronized_relationships: Vec<FamilyRelationship>,
    decisions: Vec<FamilySemanticDecision>,
    verifier_implementation_hash: String,
    reviewer_kind: String,
    approval_id: String,
    accepted_at: u64,
    signature: String,
}

impl GameAssetFamilyAcceptance {
    fn payload(&self) -> FamilyAcceptancePayload {
        FamilyAcceptancePayload {
            version: self.version.clone(),
            receipt_id: self.receipt_id.clone(),
            family_plan_id: self.family_plan_id.clone(),
            family_plan_hash: self.family_plan_hash.clone(),
            scale_profile_id: self.scale_profile_id.clone(),
            scale_profile_hash: self.scale_profile_hash.clone(),
            accepted_clips: self.accepted_clips.clone(),
            synchronized_relationships: self.synchronized_relationships.clone(),
            decisions: self.decisions.clone(),
            verifier_implementation_hash: self.verifier_implementation_hash.clone(),
            reviewer_kind: self.reviewer_kind.clone(),
            approval_id: self.approval_id.clone(),
            accepted_at: self.accepted_at,
        }
    }
}

fn acceptance_preview(
    closure: VerifiedFamilyClosure,
    now: u64,
) -> Result<StoredFamilyAcceptancePreview, ProxyError> {
    let clips = accepted_clip_references(&closure);
    let review_digest = game_asset_generation::canonical_hash(&serde_json::json!({
        "familyPlanId": &closure.family_plan.id,
        "familyPlanHash": &closure.family_plan_hash,
        "scaleProfile": &closure.scale_profile,
        "scaleProfileHash": &closure.scale_profile_hash,
        "clips": &clips,
        "synchronizedRelationships": &closure.relationships,
        "decisions": &closure.decisions,
    }))?;
    let preview = GameAssetFamilyAcceptancePreview {
        protocol: FAMILY_ACCEPTANCE_PREVIEW_PROTOCOL.into(),
        preview_id: format!("game-asset-family-acceptance-preview:sha256:{review_digest}"),
        review_digest,
        family_plan_id: closure.family_plan.id.clone(),
        family_plan_hash: closure.family_plan_hash.clone(),
        scale_profile: closure.scale_profile.clone(),
        scale_profile_hash: closure.scale_profile_hash.clone(),
        clips,
        synchronized_relationships: closure.relationships.clone(),
        role_ids: closure
            .clips
            .iter()
            .flat_map(|clip| clip.clip.frames.iter().map(|frame| frame.role_id.clone()))
            .collect(),
        artifact_ids: closure
            .clips
            .iter()
            .flat_map(|clip| {
                clip.clip
                    .frames
                    .iter()
                    .map(|frame| frame.artifact_id.clone())
            })
            .collect(),
        expires_at: now + PREVIEW_TTL_MS,
        requires_approval: true,
    };
    Ok(StoredFamilyAcceptancePreview { preview, closure })
}

fn issue_acceptance(
    closure: &VerifiedFamilyClosure,
    approval_id: String,
    accepted_at: u64,
) -> Result<GameAssetFamilyAcceptance, ProxyError> {
    let payload = FamilyAcceptancePayload {
        version: FAMILY_ACCEPTANCE_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-family-acceptance:{}",
            uuid::Uuid::new_v4().simple()
        ),
        family_plan_id: closure.family_plan.id.clone(),
        family_plan_hash: closure.family_plan_hash.clone(),
        scale_profile_id: closure.scale_profile.id.clone(),
        scale_profile_hash: closure.scale_profile_hash.clone(),
        accepted_clips: accepted_clip_references(closure),
        synchronized_relationships: closure.relationships.clone(),
        decisions: closure.decisions.clone(),
        verifier_implementation_hash: sha256(FAMILY_VERIFIER_IMPLEMENTATION.as_bytes()),
        reviewer_kind: "native-local-human".into(),
        approval_id,
        accepted_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetFamilyAcceptance {
        version: payload.version,
        receipt_id: payload.receipt_id,
        receipt_hash,
        family_plan_id: payload.family_plan_id,
        family_plan_hash: payload.family_plan_hash,
        scale_profile_id: payload.scale_profile_id,
        scale_profile_hash: payload.scale_profile_hash,
        accepted_clips: payload.accepted_clips,
        synchronized_relationships: payload.synchronized_relationships,
        decisions: payload.decisions,
        verifier_implementation_hash: payload.verifier_implementation_hash,
        reviewer_kind: payload.reviewer_kind,
        approval_id: payload.approval_id,
        accepted_at: payload.accepted_at,
        signature,
    })
}

fn verify_acceptance_closure(
    acceptance: GameAssetFamilyAcceptance,
    closure: &VerifiedFamilyClosure,
) -> Result<GameAssetFamilyAcceptance, ProxyError> {
    if acceptance.version != FAMILY_ACCEPTANCE_PROTOCOL
        || acceptance.family_plan_id != closure.family_plan.id
        || acceptance.family_plan_hash != closure.family_plan_hash
        || acceptance.scale_profile_id != closure.scale_profile.id
        || acceptance.scale_profile_hash != closure.scale_profile_hash
        || acceptance.accepted_clips != accepted_clip_references(closure)
        || acceptance.synchronized_relationships != closure.relationships
        || acceptance.decisions != closure.decisions
        || acceptance.verifier_implementation_hash
            != sha256(FAMILY_VERIFIER_IMPLEMENTATION.as_bytes())
        || acceptance.reviewer_kind != "native-local-human"
    {
        return Err(ProxyError::Request(
            "Game Asset family acceptance drifted from its full retained closure".into(),
        ));
    }
    verify_host_payload(
        &acceptance.payload(),
        &acceptance.receipt_hash,
        &acceptance.signature,
    )?;
    Ok(acceptance)
}

#[tauri::command]
pub async fn preview_game_asset_family_acceptance(
    state: State<'_, GameAssetFamilyState>,
    input: GameAssetFamilyProductionInput,
) -> Result<GameAssetFamilyAcceptancePreview, ProxyError> {
    let now = unix_millis()?;
    let stored = acceptance_preview(build_verified_closure(input).await?, now)?;
    let preview = stored.preview.clone();
    let mut state = state
        .inner
        .lock()
        .map_err(|_| ProxyError::Request("Game Asset family state is unavailable".into()))?;
    state
        .previews
        .retain(|_, candidate| candidate.preview.expires_at > now);
    if state.previews.len() >= MAX_ACTIVE_PREVIEWS
        && !state.previews.contains_key(&preview.preview_id)
    {
        return Err(ProxyError::Request(
            "Game Asset family acceptance preview capacity is exhausted".into(),
        ));
    }
    state.previews.insert(preview.preview_id.clone(), stored);
    Ok(preview)
}

#[tauri::command]
pub async fn apply_game_asset_family_acceptance(
    app: AppHandle,
    state: State<'_, GameAssetFamilyState>,
    preview_id: String,
) -> Result<GameAssetFamilyAcceptance, ProxyError> {
    let stored = state
        .inner
        .lock()
        .map_err(|_| ProxyError::Request("Game Asset family state is unavailable".into()))?
        .previews
        .remove(&preview_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset family acceptance preview is missing, expired, or consumed".into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset family acceptance preview expired".into(),
        ));
    }
    {
        let mut state = state
            .inner
            .lock()
            .map_err(|_| ProxyError::Request("Game Asset family state is unavailable".into()))?;
        if state.accepted.contains(&stored.closure.family_plan_hash)
            || !state
                .pending
                .insert(stored.closure.family_plan_hash.clone())
        {
            return Err(ProxyError::Request(
                "Game Asset family is already accepted or under confirmation".into(),
            ));
        }
    }
    let approval = crate::commands::native_approval::require_native_confirmation(
        &app,
        "Accept Game Asset family",
        &format!(
            "Accept {} exact action group(s) only after reviewing every displayed retained frame, action meaning, identity, style, body/FX relationship, anchor, and scale profile.",
            stored.closure.clips.len()
        ),
    )
    .await;
    let result = match approval {
        Ok(approval_id) => issue_acceptance(&stored.closure, approval_id, unix_millis()?),
        Err(error) => Err(ProxyError::Request(error)),
    };
    let mut state = state
        .inner
        .lock()
        .map_err(|_| ProxyError::Request("Game Asset family state is unavailable".into()))?;
    state.pending.remove(&stored.closure.family_plan_hash);
    if result.is_ok() {
        if state.accepted.len() >= MAX_REMEMBERED_ACCEPTANCES {
            state.accepted.pop_front();
        }
        state.accepted.push_back(stored.closure.family_plan_hash);
    }
    result
}

#[tauri::command]
pub async fn verify_game_asset_family_acceptance(
    acceptance: GameAssetFamilyAcceptance,
    input: GameAssetFamilyProductionInput,
) -> Result<GameAssetFamilyAcceptance, ProxyError> {
    let closure = build_verified_closure(input).await?;
    verify_acceptance_closure(acceptance, &closure)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FamilyBundleAcceptanceReference {
    receipt_id: String,
    receipt_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FamilyAtlasManifest {
    logical_path: String,
    artifact_id: String,
    sha256: String,
    media_type: String,
    byte_length: usize,
    width: u32,
    height: u32,
    columns: u32,
    rows: u32,
    cell_width: u32,
    cell_height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FamilyAtlasCell {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FamilyBundleFrame {
    group_id: String,
    clip_id: String,
    role_id: String,
    action: String,
    direction: String,
    frame_index: u32,
    duration_ms: u32,
    anchor: AnchorPoint,
    artifact_id: String,
    artifact_sha256: String,
    atlas_logical_path: String,
    cell: FamilyAtlasCell,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FamilyBundleAnimation {
    group_id: String,
    clip_id: String,
    action: String,
    direction: String,
    component: String,
    looping: bool,
    frame_duration_ms: u32,
    role_ids: Vec<String>,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FamilyBundleManifest {
    version: String,
    delivery_status: String,
    compiler_implementation: String,
    timing_policy: String,
    family_plan_id: String,
    family_plan_hash: String,
    scale_profile: GameAssetScaleProfile,
    scale_profile_hash: String,
    acceptance: FamilyBundleAcceptanceReference,
    clips: Vec<AcceptedClipReference>,
    synchronized_relationships: Vec<FamilyRelationship>,
    atlases: Vec<FamilyAtlasManifest>,
    frames: Vec<FamilyBundleFrame>,
    animations: Vec<FamilyBundleAnimation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledFamilyAtlas {
    logical_path: String,
    artifact_id: String,
    sha256: String,
    media_type: String,
    byte_length: usize,
    width: u32,
    height: u32,
    bytes_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledGameAssetFamilyBundle {
    protocol: String,
    bundle_id: String,
    bundle_hash: String,
    delivery_status: String,
    manifest_logical_path: String,
    manifest_media_type: String,
    manifest_byte_length: usize,
    manifest_bytes_base64: String,
    atlases: Vec<CompiledFamilyAtlas>,
    manifest: FamilyBundleManifest,
}

struct DecodedFamilyFrame {
    group_index: usize,
    frame_index: usize,
    image: image::RgbaImage,
}

#[derive(Clone)]
struct AtlasPlacement {
    logical_path: String,
    cell: FamilyAtlasCell,
}

fn compile_family_bundle(
    closure: VerifiedFamilyClosure,
    acceptance: GameAssetFamilyAcceptance,
) -> Result<CompiledGameAssetFamilyBundle, ProxyError> {
    let mut retained_bytes = 0_usize;
    let mut decoded_frames = Vec::new();
    let mut dimensions: BTreeMap<(u32, u32), Vec<usize>> = BTreeMap::new();
    for (group_index, admitted) in closure.clips.iter().enumerate() {
        for (frame_index, frame) in admitted.clip.frames.iter().enumerate() {
            let bytes = STANDARD.decode(&frame.artifact_bytes_base64).map_err(|_| {
                ProxyError::Request("Game Asset family bundle frame base64 is invalid".into())
            })?;
            retained_bytes = retained_bytes.checked_add(bytes.len()).ok_or_else(|| {
                ProxyError::Request("Game Asset family retained byte accounting overflowed".into())
            })?;
            if retained_bytes > MAX_TOTAL_RETAINED_BYTES
                || sha256(&bytes) != frame.artifact_sha256
                || frame.artifact_id != format!("artifact:sha256:{}", frame.artifact_sha256)
            {
                return Err(ProxyError::Request(
                    "Game Asset family bundle frame bytes drifted from their identity".into(),
                ));
            }
            let image = image::load_from_memory(&bytes)
                .map_err(|_| ProxyError::Request("Game Asset family frame is not an image".into()))?
                .to_rgba8();
            let ordinal = decoded_frames.len();
            dimensions
                .entry((image.width(), image.height()))
                .or_default()
                .push(ordinal);
            decoded_frames.push(DecodedFamilyFrame {
                group_index,
                frame_index,
                image,
            });
        }
    }
    let mut placements: Vec<Option<AtlasPlacement>> = vec![None; decoded_frames.len()];
    let mut atlas_manifests = Vec::new();
    let mut compiled_atlases = Vec::new();
    for ((cell_width, cell_height), ordinals) in dimensions {
        let max_columns = MAX_ATLAS_DIMENSION / cell_width;
        let max_rows = MAX_ATLAS_DIMENSION / cell_height;
        let pixels_per_cell = u64::from(cell_width) * u64::from(cell_height);
        let max_cells_by_pixels = MAX_ATLAS_PIXELS / pixels_per_cell;
        let capacity = u64::from(max_columns)
            .saturating_mul(u64::from(max_rows))
            .min(max_cells_by_pixels) as usize;
        if capacity == 0 {
            return Err(ProxyError::Request(
                "Game Asset family frame cannot fit a bounded atlas".into(),
            ));
        }
        for chunk in ordinals.chunks(capacity) {
            if compiled_atlases.len() >= MAX_ATLASES {
                return Err(ProxyError::Request(
                    "Game Asset family requires too many bounded atlases".into(),
                ));
            }
            let columns = (chunk.len() as u32).min(max_columns).max(1);
            let rows = (chunk.len() as u32 + columns - 1) / columns;
            let atlas_width = columns.checked_mul(cell_width).ok_or_else(|| {
                ProxyError::Request("Game Asset family atlas width overflowed".into())
            })?;
            let atlas_height = rows.checked_mul(cell_height).ok_or_else(|| {
                ProxyError::Request("Game Asset family atlas height overflowed".into())
            })?;
            if rows > max_rows
                || u64::from(atlas_width) * u64::from(atlas_height) > MAX_ATLAS_PIXELS
            {
                return Err(ProxyError::Request(
                    "Game Asset family atlas grid exceeds its raster budget".into(),
                ));
            }
            let logical_path = format!("atlases/atlas-{:03}.png", compiled_atlases.len());
            let mut atlas =
                image::RgbaImage::from_pixel(atlas_width, atlas_height, image::Rgba([0, 0, 0, 0]));
            for (cell_index, ordinal) in chunk.iter().enumerate() {
                let column = cell_index as u32 % columns;
                let row = cell_index as u32 / columns;
                let x = column * cell_width;
                let y = row * cell_height;
                for (frame_x, frame_y, pixel) in decoded_frames[*ordinal].image.enumerate_pixels() {
                    atlas.put_pixel(x + frame_x, y + frame_y, *pixel);
                }
                placements[*ordinal] = Some(AtlasPlacement {
                    logical_path: logical_path.clone(),
                    cell: FamilyAtlasCell {
                        x,
                        y,
                        width: cell_width,
                        height: cell_height,
                    },
                });
            }
            let atlas_bytes = game_asset_generation::encode_cutout_png(&atlas)?;
            retained_bytes = retained_bytes
                .checked_add(atlas_bytes.len())
                .ok_or_else(|| {
                    ProxyError::Request("Game Asset family atlas byte accounting overflowed".into())
                })?;
            if retained_bytes > MAX_TOTAL_RETAINED_BYTES {
                return Err(ProxyError::Request(
                    "Game Asset family atlases exceed the retained byte budget".into(),
                ));
            }
            let atlas_hash = sha256(&atlas_bytes);
            let artifact_id = format!("artifact:sha256:{atlas_hash}");
            atlas_manifests.push(FamilyAtlasManifest {
                logical_path: logical_path.clone(),
                artifact_id: artifact_id.clone(),
                sha256: atlas_hash.clone(),
                media_type: "image/png".into(),
                byte_length: atlas_bytes.len(),
                width: atlas_width,
                height: atlas_height,
                columns,
                rows,
                cell_width,
                cell_height,
            });
            compiled_atlases.push(CompiledFamilyAtlas {
                logical_path,
                artifact_id,
                sha256: atlas_hash,
                media_type: "image/png".into(),
                byte_length: atlas_bytes.len(),
                width: atlas_width,
                height: atlas_height,
                bytes_base64: STANDARD.encode(atlas_bytes),
            });
        }
    }
    let mut manifest_frames = Vec::with_capacity(decoded_frames.len());
    for (ordinal, decoded) in decoded_frames.iter().enumerate() {
        let admitted = &closure.clips[decoded.group_index];
        let group = &closure.family_plan.groups[decoded.group_index];
        let role = &admitted.atomic_plan.roles[decoded.frame_index];
        let frame = &admitted.clip.frames[decoded.frame_index];
        let placement = placements[ordinal].clone().ok_or_else(|| {
            ProxyError::Request("Game Asset family atlas omitted a canonical frame".into())
        })?;
        manifest_frames.push(FamilyBundleFrame {
            group_id: group.id.clone(),
            clip_id: admitted.clip.id.clone(),
            role_id: role.id.clone(),
            action: role.action.clone(),
            direction: role.direction.clone(),
            frame_index: role.frame_index,
            duration_ms: frame.duration_ms,
            anchor: frame.anchor.clone(),
            artifact_id: frame.artifact_id.clone(),
            artifact_sha256: frame.artifact_sha256.clone(),
            atlas_logical_path: placement.logical_path,
            cell: placement.cell,
            status: "accepted".into(),
        });
    }
    let animations = closure
        .clips
        .iter()
        .zip(&closure.family_plan.groups)
        .map(|(admitted, group)| FamilyBundleAnimation {
            group_id: group.id.clone(),
            clip_id: admitted.clip.id.clone(),
            action: group.action.clone(),
            direction: group.direction.clone(),
            component: group.component.clone(),
            looping: group.timing.looping,
            frame_duration_ms: group.timing.frame_duration_ms,
            role_ids: admitted
                .atomic_plan
                .roles
                .iter()
                .map(|role| role.id.clone())
                .collect(),
            status: "accepted".into(),
        })
        .collect();
    let manifest_clips = accepted_clip_references(&closure);
    let manifest = FamilyBundleManifest {
        version: FAMILY_BUNDLE_PROTOCOL.into(),
        delivery_status: "accepted".into(),
        compiler_implementation: FAMILY_ATLAS_COMPILER.into(),
        timing_policy: FAMILY_TIMING_POLICY.into(),
        family_plan_id: closure.family_plan.id,
        family_plan_hash: closure.family_plan_hash,
        scale_profile: closure.scale_profile,
        scale_profile_hash: closure.scale_profile_hash,
        acceptance: FamilyBundleAcceptanceReference {
            receipt_id: acceptance.receipt_id,
            receipt_hash: acceptance.receipt_hash,
        },
        clips: manifest_clips,
        synchronized_relationships: closure.relationships,
        atlases: atlas_manifests,
        frames: manifest_frames,
        animations,
    };
    let manifest_bytes = game_asset_generation::canonical_portable_bytes(&manifest)?;
    let bundle_hash = sha256(&manifest_bytes);
    Ok(CompiledGameAssetFamilyBundle {
        protocol: FAMILY_BUNDLE_PROTOCOL.into(),
        bundle_id: format!("game-asset-family-bundle:sha256:{bundle_hash}"),
        bundle_hash,
        delivery_status: "accepted".into(),
        manifest_logical_path: "manifest.json".into(),
        manifest_media_type: "application/json".into(),
        manifest_byte_length: manifest_bytes.len(),
        manifest_bytes_base64: STANDARD.encode(manifest_bytes),
        atlases: compiled_atlases,
        manifest,
    })
}

#[tauri::command]
pub async fn compile_game_asset_family_bundle(
    acceptance: GameAssetFamilyAcceptance,
    input: GameAssetFamilyProductionInput,
) -> Result<CompiledGameAssetFamilyBundle, ProxyError> {
    let closure = build_verified_closure(input).await?;
    let acceptance = verify_acceptance_closure(acceptance, &closure)?;
    compile_family_bundle(closure, acceptance)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reference(id: &str, byte: char) -> EvidenceReference {
        EvidenceReference {
            id: id.into(),
            revision: format!("revision:sha256:{}", byte.to_string().repeat(64)),
            content_hash: byte.to_string().repeat(64),
        }
    }

    fn normalization(processor: &str) -> NormalizationContract {
        NormalizationContract {
            processor_implementation: processor.into(),
            frame_size: PixelSize {
                width: 512,
                height: 512,
            },
            alpha_target: PixelSize {
                width: 300,
                height: 420,
            },
            expected_anchor: AnchorPoint { x: 256.0, y: 466.0 },
            anchor_policy: "feet".into(),
            identity_lock: reference("lock:identity", '1'),
            scale_lock: reference("lock:scale", '2'),
            scale_policy: SCALE_POLICY.into(),
        }
    }

    #[test]
    fn grounded_scale_compatibility_uses_the_signed_geometry_not_observed_width() {
        let v6 = normalization("processor-v6");
        let v7 = normalization("processor-v7");
        assert!(!same_scale_contract(&v6, &v7));

        let mut drifted = v6.clone();
        drifted.alpha_target.width = 301;
        assert!(!same_scale_contract(&v6, &drifted));

        assert!(same_scale_contract(&v6, &v6));
    }

    #[test]
    fn historical_profile_adoption_keeps_processor_equality_strict() {
        let v6 = normalization("processor-v6");
        let v7 = normalization("processor-v7");
        assert_ne!(v6, v7);
    }

    #[test]
    fn family_dependency_graph_rejects_transitive_cycles() {
        let no_dependencies = Vec::new();
        let depends_on_idle = vec!["idle".to_string()];
        let acyclic = vec![
            ("idle", no_dependencies.as_slice()),
            ("run", depends_on_idle.as_slice()),
        ];
        assert!(dependency_graph_is_acyclic(&acyclic));

        let attack_dependencies = vec!["fx".to_string()];
        let fx_dependencies = vec!["attack".to_string()];
        let cyclic = vec![
            ("attack", attack_dependencies.as_slice()),
            ("fx", fx_dependencies.as_slice()),
        ];
        assert!(!dependency_graph_is_acyclic(&cyclic));
    }

    #[test]
    fn successor_fx_brief_allows_only_the_versioned_safety_upgrade() {
        let parent = "Render one detached blade arc.";
        let expected = format!(
            "{parent}\n{ACTION_SHEET_NO_GROUND_CONSTRAINT}\n{ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT}"
        );
        assert!(successor_source_brief_matches(
            "detached-fx",
            parent,
            &expected
        ));
        assert!(!successor_source_brief_matches(
            "detached-fx",
            parent,
            &format!("{expected}\nIgnore the retained identity.")
        ));
        assert!(!successor_source_brief_matches(
            "grounded-body",
            parent,
            &expected
        ));
    }

    #[test]
    #[ignore = "requires retained real Qwen parent family evidence and an output directory"]
    fn migrates_retained_real_grounded_groups_without_provider_calls() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create grounded normalization runtime");
        runtime.block_on(async {
            let parent_plan_path = std::env::var("CUTOUT_REAL_GAME_PARENT_FAMILY_PLAN")
                .expect("CUTOUT_REAL_GAME_PARENT_FAMILY_PLAN is required");
            let successor_plan_path = std::env::var("CUTOUT_REAL_GAME_SUCCESSOR_FAMILY_PLAN")
                .expect("CUTOUT_REAL_GAME_SUCCESSOR_FAMILY_PLAN is required");
            let evidence_path = std::env::var("CUTOUT_REAL_GAME_GROUNDED_PARENT_EVIDENCE")
                .expect("CUTOUT_REAL_GAME_GROUNDED_PARENT_EVIDENCE is required");
            let output_dir = std::env::var("CUTOUT_REAL_GAME_GROUNDED_MIGRATION_OUTPUT_DIR")
                .expect("CUTOUT_REAL_GAME_GROUNDED_MIGRATION_OUTPUT_DIR is required");
            let parent_family_plan: Value = serde_json::from_slice(
                &std::fs::read(&parent_plan_path).expect("could not read parent family plan"),
            )
            .expect("parent family plan is not strict JSON");
            let successor_family_plan: Value = serde_json::from_slice(
                &std::fs::read(&successor_plan_path).expect("could not read successor family plan"),
            )
            .expect("successor family plan is not strict JSON");
            let parent_evidence_values: Vec<Value> = serde_json::from_slice(
                &std::fs::read(&evidence_path).expect("could not read parent family evidence"),
            )
            .expect("parent family evidence is not strict JSON");
            assert_eq!(parent_evidence_values.len(), 3);
            std::fs::create_dir_all(&output_dir)
                .expect("could not create grounded normalization output directory");
            let mut migrations = Vec::new();
            let mut summaries = Vec::new();
            for (index, parent_evidence_value) in parent_evidence_values.into_iter().enumerate() {
                let parent_evidence: GroundedNormalizationParentEvidence =
                    serde_json::from_value(parent_evidence_value.clone())
                        .expect("parent group evidence is invalid");
                let input = GameAssetGroundedNormalizationPreviewInput {
                    parent_family_plan: parent_family_plan.clone(),
                    successor_family_plan: successor_family_plan.clone(),
                    parent_evidence,
                };
                let prepared = prepare_grounded_normalization(input.clone(), 1_000)
                    .await
                    .expect("real grounded group failed native preview replay");
                assert_eq!(prepared.preview.provider_calls, 0);
                let authorization = issue_grounded_normalization(&prepared, 1_001, 1_002)
                    .expect("real grounded group could not be authorized");
                verify_grounded_normalization_closure(
                    &authorization,
                    input,
                    &prepared.successor_clip,
                )
                .await
                .expect("real grounded group failed byte-exact migration replay");
                let group_dir =
                    std::path::Path::new(&output_dir).join(format!("group-{:02}", index + 1));
                std::fs::create_dir_all(&group_dir)
                    .expect("could not create grounded group evidence directory");
                let mut decoded = Vec::new();
                for (frame_index, frame) in prepared.successor_clip.frames.iter().enumerate() {
                    let bytes = STANDARD
                        .decode(&frame.artifact_bytes_base64)
                        .expect("migrated frame base64 is invalid");
                    std::fs::write(
                        group_dir.join(format!("frame-{:02}.png", frame_index + 1)),
                        &bytes,
                    )
                    .expect("could not retain migrated frame");
                    decoded.push(
                        image::load_from_memory(&bytes)
                            .expect("migrated frame is not an image")
                            .to_rgba8(),
                    );
                }
                let frame_width = decoded[0].width();
                let frame_height = decoded[0].height();
                let mut strip = image::RgbaImage::from_fn(
                    frame_width * decoded.len() as u32,
                    frame_height,
                    |x, y| {
                        let tile = (x / 16 + y / 16) % 2;
                        if tile == 0 {
                            image::Rgba([38, 42, 48, 255])
                        } else {
                            image::Rgba([62, 68, 76, 255])
                        }
                    },
                );
                for (frame_index, frame) in decoded.iter().enumerate() {
                    image::imageops::overlay(
                        &mut strip,
                        frame,
                        frame_width * frame_index as u32,
                        0,
                    );
                }
                std::fs::write(
                    group_dir.join("review-strip.png"),
                    game_asset_generation::encode_cutout_png(&strip)
                        .expect("could not encode grounded review strip"),
                )
                .expect("could not retain grounded review strip");
                std::fs::write(
                    group_dir.join("apply-result.json"),
                    serde_json::to_vec_pretty(&AppliedGameAssetGroundedNormalization {
                        authorization: authorization.clone(),
                        clip: prepared.successor_clip.clone(),
                    })
                    .expect("could not encode grounded apply result"),
                )
                .expect("could not retain grounded apply result");
                migrations.push(serde_json::json!({
                    "kind": "grounded-normalization-migration",
                    "evidence": {
                        "parentFamilyPlan": &parent_family_plan,
                        "parentEvidence": parent_evidence_value,
                        "authorization": authorization,
                        "clip": &prepared.successor_clip,
                    }
                }));
                summaries.push(serde_json::json!({
                    "groupId": prepared.preview.successor_group_id,
                    "parentClipId": prepared.preview.parent_clip_id,
                    "successorClipId": prepared.preview.successor_clip_id,
                    "sourceArtifactIds": prepared.preview.source_artifact_ids,
                    "outputArtifactIds": prepared.preview.output_artifact_ids,
                    "processorImplementation": prepared.preview.processor_implementation,
                    "scalePolicy": prepared.preview.scale_policy,
                    "providerCalls": 0,
                }));
            }
            std::fs::write(
                std::path::Path::new(&output_dir).join("migration-evidence.json"),
                serde_json::to_vec_pretty(&migrations)
                    .expect("could not encode grounded migration evidence"),
            )
            .expect("could not retain grounded migration evidence");
            std::fs::write(
                std::path::Path::new(&output_dir).join("migration-summary.json"),
                serde_json::to_vec_pretty(&serde_json::json!({
                    "protocol": GROUNDED_NORMALIZATION_AUTHORIZATION_PROTOCOL,
                    "executionMode": "deterministic-local-derivation",
                    "providerCalls": 0,
                    "groups": summaries,
                }))
                .expect("could not encode grounded migration summary"),
            )
            .expect("could not retain grounded migration summary");
        });
    }

    #[test]
    #[ignore = "requires retained real grounded migrations, local FX reprocess evidence, and an output directory"]
    fn previews_retained_real_family_with_local_fx_reprocess() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create real family preview runtime");
        runtime.block_on(async {
            let family_plan_path = std::env::var("CUTOUT_REAL_GAME_SUCCESSOR_FAMILY_PLAN")
                .expect("CUTOUT_REAL_GAME_SUCCESSOR_FAMILY_PLAN is required");
            let grounded_evidence_path =
                std::env::var("CUTOUT_REAL_GAME_GROUNDED_MIGRATION_EVIDENCE")
                    .expect("CUTOUT_REAL_GAME_GROUNDED_MIGRATION_EVIDENCE is required");
            let fx_parent_input_path = std::env::var("CUTOUT_REAL_GAME_FX_PARTIAL_REPAIR_INPUT")
                .expect("CUTOUT_REAL_GAME_FX_PARTIAL_REPAIR_INPUT is required");
            let fx_reprocess_result_path = std::env::var("CUTOUT_REAL_GAME_FX_REPROCESS_RESULT")
                .expect("CUTOUT_REAL_GAME_FX_REPROCESS_RESULT is required");
            let output_dir = std::env::var("CUTOUT_REAL_GAME_FAMILY_PREVIEW_OUTPUT_DIR")
                .expect("CUTOUT_REAL_GAME_FAMILY_PREVIEW_OUTPUT_DIR is required");

            let family_plan: Value = serde_json::from_slice(
                &std::fs::read(&family_plan_path).expect("could not read successor family plan"),
            )
            .expect("successor family plan is not strict JSON");
            let mut retained_evidence: Vec<Value> = serde_json::from_slice(
                &std::fs::read(&grounded_evidence_path)
                    .expect("could not read grounded migration evidence"),
            )
            .expect("grounded migration evidence is not strict JSON");
            let fx_parent: Value = serde_json::from_slice(
                &std::fs::read(&fx_parent_input_path)
                    .expect("could not read FX partial parent input"),
            )
            .expect("FX partial parent input is not strict JSON");
            let fx_reprocess: Value = serde_json::from_slice(
                &std::fs::read(&fx_reprocess_result_path)
                    .expect("could not read FX local reprocess result"),
            )
            .expect("FX local reprocess result is not strict JSON");
            assert_eq!(fx_reprocess["providerCalls"], Value::from(0));
            retained_evidence.push(serde_json::json!({
                "kind": "local-partial-reprocess",
                "evidence": {
                    "parentAuthorization": fx_parent["parentAuthorization"].clone(),
                    "parentSource": fx_parent["parentSource"].clone(),
                    "parentPartial": fx_parent["parentPartial"].clone(),
                    "reprocessAuthorization": fx_reprocess["authorization"].clone(),
                    "clip": fx_reprocess["clip"].clone(),
                }
            }));

            let parsed_plan: FamilyPlan = serde_json::from_value(family_plan.clone())
                .expect("real successor family plan is invalid");
            let atomic_plans = validate_family_plan(&parsed_plan)
                .expect("real successor family plan does not close its groups");
            let decisions = parsed_plan
                .groups
                .iter()
                .zip(&atomic_plans)
                .flat_map(|(group, atomic)| {
                    atomic.roles.iter().map(|role| FamilySemanticDecision {
                        group_id: group.id.clone(),
                        role_id: role.id.clone(),
                        reference_continuity: "accepted".into(),
                        role_readability: "accepted".into(),
                        style_consistency: "accepted".into(),
                    })
                })
                .collect::<Vec<_>>();
            let input = GameAssetFamilyProductionInput {
                family_plan: family_plan.clone(),
                retained_evidence: retained_evidence
                    .iter()
                    .cloned()
                    .map(|value| {
                        serde_json::from_value(value)
                            .expect("real retained family evidence is invalid")
                    })
                    .collect(),
                decisions,
                historical_scale_profile: None,
            };
            let closure = build_verified_closure(input.clone())
                .await
                .expect("real family retained evidence did not close natively");
            assert_eq!(closure.clips.len(), 4);
            assert_eq!(
                closure.clips[3].source_kind,
                FamilySourceKind::LocalPartialReprocess
            );
            let preview = acceptance_preview(closure, unix_millis().unwrap())
                .expect("real family acceptance preview could not be compiled")
                .preview;
            assert_eq!(preview.clips.len(), 4);
            assert_eq!(preview.role_ids.len(), 22);

            let mut tampered_evidence = retained_evidence.clone();
            tampered_evidence[3]["evidence"]["clip"]["frames"][0]["artifactBytesBase64"] =
                Value::String("dGFtcGVyZWQ=".into());
            let tampered = GameAssetFamilyProductionInput {
                family_plan: family_plan.clone(),
                retained_evidence: tampered_evidence
                    .into_iter()
                    .map(|value| {
                        serde_json::from_value(value)
                            .expect("tampered retained family evidence shape is invalid")
                    })
                    .collect(),
                decisions: input.decisions.clone(),
                historical_scale_profile: None,
            };
            assert!(build_verified_closure(tampered).await.is_err());

            std::fs::create_dir_all(&output_dir)
                .expect("could not create real family preview output directory");
            std::fs::write(
                std::path::Path::new(&output_dir).join("family-production-input.json"),
                serde_json::to_vec_pretty(&serde_json::json!({
                    "familyPlan": family_plan,
                    "retainedEvidence": retained_evidence,
                    "decisions": input.decisions,
                }))
                .expect("could not encode real family production input"),
            )
            .expect("could not retain real family production input");
            std::fs::write(
                std::path::Path::new(&output_dir).join("acceptance-preview.json"),
                serde_json::to_vec_pretty(&preview)
                    .expect("could not encode real family acceptance preview"),
            )
            .expect("could not retain real family acceptance preview");
        });
    }
}
