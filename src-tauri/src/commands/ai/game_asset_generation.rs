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
use crate::commands::foreground_estimation::{
    bt601_chroma_distance_squared, reconstruct_adaptive_chroma_foreground,
    reconstruct_chroma_foreground, reconstruct_spatial_chroma_foreground,
    CHROMA_BACKGROUND_DISTANCE_SQUARED,
};

const PREVIEW_PROTOCOL: &str = "cutout.game-asset-generation-preview.v2";
const AUTHORIZATION_PROTOCOL: &str = "cutout.game-asset-generation-authorization.v2";
const REPAIR_PREVIEW_PROTOCOL: &str = "cutout.game-asset-generation-repair-preview.v2";
const LEGACY_REPAIR_AUTHORIZATION_PROTOCOL: &str = "cutout.game-asset-generation-authorization.v3";
const REPAIR_AUTHORIZATION_PROTOCOL: &str = "cutout.game-asset-generation-authorization.v4";
const ACCEPTANCE_PREVIEW_PROTOCOL: &str = "cutout.game-asset-semantic-acceptance-preview.v1";
const ACCEPTANCE_PROTOCOL: &str = "cutout.game-asset-semantic-acceptance.v1";
const ACTION_SHEET_PREVIEW_PROTOCOL: &str = "cutout.game-asset-action-sheet-preview.v1";
const ACTION_SHEET_AUTHORIZATION_PROTOCOL: &str = "cutout.game-asset-action-sheet-authorization.v1";
const ACTION_SHEET_PARTIAL_PROTOCOL: &str = "game-asset.action-sheet-partial.v1";
const ACTION_SHEET_PARTIAL_AUTHORIZATION_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-partial-authorization.v1";
const ACTION_SHEET_REPAIR_PREVIEW_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-repair-preview.v1";
const ACTION_SHEET_REPAIR_AUTHORIZATION_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-repair-authorization.v1";
const ACTION_SHEET_PARTIAL_REPAIR_PREVIEW_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-partial-repair-preview.v1";
const ACTION_SHEET_PARTIAL_REPAIR_AUTHORIZATION_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-partial-repair-authorization.v1";
const ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-partial-reprocess-preview.v1";
const ACTION_SHEET_PARTIAL_REPROCESS_AUTHORIZATION_PROTOCOL: &str =
    "cutout.game-asset-action-sheet-partial-reprocess-authorization.v1";
const ACTION_SOURCE_PROTOCOL: &str = "game-asset.action-source.v1";
const ACTION_CLIP_PROTOCOL: &str = "game-asset.action-clip.v1";
const ACTION_SHEET_SPLITTER_IMPLEMENTATION: &str =
    "cutout-game-asset-grid-split-rust-image-0.23-v1";
const ACTION_SHEET_REPAIR_COMPOSITION_IMPLEMENTATION: &str =
    "cutout-game-asset-repair-inset-composition-reference-rust-image-0.23-v1";
const ACTION_SHEET_REPAIR_INSET_NUMERATOR: u32 = 3;
const ACTION_SHEET_REPAIR_INSET_DENOMINATOR: u32 = 16;
const BUNDLE_PROTOCOL: &str = "game-asset.bundle.v1";
const BUNDLE_COMPILER_IMPLEMENTATION: &str = "cutout-game-asset-atlas-rust-image-0.23-v1";
const BUNDLE_TIMING_POLICY: &str = "game-asset-action-timing.v1";
const PLAN_PROTOCOL: &str = "game-asset.plan.v1";
const MODELS: [&str; 2] = ["qwen-image-3.0", "qwen-image-3.0-pro"];
const MAX_ROLES: usize = 16;
const MAX_EVIDENCE: usize = 128;
const MAX_RETAINED_BYTES: usize = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 96 * 1024 * 1024;
const MAX_ATLAS_BYTES: usize = 128 * 1024 * 1024;
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
const LEGACY_CUTOUT_IMPLEMENTATION: &str = "cutout-white-border-flood-matte-rust-image-0.23-v1";
const WHITE_BOARD_CUTOUT_IMPLEMENTATION: &str =
    "cutout-white-border-flood-matte-normalize-anchor-rust-image-0.23-v2";
const ADAPTIVE_BOARD_CUTOUT_IMPLEMENTATION: &str =
    "cutout-adaptive-board-key-despill-normalize-anchor-rust-image-0.23-v3";
const CHROMA_ML_CUTOUT_IMPLEMENTATION: &str =
    "cutout-chroma-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v4";
const V5_CUTOUT_IMPLEMENTATION: &str =
    "cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v5";
const V6_CUTOUT_IMPLEMENTATION: &str =
    "cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-shadow-prune-rust-image-0.23-v6";
pub(crate) const CUTOUT_IMPLEMENTATION: &str =
    "cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-shadow-prune-rust-image-0.23-v7";
pub(crate) const GROUNDED_NORMALIZATION_IMPLEMENTATION: &str =
    "cutout-verified-alpha-family-grounded-normalize-anchor-rust-image-0.23-v8";
const V9_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION: &str =
    "cutout-spatial-high-chroma-board-field-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v9";
const V10_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION: &str =
    "cutout-spatial-high-chroma-board-field-edge-seed-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v10";
pub(crate) const SPATIAL_BOARD_CUTOUT_IMPLEMENTATION: &str =
    "cutout-spatial-high-chroma-board-field-safe-margin-seed-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v11";
pub(crate) const OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION: &str =
    "cutout-spatial-high-chroma-board-field-occlusion-interpolation-safe-margin-seed-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v12";
const CUTOUT_SCALE_POLICY: &str = "contain-preserve-aspect";
pub(crate) const SPATIAL_BOARD_CUTOUT_SCALE_POLICY: &str =
    "contain-preserve-aspect-no-upscale-action-sheet-v1";
pub(crate) const GROUNDED_NORMALIZATION_SCALE_POLICY: &str =
    "contain-preserve-aspect-safe-canvas-v1";
const ADAPTIVE_BOARD_CUTOUT_ROUTE: &str = "adaptive-uniform-board";
const CHROMA_ML_CUTOUT_ROUTE: &str = "chroma-trimap-pymatting-ml-foreground";
const CUTOUT_ROUTE: &str = "adaptive-border-chroma-trimap-pymatting-ml-foreground";
const V9_SPATIAL_BOARD_CUTOUT_ROUTE: &str =
    "spatial-high-chroma-board-field-trimap-pymatting-ml-foreground";
const V10_SPATIAL_BOARD_CUTOUT_ROUTE: &str =
    "spatial-high-chroma-board-field-edge-seed-trimap-pymatting-ml-foreground";
const SPATIAL_BOARD_CUTOUT_ROUTE: &str =
    "spatial-high-chroma-board-field-safe-margin-seed-trimap-pymatting-ml-foreground";
const OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_ROUTE: &str =
    "spatial-high-chroma-board-field-occlusion-interpolation-safe-margin-seed-trimap-pymatting-ml-foreground";
const V9_SPATIAL_BOARD_MODEL_IMPLEMENTATION: &str =
    "cutout-local-high-chroma-board-field-grid-median-bilinear-v1";
const V10_SPATIAL_BOARD_MODEL_IMPLEMENTATION: &str =
    "cutout-local-high-chroma-board-field-grid-median-bilinear-edge-seed-v2";
const SPATIAL_BOARD_MODEL_IMPLEMENTATION: &str =
    "cutout-local-high-chroma-board-field-grid-median-bilinear-safe-margin-seed-v3";
const OCCLUSION_TOLERANT_SPATIAL_BOARD_MODEL_IMPLEMENTATION: &str =
    "cutout-local-high-chroma-board-field-grid-median-occlusion-interpolation-bilinear-safe-margin-seed-v4";
const SPATIAL_BOARD_GRID_COLUMNS: usize = 17;
const SPATIAL_BOARD_GRID_ROWS: usize = 17;
const SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS: usize = 8;
const SPATIAL_BOARD_MAX_SAMPLE_RADIUS: usize = 96;
const SPATIAL_BOARD_MIN_SAMPLES: usize = 24;
const V10_SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH: usize = 8;
const SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH: usize = 32;

pub(crate) fn is_spatial_board_cutout_implementation(implementation: &str) -> bool {
    matches!(
        implementation,
        V9_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
            | V10_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
            | SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
            | OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
    )
}
const CUTOUT_BACKGROUND_DISTANCE: f64 = 36.0;
const CUTOUT_EDGE_DISTANCE_LOW: f64 = 12.0;
const CUTOUT_EDGE_DISTANCE_HIGH: f64 = 96.0;
const CUTOUT_BORDER_CONFIDENCE: f64 = 0.92;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 100_000_000;

#[derive(Default)]
pub struct GameAssetGenerationState {
    previews: Mutex<HashMap<String, StoredPreview>>,
    action_sheet_previews: Mutex<HashMap<String, StoredActionSheetPreview>>,
    action_sheet_repair_previews: Mutex<HashMap<String, StoredActionSheetRepairPreview>>,
    action_sheet_partial_repair_previews:
        Mutex<HashMap<String, StoredActionSheetPartialRepairPreview>>,
    action_sheet_partial_reprocess_previews:
        Mutex<HashMap<String, StoredActionSheetPartialReprocessPreview>>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RetainedEvidenceSummary {
    reference: EvidenceReference,
    media_type: String,
    byte_length: usize,
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionSheetGridInput {
    rows: u32,
    columns: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPreviewInput {
    identity: RehearsalIdentity,
    run_id: String,
    provider_id: String,
    model: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    plan: Value,
    retained_evidence: Vec<RetainedEvidenceInput>,
    source_brief: String,
    grid: ActionSheetGridInput,
    frame_duration_ms: u32,
    looping: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionSheetRepairRolePromptInput {
    role_id: String,
    prompt: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetRepairPreviewInput {
    parent_authorization: GameAssetActionSheetAuthorization,
    parent_source: GameAssetActionSource,
    parent_clip: GameAssetActionClip,
    run_id: String,
    plan: Value,
    roles: Vec<ActionSheetRepairRolePromptInput>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPartialRepairPreviewInput {
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    run_id: String,
    plan: Value,
    roles: Vec<ActionSheetRepairRolePromptInput>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPartialReprocessPreviewInput {
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    plan: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetGenerationRepairPreviewInput {
    parent_authorization: GameAssetGenerationAuthorization,
    parent_outputs: Vec<RetainedRoleOutput>,
    run_id: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_authorization_receipt_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_authorization_receipt_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    replacement_role_ids: Option<Vec<String>>,
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
    retained_evidence: Vec<RetainedEvidenceSummary>,
    roles: Vec<StoredRoleRequest>,
    preserved_outputs: BTreeMap<String, RetainedRoleOutput>,
    repair_lineage: Option<GameAssetGenerationRepairLineage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetPreview {
    protocol: String,
    plan_id: String,
    request_digest: String,
    run_id: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    provider_id: String,
    model: String,
    role_ids: Vec<String>,
    reference_artifact_ids: Vec<String>,
    grid: ActionSheetGridInput,
    output_size: String,
    splitter_implementation: String,
    processor_implementation: String,
    frame_duration_ms: u32,
    looping: bool,
    expires_at: u64,
    execution_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetRepairPreview {
    protocol: String,
    plan_id: String,
    request_digest: String,
    run_id: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_clip_id: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    provider_id: String,
    model: String,
    role_ids: Vec<String>,
    replacement_role_ids: Vec<String>,
    output_size: String,
    processor_implementation: String,
    expires_at: u64,
    execution_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetPartialRepairPreview {
    protocol: String,
    plan_id: String,
    request_digest: String,
    run_id: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_partial_id: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    provider_id: String,
    model: String,
    role_ids: Vec<String>,
    replacement_role_ids: Vec<String>,
    output_size: String,
    processor_implementation: String,
    expires_at: u64,
    execution_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetPartialReprocessPreview {
    protocol: String,
    plan_id: String,
    request_digest: String,
    run_id: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_partial_id: String,
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    role_ids: Vec<String>,
    reprocessed_role_ids: Vec<String>,
    processor_implementation: String,
    provider_calls: u32,
    expires_at: u64,
    execution_mode: String,
}

#[derive(Clone)]
struct StoredActionSheetPreview {
    preview: GameAssetActionSheetPreview,
    identity: RehearsalIdentity,
    plan: GamePlan,
    plan_value: Value,
    reference_bytes: Vec<Vec<u8>>,
    request: StoredRoleRequest,
}

#[derive(Clone)]
struct StoredActionSheetRepairRole {
    role: GameRole,
    request: StoredRoleRequest,
    reference_bytes: Vec<Vec<u8>>,
}

#[derive(Clone)]
struct StoredActionSheetRepairPreview {
    preview: GameAssetActionSheetRepairPreview,
    parent_authorization: GameAssetActionSheetAuthorization,
    parent_source: GameAssetActionSource,
    parent_clip: GameAssetActionClip,
    plan: GamePlan,
    plan_value: Value,
    roles: Vec<StoredActionSheetRepairRole>,
}

#[derive(Clone)]
struct StoredActionSheetPartialRepairPreview {
    preview: GameAssetActionSheetPartialRepairPreview,
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    plan: GamePlan,
    plan_value: Value,
    roles: Vec<StoredActionSheetRepairRole>,
}

#[derive(Clone)]
struct StoredActionSheetPartialReprocessPreview {
    preview: GameAssetActionSheetPartialReprocessPreview,
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    plan: GamePlan,
    plan_value: Value,
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpatialBoardModelEvidence {
    implementation: String,
    columns: u32,
    rows: u32,
    initial_sample_radius: u32,
    maximum_sample_radius: u32,
    minimum_samples_per_node: u32,
    node_count: u32,
    node_bytes_sha256: String,
    perimeter_sample_count: u32,
    maximum_perimeter_chroma_residual_squared: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    edge_seed_strip_width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    edge_seed_pixel_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    interpolated_node_count: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RasterProcessingEvidence {
    protocol: String,
    implementation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    white_threshold: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    background_color: Option<[u8; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    color_distance_threshold: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    matting_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    spatial_board_model: Option<SpatialBoardModelEvidence>,
    background_alpha_max: u8,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
    output_byte_length: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_alpha_bounds: Option<AlphaBounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_size: Option<PixelSize>,
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreservedGameAssetRoleLineage {
    role_id: String,
    origin_run_id: String,
    request_id: String,
    receipt_id: String,
    source_artifact_id: String,
    artifact_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetGenerationRepairLineage {
    parent_receipt_id: String,
    parent_receipt_hash: String,
    replaced_role_ids: Vec<String>,
    preserved_roles: Vec<PreservedGameAssetRoleLineage>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    repair_lineage: Option<GameAssetGenerationRepairLineage>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    repair_lineage: Option<GameAssetGenerationRepairLineage>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleEvidenceReference {
    receipt_id: String,
    receipt_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleGenerationReference {
    receipt_id: String,
    receipt_hash: String,
    preview_id: String,
    run_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleCell {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleAtlas {
    logical_path: String,
    artifact_id: String,
    sha256: String,
    media_type: String,
    byte_length: usize,
    width: u32,
    height: u32,
    columns: u32,
    rows: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleFrame {
    role_id: String,
    action: String,
    direction: String,
    frame_index: u32,
    duration_ms: u32,
    cell: GameAssetBundleCell,
    anchor: AnchorPoint,
    artifact_id: String,
    artifact_sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleAnimation {
    id: String,
    action: String,
    direction: String,
    frame_duration_ms: u32,
    looping: bool,
    role_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetBundleManifest {
    version: String,
    delivery_status: String,
    compiler_implementation: String,
    timing_policy: String,
    asset_id: String,
    plan_id: String,
    plan_hash: String,
    generation: GameAssetBundleGenerationReference,
    #[serde(skip_serializing_if = "Option::is_none")]
    semantic_acceptance: Option<GameAssetBundleEvidenceReference>,
    atlas: GameAssetBundleAtlas,
    frames: Vec<GameAssetBundleFrame>,
    animations: Vec<GameAssetBundleAnimation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledGameAssetBundle {
    protocol: String,
    bundle_id: String,
    bundle_hash: String,
    delivery_status: String,
    manifest_logical_path: String,
    manifest_media_type: String,
    manifest_byte_length: usize,
    manifest_bytes_base64: String,
    atlas_bytes_base64: String,
    manifest: GameAssetBundleManifest,
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
            repair_lineage: self.repair_lineage.clone(),
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedActionArtifact {
    artifact_id: String,
    sha256: String,
    media_type: String,
    byte_length: usize,
    bytes_base64: String,
    decoded_width: u32,
    decoded_height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObservedActionSheetGrid {
    rows: u32,
    columns: u32,
    cell_width: u32,
    cell_height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSourceCell {
    role_id: String,
    row: u32,
    column: u32,
    source_rectangle: AlphaBounds,
    artifact: RetainedActionArtifact,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSource {
    version: String,
    id: String,
    family_plan_id: String,
    group_id: String,
    strategy: String,
    splitter_implementation: String,
    receipt: MultimodalHostReceipt,
    source: RetainedActionArtifact,
    grid: ObservedActionSheetGrid,
    cells: Vec<GameAssetActionSourceCell>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionClipFrame {
    role_id: String,
    source_artifact_id: String,
    artifact_id: String,
    artifact_sha256: String,
    artifact_bytes_base64: String,
    duration_ms: u32,
    anchor: AnchorPoint,
    processing_evidence: RasterProcessingEvidence,
    pixel_evidence: PixelEvidence,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionClip {
    version: String,
    id: String,
    family_plan_id: String,
    group_id: String,
    atomic_plan_id: String,
    atomic_plan_hash: String,
    source_id: String,
    frames: Vec<GameAssetActionClipFrame>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetCellFailure {
    role_id: String,
    source_artifact_id: String,
    code: String,
    message: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPartial {
    version: String,
    id: String,
    family_plan_id: String,
    group_id: String,
    atomic_plan_id: String,
    atomic_plan_hash: String,
    source_id: String,
    frame_duration_ms: u32,
    looping: bool,
    frames: Vec<GameAssetActionClipFrame>,
    failures: Vec<GameAssetActionSheetCellFailure>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorizedActionSheetRequest {
    request_id: String,
    prompt: String,
    prompt_hash: String,
    semantic_role: String,
    node_id: String,
    capability_id: String,
    accepted_reference_artifact_ids: Vec<String>,
    lock_ids: Vec<String>,
    role_ids: Vec<String>,
    grid: ActionSheetGridInput,
    output_size: String,
    frame_duration_ms: u32,
    looping: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorizedActionSheetCell {
    role_id: String,
    row: u32,
    column: u32,
    source_rectangle: AlphaBounds,
    source_artifact_id: String,
    source_artifact_sha256: String,
    artifact_id: String,
    artifact_sha256: String,
    processing_evidence: RasterProcessingEvidence,
    pixel_evidence: PixelEvidence,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionSheetAuthorizationPayload {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    source_request: AuthorizedActionSheetRequest,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_id: String,
    clip_id: String,
    cells: Vec<AuthorizedActionSheetCell>,
    status: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetAuthorization {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    source_request: AuthorizedActionSheetRequest,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_id: String,
    clip_id: String,
    cells: Vec<AuthorizedActionSheetCell>,
    status: String,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl GameAssetActionSheetAuthorization {
    fn payload(&self) -> ActionSheetAuthorizationPayload {
        ActionSheetAuthorizationPayload {
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
            family_plan_id: self.family_plan_id.clone(),
            family_plan_hash: self.family_plan_hash.clone(),
            group_id: self.group_id.clone(),
            game_plan_id: self.game_plan_id.clone(),
            game_plan_hash: self.game_plan_hash.clone(),
            source_request: self.source_request.clone(),
            source_receipt_id: self.source_receipt_id.clone(),
            source_receipt_hash: self.source_receipt_hash.clone(),
            source_id: self.source_id.clone(),
            clip_id: self.clip_id.clone(),
            cells: self.cells.clone(),
            status: self.status.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionSheetPartialAuthorizationPayload {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    source_request: AuthorizedActionSheetRequest,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_id: String,
    partial_id: String,
    successful_role_ids: Vec<String>,
    failed_role_ids: Vec<String>,
    status: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPartialAuthorization {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    source_request: AuthorizedActionSheetRequest,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_id: String,
    partial_id: String,
    successful_role_ids: Vec<String>,
    failed_role_ids: Vec<String>,
    status: String,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl GameAssetActionSheetPartialAuthorization {
    fn payload(&self) -> ActionSheetPartialAuthorizationPayload {
        ActionSheetPartialAuthorizationPayload {
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
            family_plan_id: self.family_plan_id.clone(),
            family_plan_hash: self.family_plan_hash.clone(),
            group_id: self.group_id.clone(),
            game_plan_id: self.game_plan_id.clone(),
            game_plan_hash: self.game_plan_hash.clone(),
            source_request: self.source_request.clone(),
            source_receipt_id: self.source_receipt_id.clone(),
            source_receipt_hash: self.source_receipt_hash.clone(),
            source_id: self.source_id.clone(),
            partial_id: self.partial_id.clone(),
            successful_role_ids: self.successful_role_ids.clone(),
            failed_role_ids: self.failed_role_ids.clone(),
            status: self.status.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedActionSheetRepairOutput {
    role_id: String,
    receipt: MultimodalHostReceipt,
    source_media_type: String,
    source_artifact_bytes_base64: String,
    media_type: String,
    artifact_bytes_base64: String,
    processing_evidence: RasterProcessingEvidence,
    pixel_evidence: PixelEvidence,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedActionSheetRepairFailure {
    role_id: String,
    receipt: MultimodalHostReceipt,
    source_media_type: String,
    source_artifact_bytes_base64: String,
    failure: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreservedActionSheetCellLineage {
    role_id: String,
    source_artifact_id: String,
    artifact_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionSheetRepairAuthorizationPayload {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_clip_id: String,
    role_requests: Vec<AuthorizedRoleRequest>,
    replacement_role_ids: Vec<String>,
    preserved_cells: Vec<PreservedActionSheetCellLineage>,
    outputs: Vec<AuthorizedRoleOutput>,
    status: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetRepairAuthorization {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_clip_id: String,
    role_requests: Vec<AuthorizedRoleRequest>,
    replacement_role_ids: Vec<String>,
    preserved_cells: Vec<PreservedActionSheetCellLineage>,
    outputs: Vec<AuthorizedRoleOutput>,
    status: String,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl GameAssetActionSheetRepairAuthorization {
    fn payload(&self) -> ActionSheetRepairAuthorizationPayload {
        ActionSheetRepairAuthorizationPayload {
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
            family_plan_id: self.family_plan_id.clone(),
            family_plan_hash: self.family_plan_hash.clone(),
            group_id: self.group_id.clone(),
            game_plan_id: self.game_plan_id.clone(),
            game_plan_hash: self.game_plan_hash.clone(),
            parent_authorization_receipt_id: self.parent_authorization_receipt_id.clone(),
            parent_authorization_receipt_hash: self.parent_authorization_receipt_hash.clone(),
            parent_source_id: self.parent_source_id.clone(),
            parent_clip_id: self.parent_clip_id.clone(),
            role_requests: self.role_requests.clone(),
            replacement_role_ids: self.replacement_role_ids.clone(),
            preserved_cells: self.preserved_cells.clone(),
            outputs: self.outputs.clone(),
            status: self.status.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionSheetPartialRepairAuthorizationPayload {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_partial_id: String,
    role_requests: Vec<AuthorizedRoleRequest>,
    replacement_role_ids: Vec<String>,
    preserved_cells: Vec<PreservedActionSheetCellLineage>,
    outputs: Vec<AuthorizedRoleOutput>,
    status: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPartialRepairAuthorization {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_partial_id: String,
    role_requests: Vec<AuthorizedRoleRequest>,
    replacement_role_ids: Vec<String>,
    preserved_cells: Vec<PreservedActionSheetCellLineage>,
    outputs: Vec<AuthorizedRoleOutput>,
    status: String,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl GameAssetActionSheetPartialRepairAuthorization {
    fn payload(&self) -> ActionSheetPartialRepairAuthorizationPayload {
        ActionSheetPartialRepairAuthorizationPayload {
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
            family_plan_id: self.family_plan_id.clone(),
            family_plan_hash: self.family_plan_hash.clone(),
            group_id: self.group_id.clone(),
            game_plan_id: self.game_plan_id.clone(),
            game_plan_hash: self.game_plan_hash.clone(),
            parent_authorization_receipt_id: self.parent_authorization_receipt_id.clone(),
            parent_authorization_receipt_hash: self.parent_authorization_receipt_hash.clone(),
            parent_source_id: self.parent_source_id.clone(),
            parent_partial_id: self.parent_partial_id.clone(),
            role_requests: self.role_requests.clone(),
            replacement_role_ids: self.replacement_role_ids.clone(),
            preserved_cells: self.preserved_cells.clone(),
            outputs: self.outputs.clone(),
            status: self.status.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionSheetPartialReprocessAuthorizationPayload {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_partial_id: String,
    source_receipt_id: String,
    source_receipt_hash: String,
    clip_id: String,
    reprocessed_role_ids: Vec<String>,
    preserved_cells: Vec<PreservedActionSheetCellLineage>,
    cells: Vec<AuthorizedActionSheetCell>,
    processor_implementation: String,
    provider_calls: u32,
    status: String,
    started_at: u64,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAssetActionSheetPartialReprocessAuthorization {
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
    family_plan_id: String,
    family_plan_hash: String,
    group_id: String,
    game_plan_id: String,
    game_plan_hash: String,
    parent_authorization_receipt_id: String,
    parent_authorization_receipt_hash: String,
    parent_source_id: String,
    parent_partial_id: String,
    source_receipt_id: String,
    source_receipt_hash: String,
    clip_id: String,
    reprocessed_role_ids: Vec<String>,
    preserved_cells: Vec<PreservedActionSheetCellLineage>,
    cells: Vec<AuthorizedActionSheetCell>,
    processor_implementation: String,
    provider_calls: u32,
    status: String,
    started_at: u64,
    completed_at: u64,
    signature: String,
}

impl GameAssetActionSheetPartialReprocessAuthorization {
    fn payload(&self) -> ActionSheetPartialReprocessAuthorizationPayload {
        ActionSheetPartialReprocessAuthorizationPayload {
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
            family_plan_id: self.family_plan_id.clone(),
            family_plan_hash: self.family_plan_hash.clone(),
            group_id: self.group_id.clone(),
            game_plan_id: self.game_plan_id.clone(),
            game_plan_hash: self.game_plan_hash.clone(),
            parent_authorization_receipt_id: self.parent_authorization_receipt_id.clone(),
            parent_authorization_receipt_hash: self.parent_authorization_receipt_hash.clone(),
            parent_source_id: self.parent_source_id.clone(),
            parent_partial_id: self.parent_partial_id.clone(),
            source_receipt_id: self.source_receipt_id.clone(),
            source_receipt_hash: self.source_receipt_hash.clone(),
            clip_id: self.clip_id.clone(),
            reprocessed_role_ids: self.reprocessed_role_ids.clone(),
            preserved_cells: self.preserved_cells.clone(),
            cells: self.cells.clone(),
            processor_implementation: self.processor_implementation.clone(),
            provider_calls: self.provider_calls,
            status: self.status.clone(),
            started_at: self.started_at,
            completed_at: self.completed_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetApplyResult {
    status: String,
    source: Option<GameAssetActionSource>,
    clip: Option<GameAssetActionClip>,
    partial: Option<GameAssetActionSheetPartial>,
    authorization: Option<GameAssetActionSheetAuthorization>,
    partial_authorization: Option<GameAssetActionSheetPartialAuthorization>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetRepairApplyResult {
    status: String,
    parent_source_id: String,
    parent_clip_id: String,
    outputs: Vec<RetainedActionSheetRepairOutput>,
    failed_attempt: Option<RetainedActionSheetRepairFailure>,
    authorization: Option<GameAssetActionSheetRepairAuthorization>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetPartialRepairApplyResult {
    status: String,
    parent_source_id: String,
    parent_partial_id: String,
    outputs: Vec<RetainedActionSheetRepairOutput>,
    failed_attempt: Option<RetainedActionSheetRepairFailure>,
    authorization: Option<GameAssetActionSheetPartialRepairAuthorization>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetActionSheetPartialReprocessApplyResult {
    status: String,
    parent_source_id: String,
    parent_partial_id: String,
    clip: Option<GameAssetActionClip>,
    authorization: Option<GameAssetActionSheetPartialReprocessAuthorization>,
    provider_calls: u32,
    error: Option<String>,
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

pub(crate) fn canonical_hash<T: Serialize>(value: &T) -> Result<String, ProxyError> {
    canonical_bytes(value).map(|bytes| sha256(&bytes))
}

fn canonical_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, ProxyError> {
    canonicalize_json(
        serde_json::to_value(value).map_err(|_| {
            ProxyError::Request("could not canonicalize Game Asset evidence".into())
        })?,
    )
    .and_then(|value| {
        serde_json::to_vec(&value)
            .map_err(|_| ProxyError::Request("could not canonicalize Game Asset evidence".into()))
    })
}

pub(crate) fn canonical_portable_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, ProxyError> {
    fn normalize_numbers(value: Value) -> Value {
        match value {
            Value::Array(values) => {
                Value::Array(values.into_iter().map(normalize_numbers).collect())
            }
            Value::Object(values) => Value::Object(
                values
                    .into_iter()
                    .map(|(key, value)| (key, normalize_numbers(value)))
                    .collect(),
            ),
            Value::Number(number) => number
                .as_f64()
                .filter(|value| value.fract() == 0.0)
                .and_then(|value| {
                    if value >= i64::MIN as f64 && value <= i64::MAX as f64 {
                        Some(Value::Number(serde_json::Number::from(value as i64)))
                    } else {
                        None
                    }
                })
                .unwrap_or(Value::Number(number)),
            scalar => scalar,
        }
    }

    canonicalize_json(serde_json::to_value(value).map_err(|_| {
        ProxyError::Request("could not canonicalize portable Game Asset evidence".into())
    })?)
    .map(normalize_numbers)
    .and_then(|value| {
        serde_json::to_vec(&value).map_err(|_| {
            ProxyError::Request("could not canonicalize portable Game Asset evidence".into())
        })
    })
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
        || !valid_id(&plan.delivery.format_id)
        || plan.delivery.frame_width == 0
        || plan.delivery.frame_height == 0
        || plan.delivery.columns == 0
        || plan.delivery.columns > 1_000
        || plan.delivery.rows == 0
        || plan.delivery.rows > 1_000
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
                role.action.as_str(),
                "single"
                    | "idle"
                    | "walk"
                    | "run"
                    | "attack"
                    | "cast"
                    | "shoot"
                    | "jump"
                    | "hurt"
                    | "death"
                    | "hover"
                    | "charge"
                    | "projectile"
                    | "impact"
                    | "explode"
            )
            || !matches!(
                role.direction.as_str(),
                "none" | "down" | "left" | "right" | "up"
            )
            || role.frame_index > 10_000
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
    let retained_evidence = evidence
        .iter()
        .zip(&decoded)
        .map(|(item, bytes)| RetainedEvidenceSummary {
            reference: item.reference.clone(),
            media_type: item.media_type.clone(),
            byte_length: bytes.len(),
        })
        .collect();
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
            parent_authorization_receipt_id: None,
            parent_authorization_receipt_hash: None,
            replacement_role_ids: None,
        },
        identity: input.identity,
        plan,
        plan_value: input.plan,
        reference_bytes,
        retained_evidence,
        roles,
        preserved_outputs: BTreeMap::new(),
        repair_lineage: None,
    })
}

fn preview_action_sheet_request(
    input: GameAssetActionSheetPreviewInput,
    now: u64,
) -> Result<StoredActionSheetPreview, ProxyError> {
    if !valid_id(&input.family_plan_id)
        || !valid_hash(&input.family_plan_hash)
        || !valid_id(&input.group_id)
        || !valid_prompt(&input.source_brief)
        || input.grid.rows == 0
        || input.grid.columns == 0
        || input.grid.rows > MAX_ROLES as u32
        || input.grid.columns > MAX_ROLES as u32
        || input.frame_duration_ms == 0
        || input.frame_duration_ms > 10_000
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet preview is outside the bounded contract".into(),
        ));
    }
    let plan: GamePlan = serde_json::from_value(input.plan.clone())
        .map_err(|_| ProxyError::Request("Game Asset action-sheet plan is invalid".into()))?;
    validate_plan(&plan)?;
    if u64::from(input.grid.rows) * u64::from(input.grid.columns) != plan.roles.len() as u64
        || plan
            .roles
            .iter()
            .enumerate()
            .any(|(index, role)| role.frame_index != index as u32)
        || plan.roles.iter().any(|role| {
            role.action != plan.roles[0].action || role.direction != plan.roles[0].direction
        })
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet grid must close one ordered action and direction".into(),
        ));
    }
    let output_width = plan
        .delivery
        .frame_width
        .checked_mul(input.grid.columns)
        .ok_or_else(|| ProxyError::Request("Game Asset action-sheet width overflowed".into()))?;
    let output_height = plan
        .delivery
        .frame_height
        .checked_mul(input.grid.rows)
        .ok_or_else(|| ProxyError::Request("Game Asset action-sheet height overflowed".into()))?;
    let output_pixels = u64::from(output_width) * u64::from(output_height);
    if output_width == 0
        || output_height == 0
        || output_width > MAX_IMAGE_DIMENSION
        || output_height > MAX_IMAGE_DIMENSION
        || output_pixels < 512 * 512
        || output_pixels > 2048 * 2048
        || u64::from(output_width) > u64::from(output_height) * 8
        || u64::from(output_height) > u64::from(output_width) * 8
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet output size is unsupported by the Qwen route".into(),
        ));
    }
    let role_prompts = plan
        .roles
        .iter()
        .map(|role| RolePromptInput {
            role_id: role.id.clone(),
            prompt: input.source_brief.clone(),
        })
        .collect();
    let base = preview_request(
        GameAssetGenerationPreviewInput {
            identity: input.identity.clone(),
            run_id: input.run_id.clone(),
            provider_id: input.provider_id.clone(),
            model: input.model.clone(),
            plan: input.plan.clone(),
            retained_evidence: input.retained_evidence,
            roles: role_prompts,
        },
        now,
    )?;
    let mut lock_ids = base
        .roles
        .iter()
        .flat_map(|role| role.lock_ids.iter().cloned())
        .collect::<Vec<_>>();
    lock_ids.push(format!(
        "game-asset-family-plan:sha256:{}",
        input.family_plan_hash
    ));
    lock_ids.sort();
    lock_ids.dedup();
    let accepted_reference_artifact_ids = base.preview.reference_artifact_ids.clone();
    let request = StoredRoleRequest {
        role_id: input.group_id.clone(),
        request_id: format!(
            "request:game-asset-action-sheet:{}",
            uuid::Uuid::new_v4().simple()
        ),
        prompt_hash: sha256(input.source_brief.as_bytes()),
        prompt: input.source_brief,
        semantic_role: input.group_id.clone(),
        node_id: format!("node:game-asset-action-sheet:{}", input.group_id),
        capability_id: "capability:image-generation".into(),
        accepted_reference_artifact_ids: accepted_reference_artifact_ids.clone(),
        lock_ids,
    };
    let output_size = format!("{output_width}x{output_height}");
    let digest_value = serde_json::json!({
        "protocol": ACTION_SHEET_PREVIEW_PROTOCOL,
        "identity": input.identity,
        "runId": input.run_id,
        "providerId": input.provider_id,
        "model": input.model,
        "familyPlanId": input.family_plan_id,
        "familyPlanHash": input.family_plan_hash,
        "groupId": input.group_id,
        "plan": input.plan,
        "retainedEvidence": base.retained_evidence,
        "sourceRequest": request,
        "grid": input.grid,
        "frameDurationMs": input.frame_duration_ms,
        "looping": input.looping,
        "outputSize": output_size,
        "splitterImplementation": ACTION_SHEET_SPLITTER_IMPLEMENTATION,
        "processorImplementation": CUTOUT_IMPLEMENTATION,
    });
    let request_digest = canonical_hash(&digest_value)?;
    let plan_id = format!("game-asset-action-sheet-preview:sha256:{request_digest}");
    Ok(StoredActionSheetPreview {
        preview: GameAssetActionSheetPreview {
            protocol: ACTION_SHEET_PREVIEW_PROTOCOL.into(),
            plan_id,
            request_digest,
            run_id: input.run_id,
            family_plan_id: input.family_plan_id,
            family_plan_hash: input.family_plan_hash,
            group_id: input.group_id,
            game_plan_id: base.plan.id.clone(),
            provider_id: input.provider_id,
            model: input.model,
            role_ids: base.plan.roles.iter().map(|role| role.id.clone()).collect(),
            reference_artifact_ids: accepted_reference_artifact_ids,
            grid: input.grid,
            output_size,
            splitter_implementation: ACTION_SHEET_SPLITTER_IMPLEMENTATION.into(),
            processor_implementation: CUTOUT_IMPLEMENTATION.into(),
            frame_duration_ms: input.frame_duration_ms,
            looping: input.looping,
            expires_at: now + PREVIEW_TTL_MS,
            execution_mode: "byok-direct".into(),
        },
        identity: base.identity,
        plan: base.plan,
        plan_value: base.plan_value,
        reference_bytes: base.reference_bytes,
        request,
    })
}

fn preview_action_sheet_repair_request(
    input: GameAssetActionSheetRepairPreviewInput,
    now: u64,
) -> Result<StoredActionSheetRepairPreview, ProxyError> {
    if !valid_id(&input.run_id) || input.roles.is_empty() || input.roles.len() >= MAX_ROLES {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair preview identity or role closure is invalid".into(),
        ));
    }
    let plan: GamePlan = serde_json::from_value(input.plan.clone()).map_err(|_| {
        ProxyError::Request("Game Asset action-sheet repair plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    let parent_authorization = input.parent_authorization;
    let parent_source = input.parent_source;
    let parent_clip = input.parent_clip;
    verify_action_sheet_authorization(
        parent_authorization.clone(),
        input.plan.clone(),
        parent_source.clone(),
        parent_clip.clone(),
    )?;
    if input.run_id == parent_authorization.run_id
        || parent_authorization.game_plan_id != plan.id
        || parent_authorization.game_plan_hash != canonical_hash(&input.plan)?
        || parent_source.family_plan_id != parent_authorization.family_plan_id
        || parent_source.group_id != parent_authorization.group_id
        || parent_clip.family_plan_id != parent_authorization.family_plan_id
        || parent_clip.group_id != parent_authorization.group_id
        || parent_clip.source_id != parent_source.id
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair parent closure drifted from its plan".into(),
        ));
    }
    let role_ids = plan
        .roles
        .iter()
        .map(|role| role.id.clone())
        .collect::<Vec<_>>();
    let replacement_role_ids = input
        .roles
        .iter()
        .map(|role| role.role_id.clone())
        .collect::<Vec<_>>();
    if replacement_role_ids
        .iter()
        .any(|role_id| !role_ids.iter().any(|candidate| candidate == role_id))
        || replacement_role_ids.len() >= role_ids.len()
        || replacement_role_ids.iter().collect::<HashSet<_>>().len() != replacement_role_ids.len()
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair roles must be a unique strict subset of the parent plan"
                .into(),
        ));
    }
    let source_bytes = verify_action_artifact(&parent_source.source)?;
    let mut roles = Vec::with_capacity(input.roles.len());
    let mut request_summaries = Vec::with_capacity(input.roles.len());
    for prompt in input.roles {
        if !valid_prompt(&prompt.prompt) {
            return Err(ProxyError::Request(
                "Game Asset action-sheet repair prompt is invalid".into(),
            ));
        }
        let role = plan
            .roles
            .iter()
            .find(|role| role.id == prompt.role_id)
            .cloned()
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet repair role disappeared".into())
            })?;
        let cell = parent_source
            .cells
            .iter()
            .find(|cell| cell.role_id == role.id)
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet repair parent cell disappeared".into())
            })?;
        let cell_bytes = verify_action_artifact(&cell.artifact)?;
        let composition_reference = action_sheet_repair_composition_reference(&cell_bytes)?;
        let composition_artifact_id = format!("artifact:sha256:{}", sha256(&composition_reference));
        let accepted_reference_artifact_ids = vec![
            parent_source.source.artifact_id.clone(),
            composition_artifact_id,
        ];
        let mut lock_ids = parent_authorization.source_request.lock_ids.clone();
        lock_ids.push(format!(
            "game-asset-action-sheet-parent:{}",
            parent_authorization.receipt_id
        ));
        lock_ids.push(action_sheet_repair_composition_lock_id());
        lock_ids.sort();
        lock_ids.dedup();
        let request = StoredRoleRequest {
            role_id: role.id.clone(),
            request_id: format!(
                "request:game-asset-action-sheet-repair:{}",
                uuid::Uuid::new_v4().simple()
            ),
            prompt_hash: sha256(prompt.prompt.as_bytes()),
            prompt: prompt.prompt,
            semantic_role: format!("{}:repair:{}", parent_authorization.group_id, role.id),
            node_id: format!("node:game-asset-action-sheet-repair:{}", role.id),
            capability_id: "capability:image-generation".into(),
            accepted_reference_artifact_ids,
            lock_ids,
        };
        request_summaries.push(request.clone());
        roles.push(StoredActionSheetRepairRole {
            role,
            request,
            reference_bytes: vec![source_bytes.clone(), composition_reference],
        });
    }
    let output_size = format!(
        "{}x{}",
        plan.delivery.frame_width, plan.delivery.frame_height
    );
    let digest_value = serde_json::json!({
        "protocol": ACTION_SHEET_REPAIR_PREVIEW_PROTOCOL,
        "parentAuthorizationReceiptId": parent_authorization.receipt_id,
        "parentAuthorizationReceiptHash": parent_authorization.receipt_hash,
        "parentSourceId": parent_source.id,
        "parentClipId": parent_clip.id,
        "runId": input.run_id,
        "plan": input.plan,
        "roleRequests": request_summaries,
        "outputSize": output_size,
        "processorImplementation": CUTOUT_IMPLEMENTATION,
    });
    let request_digest = canonical_hash(&digest_value)?;
    let plan_id = format!("game-asset-action-sheet-repair-preview:sha256:{request_digest}");
    let preview = GameAssetActionSheetRepairPreview {
        protocol: ACTION_SHEET_REPAIR_PREVIEW_PROTOCOL.into(),
        plan_id,
        request_digest,
        run_id: input.run_id,
        parent_authorization_receipt_id: parent_authorization.receipt_id.clone(),
        parent_authorization_receipt_hash: parent_authorization.receipt_hash.clone(),
        parent_source_id: parent_source.id.clone(),
        parent_clip_id: parent_clip.id.clone(),
        family_plan_id: parent_authorization.family_plan_id.clone(),
        family_plan_hash: parent_authorization.family_plan_hash.clone(),
        group_id: parent_authorization.group_id.clone(),
        game_plan_id: plan.id.clone(),
        provider_id: parent_authorization.provider_id.clone(),
        model: parent_authorization.model.clone(),
        role_ids,
        replacement_role_ids,
        output_size,
        processor_implementation: CUTOUT_IMPLEMENTATION.into(),
        expires_at: now + PREVIEW_TTL_MS,
        execution_mode: "byok-direct".into(),
    };
    Ok(StoredActionSheetRepairPreview {
        preview,
        parent_authorization,
        parent_source,
        parent_clip,
        plan,
        plan_value: input.plan,
        roles,
    })
}

fn preview_action_sheet_partial_repair_request(
    input: GameAssetActionSheetPartialRepairPreviewInput,
    now: u64,
) -> Result<StoredActionSheetPartialRepairPreview, ProxyError> {
    if !valid_id(&input.run_id) || input.roles.is_empty() || input.roles.len() >= MAX_ROLES {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair preview identity or role closure is invalid"
                .into(),
        ));
    }
    let plan: GamePlan = serde_json::from_value(input.plan.clone()).map_err(|_| {
        ProxyError::Request("Game Asset partial action-sheet repair plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    let parent_authorization = input.parent_authorization;
    let parent_source = input.parent_source;
    let parent_partial = input.parent_partial;
    verify_action_sheet_partial_authorization(
        parent_authorization.clone(),
        input.plan.clone(),
        parent_source.clone(),
        parent_partial.clone(),
    )?;
    if input.run_id == parent_authorization.run_id
        || parent_authorization.game_plan_id != plan.id
        || parent_authorization.game_plan_hash != canonical_hash(&input.plan)?
        || parent_source.family_plan_id != parent_authorization.family_plan_id
        || parent_source.group_id != parent_authorization.group_id
        || parent_partial.family_plan_id != parent_authorization.family_plan_id
        || parent_partial.group_id != parent_authorization.group_id
        || parent_partial.source_id != parent_source.id
        || parent_partial.frames.is_empty()
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair parent closure drifted from its plan".into(),
        ));
    }
    let role_ids = plan
        .roles
        .iter()
        .map(|role| role.id.clone())
        .collect::<Vec<_>>();
    let replacement_role_ids = input
        .roles
        .iter()
        .map(|role| role.role_id.clone())
        .collect::<Vec<_>>();
    let failed_role_ids = parent_partial
        .failures
        .iter()
        .map(|failure| failure.role_id.clone())
        .collect::<Vec<_>>();
    if replacement_role_ids != failed_role_ids
        || replacement_role_ids.len() >= role_ids.len()
        || replacement_role_ids.iter().collect::<HashSet<_>>().len() != replacement_role_ids.len()
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair must replace the exact failed-cell closure"
                .into(),
        ));
    }
    let source_bytes = verify_action_artifact(&parent_source.source)?;
    let mut roles = Vec::with_capacity(input.roles.len());
    let mut request_summaries = Vec::with_capacity(input.roles.len());
    for prompt in input.roles {
        if !valid_prompt(&prompt.prompt) {
            return Err(ProxyError::Request(
                "Game Asset partial action-sheet repair prompt is invalid".into(),
            ));
        }
        let role = plan
            .roles
            .iter()
            .find(|role| role.id == prompt.role_id)
            .cloned()
            .ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset partial action-sheet repair role disappeared".into(),
                )
            })?;
        let cell = parent_source
            .cells
            .iter()
            .find(|cell| cell.role_id == role.id)
            .ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset partial action-sheet repair parent cell disappeared".into(),
                )
            })?;
        let cell_bytes = verify_action_artifact(&cell.artifact)?;
        let composition_reference = action_sheet_repair_composition_reference(&cell_bytes)?;
        let composition_artifact_id = format!("artifact:sha256:{}", sha256(&composition_reference));
        let accepted_reference_artifact_ids = vec![
            parent_source.source.artifact_id.clone(),
            composition_artifact_id,
        ];
        let mut lock_ids = parent_authorization.source_request.lock_ids.clone();
        lock_ids.push(format!(
            "game-asset-action-sheet-partial-parent:{}",
            parent_authorization.receipt_id
        ));
        lock_ids.push(action_sheet_repair_composition_lock_id());
        lock_ids.sort();
        lock_ids.dedup();
        let request = StoredRoleRequest {
            role_id: role.id.clone(),
            request_id: format!(
                "request:game-asset-action-sheet-partial-repair:{}",
                uuid::Uuid::new_v4().simple()
            ),
            prompt_hash: sha256(prompt.prompt.as_bytes()),
            prompt: prompt.prompt,
            semantic_role: format!(
                "{}:partial-repair:{}",
                parent_authorization.group_id, role.id
            ),
            node_id: format!("node:game-asset-action-sheet-partial-repair:{}", role.id),
            capability_id: "capability:image-generation".into(),
            accepted_reference_artifact_ids,
            lock_ids,
        };
        request_summaries.push(request.clone());
        roles.push(StoredActionSheetRepairRole {
            role,
            request,
            reference_bytes: vec![source_bytes.clone(), composition_reference],
        });
    }
    let output_size = format!(
        "{}x{}",
        plan.delivery.frame_width, plan.delivery.frame_height
    );
    let digest_value = serde_json::json!({
        "protocol": ACTION_SHEET_PARTIAL_REPAIR_PREVIEW_PROTOCOL,
        "parentAuthorizationReceiptId": parent_authorization.receipt_id,
        "parentAuthorizationReceiptHash": parent_authorization.receipt_hash,
        "parentSourceId": parent_source.id,
        "parentPartialId": parent_partial.id,
        "runId": input.run_id,
        "plan": input.plan,
        "roleRequests": request_summaries,
        "outputSize": output_size,
        "processorImplementation": CUTOUT_IMPLEMENTATION,
    });
    let request_digest = canonical_hash(&digest_value)?;
    let plan_id = format!("game-asset-action-sheet-partial-repair-preview:sha256:{request_digest}");
    let preview = GameAssetActionSheetPartialRepairPreview {
        protocol: ACTION_SHEET_PARTIAL_REPAIR_PREVIEW_PROTOCOL.into(),
        plan_id,
        request_digest,
        run_id: input.run_id,
        parent_authorization_receipt_id: parent_authorization.receipt_id.clone(),
        parent_authorization_receipt_hash: parent_authorization.receipt_hash.clone(),
        parent_source_id: parent_source.id.clone(),
        parent_partial_id: parent_partial.id.clone(),
        family_plan_id: parent_authorization.family_plan_id.clone(),
        family_plan_hash: parent_authorization.family_plan_hash.clone(),
        group_id: parent_authorization.group_id.clone(),
        game_plan_id: plan.id.clone(),
        provider_id: parent_authorization.provider_id.clone(),
        model: parent_authorization.model.clone(),
        role_ids,
        replacement_role_ids,
        output_size,
        processor_implementation: CUTOUT_IMPLEMENTATION.into(),
        expires_at: now + PREVIEW_TTL_MS,
        execution_mode: "byok-direct".into(),
    };
    Ok(StoredActionSheetPartialRepairPreview {
        preview,
        parent_authorization,
        parent_source,
        parent_partial,
        plan,
        plan_value: input.plan,
        roles,
    })
}

fn preview_action_sheet_partial_reprocess_request(
    input: GameAssetActionSheetPartialReprocessPreviewInput,
    now: u64,
) -> Result<StoredActionSheetPartialReprocessPreview, ProxyError> {
    let plan: GamePlan = serde_json::from_value(input.plan.clone()).map_err(|_| {
        ProxyError::Request("Game Asset partial action-sheet reprocess plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    let parent_authorization = input.parent_authorization;
    let parent_source = input.parent_source;
    let parent_partial = input.parent_partial;
    verify_action_sheet_partial_authorization(
        parent_authorization.clone(),
        input.plan.clone(),
        parent_source.clone(),
        parent_partial.clone(),
    )?;
    let role_ids = plan
        .roles
        .iter()
        .map(|role| role.id.clone())
        .collect::<Vec<_>>();
    let reprocessed_role_ids = parent_partial
        .failures
        .iter()
        .map(|failure| failure.role_id.clone())
        .collect::<Vec<_>>();
    if parent_authorization.game_plan_id != plan.id
        || parent_authorization.game_plan_hash != canonical_hash(&input.plan)?
        || parent_source.family_plan_id != parent_authorization.family_plan_id
        || parent_source.group_id != parent_authorization.group_id
        || parent_partial.family_plan_id != parent_authorization.family_plan_id
        || parent_partial.group_id != parent_authorization.group_id
        || parent_partial.source_id != parent_source.id
        || reprocessed_role_ids.is_empty()
        || reprocessed_role_ids.len() >= role_ids.len()
        || reprocessed_role_ids != parent_authorization.failed_role_ids
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet reprocess parent closure drifted from its signed failures"
                .into(),
        ));
    }
    let run_id = format!(
        "run:game-asset-action-sheet-partial-reprocess:{}",
        uuid::Uuid::new_v4().simple()
    );
    let digest_value = serde_json::json!({
        "protocol": ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL,
        "parentAuthorizationReceiptId": parent_authorization.receipt_id,
        "parentAuthorizationReceiptHash": parent_authorization.receipt_hash,
        "parentSourceId": parent_source.id,
        "parentPartialId": parent_partial.id,
        "runId": run_id,
        "plan": input.plan,
        "roleIds": role_ids,
        "reprocessedRoleIds": reprocessed_role_ids,
        "processorImplementation": SPATIAL_BOARD_CUTOUT_IMPLEMENTATION,
        "providerCalls": 0,
        "executionMode": "local-deterministic",
    });
    let request_digest = canonical_hash(&digest_value)?;
    let plan_id =
        format!("game-asset-action-sheet-partial-reprocess-preview:sha256:{request_digest}");
    let preview = GameAssetActionSheetPartialReprocessPreview {
        protocol: ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL.into(),
        plan_id,
        request_digest,
        run_id,
        parent_authorization_receipt_id: parent_authorization.receipt_id.clone(),
        parent_authorization_receipt_hash: parent_authorization.receipt_hash.clone(),
        parent_source_id: parent_source.id.clone(),
        parent_partial_id: parent_partial.id.clone(),
        family_plan_id: parent_authorization.family_plan_id.clone(),
        family_plan_hash: parent_authorization.family_plan_hash.clone(),
        group_id: parent_authorization.group_id.clone(),
        game_plan_id: plan.id.clone(),
        role_ids,
        reprocessed_role_ids,
        processor_implementation: SPATIAL_BOARD_CUTOUT_IMPLEMENTATION.into(),
        provider_calls: 0,
        expires_at: now + PREVIEW_TTL_MS,
        execution_mode: "local-deterministic".into(),
    };
    let stored = StoredActionSheetPartialReprocessPreview {
        preview,
        parent_authorization,
        parent_source,
        parent_partial,
        plan,
        plan_value: input.plan,
    };
    derive_partial_reprocessed_clip(&stored)?;
    Ok(stored)
}

fn preview_repair_request(
    input: GameAssetGenerationRepairPreviewInput,
    now: u64,
) -> Result<StoredPreview, ProxyError> {
    if !valid_id(&input.run_id)
        || input.roles.is_empty()
        || input.roles.len() >= MAX_ROLES
        || input.parent_outputs.is_empty()
    {
        return Err(ProxyError::Request(
            "Game Asset repair preview identity or role closure is invalid".into(),
        ));
    }
    let parent_outputs = input.parent_outputs;
    let parent =
        verify_generation_authorization(input.parent_authorization, parent_outputs.clone())?;
    if parent.processor_implementation != CUTOUT_IMPLEMENTATION
        || input.run_id == parent.run_id
        || parent_outputs
            .iter()
            .any(|output| output.receipt.run_id == input.run_id)
    {
        return Err(ProxyError::Request(
            "Game Asset repair requires a new run over a current processor authorization".into(),
        ));
    }
    let plan: GamePlan = serde_json::from_value(input.plan.clone())
        .map_err(|_| ProxyError::Request("Game Asset repair plan is invalid".into()))?;
    validate_plan(&plan)?;
    let output_size = format!(
        "{}x{}",
        plan.delivery.frame_width, plan.delivery.frame_height
    );
    if plan.id != parent.game_plan_id
        || canonical_hash(&input.plan)? != parent.game_plan_hash
        || output_size != parent.output_size
        || parent.role_requests.len() != plan.roles.len()
        || parent
            .role_requests
            .iter()
            .zip(&plan.roles)
            .any(|(request, role)| {
                request.role_id != role.id || request.anchor_policy != role.anchor
            })
    {
        return Err(ProxyError::Request(
            "Game Asset repair plan drifted from its parent authorization".into(),
        ));
    }

    let mut replacement_prompts = BTreeMap::new();
    for role in input.roles {
        if !plan
            .roles
            .iter()
            .any(|candidate| candidate.id == role.role_id)
            || !valid_prompt(&role.prompt)
            || replacement_prompts
                .insert(role.role_id, role.prompt)
                .is_some()
        {
            return Err(ProxyError::Request(
                "Game Asset repair roles must be a unique subset of the parent plan".into(),
            ));
        }
    }
    if replacement_prompts.len() >= plan.roles.len() {
        return Err(ProxyError::Request(
            "Game Asset repair must preserve at least one parent role".into(),
        ));
    }
    let parent_requests = parent
        .role_requests
        .iter()
        .map(|request| (request.role_id.clone(), request))
        .collect::<BTreeMap<_, _>>();
    let roles = plan
        .roles
        .iter()
        .map(|role| RolePromptInput {
            role_id: role.id.clone(),
            prompt: replacement_prompts
                .get(&role.id)
                .cloned()
                .or_else(|| {
                    parent_requests
                        .get(&role.id)
                        .map(|request| request.prompt.clone())
                })
                .unwrap_or_default(),
        })
        .collect();
    let mut stored = preview_request(
        GameAssetGenerationPreviewInput {
            identity: parent.identity.clone(),
            run_id: input.run_id,
            provider_id: parent.provider_id.clone(),
            model: parent.model.clone(),
            plan: input.plan,
            retained_evidence: input.retained_evidence,
            roles,
        },
        now,
    )?;
    let parent_outputs_by_role = parent_outputs
        .into_iter()
        .map(|output| (output.role_id.clone(), output))
        .collect::<BTreeMap<_, _>>();
    let mut preserved_outputs = BTreeMap::new();
    let mut preserved_roles = Vec::new();
    let replacement_role_ids = plan
        .roles
        .iter()
        .filter(|role| replacement_prompts.contains_key(&role.id))
        .map(|role| role.id.clone())
        .collect::<Vec<_>>();
    for role in &mut stored.roles {
        if replacement_prompts.contains_key(&role.role_id) {
            continue;
        }
        let parent_request = parent_requests.get(&role.role_id).ok_or_else(|| {
            ProxyError::Request("Game Asset repair parent request closure is incomplete".into())
        })?;
        let parent_output = parent_outputs_by_role
            .get(&role.role_id)
            .cloned()
            .ok_or_else(|| {
                ProxyError::Request("Game Asset repair parent output closure is incomplete".into())
            })?;
        *role = StoredRoleRequest {
            role_id: parent_request.role_id.clone(),
            request_id: parent_request.request_id.clone(),
            prompt: parent_request.prompt.clone(),
            prompt_hash: parent_request.prompt_hash.clone(),
            semantic_role: parent_request.semantic_role.clone(),
            node_id: parent_request.node_id.clone(),
            capability_id: parent_request.capability_id.clone(),
            accepted_reference_artifact_ids: parent_request.accepted_reference_artifact_ids.clone(),
            lock_ids: parent_request.lock_ids.clone(),
        };
        preserved_roles.push(PreservedGameAssetRoleLineage {
            role_id: role.role_id.clone(),
            origin_run_id: parent_output.receipt.run_id.clone(),
            request_id: parent_output.receipt.request_id.clone(),
            receipt_id: parent_output.receipt.receipt_id.clone(),
            source_artifact_id: parent_output.receipt.artifact.artifact_id.clone(),
            artifact_id: parent_output.processing_evidence.output_artifact_id.clone(),
        });
        preserved_outputs.insert(role.role_id.clone(), parent_output);
    }
    let repair_lineage = GameAssetGenerationRepairLineage {
        parent_receipt_id: parent.receipt_id.clone(),
        parent_receipt_hash: parent.receipt_hash.clone(),
        replaced_role_ids: replacement_role_ids.clone(),
        preserved_roles,
    };
    let digest_value = serde_json::json!({
        "protocol": REPAIR_PREVIEW_PROTOCOL,
        "parentAuthorizationReceiptId": &parent.receipt_id,
        "parentAuthorizationReceiptHash": &parent.receipt_hash,
        "runId": &stored.preview.run_id,
        "providerId": &stored.preview.provider_id,
        "model": &stored.preview.model,
        "plan": &stored.plan_value,
        "retainedEvidence": &stored.retained_evidence,
        "roles": &stored.roles,
        "replacementRoleIds": &replacement_role_ids,
        "outputSize": &stored.preview.output_size,
        "processorImplementation": CUTOUT_IMPLEMENTATION,
    });
    let request_digest = canonical_hash(&digest_value)?;
    stored.preview.protocol = REPAIR_PREVIEW_PROTOCOL.into();
    stored.preview.request_digest = request_digest.clone();
    stored.preview.plan_id = format!("game-asset-preview:sha256:{request_digest}");
    stored.preview.parent_authorization_receipt_id = Some(parent.receipt_id);
    stored.preview.parent_authorization_receipt_hash = Some(parent.receipt_hash);
    stored.preview.replacement_role_ids = Some(replacement_role_ids);
    stored.preserved_outputs = preserved_outputs;
    stored.repair_lineage = Some(repair_lineage);
    Ok(stored)
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

fn is_white_background_pixel(rgba: &[u8], index: usize) -> bool {
    let offset = index * 4;
    rgba[offset + 3] < ALPHA_THRESHOLD
        || (rgba[offset] >= CUTOUT_WHITE_THRESHOLD
            && rgba[offset + 1] >= CUTOUT_WHITE_THRESHOLD
            && rgba[offset + 2] >= CUTOUT_WHITE_THRESHOLD)
}

fn enqueue_white_background(rgba: &[u8], index: usize, seen: &mut [bool], queue: &mut Vec<usize>) {
    if seen[index] {
        return;
    }
    seen[index] = true;
    if is_white_background_pixel(rgba, index) {
        queue.push(index);
    }
}

fn unpremultiply_white(channel: u8, alpha: u8) -> u8 {
    let recovered =
        (f64::from(channel) * 255.0 - 255.0 * (255.0 - f64::from(alpha))) / f64::from(alpha);
    recovered.round().clamp(0.0, 255.0) as u8
}

fn soften_white_edges(rgba: &mut [u8], background: &[bool], width: usize, height: usize) {
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

fn matte_white_board_v2(source_bytes: &[u8]) -> Result<image::RgbaImage, ProxyError> {
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
        enqueue_white_background(&rgba, x, &mut seen, &mut queue);
        enqueue_white_background(&rgba, last_row + x, &mut seen, &mut queue);
    }
    for y in 0..height_usize {
        enqueue_white_background(&rgba, y * width_usize, &mut seen, &mut queue);
        enqueue_white_background(
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
            enqueue_white_background(&rgba, index - 1, &mut seen, &mut queue);
        }
        if x + 1 < width_usize {
            enqueue_white_background(&rgba, index + 1, &mut seen, &mut queue);
        }
        if y > 0 {
            enqueue_white_background(&rgba, index - width_usize, &mut seen, &mut queue);
        }
        if y + 1 < height_usize {
            enqueue_white_background(&rgba, index + width_usize, &mut seen, &mut queue);
        }
    }
    for (index, is_background) in background.iter().enumerate() {
        if *is_background {
            rgba[index * 4 + 3] = 0;
        }
    }
    soften_white_edges(&mut rgba, &background, width_usize, height_usize);
    image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
        ProxyError::Request("Game Asset cutout pixels could not be reconstructed".into())
    })
}

struct BoardMatte {
    image: image::RgbaImage,
    background_color: Option<[u8; 3]>,
    color_distance_threshold: Option<f64>,
    route: &'static str,
}

struct SpatialBoardField {
    colors: Vec<[u8; 3]>,
    summary_color: [u8; 3],
    distance_threshold_squared: u32,
    evidence: SpatialBoardModelEvidence,
}

fn rgb_distance(rgba: &[u8], index: usize, background: &[u8; 3]) -> f64 {
    let offset = index * 4;
    let red = f64::from(rgba[offset]) - f64::from(background[0]);
    let green = f64::from(rgba[offset + 1]) - f64::from(background[1]);
    let blue = f64::from(rgba[offset + 2]) - f64::from(background[2]);
    (red * red + green * green + blue * blue).sqrt()
}

fn spatial_chroma_distance_squared(rgba: &[u8], index: usize, background: [u8; 3]) -> u32 {
    let offset = index * 4;
    bt601_chroma_distance_squared(
        [rgba[offset], rgba[offset + 1], rgba[offset + 2]],
        background,
    )
}

fn is_spatial_magenta_board_candidate(rgba: &[u8], index: usize) -> bool {
    let offset = index * 4;
    if rgba[offset + 3] < ALPHA_THRESHOLD {
        return false;
    }
    let red = rgba[offset];
    let green = rgba[offset + 1];
    let blue = rgba[offset + 2];
    red >= blue && red.saturating_sub(green) >= 64 && blue.saturating_sub(green) >= 24
}

fn median_spatial_board_sample(
    rgba: &[u8],
    width: usize,
    height: usize,
    center_x: usize,
    center_y: usize,
    radius: usize,
    perimeter_only: bool,
) -> Option<[u8; 3]> {
    let mut channels = [Vec::new(), Vec::new(), Vec::new()];
    let min_x = center_x.saturating_sub(radius);
    let max_x = (center_x + radius).min(width - 1);
    let min_y = center_y.saturating_sub(radius);
    let max_y = (center_y + radius).min(height - 1);
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            if perimeter_only && x != 0 && y != 0 && x + 1 != width && y + 1 != height {
                continue;
            }
            let index = y * width + x;
            if !is_spatial_magenta_board_candidate(rgba, index) {
                continue;
            }
            let offset = index * 4;
            for channel in 0..3 {
                channels[channel].push(rgba[offset + channel]);
            }
        }
    }
    if channels[0].len() < SPATIAL_BOARD_MIN_SAMPLES {
        return None;
    }
    for channel in &mut channels {
        channel.sort_unstable();
    }
    let middle = channels[0].len() / 2;
    Some([
        channels[0][middle],
        channels[1][middle],
        channels[2][middle],
    ])
}

fn interpolate_spatial_board_field(nodes: &[[u8; 3]], width: usize, height: usize) -> Vec<[u8; 3]> {
    let mut field = Vec::with_capacity(width.saturating_mul(height));
    let x_denominator = width - 1;
    let y_denominator = height - 1;
    for y in 0..height {
        let scaled_y = y * (SPATIAL_BOARD_GRID_ROWS - 1);
        let top = scaled_y / y_denominator;
        let bottom = (top + 1).min(SPATIAL_BOARD_GRID_ROWS - 1);
        let y_remainder = scaled_y % y_denominator;
        for x in 0..width {
            let scaled_x = x * (SPATIAL_BOARD_GRID_COLUMNS - 1);
            let left = scaled_x / x_denominator;
            let right = (left + 1).min(SPATIAL_BOARD_GRID_COLUMNS - 1);
            let x_remainder = scaled_x % x_denominator;
            let weights = [
                (x_denominator - x_remainder) * (y_denominator - y_remainder),
                x_remainder * (y_denominator - y_remainder),
                (x_denominator - x_remainder) * y_remainder,
                x_remainder * y_remainder,
            ];
            let denominator = x_denominator * y_denominator;
            let colors = [
                nodes[top * SPATIAL_BOARD_GRID_COLUMNS + left],
                nodes[top * SPATIAL_BOARD_GRID_COLUMNS + right],
                nodes[bottom * SPATIAL_BOARD_GRID_COLUMNS + left],
                nodes[bottom * SPATIAL_BOARD_GRID_COLUMNS + right],
            ];
            let mut color = [0_u8; 3];
            for channel in 0..3 {
                let weighted = (0..4)
                    .map(|index| u64::from(colors[index][channel]) * weights[index] as u64)
                    .sum::<u64>();
                color[channel] = ((weighted + denominator as u64 / 2) / denominator as u64) as u8;
            }
            field.push(color);
        }
    }
    field
}

fn estimate_spatial_magenta_board_field(
    rgba: &[u8],
    width: usize,
    height: usize,
) -> Result<SpatialBoardField, ProxyError> {
    if width < SPATIAL_BOARD_GRID_COLUMNS
        || height < SPATIAL_BOARD_GRID_ROWS
        || rgba.len() != width.saturating_mul(height).saturating_mul(4)
    {
        return Err(ProxyError::Request(
            "Game Asset spatial board field dimensions are invalid".into(),
        ));
    }
    let perimeter = border_indices(width, height);
    let opaque_perimeter = perimeter
        .iter()
        .filter(|index| rgba[**index * 4 + 3] >= ALPHA_THRESHOLD)
        .count();
    if opaque_perimeter == 0
        || perimeter.iter().any(|index| {
            rgba[*index * 4 + 3] >= ALPHA_THRESHOLD
                && !is_spatial_magenta_board_candidate(rgba, *index)
        })
    {
        return Err(ProxyError::Request(
            "Game Asset spatial board model requires a closed high-chroma magenta perimeter".into(),
        ));
    }

    let mut nodes = Vec::with_capacity(SPATIAL_BOARD_GRID_COLUMNS * SPATIAL_BOARD_GRID_ROWS);
    for row in 0..SPATIAL_BOARD_GRID_ROWS {
        let y = row * (height - 1) / (SPATIAL_BOARD_GRID_ROWS - 1);
        for column in 0..SPATIAL_BOARD_GRID_COLUMNS {
            let x = column * (width - 1) / (SPATIAL_BOARD_GRID_COLUMNS - 1);
            let perimeter_only = row == 0
                || row + 1 == SPATIAL_BOARD_GRID_ROWS
                || column == 0
                || column + 1 == SPATIAL_BOARD_GRID_COLUMNS;
            let mut radius = SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS;
            let color = loop {
                if let Some(color) =
                    median_spatial_board_sample(rgba, width, height, x, y, radius, perimeter_only)
                {
                    break color;
                }
                if radius >= SPATIAL_BOARD_MAX_SAMPLE_RADIUS {
                    return Err(ProxyError::Request(
                        "Game Asset spatial board model lacks enough local board samples".into(),
                    ));
                }
                radius = (radius + SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS)
                    .min(SPATIAL_BOARD_MAX_SAMPLE_RADIUS);
            };
            nodes.push(color);
        }
    }
    let field = interpolate_spatial_board_field(&nodes, width, height);
    let maximum_perimeter_chroma_residual_squared = perimeter
        .iter()
        .filter(|index| rgba[**index * 4 + 3] >= ALPHA_THRESHOLD)
        .map(|index| spatial_chroma_distance_squared(rgba, *index, field[*index]))
        .max()
        .unwrap_or(0);
    let distance_threshold_squared = maximum_perimeter_chroma_residual_squared
        .saturating_add(64)
        .max(64);
    if distance_threshold_squared > 4096 {
        return Err(ProxyError::Request(
            "Game Asset spatial board field cannot safely explain its verified perimeter".into(),
        ));
    }
    let mut node_bytes = Vec::with_capacity(nodes.len() * 3);
    let mut summary_channels = [
        Vec::with_capacity(nodes.len()),
        Vec::with_capacity(nodes.len()),
        Vec::with_capacity(nodes.len()),
    ];
    for node in &nodes {
        node_bytes.extend_from_slice(node);
        for channel in 0..3 {
            summary_channels[channel].push(node[channel]);
        }
    }
    for channel in &mut summary_channels {
        channel.sort_unstable();
    }
    let middle = nodes.len() / 2;
    let summary_color = [
        summary_channels[0][middle],
        summary_channels[1][middle],
        summary_channels[2][middle],
    ];
    Ok(SpatialBoardField {
        colors: field,
        summary_color,
        distance_threshold_squared,
        evidence: SpatialBoardModelEvidence {
            implementation: V9_SPATIAL_BOARD_MODEL_IMPLEMENTATION.into(),
            columns: SPATIAL_BOARD_GRID_COLUMNS as u32,
            rows: SPATIAL_BOARD_GRID_ROWS as u32,
            initial_sample_radius: SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS as u32,
            maximum_sample_radius: SPATIAL_BOARD_MAX_SAMPLE_RADIUS as u32,
            minimum_samples_per_node: SPATIAL_BOARD_MIN_SAMPLES as u32,
            node_count: nodes.len() as u32,
            node_bytes_sha256: sha256(&node_bytes),
            perimeter_sample_count: opaque_perimeter as u32,
            maximum_perimeter_chroma_residual_squared,
            edge_seed_strip_width: None,
            edge_seed_pixel_count: None,
            interpolated_node_count: None,
        },
    })
}

fn interpolate_occluded_spatial_board_nodes(
    sampled_nodes: &[Option<[u8; 3]>],
) -> Result<(Vec<[u8; 3]>, u32), ProxyError> {
    let observed = sampled_nodes
        .iter()
        .enumerate()
        .filter_map(|(index, color)| color.map(|color| (index, color)))
        .collect::<Vec<_>>();
    if observed.is_empty() {
        return Err(ProxyError::Request(
            "Game Asset spatial board model has no observed board nodes".into(),
        ));
    }
    let mut interpolated_node_count = 0_u32;
    let mut nodes = Vec::with_capacity(sampled_nodes.len());
    for (index, sampled) in sampled_nodes.iter().enumerate() {
        if let Some(color) = sampled {
            nodes.push(*color);
            continue;
        }
        interpolated_node_count = interpolated_node_count.saturating_add(1);
        let row = index / SPATIAL_BOARD_GRID_COLUMNS;
        let column = index % SPATIAL_BOARD_GRID_COLUMNS;
        let mut nearest = observed
            .iter()
            .map(|(observed_index, color)| {
                let observed_row = observed_index / SPATIAL_BOARD_GRID_COLUMNS;
                let observed_column = observed_index % SPATIAL_BOARD_GRID_COLUMNS;
                let row_distance = row.abs_diff(observed_row);
                let column_distance = column.abs_diff(observed_column);
                (
                    row_distance * row_distance + column_distance * column_distance,
                    *observed_index,
                    *color,
                )
            })
            .collect::<Vec<_>>();
        nearest.sort_unstable_by_key(|(distance, observed_index, _)| (*distance, *observed_index));
        let mut weighted = [0_u64; 3];
        let mut total_weight = 0_u64;
        for (distance, _, color) in nearest.into_iter().take(8) {
            let weight = 1_000_000_u64 / (distance.max(1) as u64);
            total_weight = total_weight.saturating_add(weight);
            for channel in 0..3 {
                weighted[channel] =
                    weighted[channel].saturating_add(u64::from(color[channel]) * weight);
            }
        }
        if total_weight == 0 {
            return Err(ProxyError::Request(
                "Game Asset spatial board interpolation has no deterministic support".into(),
            ));
        }
        nodes.push([
            ((weighted[0] + total_weight / 2) / total_weight) as u8,
            ((weighted[1] + total_weight / 2) / total_weight) as u8,
            ((weighted[2] + total_weight / 2) / total_weight) as u8,
        ]);
    }
    Ok((nodes, interpolated_node_count))
}

fn estimate_occlusion_tolerant_spatial_magenta_board_field(
    rgba: &[u8],
    width: usize,
    height: usize,
) -> Result<SpatialBoardField, ProxyError> {
    if width < SPATIAL_BOARD_GRID_COLUMNS
        || height < SPATIAL_BOARD_GRID_ROWS
        || rgba.len() != width.saturating_mul(height).saturating_mul(4)
    {
        return Err(ProxyError::Request(
            "Game Asset spatial board field dimensions are invalid".into(),
        ));
    }
    let perimeter = border_indices(width, height);
    let opaque_perimeter = perimeter
        .iter()
        .filter(|index| rgba[**index * 4 + 3] >= ALPHA_THRESHOLD)
        .count();
    if opaque_perimeter == 0
        || perimeter.iter().any(|index| {
            rgba[*index * 4 + 3] >= ALPHA_THRESHOLD
                && !is_spatial_magenta_board_candidate(rgba, *index)
        })
    {
        return Err(ProxyError::Request(
            "Game Asset spatial board model requires a closed high-chroma magenta perimeter".into(),
        ));
    }

    let mut sampled_nodes =
        Vec::with_capacity(SPATIAL_BOARD_GRID_COLUMNS * SPATIAL_BOARD_GRID_ROWS);
    for row in 0..SPATIAL_BOARD_GRID_ROWS {
        let y = row * (height - 1) / (SPATIAL_BOARD_GRID_ROWS - 1);
        for column in 0..SPATIAL_BOARD_GRID_COLUMNS {
            let x = column * (width - 1) / (SPATIAL_BOARD_GRID_COLUMNS - 1);
            let perimeter_only = row == 0
                || row + 1 == SPATIAL_BOARD_GRID_ROWS
                || column == 0
                || column + 1 == SPATIAL_BOARD_GRID_COLUMNS;
            let mut radius = SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS;
            let color = loop {
                if let Some(color) =
                    median_spatial_board_sample(rgba, width, height, x, y, radius, perimeter_only)
                {
                    break Some(color);
                }
                if radius >= SPATIAL_BOARD_MAX_SAMPLE_RADIUS {
                    if perimeter_only {
                        return Err(ProxyError::Request(
                            "Game Asset spatial board perimeter lacks enough local samples".into(),
                        ));
                    }
                    break None;
                }
                radius = (radius + SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS)
                    .min(SPATIAL_BOARD_MAX_SAMPLE_RADIUS);
            };
            sampled_nodes.push(color);
        }
    }
    let (nodes, interpolated_node_count) =
        interpolate_occluded_spatial_board_nodes(&sampled_nodes)?;
    let field = interpolate_spatial_board_field(&nodes, width, height);
    let maximum_perimeter_chroma_residual_squared = perimeter
        .iter()
        .filter(|index| rgba[**index * 4 + 3] >= ALPHA_THRESHOLD)
        .map(|index| spatial_chroma_distance_squared(rgba, *index, field[*index]))
        .max()
        .unwrap_or(0);
    let distance_threshold_squared = maximum_perimeter_chroma_residual_squared
        .saturating_add(64)
        .max(64);
    if distance_threshold_squared > 4096 {
        return Err(ProxyError::Request(
            "Game Asset spatial board field cannot safely explain its verified perimeter".into(),
        ));
    }
    let mut node_bytes = Vec::with_capacity(nodes.len() * 3);
    let mut summary_channels = [
        Vec::with_capacity(nodes.len()),
        Vec::with_capacity(nodes.len()),
        Vec::with_capacity(nodes.len()),
    ];
    for node in &nodes {
        node_bytes.extend_from_slice(node);
        for channel in 0..3 {
            summary_channels[channel].push(node[channel]);
        }
    }
    for channel in &mut summary_channels {
        channel.sort_unstable();
    }
    let middle = nodes.len() / 2;
    let summary_color = [
        summary_channels[0][middle],
        summary_channels[1][middle],
        summary_channels[2][middle],
    ];
    Ok(SpatialBoardField {
        colors: field,
        summary_color,
        distance_threshold_squared,
        evidence: SpatialBoardModelEvidence {
            implementation: OCCLUSION_TOLERANT_SPATIAL_BOARD_MODEL_IMPLEMENTATION.into(),
            columns: SPATIAL_BOARD_GRID_COLUMNS as u32,
            rows: SPATIAL_BOARD_GRID_ROWS as u32,
            initial_sample_radius: SPATIAL_BOARD_INITIAL_SAMPLE_RADIUS as u32,
            maximum_sample_radius: SPATIAL_BOARD_MAX_SAMPLE_RADIUS as u32,
            minimum_samples_per_node: SPATIAL_BOARD_MIN_SAMPLES as u32,
            node_count: nodes.len() as u32,
            node_bytes_sha256: sha256(&node_bytes),
            perimeter_sample_count: opaque_perimeter as u32,
            maximum_perimeter_chroma_residual_squared,
            edge_seed_strip_width: None,
            edge_seed_pixel_count: None,
            interpolated_node_count: Some(interpolated_node_count),
        },
    })
}

fn matte_spatial_magenta_board_v9(
    source_bytes: &[u8],
) -> Result<(BoardMatte, SpatialBoardModelEvidence), ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let rgba = image.to_rgba8().into_raw();
    let field = estimate_spatial_magenta_board_field(&rgba, width as usize, height as usize)?;
    let output = reconstruct_spatial_chroma_foreground(
        &rgba,
        width as usize,
        height as usize,
        &field.colors,
        f64::from(field.distance_threshold_squared),
    )
    .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request(
            "Game Asset spatial foreground pixels could not be reconstructed".into(),
        )
    })?;
    Ok((
        BoardMatte {
            image,
            background_color: Some(field.summary_color),
            color_distance_threshold: Some(f64::from(field.distance_threshold_squared)),
            route: V9_SPATIAL_BOARD_CUTOUT_ROUTE,
        },
        field.evidence,
    ))
}

fn seed_spatial_board_edge_strip(
    rgba: &mut [u8],
    width: usize,
    height: usize,
    background_field: &[[u8; 3]],
    strip_width: usize,
) -> Result<u32, ProxyError> {
    let pixel_count = width.checked_mul(height).ok_or_else(|| {
        ProxyError::Request("Game Asset spatial edge-seed dimensions overflowed".into())
    })?;
    if strip_width == 0
        || width < strip_width * 2
        || height < strip_width * 2
        || rgba.len() != pixel_count.saturating_mul(4)
        || background_field.len() != pixel_count
    {
        return Err(ProxyError::Request(
            "Game Asset spatial edge-seed dimensions are invalid".into(),
        ));
    }
    let mut seeded = 0_u32;
    for y in 0..height {
        for x in 0..width {
            if x >= strip_width
                && x + strip_width < width
                && y >= strip_width
                && y + strip_width < height
            {
                continue;
            }
            let index = y * width + x;
            if !is_spatial_magenta_board_candidate(rgba, index) {
                continue;
            }
            let offset = index * 4;
            rgba[offset..offset + 3].copy_from_slice(&background_field[index]);
            seeded = seeded.saturating_add(1);
        }
    }
    if seeded == 0 {
        return Err(ProxyError::Request(
            "Game Asset spatial edge-seed found no verified board pixels".into(),
        ));
    }
    Ok(seeded)
}

fn matte_spatial_magenta_board_v10(
    source_bytes: &[u8],
) -> Result<(BoardMatte, SpatialBoardModelEvidence), ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let mut rgba = image.to_rgba8().into_raw();
    let mut field = estimate_spatial_magenta_board_field(&rgba, width as usize, height as usize)?;
    let edge_seed_pixel_count = seed_spatial_board_edge_strip(
        &mut rgba,
        width as usize,
        height as usize,
        &field.colors,
        V10_SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH,
    )?;
    let output = reconstruct_spatial_chroma_foreground(
        &rgba,
        width as usize,
        height as usize,
        &field.colors,
        f64::from(field.distance_threshold_squared),
    )
    .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request(
            "Game Asset spatial foreground pixels could not be reconstructed".into(),
        )
    })?;
    field.evidence.implementation = V10_SPATIAL_BOARD_MODEL_IMPLEMENTATION.into();
    field.evidence.edge_seed_strip_width = Some(V10_SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH as u32);
    field.evidence.edge_seed_pixel_count = Some(edge_seed_pixel_count);
    Ok((
        BoardMatte {
            image,
            background_color: Some(field.summary_color),
            color_distance_threshold: Some(f64::from(field.distance_threshold_squared)),
            route: V10_SPATIAL_BOARD_CUTOUT_ROUTE,
        },
        field.evidence,
    ))
}

fn matte_spatial_magenta_board_v11(
    source_bytes: &[u8],
) -> Result<(BoardMatte, SpatialBoardModelEvidence), ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let mut rgba = image.to_rgba8().into_raw();
    let mut field = estimate_spatial_magenta_board_field(&rgba, width as usize, height as usize)?;
    let edge_seed_pixel_count = seed_spatial_board_edge_strip(
        &mut rgba,
        width as usize,
        height as usize,
        &field.colors,
        SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH,
    )?;
    let output = reconstruct_spatial_chroma_foreground(
        &rgba,
        width as usize,
        height as usize,
        &field.colors,
        f64::from(field.distance_threshold_squared),
    )
    .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request(
            "Game Asset spatial foreground pixels could not be reconstructed".into(),
        )
    })?;
    field.evidence.implementation = SPATIAL_BOARD_MODEL_IMPLEMENTATION.into();
    field.evidence.edge_seed_strip_width = Some(SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH as u32);
    field.evidence.edge_seed_pixel_count = Some(edge_seed_pixel_count);
    Ok((
        BoardMatte {
            image,
            background_color: Some(field.summary_color),
            color_distance_threshold: Some(f64::from(field.distance_threshold_squared)),
            route: SPATIAL_BOARD_CUTOUT_ROUTE,
        },
        field.evidence,
    ))
}

fn matte_occlusion_tolerant_spatial_magenta_board_v12(
    source_bytes: &[u8],
) -> Result<(BoardMatte, SpatialBoardModelEvidence), ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let mut rgba = image.to_rgba8().into_raw();
    let mut field = estimate_occlusion_tolerant_spatial_magenta_board_field(
        &rgba,
        width as usize,
        height as usize,
    )?;
    let edge_seed_pixel_count = seed_spatial_board_edge_strip(
        &mut rgba,
        width as usize,
        height as usize,
        &field.colors,
        SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH,
    )?;
    let output = reconstruct_spatial_chroma_foreground(
        &rgba,
        width as usize,
        height as usize,
        &field.colors,
        f64::from(field.distance_threshold_squared),
    )
    .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request(
            "Game Asset spatial foreground pixels could not be reconstructed".into(),
        )
    })?;
    field.evidence.edge_seed_strip_width = Some(SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH as u32);
    field.evidence.edge_seed_pixel_count = Some(edge_seed_pixel_count);
    Ok((
        BoardMatte {
            image,
            background_color: Some(field.summary_color),
            color_distance_threshold: Some(f64::from(field.distance_threshold_squared)),
            route: OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_ROUTE,
        },
        field.evidence,
    ))
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

fn estimate_uniform_border_color(
    rgba: &[u8],
    width: usize,
    height: usize,
) -> Result<Option<[u8; 3]>, ProxyError> {
    let border = border_indices(width, height);
    let transparent = border
        .iter()
        .filter(|index| rgba[**index * 4 + 3] < ALPHA_THRESHOLD)
        .count();
    if transparent * 2 >= border.len() {
        return Ok(None);
    }
    let mut red = Vec::with_capacity(border.len());
    let mut green = Vec::with_capacity(border.len());
    let mut blue = Vec::with_capacity(border.len());
    for index in &border {
        let offset = index * 4;
        if rgba[offset + 3] >= ALPHA_THRESHOLD {
            red.push(rgba[offset]);
            green.push(rgba[offset + 1]);
            blue.push(rgba[offset + 2]);
        }
    }
    if red.is_empty() {
        return Ok(None);
    }
    red.sort_unstable();
    green.sort_unstable();
    blue.sort_unstable();
    let middle = red.len() / 2;
    let background = [red[middle], green[middle], blue[middle]];
    let chroma = background.iter().max().unwrap_or(&0) - background.iter().min().unwrap_or(&0);
    if chroma < 128 {
        return Err(ProxyError::Request(
            "Game Asset deterministic cutout requires a high-chroma generation board".into(),
        ));
    }
    let matching = border
        .iter()
        .filter(|index| {
            rgba[**index * 4 + 3] < ALPHA_THRESHOLD
                || rgb_distance(rgba, **index, &background) <= CUTOUT_BACKGROUND_DISTANCE
        })
        .count();
    if matching as f64 / (border.len() as f64) < CUTOUT_BORDER_CONFIDENCE {
        return Err(ProxyError::Request(
            "Game Asset generated board is not uniform enough for deterministic cutout".into(),
        ));
    }
    Ok(Some(background))
}

fn estimate_relaxed_chroma_border_color(
    rgba: &[u8],
    width: usize,
    height: usize,
) -> Result<Option<[u8; 3]>, ProxyError> {
    let border = border_indices(width, height);
    let mut channels = [Vec::new(), Vec::new(), Vec::new()];
    for index in border {
        let offset = index * 4;
        if rgba[offset + 3] >= ALPHA_THRESHOLD {
            for channel in 0..3 {
                channels[channel].push(rgba[offset + channel]);
            }
        }
    }
    if channels[0].is_empty() {
        return Ok(None);
    }
    for channel in &mut channels {
        channel.sort_unstable();
    }
    let middle = channels[0].len() / 2;
    let background = [
        channels[0][middle],
        channels[1][middle],
        channels[2][middle],
    ];
    let chroma = background.iter().max().unwrap_or(&0) - background.iter().min().unwrap_or(&0);
    if chroma < 128 {
        return Err(ProxyError::Request(
            "Game Asset deterministic cutout requires a high-chroma generation board".into(),
        ));
    }
    Ok(Some(background))
}

fn action_sheet_repair_composition_lock_id() -> String {
    format!(
        "game-asset-action-sheet-repair-composition:sha256:{}",
        sha256(ACTION_SHEET_REPAIR_COMPOSITION_IMPLEMENTATION.as_bytes())
    )
}

fn action_sheet_repair_composition_reference(cell_bytes: &[u8]) -> Result<Vec<u8>, ProxyError> {
    let source = decode_bounded_image(cell_bytes)?.to_rgba8();
    let (width, height) = source.dimensions();
    let inset_x = width.saturating_mul(ACTION_SHEET_REPAIR_INSET_NUMERATOR)
        / ACTION_SHEET_REPAIR_INSET_DENOMINATOR;
    let inset_y = height.saturating_mul(ACTION_SHEET_REPAIR_INSET_NUMERATOR)
        / ACTION_SHEET_REPAIR_INSET_DENOMINATOR;
    let inner_width = width.saturating_sub(inset_x.saturating_mul(2));
    let inner_height = height.saturating_sub(inset_y.saturating_mul(2));
    if inset_x == 0 || inset_y == 0 || inner_width == 0 || inner_height == 0 {
        return Err(ProxyError::Request(
            "Game Asset repair cell is too small for inset composition conditioning".into(),
        ));
    }
    let background =
        estimate_relaxed_chroma_border_color(source.as_raw(), width as usize, height as usize)?
            .unwrap_or([255, 0, 255]);
    let resized_size = contain_subject_size(
        &AlphaBounds {
            x: 0,
            y: 0,
            width,
            height,
        },
        &PixelSize {
            width: inner_width,
            height: inner_height,
        },
    );
    let resized = image::imageops::resize(
        &source,
        resized_size.width,
        resized_size.height,
        FilterType::Lanczos3,
    );
    let offset_x = (width - resized.width()) / 2;
    let offset_y = (height - resized.height()) / 2;
    let mut canvas = image::RgbaImage::from_pixel(
        width,
        height,
        image::Rgba([background[0], background[1], background[2], 255]),
    );
    for (x, y, pixel) in resized.enumerate_pixels() {
        let alpha = u32::from(pixel[3]);
        if alpha == 0 {
            continue;
        }
        let blend = |foreground: u8, board: u8| {
            ((u32::from(foreground) * alpha + u32::from(board) * (255 - alpha) + 127) / 255) as u8
        };
        canvas.put_pixel(
            offset_x + x,
            offset_y + y,
            image::Rgba([
                blend(pixel[0], background[0]),
                blend(pixel[1], background[1]),
                blend(pixel[2], background[2]),
                255,
            ]),
        );
    }
    encode_cutout_png(&canvas)
}

fn is_adaptive_background_pixel(rgba: &[u8], index: usize, background: &[u8; 3]) -> bool {
    rgba[index * 4 + 3] < ALPHA_THRESHOLD
        || rgb_distance(rgba, index, background) <= CUTOUT_BACKGROUND_DISTANCE
}

fn unmix_background(channel: u8, background: u8, alpha: u8) -> u8 {
    if alpha == 0 {
        return 0;
    }
    let recovered = (f64::from(channel) * 255.0
        - f64::from(background) * (255.0 - f64::from(alpha)))
        / f64::from(alpha);
    recovered.round().clamp(0.0, 255.0) as u8
}

fn soften_adaptive_edges(
    rgba: &mut [u8],
    background: &[bool],
    background_color: &[u8; 3],
    width: usize,
    height: usize,
) {
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
            let distance = rgb_distance(rgba, index, background_color);
            let t = ((distance - CUTOUT_EDGE_DISTANCE_LOW)
                / (CUTOUT_EDGE_DISTANCE_HIGH - CUTOUT_EDGE_DISTANCE_LOW))
                .clamp(0.0, 1.0);
            let smooth = t * t * (3.0 - 2.0 * t);
            let offset = index * 4;
            let alpha = rgba[offset + 3].min((smooth * 255.0).round() as u8);
            rgba[offset + 3] = alpha;
            if alpha < 250 {
                rgba[offset] = unmix_background(rgba[offset], background_color[0], alpha);
                rgba[offset + 1] = unmix_background(rgba[offset + 1], background_color[1], alpha);
                rgba[offset + 2] = unmix_background(rgba[offset + 2], background_color[2], alpha);
            }
        }
    }
}

fn matte_adaptive_board(source_bytes: &[u8]) -> Result<BoardMatte, ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let mut rgba = image.to_rgba8().into_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let Some(background_color) = estimate_uniform_border_color(&rgba, width_usize, height_usize)?
    else {
        let image = image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
            ProxyError::Request("Game Asset alpha pixels could not be reconstructed".into())
        })?;
        return Ok(BoardMatte {
            image,
            background_color: None,
            color_distance_threshold: None,
            route: "source-alpha-preserved",
        });
    };
    let size = width_usize.checked_mul(height_usize).ok_or_else(|| {
        ProxyError::Request("Game Asset output pixel accounting overflowed".into())
    })?;
    let background = (0..size)
        .map(|index| is_adaptive_background_pixel(&rgba, index, &background_color))
        .collect::<Vec<_>>();
    for (index, is_background) in background.iter().enumerate() {
        if *is_background {
            rgba[index * 4..index * 4 + 4].copy_from_slice(&[0, 0, 0, 0]);
        }
    }
    soften_adaptive_edges(
        &mut rgba,
        &background,
        &background_color,
        width_usize,
        height_usize,
    );
    let image = image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
        ProxyError::Request("Game Asset cutout pixels could not be reconstructed".into())
    })?;
    Ok(BoardMatte {
        image,
        background_color: Some(background_color),
        color_distance_threshold: Some(CUTOUT_BACKGROUND_DISTANCE),
        route: ADAPTIVE_BOARD_CUTOUT_ROUTE,
    })
}

fn matte_chroma_trimap_ml_v4(source_bytes: &[u8]) -> Result<BoardMatte, ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let rgba = image.to_rgba8().into_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let Some(background_color) = estimate_uniform_border_color(&rgba, width_usize, height_usize)?
    else {
        let image = image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
            ProxyError::Request("Game Asset alpha pixels could not be reconstructed".into())
        })?;
        return Ok(BoardMatte {
            image,
            background_color: None,
            color_distance_threshold: None,
            route: "source-alpha-preserved",
        });
    };
    let output = reconstruct_chroma_foreground(&rgba, width_usize, height_usize, background_color)
        .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request("Game Asset foreground pixels could not be reconstructed".into())
    })?;
    Ok(BoardMatte {
        image,
        background_color: Some(background_color),
        color_distance_threshold: Some(CHROMA_BACKGROUND_DISTANCE_SQUARED),
        route: CHROMA_ML_CUTOUT_ROUTE,
    })
}

fn prune_unsupported_horizontal_board_strokes(
    rgba: &mut [u8],
    width: usize,
    height: usize,
    background_color: &[u8; 3],
) {
    if width < 16 || height < 16 || rgba.len() != width.saturating_mul(height).saturating_mul(4) {
        return;
    }
    let differs_from_board = |pixels: &[u8], x: usize, y: usize| {
        let index = y * width + x;
        pixels[index * 4 + 3] >= ALPHA_THRESHOLD
            && rgb_distance(pixels, index, background_color) > 64.0
    };
    let bottom_band_start = height.saturating_mul(4) / 5;
    let minimum_run = 16_usize.max(width / 3);
    let mut clear = Vec::new();
    for y in bottom_band_start..height {
        let mut x = 0;
        while x < width {
            while x < width && !differs_from_board(rgba, x, y) {
                x += 1;
            }
            let start = x;
            while x < width && differs_from_board(rgba, x, y) {
                x += 1;
            }
            let end = x;
            if end.saturating_sub(start) < minimum_run {
                continue;
            }
            for pixel_x in start..end {
                let support_count = (4..=12)
                    .filter(|distance| y >= *distance)
                    .filter(|distance| {
                        let above_y = y - *distance;
                        let left = pixel_x.saturating_sub(2);
                        let right = (pixel_x + 2).min(width - 1);
                        (left..=right).any(|above_x| differs_from_board(rgba, above_x, above_y))
                    })
                    .count();
                if support_count < 3 {
                    clear.push((pixel_x, y));
                }
            }
        }
    }
    for (x, y) in clear {
        let offset = (y * width + x) * 4;
        rgba[offset..offset + 4].copy_from_slice(&[
            background_color[0],
            background_color[1],
            background_color[2],
            255,
        ]);
    }
}

fn matte_adaptive_chroma_trimap_ml(
    source_bytes: &[u8],
    prune_board_floor_before_reconstruction: bool,
) -> Result<BoardMatte, ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let mut rgba = image.to_rgba8().into_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let background_color = match estimate_uniform_border_color(&rgba, width_usize, height_usize) {
        Ok(color) => color,
        Err(_) => estimate_relaxed_chroma_border_color(&rgba, width_usize, height_usize)?,
    };
    let Some(background_color) = background_color else {
        let image = image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
            ProxyError::Request("Game Asset alpha pixels could not be reconstructed".into())
        })?;
        return Ok(BoardMatte {
            image,
            background_color: None,
            color_distance_threshold: None,
            route: "source-alpha-preserved",
        });
    };
    if prune_board_floor_before_reconstruction {
        prune_unsupported_horizontal_board_strokes(
            &mut rgba,
            width_usize,
            height_usize,
            &background_color,
        );
    }
    let (output, background_distance_squared) =
        reconstruct_adaptive_chroma_foreground(&rgba, width_usize, height_usize, background_color)
            .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request("Game Asset foreground pixels could not be reconstructed".into())
    })?;
    Ok(BoardMatte {
        image,
        background_color: Some(background_color),
        color_distance_threshold: Some(background_distance_squared),
        route: CUTOUT_ROUTE,
    })
}

fn matte_adaptive_chroma_trimap_ml_v5(source_bytes: &[u8]) -> Result<BoardMatte, ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    let rgba = image.to_rgba8().into_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let Some(background_color) = estimate_uniform_border_color(&rgba, width_usize, height_usize)?
    else {
        let image = image::RgbaImage::from_raw(width, height, rgba).ok_or_else(|| {
            ProxyError::Request("Game Asset alpha pixels could not be reconstructed".into())
        })?;
        return Ok(BoardMatte {
            image,
            background_color: None,
            color_distance_threshold: None,
            route: "source-alpha-preserved",
        });
    };
    let (output, background_distance_squared) =
        reconstruct_adaptive_chroma_foreground(&rgba, width_usize, height_usize, background_color)
            .map_err(|message| ProxyError::Request(format!("Game Asset {message}")))?;
    let image = image::RgbaImage::from_raw(width, height, output).ok_or_else(|| {
        ProxyError::Request("Game Asset foreground pixels could not be reconstructed".into())
    })?;
    Ok(BoardMatte {
        image,
        background_color: Some(background_color),
        color_distance_threshold: Some(background_distance_squared),
        route: CUTOUT_ROUTE,
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

fn anchor_for_bounds(bounds: &AlphaBounds, anchor_policy: &str) -> Result<AnchorPoint, ProxyError> {
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

pub(crate) fn encode_cutout_png(image: &image::RgbaImage) -> Result<Vec<u8>, ProxyError> {
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
    let image = matte_white_board_v2(source_bytes)?;
    let output_bytes = encode_cutout_png(&image)?;
    let output_artifact_sha256 = sha256(&output_bytes);
    let output_artifact_id = format!("artifact:sha256:{output_artifact_sha256}");
    let evidence = RasterProcessingEvidence {
        protocol: "cutout.game-asset-raster-processing.v1".into(),
        implementation: LEGACY_CUTOUT_IMPLEMENTATION.into(),
        white_threshold: Some(CUTOUT_WHITE_THRESHOLD),
        background_color: None,
        color_distance_threshold: None,
        matting_route: None,
        spatial_board_model: None,
        background_alpha_max: ALPHA_THRESHOLD,
        source_artifact_id: source_artifact_id.into(),
        source_artifact_sha256: source_artifact_sha256.into(),
        output_artifact_id,
        output_artifact_sha256,
        output_byte_length: output_bytes.len(),
        source_alpha_bounds: None,
        source_size: None,
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

#[allow(clippy::too_many_arguments)]
fn normalize_cutout(
    matted: image::RgbaImage,
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
    implementation: &str,
    white_threshold: Option<u8>,
    background_color: Option<[u8; 3]>,
    color_distance_threshold: Option<f64>,
    matting_route: Option<&str>,
    scale_policy: &str,
    preserve_identity_resize: bool,
    allow_upscale: bool,
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
    let source_size = PixelSize {
        width: matted.width(),
        height: matted.height(),
    };
    let source_alpha_bounds = alpha_bounds_from_rgba(&matted)?;
    let cropped = image::imageops::crop_imm(
        &matted,
        source_alpha_bounds.x,
        source_alpha_bounds.y,
        source_alpha_bounds.width,
        source_alpha_bounds.height,
    )
    .to_image();
    let contained_size = if !allow_upscale
        && source_alpha_bounds.width <= alpha_target.width
        && source_alpha_bounds.height <= alpha_target.height
    {
        PixelSize {
            width: source_alpha_bounds.width,
            height: source_alpha_bounds.height,
        }
    } else {
        contain_subject_size(&source_alpha_bounds, alpha_target)
    };
    let resized = if preserve_identity_resize
        && cropped.width() == contained_size.width
        && cropped.height() == contained_size.height
    {
        cropped
    } else {
        image::imageops::resize(
            &cropped,
            contained_size.width,
            contained_size.height,
            FilterType::Lanczos3,
        )
    };
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
        implementation: implementation.into(),
        white_threshold,
        background_color,
        color_distance_threshold,
        matting_route: matting_route.map(str::to_string),
        spatial_board_model: None,
        background_alpha_max: ALPHA_THRESHOLD,
        source_artifact_id: source_artifact_id.into(),
        source_artifact_sha256: source_artifact_sha256.into(),
        output_artifact_id,
        output_artifact_sha256,
        output_byte_length: output_bytes.len(),
        source_alpha_bounds: Some(source_alpha_bounds),
        source_size: Some(source_size),
        frame_size: Some(frame_size.clone()),
        alpha_target: Some(alpha_target.clone()),
        expected_anchor: Some(expected_anchor.clone()),
        anchor_policy: Some(anchor_policy.into()),
        scale_policy: Some(scale_policy.into()),
        resized_subject_size: Some(resized_subject_size),
        placement: Some(placement),
        output_alpha_bounds: Some(output_alpha_bounds),
    };
    Ok((output_bytes, evidence))
}

fn prune_detached_horizontal_components(image: &mut image::RgbaImage) {
    let (width, height) = image.dimensions();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let mut visited = vec![false; width_usize.saturating_mul(height_usize)];
    for y in 0..height {
        for x in 0..width {
            let start = y as usize * width_usize + x as usize;
            if visited[start] || image.get_pixel(x, y).0[3] <= ALPHA_THRESHOLD {
                continue;
            }
            visited[start] = true;
            let mut stack = vec![(x, y)];
            let mut pixels = Vec::new();
            let (mut min_x, mut min_y, mut max_x, mut max_y) = (x, y, x, y);
            while let Some((current_x, current_y)) = stack.pop() {
                pixels.push((current_x, current_y));
                min_x = min_x.min(current_x);
                min_y = min_y.min(current_y);
                max_x = max_x.max(current_x);
                max_y = max_y.max(current_y);
                for offset_y in -1_i32..=1 {
                    for offset_x in -1_i32..=1 {
                        if offset_x == 0 && offset_y == 0 {
                            continue;
                        }
                        let neighbor_x = current_x as i32 + offset_x;
                        let neighbor_y = current_y as i32 + offset_y;
                        if neighbor_x < 0
                            || neighbor_y < 0
                            || neighbor_x >= width as i32
                            || neighbor_y >= height as i32
                        {
                            continue;
                        }
                        let neighbor_x = neighbor_x as u32;
                        let neighbor_y = neighbor_y as u32;
                        let neighbor_index =
                            neighbor_y as usize * width_usize + neighbor_x as usize;
                        if !visited[neighbor_index]
                            && image.get_pixel(neighbor_x, neighbor_y).0[3] > ALPHA_THRESHOLD
                        {
                            visited[neighbor_index] = true;
                            stack.push((neighbor_x, neighbor_y));
                        }
                    }
                }
            }
            let component_width = max_x - min_x + 1;
            let component_height = max_y - min_y + 1;
            let near_bottom = max_y + 1 >= height.saturating_mul(3) / 4;
            if near_bottom
                && component_width >= 16
                && component_height <= 6
                && component_width >= component_height.saturating_mul(4)
            {
                for (pixel_x, pixel_y) in pixels {
                    image.put_pixel(pixel_x, pixel_y, image::Rgba([0, 0, 0, 0]));
                }
            }
        }
    }
}

fn prune_unsupported_horizontal_strokes(image: &mut image::RgbaImage) {
    let (width, height) = image.dimensions();
    let bottom_band_start = height.saturating_mul(3) / 4;
    let mut clear = Vec::new();
    for y in bottom_band_start..height {
        let mut x = 0;
        while x < width {
            while x < width && image.get_pixel(x, y).0[3] <= ALPHA_THRESHOLD {
                x += 1;
            }
            let start = x;
            while x < width && image.get_pixel(x, y).0[3] > ALPHA_THRESHOLD {
                x += 1;
            }
            let end = x;
            if end.saturating_sub(start) < 16 {
                continue;
            }
            for pixel_x in start..end {
                let supported_above = (1..=8).any(|distance| {
                    let above_y = y.saturating_sub(distance);
                    let left = pixel_x.saturating_sub(2);
                    let right = (pixel_x + 2).min(width.saturating_sub(1));
                    (left..=right)
                        .any(|above_x| image.get_pixel(above_x, above_y).0[3] > ALPHA_THRESHOLD)
                });
                if !supported_above {
                    clear.push((pixel_x, y));
                }
            }
        }
    }
    for (x, y) in clear {
        image.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
    }
}

fn deterministic_cutout_v2(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    normalize_cutout(
        matte_white_board_v2(source_bytes)?,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        WHITE_BOARD_CUTOUT_IMPLEMENTATION,
        Some(CUTOUT_WHITE_THRESHOLD),
        None,
        None,
        None,
        CUTOUT_SCALE_POLICY,
        false,
        true,
    )
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
    let mut matte = matte_adaptive_chroma_trimap_ml(source_bytes, true)?;
    prune_detached_horizontal_components(&mut matte.image);
    prune_unsupported_horizontal_strokes(&mut matte.image);
    normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        CUTOUT_SCALE_POLICY,
        false,
        true,
    )
}

fn deterministic_spatial_board_cutout_v9(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let (mut matte, spatial_board_model) = matte_spatial_magenta_board_v9(source_bytes)?;
    prune_detached_horizontal_components(&mut matte.image);
    prune_unsupported_horizontal_strokes(&mut matte.image);
    let (bytes, mut evidence) = normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        V9_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        SPATIAL_BOARD_CUTOUT_SCALE_POLICY,
        false,
        false,
    )?;
    evidence.spatial_board_model = Some(spatial_board_model);
    Ok((bytes, evidence))
}

fn deterministic_spatial_board_cutout_v10(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let (mut matte, spatial_board_model) = matte_spatial_magenta_board_v10(source_bytes)?;
    prune_detached_horizontal_components(&mut matte.image);
    prune_unsupported_horizontal_strokes(&mut matte.image);
    let (bytes, mut evidence) = normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        V10_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        SPATIAL_BOARD_CUTOUT_SCALE_POLICY,
        false,
        false,
    )?;
    evidence.spatial_board_model = Some(spatial_board_model);
    Ok((bytes, evidence))
}

fn deterministic_spatial_board_cutout_v11(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let (mut matte, spatial_board_model) = matte_spatial_magenta_board_v11(source_bytes)?;
    prune_detached_horizontal_components(&mut matte.image);
    prune_unsupported_horizontal_strokes(&mut matte.image);
    let (bytes, mut evidence) = normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        SPATIAL_BOARD_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        SPATIAL_BOARD_CUTOUT_SCALE_POLICY,
        false,
        false,
    )?;
    evidence.spatial_board_model = Some(spatial_board_model);
    Ok((bytes, evidence))
}

fn deterministic_occlusion_tolerant_spatial_board_cutout_v12(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let (mut matte, spatial_board_model) =
        matte_occlusion_tolerant_spatial_magenta_board_v12(source_bytes)?;
    prune_detached_horizontal_components(&mut matte.image);
    prune_unsupported_horizontal_strokes(&mut matte.image);
    let (bytes, mut evidence) = normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        SPATIAL_BOARD_CUTOUT_SCALE_POLICY,
        false,
        false,
    )?;
    evidence.spatial_board_model = Some(spatial_board_model);
    Ok((bytes, evidence))
}

fn normalize_verified_alpha_grounded_v8(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    if sha256(source_bytes) != source_artifact_sha256
        || source_artifact_id != format!("artifact:sha256:{source_artifact_sha256}")
    {
        return Err(ProxyError::Request(
            "Game Asset grounded normalization source identity drifted".into(),
        ));
    }
    let source = decode_bounded_image(source_bytes)?.to_rgba8();
    let border = border_indices(source.width() as usize, source.height() as usize);
    if border
        .iter()
        .any(|index| source.as_raw()[index * 4 + 3] > ALPHA_THRESHOLD)
    {
        return Err(ProxyError::Request(
            "Game Asset grounded normalization requires a verified transparent parent frame".into(),
        ));
    }
    normalize_cutout(
        source,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        GROUNDED_NORMALIZATION_IMPLEMENTATION,
        None,
        None,
        None,
        Some("source-alpha-preserved"),
        GROUNDED_NORMALIZATION_SCALE_POLICY,
        true,
        true,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn derive_verified_alpha_grounded_frame(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_width: u32,
    frame_height: u32,
    alpha_target_width: u32,
    alpha_target_height: u32,
    expected_anchor_x: f64,
    expected_anchor_y: f64,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence, PixelEvidence), ProxyError> {
    let (output_bytes, processing_evidence) = normalize_verified_alpha_grounded_v8(
        source_bytes,
        source_artifact_id,
        source_artifact_sha256,
        &PixelSize {
            width: frame_width,
            height: frame_height,
        },
        &PixelSize {
            width: alpha_target_width,
            height: alpha_target_height,
        },
        &AnchorPoint {
            x: expected_anchor_x,
            y: expected_anchor_y,
        },
        anchor_policy,
    )?;
    let pixel_evidence = inspect_pixels(&output_bytes, anchor_policy)?;
    Ok((output_bytes, processing_evidence, pixel_evidence))
}

fn deterministic_cutout_v6(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let mut matte = matte_adaptive_chroma_trimap_ml(source_bytes, false)?;
    prune_detached_horizontal_components(&mut matte.image);
    prune_unsupported_horizontal_strokes(&mut matte.image);
    normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        V6_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        CUTOUT_SCALE_POLICY,
        false,
        true,
    )
}

fn deterministic_cutout_v5(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let matte = matte_adaptive_chroma_trimap_ml_v5(source_bytes)?;
    normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        V5_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        CUTOUT_SCALE_POLICY,
        false,
        true,
    )
}

fn deterministic_cutout_v4(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let matte = matte_chroma_trimap_ml_v4(source_bytes)?;
    normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        CHROMA_ML_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        CUTOUT_SCALE_POLICY,
        false,
        true,
    )
}

fn deterministic_cutout_v3(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    let matte = matte_adaptive_board(source_bytes)?;
    normalize_cutout(
        matte.image,
        source_artifact_id,
        source_artifact_sha256,
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
        ADAPTIVE_BOARD_CUTOUT_IMPLEMENTATION,
        None,
        matte.background_color,
        matte.color_distance_threshold,
        Some(matte.route),
        CUTOUT_SCALE_POLICY,
        false,
        true,
    )
}

#[allow(clippy::too_many_arguments)]
fn replay_deterministic_cutout(
    implementation: &str,
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_size: &PixelSize,
    alpha_target: &PixelSize,
    expected_anchor: &AnchorPoint,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence), ProxyError> {
    match implementation {
        WHITE_BOARD_CUTOUT_IMPLEMENTATION => deterministic_cutout_v2(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        ADAPTIVE_BOARD_CUTOUT_IMPLEMENTATION => deterministic_cutout_v3(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        CHROMA_ML_CUTOUT_IMPLEMENTATION => deterministic_cutout_v4(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        V5_CUTOUT_IMPLEMENTATION => deterministic_cutout_v5(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        V6_CUTOUT_IMPLEMENTATION => deterministic_cutout_v6(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        CUTOUT_IMPLEMENTATION => deterministic_cutout(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        V9_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION => deterministic_spatial_board_cutout_v9(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        V10_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION => deterministic_spatial_board_cutout_v10(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        SPATIAL_BOARD_CUTOUT_IMPLEMENTATION => deterministic_spatial_board_cutout_v11(
            source_bytes,
            source_artifact_id,
            source_artifact_sha256,
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        ),
        OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION => {
            deterministic_occlusion_tolerant_spatial_board_cutout_v12(
                source_bytes,
                source_artifact_id,
                source_artifact_sha256,
                frame_size,
                alpha_target,
                expected_anchor,
                anchor_policy,
            )
        }
        _ => Err(ProxyError::Request(
            "Game Asset raster processor implementation is unsupported for replay".into(),
        )),
    }
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

#[allow(clippy::too_many_arguments)]
pub(crate) fn process_game_map_object_cutout(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
    frame_width: u32,
    frame_height: u32,
    alpha_width: u32,
    alpha_height: u32,
    expected_anchor_x: f64,
    expected_anchor_y: f64,
    anchor_policy: &str,
) -> Result<(Vec<u8>, RasterProcessingEvidence, PixelEvidence), ProxyError> {
    let frame_size = PixelSize {
        width: frame_width,
        height: frame_height,
    };
    let alpha_target = PixelSize {
        width: alpha_width,
        height: alpha_height,
    };
    let expected_anchor = AnchorPoint {
        x: expected_anchor_x,
        y: expected_anchor_y,
    };
    let (bytes, processing_evidence) = deterministic_occlusion_tolerant_spatial_board_cutout_v12(
        source_bytes,
        source_artifact_id,
        source_artifact_sha256,
        &frame_size,
        &alpha_target,
        &expected_anchor,
        anchor_policy,
    )?;
    let pixel_evidence = inspect_pixels(&bytes, anchor_policy)?;
    Ok((bytes, processing_evidence, pixel_evidence))
}

struct SplitActionCell {
    role_id: String,
    row: u32,
    column: u32,
    source_rectangle: AlphaBounds,
    bytes: Vec<u8>,
}

fn split_action_grid(
    source_bytes: &[u8],
    requested: &ActionSheetGridInput,
    roles: &[GameRole],
) -> Result<(ObservedActionSheetGrid, Vec<SplitActionCell>), ProxyError> {
    let image = decode_bounded_image(source_bytes)?;
    let (width, height) = image.dimensions();
    if requested.rows == 0
        || requested.columns == 0
        || width % requested.columns != 0
        || height % requested.rows != 0
        || u64::from(requested.rows) * u64::from(requested.columns) != roles.len() as u64
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet decoded dimensions do not close the requested grid".into(),
        ));
    }
    let cell_width = width / requested.columns;
    let cell_height = height / requested.rows;
    if cell_width == 0 || cell_height == 0 {
        return Err(ProxyError::Request(
            "Game Asset action-sheet produced an empty grid cell".into(),
        ));
    }
    let mut cells = Vec::with_capacity(roles.len());
    for (index, role) in roles.iter().enumerate() {
        let row = index as u32 / requested.columns;
        let column = index as u32 % requested.columns;
        let source_rectangle = AlphaBounds {
            x: column * cell_width,
            y: row * cell_height,
            width: cell_width,
            height: cell_height,
        };
        let cropped = image::imageops::crop_imm(
            &image,
            source_rectangle.x,
            source_rectangle.y,
            source_rectangle.width,
            source_rectangle.height,
        )
        .to_image();
        cells.push(SplitActionCell {
            role_id: role.id.clone(),
            row,
            column,
            source_rectangle,
            bytes: encode_cutout_png(&cropped)?,
        });
    }
    Ok((
        ObservedActionSheetGrid {
            rows: requested.rows,
            columns: requested.columns,
            cell_width,
            cell_height,
        },
        cells,
    ))
}

fn retained_action_artifact(
    bytes: &[u8],
    media_type: &str,
    width: u32,
    height: u32,
) -> Result<RetainedActionArtifact, ProxyError> {
    if bytes.is_empty()
        || bytes.len() > MAX_OUTPUT_BYTES
        || !matches!(media_type, "image/png" | "image/jpeg" | "image/webp")
        || detect_media(bytes) != Some(media_type)
    {
        return Err(ProxyError::Request(
            "Game Asset action-source artifact is invalid".into(),
        ));
    }
    let digest = sha256(bytes);
    Ok(RetainedActionArtifact {
        artifact_id: format!("artifact:sha256:{digest}"),
        sha256: digest,
        media_type: media_type.into(),
        byte_length: bytes.len(),
        bytes_base64: STANDARD.encode(bytes),
        decoded_width: width,
        decoded_height: height,
    })
}

fn action_source_id(source: &GameAssetActionSource) -> Result<String, ProxyError> {
    let payload = serde_json::json!({
        "version": source.version,
        "familyPlanId": source.family_plan_id,
        "groupId": source.group_id,
        "strategy": source.strategy,
        "splitterImplementation": source.splitter_implementation,
        "receiptId": source.receipt.receipt_id,
        "receiptHash": source.receipt.receipt_hash,
        "source": {
            "artifactId": source.source.artifact_id,
            "sha256": source.source.sha256,
            "mediaType": source.source.media_type,
            "byteLength": source.source.byte_length,
            "decodedWidth": source.source.decoded_width,
            "decodedHeight": source.source.decoded_height,
        },
        "grid": source.grid,
        "cells": source.cells.iter().map(|cell| serde_json::json!({
            "roleId": cell.role_id,
            "row": cell.row,
            "column": cell.column,
            "sourceRectangle": cell.source_rectangle,
            "artifactId": cell.artifact.artifact_id,
            "sha256": cell.artifact.sha256,
            "byteLength": cell.artifact.byte_length,
            "decodedWidth": cell.artifact.decoded_width,
            "decodedHeight": cell.artifact.decoded_height,
        })).collect::<Vec<_>>(),
    });
    Ok(format!(
        "action-source:sha256:{}",
        canonical_hash(&payload)?
    ))
}

fn action_clip_id(clip: &GameAssetActionClip) -> Result<String, ProxyError> {
    let payload = serde_json::json!({
        "version": clip.version,
        "familyPlanId": clip.family_plan_id,
        "groupId": clip.group_id,
        "atomicPlanId": clip.atomic_plan_id,
        "atomicPlanHash": clip.atomic_plan_hash,
        "sourceId": clip.source_id,
        "frames": clip.frames.iter().map(|frame| serde_json::json!({
            "roleId": frame.role_id,
            "sourceArtifactId": frame.source_artifact_id,
            "artifactId": frame.artifact_id,
            "artifactSha256": frame.artifact_sha256,
            "durationMs": frame.duration_ms,
            "anchor": frame.anchor,
            "processingEvidence": frame.processing_evidence,
            "pixelEvidence": frame.pixel_evidence,
        })).collect::<Vec<_>>(),
    });
    Ok(format!("action-clip:sha256:{}", canonical_hash(&payload)?))
}

fn action_sheet_partial_id(partial: &GameAssetActionSheetPartial) -> Result<String, ProxyError> {
    let payload = serde_json::json!({
        "version": partial.version,
        "familyPlanId": partial.family_plan_id,
        "groupId": partial.group_id,
        "atomicPlanId": partial.atomic_plan_id,
        "atomicPlanHash": partial.atomic_plan_hash,
        "sourceId": partial.source_id,
        "frameDurationMs": partial.frame_duration_ms,
        "looping": partial.looping,
        "frames": partial.frames.iter().map(|frame| serde_json::json!({
            "roleId": frame.role_id,
            "sourceArtifactId": frame.source_artifact_id,
            "artifactId": frame.artifact_id,
            "artifactSha256": frame.artifact_sha256,
            "durationMs": frame.duration_ms,
            "anchor": frame.anchor,
            "processingEvidence": frame.processing_evidence,
            "pixelEvidence": frame.pixel_evidence,
        })).collect::<Vec<_>>(),
        "failures": partial.failures,
    });
    Ok(format!(
        "action-sheet-partial:sha256:{}",
        canonical_hash(&payload)?
    ))
}

fn action_sheet_authorized_cells(
    source: &GameAssetActionSource,
    clip: &GameAssetActionClip,
) -> Result<Vec<AuthorizedActionSheetCell>, ProxyError> {
    source
        .cells
        .iter()
        .zip(&clip.frames)
        .map(|(cell, frame)| {
            if cell.role_id != frame.role_id {
                return Err(ProxyError::Request(
                    "Game Asset action-source and clip role order drifted".into(),
                ));
            }
            Ok(AuthorizedActionSheetCell {
                role_id: cell.role_id.clone(),
                row: cell.row,
                column: cell.column,
                source_rectangle: cell.source_rectangle.clone(),
                source_artifact_id: cell.artifact.artifact_id.clone(),
                source_artifact_sha256: cell.artifact.sha256.clone(),
                artifact_id: frame.artifact_id.clone(),
                artifact_sha256: frame.artifact_sha256.clone(),
                processing_evidence: frame.processing_evidence.clone(),
                pixel_evidence: frame.pixel_evidence.clone(),
            })
        })
        .collect()
}

fn derive_partial_reprocessed_clip(
    stored: &StoredActionSheetPartialReprocessPreview,
) -> Result<GameAssetActionClip, ProxyError> {
    derive_partial_reprocessed_clip_with_implementation(stored, SPATIAL_BOARD_CUTOUT_IMPLEMENTATION)
}

fn derive_partial_reprocessed_clip_with_implementation(
    stored: &StoredActionSheetPartialReprocessPreview,
    processor_implementation: &str,
) -> Result<GameAssetActionClip, ProxyError> {
    if !matches!(
        processor_implementation,
        V9_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
            | V10_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
            | SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
    ) {
        return Err(ProxyError::Request(
            "Game Asset partial reprocess processor is not a frozen spatial-board implementation"
                .into(),
        ));
    }
    let frame_size = PixelSize {
        width: stored.plan.delivery.frame_width,
        height: stored.plan.delivery.frame_height,
    };
    let failed_role_ids = stored
        .parent_partial
        .failures
        .iter()
        .map(|failure| failure.role_id.as_str())
        .collect::<HashSet<_>>();
    let mut frames = Vec::with_capacity(stored.plan.roles.len());
    let mut output_bytes = 0_usize;
    for role in &stored.plan.roles {
        if !failed_role_ids.contains(role.id.as_str()) {
            let frame = stored
                .parent_partial
                .frames
                .iter()
                .find(|frame| frame.role_id == role.id)
                .cloned()
                .ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset partial reprocess preserved frame disappeared".into(),
                    )
                })?;
            let bytes = STANDARD.decode(&frame.artifact_bytes_base64).map_err(|_| {
                ProxyError::Request(
                    "Game Asset partial reprocess preserved frame base64 is invalid".into(),
                )
            })?;
            output_bytes = output_bytes.checked_add(bytes.len()).ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset partial reprocess byte accounting overflowed".into(),
                )
            })?;
            frames.push(frame);
            continue;
        }
        let cell = stored
            .parent_source
            .cells
            .iter()
            .find(|cell| cell.role_id == role.id)
            .ok_or_else(|| {
                ProxyError::Request("Game Asset partial reprocess source cell disappeared".into())
            })?;
        let source_bytes = verify_action_artifact(&cell.artifact)?;
        let (processed_bytes, processing_evidence) = replay_deterministic_cutout(
            processor_implementation,
            &source_bytes,
            &cell.artifact.artifact_id,
            &cell.artifact.sha256,
            &frame_size,
            &role.expected_alpha_size,
            &role.expected_anchor,
            &role.anchor,
        )?;
        let pixel_evidence = inspect_pixels(&processed_bytes, &role.anchor)?;
        if pixel_evidence.edge_contact
            || processing_evidence.spatial_board_model.is_none()
            || processing_evidence.implementation != processor_implementation
        {
            return Err(ProxyError::Request(
                "Game Asset partial reprocess did not close its spatial-board pixel contract"
                    .into(),
            ));
        }
        output_bytes = output_bytes
            .checked_add(processed_bytes.len())
            .ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset partial reprocess byte accounting overflowed".into(),
                )
            })?;
        frames.push(GameAssetActionClipFrame {
            role_id: role.id.clone(),
            source_artifact_id: cell.artifact.artifact_id.clone(),
            artifact_id: processing_evidence.output_artifact_id.clone(),
            artifact_sha256: processing_evidence.output_artifact_sha256.clone(),
            artifact_bytes_base64: STANDARD.encode(&processed_bytes),
            duration_ms: stored.parent_partial.frame_duration_ms,
            anchor: pixel_evidence.anchor.clone(),
            processing_evidence,
            pixel_evidence,
        });
    }
    if output_bytes > MAX_OUTPUT_BYTES {
        return Err(ProxyError::Request(
            "Game Asset partial reprocess exceeds its retained output byte budget".into(),
        ));
    }
    let mut clip = GameAssetActionClip {
        version: ACTION_CLIP_PROTOCOL.into(),
        id: String::new(),
        family_plan_id: stored.parent_authorization.family_plan_id.clone(),
        group_id: stored.parent_authorization.group_id.clone(),
        atomic_plan_id: stored.plan.id.clone(),
        atomic_plan_hash: canonical_hash(&stored.plan_value)?,
        source_id: stored.parent_source.id.clone(),
        frames,
    };
    clip.id = action_clip_id(&clip)?;
    Ok(clip)
}

fn issue_action_sheet_partial_reprocess_authorization(
    stored: &StoredActionSheetPartialReprocessPreview,
    clip: &GameAssetActionClip,
    execution_id: String,
    started_at: u64,
    completed_at: u64,
) -> Result<GameAssetActionSheetPartialReprocessAuthorization, ProxyError> {
    let preserved_cells = stored
        .parent_partial
        .frames
        .iter()
        .map(|frame| PreservedActionSheetCellLineage {
            role_id: frame.role_id.clone(),
            source_artifact_id: frame.source_artifact_id.clone(),
            artifact_id: frame.artifact_id.clone(),
        })
        .collect::<Vec<_>>();
    let payload = ActionSheetPartialReprocessAuthorizationPayload {
        protocol: ACTION_SHEET_PARTIAL_REPROCESS_AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-action-sheet-partial-reprocess-authorization:{}",
            uuid::Uuid::new_v4().simple()
        ),
        plan_id: stored.preview.plan_id.clone(),
        request_digest: stored.preview.request_digest.clone(),
        execution_id,
        execution_mode: "local-deterministic".into(),
        identity: stored.parent_authorization.identity.clone(),
        run_id: stored.preview.run_id.clone(),
        provider_id: stored.parent_authorization.provider_id.clone(),
        model: stored.parent_authorization.model.clone(),
        family_plan_id: stored.parent_authorization.family_plan_id.clone(),
        family_plan_hash: stored.parent_authorization.family_plan_hash.clone(),
        group_id: stored.parent_authorization.group_id.clone(),
        game_plan_id: stored.plan.id.clone(),
        game_plan_hash: canonical_hash(&stored.plan_value)?,
        parent_authorization_receipt_id: stored.parent_authorization.receipt_id.clone(),
        parent_authorization_receipt_hash: stored.parent_authorization.receipt_hash.clone(),
        parent_source_id: stored.parent_source.id.clone(),
        parent_partial_id: stored.parent_partial.id.clone(),
        source_receipt_id: stored.parent_source.receipt.receipt_id.clone(),
        source_receipt_hash: stored.parent_source.receipt.receipt_hash.clone(),
        clip_id: clip.id.clone(),
        reprocessed_role_ids: stored.preview.reprocessed_role_ids.clone(),
        preserved_cells,
        cells: action_sheet_authorized_cells(&stored.parent_source, clip)?,
        processor_implementation: SPATIAL_BOARD_CUTOUT_IMPLEMENTATION.into(),
        provider_calls: 0,
        status: "succeeded".into(),
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetActionSheetPartialReprocessAuthorization {
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
        family_plan_id: payload.family_plan_id,
        family_plan_hash: payload.family_plan_hash,
        group_id: payload.group_id,
        game_plan_id: payload.game_plan_id,
        game_plan_hash: payload.game_plan_hash,
        parent_authorization_receipt_id: payload.parent_authorization_receipt_id,
        parent_authorization_receipt_hash: payload.parent_authorization_receipt_hash,
        parent_source_id: payload.parent_source_id,
        parent_partial_id: payload.parent_partial_id,
        source_receipt_id: payload.source_receipt_id,
        source_receipt_hash: payload.source_receipt_hash,
        clip_id: payload.clip_id,
        reprocessed_role_ids: payload.reprocessed_role_ids,
        preserved_cells: payload.preserved_cells,
        cells: payload.cells,
        processor_implementation: payload.processor_implementation,
        provider_calls: payload.provider_calls,
        status: payload.status,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

fn issue_action_sheet_authorization(
    stored: &StoredActionSheetPreview,
    execution_id: String,
    source: &GameAssetActionSource,
    clip: &GameAssetActionClip,
    started_at: u64,
    completed_at: u64,
) -> Result<GameAssetActionSheetAuthorization, ProxyError> {
    let payload = ActionSheetAuthorizationPayload {
        protocol: ACTION_SHEET_AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-action-sheet-authorization:{}",
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
        family_plan_id: stored.preview.family_plan_id.clone(),
        family_plan_hash: stored.preview.family_plan_hash.clone(),
        group_id: stored.preview.group_id.clone(),
        game_plan_id: stored.plan.id.clone(),
        game_plan_hash: canonical_hash(&stored.plan_value)?,
        source_request: AuthorizedActionSheetRequest {
            request_id: stored.request.request_id.clone(),
            prompt: stored.request.prompt.clone(),
            prompt_hash: stored.request.prompt_hash.clone(),
            semantic_role: stored.request.semantic_role.clone(),
            node_id: stored.request.node_id.clone(),
            capability_id: stored.request.capability_id.clone(),
            accepted_reference_artifact_ids: stored.request.accepted_reference_artifact_ids.clone(),
            lock_ids: stored.request.lock_ids.clone(),
            role_ids: stored.preview.role_ids.clone(),
            grid: stored.preview.grid.clone(),
            output_size: stored.preview.output_size.clone(),
            frame_duration_ms: stored.preview.frame_duration_ms,
            looping: stored.preview.looping,
        },
        source_receipt_id: source.receipt.receipt_id.clone(),
        source_receipt_hash: source.receipt.receipt_hash.clone(),
        source_id: source.id.clone(),
        clip_id: clip.id.clone(),
        cells: action_sheet_authorized_cells(source, clip)?,
        status: "succeeded".into(),
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetActionSheetAuthorization {
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
        family_plan_id: payload.family_plan_id,
        family_plan_hash: payload.family_plan_hash,
        group_id: payload.group_id,
        game_plan_id: payload.game_plan_id,
        game_plan_hash: payload.game_plan_hash,
        source_request: payload.source_request,
        source_receipt_id: payload.source_receipt_id,
        source_receipt_hash: payload.source_receipt_hash,
        source_id: payload.source_id,
        clip_id: payload.clip_id,
        cells: payload.cells,
        status: payload.status,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

fn issue_action_sheet_partial_authorization(
    stored: &StoredActionSheetPreview,
    execution_id: String,
    source: &GameAssetActionSource,
    partial: &GameAssetActionSheetPartial,
    started_at: u64,
    completed_at: u64,
) -> Result<GameAssetActionSheetPartialAuthorization, ProxyError> {
    let payload = ActionSheetPartialAuthorizationPayload {
        protocol: ACTION_SHEET_PARTIAL_AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-action-sheet-partial-authorization:{}",
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
        family_plan_id: stored.preview.family_plan_id.clone(),
        family_plan_hash: stored.preview.family_plan_hash.clone(),
        group_id: stored.preview.group_id.clone(),
        game_plan_id: stored.plan.id.clone(),
        game_plan_hash: canonical_hash(&stored.plan_value)?,
        source_request: AuthorizedActionSheetRequest {
            request_id: stored.request.request_id.clone(),
            prompt: stored.request.prompt.clone(),
            prompt_hash: stored.request.prompt_hash.clone(),
            semantic_role: stored.request.semantic_role.clone(),
            node_id: stored.request.node_id.clone(),
            capability_id: stored.request.capability_id.clone(),
            accepted_reference_artifact_ids: stored.request.accepted_reference_artifact_ids.clone(),
            lock_ids: stored.request.lock_ids.clone(),
            role_ids: stored.preview.role_ids.clone(),
            grid: stored.preview.grid.clone(),
            output_size: stored.preview.output_size.clone(),
            frame_duration_ms: stored.preview.frame_duration_ms,
            looping: stored.preview.looping,
        },
        source_receipt_id: source.receipt.receipt_id.clone(),
        source_receipt_hash: source.receipt.receipt_hash.clone(),
        source_id: source.id.clone(),
        partial_id: partial.id.clone(),
        successful_role_ids: partial
            .frames
            .iter()
            .map(|frame| frame.role_id.clone())
            .collect(),
        failed_role_ids: partial
            .failures
            .iter()
            .map(|failure| failure.role_id.clone())
            .collect(),
        status: "partial".into(),
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetActionSheetPartialAuthorization {
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
        family_plan_id: payload.family_plan_id,
        family_plan_hash: payload.family_plan_hash,
        group_id: payload.group_id,
        game_plan_id: payload.game_plan_id,
        game_plan_hash: payload.game_plan_hash,
        source_request: payload.source_request,
        source_receipt_id: payload.source_receipt_id,
        source_receipt_hash: payload.source_receipt_hash,
        source_id: payload.source_id,
        partial_id: payload.partial_id,
        successful_role_ids: payload.successful_role_ids,
        failed_role_ids: payload.failed_role_ids,
        status: payload.status,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

fn issue_action_sheet_repair_authorization(
    stored: &StoredActionSheetRepairPreview,
    execution_id: String,
    outputs: &[RetainedActionSheetRepairOutput],
    started_at: u64,
    completed_at: u64,
) -> Result<GameAssetActionSheetRepairAuthorization, ProxyError> {
    let replacement_role_ids = stored.preview.replacement_role_ids.clone();
    let replacement_set = replacement_role_ids.iter().collect::<HashSet<_>>();
    let preserved_cells = stored
        .parent_source
        .cells
        .iter()
        .filter(|cell| !replacement_set.contains(&cell.role_id))
        .map(|cell| {
            let frame = stored
                .parent_clip
                .frames
                .iter()
                .find(|frame| frame.role_id == cell.role_id)
                .ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset action-sheet repair preserved cell has no parent frame".into(),
                    )
                })?;
            Ok(PreservedActionSheetCellLineage {
                role_id: cell.role_id.clone(),
                source_artifact_id: cell.artifact.artifact_id.clone(),
                artifact_id: frame.artifact_id.clone(),
            })
        })
        .collect::<Result<Vec<_>, ProxyError>>()?;
    let role_requests = stored
        .roles
        .iter()
        .map(|role| AuthorizedRoleRequest {
            role_id: role.role.id.clone(),
            request_id: role.request.request_id.clone(),
            prompt: role.request.prompt.clone(),
            prompt_hash: role.request.prompt_hash.clone(),
            semantic_role: role.request.semantic_role.clone(),
            node_id: role.request.node_id.clone(),
            capability_id: role.request.capability_id.clone(),
            accepted_reference_artifact_ids: role.request.accepted_reference_artifact_ids.clone(),
            lock_ids: role.request.lock_ids.clone(),
            anchor_policy: role.role.anchor.clone(),
        })
        .collect::<Vec<_>>();
    let output_metadata = outputs
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
        .collect::<Vec<_>>();
    let payload = ActionSheetRepairAuthorizationPayload {
        protocol: ACTION_SHEET_REPAIR_AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-action-sheet-repair-authorization:{}",
            uuid::Uuid::new_v4().simple()
        ),
        plan_id: stored.preview.plan_id.clone(),
        request_digest: stored.preview.request_digest.clone(),
        execution_id,
        execution_mode: "byok-direct".into(),
        identity: stored.parent_authorization.identity.clone(),
        run_id: stored.preview.run_id.clone(),
        provider_id: stored.preview.provider_id.clone(),
        model: stored.preview.model.clone(),
        family_plan_id: stored.preview.family_plan_id.clone(),
        family_plan_hash: stored.preview.family_plan_hash.clone(),
        group_id: stored.preview.group_id.clone(),
        game_plan_id: stored.preview.game_plan_id.clone(),
        game_plan_hash: canonical_hash(&stored.plan_value)?,
        parent_authorization_receipt_id: stored.parent_authorization.receipt_id.clone(),
        parent_authorization_receipt_hash: stored.parent_authorization.receipt_hash.clone(),
        parent_source_id: stored.parent_source.id.clone(),
        parent_clip_id: stored.parent_clip.id.clone(),
        role_requests,
        replacement_role_ids,
        preserved_cells,
        outputs: output_metadata,
        status: "succeeded".into(),
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetActionSheetRepairAuthorization {
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
        family_plan_id: payload.family_plan_id,
        family_plan_hash: payload.family_plan_hash,
        group_id: payload.group_id,
        game_plan_id: payload.game_plan_id,
        game_plan_hash: payload.game_plan_hash,
        parent_authorization_receipt_id: payload.parent_authorization_receipt_id,
        parent_authorization_receipt_hash: payload.parent_authorization_receipt_hash,
        parent_source_id: payload.parent_source_id,
        parent_clip_id: payload.parent_clip_id,
        role_requests: payload.role_requests,
        replacement_role_ids: payload.replacement_role_ids,
        preserved_cells: payload.preserved_cells,
        outputs: payload.outputs,
        status: payload.status,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

fn issue_action_sheet_partial_repair_authorization(
    stored: &StoredActionSheetPartialRepairPreview,
    execution_id: String,
    outputs: &[RetainedActionSheetRepairOutput],
    started_at: u64,
    completed_at: u64,
) -> Result<GameAssetActionSheetPartialRepairAuthorization, ProxyError> {
    let preserved_cells = stored
        .parent_partial
        .frames
        .iter()
        .map(|frame| PreservedActionSheetCellLineage {
            role_id: frame.role_id.clone(),
            source_artifact_id: frame.source_artifact_id.clone(),
            artifact_id: frame.artifact_id.clone(),
        })
        .collect::<Vec<_>>();
    let role_requests = stored
        .roles
        .iter()
        .map(|role| AuthorizedRoleRequest {
            role_id: role.role.id.clone(),
            request_id: role.request.request_id.clone(),
            prompt: role.request.prompt.clone(),
            prompt_hash: role.request.prompt_hash.clone(),
            semantic_role: role.request.semantic_role.clone(),
            node_id: role.request.node_id.clone(),
            capability_id: role.request.capability_id.clone(),
            accepted_reference_artifact_ids: role.request.accepted_reference_artifact_ids.clone(),
            lock_ids: role.request.lock_ids.clone(),
            anchor_policy: role.role.anchor.clone(),
        })
        .collect::<Vec<_>>();
    let output_metadata = outputs
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
        .collect::<Vec<_>>();
    let payload = ActionSheetPartialRepairAuthorizationPayload {
        protocol: ACTION_SHEET_PARTIAL_REPAIR_AUTHORIZATION_PROTOCOL.into(),
        receipt_id: format!(
            "receipt:game-asset-action-sheet-partial-repair-authorization:{}",
            uuid::Uuid::new_v4().simple()
        ),
        plan_id: stored.preview.plan_id.clone(),
        request_digest: stored.preview.request_digest.clone(),
        execution_id,
        execution_mode: "byok-direct".into(),
        identity: stored.parent_authorization.identity.clone(),
        run_id: stored.preview.run_id.clone(),
        provider_id: stored.preview.provider_id.clone(),
        model: stored.preview.model.clone(),
        family_plan_id: stored.preview.family_plan_id.clone(),
        family_plan_hash: stored.preview.family_plan_hash.clone(),
        group_id: stored.preview.group_id.clone(),
        game_plan_id: stored.preview.game_plan_id.clone(),
        game_plan_hash: canonical_hash(&stored.plan_value)?,
        parent_authorization_receipt_id: stored.parent_authorization.receipt_id.clone(),
        parent_authorization_receipt_hash: stored.parent_authorization.receipt_hash.clone(),
        parent_source_id: stored.parent_source.id.clone(),
        parent_partial_id: stored.parent_partial.id.clone(),
        role_requests,
        replacement_role_ids: stored.preview.replacement_role_ids.clone(),
        preserved_cells,
        outputs: output_metadata,
        status: "succeeded".into(),
        started_at,
        completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameAssetActionSheetPartialRepairAuthorization {
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
        family_plan_id: payload.family_plan_id,
        family_plan_hash: payload.family_plan_hash,
        group_id: payload.group_id,
        game_plan_id: payload.game_plan_id,
        game_plan_hash: payload.game_plan_hash,
        parent_authorization_receipt_id: payload.parent_authorization_receipt_id,
        parent_authorization_receipt_hash: payload.parent_authorization_receipt_hash,
        parent_source_id: payload.parent_source_id,
        parent_partial_id: payload.parent_partial_id,
        role_requests: payload.role_requests,
        replacement_role_ids: payload.replacement_role_ids,
        preserved_cells: payload.preserved_cells,
        outputs: payload.outputs,
        status: payload.status,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        signature,
    })
}

fn issue_authorization(
    stored: &StoredPreview,
    execution_id: String,
    started_at: u64,
    outputs: &[RetainedRoleOutput],
    completed_at: u64,
) -> Result<GameAssetGenerationAuthorization, ProxyError> {
    let protocol = if stored.repair_lineage.is_some() {
        REPAIR_AUTHORIZATION_PROTOCOL
    } else {
        AUTHORIZATION_PROTOCOL
    };
    let payload = AuthorizationPayload {
        protocol: protocol.into(),
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
        repair_lineage: stored.repair_lineage.clone(),
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
        repair_lineage: payload.repair_lineage,
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

#[tauri::command]
pub fn preview_game_asset_action_sheet_generation(
    state: State<'_, GameAssetGenerationState>,
    input: GameAssetActionSheetPreviewInput,
) -> Result<GameAssetActionSheetPreview, ProxyError> {
    let now = unix_millis()?;
    let stored = preview_action_sheet_request(input, now)?;
    let preview = stored.preview.clone();
    let mut previews = state.action_sheet_previews.lock().map_err(|_| {
        ProxyError::Request("Game Asset action-sheet preview state is unavailable".into())
    })?;
    previews.retain(|_, candidate| candidate.preview.expires_at > now);
    if previews.len() >= MAX_ACTIVE_PREVIEWS {
        return Err(ProxyError::Request(
            "Game Asset action-sheet preview capacity is exhausted".into(),
        ));
    }
    previews.insert(preview.plan_id.clone(), stored);
    Ok(preview)
}

#[tauri::command]
pub fn preview_game_asset_action_sheet_repair(
    state: State<'_, GameAssetGenerationState>,
    input: GameAssetActionSheetRepairPreviewInput,
) -> Result<GameAssetActionSheetRepairPreview, ProxyError> {
    let now = unix_millis()?;
    let stored = preview_action_sheet_repair_request(input, now)?;
    let preview = stored.preview.clone();
    let mut previews = state.action_sheet_repair_previews.lock().map_err(|_| {
        ProxyError::Request("Game Asset action-sheet repair preview state is unavailable".into())
    })?;
    previews.retain(|_, candidate| candidate.preview.expires_at > now);
    if previews.len() >= MAX_ACTIVE_PREVIEWS {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair preview capacity is exhausted".into(),
        ));
    }
    previews.insert(preview.plan_id.clone(), stored);
    Ok(preview)
}

#[tauri::command]
pub fn preview_game_asset_action_sheet_partial_repair(
    state: State<'_, GameAssetGenerationState>,
    input: GameAssetActionSheetPartialRepairPreviewInput,
) -> Result<GameAssetActionSheetPartialRepairPreview, ProxyError> {
    let now = unix_millis()?;
    let stored = preview_action_sheet_partial_repair_request(input, now)?;
    let preview = stored.preview.clone();
    let mut previews = state
        .action_sheet_partial_repair_previews
        .lock()
        .map_err(|_| {
            ProxyError::Request(
                "Game Asset partial action-sheet repair preview state is unavailable".into(),
            )
        })?;
    previews.retain(|_, candidate| candidate.preview.expires_at > now);
    if previews.len() >= MAX_ACTIVE_PREVIEWS {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair preview capacity is exhausted".into(),
        ));
    }
    previews.insert(preview.plan_id.clone(), stored);
    Ok(preview)
}

#[tauri::command]
pub fn preview_game_asset_action_sheet_partial_reprocess(
    state: State<'_, GameAssetGenerationState>,
    input: GameAssetActionSheetPartialReprocessPreviewInput,
) -> Result<GameAssetActionSheetPartialReprocessPreview, ProxyError> {
    let now = unix_millis()?;
    let stored = preview_action_sheet_partial_reprocess_request(input, now)?;
    let preview = stored.preview.clone();
    let mut previews = state
        .action_sheet_partial_reprocess_previews
        .lock()
        .map_err(|_| {
            ProxyError::Request(
                "Game Asset partial action-sheet reprocess preview state is unavailable".into(),
            )
        })?;
    previews.retain(|_, candidate| candidate.preview.expires_at > now);
    if previews.len() >= MAX_ACTIVE_PREVIEWS {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet reprocess preview capacity is exhausted".into(),
        ));
    }
    previews.insert(preview.plan_id.clone(), stored);
    Ok(preview)
}

#[tauri::command]
pub fn preview_game_asset_generation_repair(
    state: State<'_, GameAssetGenerationState>,
    input: GameAssetGenerationRepairPreviewInput,
) -> Result<GameAssetGenerationPreview, ProxyError> {
    let now = unix_millis()?;
    let stored = preview_repair_request(input, now)?;
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
        if let Some(preserved) = stored.preserved_outputs.get(&role.role_id) {
            let source_bytes = STANDARD
                .decode(&preserved.source_artifact_bytes_base64)
                .map_err(|_| {
                    ProxyError::Request("Game Asset preserved source base64 is invalid".into())
                })?;
            let processed_bytes =
                STANDARD
                    .decode(&preserved.artifact_bytes_base64)
                    .map_err(|_| {
                        ProxyError::Request("Game Asset preserved output base64 is invalid".into())
                    })?;
            output_bytes = output_bytes
                .checked_add(source_bytes.len())
                .and_then(|total| total.checked_add(processed_bytes.len()))
                .ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset preserved output byte accounting overflowed".into(),
                    )
                })?;
            if output_bytes > MAX_OUTPUT_BYTES {
                return Ok(GameAssetGenerationApplyResult {
                    status: "partial".into(),
                    outputs,
                    authorization: None,
                    error: Some(
                        "Game Asset generation exceeded its total retained output byte budget"
                            .into(),
                    ),
                });
            }
            outputs.push(preserved.clone());
            continue;
        }
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

fn action_sheet_failure(error: impl Into<String>) -> GameAssetActionSheetApplyResult {
    GameAssetActionSheetApplyResult {
        status: "failed".into(),
        source: None,
        clip: None,
        partial: None,
        authorization: None,
        partial_authorization: None,
        error: Some(error.into()),
    }
}

fn action_sheet_failure_with_source(
    error: impl Into<String>,
    source: &GameAssetActionSource,
) -> GameAssetActionSheetApplyResult {
    GameAssetActionSheetApplyResult {
        status: "failed".into(),
        source: Some(source.clone()),
        clip: None,
        partial: None,
        authorization: None,
        partial_authorization: None,
        error: Some(error.into()),
    }
}

async fn execute_stored_action_sheet_preview<F, Fut>(
    stored: StoredActionSheetPreview,
    execute_sheet: F,
) -> Result<GameAssetActionSheetApplyResult, ProxyError>
where
    F: FnOnce(GameAssetRoleExecution) -> Fut,
    Fut: Future<Output = Result<DashScopeImageResult, ProxyError>>,
{
    let execution_id = format!(
        "execution:game-asset-action-sheet:{}",
        uuid::Uuid::new_v4().simple()
    );
    let started_at = unix_millis()?;
    let context = MultimodalHostContext {
        request_id: stored.request.request_id.clone(),
        run_id: stored.preview.run_id.clone(),
        held_out_commitment_hash: None,
        semantic_role: Some(stored.request.semantic_role.clone()),
        node_id: Some(stored.request.node_id.clone()),
        capability_id: Some(stored.request.capability_id.clone()),
        accepted_reference_artifact_ids: stored.request.accepted_reference_artifact_ids.clone(),
        lock_ids: stored.request.lock_ids.clone(),
    };
    let result = tokio::time::timeout(
        Duration::from_secs(ROLE_TIMEOUT_SECS),
        execute_sheet(GameAssetRoleExecution {
            provider_id: stored.preview.provider_id.clone(),
            model: stored.preview.model.clone(),
            prompt: stored.request.prompt.clone(),
            reference_bytes: stored.reference_bytes.clone(),
            output_size: stored.preview.output_size.clone(),
            context,
        }),
    )
    .await;
    let result = match result {
        Ok(Ok(result)) => result,
        Ok(Err(error)) => return Ok(action_sheet_failure(error.to_string())),
        Err(_) => {
            return Ok(action_sheet_failure(
                "Game Asset action-sheet generation timed out",
            ))
        }
    };
    if result.images.len() != 1 || result.receipts.len() != 1 {
        return Ok(action_sheet_failure(
            "Game Asset action-sheet generation did not return exactly one source artifact",
        ));
    }
    let image = &result.images[0];
    let receipt = &result.receipts[0];
    if image.data.len() > MAX_OUTPUT_BASE64_CHARACTERS {
        return Ok(action_sheet_failure(
            "Game Asset action-sheet source exceeded its encoded byte budget",
        ));
    }
    let source_bytes = match STANDARD.decode(&image.data) {
        Ok(bytes) => bytes,
        Err(_) => {
            return Ok(action_sheet_failure(
                "Game Asset action-sheet source base64 is invalid",
            ))
        }
    };
    if verify_receipt(receipt, &source_bytes).is_err()
        || receipt.request_id != stored.request.request_id
        || receipt.run_id != stored.preview.run_id
        || receipt.provider_id != stored.preview.provider_id
        || receipt.model != stored.preview.model
        || receipt.semantic_role.as_deref() != Some(stored.request.semantic_role.as_str())
        || receipt.node_id.as_deref() != Some(stored.request.node_id.as_str())
        || receipt.capability_id.as_deref() != Some(stored.request.capability_id.as_str())
        || receipt.accepted_reference_artifact_ids != stored.request.accepted_reference_artifact_ids
        || receipt.lock_ids != stored.request.lock_ids
        || receipt.artifact.media_type != image.media_type
    {
        return Ok(action_sheet_failure(
            "Game Asset action-sheet source receipt drifted from its previewed request",
        ));
    }
    let (observed_grid, split_cells) =
        match split_action_grid(&source_bytes, &stored.preview.grid, &stored.plan.roles) {
            Ok(value) => value,
            Err(error) => return Ok(action_sheet_failure(error.to_string())),
        };
    let source_width = observed_grid.cell_width * observed_grid.columns;
    let source_height = observed_grid.cell_height * observed_grid.rows;
    if receipt.artifact.width != Some(source_width)
        || receipt.artifact.height != Some(source_height)
    {
        return Ok(action_sheet_failure(
            "Game Asset action-sheet receipt dimensions do not match decoded source bytes",
        ));
    }
    let source_artifact = retained_action_artifact(
        &source_bytes,
        &image.media_type,
        source_width,
        source_height,
    )?;
    let mut retained_bytes = source_bytes.len();
    let mut source_cells = Vec::with_capacity(split_cells.len());
    for cell in &split_cells {
        retained_bytes = retained_bytes
            .checked_add(cell.bytes.len())
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet byte accounting overflowed".into())
            })?;
        source_cells.push(GameAssetActionSourceCell {
            role_id: cell.role_id.clone(),
            row: cell.row,
            column: cell.column,
            source_rectangle: cell.source_rectangle.clone(),
            artifact: retained_action_artifact(
                &cell.bytes,
                "image/png",
                observed_grid.cell_width,
                observed_grid.cell_height,
            )?,
        });
    }
    let mut source = GameAssetActionSource {
        version: ACTION_SOURCE_PROTOCOL.into(),
        id: String::new(),
        family_plan_id: stored.preview.family_plan_id.clone(),
        group_id: stored.preview.group_id.clone(),
        strategy: "coherent-grid".into(),
        splitter_implementation: ACTION_SHEET_SPLITTER_IMPLEMENTATION.into(),
        receipt: receipt.clone(),
        source: source_artifact,
        grid: observed_grid,
        cells: source_cells,
    };
    source.id = action_source_id(&source)?;
    let frame_size = PixelSize {
        width: stored.plan.delivery.frame_width,
        height: stored.plan.delivery.frame_height,
    };
    let mut frames = Vec::with_capacity(split_cells.len());
    let mut failures = Vec::new();
    for (role, cell) in stored.plan.roles.iter().zip(&split_cells) {
        let cell_artifact = source
            .cells
            .iter()
            .find(|candidate| candidate.role_id == role.id)
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-source cell disappeared".into())
            })?;
        let (processed_bytes, processing_evidence) = match deterministic_cutout(
            &cell.bytes,
            &cell_artifact.artifact.artifact_id,
            &cell_artifact.artifact.sha256,
            &frame_size,
            &role.expected_alpha_size,
            &role.expected_anchor,
            &role.anchor,
        ) {
            Ok(value) => value,
            Err(error) => {
                failures.push(GameAssetActionSheetCellFailure {
                    role_id: role.id.clone(),
                    source_artifact_id: cell_artifact.artifact.artifact_id.clone(),
                    code: "deterministic-cutout-rejected".into(),
                    message: error.to_string(),
                });
                continue;
            }
        };
        let pixel_evidence = match inspect_pixels(&processed_bytes, &role.anchor) {
            Ok(value) => value,
            Err(error) => {
                failures.push(GameAssetActionSheetCellFailure {
                    role_id: role.id.clone(),
                    source_artifact_id: cell_artifact.artifact.artifact_id.clone(),
                    code: "pixel-inspection-rejected".into(),
                    message: error.to_string(),
                });
                continue;
            }
        };
        retained_bytes = retained_bytes
            .checked_add(processed_bytes.len())
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet byte accounting overflowed".into())
            })?;
        if retained_bytes > MAX_OUTPUT_BYTES {
            return Ok(action_sheet_failure_with_source(
                "Game Asset action-sheet retained bytes exceed the output budget",
                &source,
            ));
        }
        frames.push(GameAssetActionClipFrame {
            role_id: role.id.clone(),
            source_artifact_id: cell_artifact.artifact.artifact_id.clone(),
            artifact_id: processing_evidence.output_artifact_id.clone(),
            artifact_sha256: processing_evidence.output_artifact_sha256.clone(),
            artifact_bytes_base64: STANDARD.encode(&processed_bytes),
            duration_ms: stored.preview.frame_duration_ms,
            anchor: pixel_evidence.anchor.clone(),
            processing_evidence,
            pixel_evidence,
        });
    }
    if !failures.is_empty() {
        let failed_role_ids = failures
            .iter()
            .map(|failure| failure.role_id.clone())
            .collect::<Vec<_>>();
        let mut partial = GameAssetActionSheetPartial {
            version: ACTION_SHEET_PARTIAL_PROTOCOL.into(),
            id: String::new(),
            family_plan_id: stored.preview.family_plan_id.clone(),
            group_id: stored.preview.group_id.clone(),
            atomic_plan_id: stored.plan.id.clone(),
            atomic_plan_hash: canonical_hash(&stored.plan_value)?,
            source_id: source.id.clone(),
            frame_duration_ms: stored.preview.frame_duration_ms,
            looping: stored.preview.looping,
            frames,
            failures,
        };
        partial.id = action_sheet_partial_id(&partial)?;
        let completed_at = unix_millis()?;
        let authorization = issue_action_sheet_partial_authorization(
            &stored,
            execution_id,
            &source,
            &partial,
            started_at,
            completed_at,
        )?;
        return Ok(GameAssetActionSheetApplyResult {
            status: "partial".into(),
            source: Some(source),
            clip: None,
            partial: Some(partial),
            authorization: None,
            partial_authorization: Some(authorization),
            error: Some(format!(
                "Game Asset action sheet requires isolated repair for {}",
                failed_role_ids.join(", ")
            )),
        });
    }
    let mut clip = GameAssetActionClip {
        version: ACTION_CLIP_PROTOCOL.into(),
        id: String::new(),
        family_plan_id: stored.preview.family_plan_id.clone(),
        group_id: stored.preview.group_id.clone(),
        atomic_plan_id: stored.plan.id.clone(),
        atomic_plan_hash: canonical_hash(&stored.plan_value)?,
        source_id: source.id.clone(),
        frames,
    };
    clip.id = action_clip_id(&clip)?;
    let completed_at = unix_millis()?;
    let authorization = issue_action_sheet_authorization(
        &stored,
        execution_id,
        &source,
        &clip,
        started_at,
        completed_at,
    )?;
    Ok(GameAssetActionSheetApplyResult {
        status: "succeeded".into(),
        source: Some(source),
        clip: Some(clip),
        partial: None,
        authorization: Some(authorization),
        partial_authorization: None,
        error: None,
    })
}

fn action_sheet_repair_failure(
    parent_source_id: String,
    parent_clip_id: String,
    outputs: Vec<RetainedActionSheetRepairOutput>,
    error: impl Into<String>,
) -> GameAssetActionSheetRepairApplyResult {
    action_sheet_repair_failure_with_attempt(parent_source_id, parent_clip_id, outputs, None, error)
}

fn action_sheet_repair_failure_with_attempt(
    parent_source_id: String,
    parent_clip_id: String,
    outputs: Vec<RetainedActionSheetRepairOutput>,
    failed_attempt: Option<RetainedActionSheetRepairFailure>,
    error: impl Into<String>,
) -> GameAssetActionSheetRepairApplyResult {
    GameAssetActionSheetRepairApplyResult {
        status: "failed".into(),
        parent_source_id,
        parent_clip_id,
        outputs,
        failed_attempt,
        authorization: None,
        error: Some(error.into()),
    }
}

fn retained_action_sheet_repair_failure(
    role_id: String,
    receipt: MultimodalHostReceipt,
    source_media_type: String,
    source_artifact_bytes_base64: String,
    failure: String,
) -> RetainedActionSheetRepairFailure {
    RetainedActionSheetRepairFailure {
        role_id,
        receipt,
        source_media_type,
        source_artifact_bytes_base64,
        failure,
    }
}

async fn execute_stored_action_sheet_repair<F, Fut>(
    stored: StoredActionSheetRepairPreview,
    mut execute_role: F,
) -> Result<GameAssetActionSheetRepairApplyResult, ProxyError>
where
    F: FnMut(GameAssetRoleExecution) -> Fut,
    Fut: Future<Output = Result<DashScopeImageResult, ProxyError>>,
{
    let execution_id = format!(
        "execution:game-asset-action-sheet-repair:{}",
        uuid::Uuid::new_v4().simple()
    );
    let started_at = unix_millis()?;
    let mut outputs = Vec::with_capacity(stored.roles.len());
    for role in &stored.roles {
        let context = MultimodalHostContext {
            request_id: role.request.request_id.clone(),
            run_id: stored.preview.run_id.clone(),
            held_out_commitment_hash: None,
            semantic_role: Some(role.request.semantic_role.clone()),
            node_id: Some(role.request.node_id.clone()),
            capability_id: Some(role.request.capability_id.clone()),
            accepted_reference_artifact_ids: role.request.accepted_reference_artifact_ids.clone(),
            lock_ids: role.request.lock_ids.clone(),
        };
        let result = match tokio::time::timeout(
            Duration::from_secs(ROLE_TIMEOUT_SECS),
            execute_role(GameAssetRoleExecution {
                provider_id: stored.preview.provider_id.clone(),
                model: stored.preview.model.clone(),
                prompt: role.request.prompt.clone(),
                reference_bytes: role.reference_bytes.clone(),
                output_size: stored.preview.output_size.clone(),
                context,
            }),
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => {
                return Ok(action_sheet_repair_failure(
                    stored.parent_source.id.clone(),
                    stored.parent_clip.id.clone(),
                    outputs,
                    error.to_string(),
                ));
            }
            Err(_) => {
                return Ok(action_sheet_repair_failure(
                    stored.parent_source.id.clone(),
                    stored.parent_clip.id.clone(),
                    outputs,
                    "Game Asset action-sheet repair generation timed out",
                ));
            }
        };
        if result.images.len() != 1 || result.receipts.len() != 1 {
            return Ok(action_sheet_repair_failure(
                stored.parent_source.id.clone(),
                stored.parent_clip.id.clone(),
                outputs,
                "Game Asset action-sheet repair must return exactly one source artifact per cell",
            ));
        }
        let image = &result.images[0];
        let receipt = &result.receipts[0];
        if image.data.len() > MAX_OUTPUT_BASE64_CHARACTERS {
            return Ok(action_sheet_repair_failure(
                stored.parent_source.id.clone(),
                stored.parent_clip.id.clone(),
                outputs,
                "Game Asset action-sheet repair source exceeded its encoded byte budget",
            ));
        }
        let source_bytes = STANDARD.decode(&image.data).map_err(|_| {
            ProxyError::Request("Game Asset action-sheet repair source base64 is invalid".into())
        })?;
        if verify_receipt(receipt, &source_bytes).is_err()
            || receipt.request_id != role.request.request_id
            || receipt.run_id != stored.preview.run_id
            || receipt.provider_id != stored.preview.provider_id
            || receipt.model != stored.preview.model
            || receipt.semantic_role.as_deref() != Some(role.request.semantic_role.as_str())
            || receipt.node_id.as_deref() != Some(role.request.node_id.as_str())
            || receipt.capability_id.as_deref() != Some(role.request.capability_id.as_str())
            || receipt.accepted_reference_artifact_ids
                != role.request.accepted_reference_artifact_ids
            || receipt.lock_ids != role.request.lock_ids
            || receipt.artifact.media_type != image.media_type
        {
            return Ok(action_sheet_repair_failure(
                stored.parent_source.id.clone(),
                stored.parent_clip.id.clone(),
                outputs,
                "Game Asset action-sheet repair source receipt drifted from its previewed request",
            ));
        }
        let (processed_bytes, processing_evidence) = match deterministic_cutout(
            &source_bytes,
            &receipt.artifact.artifact_id,
            &receipt.artifact.sha256,
            &PixelSize {
                width: stored.plan.delivery.frame_width,
                height: stored.plan.delivery.frame_height,
            },
            &role.role.expected_alpha_size,
            &role.role.expected_anchor,
            &role.role.anchor,
        ) {
            Ok(value) => value,
            Err(error) => {
                let failure = error.to_string();
                return Ok(action_sheet_repair_failure_with_attempt(
                    stored.parent_source.id.clone(),
                    stored.parent_clip.id.clone(),
                    outputs,
                    Some(retained_action_sheet_repair_failure(
                        role.role.id.clone(),
                        receipt.clone(),
                        image.media_type.clone(),
                        image.data.clone(),
                        failure.clone(),
                    )),
                    failure,
                ));
            }
        };
        let pixel_evidence = match inspect_pixels(&processed_bytes, &role.role.anchor) {
            Ok(value) => value,
            Err(error) => {
                let failure = error.to_string();
                return Ok(action_sheet_repair_failure_with_attempt(
                    stored.parent_source.id.clone(),
                    stored.parent_clip.id.clone(),
                    outputs,
                    Some(retained_action_sheet_repair_failure(
                        role.role.id.clone(),
                        receipt.clone(),
                        image.media_type.clone(),
                        image.data.clone(),
                        failure.clone(),
                    )),
                    failure,
                ));
            }
        };
        outputs.push(RetainedActionSheetRepairOutput {
            role_id: role.role.id.clone(),
            receipt: receipt.clone(),
            source_media_type: image.media_type.clone(),
            source_artifact_bytes_base64: image.data.clone(),
            media_type: "image/png".into(),
            artifact_bytes_base64: STANDARD.encode(processed_bytes),
            processing_evidence,
            pixel_evidence,
        });
    }
    let completed_at = unix_millis()?;
    let authorization = issue_action_sheet_repair_authorization(
        &stored,
        execution_id,
        &outputs,
        started_at,
        completed_at,
    )?;
    Ok(GameAssetActionSheetRepairApplyResult {
        status: "succeeded".into(),
        parent_source_id: stored.parent_source.id,
        parent_clip_id: stored.parent_clip.id,
        outputs,
        failed_attempt: None,
        authorization: Some(authorization),
        error: None,
    })
}

fn action_sheet_partial_repair_failure(
    parent_source_id: String,
    parent_partial_id: String,
    outputs: Vec<RetainedActionSheetRepairOutput>,
    error: impl Into<String>,
) -> GameAssetActionSheetPartialRepairApplyResult {
    action_sheet_partial_repair_failure_with_attempt(
        parent_source_id,
        parent_partial_id,
        outputs,
        None,
        error,
    )
}

fn action_sheet_partial_repair_failure_with_attempt(
    parent_source_id: String,
    parent_partial_id: String,
    outputs: Vec<RetainedActionSheetRepairOutput>,
    failed_attempt: Option<RetainedActionSheetRepairFailure>,
    error: impl Into<String>,
) -> GameAssetActionSheetPartialRepairApplyResult {
    GameAssetActionSheetPartialRepairApplyResult {
        status: "failed".into(),
        parent_source_id,
        parent_partial_id,
        outputs,
        failed_attempt,
        authorization: None,
        error: Some(error.into()),
    }
}

async fn execute_stored_action_sheet_partial_repair<F, Fut>(
    stored: StoredActionSheetPartialRepairPreview,
    mut execute_role: F,
) -> Result<GameAssetActionSheetPartialRepairApplyResult, ProxyError>
where
    F: FnMut(GameAssetRoleExecution) -> Fut,
    Fut: Future<Output = Result<DashScopeImageResult, ProxyError>>,
{
    let execution_id = format!(
        "execution:game-asset-action-sheet-partial-repair:{}",
        uuid::Uuid::new_v4().simple()
    );
    let started_at = unix_millis()?;
    let mut outputs = Vec::with_capacity(stored.roles.len());
    for role in &stored.roles {
        let context = MultimodalHostContext {
            request_id: role.request.request_id.clone(),
            run_id: stored.preview.run_id.clone(),
            held_out_commitment_hash: None,
            semantic_role: Some(role.request.semantic_role.clone()),
            node_id: Some(role.request.node_id.clone()),
            capability_id: Some(role.request.capability_id.clone()),
            accepted_reference_artifact_ids: role.request.accepted_reference_artifact_ids.clone(),
            lock_ids: role.request.lock_ids.clone(),
        };
        let result = match tokio::time::timeout(
            Duration::from_secs(ROLE_TIMEOUT_SECS),
            execute_role(GameAssetRoleExecution {
                provider_id: stored.preview.provider_id.clone(),
                model: stored.preview.model.clone(),
                prompt: role.request.prompt.clone(),
                reference_bytes: role.reference_bytes.clone(),
                output_size: stored.preview.output_size.clone(),
                context,
            }),
        )
        .await
        {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => {
                return Ok(action_sheet_partial_repair_failure(
                    stored.parent_source.id.clone(),
                    stored.parent_partial.id.clone(),
                    outputs,
                    error.to_string(),
                ));
            }
            Err(_) => {
                return Ok(action_sheet_partial_repair_failure(
                    stored.parent_source.id.clone(),
                    stored.parent_partial.id.clone(),
                    outputs,
                    "Game Asset partial action-sheet repair generation timed out",
                ));
            }
        };
        if result.images.len() != 1 || result.receipts.len() != 1 {
            return Ok(action_sheet_partial_repair_failure(
                stored.parent_source.id.clone(),
                stored.parent_partial.id.clone(),
                outputs,
                "Game Asset partial action-sheet repair must return exactly one source artifact per cell",
            ));
        }
        let image = &result.images[0];
        let receipt = &result.receipts[0];
        if image.data.len() > MAX_OUTPUT_BASE64_CHARACTERS {
            return Ok(action_sheet_partial_repair_failure(
                stored.parent_source.id.clone(),
                stored.parent_partial.id.clone(),
                outputs,
                "Game Asset partial action-sheet repair source exceeded its encoded byte budget",
            ));
        }
        let source_bytes = STANDARD.decode(&image.data).map_err(|_| {
            ProxyError::Request(
                "Game Asset partial action-sheet repair source base64 is invalid".into(),
            )
        })?;
        if verify_receipt(receipt, &source_bytes).is_err()
            || receipt.request_id != role.request.request_id
            || receipt.run_id != stored.preview.run_id
            || receipt.provider_id != stored.preview.provider_id
            || receipt.model != stored.preview.model
            || receipt.semantic_role.as_deref() != Some(role.request.semantic_role.as_str())
            || receipt.node_id.as_deref() != Some(role.request.node_id.as_str())
            || receipt.capability_id.as_deref() != Some(role.request.capability_id.as_str())
            || receipt.accepted_reference_artifact_ids
                != role.request.accepted_reference_artifact_ids
            || receipt.lock_ids != role.request.lock_ids
            || receipt.artifact.media_type != image.media_type
        {
            return Ok(action_sheet_partial_repair_failure(
                stored.parent_source.id.clone(),
                stored.parent_partial.id.clone(),
                outputs,
                "Game Asset partial action-sheet repair source receipt drifted from its previewed request",
            ));
        }
        let (processed_bytes, processing_evidence) = match deterministic_cutout(
            &source_bytes,
            &receipt.artifact.artifact_id,
            &receipt.artifact.sha256,
            &PixelSize {
                width: stored.plan.delivery.frame_width,
                height: stored.plan.delivery.frame_height,
            },
            &role.role.expected_alpha_size,
            &role.role.expected_anchor,
            &role.role.anchor,
        ) {
            Ok(value) => value,
            Err(error) => {
                let failure = error.to_string();
                return Ok(action_sheet_partial_repair_failure_with_attempt(
                    stored.parent_source.id.clone(),
                    stored.parent_partial.id.clone(),
                    outputs,
                    Some(retained_action_sheet_repair_failure(
                        role.role.id.clone(),
                        receipt.clone(),
                        image.media_type.clone(),
                        image.data.clone(),
                        failure.clone(),
                    )),
                    failure,
                ));
            }
        };
        let pixel_evidence = match inspect_pixels(&processed_bytes, &role.role.anchor) {
            Ok(value) => value,
            Err(error) => {
                let failure = error.to_string();
                return Ok(action_sheet_partial_repair_failure_with_attempt(
                    stored.parent_source.id.clone(),
                    stored.parent_partial.id.clone(),
                    outputs,
                    Some(retained_action_sheet_repair_failure(
                        role.role.id.clone(),
                        receipt.clone(),
                        image.media_type.clone(),
                        image.data.clone(),
                        failure.clone(),
                    )),
                    failure,
                ));
            }
        };
        outputs.push(RetainedActionSheetRepairOutput {
            role_id: role.role.id.clone(),
            receipt: receipt.clone(),
            source_media_type: image.media_type.clone(),
            source_artifact_bytes_base64: image.data.clone(),
            media_type: "image/png".into(),
            artifact_bytes_base64: STANDARD.encode(processed_bytes),
            processing_evidence,
            pixel_evidence,
        });
    }
    let completed_at = unix_millis()?;
    let authorization = issue_action_sheet_partial_repair_authorization(
        &stored,
        execution_id,
        &outputs,
        started_at,
        completed_at,
    )?;
    Ok(GameAssetActionSheetPartialRepairApplyResult {
        status: "succeeded".into(),
        parent_source_id: stored.parent_source.id,
        parent_partial_id: stored.parent_partial.id,
        outputs,
        failed_attempt: None,
        authorization: Some(authorization),
        error: None,
    })
}

#[tauri::command]
pub async fn apply_game_asset_action_sheet_generation(
    app: AppHandle,
    state: State<'_, GameAssetGenerationState>,
    cancellations: State<'_, AiProxyCancellationState>,
    plan_id: String,
    request_id: Option<String>,
) -> Result<GameAssetActionSheetApplyResult, ProxyError> {
    let stored = state
        .action_sheet_previews
        .lock()
        .map_err(|_| {
            ProxyError::Request("Game Asset action-sheet preview state is unavailable".into())
        })?
        .remove(&plan_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset action-sheet preview is missing, expired, or already consumed".into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset action-sheet preview expired".into(),
        ));
    }
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        execute_stored_action_sheet_preview(stored, move |request| {
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

#[tauri::command]
pub async fn apply_game_asset_action_sheet_repair(
    app: AppHandle,
    state: State<'_, GameAssetGenerationState>,
    cancellations: State<'_, AiProxyCancellationState>,
    plan_id: String,
    request_id: Option<String>,
) -> Result<GameAssetActionSheetRepairApplyResult, ProxyError> {
    let stored = state
        .action_sheet_repair_previews
        .lock()
        .map_err(|_| {
            ProxyError::Request(
                "Game Asset action-sheet repair preview state is unavailable".into(),
            )
        })?
        .remove(&plan_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset action-sheet repair preview is missing, expired, or already consumed"
                    .into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair preview expired".into(),
        ));
    }
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        execute_stored_action_sheet_repair(stored, move |request| {
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

#[tauri::command]
pub async fn apply_game_asset_action_sheet_partial_repair(
    app: AppHandle,
    state: State<'_, GameAssetGenerationState>,
    cancellations: State<'_, AiProxyCancellationState>,
    plan_id: String,
    request_id: Option<String>,
) -> Result<GameAssetActionSheetPartialRepairApplyResult, ProxyError> {
    let stored = state
        .action_sheet_partial_repair_previews
        .lock()
        .map_err(|_| {
            ProxyError::Request(
                "Game Asset partial action-sheet repair preview state is unavailable".into(),
            )
        })?
        .remove(&plan_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset partial action-sheet repair preview is missing, expired, or already consumed"
                    .into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair preview expired".into(),
        ));
    }
    run_cancellable_proxy_request(&cancellations, request_id, async move {
        execute_stored_action_sheet_partial_repair(stored, move |request| {
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

#[tauri::command]
pub fn apply_game_asset_action_sheet_partial_reprocess(
    state: State<'_, GameAssetGenerationState>,
    plan_id: String,
) -> Result<GameAssetActionSheetPartialReprocessApplyResult, ProxyError> {
    let stored = state
        .action_sheet_partial_reprocess_previews
        .lock()
        .map_err(|_| {
            ProxyError::Request(
                "Game Asset partial action-sheet reprocess preview state is unavailable".into(),
            )
        })?
        .remove(&plan_id)
        .ok_or_else(|| {
            ProxyError::Request(
                "Game Asset partial action-sheet reprocess preview is missing, expired, or already consumed"
                    .into(),
            )
        })?;
    if stored.preview.expires_at <= unix_millis()? {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet reprocess preview expired".into(),
        ));
    }
    let started_at = unix_millis()?;
    let clip = derive_partial_reprocessed_clip(&stored)?;
    let completed_at = unix_millis()?;
    let authorization = issue_action_sheet_partial_reprocess_authorization(
        &stored,
        &clip,
        format!(
            "execution:game-asset-action-sheet-partial-reprocess:{}",
            uuid::Uuid::new_v4().simple()
        ),
        started_at,
        completed_at,
    )?;
    verify_action_sheet_partial_reprocess_authorization(
        authorization.clone(),
        stored.plan_value.clone(),
        stored.parent_authorization.clone(),
        stored.parent_source.clone(),
        stored.parent_partial.clone(),
        clip.clone(),
    )?;
    Ok(GameAssetActionSheetPartialReprocessApplyResult {
        status: "succeeded".into(),
        parent_source_id: stored.parent_source.id,
        parent_partial_id: stored.parent_partial.id,
        clip: Some(clip),
        authorization: Some(authorization),
        provider_calls: 0,
        error: None,
    })
}

fn verify_action_sheet_partial_authorization(
    authorization: GameAssetActionSheetPartialAuthorization,
    plan_value: Value,
    source: GameAssetActionSource,
    partial: GameAssetActionSheetPartial,
) -> Result<GameAssetActionSheetPartialAuthorization, ProxyError> {
    let plan: GamePlan = serde_json::from_value(plan_value.clone()).map_err(|_| {
        ProxyError::Request("Game Asset partial action-sheet verification plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    let role_ids = plan
        .roles
        .iter()
        .map(|role| role.id.clone())
        .collect::<Vec<_>>();
    if authorization.protocol != ACTION_SHEET_PARTIAL_AUTHORIZATION_PROTOCOL
        || authorization.status != "partial"
        || authorization.execution_mode != "byok-direct"
        || !MODELS.contains(&authorization.model.as_str())
        || !valid_hash(&authorization.family_plan_hash)
        || authorization.completed_at < authorization.started_at
        || authorization.game_plan_id != plan.id
        || authorization.game_plan_hash != canonical_hash(&plan_value)?
        || authorization.source_request.role_ids != role_ids
        || authorization.source_request.prompt_hash
            != sha256(authorization.source_request.prompt.as_bytes())
        || !valid_prompt(&authorization.source_request.prompt)
        || authorization.source_request.semantic_role != authorization.group_id
        || authorization.source_request.capability_id != "capability:image-generation"
        || source.version != ACTION_SOURCE_PROTOCOL
        || source.strategy != "coherent-grid"
        || source.splitter_implementation != ACTION_SHEET_SPLITTER_IMPLEMENTATION
        || source.family_plan_id != authorization.family_plan_id
        || source.group_id != authorization.group_id
        || partial.version != ACTION_SHEET_PARTIAL_PROTOCOL
        || partial.family_plan_id != authorization.family_plan_id
        || partial.group_id != authorization.group_id
        || partial.atomic_plan_id != plan.id
        || partial.atomic_plan_hash != authorization.game_plan_hash
        || partial.source_id != source.id
        || authorization.source_id != source.id
        || authorization.partial_id != partial.id
        || authorization.source_receipt_id != source.receipt.receipt_id
        || authorization.source_receipt_hash != source.receipt.receipt_hash
        || source.cells.len() != plan.roles.len()
        || partial.failures.is_empty()
        || partial.frames.len() + partial.failures.len() != plan.roles.len()
        || partial.frame_duration_ms != authorization.source_request.frame_duration_ms
        || partial.looping != authorization.source_request.looping
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet authorization closure is invalid".into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    let successful_role_ids = partial
        .frames
        .iter()
        .map(|frame| frame.role_id.clone())
        .collect::<Vec<_>>();
    let failed_role_ids = partial
        .failures
        .iter()
        .map(|failure| failure.role_id.clone())
        .collect::<Vec<_>>();
    let successful_set = successful_role_ids.iter().collect::<HashSet<_>>();
    let failed_set = failed_role_ids.iter().collect::<HashSet<_>>();
    if authorization.successful_role_ids != successful_role_ids
        || authorization.failed_role_ids != failed_role_ids
        || successful_set.len() != successful_role_ids.len()
        || failed_set.len() != failed_role_ids.len()
        || successful_set
            .iter()
            .any(|role_id| failed_set.contains(role_id))
        || successful_set
            .iter()
            .chain(failed_set.iter())
            .any(|role_id| !role_ids.contains(role_id))
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet role settlement is invalid".into(),
        ));
    }
    let source_bytes = verify_action_artifact(&source.source)?;
    verify_receipt(&source.receipt, &source_bytes)?;
    if source.receipt.request_id != authorization.source_request.request_id
        || source.receipt.run_id != authorization.run_id
        || source.receipt.provider_id != authorization.provider_id
        || source.receipt.model != authorization.model
        || source.receipt.semantic_role.as_deref()
            != Some(authorization.source_request.semantic_role.as_str())
        || source.receipt.node_id.as_deref() != Some(authorization.source_request.node_id.as_str())
        || source.receipt.capability_id.as_deref()
            != Some(authorization.source_request.capability_id.as_str())
        || source.receipt.accepted_reference_artifact_ids
            != authorization.source_request.accepted_reference_artifact_ids
        || source.receipt.lock_ids != authorization.source_request.lock_ids
        || source.receipt.artifact.artifact_id != source.source.artifact_id
        || source.receipt.artifact.sha256 != source.source.sha256
        || source.receipt.artifact.byte_length != source.source.byte_length
        || source.receipt.artifact.width != Some(source.source.decoded_width)
        || source.receipt.artifact.height != Some(source.source.decoded_height)
        || source.id != action_source_id(&source)?
        || partial.id != action_sheet_partial_id(&partial)?
    {
        return Err(ProxyError::Request(
            "Game Asset retained partial action source drifted from its native receipt".into(),
        ));
    }
    let (observed_grid, split_cells) = split_action_grid(
        &source_bytes,
        &authorization.source_request.grid,
        &plan.roles,
    )?;
    if observed_grid != source.grid {
        return Err(ProxyError::Request(
            "Game Asset retained partial action grid drifted from decoded source bytes".into(),
        ));
    }
    let frame_size = PixelSize {
        width: plan.delivery.frame_width,
        height: plan.delivery.frame_height,
    };
    let mut retained_bytes = source_bytes.len();
    for (role, (split, cell)) in plan.roles.iter().zip(split_cells.iter().zip(&source.cells)) {
        let cell_bytes = verify_action_artifact(&cell.artifact)?;
        let expected_cell = retained_action_artifact(
            &split.bytes,
            "image/png",
            observed_grid.cell_width,
            observed_grid.cell_height,
        )?;
        retained_bytes = retained_bytes
            .checked_add(cell_bytes.len())
            .ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset partial action-sheet byte accounting overflowed".into(),
                )
            })?;
        if retained_bytes > MAX_OUTPUT_BYTES {
            return Err(ProxyError::Request(
                "Game Asset retained partial action-sheet bytes exceed the output budget".into(),
            ));
        }
        if cell.role_id != role.id
            || split.role_id != role.id
            || cell.row != split.row
            || cell.column != split.column
            || cell.source_rectangle != split.source_rectangle
            || canonical_hash(&cell.artifact)? != canonical_hash(&expected_cell)?
            || cell_bytes != split.bytes
        {
            return Err(ProxyError::Request(
                "Game Asset retained partial action cell drifted from deterministic splitting"
                    .into(),
            ));
        }
        let signed_frame = partial.frames.iter().find(|frame| frame.role_id == role.id);
        let replay_implementation = signed_frame
            .map(|frame| frame.processing_evidence.implementation.as_str())
            .unwrap_or(CUTOUT_IMPLEMENTATION);
        let (bytes, processing_evidence) = match replay_deterministic_cutout(
            replay_implementation,
            &cell_bytes,
            &cell.artifact.artifact_id,
            &cell.artifact.sha256,
            &frame_size,
            &role.expected_alpha_size,
            &role.expected_anchor,
            &role.anchor,
        ) {
            Ok(value) => value,
            Err(error) => {
                let failure = partial
                    .failures
                    .iter()
                    .find(|failure| failure.role_id == role.id)
                    .ok_or_else(|| {
                        ProxyError::Request(
                            "Game Asset partial action-sheet omitted a rejected cell".into(),
                        )
                    })?;
                if failure.source_artifact_id != cell.artifact.artifact_id
                    || failure.code != "deterministic-cutout-rejected"
                    || failure.message != error.to_string()
                {
                    return Err(ProxyError::Request(
                        "Game Asset partial action failure cannot be reproduced from retained bytes"
                            .into(),
                    ));
                }
                continue;
            }
        };
        let pixel_evidence = match inspect_pixels(&bytes, &role.anchor) {
            Ok(value) => value,
            Err(error) => {
                let failure = partial
                    .failures
                    .iter()
                    .find(|failure| failure.role_id == role.id)
                    .ok_or_else(|| {
                        ProxyError::Request(
                            "Game Asset partial action-sheet omitted a rejected cell".into(),
                        )
                    })?;
                if failure.source_artifact_id != cell.artifact.artifact_id
                    || failure.code != "pixel-inspection-rejected"
                    || failure.message != error.to_string()
                {
                    return Err(ProxyError::Request(
                        "Game Asset partial action failure cannot be reproduced from retained bytes"
                            .into(),
                    ));
                }
                continue;
            }
        };
        let frame = signed_frame.ok_or_else(|| {
            ProxyError::Request(
                "Game Asset partial action-sheet omitted a reproducible frame".into(),
            )
        })?;
        retained_bytes = retained_bytes.checked_add(bytes.len()).ok_or_else(|| {
            ProxyError::Request("Game Asset partial action-sheet byte accounting overflowed".into())
        })?;
        if frame.source_artifact_id != cell.artifact.artifact_id
            || frame.artifact_id != format!("artifact:sha256:{}", frame.artifact_sha256)
            || sha256(&bytes) != frame.artifact_sha256
            || STANDARD
                .decode(&frame.artifact_bytes_base64)
                .ok()
                .as_deref()
                != Some(bytes.as_slice())
            || frame.duration_ms != partial.frame_duration_ms
            || frame.processing_evidence != processing_evidence
            || frame.pixel_evidence != pixel_evidence
            || frame.anchor != pixel_evidence.anchor
        {
            return Err(ProxyError::Request(
                "Game Asset partial action frame drifted from native processing evidence".into(),
            ));
        }
        if retained_bytes > MAX_OUTPUT_BYTES {
            return Err(ProxyError::Request(
                "Game Asset retained partial action-sheet bytes exceed the output budget".into(),
            ));
        }
    }
    Ok(authorization)
}

fn verify_action_sheet_partial_reprocess_authorization(
    authorization: GameAssetActionSheetPartialReprocessAuthorization,
    plan_value: Value,
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    clip: GameAssetActionClip,
) -> Result<GameAssetActionSheetPartialReprocessAuthorization, ProxyError> {
    let plan: GamePlan = serde_json::from_value(plan_value.clone()).map_err(|_| {
        ProxyError::Request("Game Asset partial action-sheet reprocess plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    verify_action_sheet_partial_authorization(
        parent_authorization.clone(),
        plan_value.clone(),
        parent_source.clone(),
        parent_partial.clone(),
    )?;
    let role_ids = plan
        .roles
        .iter()
        .map(|role| role.id.clone())
        .collect::<Vec<_>>();
    let reprocessed_role_ids = parent_partial
        .failures
        .iter()
        .map(|failure| failure.role_id.clone())
        .collect::<Vec<_>>();
    let expected_preserved = parent_partial
        .frames
        .iter()
        .map(|frame| PreservedActionSheetCellLineage {
            role_id: frame.role_id.clone(),
            source_artifact_id: frame.source_artifact_id.clone(),
            artifact_id: frame.artifact_id.clone(),
        })
        .collect::<Vec<_>>();
    if authorization.protocol != ACTION_SHEET_PARTIAL_REPROCESS_AUTHORIZATION_PROTOCOL
        || authorization.status != "succeeded"
        || authorization.execution_mode != "local-deterministic"
        || !matches!(
            authorization.processor_implementation.as_str(),
            V9_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
                | V10_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
                | SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
        )
        || authorization.provider_calls != 0
        || authorization.completed_at < authorization.started_at
        || !valid_id(&authorization.execution_id)
        || !valid_id(&authorization.run_id)
        || authorization.run_id == parent_authorization.run_id
        || authorization.identity != parent_authorization.identity
        || authorization.provider_id != parent_authorization.provider_id
        || authorization.model != parent_authorization.model
        || authorization.family_plan_id != parent_authorization.family_plan_id
        || authorization.family_plan_hash != parent_authorization.family_plan_hash
        || authorization.group_id != parent_authorization.group_id
        || authorization.game_plan_id != plan.id
        || authorization.game_plan_hash != canonical_hash(&plan_value)?
        || authorization.parent_authorization_receipt_id != parent_authorization.receipt_id
        || authorization.parent_authorization_receipt_hash != parent_authorization.receipt_hash
        || authorization.parent_source_id != parent_source.id
        || authorization.parent_partial_id != parent_partial.id
        || authorization.source_receipt_id != parent_source.receipt.receipt_id
        || authorization.source_receipt_hash != parent_source.receipt.receipt_hash
        || authorization.reprocessed_role_ids != reprocessed_role_ids
        || authorization.preserved_cells != expected_preserved
        || authorization.cells.len() != role_ids.len()
        || authorization.clip_id != clip.id
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet reprocess authorization closure is invalid".into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    let digest_value = serde_json::json!({
        "protocol": ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL,
        "parentAuthorizationReceiptId": parent_authorization.receipt_id,
        "parentAuthorizationReceiptHash": parent_authorization.receipt_hash,
        "parentSourceId": parent_source.id,
        "parentPartialId": parent_partial.id,
        "runId": authorization.run_id,
        "plan": plan_value,
        "roleIds": role_ids,
        "reprocessedRoleIds": reprocessed_role_ids,
        "processorImplementation": &authorization.processor_implementation,
        "providerCalls": 0,
        "executionMode": "local-deterministic",
    });
    let request_digest = canonical_hash(&digest_value)?;
    if authorization.request_digest != request_digest
        || authorization.plan_id
            != format!("game-asset-action-sheet-partial-reprocess-preview:sha256:{request_digest}")
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet reprocess preview identity drifted".into(),
        ));
    }
    let stored = StoredActionSheetPartialReprocessPreview {
        preview: GameAssetActionSheetPartialReprocessPreview {
            protocol: ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL.into(),
            plan_id: authorization.plan_id.clone(),
            request_digest: authorization.request_digest.clone(),
            run_id: authorization.run_id.clone(),
            parent_authorization_receipt_id: parent_authorization.receipt_id.clone(),
            parent_authorization_receipt_hash: parent_authorization.receipt_hash.clone(),
            parent_source_id: parent_source.id.clone(),
            parent_partial_id: parent_partial.id.clone(),
            family_plan_id: parent_authorization.family_plan_id.clone(),
            family_plan_hash: parent_authorization.family_plan_hash.clone(),
            group_id: parent_authorization.group_id.clone(),
            game_plan_id: plan.id.clone(),
            role_ids,
            reprocessed_role_ids,
            processor_implementation: authorization.processor_implementation.clone(),
            provider_calls: 0,
            expires_at: u64::MAX,
            execution_mode: "local-deterministic".into(),
        },
        parent_authorization,
        parent_source: parent_source.clone(),
        parent_partial,
        plan,
        plan_value,
    };
    let expected_clip = derive_partial_reprocessed_clip_with_implementation(
        &stored,
        &authorization.processor_implementation,
    )?;
    let expected_cells = action_sheet_authorized_cells(&parent_source, &expected_clip)?;
    if canonical_hash(&clip)? != canonical_hash(&expected_clip)?
        || clip.id != action_clip_id(&clip)?
        || authorization.cells != expected_cells
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet reprocess clip cannot be reproduced from its signed parent"
                .into(),
        ));
    }
    Ok(authorization)
}

fn verify_action_sheet_repair_authorization(
    authorization: GameAssetActionSheetRepairAuthorization,
    plan_value: Value,
    parent_authorization: GameAssetActionSheetAuthorization,
    parent_source: GameAssetActionSource,
    parent_clip: GameAssetActionClip,
    outputs: Vec<RetainedActionSheetRepairOutput>,
) -> Result<GameAssetActionSheetRepairAuthorization, ProxyError> {
    let plan: GamePlan = serde_json::from_value(plan_value.clone()).map_err(|_| {
        ProxyError::Request("Game Asset action-sheet repair verification plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    verify_action_sheet_authorization(
        parent_authorization.clone(),
        plan_value.clone(),
        parent_source.clone(),
        parent_clip.clone(),
    )?;
    if authorization.protocol != ACTION_SHEET_REPAIR_AUTHORIZATION_PROTOCOL
        || authorization.status != "succeeded"
        || authorization.execution_mode != "byok-direct"
        || !MODELS.contains(&authorization.model.as_str())
        || authorization.completed_at < authorization.started_at
        || authorization.run_id == parent_authorization.run_id
        || authorization.parent_authorization_receipt_id != parent_authorization.receipt_id
        || authorization.parent_authorization_receipt_hash != parent_authorization.receipt_hash
        || authorization.parent_source_id != parent_source.id
        || authorization.parent_clip_id != parent_clip.id
        || authorization.provider_id != parent_authorization.provider_id
        || authorization.model != parent_authorization.model
        || authorization.identity != parent_authorization.identity
        || authorization.game_plan_id != plan.id
        || authorization.game_plan_hash != canonical_hash(&plan_value)?
        || authorization.family_plan_id != parent_authorization.family_plan_id
        || authorization.family_plan_hash != parent_authorization.family_plan_hash
        || authorization.group_id != parent_authorization.group_id
        || authorization.outputs.len() != outputs.len()
        || authorization.outputs.len() != authorization.replacement_role_ids.len()
        || authorization.outputs.is_empty()
        || authorization.outputs.len() >= plan.roles.len()
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair authorization closure is invalid".into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    let role_ids = plan
        .roles
        .iter()
        .map(|role| role.id.clone())
        .collect::<HashSet<_>>();
    let replacement_ids = authorization
        .replacement_role_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    if replacement_ids.len() != authorization.replacement_role_ids.len()
        || replacement_ids.is_empty()
        || replacement_ids
            .iter()
            .any(|role_id| !role_ids.contains(role_id))
        || authorization.role_requests.len() != authorization.replacement_role_ids.len()
        || authorization
            .role_requests
            .iter()
            .map(|request| request.role_id.as_str())
            .collect::<Vec<_>>()
            != authorization
                .replacement_role_ids
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair replacement role closure is invalid".into(),
        ));
    }
    let expected_preserved = parent_source
        .cells
        .iter()
        .filter(|cell| !replacement_ids.contains(&cell.role_id))
        .map(|cell| {
            let frame = parent_clip
                .frames
                .iter()
                .find(|frame| frame.role_id == cell.role_id)
                .ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset action-sheet repair parent frame disappeared".into(),
                    )
                })?;
            Ok(PreservedActionSheetCellLineage {
                role_id: cell.role_id.clone(),
                source_artifact_id: cell.artifact.artifact_id.clone(),
                artifact_id: frame.artifact_id.clone(),
            })
        })
        .collect::<Result<Vec<_>, ProxyError>>()?;
    if authorization.preserved_cells != expected_preserved {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair preserved sibling lineage drifted".into(),
        ));
    }
    for ((request, authorized), output) in authorization
        .role_requests
        .iter()
        .zip(&authorization.outputs)
        .zip(&outputs)
    {
        let role = plan
            .roles
            .iter()
            .find(|role| role.id == request.role_id)
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet repair role disappeared".into())
            })?;
        verify_action_sheet_repair_reference_binding(request, &parent_source)?;
        if !valid_prompt(&request.prompt)
            || sha256(request.prompt.as_bytes()) != request.prompt_hash
            || request.capability_id != "capability:image-generation"
            || output.role_id != request.role_id
            || authorized.role_id != output.role_id
            || authorized.receipt_id != output.receipt.receipt_id
            || authorized.receipt_hash != output.receipt.receipt_hash
            || authorized.source_artifact_id != output.receipt.artifact.artifact_id
            || authorized.source_artifact_sha256 != output.receipt.artifact.sha256
            || output.source_media_type != output.receipt.artifact.media_type
            || output.media_type != "image/png"
        {
            return Err(ProxyError::Request(
                "Game Asset action-sheet repair output drifted from its request".into(),
            ));
        }
        let source_bytes = STANDARD
            .decode(&output.source_artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request(
                    "Game Asset action-sheet repair source base64 is invalid".into(),
                )
            })?;
        let processed_bytes = STANDARD
            .decode(&output.artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request(
                    "Game Asset action-sheet repair output base64 is invalid".into(),
                )
            })?;
        verify_receipt(&output.receipt, &source_bytes)?;
        if output.receipt.run_id != authorization.run_id
            || output.receipt.provider_id != authorization.provider_id
            || output.receipt.model != authorization.model
            || output.receipt.request_id != request.request_id
            || output.receipt.semantic_role.as_deref() != Some(request.semantic_role.as_str())
            || output.receipt.node_id.as_deref() != Some(request.node_id.as_str())
            || output.receipt.capability_id.as_deref() != Some(request.capability_id.as_str())
            || output.receipt.accepted_reference_artifact_ids
                != request.accepted_reference_artifact_ids
            || output.receipt.lock_ids != request.lock_ids
        {
            return Err(ProxyError::Request(
                "Game Asset action-sheet repair receipt drifted from its native request".into(),
            ));
        }
        let frame_size = PixelSize {
            width: plan.delivery.frame_width,
            height: plan.delivery.frame_height,
        };
        let (reprocessed, processing_evidence) = replay_deterministic_cutout(
            &output.processing_evidence.implementation,
            &source_bytes,
            &output.receipt.artifact.artifact_id,
            &output.receipt.artifact.sha256,
            &frame_size,
            &role.expected_alpha_size,
            &role.expected_anchor,
            &role.anchor,
        )?;
        let pixel_evidence = inspect_pixels(&processed_bytes, &role.anchor)?;
        if reprocessed != processed_bytes
            || processing_evidence != output.processing_evidence
            || pixel_evidence != output.pixel_evidence
            || authorized.artifact_id != output.processing_evidence.output_artifact_id
            || authorized.artifact_sha256 != output.processing_evidence.output_artifact_sha256
            || authorized.processing_evidence != output.processing_evidence
            || authorized.pixel_evidence != output.pixel_evidence
        {
            return Err(ProxyError::Request(
                "Game Asset action-sheet repair output cannot be reproduced from retained bytes"
                    .into(),
            ));
        }
    }
    Ok(authorization)
}

fn verify_action_sheet_partial_repair_authorization(
    authorization: GameAssetActionSheetPartialRepairAuthorization,
    plan_value: Value,
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    outputs: Vec<RetainedActionSheetRepairOutput>,
) -> Result<GameAssetActionSheetPartialRepairAuthorization, ProxyError> {
    let plan: GamePlan = serde_json::from_value(plan_value.clone()).map_err(|_| {
        ProxyError::Request(
            "Game Asset partial action-sheet repair verification plan is invalid".into(),
        )
    })?;
    validate_plan(&plan)?;
    verify_action_sheet_partial_authorization(
        parent_authorization.clone(),
        plan_value.clone(),
        parent_source.clone(),
        parent_partial.clone(),
    )?;
    let failed_role_ids = parent_partial
        .failures
        .iter()
        .map(|failure| failure.role_id.clone())
        .collect::<Vec<_>>();
    if authorization.protocol != ACTION_SHEET_PARTIAL_REPAIR_AUTHORIZATION_PROTOCOL
        || authorization.status != "succeeded"
        || authorization.execution_mode != "byok-direct"
        || !MODELS.contains(&authorization.model.as_str())
        || authorization.completed_at < authorization.started_at
        || authorization.run_id == parent_authorization.run_id
        || authorization.parent_authorization_receipt_id != parent_authorization.receipt_id
        || authorization.parent_authorization_receipt_hash != parent_authorization.receipt_hash
        || authorization.parent_source_id != parent_source.id
        || authorization.parent_partial_id != parent_partial.id
        || authorization.provider_id != parent_authorization.provider_id
        || authorization.model != parent_authorization.model
        || authorization.identity != parent_authorization.identity
        || authorization.game_plan_id != plan.id
        || authorization.game_plan_hash != canonical_hash(&plan_value)?
        || authorization.family_plan_id != parent_authorization.family_plan_id
        || authorization.family_plan_hash != parent_authorization.family_plan_hash
        || authorization.group_id != parent_authorization.group_id
        || authorization.replacement_role_ids != failed_role_ids
        || authorization.outputs.len() != outputs.len()
        || authorization.outputs.len() != failed_role_ids.len()
        || authorization.outputs.is_empty()
        || authorization.outputs.len() >= plan.roles.len()
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair authorization closure is invalid".into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    if authorization.role_requests.len() != failed_role_ids.len()
        || authorization
            .role_requests
            .iter()
            .map(|request| request.role_id.as_str())
            .collect::<Vec<_>>()
            != failed_role_ids
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
    {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair request closure is invalid".into(),
        ));
    }
    let expected_preserved = parent_partial
        .frames
        .iter()
        .map(|frame| PreservedActionSheetCellLineage {
            role_id: frame.role_id.clone(),
            source_artifact_id: frame.source_artifact_id.clone(),
            artifact_id: frame.artifact_id.clone(),
        })
        .collect::<Vec<_>>();
    if authorization.preserved_cells != expected_preserved {
        return Err(ProxyError::Request(
            "Game Asset partial action-sheet repair preserved sibling lineage drifted".into(),
        ));
    }
    for ((request, authorized), output) in authorization
        .role_requests
        .iter()
        .zip(&authorization.outputs)
        .zip(&outputs)
    {
        let role = plan
            .roles
            .iter()
            .find(|role| role.id == request.role_id)
            .ok_or_else(|| {
                ProxyError::Request(
                    "Game Asset partial action-sheet repair role disappeared".into(),
                )
            })?;
        verify_action_sheet_repair_reference_binding(request, &parent_source)?;
        if !valid_prompt(&request.prompt)
            || sha256(request.prompt.as_bytes()) != request.prompt_hash
            || request.capability_id != "capability:image-generation"
            || output.role_id != request.role_id
            || authorized.role_id != output.role_id
            || authorized.receipt_id != output.receipt.receipt_id
            || authorized.receipt_hash != output.receipt.receipt_hash
            || authorized.source_artifact_id != output.receipt.artifact.artifact_id
            || authorized.source_artifact_sha256 != output.receipt.artifact.sha256
            || output.source_media_type != output.receipt.artifact.media_type
            || output.media_type != "image/png"
        {
            return Err(ProxyError::Request(
                "Game Asset partial action-sheet repair output drifted from its request".into(),
            ));
        }
        let source_bytes = STANDARD
            .decode(&output.source_artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request(
                    "Game Asset partial action-sheet repair source base64 is invalid".into(),
                )
            })?;
        let processed_bytes = STANDARD
            .decode(&output.artifact_bytes_base64)
            .map_err(|_| {
                ProxyError::Request(
                    "Game Asset partial action-sheet repair output base64 is invalid".into(),
                )
            })?;
        verify_receipt(&output.receipt, &source_bytes)?;
        if output.receipt.run_id != authorization.run_id
            || output.receipt.provider_id != authorization.provider_id
            || output.receipt.model != authorization.model
            || output.receipt.request_id != request.request_id
            || output.receipt.semantic_role.as_deref() != Some(request.semantic_role.as_str())
            || output.receipt.node_id.as_deref() != Some(request.node_id.as_str())
            || output.receipt.capability_id.as_deref() != Some(request.capability_id.as_str())
            || output.receipt.accepted_reference_artifact_ids
                != request.accepted_reference_artifact_ids
            || output.receipt.lock_ids != request.lock_ids
        {
            return Err(ProxyError::Request(
                "Game Asset partial action-sheet repair receipt drifted from its native request"
                    .into(),
            ));
        }
        let frame_size = PixelSize {
            width: plan.delivery.frame_width,
            height: plan.delivery.frame_height,
        };
        let (reprocessed, processing_evidence) = replay_deterministic_cutout(
            &output.processing_evidence.implementation,
            &source_bytes,
            &output.receipt.artifact.artifact_id,
            &output.receipt.artifact.sha256,
            &frame_size,
            &role.expected_alpha_size,
            &role.expected_anchor,
            &role.anchor,
        )?;
        let pixel_evidence = inspect_pixels(&processed_bytes, &role.anchor)?;
        if reprocessed != processed_bytes
            || processing_evidence != output.processing_evidence
            || pixel_evidence != output.pixel_evidence
            || authorized.artifact_id != output.processing_evidence.output_artifact_id
            || authorized.artifact_sha256 != output.processing_evidence.output_artifact_sha256
            || authorized.processing_evidence != output.processing_evidence
            || authorized.pixel_evidence != output.pixel_evidence
        {
            return Err(ProxyError::Request(
                "Game Asset partial action-sheet repair output cannot be reproduced from retained bytes"
                    .into(),
            ));
        }
    }
    Ok(authorization)
}

fn verify_action_artifact(artifact: &RetainedActionArtifact) -> Result<Vec<u8>, ProxyError> {
    if artifact.bytes_base64.len() > MAX_OUTPUT_BASE64_CHARACTERS {
        return Err(ProxyError::Request(
            "Game Asset retained action artifact exceeds its encoded budget".into(),
        ));
    }
    let bytes = STANDARD.decode(&artifact.bytes_base64).map_err(|_| {
        ProxyError::Request("Game Asset retained action artifact base64 is invalid".into())
    })?;
    let decoded = decode_bounded_image(&bytes)?;
    if bytes.len() != artifact.byte_length
        || sha256(&bytes) != artifact.sha256
        || artifact.artifact_id != format!("artifact:sha256:{}", artifact.sha256)
        || detect_media(&bytes) != Some(artifact.media_type.as_str())
        || decoded.width() != artifact.decoded_width
        || decoded.height() != artifact.decoded_height
    {
        return Err(ProxyError::Request(
            "Game Asset retained action artifact bytes do not match their identity".into(),
        ));
    }
    Ok(bytes)
}

fn verify_action_sheet_repair_reference_binding(
    request: &AuthorizedRoleRequest,
    parent_source: &GameAssetActionSource,
) -> Result<(), ProxyError> {
    let cell = parent_source
        .cells
        .iter()
        .find(|cell| cell.role_id == request.role_id)
        .ok_or_else(|| {
            ProxyError::Request("Game Asset action-sheet repair reference cell disappeared".into())
        })?;
    let composition_lock = action_sheet_repair_composition_lock_id();
    let has_composition_lock = request
        .lock_ids
        .iter()
        .any(|lock_id| lock_id == &composition_lock);
    if request.lock_ids.iter().any(|lock_id| {
        lock_id.starts_with("game-asset-action-sheet-repair-composition:")
            && lock_id != &composition_lock
    }) {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair composition implementation is unsupported".into(),
        ));
    }
    let second_artifact_id = if has_composition_lock {
        let cell_bytes = verify_action_artifact(&cell.artifact)?;
        let composition_reference = action_sheet_repair_composition_reference(&cell_bytes)?;
        format!("artifact:sha256:{}", sha256(&composition_reference))
    } else {
        cell.artifact.artifact_id.clone()
    };
    if request.accepted_reference_artifact_ids
        != [parent_source.source.artifact_id.clone(), second_artifact_id]
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet repair references drifted from native conditioning".into(),
        ));
    }
    Ok(())
}

fn verify_action_sheet_authorization(
    authorization: GameAssetActionSheetAuthorization,
    plan_value: Value,
    source: GameAssetActionSource,
    clip: GameAssetActionClip,
) -> Result<GameAssetActionSheetAuthorization, ProxyError> {
    let plan: GamePlan = serde_json::from_value(plan_value.clone()).map_err(|_| {
        ProxyError::Request("Game Asset action-sheet verification plan is invalid".into())
    })?;
    validate_plan(&plan)?;
    if authorization.protocol != ACTION_SHEET_AUTHORIZATION_PROTOCOL
        || authorization.status != "succeeded"
        || authorization.execution_mode != "byok-direct"
        || !MODELS.contains(&authorization.model.as_str())
        || !valid_hash(&authorization.family_plan_hash)
        || authorization.completed_at < authorization.started_at
        || authorization.game_plan_id != plan.id
        || authorization.game_plan_hash != canonical_hash(&plan_value)?
        || authorization.source_request.role_ids
            != plan
                .roles
                .iter()
                .map(|role| role.id.clone())
                .collect::<Vec<_>>()
        || authorization.source_request.prompt_hash
            != sha256(authorization.source_request.prompt.as_bytes())
        || !valid_prompt(&authorization.source_request.prompt)
        || authorization.source_request.semantic_role != authorization.group_id
        || authorization.source_request.capability_id != "capability:image-generation"
        || source.version != ACTION_SOURCE_PROTOCOL
        || source.strategy != "coherent-grid"
        || source.splitter_implementation != ACTION_SHEET_SPLITTER_IMPLEMENTATION
        || source.family_plan_id != authorization.family_plan_id
        || source.group_id != authorization.group_id
        || clip.version != ACTION_CLIP_PROTOCOL
        || clip.family_plan_id != authorization.family_plan_id
        || clip.group_id != authorization.group_id
        || clip.atomic_plan_id != plan.id
        || clip.atomic_plan_hash != authorization.game_plan_hash
        || clip.source_id != source.id
        || authorization.source_id != source.id
        || authorization.clip_id != clip.id
        || authorization.source_receipt_id != source.receipt.receipt_id
        || authorization.source_receipt_hash != source.receipt.receipt_hash
        || source.cells.len() != plan.roles.len()
        || clip.frames.len() != plan.roles.len()
        || authorization.cells.len() != plan.roles.len()
    {
        return Err(ProxyError::Request(
            "Game Asset action-sheet authorization closure is invalid".into(),
        ));
    }
    verify_host_payload(
        &authorization.payload(),
        &authorization.receipt_hash,
        &authorization.signature,
    )?;
    let source_bytes = verify_action_artifact(&source.source)?;
    verify_receipt(&source.receipt, &source_bytes)?;
    if source.receipt.request_id != authorization.source_request.request_id
        || source.receipt.run_id != authorization.run_id
        || source.receipt.provider_id != authorization.provider_id
        || source.receipt.model != authorization.model
        || source.receipt.semantic_role.as_deref()
            != Some(authorization.source_request.semantic_role.as_str())
        || source.receipt.node_id.as_deref() != Some(authorization.source_request.node_id.as_str())
        || source.receipt.capability_id.as_deref()
            != Some(authorization.source_request.capability_id.as_str())
        || source.receipt.accepted_reference_artifact_ids
            != authorization.source_request.accepted_reference_artifact_ids
        || source.receipt.lock_ids != authorization.source_request.lock_ids
        || source.receipt.artifact.artifact_id != source.source.artifact_id
        || source.receipt.artifact.sha256 != source.source.sha256
        || source.receipt.artifact.byte_length != source.source.byte_length
        || source.receipt.artifact.width != Some(source.source.decoded_width)
        || source.receipt.artifact.height != Some(source.source.decoded_height)
        || source.id != action_source_id(&source)?
        || clip.id != action_clip_id(&clip)?
    {
        return Err(ProxyError::Request(
            "Game Asset retained action source drifted from its native receipt".into(),
        ));
    }
    let requested_grid = &authorization.source_request.grid;
    let (observed_grid, split_cells) =
        split_action_grid(&source_bytes, requested_grid, &plan.roles)?;
    if observed_grid != source.grid {
        return Err(ProxyError::Request(
            "Game Asset retained action grid drifted from decoded source bytes".into(),
        ));
    }
    let frame_size = PixelSize {
        width: plan.delivery.frame_width,
        height: plan.delivery.frame_height,
    };
    let mut retained_bytes = source_bytes.len();
    for (index, ((role, split), (cell, frame))) in plan
        .roles
        .iter()
        .zip(&split_cells)
        .zip(source.cells.iter().zip(&clip.frames))
        .enumerate()
    {
        let cell_bytes = verify_action_artifact(&cell.artifact)?;
        let expected_cell = retained_action_artifact(
            &split.bytes,
            "image/png",
            observed_grid.cell_width,
            observed_grid.cell_height,
        )?;
        retained_bytes = retained_bytes
            .checked_add(cell_bytes.len())
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet byte accounting overflowed".into())
            })?;
        if cell.role_id != role.id
            || split.role_id != role.id
            || cell.row != split.row
            || cell.column != split.column
            || cell.source_rectangle != split.source_rectangle
            || canonical_hash(&cell.artifact)? != canonical_hash(&expected_cell)?
            || cell_bytes != split.bytes
            || frame.role_id != role.id
            || frame.source_artifact_id != cell.artifact.artifact_id
            || frame.duration_ms != authorization.source_request.frame_duration_ms
        {
            return Err(ProxyError::Request(
                "Game Asset retained action cell drifted from deterministic splitting".into(),
            ));
        }
        let processed_bytes = STANDARD
            .decode(&frame.artifact_bytes_base64)
            .map_err(|_| ProxyError::Request("Game Asset action frame base64 is invalid".into()))?;
        retained_bytes = retained_bytes
            .checked_add(processed_bytes.len())
            .ok_or_else(|| {
                ProxyError::Request("Game Asset action-sheet byte accounting overflowed".into())
            })?;
        if retained_bytes > MAX_OUTPUT_BYTES {
            return Err(ProxyError::Request(
                "Game Asset retained action-sheet bytes exceed the output budget".into(),
            ));
        }
        let (reprocessed_bytes, processing_evidence) = replay_deterministic_cutout(
            &frame.processing_evidence.implementation,
            &cell_bytes,
            &cell.artifact.artifact_id,
            &cell.artifact.sha256,
            &frame_size,
            &role.expected_alpha_size,
            &role.expected_anchor,
            &role.anchor,
        )?;
        let pixel_evidence = inspect_pixels(&processed_bytes, &role.anchor)?;
        let authorized = &authorization.cells[index];
        if processed_bytes != reprocessed_bytes
            || frame.artifact_id != format!("artifact:sha256:{}", frame.artifact_sha256)
            || sha256(&processed_bytes) != frame.artifact_sha256
            || frame.processing_evidence != processing_evidence
            || frame.pixel_evidence != pixel_evidence
            || frame.anchor != pixel_evidence.anchor
            || authorized.role_id != role.id
            || authorized.row != cell.row
            || authorized.column != cell.column
            || authorized.source_rectangle != cell.source_rectangle
            || authorized.source_artifact_id != cell.artifact.artifact_id
            || authorized.source_artifact_sha256 != cell.artifact.sha256
            || authorized.artifact_id != frame.artifact_id
            || authorized.artifact_sha256 != frame.artifact_sha256
            || authorized.processing_evidence != frame.processing_evidence
            || authorized.pixel_evidence != frame.pixel_evidence
        {
            return Err(ProxyError::Request(
                "Game Asset retained action frame drifted from native processing evidence".into(),
            ));
        }
    }
    Ok(authorization)
}

#[tauri::command]
pub fn verify_game_asset_action_sheet_authorization(
    authorization: GameAssetActionSheetAuthorization,
    plan: Value,
    source: GameAssetActionSource,
    clip: GameAssetActionClip,
) -> Result<GameAssetActionSheetAuthorization, ProxyError> {
    verify_action_sheet_authorization(authorization, plan, source, clip)
}

#[tauri::command]
pub fn verify_game_asset_action_sheet_partial_authorization(
    authorization: GameAssetActionSheetPartialAuthorization,
    plan: Value,
    source: GameAssetActionSource,
    partial: GameAssetActionSheetPartial,
) -> Result<GameAssetActionSheetPartialAuthorization, ProxyError> {
    verify_action_sheet_partial_authorization(authorization, plan, source, partial)
}

#[tauri::command]
pub fn verify_game_asset_action_sheet_repair_authorization(
    authorization: GameAssetActionSheetRepairAuthorization,
    plan: Value,
    parent_authorization: GameAssetActionSheetAuthorization,
    parent_source: GameAssetActionSource,
    parent_clip: GameAssetActionClip,
    outputs: Vec<RetainedActionSheetRepairOutput>,
) -> Result<GameAssetActionSheetRepairAuthorization, ProxyError> {
    verify_action_sheet_repair_authorization(
        authorization,
        plan,
        parent_authorization,
        parent_source,
        parent_clip,
        outputs,
    )
}

#[tauri::command]
pub fn verify_game_asset_action_sheet_partial_repair_authorization(
    authorization: GameAssetActionSheetPartialRepairAuthorization,
    plan: Value,
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    outputs: Vec<RetainedActionSheetRepairOutput>,
) -> Result<GameAssetActionSheetPartialRepairAuthorization, ProxyError> {
    verify_action_sheet_partial_repair_authorization(
        authorization,
        plan,
        parent_authorization,
        parent_source,
        parent_partial,
        outputs,
    )
}

#[tauri::command]
pub fn verify_game_asset_action_sheet_partial_reprocess_authorization(
    authorization: GameAssetActionSheetPartialReprocessAuthorization,
    plan: Value,
    parent_authorization: GameAssetActionSheetPartialAuthorization,
    parent_source: GameAssetActionSource,
    parent_partial: GameAssetActionSheetPartial,
    clip: GameAssetActionClip,
) -> Result<GameAssetActionSheetPartialReprocessAuthorization, ProxyError> {
    verify_action_sheet_partial_reprocess_authorization(
        authorization,
        plan,
        parent_authorization,
        parent_source,
        parent_partial,
        clip,
    )
}

fn verify_generation_authorization(
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
) -> Result<GameAssetGenerationAuthorization, ProxyError> {
    if !matches!(
        authorization.protocol.as_str(),
        AUTHORIZATION_PROTOCOL
            | LEGACY_REPAIR_AUTHORIZATION_PROTOCOL
            | REPAIR_AUTHORIZATION_PROTOCOL
    ) || authorization.status != "succeeded"
        || !MODELS.contains(&authorization.model.as_str())
        || !matches!(
            authorization.processor_implementation.as_str(),
            LEGACY_CUTOUT_IMPLEMENTATION
                | WHITE_BOARD_CUTOUT_IMPLEMENTATION
                | ADAPTIVE_BOARD_CUTOUT_IMPLEMENTATION
                | CHROMA_ML_CUTOUT_IMPLEMENTATION
                | V5_CUTOUT_IMPLEMENTATION
                | V6_CUTOUT_IMPLEMENTATION
                | CUTOUT_IMPLEMENTATION
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
    let repair_lineage = match authorization.protocol.as_str() {
        AUTHORIZATION_PROTOCOL if authorization.repair_lineage.is_none() => None,
        LEGACY_REPAIR_AUTHORIZATION_PROTOCOL | REPAIR_AUTHORIZATION_PROTOCOL => {
            let lineage = authorization.repair_lineage.as_ref().ok_or_else(|| {
                ProxyError::Request("Game Asset repair authorization lacks parent lineage".into())
            })?;
            if !matches!(
                authorization.processor_implementation.as_str(),
                V5_CUTOUT_IMPLEMENTATION | V6_CUTOUT_IMPLEMENTATION | CUTOUT_IMPLEMENTATION
            ) {
                return Err(ProxyError::Request(
                    "Game Asset repair authorization must use a signed repair processor".into(),
                ));
            }
            let role_ids = authorization
                .role_requests
                .iter()
                .map(|request| request.role_id.as_str())
                .collect::<HashSet<_>>();
            let replaced = lineage
                .replaced_role_ids
                .iter()
                .map(String::as_str)
                .collect::<HashSet<_>>();
            let preserved = lineage
                .preserved_roles
                .iter()
                .map(|role| role.role_id.as_str())
                .collect::<HashSet<_>>();
            if !valid_id(&lineage.parent_receipt_id)
                || !valid_hash(&lineage.parent_receipt_hash)
                || lineage.parent_receipt_id == authorization.receipt_id
                || replaced.is_empty()
                || preserved.is_empty()
                || replaced.len() != lineage.replaced_role_ids.len()
                || preserved.len() != lineage.preserved_roles.len()
                || replaced.len() + preserved.len() != role_ids.len()
                || replaced.iter().any(|role_id| preserved.contains(role_id))
                || replaced
                    .iter()
                    .chain(preserved.iter())
                    .any(|role_id| !role_ids.contains(role_id))
                || lineage.preserved_roles.iter().any(|role| {
                    !valid_id(&role.role_id)
                        || !valid_id(&role.origin_run_id)
                        || !valid_id(&role.request_id)
                        || !valid_id(&role.receipt_id)
                        || !valid_id(&role.source_artifact_id)
                        || !valid_id(&role.artifact_id)
                })
            {
                return Err(ProxyError::Request(
                    "Game Asset repair authorization lineage is invalid".into(),
                ));
            }
            Some(lineage)
        }
        _ => {
            return Err(ProxyError::Request(
                "Game Asset generation authorization protocol and lineage disagree".into(),
            ))
        }
    };
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
        let expected_run_id = if let Some(lineage) = repair_lineage {
            if lineage
                .replaced_role_ids
                .iter()
                .any(|role_id| role_id == &output.role_id)
            {
                authorization.run_id.as_str()
            } else {
                let preserved = lineage
                    .preserved_roles
                    .iter()
                    .find(|role| role.role_id == output.role_id)
                    .ok_or_else(|| {
                        ProxyError::Request(
                            "Game Asset retained output has no repair lineage role".into(),
                        )
                    })?;
                if preserved.request_id != request.request_id
                    || preserved.receipt_id != output.receipt.receipt_id
                    || preserved.source_artifact_id != output.receipt.artifact.artifact_id
                    || preserved.artifact_id != output.processing_evidence.output_artifact_id
                {
                    return Err(ProxyError::Request(
                        "Game Asset preserved output drifted from its repair lineage".into(),
                    ));
                }
                preserved.origin_run_id.as_str()
            }
        } else {
            authorization.run_id.as_str()
        };
        if sha256(request.prompt.as_bytes()) != request.prompt_hash
            || output.receipt.request_id != request.request_id
            || output.receipt.run_id != expected_run_id
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
            || output.processing_evidence.implementation != authorization.processor_implementation
        {
            return Err(ProxyError::Request(
                "Game Asset retained output drifted from its approved role request".into(),
            ));
        }
        let (reprocessed_bytes, processing_evidence) = if authorization.processor_implementation
            == LEGACY_CUTOUT_IMPLEMENTATION
        {
            deterministic_cutout_legacy(
                &source_bytes,
                &output.receipt.artifact.artifact_id,
                &output.receipt.artifact.sha256,
            )?
        } else {
            let frame_size = output
                .processing_evidence
                .frame_size
                .as_ref()
                .ok_or_else(|| {
                    ProxyError::Request(
                        "Game Asset normalized output is missing its frame geometry".into(),
                    )
                })?;
            let alpha_target = output
                .processing_evidence
                .alpha_target
                .as_ref()
                .ok_or_else(|| {
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
            if authorization.output_size != format!("{}x{}", frame_size.width, frame_size.height)
                || anchor_policy != request.anchor_policy
                || output.processing_evidence.scale_policy.as_deref() != Some(CUTOUT_SCALE_POLICY)
            {
                return Err(ProxyError::Request(
                    "Game Asset normalized output drifted from its authorized geometry".into(),
                ));
            }
            replay_deterministic_cutout(
                &authorization.processor_implementation,
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
    verify_semantic_acceptance_closure(acceptance, &authorization)
}

fn verify_semantic_acceptance_closure(
    acceptance: GameAssetSemanticAcceptance,
    authorization: &GameAssetGenerationAuthorization,
) -> Result<GameAssetSemanticAcceptance, ProxyError> {
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

fn action_timing(action: &str) -> Result<(u32, bool), ProxyError> {
    match action {
        "single" => Ok((1_000, false)),
        "idle" => Ok((160, true)),
        "walk" => Ok((120, true)),
        "run" => Ok((90, true)),
        "attack" | "shoot" => Ok((90, false)),
        "cast" => Ok((110, false)),
        "jump" | "hurt" => Ok((120, false)),
        "death" => Ok((140, false)),
        "hover" => Ok((130, true)),
        "charge" => Ok((100, true)),
        "projectile" => Ok((80, true)),
        "impact" => Ok((70, false)),
        "explode" => Ok((80, false)),
        _ => Err(ProxyError::Request(
            "Game Asset bundle contains an unsupported action timing".into(),
        )),
    }
}

fn compile_game_asset_bundle(
    plan_value: Value,
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
    semantic_acceptance: Option<GameAssetSemanticAcceptance>,
) -> Result<CompiledGameAssetBundle, ProxyError> {
    let plan: GamePlan = serde_json::from_value(plan_value.clone())
        .map_err(|_| ProxyError::Request("Game Asset bundle plan is invalid".into()))?;
    validate_plan(&plan)?;
    let authorization = verify_generation_authorization(authorization, outputs.clone())?;
    let plan_hash = canonical_hash(&plan_value)?;
    if authorization.game_plan_id != plan.id
        || authorization.game_plan_hash != plan_hash
        || authorization.role_requests.len() != plan.roles.len()
        || authorization
            .role_requests
            .iter()
            .zip(&plan.roles)
            .any(|(request, role)| request.role_id != role.id)
    {
        return Err(ProxyError::Request(
            "Game Asset bundle plan drifted from its signed generation authorization".into(),
        ));
    }

    let semantic_acceptance = semantic_acceptance
        .map(|acceptance| verify_semantic_acceptance_closure(acceptance, &authorization))
        .transpose()?;
    let delivery_status = if semantic_acceptance.is_some() {
        "accepted"
    } else {
        "candidate"
    };

    let atlas_width = plan
        .delivery
        .frame_width
        .checked_mul(plan.delivery.columns)
        .ok_or_else(|| ProxyError::Request("Game Asset atlas width overflowed".into()))?;
    let atlas_height = plan
        .delivery
        .frame_height
        .checked_mul(plan.delivery.rows)
        .ok_or_else(|| ProxyError::Request("Game Asset atlas height overflowed".into()))?;
    if atlas_width > MAX_IMAGE_DIMENSION
        || atlas_height > MAX_IMAGE_DIMENSION
        || u64::from(atlas_width) * u64::from(atlas_height) > MAX_IMAGE_PIXELS
    {
        return Err(ProxyError::Request(
            "Game Asset atlas exceeds the bounded raster contract".into(),
        ));
    }

    let mut atlas =
        image::RgbaImage::from_pixel(atlas_width, atlas_height, image::Rgba([0, 0, 0, 0]));
    let mut frames = Vec::with_capacity(plan.roles.len());
    for (ordinal, ((role, output), authorized)) in plan
        .roles
        .iter()
        .zip(&outputs)
        .zip(&authorization.outputs)
        .enumerate()
    {
        if role.id != output.role_id || role.id != authorized.role_id {
            return Err(ProxyError::Request(
                "Game Asset bundle role order drifted from the retained output closure".into(),
            ));
        }
        let bytes = STANDARD
            .decode(&output.artifact_bytes_base64)
            .map_err(|_| ProxyError::Request("Game Asset bundle frame base64 is invalid".into()))?;
        let decoded = image::load_from_memory(&bytes)
            .map_err(|_| {
                ProxyError::Request("Game Asset bundle frame is not a decodable image".into())
            })?
            .to_rgba8();
        if decoded.width() != plan.delivery.frame_width
            || decoded.height() != plan.delivery.frame_height
        {
            return Err(ProxyError::Request(
                "Game Asset bundle frame dimensions differ from the delivery plan".into(),
            ));
        }
        let column = ordinal as u32 % plan.delivery.columns;
        let row = ordinal as u32 / plan.delivery.columns;
        let cell_x = column * plan.delivery.frame_width;
        let cell_y = row * plan.delivery.frame_height;
        for (x, y, pixel) in decoded.enumerate_pixels() {
            atlas.put_pixel(cell_x + x, cell_y + y, *pixel);
        }
        let (duration_ms, _) = action_timing(&role.action)?;
        frames.push(GameAssetBundleFrame {
            role_id: role.id.clone(),
            action: role.action.clone(),
            direction: role.direction.clone(),
            frame_index: role.frame_index,
            duration_ms,
            cell: GameAssetBundleCell {
                x: cell_x,
                y: cell_y,
                width: plan.delivery.frame_width,
                height: plan.delivery.frame_height,
            },
            anchor: authorized.pixel_evidence.anchor.clone(),
            artifact_id: authorized.artifact_id.clone(),
            artifact_sha256: authorized.artifact_sha256.clone(),
        });
    }

    let mut animations: Vec<GameAssetBundleAnimation> = Vec::new();
    for role in &plan.roles {
        let animation = if let Some(index) = animations.iter().position(|candidate| {
            candidate.action == role.action && candidate.direction == role.direction
        }) {
            &mut animations[index]
        } else {
            let (frame_duration_ms, looping) = action_timing(&role.action)?;
            animations.push(GameAssetBundleAnimation {
                id: format!(
                    "animation:sha256:{}",
                    canonical_hash(&serde_json::json!({
                        "assetId": &plan.asset_id,
                        "action": &role.action,
                        "direction": &role.direction,
                    }))?
                ),
                action: role.action.clone(),
                direction: role.direction.clone(),
                frame_duration_ms,
                looping,
                role_ids: Vec::new(),
            });
            animations.last_mut().expect("animation was just inserted")
        };
        animation.role_ids.push(role.id.clone());
    }
    for animation in &mut animations {
        animation.role_ids.sort_by_key(|role_id| {
            plan.roles
                .iter()
                .find(|role| &role.id == role_id)
                .map(|role| role.frame_index)
                .unwrap_or(u32::MAX)
        });
        if animation
            .role_ids
            .iter()
            .enumerate()
            .any(|(index, role_id)| {
                plan.roles
                    .iter()
                    .find(|role| &role.id == role_id)
                    .is_none_or(|role| role.frame_index != index as u32)
            })
        {
            return Err(ProxyError::Request(
                "Game Asset animation frame indices must be contiguous from zero".into(),
            ));
        }
    }

    let atlas_bytes = encode_cutout_png(&atlas)?;
    if atlas_bytes.len() > MAX_ATLAS_BYTES {
        return Err(ProxyError::Request(
            "Game Asset atlas exceeds the encoded byte budget".into(),
        ));
    }
    let atlas_hash = sha256(&atlas_bytes);
    let manifest = GameAssetBundleManifest {
        version: BUNDLE_PROTOCOL.into(),
        delivery_status: delivery_status.into(),
        compiler_implementation: BUNDLE_COMPILER_IMPLEMENTATION.into(),
        timing_policy: BUNDLE_TIMING_POLICY.into(),
        asset_id: plan.asset_id,
        plan_id: plan.id,
        plan_hash,
        generation: GameAssetBundleGenerationReference {
            receipt_id: authorization.receipt_id,
            receipt_hash: authorization.receipt_hash,
            preview_id: authorization.plan_id,
            run_id: authorization.run_id,
        },
        semantic_acceptance: semantic_acceptance.map(|acceptance| {
            GameAssetBundleEvidenceReference {
                receipt_id: acceptance.receipt_id,
                receipt_hash: acceptance.receipt_hash,
            }
        }),
        atlas: GameAssetBundleAtlas {
            logical_path: "atlas.png".into(),
            artifact_id: format!("artifact:sha256:{atlas_hash}"),
            sha256: atlas_hash,
            media_type: "image/png".into(),
            byte_length: atlas_bytes.len(),
            width: atlas_width,
            height: atlas_height,
            columns: plan.delivery.columns,
            rows: plan.delivery.rows,
        },
        frames,
        animations,
    };
    let manifest_bytes = canonical_portable_bytes(&manifest)?;
    let bundle_hash = sha256(&manifest_bytes);
    Ok(CompiledGameAssetBundle {
        protocol: BUNDLE_PROTOCOL.into(),
        bundle_id: format!("game-asset-bundle:sha256:{bundle_hash}"),
        bundle_hash,
        delivery_status: delivery_status.into(),
        manifest_logical_path: "manifest.json".into(),
        manifest_media_type: "application/json".into(),
        manifest_byte_length: manifest_bytes.len(),
        manifest_bytes_base64: STANDARD.encode(manifest_bytes),
        atlas_bytes_base64: STANDARD.encode(atlas_bytes),
        manifest,
    })
}

#[tauri::command]
pub async fn compile_game_asset_production_bundle(
    plan: Value,
    authorization: GameAssetGenerationAuthorization,
    outputs: Vec<RetainedRoleOutput>,
    semantic_acceptance: Option<GameAssetSemanticAcceptance>,
) -> Result<CompiledGameAssetBundle, ProxyError> {
    compile_game_asset_bundle(plan, authorization, outputs, semantic_acceptance)
}

#[cfg(test)]
mod tests {
    use super::super::multimodal_receipt::{
        artifact_evidence, install_ephemeral_test_signing_key, issue_receipt,
    };
    use super::*;

    /// A retained real request names its own model; the Provider record no
    /// longer carries one. The remaining guard is that the connection's probed
    /// catalog still proves the model is reachable. An unprobed connection
    /// (`catalog: None`) carries no such evidence, so nothing is asserted.
    fn assert_model_in_provider_catalog(
        provider: &super::super::providers::ProviderConfig,
        model: &str,
        subject: &str,
    ) {
        if let Some(catalog) = provider.catalog.as_ref() {
            if !catalog.models.iter().any(|entry| entry == model) {
                panic!("the {subject} model is absent from its Provider catalog");
            }
        }
    }

    fn test_source(color: [u8; 3]) -> Vec<u8> {
        let mut image = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 255, 255]));
        for y in 10..54 {
            for x in 20..44 {
                image.put_pixel(x, y, image::Rgba([color[0], color[1], color[2], 255]));
            }
        }
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        bytes
    }

    fn test_preview_input(run_id: &str) -> GameAssetGenerationPreviewInput {
        let reference_bytes = test_source([40, 80, 120]);
        let reference_hash = sha256(&reference_bytes);
        let reference = EvidenceReference {
            id: format!("artifact:sha256:{reference_hash}"),
            revision: "revision:reference:1".into(),
            content_hash: reference_hash,
        };
        let role = |id: &str, frame_index: u32| GameRole {
            id: id.into(),
            asset_id: "asset:runner".into(),
            action: "run".into(),
            direction: "right".into(),
            frame_index,
            output_schema: SchemaReference {
                id: "game-asset.frame".into(),
                version: 1,
            },
            identity_lock: reference.clone(),
            scale_lock: reference.clone(),
            expected_alpha_size: PixelSize {
                width: 300,
                height: 400,
            },
            anchor_lock: reference.clone(),
            anchor: "feet".into(),
            expected_anchor: AnchorPoint { x: 256.0, y: 480.0 },
        };
        let plan = GamePlan {
            version: PLAN_PROTOCOL.into(),
            id: "plan:runner".into(),
            asset_id: "asset:runner".into(),
            kind: "player".into(),
            view: "side".into(),
            art_direction_evidence: vec![reference.clone()],
            reference_artifacts: vec![reference.clone()],
            roles: vec![role("role:run:right:0", 0), role("role:run:right:1", 1)],
            delivery: Delivery {
                format_id: "game-frame-png".into(),
                frame_width: 512,
                frame_height: 512,
                columns: 2,
                rows: 1,
            },
        };
        GameAssetGenerationPreviewInput {
            identity: RehearsalIdentity {
                id: "identity:runner".into(),
                revision: "revision:runner:1".into(),
            },
            run_id: run_id.into(),
            provider_id: "provider:qwen".into(),
            model: "qwen-image-3.0-pro".into(),
            plan: serde_json::to_value(plan).unwrap(),
            retained_evidence: vec![RetainedEvidenceInput {
                reference,
                media_type: "image/png".into(),
                artifact_bytes_base64: STANDARD.encode(reference_bytes),
            }],
            roles: vec![
                RolePromptInput {
                    role_id: "role:run:right:0".into(),
                    prompt: "Runner frame zero".into(),
                },
                RolePromptInput {
                    role_id: "role:run:right:1".into(),
                    prompt: "Runner frame one".into(),
                },
            ],
        }
    }

    fn test_execution_result(
        request: GameAssetRoleExecution,
        source: Vec<u8>,
    ) -> Result<DashScopeImageResult, ProxyError> {
        let receipt = issue_receipt(
            &request.context,
            &request.provider_id,
            &request.model,
            "image-edit",
            artifact_evidence(&source, "image/png", Some(64), Some(64)),
            1,
            2,
            None,
        )?;
        Ok(DashScopeImageResult {
            images: vec![dashscope_image::DashScopeImageAsset {
                media_type: "image/png".into(),
                data: STANDARD.encode(source),
            }],
            receipts: vec![receipt],
        })
    }

    fn test_action_sheet_preview_input(run_id: &str) -> GameAssetActionSheetPreviewInput {
        let base = test_preview_input(run_id);
        GameAssetActionSheetPreviewInput {
            identity: base.identity,
            run_id: base.run_id,
            provider_id: base.provider_id,
            model: base.model,
            family_plan_id: "family-plan:test-runner".into(),
            family_plan_hash: "7".repeat(64),
            group_id: "group:test-runner:run".into(),
            plan: base.plan,
            retained_evidence: base.retained_evidence,
            source_brief:
                "Create one coherent 1x2 runner action sheet on a pure magenta background.".into(),
            grid: ActionSheetGridInput {
                rows: 1,
                columns: 2,
            },
            frame_duration_ms: 90,
            looping: true,
        }
    }

    fn test_action_sheet_source() -> Vec<u8> {
        let mut image = image::RgbaImage::from_pixel(128, 64, image::Rgba([255, 0, 255, 255]));
        for y in 8..58 {
            for x in 18..46 {
                image.put_pixel(x, y, image::Rgba([20, 80, 150, 255]));
            }
        }
        for y in 12..58 {
            for x in 82..116 {
                image.put_pixel(x, y, image::Rgba([180, 40, 70, 255]));
            }
        }
        encode_cutout_png(&image).unwrap()
    }

    fn test_spatial_board_action_sheet_source() -> Vec<u8> {
        let mut image = image::RgbaImage::from_pixel(128, 64, image::Rgba([207, 1, 111, 255]));
        let corners = [
            [255_u8, 0_u8, 255_u8],
            [128, 60, 90],
            [128, 60, 90],
            [255, 0, 255],
        ];
        for y in 0..64_u32 {
            for x in 0..64_u32 {
                let weights = [(63 - x) * (63 - y), x * (63 - y), (63 - x) * y, x * y];
                let mut color = [0_u8; 4];
                for channel in 0..3 {
                    let weighted = (0..4)
                        .map(|index| u32::from(corners[index][channel]) * weights[index])
                        .sum::<u32>();
                    color[channel] = ((weighted + 63 * 63 / 2) / (63 * 63)) as u8;
                }
                color[3] = 255;
                image.put_pixel(x, y, image::Rgba(color));
            }
        }
        for y in 1..63_u32 {
            image.put_pixel(1, y, image::Rgba([149, 2, 74, 255]));
        }
        for y in 27..34 {
            for x in 28..35 {
                image.put_pixel(x, y, image::Rgba([20, 150, 130, 255]));
            }
        }
        for y in 12..58 {
            for x in 82..116 {
                image.put_pixel(x, y, image::Rgba([180, 40, 70, 255]));
            }
        }
        encode_cutout_png(&image).unwrap()
    }

    #[test]
    fn action_sheet_repair_composition_reference_insets_edge_contact_deterministically() {
        let background = image::Rgba([185, 42, 108, 255]);
        let foreground = image::Rgba([28, 46, 72, 255]);
        let mut image = image::RgbaImage::from_pixel(512, 512, background);
        for y in 96..448 {
            for x in 112..304 {
                image.put_pixel(x, y, foreground);
            }
        }
        for y in 244..252 {
            for x in 304..512 {
                image.put_pixel(x, y, foreground);
            }
        }
        let source = encode_cutout_png(&image).unwrap();
        let first = action_sheet_repair_composition_reference(&source).unwrap();
        let second = action_sheet_repair_composition_reference(&source).unwrap();
        assert_eq!(first, second);

        let guide = decode_bounded_image(&first).unwrap().to_rgba8();
        assert_eq!(guide.dimensions(), (512, 512));
        for y in 0..512 {
            for x in 0..512 {
                if x < 96 || x >= 416 || y < 96 || y >= 416 {
                    assert_eq!(*guide.get_pixel(x, y), background);
                }
            }
        }
        assert_ne!(*guide.get_pixel(415, 251), background);
    }

    fn test_action_sheet_execution_result(
        request: GameAssetRoleExecution,
        source: Vec<u8>,
    ) -> Result<DashScopeImageResult, ProxyError> {
        let decoded = decode_bounded_image(&source)?;
        let receipt = issue_receipt(
            &request.context,
            &request.provider_id,
            &request.model,
            "image-edit",
            artifact_evidence(
                &source,
                "image/png",
                Some(decoded.width()),
                Some(decoded.height()),
            ),
            1,
            2,
            None,
        )?;
        Ok(DashScopeImageResult {
            images: vec![dashscope_image::DashScopeImageAsset {
                media_type: "image/png".into(),
                data: STANDARD.encode(source),
            }],
            receipts: vec![receipt],
        })
    }

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
    fn shadow_prune_removes_only_detached_bottom_horizontal_components() {
        let mut image = image::RgbaImage::new(64, 64);
        for y in 12..52 {
            for x in 22..42 {
                image.put_pixel(x, y, image::Rgba([30, 40, 50, 255]));
            }
        }
        for x in 8..56 {
            image.put_pixel(x, 58, image::Rgba([10, 10, 10, 255]));
        }
        prune_detached_horizontal_components(&mut image);
        assert_eq!(
            alpha_bounds_from_rgba(&image).unwrap(),
            AlphaBounds {
                x: 22,
                y: 12,
                width: 20,
                height: 40,
            }
        );
    }

    #[test]
    fn ground_stroke_prune_keeps_pixels_supported_by_a_foot() {
        let mut image = image::RgbaImage::new(64, 64);
        for y in 38..56 {
            for x in 26..38 {
                image.put_pixel(x, y, image::Rgba([30, 40, 50, 255]));
            }
        }
        for x in 8..56 {
            image.put_pixel(x, 58, image::Rgba([10, 10, 10, 255]));
        }
        prune_unsupported_horizontal_strokes(&mut image);
        assert!(image.get_pixel(30, 58).0[3] > ALPHA_THRESHOLD);
        assert_eq!(image.get_pixel(12, 58).0[3], 0);
        assert_eq!(image.get_pixel(52, 58).0[3], 0);
    }

    #[test]
    fn board_stroke_prune_clears_floor_edges_before_border_validation_but_not_a_weapon() {
        let width = 64_usize;
        let height = 64_usize;
        let background = [255, 0, 255];
        let mut floor = image::RgbaImage::from_pixel(
            width as u32,
            height as u32,
            image::Rgba([background[0], background[1], background[2], 255]),
        );
        for y in 38..55 {
            for x in 26..38 {
                floor.put_pixel(x, y, image::Rgba([30, 40, 50, 255]));
            }
        }
        for x in 0..width as u32 {
            floor.put_pixel(x, 58, image::Rgba([10, 10, 10, 255]));
        }
        let mut floor_bytes = floor.into_raw();
        prune_unsupported_horizontal_board_strokes(&mut floor_bytes, width, height, &background);
        assert_eq!(
            &floor_bytes[(58 * width) * 4..(58 * width) * 4 + 3],
            &background
        );
        assert_eq!(
            &floor_bytes[(58 * width + width - 1) * 4..(58 * width + width - 1) * 4 + 3],
            &background
        );
        reconstruct_adaptive_chroma_foreground(&floor_bytes, width, height, background).unwrap();

        let mut weapon = image::RgbaImage::from_pixel(
            width as u32,
            height as u32,
            image::Rgba([background[0], background[1], background[2], 255]),
        );
        for x in 0..16 {
            weapon.put_pixel(x, 32, image::Rgba([20, 80, 150, 255]));
        }
        let mut weapon_bytes = weapon.into_raw();
        prune_unsupported_horizontal_board_strokes(&mut weapon_bytes, width, height, &background);
        assert_ne!(
            &weapon_bytes[(32 * width) * 4..(32 * width) * 4 + 3],
            &background
        );
        assert!(
            reconstruct_adaptive_chroma_foreground(&weapon_bytes, width, height, background)
                .is_err()
        );
    }

    #[test]
    fn v6_replay_stays_frozen_while_v7_owns_pre_border_floor_cleanup() {
        let clean = test_source([40, 80, 120]);
        let clean_hash = sha256(&clean);
        let clean_id = format!("artifact:sha256:{clean_hash}");
        let frame_size = PixelSize {
            width: 64,
            height: 64,
        };
        let alpha_target = PixelSize {
            width: 32,
            height: 40,
        };
        let expected_anchor = AnchorPoint { x: 32.0, y: 60.0 };
        let first = deterministic_cutout_v6(
            &clean,
            &clean_id,
            &clean_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        let second = deterministic_cutout_v6(
            &clean,
            &clean_id,
            &clean_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        assert_eq!(first, second);
        assert_eq!(first.1.implementation, V6_CUTOUT_IMPLEMENTATION);

        let mut floor = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 255, 255]));
        for y in 38..55 {
            for x in 26..38 {
                floor.put_pixel(x, y, image::Rgba([30, 40, 50, 255]));
            }
        }
        for x in 0..64 {
            floor.put_pixel(x, 58, image::Rgba([10, 10, 10, 255]));
        }
        let floor_bytes = encode_cutout_png(&floor).unwrap();
        let floor_hash = sha256(&floor_bytes);
        let floor_id = format!("artifact:sha256:{floor_hash}");
        assert!(deterministic_cutout_v6(
            &floor_bytes,
            &floor_id,
            &floor_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .is_err());
        let (_, v7_evidence) = deterministic_cutout(
            &floor_bytes,
            &floor_id,
            &floor_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        assert_eq!(v7_evidence.implementation, CUTOUT_IMPLEMENTATION);
    }

    #[test]
    fn v8_derives_a_safe_grounded_envelope_from_verified_transparent_pixels() {
        let mut source = image::RgbaImage::from_pixel(512, 512, image::Rgba([0, 0, 0, 0]));
        for y in 100..353 {
            for x in 100..412 {
                source.put_pixel(x, y, image::Rgba([28, 46, 72, 255]));
            }
        }
        let source_bytes = encode_cutout_png(&source).unwrap();
        let source_hash = sha256(&source_bytes);
        let source_id = format!("artifact:sha256:{source_hash}");
        let frame_size = PixelSize {
            width: 512,
            height: 512,
        };
        let requested_target = PixelSize {
            width: 300,
            height: 420,
        };
        let expected_anchor = AnchorPoint { x: 256.0, y: 466.0 };

        let (_, v7) = deterministic_cutout(
            &source_bytes,
            &source_id,
            &source_hash,
            &frame_size,
            &requested_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        let safe_target = PixelSize {
            width: 448,
            height: 420,
        };
        let (_, v8) = normalize_verified_alpha_grounded_v8(
            &source_bytes,
            &source_id,
            &source_hash,
            &frame_size,
            &safe_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();

        assert_eq!(v7.alpha_target, Some(requested_target));
        assert_eq!(
            v7.resized_subject_size,
            Some(PixelSize {
                width: 300,
                height: 243,
            })
        );
        assert_eq!(
            v8.alpha_target,
            Some(PixelSize {
                width: 448,
                height: 420,
            })
        );
        assert_eq!(
            v8.resized_subject_size,
            Some(PixelSize {
                width: 448,
                height: 363,
            })
        );
        assert_eq!(
            v8.placement,
            Some(AlphaBounds {
                x: 32,
                y: 103,
                width: 448,
                height: 363,
            })
        );
        assert_eq!(v8.implementation, GROUNDED_NORMALIZATION_IMPLEMENTATION);
        assert_eq!(
            v8.scale_policy.as_deref(),
            Some(GROUNDED_NORMALIZATION_SCALE_POLICY)
        );
    }

    #[test]
    fn v5_replay_keeps_strict_perimeter_and_has_no_shadow_cleanup() {
        let clean = test_source([40, 80, 120]);
        let clean_hash = sha256(&clean);
        let clean_id = format!("artifact:sha256:{clean_hash}");
        let frame_size = PixelSize {
            width: 64,
            height: 64,
        };
        let alpha_target = PixelSize {
            width: 32,
            height: 40,
        };
        let expected_anchor = AnchorPoint { x: 32.0, y: 60.0 };
        let first = deterministic_cutout_v5(
            &clean,
            &clean_id,
            &clean_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        let second = replay_deterministic_cutout(
            V5_CUTOUT_IMPLEMENTATION,
            &clean,
            &clean_id,
            &clean_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .unwrap();
        assert_eq!(first, second);
        assert_eq!(first.1.implementation, V5_CUTOUT_IMPLEMENTATION);

        let mut non_uniform = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 255, 255]));
        for x in 0..20 {
            non_uniform.put_pixel(x, 0, image::Rgba([0, 255, 0, 255]));
        }
        for y in 20..44 {
            for x in 26..38 {
                non_uniform.put_pixel(x, y, image::Rgba([30, 40, 50, 255]));
            }
        }
        let non_uniform = encode_cutout_png(&non_uniform).unwrap();
        let non_uniform_hash = sha256(&non_uniform);
        let non_uniform_id = format!("artifact:sha256:{non_uniform_hash}");
        assert!(deterministic_cutout_v5(
            &non_uniform,
            &non_uniform_id,
            &non_uniform_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "feet",
        )
        .is_err());
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
    fn action_sheet_split_uses_decoded_pixels_and_rejects_indivisible_dimensions() {
        let input = test_action_sheet_preview_input("run:game:sheet-split");
        let plan: GamePlan = serde_json::from_value(input.plan).unwrap();
        let source = test_action_sheet_source();
        let (grid, cells) = split_action_grid(&source, &input.grid, &plan.roles).unwrap();
        assert_eq!(grid.cell_width, 64);
        assert_eq!(grid.cell_height, 64);
        assert_eq!(cells.len(), 2);
        assert_eq!(cells[1].source_rectangle.x, 64);

        let malformed = encode_cutout_png(&image::RgbaImage::from_pixel(
            127,
            64,
            image::Rgba([255, 0, 255, 255]),
        ))
        .unwrap();
        assert!(split_action_grid(&malformed, &input.grid, &plan.roles).is_err());
    }

    #[tokio::test]
    async fn action_sheet_executes_once_and_reverifies_every_derived_cell() {
        install_ephemeral_test_signing_key();
        let input = test_action_sheet_preview_input("run:game:sheet-execute");
        let plan = input.plan.clone();
        let stored = preview_action_sheet_request(input, 1_000).unwrap();
        let mut provider_calls = 0_u32;
        let result = execute_stored_action_sheet_preview(stored, |request| {
            provider_calls += 1;
            async move { test_action_sheet_execution_result(request, test_action_sheet_source()) }
        })
        .await
        .unwrap();
        assert_eq!(provider_calls, 1);
        assert_eq!(result.status, "succeeded");
        let source = result.source.unwrap();
        let clip = result.clip.unwrap();
        let authorization = result.authorization.unwrap();
        assert_eq!(source.cells.len(), 2);
        assert_eq!(clip.frames.len(), 2);
        assert_eq!(authorization.source_receipt_id, source.receipt.receipt_id);
        verify_action_sheet_authorization(
            authorization.clone(),
            plan.clone(),
            source.clone(),
            clip.clone(),
        )
        .unwrap();

        let mut tampered = source;
        tampered.cells[0].artifact.bytes_base64 = STANDARD.encode(test_source([1, 2, 3]));
        assert!(verify_action_sheet_authorization(authorization, plan, tampered, clip).is_err());
    }

    #[tokio::test]
    async fn action_sheet_verifier_replays_each_signed_v6_frame_with_frozen_v6() {
        install_ephemeral_test_signing_key();
        let input = test_action_sheet_preview_input("run:game:sheet-v6-replay");
        let plan_value = input.plan.clone();
        let stored = preview_action_sheet_request(input, 1_000).unwrap();
        let authorization_stored = stored.clone();
        let result = execute_stored_action_sheet_preview(stored, |request| async move {
            test_action_sheet_execution_result(request, test_action_sheet_source())
        })
        .await
        .unwrap();
        let source = result.source.unwrap();
        let mut clip = result.clip.unwrap();
        for ((role, cell), frame) in authorization_stored
            .plan
            .roles
            .iter()
            .zip(&source.cells)
            .zip(&mut clip.frames)
        {
            let cell_bytes = verify_action_artifact(&cell.artifact).unwrap();
            let (bytes, processing_evidence) = deterministic_cutout_v6(
                &cell_bytes,
                &cell.artifact.artifact_id,
                &cell.artifact.sha256,
                &PixelSize {
                    width: authorization_stored.plan.delivery.frame_width,
                    height: authorization_stored.plan.delivery.frame_height,
                },
                &role.expected_alpha_size,
                &role.expected_anchor,
                &role.anchor,
            )
            .unwrap();
            let pixel_evidence = inspect_pixels(&bytes, &role.anchor).unwrap();
            frame.artifact_id = processing_evidence.output_artifact_id.clone();
            frame.artifact_sha256 = processing_evidence.output_artifact_sha256.clone();
            frame.artifact_bytes_base64 = STANDARD.encode(bytes);
            frame.anchor = pixel_evidence.anchor.clone();
            frame.processing_evidence = processing_evidence;
            frame.pixel_evidence = pixel_evidence;
        }
        clip.id = action_clip_id(&clip).unwrap();
        let authorization = issue_action_sheet_authorization(
            &authorization_stored,
            "execution:game-asset-action-sheet:v6-replay".into(),
            &source,
            &clip,
            1,
            2,
        )
        .unwrap();
        let verified =
            verify_action_sheet_authorization(authorization, plan_value, source, clip).unwrap();
        assert!(verified
            .cells
            .iter()
            .all(|cell| cell.processing_evidence.implementation == V6_CUTOUT_IMPLEMENTATION));
    }

    #[tokio::test]
    async fn action_sheet_retains_verified_paid_source_when_cutout_rejects_a_cell(
    ) -> Result<(), ProxyError> {
        install_ephemeral_test_signing_key();
        let input = test_action_sheet_preview_input("run:game:sheet-cutout-failure");
        let plan = input.plan.clone();
        let stored = preview_action_sheet_request(input, 1_000).unwrap();
        let mut image = decode_bounded_image(&test_action_sheet_source())?.to_rgba8();
        image.put_pixel(0, 0, image::Rgba([20, 80, 150, 255]));
        let invalid_source = encode_cutout_png(&image)?;
        let result = execute_stored_action_sheet_preview(stored, |request| async move {
            test_action_sheet_execution_result(request, invalid_source)
        })
        .await?;

        assert_eq!(result.status, "partial");
        assert!(result.source.is_some());
        assert!(result.clip.is_none());
        assert!(result.authorization.is_none());
        let source = result.source.clone().unwrap();
        let partial = result.partial.clone().unwrap();
        let authorization = result.partial_authorization.clone().unwrap();
        assert_eq!(partial.frames.len(), 1);
        assert_eq!(partial.frames[0].role_id, "role:run:right:1");
        assert_eq!(partial.failures.len(), 1);
        assert_eq!(partial.failures[0].role_id, "role:run:right:0");
        assert!(result
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("role:run:right:0"));
        verify_action_sheet_partial_authorization(authorization, plan, source, partial)?;
        Ok::<(), ProxyError>(())
    }

    #[tokio::test]
    async fn local_partial_reprocess_closes_spatial_board_without_provider_calls(
    ) -> Result<(), ProxyError> {
        install_ephemeral_test_signing_key();
        let input = test_action_sheet_preview_input("run:game:sheet-spatial-board-parent");
        let plan = input.plan.clone();
        let stored = preview_action_sheet_request(input, 1_000)?;
        let source_bytes = test_spatial_board_action_sheet_source();
        let parent = execute_stored_action_sheet_preview(stored, |request| {
            let source_bytes = source_bytes.clone();
            async move { test_action_sheet_execution_result(request, source_bytes) }
        })
        .await?;
        assert_eq!(parent.status, "partial");
        let parent_source = parent.source.unwrap();
        let parent_partial = parent.partial.unwrap();
        let parent_authorization = parent.partial_authorization.unwrap();
        assert_eq!(parent_partial.frames.len(), 1);
        assert_eq!(parent_partial.failures.len(), 1);
        let preserved_frame = parent_partial.frames[0].clone();

        let reprocess = preview_action_sheet_partial_reprocess_request(
            GameAssetActionSheetPartialReprocessPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_source: parent_source.clone(),
                parent_partial: parent_partial.clone(),
                plan: plan.clone(),
            },
            2_000,
        )?;
        assert_eq!(reprocess.preview.provider_calls, 0);
        assert_eq!(reprocess.preview.execution_mode, "local-deterministic");
        let clip = derive_partial_reprocessed_clip(&reprocess)?;
        let reprocessed = &clip.frames[0];
        let model = reprocessed
            .processing_evidence
            .spatial_board_model
            .as_ref()
            .expect("v10 evidence must bind the spatial board model");
        assert_eq!(model.implementation, SPATIAL_BOARD_MODEL_IMPLEMENTATION);
        assert_eq!(model.columns, 17);
        assert_eq!(model.rows, 17);
        assert_eq!(model.initial_sample_radius, 8);
        assert_eq!(model.maximum_sample_radius, 96);
        assert_eq!(model.minimum_samples_per_node, 24);
        assert_eq!(model.node_count, 289);
        assert!(valid_hash(&model.node_bytes_sha256));
        assert_eq!(
            model.edge_seed_strip_width,
            Some(SPATIAL_BOARD_EDGE_SEED_STRIP_WIDTH as u32)
        );
        assert!(model.edge_seed_pixel_count.is_some_and(|count| count > 0));
        assert_eq!(
            reprocessed.processing_evidence.implementation,
            SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
        );
        assert!(reprocessed.pixel_evidence.alpha_bounds.width < 64);
        assert!(reprocessed.pixel_evidence.alpha_bounds.height < 64);
        assert!(!reprocessed.pixel_evidence.edge_contact);
        let preserved = clip
            .frames
            .iter()
            .find(|frame| frame.role_id == preserved_frame.role_id)
            .unwrap();
        assert_eq!(
            preserved.artifact_bytes_base64,
            preserved_frame.artifact_bytes_base64
        );
        assert_eq!(preserved.artifact_id, preserved_frame.artifact_id);

        let authorization = issue_action_sheet_partial_reprocess_authorization(
            &reprocess,
            &clip,
            "execution:game:sheet-spatial-board-local".into(),
            2_001,
            2_002,
        )?;
        assert_eq!(authorization.provider_calls, 0);
        verify_action_sheet_partial_reprocess_authorization(
            authorization.clone(),
            plan.clone(),
            parent_authorization.clone(),
            parent_source.clone(),
            parent_partial.clone(),
            clip.clone(),
        )?;

        let mut tampered_source = parent_source;
        tampered_source.cells[0].artifact.sha256 = "0".repeat(64);
        assert!(verify_action_sheet_partial_reprocess_authorization(
            authorization,
            plan,
            parent_authorization,
            tampered_source,
            parent_partial,
            clip,
        )
        .is_err());
        Ok(())
    }

    #[tokio::test]
    async fn partial_action_sheet_repairs_only_failed_cells_and_preserves_successful_frames(
    ) -> Result<(), ProxyError> {
        install_ephemeral_test_signing_key();
        let input = test_action_sheet_preview_input("run:game:sheet-partial-parent");
        let plan = input.plan.clone();
        let stored = preview_action_sheet_request(input, 1_000)?;
        let mut image = decode_bounded_image(&test_action_sheet_source())?.to_rgba8();
        image.put_pixel(0, 0, image::Rgba([20, 80, 150, 255]));
        let invalid_source = encode_cutout_png(&image)?;
        let parent = execute_stored_action_sheet_preview(stored, |request| async move {
            test_action_sheet_execution_result(request, invalid_source)
        })
        .await?;
        let parent_source = parent.source.unwrap();
        let parent_partial = parent.partial.unwrap();
        let parent_authorization = parent.partial_authorization.unwrap();
        let preserved_frame = parent_partial.frames[0].clone();
        let repair_roles = vec![ActionSheetRepairRolePromptInput {
            role_id: "role:run:right:0".into(),
            prompt: "Repair only the failed first run cell and preserve the retained sibling."
                .into(),
        }];
        let failed_repair = preview_action_sheet_partial_repair_request(
            GameAssetActionSheetPartialRepairPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_source: parent_source.clone(),
                parent_partial: parent_partial.clone(),
                run_id: "run:game:sheet-partial-repair-rejected".into(),
                plan: plan.clone(),
                roles: repair_roles.clone(),
            },
            2_000,
        )?;
        let mut rejected_image = decode_bounded_image(&test_source([180, 30, 60]))?.to_rgba8();
        rejected_image.put_pixel(0, 0, image::Rgba([20, 80, 150, 255]));
        let rejected_source = encode_cutout_png(&rejected_image)?;
        let expected_rejected_source = rejected_source.clone();
        let rejected = execute_stored_action_sheet_partial_repair(failed_repair, |request| {
            let rejected_source = rejected_source.clone();
            async move { test_action_sheet_execution_result(request, rejected_source) }
        })
        .await?;
        assert_eq!(rejected.status, "failed");
        assert!(rejected.outputs.is_empty());
        assert!(rejected.authorization.is_none());
        let rejected_attempt = rejected.failed_attempt.unwrap();
        let retained_rejected_source = STANDARD
            .decode(&rejected_attempt.source_artifact_bytes_base64)
            .unwrap();
        assert_eq!(retained_rejected_source, expected_rejected_source);
        verify_receipt(&rejected_attempt.receipt, &retained_rejected_source)?;
        assert_eq!(rejected_attempt.failure, rejected.error.unwrap());
        let repair = preview_action_sheet_partial_repair_request(
            GameAssetActionSheetPartialRepairPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_source: parent_source.clone(),
                parent_partial: parent_partial.clone(),
                run_id: "run:game:sheet-partial-repair".into(),
                plan: plan.clone(),
                roles: repair_roles,
            },
            2_000,
        )?;
        assert!(repair.roles[0]
            .request
            .lock_ids
            .contains(&action_sheet_repair_composition_lock_id()));
        assert_ne!(
            repair.roles[0].reference_bytes[1],
            verify_action_artifact(&parent_source.cells[0].artifact)?
        );
        let mut provider_calls = 0_u8;
        let repaired = execute_stored_action_sheet_partial_repair(repair, |request| {
            provider_calls += 1;
            async move {
                assert_eq!(
                    request.context.accepted_reference_artifact_ids,
                    request
                        .reference_bytes
                        .iter()
                        .map(|bytes| format!("artifact:sha256:{}", sha256(bytes)))
                        .collect::<Vec<_>>()
                );
                test_action_sheet_execution_result(request, test_source([180, 30, 60]))
            }
        })
        .await?;
        assert_eq!(provider_calls, 1);
        assert_eq!(repaired.status, "succeeded");
        let authorization = repaired.authorization.clone().unwrap();
        verify_action_sheet_partial_repair_authorization(
            authorization.clone(),
            plan,
            parent_authorization,
            parent_source,
            parent_partial,
            repaired.outputs,
        )?;
        assert_eq!(authorization.replacement_role_ids, vec!["role:run:right:0"]);
        assert_eq!(authorization.preserved_cells.len(), 1);
        assert_eq!(
            authorization.preserved_cells[0].role_id,
            preserved_frame.role_id
        );
        assert_eq!(
            authorization.preserved_cells[0].artifact_id,
            preserved_frame.artifact_id
        );
        Ok::<(), ProxyError>(())
    }

    #[tokio::test]
    async fn action_sheet_repair_calls_only_failed_cells_and_preserves_sibling_lineage() {
        install_ephemeral_test_signing_key();
        let parent_input = test_action_sheet_preview_input("run:game:sheet-parent");
        let parent_plan = parent_input.plan.clone();
        let parent_stored = preview_action_sheet_request(parent_input, 1_000).unwrap();
        let parent_result =
            execute_stored_action_sheet_preview(parent_stored, |request| async move {
                test_action_sheet_execution_result(request, test_action_sheet_source())
            })
            .await
            .unwrap();
        assert_eq!(parent_result.status, "succeeded");
        let parent_authorization = parent_result.authorization.clone().unwrap();
        let parent_source = parent_result.source.clone().unwrap();
        let parent_clip = parent_result.clip.clone().unwrap();
        let repair_stored = preview_action_sheet_repair_request(
            GameAssetActionSheetRepairPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_source: parent_source.clone(),
                parent_clip: parent_clip.clone(),
                run_id: "run:game:sheet-repair".into(),
                plan: parent_plan.clone(),
                roles: vec![ActionSheetRepairRolePromptInput {
                    role_id: "role:run:right:1".into(),
                    prompt: "Repair only this failed runner cell; keep the accepted identity."
                        .into(),
                }],
            },
            2_000,
        )
        .unwrap();
        assert!(repair_stored.roles[0]
            .request
            .lock_ids
            .contains(&action_sheet_repair_composition_lock_id()));
        assert_ne!(
            repair_stored.roles[0].reference_bytes[1],
            verify_action_artifact(&parent_source.cells[1].artifact).unwrap()
        );
        assert_eq!(
            repair_stored.preview.replacement_role_ids,
            vec!["role:run:right:1"]
        );
        let mut provider_calls = 0_u8;
        let repaired = execute_stored_action_sheet_repair(repair_stored, |request| {
            provider_calls += 1;
            async move {
                assert_eq!(
                    request.context.accepted_reference_artifact_ids,
                    request
                        .reference_bytes
                        .iter()
                        .map(|bytes| format!("artifact:sha256:{}", sha256(bytes)))
                        .collect::<Vec<_>>()
                );
                test_action_sheet_execution_result(request, test_source([180, 30, 60]))
            }
        })
        .await
        .unwrap();
        assert_eq!(provider_calls, 1);
        assert_eq!(repaired.status, "succeeded");
        let authorization = repaired.authorization.clone().unwrap();
        verify_action_sheet_repair_authorization(
            authorization.clone(),
            parent_plan,
            parent_authorization.clone(),
            parent_source.clone(),
            parent_clip.clone(),
            repaired.outputs.clone(),
        )
        .unwrap();
        assert_eq!(authorization.replacement_role_ids, vec!["role:run:right:1"]);
        assert_eq!(authorization.preserved_cells.len(), 1);
        assert_eq!(
            authorization.preserved_cells[0].source_artifact_id,
            parent_source.cells[0].artifact.artifact_id
        );
        assert_eq!(
            authorization.preserved_cells[0].artifact_id,
            parent_clip.frames[0].artifact_id
        );
        let mut tampered_parent = parent_source;
        tampered_parent.cells[0].artifact.bytes_base64 = STANDARD.encode(test_source([1, 2, 3]));
        assert!(verify_action_sheet_repair_authorization(
            authorization,
            serde_json::to_value(GamePlan {
                version: PLAN_PROTOCOL.into(),
                id: "plan:runner".into(),
                asset_id: "asset:runner".into(),
                kind: "player".into(),
                view: "side".into(),
                art_direction_evidence: vec![],
                reference_artifacts: vec![],
                roles: vec![],
                delivery: Delivery {
                    format_id: "game-frame-png".into(),
                    frame_width: 512,
                    frame_height: 512,
                    columns: 2,
                    rows: 1,
                },
            })
            .unwrap(),
            parent_authorization,
            tampered_parent,
            parent_clip,
            repaired.outputs,
        )
        .is_err());
    }

    #[tokio::test]
    async fn repair_replaces_only_selected_roles_and_signs_preserved_lineage() {
        install_ephemeral_test_signing_key();
        let original_input = test_preview_input("run:game:original");
        let original_plan = original_input.plan.clone();
        let delivery_plan = original_plan.clone();
        let original_evidence = original_input.retained_evidence.clone();
        let stored = preview_request(original_input, 1_000).unwrap();
        let mut source_index = 0_u8;
        let original = execute_stored_preview(stored, |request| {
            source_index += 1;
            let source = test_source([20 * source_index, 70, 120]);
            async move { test_execution_result(request, source) }
        })
        .await
        .unwrap();
        assert_eq!(original.status, "succeeded");
        let parent_authorization = original.authorization.clone().unwrap();
        let parent_outputs = original.outputs.clone();
        verify_generation_authorization(parent_authorization.clone(), parent_outputs.clone())
            .unwrap();

        let repair_stored = preview_repair_request(
            GameAssetGenerationRepairPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_outputs: parent_outputs.clone(),
                run_id: "run:game:repair:1".into(),
                plan: original_plan,
                retained_evidence: original_evidence,
                roles: vec![RolePromptInput {
                    role_id: "role:run:right:1".into(),
                    prompt: "Runner frame one, exactly one complete character".into(),
                }],
            },
            2_000,
        )
        .unwrap();
        assert_eq!(
            repair_stored.preview.replacement_role_ids,
            Some(vec!["role:run:right:1".into()])
        );
        assert_eq!(repair_stored.preserved_outputs.len(), 1);

        let mut repair_calls = 0_u8;
        let repaired = execute_stored_preview(repair_stored, |request| {
            repair_calls += 1;
            let source = test_source([180, 30, 60]);
            async move { test_execution_result(request, source) }
        })
        .await
        .unwrap();
        assert_eq!(repair_calls, 1);
        assert_eq!(repaired.status, "succeeded");
        let repaired_authorization = repaired.authorization.clone().unwrap();
        verify_generation_authorization(repaired_authorization.clone(), repaired.outputs.clone())
            .unwrap();
        assert_eq!(
            repaired.outputs[0].artifact_bytes_base64,
            parent_outputs[0].artifact_bytes_base64
        );
        assert_eq!(
            repaired.outputs[0].receipt.receipt_hash,
            parent_outputs[0].receipt.receipt_hash
        );
        assert_ne!(
            repaired.outputs[1]
                .processing_evidence
                .output_artifact_sha256,
            parent_outputs[1].processing_evidence.output_artifact_sha256
        );
        assert_eq!(
            repaired_authorization.protocol,
            REPAIR_AUTHORIZATION_PROTOCOL
        );
        let lineage = repaired_authorization.repair_lineage.clone().unwrap();
        assert_eq!(lineage.parent_receipt_id, parent_authorization.receipt_id);
        assert_eq!(lineage.replaced_role_ids, vec!["role:run:right:1"]);
        assert_eq!(lineage.preserved_roles[0].role_id, "role:run:right:0");
        assert_eq!(
            lineage.preserved_roles[0].artifact_id,
            parent_outputs[0].processing_evidence.output_artifact_id
        );

        let candidate = compile_game_asset_bundle(
            delivery_plan.clone(),
            repaired_authorization.clone(),
            repaired.outputs.clone(),
            None,
        )
        .unwrap();
        assert_eq!(candidate.delivery_status, "candidate");
        assert_eq!(candidate.manifest.frames.len(), 2);
        assert_eq!(candidate.manifest.animations.len(), 1);
        assert_eq!(candidate.manifest.animations[0].role_ids.len(), 2);
        let manifest_bytes = STANDARD.decode(&candidate.manifest_bytes_base64).unwrap();
        let manifest_json = String::from_utf8(manifest_bytes.clone()).unwrap();
        assert!(manifest_json.contains("\"anchor\":{\"x\":256,\"y\":480}"));
        assert!(!manifest_json.contains("256.0"));
        assert_eq!(sha256(&manifest_bytes), candidate.bundle_hash);
        let atlas =
            image::load_from_memory(&STANDARD.decode(&candidate.atlas_bytes_base64).unwrap())
                .unwrap();
        assert_eq!(atlas.dimensions(), (1_024, 512));

        let decisions = repaired_authorization
            .role_requests
            .iter()
            .map(|request| SemanticAcceptanceDecision {
                role_id: request.role_id.clone(),
                reference_continuity: "accepted".into(),
                role_readability: "accepted".into(),
                style_consistency: "accepted".into(),
            })
            .collect();
        let acceptance = issue_semantic_acceptance(
            &repaired_authorization,
            "approval:test-only".into(),
            decisions,
            repaired_authorization.completed_at + 1,
        )
        .unwrap();
        let accepted = compile_game_asset_bundle(
            delivery_plan,
            repaired_authorization,
            repaired.outputs,
            Some(acceptance),
        )
        .unwrap();
        assert_eq!(accepted.delivery_status, "accepted");
        assert!(accepted.manifest.semantic_acceptance.is_some());
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
            repair_lineage: None,
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
    fn occlusion_tolerant_spatial_board_cutout_models_board_hidden_by_large_subjects() {
        let mut image = image::RgbaImage::from_pixel(512, 512, image::Rgba([255, 0, 255, 255]));
        for y in 116..396 {
            for x in 106..406 {
                image.put_pixel(x, y, image::Rgba([32, 84, 136, 255]));
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
            width: 192,
            height: 192,
        };
        let alpha_target = PixelSize {
            width: 128,
            height: 160,
        };
        let expected_anchor = AnchorPoint { x: 96.0, y: 176.0 };
        assert!(deterministic_spatial_board_cutout_v11(
            &source,
            &source_id,
            &source_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "bottom",
        )
        .is_err());
        let (output, evidence) = deterministic_occlusion_tolerant_spatial_board_cutout_v12(
            &source,
            &source_id,
            &source_hash,
            &frame_size,
            &alpha_target,
            &expected_anchor,
            "bottom",
        )
        .unwrap();
        assert_eq!(
            evidence.implementation,
            OCCLUSION_TOLERANT_SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
        );
        assert!(evidence
            .spatial_board_model
            .as_ref()
            .and_then(|model| model.interpolated_node_count)
            .is_some_and(|count| count > 0));
        let pixels = inspect_pixels(&output, "bottom").unwrap();
        assert!(!pixels.edge_contact);
        assert_eq!(pixels.anchor, expected_anchor);
    }

    #[test]
    fn deterministic_cutout_trims_scales_and_anchors_reproducibly() {
        let mut image = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 255, 255]));
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
        assert_eq!(evidence.white_threshold, None);
        assert_eq!(evidence.background_color, Some([255, 0, 255]));
        assert_eq!(
            evidence.color_distance_threshold,
            Some(CHROMA_BACKGROUND_DISTANCE_SQUARED)
        );
        assert_eq!(evidence.matting_route.as_deref(), Some(CUTOUT_ROUTE));
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
        assert_eq!(
            inspect_pixels(&first, "feet").unwrap().anchor,
            expected_anchor
        );
    }

    #[test]
    fn adaptive_cutout_keys_magenta_and_removes_edge_contamination() {
        let mut image = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 255, 255]));
        for y in 2..6 {
            for x in 2..6 {
                image.put_pixel(x, y, image::Rgba([20, 40, 80, 255]));
            }
        }
        image.put_pixel(2, 3, image::Rgba([220, 10, 225, 255]));
        image.put_pixel(4, 4, image::Rgba([255, 0, 255, 255]));
        let mut source = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut source),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        let matte = matte_adaptive_board(&source).unwrap();
        assert_eq!(matte.background_color, Some([255, 0, 255]));
        assert_eq!(matte.route, ADAPTIVE_BOARD_CUTOUT_ROUTE);
        assert_eq!(matte.image.get_pixel(0, 0).0, [0, 0, 0, 0]);
        assert_eq!(matte.image.get_pixel(3, 3).0, [20, 40, 80, 255]);
        assert_eq!(matte.image.get_pixel(4, 4).0, [0, 0, 0, 0]);
        let edge = matte.image.get_pixel(2, 3).0;
        assert!(edge[3] < 255);
        assert!(edge[0] < 220 || edge[2] < 225);
    }

    #[test]
    fn chroma_trimap_reconstructs_foreground_color_instead_of_retaining_board_spill() {
        let board = [255_u8, 0, 255];
        let foreground = [20_u8, 40, 80];
        let blended = [138_u8, 20, 168];
        let mut image =
            image::RgbaImage::from_pixel(9, 9, image::Rgba([board[0], board[1], board[2], 255]));
        for y in 2..7 {
            for x in 2..7 {
                let pixel = if x == 2 || x == 6 || y == 2 || y == 6 {
                    blended
                } else {
                    foreground
                };
                image.put_pixel(x, y, image::Rgba([pixel[0], pixel[1], pixel[2], 255]));
            }
        }
        let mut source = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(
                &mut std::io::Cursor::new(&mut source),
                image::ImageOutputFormat::Png,
            )
            .unwrap();

        let matte = matte_chroma_trimap_ml_v4(&source).unwrap();
        assert_eq!(matte.route, CHROMA_ML_CUTOUT_ROUTE);
        let edge = matte.image.get_pixel(2, 4).0;
        let reconstructed_error = (0..3)
            .map(|channel| (i16::from(edge[channel]) - i16::from(foreground[channel])).abs())
            .sum::<i16>();
        let contaminated_error = (0..3)
            .map(|channel| (i16::from(blended[channel]) - i16::from(foreground[channel])).abs())
            .sum::<i16>();
        assert!(edge[3] > ALPHA_THRESHOLD && edge[3] < 255);
        assert!(reconstructed_error < contaminated_error);
    }

    #[test]
    fn normalized_v3_cutout_remains_replayable() {
        let mut image = image::RgbaImage::from_pixel(8, 8, image::Rgba([255, 0, 255, 255]));
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
        let (_, evidence) = deterministic_cutout_v3(
            &source,
            &source_id,
            &source_hash,
            &PixelSize {
                width: 8,
                height: 8,
            },
            &PixelSize {
                width: 6,
                height: 6,
            },
            &AnchorPoint { x: 4.0, y: 7.0 },
            "feet",
        )
        .unwrap();
        assert_eq!(
            evidence.implementation,
            ADAPTIVE_BOARD_CUTOUT_IMPLEMENTATION
        );
        assert_eq!(
            evidence.color_distance_threshold,
            Some(CUTOUT_BACKGROUND_DISTANCE)
        );
        assert_eq!(
            evidence.matting_route.as_deref(),
            Some(ADAPTIVE_BOARD_CUTOUT_ROUTE)
        );
    }

    #[test]
    fn normalized_v2_cutout_remains_replayable() {
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
        let (_, evidence) = deterministic_cutout_v2(
            &source,
            &source_id,
            &source_hash,
            &PixelSize {
                width: 8,
                height: 8,
            },
            &PixelSize {
                width: 6,
                height: 6,
            },
            &AnchorPoint { x: 4.0, y: 7.0 },
            "feet",
        )
        .unwrap();
        assert_eq!(evidence.implementation, WHITE_BOARD_CUTOUT_IMPLEMENTATION);
        assert_eq!(evidence.white_threshold, Some(CUTOUT_WHITE_THRESHOLD));
        assert!(evidence.background_color.is_none());
        assert!(evidence.matting_route.is_none());
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
    #[ignore = "requires CUTOUT_REAL_GAME_SOURCE_PATH and CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_PATH"]
    fn normalizes_one_retained_real_qwen_chroma_source_without_provider_calls() {
        let source_path = std::env::var("CUTOUT_REAL_GAME_SOURCE_PATH")
            .expect("CUTOUT_REAL_GAME_SOURCE_PATH is required");
        let output_path = std::env::var("CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_PATH")
            .expect("CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_PATH is required");
        let source = std::fs::read(&source_path)
            .expect("could not read the retained real Qwen source bytes");
        let source_hash = sha256(&source);
        let source_id = format!("artifact:sha256:{source_hash}");
        let started = std::time::Instant::now();
        let (output, processing_evidence) = deterministic_cutout(
            &source,
            &source_id,
            &source_hash,
            &PixelSize {
                width: 1024,
                height: 1024,
            },
            &PixelSize {
                width: 640,
                height: 800,
            },
            &AnchorPoint { x: 512.0, y: 912.0 },
            "feet",
        )
        .expect("retained real Qwen chroma source could not be normalized");
        let elapsed_millis = started.elapsed().as_millis();
        let pixel_evidence = inspect_pixels(&output, "feet")
            .expect("normalized retained real Qwen output is invalid");
        assert_eq!(processing_evidence.implementation, CUTOUT_IMPLEMENTATION);
        assert!(!pixel_evidence.edge_contact);
        assert!((pixel_evidence.anchor.x - 512.0).abs() <= 0.5);
        assert!((pixel_evidence.anchor.y - 912.0).abs() <= 0.5);
        std::fs::write(&output_path, &output)
            .expect("could not retain the real v5 normalized output");
        let summary_path = format!("{output_path}.json");
        let summary = serde_json::to_vec_pretty(&serde_json::json!({
            "schema": "cutout.game-asset-real-normalization.v5",
            "providerCalls": 0,
            "sourcePath": source_path,
            "outputPath": output_path,
            "elapsedMillis": elapsed_millis,
            "processingEvidence": processing_evidence,
            "pixelEvidence": pixel_evidence,
        }))
        .expect("could not encode the real v5 normalization summary");
        std::fs::write(summary_path, summary)
            .expect("could not retain the real v5 normalization summary");
    }

    #[test]
    #[ignore = "requires one retained 512px grounded Game source and an output path"]
    fn derives_one_retained_real_verified_grounded_source_without_provider_calls() {
        let source_path = std::env::var("CUTOUT_REAL_GAME_SOURCE_PATH")
            .expect("CUTOUT_REAL_GAME_SOURCE_PATH is required");
        let output_path = std::env::var("CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_PATH")
            .expect("CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_PATH is required");
        let source = std::fs::read(&source_path)
            .expect("could not read the retained real grounded source bytes");
        let source_hash = sha256(&source);
        let source_id = format!("artifact:sha256:{source_hash}");
        let (output, processing_evidence) = normalize_verified_alpha_grounded_v8(
            &source,
            &source_id,
            &source_hash,
            &PixelSize {
                width: 512,
                height: 512,
            },
            &PixelSize {
                width: 448,
                height: 420,
            },
            &AnchorPoint { x: 256.0, y: 466.0 },
            "feet",
        )
        .expect("retained real grounded source could not be normalized");
        let pixel_evidence = inspect_pixels(&output, "feet")
            .expect("normalized retained real grounded output is invalid");
        assert_eq!(
            processing_evidence.implementation,
            GROUNDED_NORMALIZATION_IMPLEMENTATION
        );
        assert_eq!(
            processing_evidence.alpha_target,
            Some(PixelSize {
                width: 448,
                height: 420,
            })
        );
        assert!(!pixel_evidence.edge_contact);
        assert!((pixel_evidence.anchor.x - 256.0).abs() <= 0.5);
        assert!((pixel_evidence.anchor.y - 466.0).abs() <= 0.5);
        std::fs::write(&output_path, &output)
            .expect("could not retain the real v8 normalized grounded output");
        let summary = serde_json::to_vec_pretty(&serde_json::json!({
            "schema": "cutout.game-asset-real-normalization.v8",
            "providerCalls": 0,
            "sourcePath": source_path,
            "outputPath": output_path,
            "processingEvidence": processing_evidence,
            "pixelEvidence": pixel_evidence,
        }))
        .expect("could not encode the real v8 grounded normalization summary");
        std::fs::write(format!("{output_path}.json"), summary)
            .expect("could not retain the real v8 grounded normalization summary");
    }

    #[test]
    #[ignore = "requires CUTOUT_REAL_GAME_SOURCE_DIR and CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_DIR"]
    fn normalizes_retained_real_qwen_sources_without_provider_calls() {
        let source_dir = std::env::var("CUTOUT_REAL_GAME_SOURCE_DIR")
            .expect("CUTOUT_REAL_GAME_SOURCE_DIR is required");
        let output_dir = std::env::var("CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_DIR")
            .expect("CUTOUT_REAL_GAME_NORMALIZED_OUTPUT_DIR is required");
        std::fs::create_dir_all(&output_dir).expect("could not create normalized output directory");
        let frame_size = PixelSize {
            width: 1024,
            height: 1024,
        };
        let alpha_target = PixelSize {
            width: 640,
            height: 800,
        };
        let expected_anchor = AnchorPoint { x: 512.0, y: 912.0 };
        let mut summaries = Vec::new();
        for frame_index in 1..=4 {
            let source_name = format!("frame-{frame_index:02}-source.png");
            let source = std::fs::read(std::path::Path::new(&source_dir).join(&source_name))
                .expect("could not read retained real Qwen source bytes");
            let source_hash = sha256(&source);
            let source_id = format!("artifact:sha256:{source_hash}");
            let (output, processing_evidence) = deterministic_cutout(
                &source,
                &source_id,
                &source_hash,
                &frame_size,
                &alpha_target,
                &expected_anchor,
                "feet",
            )
            .expect("retained real Qwen source could not be normalized");
            let pixel_evidence =
                inspect_pixels(&output, "feet").expect("normalized real output is invalid");
            let width_slack = alpha_target.width - pixel_evidence.alpha_bounds.width;
            let height_slack = alpha_target.height - pixel_evidence.alpha_bounds.height;
            assert!(width_slack <= 1 || height_slack <= 1);
            assert!(!pixel_evidence.edge_contact);
            assert!((pixel_evidence.anchor.x - expected_anchor.x).abs() <= 0.5);
            assert!((pixel_evidence.anchor.y - expected_anchor.y).abs() <= 0.5);
            let output_name = format!("frame-{frame_index:02}-cutout-v5.png");
            std::fs::write(std::path::Path::new(&output_dir).join(&output_name), output)
                .expect("could not retain normalized real Qwen output");
            summaries.push(serde_json::json!({
                "frame": frame_index,
                "sourceFile": source_name,
                "outputFile": output_name,
                "processingEvidence": processing_evidence,
                "pixelEvidence": pixel_evidence,
            }));
        }
        let summary = serde_json::to_vec_pretty(&serde_json::json!({
            "schema": "cutout.game-asset-real-normalization.v5",
            "providerCalls": 0,
            "frames": summaries,
        }))
        .expect("could not encode normalized real Qwen evidence");
        std::fs::write(
            std::path::Path::new(&output_dir).join("normalization-summary.json"),
            summary,
        )
        .expect("could not retain normalized real Qwen evidence");
    }

    #[test]
    #[ignore = "requires CUTOUT_REAL_GAME_APPLY_RESULT with retained signed real outputs"]
    fn reverifies_a_retained_real_generation_authorization_without_provider_calls() {
        let path = std::env::var("CUTOUT_REAL_GAME_APPLY_RESULT")
            .expect("CUTOUT_REAL_GAME_APPLY_RESULT is required");
        let bytes = std::fs::read(path).expect("could not read retained real apply result");
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).expect("retained real apply result is not strict JSON");
        let authorization: GameAssetGenerationAuthorization = serde_json::from_value(
            value
                .get("authorization")
                .cloned()
                .expect("retained real apply result lacks authorization"),
        )
        .expect("retained real authorization is invalid");
        let outputs: Vec<RetainedRoleOutput> = serde_json::from_value(
            value
                .get("outputs")
                .cloned()
                .expect("retained real apply result lacks outputs"),
        )
        .expect("retained real outputs are invalid");

        let verified = verify_generation_authorization(authorization, outputs)
            .expect("retained real authorization failed native reverification");
        assert_eq!(verified.status, "succeeded");
        assert_eq!(verified.outputs.len(), 4);
        assert_eq!(
            verified.processor_implementation,
            CHROMA_ML_CUTOUT_IMPLEMENTATION
        );
    }

    #[test]
    #[ignore = "requires CUTOUT_REAL_GAME_ACTION_SHEET_APPLY_RESULT and CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT"]
    fn reverifies_a_retained_real_v5_action_sheet_without_provider_calls() {
        let apply_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_APPLY_RESULT")
            .expect("CUTOUT_REAL_GAME_ACTION_SHEET_APPLY_RESULT is required");
        let preview_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT")
            .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT is required");
        let apply_value: Value = serde_json::from_slice(
            &std::fs::read(apply_path).expect("could not read retained action-sheet result"),
        )
        .expect("retained action-sheet result is not strict JSON");
        let preview_value: Value = serde_json::from_slice(
            &std::fs::read(preview_path).expect("could not read retained action-sheet preview"),
        )
        .expect("retained action-sheet preview is not strict JSON");
        let authorization: GameAssetActionSheetAuthorization = serde_json::from_value(
            apply_value
                .get("authorization")
                .cloned()
                .expect("retained action-sheet result lacks authorization"),
        )
        .expect("retained action-sheet authorization is invalid");
        let source: GameAssetActionSource = serde_json::from_value(
            apply_value
                .get("source")
                .cloned()
                .expect("retained action-sheet result lacks source"),
        )
        .expect("retained action-sheet source is invalid");
        let clip: GameAssetActionClip = serde_json::from_value(
            apply_value
                .get("clip")
                .cloned()
                .expect("retained action-sheet result lacks clip"),
        )
        .expect("retained action-sheet clip is invalid");
        let plan = preview_value
            .get("plan")
            .cloned()
            .expect("retained action-sheet preview lacks plan");

        let verified = verify_action_sheet_authorization(authorization, plan, source, clip)
            .expect("retained v5 action sheet failed native byte replay");
        assert!(verified
            .cells
            .iter()
            .all(|cell| { cell.processing_evidence.implementation == V5_CUTOUT_IMPLEMENTATION }));
    }

    #[test]
    #[ignore = "requires CUTOUT_REAL_GAME_BUNDLE with retained signed real outputs"]
    fn compiles_a_retained_real_game_bundle_without_provider_calls() {
        let path =
            std::env::var("CUTOUT_REAL_GAME_BUNDLE").expect("CUTOUT_REAL_GAME_BUNDLE is required");
        let bytes = std::fs::read(&path).expect("could not read retained real Game bundle");
        let value: Value =
            serde_json::from_slice(&bytes).expect("retained real Game bundle is not strict JSON");
        let plan = value
            .get("plan")
            .cloned()
            .expect("retained real Game bundle lacks plan");
        let authorization: GameAssetGenerationAuthorization = serde_json::from_value(
            value
                .get("authorization")
                .cloned()
                .expect("retained real Game bundle lacks authorization"),
        )
        .expect("retained real Game authorization is invalid");
        let frames = value
            .get("frames")
            .and_then(Value::as_array)
            .expect("retained real Game bundle lacks frames");
        let outputs = frames
            .iter()
            .map(|frame| {
                let mut output = frame.clone();
                let object = output
                    .as_object_mut()
                    .expect("retained real Game frame is not an object");
                let source_media_type = object
                    .get("receipt")
                    .and_then(|receipt| receipt.get("artifact"))
                    .and_then(|artifact| artifact.get("mediaType"))
                    .cloned()
                    .expect("retained real Game frame lacks source media type");
                object.insert("sourceMediaType".into(), source_media_type);
                object.insert("mediaType".into(), Value::String("image/png".into()));
                serde_json::from_value::<RetainedRoleOutput>(output)
                    .expect("retained real Game frame cannot reconstruct a native output")
            })
            .collect::<Vec<_>>();

        let compiled = compile_game_asset_bundle(plan, authorization, outputs, None)
            .expect("retained real Game bundle failed native atlas compilation");
        assert_eq!(compiled.delivery_status, "candidate");
        assert_eq!(compiled.manifest.frames.len(), 4);
        assert_eq!(compiled.manifest.animations.len(), 1);
        assert_eq!(compiled.manifest.atlas.width, 4_096);
        assert_eq!(compiled.manifest.atlas.height, 1_024);

        let output_root = std::path::Path::new(&path)
            .parent()
            .expect("retained real Game bundle parent is unavailable")
            .join("runtime-bundle-candidate");
        std::fs::create_dir_all(&output_root)
            .expect("could not create the real runtime bundle directory");
        std::fs::write(
            output_root.join("atlas.png"),
            STANDARD
                .decode(&compiled.atlas_bytes_base64)
                .expect("compiled real atlas base64 is invalid"),
        )
        .expect("could not retain the real runtime atlas");
        std::fs::write(
            output_root.join("manifest.json"),
            STANDARD
                .decode(&compiled.manifest_bytes_base64)
                .expect("compiled real manifest base64 is invalid"),
        )
        .expect("could not retain the real runtime manifest");
        std::fs::write(
            output_root.join("compiled-bundle.json"),
            serde_json::to_vec_pretty(&compiled).expect("could not encode compiled real bundle"),
        )
        .expect("could not retain the compiled real bundle evidence");
        println!("REAL_GAME_RUNTIME_BUNDLE={}", output_root.display());
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
    #[ignore = "requires a retained action-sheet preview, configured Cutout Provider file, keychain access, network, and real Qwen execution"]
    fn executes_and_retains_a_real_qwen_action_sheet_without_gui_automation() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create the real Game Asset action-sheet runtime");
        runtime.block_on(async {
            let input_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT")
                .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT is required");
            let provider_path = std::env::var("CUTOUT_REAL_PROVIDER_CONFIG")
                .expect("CUTOUT_REAL_PROVIDER_CONFIG is required");
            let input_bytes = std::fs::read(input_path)
                .expect("could not read the retained real action-sheet request");
            let input: GameAssetActionSheetPreviewInput = serde_json::from_slice(&input_bytes)
                .expect("the retained action-sheet request is not strict JSON");
            let plan = input.plan.clone();
            let provider_bytes = std::fs::read(provider_path)
                .expect("could not read Cutout's non-secret Provider configuration");
            let providers: Vec<super::super::providers::ProviderConfig> =
                serde_json::from_slice(&provider_bytes)
                    .expect("Cutout's Provider configuration is invalid");
            let provider = providers
                .iter()
                .find(|provider| provider.id == input.provider_id)
                .expect("the retained action-sheet Provider is not configured");
            dashscope_image::validate_provider_record(provider, &input.provider_id)
                .expect("the action-sheet request is not bound to an enabled DashScope Provider");
            assert_model_in_provider_catalog(provider, &input.model, "retained action-sheet");
            let secret = super::super::keys::read_secret(&input.provider_id)
                .expect("the action-sheet Provider key is unavailable in Cutout's keychain");
            let stored = preview_action_sheet_request(input, unix_millis().unwrap())
                .expect("native preview rejected the retained real action-sheet request");
            let result = execute_stored_action_sheet_preview(stored, move |request| {
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
            .expect("the native action-sheet execution boundary failed");
            let serialized = serde_json::to_vec_pretty(&result)
                .expect("could not encode the native action-sheet result");
            let attempt_id = result
                .authorization
                .as_ref()
                .map(|authorization| authorization.receipt_hash.clone())
                .or_else(|| {
                    result
                        .partial_authorization
                        .as_ref()
                        .map(|authorization| authorization.receipt_hash.clone())
                })
                .unwrap_or_else(|| format!("partial-sha256-{}", sha256(&serialized)));
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("the repository root is unavailable")
                .join(".trellis/tasks/08-14-multi-action-sprite-family/research/production-rehearsal-2026-08-14")
                .join(attempt_id);
            std::fs::create_dir_all(&root)
                .expect("could not create the real action-sheet rehearsal directory");
            if let Some(source) = &result.source {
                std::fs::write(
                    root.join("action-source.png"),
                    STANDARD
                        .decode(&source.source.bytes_base64)
                        .expect("retained action source base64 is invalid"),
                )
                .expect("could not retain the real action source");
                for (index, cell) in source.cells.iter().enumerate() {
                    std::fs::write(
                        root.join(format!("cell-{:02}-source.png", index + 1)),
                        STANDARD
                            .decode(&cell.artifact.bytes_base64)
                            .expect("retained action cell base64 is invalid"),
                    )
                    .expect("could not retain a real action cell");
                }
            }
            if let Some(clip) = &result.clip {
                for (index, frame) in clip.frames.iter().enumerate() {
                    std::fs::write(
                        root.join(format!("frame-{:02}-cutout.png", index + 1)),
                        STANDARD
                            .decode(&frame.artifact_bytes_base64)
                            .expect("retained action frame base64 is invalid"),
                    )
                    .expect("could not retain a real action frame");
                }
            }
            if let Some(partial) = &result.partial {
                for (index, frame) in partial.frames.iter().enumerate() {
                    std::fs::write(
                        root.join(format!("partial-frame-{:02}-cutout.png", index + 1)),
                        STANDARD
                            .decode(&frame.artifact_bytes_base64)
                            .expect("retained partial action frame base64 is invalid"),
                    )
                    .expect("could not retain a real partial action frame");
                }
            }
            std::fs::write(root.join("apply-result.json"), &serialized)
                .expect("could not retain the real action-sheet apply result");
            if result.status != "succeeded" {
                println!("REAL_GAME_ACTION_SHEET_ATTEMPT={}", root.display());
                panic!(
                    "real Game Asset action sheet failed: {}",
                    result.error.as_deref().unwrap_or("unknown failure")
                );
            }
            verify_action_sheet_authorization(
                result
                    .authorization
                    .clone()
                    .expect("successful action sheet lacks signed authorization"),
                plan,
                result.source.clone().expect("successful action sheet lacks source"),
                result.clip.clone().expect("successful action sheet lacks clip"),
            )
            .expect("the retained real action sheet failed native reverification");
            println!("REAL_GAME_ACTION_SHEET={}", root.display());
        });
    }

    #[test]
    #[ignore = "requires a retained real action-sheet parent, configured Cutout Provider file, keychain access, network, and one real Qwen Edit"]
    fn repairs_one_retained_real_qwen_action_sheet_cell_without_regenerating_siblings() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create the real action-sheet repair runtime");
        runtime.block_on(async {
            let input_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT")
                .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT is required");
            let parent_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PARENT_APPLY_RESULT")
                .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PARENT_APPLY_RESULT is required");
            let repair_role_id = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_REPAIR_ROLE_ID")
                .expect("CUTOUT_REAL_GAME_ACTION_SHEET_REPAIR_ROLE_ID is required");
            let provider_path = std::env::var("CUTOUT_REAL_PROVIDER_CONFIG")
                .expect("CUTOUT_REAL_PROVIDER_CONFIG is required");
            let input: GameAssetActionSheetPreviewInput = serde_json::from_slice(
                &std::fs::read(input_path).expect("could not read the action-sheet preview input"),
            )
            .expect("the action-sheet preview input is not strict JSON");
            let parent_value: Value = serde_json::from_slice(
                &std::fs::read(parent_path).expect("could not read the parent action-sheet result"),
            )
            .expect("the parent action-sheet result is not strict JSON");
            let parent_authorization: GameAssetActionSheetAuthorization = serde_json::from_value(
                parent_value
                    .get("authorization")
                    .cloned()
                    .expect("the parent action-sheet result lacks authorization"),
            )
            .expect("the parent action-sheet authorization is invalid");
            let parent_source: GameAssetActionSource = serde_json::from_value(
                parent_value
                    .get("source")
                    .cloned()
                    .expect("the parent action-sheet result lacks source"),
            )
            .expect("the parent action source is invalid");
            let parent_clip: GameAssetActionClip = serde_json::from_value(
                parent_value
                    .get("clip")
                    .cloned()
                    .expect("the parent action-sheet result lacks clip"),
            )
            .expect("the parent action clip is invalid");
            verify_action_sheet_authorization(
                parent_authorization.clone(),
                input.plan.clone(),
                parent_source.clone(),
                parent_clip.clone(),
            )
            .expect("the retained parent action sheet failed native reverification");
            let role = input
                .plan
                .get("roles")
                .and_then(Value::as_array)
                .and_then(|roles| {
                    roles.iter().find(|role| {
                        role.get("id").and_then(Value::as_str) == Some(repair_role_id.as_str())
                    })
                })
                .expect("the selected repair role is absent from the parent plan");
            let action = role
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or("attack");
            let direction = role
                .get("direction")
                .and_then(Value::as_str)
                .unwrap_or("right");
            let repair_input = GameAssetActionSheetRepairPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_source: parent_source.clone(),
                parent_clip: parent_clip.clone(),
                run_id: format!(
                    "run:game-family-action-sheet-repair:{}",
                    uuid::Uuid::new_v4().simple()
                ),
                plan: input.plan.clone(),
                roles: vec![ActionSheetRepairRolePromptInput {
                    role_id: repair_role_id.clone(),
                    prompt: format!(
                        "Repair only this failed {action} {direction}-facing sprite cell from the supplied action sheet and its cell reference. Remove any floor line, ground plane, contact shadow, or horizontal baseline. Keep exactly one complete subject, preserve identity, proportions, palette, side view, direction, scale, and feet anchor. Keep every pixel inside this cell; do not render a sheet, duplicate, comparison, or neighboring frame."
                    ),
                }],
            };
            let provider_bytes = std::fs::read(provider_path)
                .expect("could not read Cutout's non-secret Provider configuration");
            let providers: Vec<super::super::providers::ProviderConfig> =
                serde_json::from_slice(&provider_bytes)
                    .expect("Cutout's Provider configuration is invalid");
            let provider = providers
                .iter()
                .find(|provider| provider.id == parent_authorization.provider_id)
                .expect("the parent Provider is not configured");
            dashscope_image::validate_provider_record(provider, &parent_authorization.provider_id)
                .expect("the parent Provider is not an enabled native DashScope Provider");
            assert_model_in_provider_catalog(provider, &parent_authorization.model, "parent");
            let secret = super::super::keys::read_secret(&parent_authorization.provider_id)
                .expect("the parent Provider key is unavailable in Cutout's keychain");
            let stored = preview_action_sheet_repair_request(
                repair_input,
                unix_millis().unwrap(),
            )
            .expect("native action-sheet repair preview rejected the retained parent closure");
            let observable_preview = stored.preview.clone();
            let result = execute_stored_action_sheet_repair(stored, move |request| {
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
            .expect("the native action-sheet repair boundary failed");
            let serialized = serde_json::to_vec_pretty(&result)
                .expect("could not encode the native action-sheet repair result");
            let attempt_id = result
                .authorization
                .as_ref()
                .map(|authorization| authorization.receipt_hash.clone())
                .unwrap_or_else(|| format!("partial-repair-sha256-{}", sha256(&serialized)));
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("the repository root is unavailable")
                .join(".trellis/tasks/08-14-multi-action-sprite-family/research/production-rehearsal-2026-08-14")
                .join(format!("repair-{attempt_id}"));
            std::fs::create_dir_all(&root)
                .expect("could not create the real action-sheet repair directory");
            std::fs::write(
                root.join("repair-preview.json"),
                serde_json::to_vec_pretty(&observable_preview)
                    .expect("could not encode the repair preview"),
            )
            .expect("could not retain the repair preview");
            std::fs::write(root.join("apply-result.json"), &serialized)
                .expect("could not retain the action-sheet repair result");
            for (index, output) in result.outputs.iter().enumerate() {
                let source = STANDARD
                    .decode(&output.source_artifact_bytes_base64)
                    .expect("retained repair source bytes are invalid");
                let processed = STANDARD
                    .decode(&output.artifact_bytes_base64)
                    .expect("retained repair output bytes are invalid");
                std::fs::write(root.join(format!("replacement-{:02}-source.png", index + 1)), source)
                    .expect("could not retain a repair source cell");
                std::fs::write(root.join(format!("replacement-{:02}-cutout.png", index + 1)), processed)
                    .expect("could not retain a repair cutout cell");
            }
            if result.status != "succeeded" {
                println!("REAL_GAME_ACTION_SHEET_REPAIR_ATTEMPT={}", root.display());
                panic!(
                    "real action-sheet repair was partial: {}",
                    result.error.as_deref().unwrap_or("unknown failure")
                );
            }
            let authorization = result
                .authorization
                .clone()
                .expect("successful repair lacks signed authorization");
            verify_action_sheet_repair_authorization(
                authorization,
                input.plan,
                parent_authorization,
                parent_source,
                parent_clip,
                result.outputs.clone(),
            )
            .expect("the retained real action-sheet repair failed native reverification");
            assert_eq!(result.outputs.len(), 1);
            assert_eq!(result.outputs[0].role_id, repair_role_id);
            println!("REAL_GAME_ACTION_SHEET_REPAIR={}", root.display());
        });
    }

    #[test]
    #[ignore = "requires the retained real partial action-sheet reprocess input; performs zero Provider calls"]
    fn reprocesses_a_retained_real_spatial_board_partial_with_zero_provider_calls() {
        let input_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PARTIAL_REPROCESS_INPUT")
            .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PARTIAL_REPROCESS_INPUT is required");
        let repair_input: GameAssetActionSheetPartialRepairPreviewInput = serde_json::from_slice(
            &std::fs::read(input_path).expect("could not read the partial reprocess input"),
        )
        .expect("the partial reprocess input must be the strict retained partial-repair input");
        let input = GameAssetActionSheetPartialReprocessPreviewInput {
            parent_authorization: repair_input.parent_authorization,
            parent_source: repair_input.parent_source,
            parent_partial: repair_input.parent_partial,
            plan: repair_input.plan,
        };
        let stored = preview_action_sheet_partial_reprocess_request(input, unix_millis().unwrap())
            .expect("native local reprocess preview rejected the retained real parent");
        let preview = stored.preview.clone();
        assert_eq!(preview.provider_calls, 0);
        let started_at = unix_millis().unwrap();
        let clip = derive_partial_reprocessed_clip(&stored)
            .expect("native local reprocess could not close the retained real failures");
        let completed_at = unix_millis().unwrap();
        let authorization = issue_action_sheet_partial_reprocess_authorization(
            &stored,
            &clip,
            format!(
                "execution:game-asset-action-sheet-partial-reprocess:{}",
                uuid::Uuid::new_v4().simple()
            ),
            started_at,
            completed_at,
        )
        .expect("native local reprocess could not issue authorization");
        verify_action_sheet_partial_reprocess_authorization(
            authorization.clone(),
            stored.plan_value.clone(),
            stored.parent_authorization.clone(),
            stored.parent_source.clone(),
            stored.parent_partial.clone(),
            clip.clone(),
        )
        .expect("retained real local reprocess failed native reconstruction");
        assert_eq!(authorization.provider_calls, 0);
        assert_eq!(authorization.reprocessed_role_ids.len(), 2);
        assert_eq!(authorization.preserved_cells.len(), 4);
        assert_eq!(clip.frames.len(), 6);
        assert_eq!(
            authorization.reprocessed_role_ids,
            vec![
                clip.frames[0].role_id.clone(),
                clip.frames[3].role_id.clone()
            ]
        );
        for index in [0_usize, 3] {
            assert_eq!(
                clip.frames[index].processing_evidence.implementation,
                SPATIAL_BOARD_CUTOUT_IMPLEMENTATION
            );
        }
        for index in [1_usize, 2, 4, 5] {
            let parent_frame = stored
                .parent_partial
                .frames
                .iter()
                .find(|frame| frame.role_id == clip.frames[index].role_id)
                .expect("a preserved parent frame disappeared");
            assert_eq!(
                serde_json::to_value(&clip.frames[index])
                    .expect("could not encode the reprocessed sibling"),
                serde_json::to_value(parent_frame)
                    .expect("could not encode the preserved parent sibling")
            );
        }
        assert!(clip
            .frames
            .iter()
            .all(|frame| !frame.pixel_evidence.edge_contact));

        let result = GameAssetActionSheetPartialReprocessApplyResult {
            status: "succeeded".into(),
            parent_source_id: stored.parent_source.id.clone(),
            parent_partial_id: stored.parent_partial.id.clone(),
            clip: Some(clip.clone()),
            authorization: Some(authorization.clone()),
            provider_calls: 0,
            error: None,
        };
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("the repository root is unavailable")
            .join(".trellis/tasks/08-14-multi-action-sprite-family/research/production-rehearsal-2026-08-14")
            .join(format!("local-partial-reprocess-{}", authorization.receipt_hash));
        std::fs::create_dir_all(&root)
            .expect("could not create the retained local reprocess directory");
        std::fs::write(
            root.join("reprocess-preview.json"),
            serde_json::to_vec_pretty(&preview).expect("could not encode local reprocess preview"),
        )
        .expect("could not retain local reprocess preview");
        std::fs::write(
            root.join("apply-result.json"),
            serde_json::to_vec_pretty(&result).expect("could not encode local reprocess result"),
        )
        .expect("could not retain local reprocess result");
        let frame_width = stored.plan.delivery.frame_width;
        let frame_height = stored.plan.delivery.frame_height;
        let mut strip = image::RgbaImage::new(frame_width * clip.frames.len() as u32, frame_height);
        for (index, frame) in clip.frames.iter().enumerate() {
            let bytes = STANDARD
                .decode(&frame.artifact_bytes_base64)
                .expect("retained local reprocess frame base64 is invalid");
            std::fs::write(root.join(format!("frame-{:02}.png", index + 1)), &bytes)
                .expect("could not retain local reprocess frame");
            let image = decode_bounded_image(&bytes)
                .expect("retained local reprocess frame is invalid")
                .to_rgba8();
            image::imageops::overlay(&mut strip, &image, frame_width * index as u32, 0);
        }
        std::fs::write(
            root.join("fx-review-strip.png"),
            encode_cutout_png(&strip).expect("could not encode local reprocess review strip"),
        )
        .expect("could not retain local reprocess review strip");
        println!(
            "REAL_GAME_ACTION_SHEET_PARTIAL_REPROCESS={}",
            root.display()
        );
    }

    #[test]
    #[ignore = "requires a retained real partial action-sheet parent, configured Cutout Provider file, keychain access, network, and one real Qwen Edit per failed cell"]
    fn repairs_a_retained_real_qwen_partial_action_sheet_without_regenerating_siblings() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create the real partial action-sheet repair runtime");
        runtime.block_on(async {
            let input_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT")
                .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT is required");
            let parent_path = std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PARENT_APPLY_RESULT")
                .expect("CUTOUT_REAL_GAME_ACTION_SHEET_PARENT_APPLY_RESULT is required");
            let provider_path = std::env::var("CUTOUT_REAL_PROVIDER_CONFIG")
                .expect("CUTOUT_REAL_PROVIDER_CONFIG is required");
            let supplied_repair_input =
                std::env::var("CUTOUT_REAL_GAME_ACTION_SHEET_PARTIAL_REPAIR_INPUT")
                    .ok()
                    .map(|path| {
                        serde_json::from_slice::<GameAssetActionSheetPartialRepairPreviewInput>(
                            &std::fs::read(path)
                                .expect("could not read the partial repair preview input"),
                        )
                        .expect("the partial repair preview input is not strict JSON")
                    });
            let input: GameAssetActionSheetPreviewInput = serde_json::from_slice(
                &std::fs::read(input_path).expect("could not read the action-sheet preview input"),
            )
            .expect("the action-sheet preview input is not strict JSON");
            let parent_value: Value = serde_json::from_slice(
                &std::fs::read(parent_path).expect("could not read the partial action-sheet result"),
            )
            .expect("the partial action-sheet result is not strict JSON");
            let parent_authorization: GameAssetActionSheetPartialAuthorization =
                serde_json::from_value(
                    parent_value
                        .get("partialAuthorization")
                        .cloned()
                        .expect("the partial action-sheet result lacks authorization"),
                )
                .expect("the partial action-sheet authorization is invalid");
            let parent_source: GameAssetActionSource = serde_json::from_value(
                parent_value
                    .get("source")
                    .cloned()
                    .expect("the partial action-sheet result lacks source"),
            )
            .expect("the partial action source is invalid");
            let parent_partial: GameAssetActionSheetPartial = serde_json::from_value(
                parent_value
                    .get("partial")
                    .cloned()
                    .expect("the partial action-sheet result lacks cell settlement"),
            )
            .expect("the partial action settlement is invalid");
            verify_action_sheet_partial_authorization(
                parent_authorization.clone(),
                input.plan.clone(),
                parent_source.clone(),
                parent_partial.clone(),
            )
            .expect("the retained partial action sheet failed native reverification");
            let plan: GamePlan = serde_json::from_value(input.plan.clone())
                .expect("the retained partial repair plan is invalid");
            let repair_roles = parent_partial
                .failures
                .iter()
                .map(|failure| {
                    let role = plan
                        .roles
                        .iter()
                        .find(|role| role.id == failure.role_id)
                        .expect("a failed role disappeared from the plan");
                    ActionSheetRepairRolePromptInput {
                        role_id: role.id.clone(),
                        prompt: format!(
                            "Repair only failed {} {}-facing frame {} from the supplied action sheet and deliberately inset composition reference. Return exactly one isolated frame, not a sheet, comparison, or neighboring frame. Use a flat, uniform pure magenta (#FF00FF) background extending to all four image edges. Treat the second reference as the required spatial composition: match its smaller centered canvas occupancy and do not enlarge the subject toward an edge. Center the complete subject and leave at least 96 pixels of uninterrupted magenta safety margin on every side, including beyond every weapon or effect tip. Preserve the accepted character identity, bladed weapon, proportions, palette, side view, and action phase. Remove any floor line, ground plane, contact shadow, or horizontal baseline.",
                            role.action, role.direction, role.frame_index
                        ),
                    }
                })
                .collect::<Vec<_>>();
            let provider_bytes = std::fs::read(provider_path)
                .expect("could not read Cutout's non-secret Provider configuration");
            let providers: Vec<super::super::providers::ProviderConfig> =
                serde_json::from_slice(&provider_bytes)
                    .expect("Cutout's Provider configuration is invalid");
            let provider = providers
                .iter()
                .find(|provider| provider.id == parent_authorization.provider_id)
                .expect("the partial parent Provider is not configured");
            dashscope_image::validate_provider_record(provider, &parent_authorization.provider_id)
                .expect("the partial parent is not an enabled native DashScope Provider");
            assert_model_in_provider_catalog(provider, &parent_authorization.model, "partial parent");
            let secret = super::super::keys::read_secret(&parent_authorization.provider_id)
                .expect("the partial parent Provider key is unavailable in Cutout's keychain");
            let repair_input = supplied_repair_input.unwrap_or_else(|| {
                GameAssetActionSheetPartialRepairPreviewInput {
                    parent_authorization: parent_authorization.clone(),
                    parent_source: parent_source.clone(),
                    parent_partial: parent_partial.clone(),
                    run_id: format!(
                        "run:game-family-action-sheet-partial-repair:{}",
                        uuid::Uuid::new_v4().simple()
                    ),
                    plan: input.plan.clone(),
                    roles: repair_roles,
                }
            });
            let stored =
                preview_action_sheet_partial_repair_request(repair_input, unix_millis().unwrap())
            .expect("native partial action-sheet repair preview rejected the retained parent");
            let observable_preview = stored.preview.clone();
            let result = execute_stored_action_sheet_partial_repair(stored, move |request| {
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
            .expect("the native partial action-sheet repair boundary failed");
            let serialized = serde_json::to_vec_pretty(&result)
                .expect("could not encode the partial action-sheet repair result");
            let attempt_id = result
                .authorization
                .as_ref()
                .map(|authorization| authorization.receipt_hash.clone())
                .unwrap_or_else(|| {
                    format!("partial-repair-sha256-{}", sha256(&serialized))
                });
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("the repository root is unavailable")
                .join(".trellis/tasks/08-14-multi-action-sprite-family/research/production-rehearsal-2026-08-14")
                .join(format!("partial-parent-repair-{attempt_id}"));
            std::fs::create_dir_all(&root)
                .expect("could not create the real partial action-sheet repair directory");
            std::fs::write(
                root.join("repair-preview.json"),
                serde_json::to_vec_pretty(&observable_preview)
                    .expect("could not encode the partial repair preview"),
            )
            .expect("could not retain the partial repair preview");
            std::fs::write(root.join("apply-result.json"), &serialized)
                .expect("could not retain the partial action-sheet repair result");
            for (index, output) in result.outputs.iter().enumerate() {
                std::fs::write(
                    root.join(format!("replacement-{:02}-source.png", index + 1)),
                    STANDARD
                        .decode(&output.source_artifact_bytes_base64)
                        .expect("retained partial repair source bytes are invalid"),
                )
                .expect("could not retain a partial repair source cell");
                std::fs::write(
                    root.join(format!("replacement-{:02}-cutout.png", index + 1)),
                    STANDARD
                        .decode(&output.artifact_bytes_base64)
                        .expect("retained partial repair output bytes are invalid"),
                )
                .expect("could not retain a partial repair cutout cell");
            }
            if let Some(attempt) = &result.failed_attempt {
                std::fs::write(
                    root.join("rejected-replacement-source.png"),
                    STANDARD
                        .decode(&attempt.source_artifact_bytes_base64)
                        .expect("retained rejected replacement source bytes are invalid"),
                )
                .expect("could not retain the rejected replacement source");
            }
            if result.status != "succeeded" {
                println!("REAL_GAME_ACTION_SHEET_PARTIAL_REPAIR_ATTEMPT={}", root.display());
                panic!(
                    "real partial action-sheet repair was incomplete: {}",
                    result.error.as_deref().unwrap_or("unknown failure")
                );
            }
            let authorization = result
                .authorization
                .clone()
                .expect("successful partial repair lacks signed authorization");
            verify_action_sheet_partial_repair_authorization(
                authorization.clone(),
                input.plan,
                parent_authorization,
                parent_source,
                parent_partial.clone(),
                result.outputs.clone(),
            )
            .expect("the retained real partial action-sheet repair failed native reverification");
            assert_eq!(
                authorization.preserved_cells,
                parent_partial
                    .frames
                    .iter()
                    .map(|frame| PreservedActionSheetCellLineage {
                        role_id: frame.role_id.clone(),
                        source_artifact_id: frame.source_artifact_id.clone(),
                        artifact_id: frame.artifact_id.clone(),
                    })
                    .collect::<Vec<_>>()
            );
            println!("REAL_GAME_ACTION_SHEET_PARTIAL_REPAIR={}", root.display());
        });
    }

    #[test]
    fn relaxed_chroma_border_uses_a_median_for_adaptive_boards() {
        let width = 32_usize;
        let height = 32_usize;
        let mut rgba = vec![0_u8; width * height * 4];
        for y in 0..height {
            for x in 0..width {
                let index = (y * width + x) * 4;
                let border = x == 0 || y == 0 || x + 1 == width || y + 1 == height;
                let shift = ((x + y) % 5) as u8 * 8;
                let pixel = if border {
                    [
                        220_u8.saturating_add(shift / 2),
                        20,
                        170_u8.saturating_sub(shift),
                        255,
                    ]
                } else {
                    [220, 20, 170, 255]
                };
                rgba[index..index + 4].copy_from_slice(&pixel);
            }
        }
        let color = estimate_relaxed_chroma_border_color(&rgba, width, height)
            .unwrap()
            .unwrap();
        assert!(color[0] > color[1] + 100);
        assert!(color[2] > color[1] + 100);
    }

    #[test]
    #[ignore = "requires retained real input, the configured Cutout Provider file, keychain access, network, and real Qwen execution"]
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
            assert_model_in_provider_catalog(provider, &input.model, "retained request");
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

    #[test]
    #[ignore = "requires a retained signed v5 parent run, configured Cutout Provider file, keychain access, network, and one real Qwen repair"]
    fn repairs_one_retained_real_qwen_role_without_regenerating_accepted_siblings() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create the real Game Asset repair runtime");
        runtime.block_on(async {
            let input_path = std::env::var("CUTOUT_REAL_GAME_PREVIEW_INPUT")
                .expect("CUTOUT_REAL_GAME_PREVIEW_INPUT is required");
            let parent_path = std::env::var("CUTOUT_REAL_GAME_PARENT_APPLY_RESULT")
                .expect("CUTOUT_REAL_GAME_PARENT_APPLY_RESULT is required");
            let repair_role_id = std::env::var("CUTOUT_REAL_GAME_REPAIR_ROLE_ID")
                .expect("CUTOUT_REAL_GAME_REPAIR_ROLE_ID is required");
            let provider_path = std::env::var("CUTOUT_REAL_PROVIDER_CONFIG")
                .expect("CUTOUT_REAL_PROVIDER_CONFIG is required");
            let original_input: GameAssetGenerationPreviewInput = serde_json::from_slice(
                &std::fs::read(input_path).expect("could not read the original preview input"),
            )
            .expect("the original preview input is not strict JSON");
            let parent_value: serde_json::Value = serde_json::from_slice(
                &std::fs::read(parent_path).expect("could not read the parent apply result"),
            )
            .expect("the parent apply result is not strict JSON");
            let parent_authorization: GameAssetGenerationAuthorization = serde_json::from_value(
                parent_value
                    .get("authorization")
                    .cloned()
                    .expect("the parent apply result lacks authorization"),
            )
            .expect("the parent authorization is invalid");
            let parent_outputs: Vec<RetainedRoleOutput> = serde_json::from_value(
                parent_value
                    .get("outputs")
                    .cloned()
                    .expect("the parent apply result lacks outputs"),
            )
            .expect("the parent outputs are invalid");
            verify_generation_authorization(
                parent_authorization.clone(),
                parent_outputs.clone(),
            )
            .expect("the parent authorization failed native reverification");
            let parent_request = parent_authorization
                .role_requests
                .iter()
                .find(|request| request.role_id == repair_role_id)
                .expect("the repair role is absent from the parent authorization");
            let repair_input = GameAssetGenerationRepairPreviewInput {
                parent_authorization: parent_authorization.clone(),
                parent_outputs: parent_outputs.clone(),
                run_id: format!(
                    "run:game-asset-repair:{}",
                    uuid::Uuid::new_v4().simple()
                ),
                plan: original_input.plan.clone(),
                retained_evidence: original_input.retained_evidence.clone(),
                roles: vec![RolePromptInput {
                    role_id: repair_role_id.clone(),
                    prompt: format!(
                        "{}\nRepair this exact role only. Render exactly ONE complete character in exactly ONE pose; no duplicate subject, sprite sheet, sequence, comparison, or contact sheet. Preserve the locked identity, proportions, clothing, palette, side view, right-facing run action, scale, and feet anchor.",
                        parent_request.prompt
                    ),
                }],
            };
            let provider_bytes = std::fs::read(provider_path)
                .expect("could not read Cutout's non-secret Provider configuration");
            let providers: Vec<super::super::providers::ProviderConfig> =
                serde_json::from_slice(&provider_bytes)
                    .expect("Cutout's Provider configuration is invalid");
            let provider = providers
                .iter()
                .find(|provider| provider.id == parent_authorization.provider_id)
                .expect("the parent Provider is not configured");
            dashscope_image::validate_provider_record(provider, &parent_authorization.provider_id)
                .expect("the parent Provider is not an enabled native DashScope Provider");
            assert_model_in_provider_catalog(provider, &parent_authorization.model, "parent");
            let secret = super::super::keys::read_secret(&parent_authorization.provider_id)
                .expect("the parent Provider key is unavailable in Cutout's keychain");
            let stored = preview_repair_request(repair_input.clone(), unix_millis().unwrap())
                .expect("native repair preview rejected the retained parent closure");
            let observable_preview = stored.preview.clone();
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
            .expect("the native Game Asset repair boundary failed");
            let serialized_result = serde_json::to_vec_pretty(&result)
                .expect("could not encode the native repair result");
            let authorization = result.authorization.clone();
            let attempt_id = authorization
                .as_ref()
                .map(|authorization| authorization.receipt_hash.clone())
                .unwrap_or_else(|| format!("partial-repair-sha256-{}", sha256(&serialized_result)));
            let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("the repository root is unavailable")
                .join(".trellis/tasks/08-13-sprite-production-workflow/research/production-rehearsal-2026-08-14/native-qwen-run")
                .join(attempt_id);
            std::fs::create_dir_all(&root)
                .expect("could not create the content-addressed repair directory");
            std::fs::write(
                root.join("repair-preview.json"),
                serde_json::to_vec_pretty(&observable_preview)
                    .expect("could not encode the observable repair preview"),
            )
            .expect("could not retain the observable repair preview");
            std::fs::write(root.join("apply-result.json"), &serialized_result)
                .expect("could not retain the native repair result");
            for (index, output) in result.outputs.iter().enumerate() {
                let source = STANDARD
                    .decode(&output.source_artifact_bytes_base64)
                    .expect("retained repair source bytes are invalid");
                let processed = STANDARD
                    .decode(&output.artifact_bytes_base64)
                    .expect("retained repair output bytes are invalid");
                std::fs::write(
                    root.join(format!("frame-{:02}-source.png", index + 1)),
                    source,
                )
                .expect("could not retain a repair source frame");
                std::fs::write(
                    root.join(format!("frame-{:02}-cutout.png", index + 1)),
                    processed,
                )
                .expect("could not retain a repair Cutout frame");
            }
            if result.status != "succeeded" {
                println!("REAL_GAME_REPAIR_ATTEMPT={}", root.display());
                panic!(
                    "real Game Asset repair was partial: {}",
                    result.error.as_deref().unwrap_or("unknown failure")
                );
            }
            let authorization = authorization.expect("successful repair lacks authorization");
            verify_generation_authorization(authorization.clone(), result.outputs.clone())
                .expect("the retained real repair failed native reverification");
            for (parent, repaired) in parent_outputs.iter().zip(&result.outputs) {
                if parent.role_id != repair_role_id {
                    assert_eq!(parent.receipt.receipt_hash, repaired.receipt.receipt_hash);
                    assert_eq!(
                        parent.artifact_bytes_base64,
                        repaired.artifact_bytes_base64
                    );
                }
            }
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
                "identity": original_input.identity,
                "runId": repair_input.run_id,
                "plan": original_input.plan,
                "authorization": authorization,
                "retainedEvidence": original_input.retained_evidence,
                "frames": frames,
            });
            std::fs::write(
                root.join("bundle.json"),
                serde_json::to_vec_pretty(&bundle).expect("could not encode the repair bundle"),
            )
            .expect("could not retain the repair bundle");
            println!("REAL_GAME_REPAIR_BUNDLE={}", root.join("bundle.json").display());
        });
    }
}
