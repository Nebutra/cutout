//! Bounded deterministic processors for production Game Map assets.
//!
//! These commands accept retained bytes, never paths or Provider credentials.
//! Geometry remains authored runtime authority; raster alpha is used only for
//! extraction QA and deterministic visual composition.

use std::{
    collections::{BTreeMap, BTreeSet, HashSet, VecDeque},
    io::Cursor,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    ai_proxy::ProxyError,
    game_asset_generation::{
        canonical_portable_bytes, encode_cutout_png, process_game_map_object_cutout,
    },
    multimodal_receipt::{
        sha256, sign_host_payload, verify_host_payload, verify_receipt, MultimodalHostReceipt,
    },
};

const PROP_EXTRACTION_PROTOCOL: &str = "cutout.game-map-prop-extraction.v1";
const TERRAIN_EXTRACTION_PROTOCOL: &str = "cutout.game-map-terrain-extraction.v1";
const RUNTIME_VALIDATION_PROTOCOL: &str = "cutout.game-map-runtime-validation.v1";
const NATIVE_PREVIEW_PROTOCOL: &str = "cutout.game-map-native-preview.v1";
const PROP_EXTRACTOR: &str = "cutout-game-map-prop-grid-rust-image-0.23-v1";
const TERRAIN_EXTRACTOR: &str = "cutout-game-map-terrain-grid-rust-image-0.23-v1";
const RUNTIME_VALIDATOR: &str = "cutout-game-map-runtime-validator-rust-v1";
const COMPOSITOR: &str = "cutout-game-map-compositor-rust-image-0.23-v1";
const LIVE_ARTIFACT_PROTOCOL: &str = "cutout.game-map-live-artifact.v1";
const LIVE_ARTIFACT_ADMISSION_PROTOCOL: &str = "cutout.game-map-artifact-admission.v1";
const RUNTIME_PNG_PROCESSOR: &str = "cutout-game-map-runtime-png-rust-image-0.23-v1";
const SEMANTIC_ACCEPTANCE_PROTOCOL: &str = "game-map.semantic-acceptance.v1";
const SEMANTIC_ACCEPTANCE_VERIFIER: &str =
    "cutout-game-map-semantic-acceptance-native-replay-rust-image-0.23-v1";
const MAX_SOURCE_BYTES: usize = 64 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES: usize = 384 * 1024 * 1024;
const MAX_RASTER_DIMENSION: u32 = 16_384;
const MAX_RASTER_PIXELS: u64 = 67_108_864;
const MAX_PREVIEW_DIMENSION: u32 = 8_192;
const MAX_PREVIEW_PIXELS: u64 = 16_777_216;
const MAX_RUNTIME_DECODED_PIXELS: u64 = 50_000_000;
const MAX_NAVIGATION_CELLS: u64 = 262_144;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceReference {
    id: String,
    revision: String,
    content_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcceptanceReference {
    receipt_id: String,
    receipt_revision: String,
    receipt_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcceptedArtifact {
    artifact: EvidenceReference,
    acceptance: AcceptanceReference,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RasterBinding {
    RuntimeVisual {
        role: String,
    },
    ObjectVisual {
        object_id: String,
        object_revision: String,
    },
    ExtractionSource {
        role: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RasterInput {
    binding: RasterBinding,
    accepted_artifact: AcceptedArtifact,
    media_type: String,
    bytes_base64: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PixelSize {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Point {
    x: u32,
    y: u32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rectangle {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AtlasGrid {
    columns: u32,
    rows: u32,
    cell_width: u32,
    cell_height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    code: String,
    subject_id: String,
    severity: String,
    message: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AlphaBounds {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionCell {
    id: String,
    column: u32,
    row: u32,
    artifact_id: String,
    sha256: String,
    byte_length: usize,
    bytes_base64: String,
    alpha_bounds: Option<AlphaBounds>,
    opaque_pixel_count: u64,
    edge_contact: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropDefinition {
    id: String,
    name: String,
    column: u32,
    row: u32,
    collision_policy: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropPackExtractionRequest {
    source: RasterInput,
    grid: AtlasGrid,
    objects: Vec<PropDefinition>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropCell {
    #[serde(flatten)]
    cell: ExtractionCell,
    object_id: String,
    object_name: String,
    classification: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropPackExtraction {
    protocol: String,
    processor: String,
    source_artifact_id: String,
    source_sha256: String,
    decoded_size: PixelSize,
    grid: AtlasGrid,
    status: String,
    findings: Vec<Finding>,
    cells: Vec<PropCell>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerrainExtractionRequest {
    source: RasterInput,
    grid: AtlasGrid,
    edge_policy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainExtraction {
    protocol: String,
    processor: String,
    source_artifact_id: String,
    source_sha256: String,
    decoded_size: PixelSize,
    grid: AtlasGrid,
    edge_policy: String,
    status: String,
    findings: Vec<Finding>,
    cells: Vec<ExtractionCell>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentReference {
    id: String,
    content_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevisionReference {
    id: String,
    revision: String,
    content_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CoordinateSystem {
    #[serde(rename = "pixel-2d")]
    Pixel2d { origin: String, unit: String },
    OrthogonalGrid {
        origin: String,
        columns: u32,
        rows: u32,
        cell_width: u32,
        cell_height: u32,
    },
    ChunkGrid {
        origin: String,
        columns: u32,
        rows: u32,
        chunk_width: u32,
        chunk_height: u32,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Camera {
    behavior: String,
    viewport: PixelSize,
    bounds: Rectangle,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeVisual {
    role: String,
    source: AcceptedArtifact,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TilePlacement {
    column: u32,
    row: u32,
    atlas_column: u32,
    atlas_row: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RuntimeLayer {
    Base {
        id: String,
        order: i32,
        source_id: String,
    },
    Terrain {
        id: String,
        order: i32,
        source_id: String,
        atlas: AtlasGrid,
        tiles: Vec<TilePlacement>,
    },
    Objects {
        id: String,
        order: i32,
        source_id: String,
    },
    Actors {
        id: String,
        order: i32,
        source_id: String,
    },
    Foreground {
        id: String,
        order: i32,
        source_id: String,
    },
    Parallax {
        id: String,
        order: i32,
        source_id: String,
    },
}

impl RuntimeLayer {
    fn id(&self) -> &str {
        match self {
            Self::Base { id, .. }
            | Self::Terrain { id, .. }
            | Self::Objects { id, .. }
            | Self::Actors { id, .. }
            | Self::Foreground { id, .. }
            | Self::Parallax { id, .. } => id,
        }
    }

    fn order(&self) -> i32 {
        match self {
            Self::Base { order, .. }
            | Self::Terrain { order, .. }
            | Self::Objects { order, .. }
            | Self::Actors { order, .. }
            | Self::Foreground { order, .. }
            | Self::Parallax { order, .. } => *order,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scale {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Placement {
    id: String,
    layer_id: String,
    object_id: String,
    object_revision: String,
    position: Point,
    scale: Scale,
    rotation_degrees: f64,
    sort_offset: i32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Shape {
    Rectangle { bounds: Rectangle },
    Polygon { points: Vec<Point> },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Collision {
    id: String,
    behavior: String,
    shape: Shape,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Zone {
    id: String,
    purpose: String,
    shape: Shape,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Spawn {
    id: String,
    kind: String,
    position: Point,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Exit {
    id: String,
    area: Shape,
    destination: Value,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GridCell {
    column: u32,
    row: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Navigation {
    Unavailable {
        reason: String,
    },
    OrthogonalGrid {
        movement: String,
        blocked_cells: Vec<GridCell>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeManifest {
    version: String,
    id: String,
    revision: String,
    map_id: String,
    plan: ContentReference,
    mode: String,
    playable: bool,
    world: PixelSize,
    coordinate_system: CoordinateSystem,
    camera: Camera,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_library: Option<RevisionReference>,
    visuals: Vec<RuntimeVisual>,
    layers: Vec<RuntimeLayer>,
    placements: Vec<Placement>,
    collision: Vec<Collision>,
    zones: Vec<Zone>,
    spawns: Vec<Spawn>,
    exits: Vec<Exit>,
    navigation: Navigation,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CollisionPolicy {
    None,
    AuthoredShape { geometry_id: String },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapObject {
    id: String,
    revision: String,
    name: String,
    visual: AcceptedArtifact,
    decoded_size: PixelSize,
    anchor: Point,
    occlusion_class: String,
    placement_safe_area: Rectangle,
    collision_policy: CollisionPolicy,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObjectLibrary {
    version: String,
    id: String,
    revision: String,
    map_id: String,
    plan: ContentReference,
    objects: Vec<MapObject>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeProcessingRequest {
    plan: ContentReference,
    runtime_manifest: RuntimeManifest,
    runtime_manifest_hash: String,
    object_library: Option<ObjectLibrary>,
    object_library_hash: Option<String>,
    artifacts: Vec<RasterInput>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum Reachability {
    Unavailable {
        reason: String,
    },
    Verified {
        movement: String,
        visited_cell_count: usize,
        reachable_exit_ids: Vec<String>,
    },
    Blocked {
        movement: String,
        visited_cell_count: usize,
        unreachable_exit_ids: Vec<String>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeValidation {
    protocol: String,
    validator: String,
    runtime_manifest_hash: String,
    status: String,
    findings: Vec<Finding>,
    reachability: Reachability,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct PreviewReceipt {
    version: String,
    id: String,
    map_id: String,
    plan: ContentReference,
    runtime_manifest: RevisionReference,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_library: Option<RevisionReference>,
    compositor: CompositorReference,
    inputs: Vec<AcceptedArtifact>,
    preview: EvidenceReference,
    debug_overlay: EvidenceReference,
    validation_status: String,
    reachability: Reachability,
    findings: Vec<Finding>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct CompositorReference {
    id: String,
    implementation_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct NativePreview {
    protocol: String,
    receipt: PreviewReceipt,
    preview_bytes_base64: String,
    debug_overlay_bytes_base64: String,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FloatPoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LiveArtifactProcessing {
    RuntimePng,
    ObjectCutout {
        frame_size: PixelSize,
        alpha_target: PixelSize,
        expected_anchor: FloatPoint,
        anchor_policy: String,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveArtifactRequest {
    binding: RasterBinding,
    source_receipt: MultimodalHostReceipt,
    source_artifact_bytes: Vec<u8>,
    processing: LiveArtifactProcessing,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimePngProcessingEvidence {
    protocol: String,
    implementation: String,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
    output_byte_length: usize,
    decoded_size: PixelSize,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactAdmissionReceipt {
    protocol: String,
    receipt_id: String,
    receipt_hash: String,
    binding: RasterBinding,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
    output_byte_length: usize,
    decoded_size: PixelSize,
    processing: LiveArtifactProcessing,
    processing_evidence_hash: String,
    admitted_at: u64,
    signature: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactAdmissionPayload {
    protocol: String,
    receipt_id: String,
    binding: RasterBinding,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
    output_byte_length: usize,
    decoded_size: PixelSize,
    processing: LiveArtifactProcessing,
    processing_evidence_hash: String,
    admitted_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveArtifact {
    protocol: String,
    binding: RasterBinding,
    source_receipt: MultimodalHostReceipt,
    source_artifact_bytes_base64: String,
    processing: LiveArtifactProcessing,
    processing_evidence: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pixel_evidence: Option<Value>,
    accepted_artifact: AcceptedArtifact,
    media_type: String,
    bytes_base64: String,
    decoded_size: PixelSize,
    admission: ArtifactAdmissionReceipt,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticReviewDecision {
    subject_id: String,
    criterion: String,
    status: String,
    reviewer_kind: String,
    reviewer_id: String,
    evidence_artifact_ids: Vec<String>,
    notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticAcceptanceInput {
    runtime: RuntimeProcessingRequest,
    preview: NativePreview,
    artifacts: Vec<LiveArtifact>,
    decisions: Vec<SemanticReviewDecision>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcceptedProductionArtifact {
    binding_key: String,
    admission_receipt_id: String,
    admission_receipt_hash: String,
    source_receipt_id: String,
    source_receipt_hash: String,
    source_artifact_id: String,
    source_artifact_sha256: String,
    output_artifact_id: String,
    output_artifact_sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameMapSemanticAcceptance {
    version: String,
    receipt_id: String,
    receipt_hash: String,
    map_id: String,
    mode: String,
    plan: ContentReference,
    runtime_manifest: RevisionReference,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_library: Option<RevisionReference>,
    preview_receipt_id: String,
    preview_receipt_hash: String,
    preview_artifact_id: String,
    debug_overlay_artifact_id: String,
    accepted_artifacts: Vec<AcceptedProductionArtifact>,
    decisions: Vec<SemanticReviewDecision>,
    verifier_implementation_hash: String,
    reviewer_kind: String,
    reviewer_id: String,
    accepted_at: u64,
    signature: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticAcceptancePayload {
    version: String,
    receipt_id: String,
    map_id: String,
    mode: String,
    plan: ContentReference,
    runtime_manifest: RevisionReference,
    #[serde(skip_serializing_if = "Option::is_none")]
    object_library: Option<RevisionReference>,
    preview_receipt_id: String,
    preview_receipt_hash: String,
    preview_artifact_id: String,
    debug_overlay_artifact_id: String,
    accepted_artifacts: Vec<AcceptedProductionArtifact>,
    decisions: Vec<SemanticReviewDecision>,
    verifier_implementation_hash: String,
    reviewer_kind: String,
    reviewer_id: String,
    accepted_at: u64,
}

#[derive(Debug, Clone)]
struct DecodedRaster {
    image: image::RgbaImage,
}

fn blocking(code: &str, subject_id: &str, message: impl Into<String>) -> Finding {
    Finding {
        code: code.into(),
        subject_id: subject_id.into(),
        severity: "blocking".into(),
        message: message.into(),
    }
}

fn informational(code: &str, subject_id: &str, message: impl Into<String>) -> Finding {
    Finding {
        code: code.into(),
        subject_id: subject_id.into(),
        severity: "informational".into(),
        message: message.into(),
    }
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_grid(grid: &AtlasGrid) -> Result<PixelSize, ProxyError> {
    if grid.columns == 0
        || grid.rows == 0
        || grid.columns > 256
        || grid.rows > 256
        || grid.cell_width == 0
        || grid.cell_height == 0
    {
        return Err(ProxyError::Request(
            "Game Map extraction grid is outside its bounded cell policy".into(),
        ));
    }
    let width = grid
        .columns
        .checked_mul(grid.cell_width)
        .ok_or_else(|| ProxyError::Request("Game Map extraction width overflowed".into()))?;
    let height = grid
        .rows
        .checked_mul(grid.cell_height)
        .ok_or_else(|| ProxyError::Request("Game Map extraction height overflowed".into()))?;
    if width > MAX_RASTER_DIMENSION
        || height > MAX_RASTER_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_RASTER_PIXELS
    {
        return Err(ProxyError::Request(
            "Game Map extraction grid exceeds its raster budget".into(),
        ));
    }
    Ok(PixelSize { width, height })
}

fn decode_raster(
    input: &RasterInput,
    remaining_pixel_budget: u64,
) -> Result<image::RgbaImage, ProxyError> {
    if input.media_type != "image/png" {
        return Err(ProxyError::Request(
            "Game Map native processors accept PNG inputs only".into(),
        ));
    }
    let maximum_base64_length = MAX_SOURCE_BYTES.div_ceil(3).saturating_mul(4);
    if input.bytes_base64.len() > maximum_base64_length {
        return Err(ProxyError::Request(
            "Game Map raster exceeds its encoded byte budget".into(),
        ));
    }
    let bytes = STANDARD
        .decode(&input.bytes_base64)
        .map_err(|_| ProxyError::Request("Game Map raster base64 is invalid".into()))?;
    if bytes.is_empty() || bytes.len() > MAX_SOURCE_BYTES {
        return Err(ProxyError::Request(
            "Game Map raster exceeds its decoded byte budget".into(),
        ));
    }
    let digest = sha256(&bytes);
    if !valid_hash(&input.accepted_artifact.artifact.content_hash)
        || !valid_hash(&input.accepted_artifact.acceptance.receipt_hash)
        || input.accepted_artifact.artifact.revision.trim().is_empty()
        || input
            .accepted_artifact
            .acceptance
            .receipt_id
            .trim()
            .is_empty()
        || input
            .accepted_artifact
            .acceptance
            .receipt_revision
            .trim()
            .is_empty()
        || input.accepted_artifact.artifact.content_hash != digest
        || input.accepted_artifact.artifact.id != format!("artifact:sha256:{digest}")
    {
        return Err(ProxyError::Request(
            "Game Map raster bytes do not match their accepted artifact identity".into(),
        ));
    }
    if image::guess_format(&bytes).ok() != Some(image::ImageFormat::Png) {
        return Err(ProxyError::Request(
            "Game Map raster is not a decoded PNG".into(),
        ));
    }
    let (width, height) = image::io::Reader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| ProxyError::Request("Game Map PNG header could not be decoded".into()))?
        .into_dimensions()
        .map_err(|_| ProxyError::Request("Game Map PNG header could not be decoded".into()))?;
    let pixels = u64::from(width) * u64::from(height);
    if width == 0
        || height == 0
        || width > MAX_RASTER_DIMENSION
        || height > MAX_RASTER_DIMENSION
        || pixels > MAX_RASTER_PIXELS
        || pixels > remaining_pixel_budget
    {
        return Err(ProxyError::Request(
            "Game Map decoded PNG exceeds its raster budget".into(),
        ));
    }
    let decoded = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        .map_err(|_| ProxyError::Request("Game Map PNG could not be decoded".into()))?
        .to_rgba8();
    if decoded.dimensions() != (width, height) {
        return Err(ProxyError::Request(
            "Game Map decoded PNG dimensions drifted from its header".into(),
        ));
    }
    Ok(decoded)
}

fn analyze_cell(image: &image::RgbaImage) -> (Option<AlphaBounds>, u64, bool) {
    let (width, height) = image.dimensions();
    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    let mut count = 0_u64;
    let mut edge_contact = false;
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel.0[3] == 0 {
            continue;
        }
        count += 1;
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
        edge_contact |= x == 0 || y == 0 || x + 1 == width || y + 1 == height;
    }
    let bounds = (count > 0).then_some(AlphaBounds {
        x: min_x,
        y: min_y,
        width: max_x.saturating_sub(min_x) + 1,
        height: max_y.saturating_sub(min_y) + 1,
    });
    (bounds, count, edge_contact)
}

fn extract_cell(
    source: &image::RgbaImage,
    grid: &AtlasGrid,
    column: u32,
    row: u32,
    id: String,
) -> Result<ExtractionCell, ProxyError> {
    let cell = image::imageops::crop_imm(
        source,
        column * grid.cell_width,
        row * grid.cell_height,
        grid.cell_width,
        grid.cell_height,
    )
    .to_image();
    let (alpha_bounds, opaque_pixel_count, edge_contact) = analyze_cell(&cell);
    let bytes = encode_cutout_png(&cell)?;
    let digest = sha256(&bytes);
    Ok(ExtractionCell {
        id,
        column,
        row,
        artifact_id: format!("artifact:sha256:{digest}"),
        sha256: digest,
        byte_length: bytes.len(),
        bytes_base64: STANDARD.encode(bytes),
        alpha_bounds,
        opaque_pixel_count,
        edge_contact,
    })
}

#[tauri::command]
pub fn extract_game_map_prop_pack(
    request: PropPackExtractionRequest,
) -> Result<PropPackExtraction, ProxyError> {
    if request.objects.is_empty() || request.objects.len() > 4_096 {
        return Err(ProxyError::Request(
            "Game Map prop pack requires a bounded object list".into(),
        ));
    }
    if !matches!(
        &request.source.binding,
        RasterBinding::ExtractionSource { role } if role == "prop-pack"
    ) {
        return Err(ProxyError::Request(
            "Game Map prop extraction requires a prop-pack source binding".into(),
        ));
    }
    let expected_size = validate_grid(&request.grid)?;
    let decoded = decode_raster(&request.source, MAX_RASTER_PIXELS)?;
    if decoded.dimensions() != (expected_size.width, expected_size.height) {
        return Err(ProxyError::Request(
            "Game Map prop pack dimensions must exactly equal the declared cell grid".into(),
        ));
    }
    let mut ids = HashSet::new();
    let mut coordinates = HashSet::new();
    let mut cells = Vec::with_capacity(request.objects.len());
    let mut findings = Vec::new();
    for object in &request.objects {
        if object.column >= request.grid.columns
            || object.row >= request.grid.rows
            || !ids.insert(object.id.clone())
            || !coordinates.insert((object.column, object.row))
            || !matches!(object.collision_policy.as_str(), "none" | "authored-shape")
        {
            return Err(ProxyError::Request(
                "Game Map prop definitions must have unique ids and in-grid cells".into(),
            ));
        }
        let cell = extract_cell(
            &decoded,
            &request.grid,
            object.column,
            object.row,
            format!("cell:{}", object.id),
        )?;
        if cell.alpha_bounds.is_none() {
            findings.push(blocking(
                "empty-prop-cell",
                &object.id,
                "Prop cell contains no retained alpha pixels.",
            ));
        }
        if cell.edge_contact {
            findings.push(blocking(
                "prop-cell-edge-contact",
                &object.id,
                "Prop alpha reaches a cell edge and may cross into an adjacent object.",
            ));
        }
        let classification = if object.collision_policy == "authored-shape" {
            "collision-bearing"
        } else if cell
            .alpha_bounds
            .map(|bounds| u64::from(bounds.width) * 2 >= u64::from(bounds.height) * 3)
            .unwrap_or(false)
        {
            "wide"
        } else {
            "compact"
        };
        cells.push(PropCell {
            cell,
            object_id: object.id.clone(),
            object_name: object.name.clone(),
            classification: classification.into(),
        });
    }
    let status = if findings
        .iter()
        .any(|finding| finding.severity == "blocking")
    {
        "blocked"
    } else {
        "passed"
    };
    Ok(PropPackExtraction {
        protocol: PROP_EXTRACTION_PROTOCOL.into(),
        processor: PROP_EXTRACTOR.into(),
        source_artifact_id: request.source.accepted_artifact.artifact.id.clone(),
        source_sha256: request
            .source
            .accepted_artifact
            .artifact
            .content_hash
            .clone(),
        decoded_size: expected_size,
        grid: request.grid,
        status: status.into(),
        findings,
        cells,
    })
}

#[tauri::command]
pub fn extract_game_map_terrain_atlas(
    request: TerrainExtractionRequest,
) -> Result<TerrainExtraction, ProxyError> {
    if !matches!(
        &request.source.binding,
        RasterBinding::ExtractionSource { role } if role == "terrain-atlas"
    ) || !matches!(request.edge_policy.as_str(), "seamable" | "isolated")
    {
        return Err(ProxyError::Request(
            "Game Map terrain extraction requires a terrain-atlas source and explicit edge policy"
                .into(),
        ));
    }
    let expected_size = validate_grid(&request.grid)?;
    let decoded = decode_raster(&request.source, MAX_RASTER_PIXELS)?;
    if decoded.dimensions() != (expected_size.width, expected_size.height) {
        return Err(ProxyError::Request(
            "Game Map terrain atlas dimensions must exactly equal the declared cell grid; partial cells are rejected"
                .into(),
        ));
    }
    let mut cells = Vec::with_capacity((request.grid.columns * request.grid.rows) as usize);
    let mut findings = Vec::new();
    for row in 0..request.grid.rows {
        for column in 0..request.grid.columns {
            let cell = extract_cell(
                &decoded,
                &request.grid,
                column,
                row,
                format!("terrain-cell:{column}:{row}"),
            )?;
            if request.edge_policy == "isolated" && cell.edge_contact {
                findings.push(blocking(
                    "terrain-cell-border-crossing",
                    &cell.id,
                    "Isolated terrain alpha reaches a cell border; use a seamable policy only for deliberately edge-filling tiles.",
                ));
            }
            cells.push(cell);
        }
    }
    let status = if findings
        .iter()
        .any(|finding| finding.severity == "blocking")
    {
        "blocked"
    } else {
        "passed"
    };
    Ok(TerrainExtraction {
        protocol: TERRAIN_EXTRACTION_PROTOCOL.into(),
        processor: TERRAIN_EXTRACTOR.into(),
        source_artifact_id: request.source.accepted_artifact.artifact.id.clone(),
        source_sha256: request
            .source
            .accepted_artifact
            .artifact
            .content_hash
            .clone(),
        decoded_size: expected_size,
        grid: request.grid,
        edge_policy: request.edge_policy,
        status: status.into(),
        findings,
        cells,
    })
}

fn canonical_hash<T: Serialize>(value: &T) -> Result<String, ProxyError> {
    canonical_portable_bytes(value).map(|bytes| sha256(&bytes))
}

impl ArtifactAdmissionReceipt {
    fn payload(&self) -> ArtifactAdmissionPayload {
        ArtifactAdmissionPayload {
            protocol: self.protocol.clone(),
            receipt_id: self.receipt_id.clone(),
            binding: self.binding.clone(),
            source_receipt_id: self.source_receipt_id.clone(),
            source_receipt_hash: self.source_receipt_hash.clone(),
            source_artifact_id: self.source_artifact_id.clone(),
            source_artifact_sha256: self.source_artifact_sha256.clone(),
            output_artifact_id: self.output_artifact_id.clone(),
            output_artifact_sha256: self.output_artifact_sha256.clone(),
            output_byte_length: self.output_byte_length,
            decoded_size: self.decoded_size,
            processing: self.processing.clone(),
            processing_evidence_hash: self.processing_evidence_hash.clone(),
            admitted_at: self.admitted_at,
        }
    }
}

impl GameMapSemanticAcceptance {
    fn payload(&self) -> SemanticAcceptancePayload {
        SemanticAcceptancePayload {
            version: self.version.clone(),
            receipt_id: self.receipt_id.clone(),
            map_id: self.map_id.clone(),
            mode: self.mode.clone(),
            plan: self.plan.clone(),
            runtime_manifest: self.runtime_manifest.clone(),
            object_library: self.object_library.clone(),
            preview_receipt_id: self.preview_receipt_id.clone(),
            preview_receipt_hash: self.preview_receipt_hash.clone(),
            preview_artifact_id: self.preview_artifact_id.clone(),
            debug_overlay_artifact_id: self.debug_overlay_artifact_id.clone(),
            accepted_artifacts: self.accepted_artifacts.clone(),
            decisions: self.decisions.clone(),
            verifier_implementation_hash: self.verifier_implementation_hash.clone(),
            reviewer_kind: self.reviewer_kind.clone(),
            reviewer_id: self.reviewer_id.clone(),
            accepted_at: self.accepted_at,
        }
    }
}

fn validate_live_source_binding(
    binding: &RasterBinding,
    processing: &LiveArtifactProcessing,
    receipt: &MultimodalHostReceipt,
) -> Result<(), ProxyError> {
    let expected_role = match binding {
        RasterBinding::RuntimeVisual { role } if role == "base" => "game-map-base",
        RasterBinding::RuntimeVisual { role } if role == "terrain-atlas" => {
            "game-map-terrain-atlas"
        }
        RasterBinding::ObjectVisual { .. } => "game-map-object",
        _ => return Err(ProxyError::Request(
            "live Game Map production supports only scene base, tile terrain, and object visuals"
                .into(),
        )),
    };
    let processing_matches = matches!(
        (binding, processing),
        (
            RasterBinding::RuntimeVisual { .. },
            LiveArtifactProcessing::RuntimePng
        ) | (
            RasterBinding::ObjectVisual { .. },
            LiveArtifactProcessing::ObjectCutout { .. }
        )
    );
    if !processing_matches
        || receipt.provider_kind != "dashscope"
        || !matches!(
            receipt.model.as_str(),
            "qwen-image-3.0" | "qwen-image-3.0-pro"
        )
        || receipt.operation != "image-generation"
        || receipt.semantic_role.as_deref() != Some(expected_role)
        || receipt.accepted_reference_artifact_ids.len() != 0
        || !receipt.artifact.media_type.starts_with("image/")
        || !receipt.artifact.decoded
    {
        return Err(ProxyError::Request(
            "live Game Map source receipt does not match its exact Qwen role and processing route"
                .into(),
        ));
    }
    if let LiveArtifactProcessing::ObjectCutout {
        frame_size,
        alpha_target,
        expected_anchor,
        anchor_policy,
    } = processing
    {
        if frame_size.width == 0
            || frame_size.height == 0
            || frame_size.width > 2_048
            || frame_size.height > 2_048
            || alpha_target.width == 0
            || alpha_target.height == 0
            || alpha_target.width > frame_size.width
            || alpha_target.height > frame_size.height
            || !expected_anchor.x.is_finite()
            || !expected_anchor.y.is_finite()
            || expected_anchor.x < 0.0
            || expected_anchor.y < 0.0
            || expected_anchor.x > f64::from(frame_size.width)
            || expected_anchor.y > f64::from(frame_size.height)
            || !matches!(anchor_policy.as_str(), "center" | "bottom" | "feet")
        {
            return Err(ProxyError::Request(
                "live Game Map object cutout geometry is invalid".into(),
            ));
        }
    }
    Ok(())
}

fn normalize_runtime_png(
    source_bytes: &[u8],
    source_artifact_id: &str,
    source_artifact_sha256: &str,
) -> Result<(Vec<u8>, RuntimePngProcessingEvidence), ProxyError> {
    if source_bytes.is_empty() || source_bytes.len() > MAX_SOURCE_BYTES {
        return Err(ProxyError::Request(
            "live Game Map source exceeds the bounded raster policy".into(),
        ));
    }
    let decoded = image::load_from_memory(source_bytes)
        .map_err(|_| ProxyError::Request("live Game Map source pixels are invalid".into()))?;
    let (width, height) = decoded.dimensions();
    if width == 0
        || height == 0
        || width > MAX_RASTER_DIMENSION
        || height > MAX_RASTER_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_RASTER_PIXELS
    {
        return Err(ProxyError::Request(
            "live Game Map source decoded dimensions exceed policy".into(),
        ));
    }
    let output = encode_cutout_png(&decoded.to_rgba8())?;
    let output_sha256 = sha256(&output);
    let evidence = RuntimePngProcessingEvidence {
        protocol: "cutout.game-map-runtime-png-processing.v1".into(),
        implementation: RUNTIME_PNG_PROCESSOR.into(),
        source_artifact_id: source_artifact_id.into(),
        source_artifact_sha256: source_artifact_sha256.into(),
        output_artifact_id: format!("artifact:sha256:{output_sha256}"),
        output_artifact_sha256: output_sha256,
        output_byte_length: output.len(),
        decoded_size: PixelSize { width, height },
    };
    Ok((output, evidence))
}

fn process_live_artifact(
    binding: &RasterBinding,
    receipt: &MultimodalHostReceipt,
    source_bytes: &[u8],
    processing: &LiveArtifactProcessing,
) -> Result<(Vec<u8>, PixelSize, Value, Option<Value>), ProxyError> {
    validate_live_source_binding(binding, processing, receipt)?;
    verify_receipt(receipt, source_bytes)?;
    match processing {
        LiveArtifactProcessing::RuntimePng => {
            let (bytes, evidence) = normalize_runtime_png(
                source_bytes,
                &receipt.artifact.artifact_id,
                &receipt.artifact.sha256,
            )?;
            let size = evidence.decoded_size;
            Ok((
                bytes,
                size,
                serde_json::to_value(evidence).map_err(|_| {
                    ProxyError::Request("live Game Map PNG evidence is invalid".into())
                })?,
                None,
            ))
        }
        LiveArtifactProcessing::ObjectCutout {
            frame_size,
            alpha_target,
            expected_anchor,
            anchor_policy,
        } => {
            let (bytes, processing_evidence, pixel_evidence) = process_game_map_object_cutout(
                source_bytes,
                &receipt.artifact.artifact_id,
                &receipt.artifact.sha256,
                frame_size.width,
                frame_size.height,
                alpha_target.width,
                alpha_target.height,
                expected_anchor.x,
                expected_anchor.y,
                anchor_policy,
            )?;
            Ok((
                bytes,
                *frame_size,
                serde_json::to_value(processing_evidence).map_err(|_| {
                    ProxyError::Request("live Game Map cutout evidence is invalid".into())
                })?,
                Some(serde_json::to_value(pixel_evidence).map_err(|_| {
                    ProxyError::Request("live Game Map pixel evidence is invalid".into())
                })?),
            ))
        }
    }
}

fn issue_live_artifact(request: LiveArtifactRequest) -> Result<LiveArtifact, ProxyError> {
    let (output_bytes, decoded_size, processing_evidence, pixel_evidence) = process_live_artifact(
        &request.binding,
        &request.source_receipt,
        &request.source_artifact_bytes,
        &request.processing,
    )?;
    let output_sha256 = sha256(&output_bytes);
    let output_artifact_id = format!("artifact:sha256:{output_sha256}");
    let processing_evidence_hash = canonical_hash(&serde_json::json!({
        "processing": &request.processing,
        "processingEvidence": &processing_evidence,
        "pixelEvidence": &pixel_evidence,
    }))?;
    let admission_key = canonical_hash(&serde_json::json!({
        "binding": &request.binding,
        "sourceReceiptHash": &request.source_receipt.receipt_hash,
        "outputArtifactSha256": &output_sha256,
        "processingEvidenceHash": &processing_evidence_hash,
    }))?;
    let payload = ArtifactAdmissionPayload {
        protocol: LIVE_ARTIFACT_ADMISSION_PROTOCOL.into(),
        receipt_id: format!("receipt:game-map-artifact-admission:{admission_key}"),
        binding: request.binding.clone(),
        source_receipt_id: request.source_receipt.receipt_id.clone(),
        source_receipt_hash: request.source_receipt.receipt_hash.clone(),
        source_artifact_id: request.source_receipt.artifact.artifact_id.clone(),
        source_artifact_sha256: request.source_receipt.artifact.sha256.clone(),
        output_artifact_id: output_artifact_id.clone(),
        output_artifact_sha256: output_sha256.clone(),
        output_byte_length: output_bytes.len(),
        decoded_size,
        processing: request.processing.clone(),
        processing_evidence_hash,
        admitted_at: request.source_receipt.completed_at,
    };
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    let admission = ArtifactAdmissionReceipt {
        protocol: payload.protocol,
        receipt_id: payload.receipt_id,
        receipt_hash: receipt_hash.clone(),
        binding: payload.binding,
        source_receipt_id: payload.source_receipt_id,
        source_receipt_hash: payload.source_receipt_hash,
        source_artifact_id: payload.source_artifact_id,
        source_artifact_sha256: payload.source_artifact_sha256,
        output_artifact_id: payload.output_artifact_id,
        output_artifact_sha256: payload.output_artifact_sha256,
        output_byte_length: payload.output_byte_length,
        decoded_size: payload.decoded_size,
        processing: payload.processing,
        processing_evidence_hash: payload.processing_evidence_hash,
        admitted_at: payload.admitted_at,
        signature,
    };
    Ok(LiveArtifact {
        protocol: LIVE_ARTIFACT_PROTOCOL.into(),
        binding: request.binding,
        source_receipt: request.source_receipt,
        source_artifact_bytes_base64: STANDARD.encode(request.source_artifact_bytes),
        processing: request.processing,
        processing_evidence,
        pixel_evidence,
        accepted_artifact: AcceptedArtifact {
            artifact: EvidenceReference {
                id: output_artifact_id,
                revision: format!("revision:sha256:{output_sha256}"),
                content_hash: output_sha256,
            },
            acceptance: AcceptanceReference {
                receipt_id: admission.receipt_id.clone(),
                receipt_revision: format!("revision:sha256:{receipt_hash}"),
                receipt_hash,
            },
        },
        media_type: "image/png".into(),
        bytes_base64: STANDARD.encode(output_bytes),
        decoded_size,
        admission,
    })
}

fn verify_live_artifact_inner(artifact: LiveArtifact) -> Result<LiveArtifact, ProxyError> {
    if artifact.protocol != LIVE_ARTIFACT_PROTOCOL || artifact.media_type != "image/png" {
        return Err(ProxyError::Request(
            "live Game Map artifact protocol or media type is invalid".into(),
        ));
    }
    let source_bytes = STANDARD
        .decode(&artifact.source_artifact_bytes_base64)
        .map_err(|_| ProxyError::Request("live Game Map source base64 is invalid".into()))?;
    let output_bytes = STANDARD
        .decode(&artifact.bytes_base64)
        .map_err(|_| ProxyError::Request("live Game Map output base64 is invalid".into()))?;
    let (replayed_bytes, decoded_size, processing_evidence, pixel_evidence) =
        process_live_artifact(
            &artifact.binding,
            &artifact.source_receipt,
            &source_bytes,
            &artifact.processing,
        )?;
    let output_sha256 = sha256(&output_bytes);
    let processing_evidence_hash = canonical_hash(&serde_json::json!({
        "processing": &artifact.processing,
        "processingEvidence": &artifact.processing_evidence,
        "pixelEvidence": &artifact.pixel_evidence,
    }))?;
    if replayed_bytes != output_bytes
        || decoded_size != artifact.decoded_size
        || canonical_hash(&processing_evidence)? != canonical_hash(&artifact.processing_evidence)?
        || canonical_hash(&pixel_evidence)? != canonical_hash(&artifact.pixel_evidence)?
        || artifact.admission.protocol != LIVE_ARTIFACT_ADMISSION_PROTOCOL
        || artifact.admission.binding != artifact.binding
        || artifact.admission.source_receipt_id != artifact.source_receipt.receipt_id
        || artifact.admission.source_receipt_hash != artifact.source_receipt.receipt_hash
        || artifact.admission.source_artifact_id != artifact.source_receipt.artifact.artifact_id
        || artifact.admission.source_artifact_sha256 != artifact.source_receipt.artifact.sha256
        || artifact.admission.output_artifact_id != format!("artifact:sha256:{output_sha256}")
        || artifact.admission.output_artifact_sha256 != output_sha256
        || artifact.admission.output_byte_length != output_bytes.len()
        || artifact.admission.decoded_size != decoded_size
        || artifact.admission.processing != artifact.processing
        || artifact.admission.processing_evidence_hash != processing_evidence_hash
        || artifact.admission.admitted_at != artifact.source_receipt.completed_at
        || artifact.accepted_artifact.artifact.id != artifact.admission.output_artifact_id
        || artifact.accepted_artifact.artifact.content_hash
            != artifact.admission.output_artifact_sha256
        || artifact.accepted_artifact.artifact.revision
            != format!(
                "revision:sha256:{}",
                artifact.admission.output_artifact_sha256
            )
        || artifact.accepted_artifact.acceptance.receipt_id != artifact.admission.receipt_id
        || artifact.accepted_artifact.acceptance.receipt_hash != artifact.admission.receipt_hash
        || artifact.accepted_artifact.acceptance.receipt_revision
            != format!("revision:sha256:{}", artifact.admission.receipt_hash)
    {
        return Err(ProxyError::Request(
            "live Game Map artifact drifted from its signed source and deterministic processing"
                .into(),
        ));
    }
    verify_host_payload(
        &artifact.admission.payload(),
        &artifact.admission.receipt_hash,
        &artifact.admission.signature,
    )?;
    Ok(artifact)
}

#[tauri::command]
pub fn admit_game_map_live_artifact(
    request: LiveArtifactRequest,
) -> Result<LiveArtifact, ProxyError> {
    issue_live_artifact(request)
}

#[tauri::command]
pub fn verify_game_map_live_artifact(artifact: LiveArtifact) -> Result<LiveArtifact, ProxyError> {
    verify_live_artifact_inner(artifact)
}

fn binding_key(binding: &RasterBinding) -> String {
    match binding {
        RasterBinding::RuntimeVisual { role } => format!("runtime:{role}"),
        RasterBinding::ObjectVisual {
            object_id,
            object_revision,
        } => format!("object:{object_id}@{object_revision}"),
        RasterBinding::ExtractionSource { role } => format!("extraction:{role}"),
    }
}

fn expected_rasters(request: &RuntimeProcessingRequest) -> Vec<(String, AcceptedArtifact)> {
    let mut expected = request
        .runtime_manifest
        .visuals
        .iter()
        .map(|visual| (format!("runtime:{}", visual.role), visual.source.clone()))
        .collect::<Vec<_>>();
    if let Some(library) = &request.object_library {
        expected.extend(library.objects.iter().map(|object| {
            (
                format!("object:{}@{}", object.id, object.revision),
                object.visual.clone(),
            )
        }));
    }
    expected
}

fn shape_bounds_valid(shape: &Shape, world: PixelSize) -> bool {
    match shape {
        Shape::Rectangle { bounds } => {
            bounds.width > 0
                && bounds.height > 0
                && bounds
                    .x
                    .checked_add(bounds.width)
                    .is_some_and(|x| x <= world.width)
                && bounds
                    .y
                    .checked_add(bounds.height)
                    .is_some_and(|y| y <= world.height)
        }
        Shape::Polygon { points } => {
            if points.len() < 3
                || points.len() > 256
                || points
                    .iter()
                    .any(|point| point.x >= world.width || point.y >= world.height)
            {
                return false;
            }
            let mut twice_area = 0_i128;
            for index in 0..points.len() {
                let first = points[index];
                let second = points[(index + 1) % points.len()];
                twice_area += i128::from(first.x) * i128::from(second.y)
                    - i128::from(second.x) * i128::from(first.y);
            }
            twice_area != 0
        }
    }
}

fn rectangle_bounds_valid(rectangle: Rectangle, world: PixelSize) -> bool {
    rectangle.width > 0
        && rectangle.height > 0
        && rectangle
            .x
            .checked_add(rectangle.width)
            .is_some_and(|x| x <= world.width)
        && rectangle
            .y
            .checked_add(rectangle.height)
            .is_some_and(|y| y <= world.height)
}

fn destination_valid(destination: &Value) -> bool {
    let Some(object) = destination.as_object() else {
        return false;
    };
    match object.get("kind").and_then(Value::as_str) {
        Some("map") => {
            object.len() == 3
                && object
                    .get("mapId")
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty())
                && object
                    .get("spawnId")
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty())
        }
        Some("socket") => {
            object.len() == 2
                && object
                    .get("socketId")
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty())
        }
        _ => false,
    }
}

fn point_in_shape(x: f64, y: f64, shape: &Shape) -> bool {
    match shape {
        Shape::Rectangle { bounds } => {
            x >= f64::from(bounds.x)
                && y >= f64::from(bounds.y)
                && x < f64::from(bounds.x + bounds.width)
                && y < f64::from(bounds.y + bounds.height)
        }
        Shape::Polygon { points } => {
            let mut inside = false;
            let mut previous = points.len() - 1;
            for current in 0..points.len() {
                let a = points[current];
                let b = points[previous];
                let crosses = (f64::from(a.y) > y) != (f64::from(b.y) > y)
                    && x < (f64::from(b.x) - f64::from(a.x)) * (y - f64::from(a.y))
                        / (f64::from(b.y) - f64::from(a.y))
                        + f64::from(a.x);
                if crosses {
                    inside = !inside;
                }
                previous = current;
            }
            inside
        }
    }
}

fn validate_reachability(manifest: &RuntimeManifest, findings: &mut Vec<Finding>) -> Reachability {
    let Navigation::OrthogonalGrid {
        movement,
        blocked_cells,
    } = &manifest.navigation
    else {
        findings.push(informational(
            "reachability-unavailable",
            &manifest.id,
            "Reachability is unavailable because the manifest has no explicit navigation grid.",
        ));
        return Reachability::Unavailable {
            reason: "no-explicit-navigation-data".into(),
        };
    };
    let CoordinateSystem::OrthogonalGrid {
        columns,
        rows,
        cell_width,
        cell_height,
        ..
    } = &manifest.coordinate_system
    else {
        findings.push(blocking(
            "navigation-coordinate-mismatch",
            &manifest.id,
            "Explicit orthogonal navigation requires orthogonal map coordinates.",
        ));
        return Reachability::Blocked {
            movement: "cardinal-4".into(),
            visited_cell_count: 0,
            unreachable_exit_ids: manifest.exits.iter().map(|exit| exit.id.clone()).collect(),
        };
    };
    let total = u64::from(*columns) * u64::from(*rows);
    if movement != "cardinal-4" || total == 0 || total > MAX_NAVIGATION_CELLS {
        findings.push(blocking(
            "navigation-budget-exceeded",
            &manifest.id,
            "Explicit navigation grid exceeds the deterministic validation budget.",
        ));
        return Reachability::Blocked {
            movement: "cardinal-4".into(),
            visited_cell_count: 0,
            unreachable_exit_ids: manifest.exits.iter().map(|exit| exit.id.clone()).collect(),
        };
    }
    let blocked = blocked_cells.iter().copied().collect::<BTreeSet<_>>();
    if blocked.len() != blocked_cells.len()
        || blocked
            .iter()
            .any(|cell| cell.column >= *columns || cell.row >= *rows)
    {
        findings.push(blocking(
            "navigation-cell-invalid",
            &manifest.id,
            "Explicit navigation blocked cells must be unique and in bounds.",
        ));
    }
    let mut queue = VecDeque::new();
    let mut visited = vec![false; total as usize];
    for spawn in manifest
        .spawns
        .iter()
        .filter(|spawn| spawn.kind == "player")
    {
        if spawn.position.x >= manifest.world.width || spawn.position.y >= manifest.world.height {
            continue;
        }
        let cell = GridCell {
            column: spawn.position.x / *cell_width,
            row: spawn.position.y / *cell_height,
        };
        if blocked.contains(&cell) {
            findings.push(blocking(
                "spawn-navigation-blocked",
                &spawn.id,
                "Player spawn occupies an explicitly blocked navigation cell.",
            ));
            continue;
        }
        let index = (cell.row * *columns + cell.column) as usize;
        if !visited[index] {
            visited[index] = true;
            queue.push_back(cell);
        }
    }
    while let Some(cell) = queue.pop_front() {
        for (column, row) in [
            (cell.column.wrapping_sub(1), cell.row),
            (cell.column + 1, cell.row),
            (cell.column, cell.row.wrapping_sub(1)),
            (cell.column, cell.row + 1),
        ] {
            if column >= *columns || row >= *rows {
                continue;
            }
            let next = GridCell { column, row };
            let index = (row * *columns + column) as usize;
            if !visited[index] && !blocked.contains(&next) {
                visited[index] = true;
                queue.push_back(next);
            }
        }
    }
    let visited_cell_count = visited.iter().filter(|visited| **visited).count();
    let mut reachable = Vec::new();
    let mut unreachable = Vec::new();
    for exit in &manifest.exits {
        let mut exit_reachable = false;
        'rows: for row in 0..*rows {
            for column in 0..*columns {
                let index = (row * *columns + column) as usize;
                if visited[index]
                    && point_in_shape(
                        f64::from(column * *cell_width) + f64::from(*cell_width) / 2.0,
                        f64::from(row * *cell_height) + f64::from(*cell_height) / 2.0,
                        &exit.area,
                    )
                {
                    exit_reachable = true;
                    break 'rows;
                }
            }
        }
        if exit_reachable {
            reachable.push(exit.id.clone());
        } else {
            unreachable.push(exit.id.clone());
            findings.push(blocking(
                "exit-unreachable",
                &exit.id,
                "No explicitly traversable cardinal-grid path reaches this exit.",
            ));
        }
    }
    if unreachable.is_empty() {
        Reachability::Verified {
            movement: "cardinal-4".into(),
            visited_cell_count,
            reachable_exit_ids: reachable,
        }
    } else {
        Reachability::Blocked {
            movement: "cardinal-4".into(),
            visited_cell_count,
            unreachable_exit_ids: unreachable,
        }
    }
}

fn validate_runtime_internal(
    request: &RuntimeProcessingRequest,
) -> Result<(RuntimeValidation, BTreeMap<String, DecodedRaster>), ProxyError> {
    let manifest = &request.runtime_manifest;
    if request.artifacts.is_empty()
        || request.artifacts.len() > 2_000
        || manifest.visuals.is_empty()
        || manifest.visuals.len() > 64
        || manifest.layers.is_empty()
        || manifest.layers.len() > 256
        || manifest.placements.len() > 20_000
        || manifest.collision.len() > 20_000
        || manifest.zones.len() > 20_000
        || manifest.spawns.len() > 2_000
        || manifest.exits.len() > 2_000
        || request
            .object_library
            .as_ref()
            .is_some_and(|library| library.objects.is_empty() || library.objects.len() > 2_000)
    {
        return Err(ProxyError::Request(
            "Game Map runtime input exceeds its bounded collection policy".into(),
        ));
    }
    let mut findings = Vec::new();
    let observed_manifest_hash = canonical_hash(manifest)?;
    if request.runtime_manifest_hash != observed_manifest_hash {
        findings.push(blocking(
            "runtime-manifest-hash-mismatch",
            &manifest.id,
            "Runtime manifest hash does not match its canonical content.",
        ));
    }
    if manifest.version != "game-map.runtime-manifest.v1"
        || manifest.plan.id != request.plan.id
        || manifest.plan.content_hash != request.plan.content_hash
    {
        findings.push(blocking(
            "runtime-plan-reference-mismatch",
            &manifest.id,
            "Runtime manifest does not bind the exact production plan reference.",
        ));
    }
    let expected_coordinate = match manifest.mode.as_str() {
        "tile" | "grid" => "orthogonal-grid",
        "room-chunk" => "chunk-grid",
        "scene" | "side-scroll" | "baked-scene" => "pixel-2d",
        _ => "invalid",
    };
    let observed_coordinate = match &manifest.coordinate_system {
        CoordinateSystem::Pixel2d { .. } => "pixel-2d",
        CoordinateSystem::OrthogonalGrid { .. } => "orthogonal-grid",
        CoordinateSystem::ChunkGrid { .. } => "chunk-grid",
    };
    let expected_camera = match manifest.mode.as_str() {
        "tile" | "grid" => "grid-bounded",
        "room-chunk" => "chunk-bounded",
        "side-scroll" => "horizontal-follow",
        "baked-scene" => "fixed",
        "scene" => "bounded",
        _ => "invalid",
    };
    if expected_coordinate == "invalid"
        || observed_coordinate != expected_coordinate
        || manifest.camera.behavior != expected_camera
        || manifest.playable != (manifest.mode != "baked-scene")
    {
        findings.push(blocking(
            "runtime-mode-contract-invalid",
            &manifest.id,
            "Map mode, playability, coordinate system, or camera behavior is inconsistent.",
        ));
    }
    match &manifest.coordinate_system {
        CoordinateSystem::OrthogonalGrid {
            columns,
            rows,
            cell_width,
            cell_height,
            ..
        } if columns.checked_mul(*cell_width) != Some(manifest.world.width)
            || rows.checked_mul(*cell_height) != Some(manifest.world.height) =>
        {
            findings.push(blocking(
                "runtime-coordinate-coverage-invalid",
                &manifest.id,
                "Orthogonal coordinates must exactly cover the map world.",
            ));
        }
        CoordinateSystem::ChunkGrid {
            columns,
            rows,
            chunk_width,
            chunk_height,
            ..
        } if columns.checked_mul(*chunk_width) != Some(manifest.world.width)
            || rows.checked_mul(*chunk_height) != Some(manifest.world.height) =>
        {
            findings.push(blocking(
                "runtime-coordinate-coverage-invalid",
                &manifest.id,
                "Chunk coordinates must exactly cover the map world.",
            ));
        }
        _ => {}
    }
    if !rectangle_bounds_valid(manifest.camera.bounds, manifest.world)
        || manifest.camera.viewport.width == 0
        || manifest.camera.viewport.height == 0
        || manifest.camera.viewport.width > manifest.camera.bounds.width
        || manifest.camera.viewport.height > manifest.camera.bounds.height
    {
        findings.push(blocking(
            "camera-bounds-invalid",
            &manifest.id,
            "Camera bounds and viewport must fit inside the map world.",
        ));
    }
    match (
        &manifest.object_library,
        &request.object_library,
        &request.object_library_hash,
    ) {
        (Some(reference), Some(library), Some(hash)) => {
            let observed = canonical_hash(library)?;
            if hash != &observed
                || reference.id != library.id
                || reference.revision != library.revision
                || reference.content_hash != *hash
                || library.map_id != manifest.map_id
                || library.plan.id != request.plan.id
                || library.plan.content_hash != request.plan.content_hash
            {
                findings.push(blocking(
                    "object-library-reference-mismatch",
                    &reference.id,
                    "Object library revision or canonical hash does not match the runtime manifest.",
                ));
            }
            let object_ids = library
                .objects
                .iter()
                .map(|object| object.id.as_str())
                .collect::<HashSet<_>>();
            let visual_revisions = library
                .objects
                .iter()
                .map(|object| {
                    (
                        object.visual.artifact.id.as_str(),
                        object.visual.artifact.revision.as_str(),
                    )
                })
                .collect::<HashSet<_>>();
            if object_ids.len() != library.objects.len()
                || visual_revisions.len() != library.objects.len()
            {
                findings.push(blocking(
                    "object-library-identity-duplicate",
                    &library.id,
                    "Object ids and accepted visual revisions must be unique.",
                ));
            }
            for object in &library.objects {
                if object.anchor.x > object.decoded_size.width
                    || object.anchor.y > object.decoded_size.height
                    || !rectangle_bounds_valid(object.placement_safe_area, object.decoded_size)
                {
                    findings.push(blocking(
                        "object-library-bounds-invalid",
                        &object.id,
                        "Object anchor or placement-safe area exceeds its decoded visual.",
                    ));
                }
            }
        }
        (None, None, None) => {}
        _ => findings.push(blocking(
            "object-library-closure-incomplete",
            &manifest.id,
            "Object library value, hash, and manifest reference must form one exact closure.",
        )),
    }

    let expected = expected_rasters(request);
    let expected_revisions = expected
        .iter()
        .map(|(_, accepted)| {
            (
                accepted.artifact.id.as_str(),
                accepted.artifact.revision.as_str(),
            )
        })
        .collect::<HashSet<_>>();
    if expected_revisions.len() != expected.len() {
        findings.push(blocking(
            "runtime-artifact-identity-duplicate",
            &manifest.id,
            "Every runtime role and object must bind a unique accepted artifact revision.",
        ));
    }
    let expected_keys = expected
        .iter()
        .map(|(key, _)| key.clone())
        .collect::<BTreeSet<_>>();
    let actual_keys = request
        .artifacts
        .iter()
        .map(|artifact| binding_key(&artifact.binding))
        .collect::<Vec<_>>();
    if actual_keys.iter().collect::<BTreeSet<_>>().len() != actual_keys.len()
        || actual_keys.iter().cloned().collect::<BTreeSet<_>>() != expected_keys
    {
        findings.push(blocking(
            "runtime-raster-closure-mismatch",
            &manifest.id,
            "Runtime raster inputs must exactly equal manifest visuals and object-library revisions; extras are rejected.",
        ));
    }
    let total_bytes = request
        .artifacts
        .iter()
        .map(|artifact| artifact.bytes_base64.len().saturating_mul(3) / 4)
        .sum::<usize>();
    if total_bytes > MAX_TOTAL_SOURCE_BYTES {
        return Err(ProxyError::Request(
            "Game Map runtime rasters exceed their aggregate byte budget".into(),
        ));
    }
    let expected_by_key = expected.into_iter().collect::<BTreeMap<_, _>>();
    let mut decoded = BTreeMap::new();
    let mut remaining_decoded_pixels = MAX_RUNTIME_DECODED_PIXELS;
    for artifact in &request.artifacts {
        let key = binding_key(&artifact.binding);
        if matches!(artifact.binding, RasterBinding::ExtractionSource { .. }) {
            findings.push(blocking(
                "planning-raster-rejected",
                &artifact.accepted_artifact.artifact.id,
                "Extraction or planning sources cannot enter the runtime compositor.",
            ));
            continue;
        }
        if expected_by_key.get(&key) != Some(&artifact.accepted_artifact) {
            findings.push(blocking(
                "accepted-raster-revision-mismatch",
                &artifact.accepted_artifact.artifact.id,
                "Runtime raster acceptance or revision does not match its exact manifest reference.",
            ));
        }
        match decode_raster(artifact, remaining_decoded_pixels) {
            Ok(image) => {
                remaining_decoded_pixels = remaining_decoded_pixels
                    .saturating_sub(u64::from(image.width()) * u64::from(image.height()));
                decoded.insert(key, DecodedRaster { image });
            }
            Err(_) => findings.push(blocking(
                "runtime-raster-byte-mismatch",
                &artifact.accepted_artifact.artifact.id,
                "Runtime raster bytes are undecodable or do not match their accepted identity.",
            )),
        }
    }

    if manifest.world.width == 0
        || manifest.world.height == 0
        || manifest.world.width > MAX_PREVIEW_DIMENSION
        || manifest.world.height > MAX_PREVIEW_DIMENSION
        || u64::from(manifest.world.width) * u64::from(manifest.world.height) > MAX_PREVIEW_PIXELS
    {
        findings.push(blocking(
            "preview-raster-budget-exceeded",
            &manifest.id,
            "Map world exceeds the deterministic preview raster budget.",
        ));
    }

    let visual_by_id = manifest
        .visuals
        .iter()
        .map(|visual| (visual.source.artifact.id.as_str(), visual))
        .collect::<BTreeMap<_, _>>();
    let expected_visual_role = match manifest.mode.as_str() {
        "tile" | "grid" => "terrain-atlas",
        "side-scroll" => "parallax-plates",
        "room-chunk" => "room-chunks",
        "baked-scene" => "baked-scene",
        _ => "base",
    };
    let visual_roles = manifest
        .visuals
        .iter()
        .map(|visual| visual.role.as_str())
        .collect::<HashSet<_>>();
    if visual_by_id.len() != manifest.visuals.len()
        || visual_roles.len() != manifest.visuals.len()
        || !visual_roles.contains(expected_visual_role)
        || visual_roles
            .iter()
            .any(|role| *role != expected_visual_role && *role != "foreground")
    {
        findings.push(blocking(
            "runtime-visual-role-invalid",
            &manifest.id,
            "Runtime visuals must contain the exact mode role and optional foreground only.",
        ));
    }
    let library_id = manifest
        .object_library
        .as_ref()
        .map(|library| library.id.as_str());
    let mut layer_ids = HashSet::new();
    let mut layer_orders = HashSet::new();
    for layer in &manifest.layers {
        if !layer_ids.insert(layer.id().to_string()) || !layer_orders.insert(layer.order()) {
            findings.push(blocking(
                "runtime-layer-identity-duplicate",
                layer.id(),
                "Runtime layer ids and orders must be unique.",
            ));
        }
        match layer {
            RuntimeLayer::Objects { source_id, .. } | RuntimeLayer::Actors { source_id, .. } => {
                if Some(source_id.as_str()) != library_id {
                    findings.push(blocking(
                        "runtime-layer-source-mismatch",
                        layer.id(),
                        "Object and actor layers must reference the exact object library revision.",
                    ));
                }
            }
            RuntimeLayer::Terrain {
                source_id,
                atlas,
                tiles,
                ..
            } => {
                let Some(visual) = visual_by_id.get(source_id.as_str()) else {
                    findings.push(blocking(
                        "runtime-layer-source-mismatch",
                        layer.id(),
                        "Terrain layer source is not an accepted runtime visual.",
                    ));
                    continue;
                };
                if visual.role != "terrain-atlas" {
                    findings.push(blocking(
                        "runtime-layer-role-mismatch",
                        layer.id(),
                        "Terrain layers require the terrain-atlas runtime role.",
                    ));
                }
                let expected_size = validate_grid(atlas)?;
                if decoded.get("runtime:terrain-atlas").map_or(true, |raster| {
                    raster.image.dimensions() != (expected_size.width, expected_size.height)
                }) {
                    findings.push(blocking(
                        "terrain-atlas-dimension-mismatch",
                        layer.id(),
                        "Terrain atlas decoded dimensions must exactly equal its declared grid.",
                    ));
                }
                let CoordinateSystem::OrthogonalGrid {
                    columns,
                    rows,
                    cell_width,
                    cell_height,
                    ..
                } = &manifest.coordinate_system
                else {
                    findings.push(blocking(
                        "terrain-coordinate-mismatch",
                        layer.id(),
                        "Terrain layers require orthogonal map coordinates.",
                    ));
                    continue;
                };
                let mut destinations = HashSet::new();
                if atlas.cell_width != *cell_width
                    || atlas.cell_height != *cell_height
                    || tiles.iter().any(|tile| {
                        !destinations.insert((tile.column, tile.row))
                            || tile.column >= *columns
                            || tile.row >= *rows
                            || tile.atlas_column >= atlas.columns
                            || tile.atlas_row >= atlas.rows
                    })
                {
                    findings.push(blocking(
                        "terrain-cell-reference-invalid",
                        layer.id(),
                        "Terrain tile destinations and atlas cells must be unique, exact, and in bounds.",
                    ));
                }
            }
            RuntimeLayer::Base { source_id, .. }
            | RuntimeLayer::Foreground { source_id, .. }
            | RuntimeLayer::Parallax { source_id, .. } => {
                let Some(visual) = visual_by_id.get(source_id.as_str()) else {
                    findings.push(blocking(
                        "runtime-layer-source-mismatch",
                        layer.id(),
                        "Visual layer source is not an accepted runtime visual.",
                    ));
                    continue;
                };
                let role_matches_layer = match layer {
                    RuntimeLayer::Base { .. } => {
                        matches!(visual.role.as_str(), "base" | "room-chunks" | "baked-scene")
                    }
                    RuntimeLayer::Foreground { .. } => visual.role == "foreground",
                    RuntimeLayer::Parallax { .. } => visual.role == "parallax-plates",
                    _ => false,
                };
                if !role_matches_layer {
                    findings.push(blocking(
                        "runtime-layer-role-mismatch",
                        layer.id(),
                        "Visual layer kind does not match its accepted runtime visual role.",
                    ));
                }
                let key = format!("runtime:{}", visual.role);
                if decoded.get(&key).map_or(true, |raster| {
                    raster.image.dimensions() != (manifest.world.width, manifest.world.height)
                }) {
                    findings.push(blocking(
                        "runtime-visual-dimension-mismatch",
                        layer.id(),
                        "Full-scene runtime visuals must exactly match the map world dimensions.",
                    ));
                }
            }
        }
    }

    let runtime_ids = manifest
        .layers
        .iter()
        .map(|layer| layer.id())
        .chain(manifest.placements.iter().map(|entry| entry.id.as_str()))
        .chain(manifest.collision.iter().map(|entry| entry.id.as_str()))
        .chain(manifest.zones.iter().map(|entry| entry.id.as_str()))
        .chain(manifest.spawns.iter().map(|entry| entry.id.as_str()))
        .chain(manifest.exits.iter().map(|entry| entry.id.as_str()))
        .collect::<HashSet<_>>();
    let runtime_id_count = manifest.layers.len()
        + manifest.placements.len()
        + manifest.collision.len()
        + manifest.zones.len()
        + manifest.spawns.len()
        + manifest.exits.len();
    if runtime_ids.len() != runtime_id_count {
        findings.push(blocking(
            "runtime-record-identity-duplicate",
            &manifest.id,
            "Layer, placement, geometry, spawn, and exit ids must be globally unique.",
        ));
    }

    let objects = request
        .object_library
        .as_ref()
        .map(|library| {
            library
                .objects
                .iter()
                .map(|object| (object.id.as_str(), object))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let object_layer_ids = manifest
        .layers
        .iter()
        .filter(|layer| {
            matches!(
                layer,
                RuntimeLayer::Objects { .. } | RuntimeLayer::Actors { .. }
            )
        })
        .map(|layer| layer.id().to_string())
        .collect::<HashSet<_>>();
    for placement in &manifest.placements {
        let Some(object) = objects.get(placement.object_id.as_str()) else {
            findings.push(blocking(
                "placement-object-missing",
                &placement.id,
                "Placement references an object absent from the exact object library.",
            ));
            continue;
        };
        if object.revision != placement.object_revision
            || !object_layer_ids.contains(&placement.layer_id)
        {
            findings.push(blocking(
                "placement-reference-mismatch",
                &placement.id,
                "Placement object revision or layer reference is stale.",
            ));
        }
        if placement.scale.x != 1.0 || placement.scale.y != 1.0 || placement.rotation_degrees != 0.0
        {
            findings.push(blocking(
                "unsupported-deterministic-transform",
                &placement.id,
                "Native v1 composition accepts exact-size, unrotated object placements only.",
            ));
        }
        let key = format!("object:{}@{}", object.id, object.revision);
        if decoded.get(&key).map_or(true, |raster| {
            raster.image.dimensions() != (object.decoded_size.width, object.decoded_size.height)
        }) {
            findings.push(blocking(
                "object-decoded-size-mismatch",
                &placement.id,
                "Placed object bytes do not match the object-library decoded size.",
            ));
        }
        let in_bounds = placement.position.x >= object.anchor.x
            && placement.position.y >= object.anchor.y
            && placement
                .position
                .x
                .checked_sub(object.anchor.x)
                .and_then(|x| x.checked_add(object.decoded_size.width))
                .is_some_and(|x| x <= manifest.world.width)
            && placement
                .position
                .y
                .checked_sub(object.anchor.y)
                .and_then(|y| y.checked_add(object.decoded_size.height))
                .is_some_and(|y| y <= manifest.world.height);
        if !in_bounds {
            findings.push(blocking(
                "placement-bounds-invalid",
                &placement.id,
                "Placed object alpha canvas exceeds the map world after applying its authored anchor.",
            ));
        }
    }

    for collision in &manifest.collision {
        if !matches!(collision.behavior.as_str(), "solid" | "one-way" | "hazard")
            || !shape_bounds_valid(&collision.shape, manifest.world)
        {
            findings.push(blocking(
                "collision-geometry-invalid",
                &collision.id,
                "Collision geometry is degenerate or outside the map world.",
            ));
        }
    }
    for zone in &manifest.zones {
        if !shape_bounds_valid(&zone.shape, manifest.world) {
            findings.push(blocking(
                "zone-geometry-invalid",
                &zone.id,
                "Zone geometry is degenerate or outside the map world.",
            ));
        }
    }
    for exit in &manifest.exits {
        if !shape_bounds_valid(&exit.area, manifest.world) || !destination_valid(&exit.destination)
        {
            findings.push(blocking(
                "exit-geometry-invalid",
                &exit.id,
                "Exit geometry is degenerate or outside the map world.",
            ));
        }
    }
    let player_spawns = manifest
        .spawns
        .iter()
        .filter(|spawn| spawn.kind == "player")
        .collect::<Vec<_>>();
    if manifest.playable && player_spawns.is_empty() {
        findings.push(blocking(
            "player-spawn-missing",
            &manifest.id,
            "Playable maps require at least one player spawn.",
        ));
    }
    for spawn in &manifest.spawns {
        if spawn.position.x >= manifest.world.width || spawn.position.y >= manifest.world.height {
            findings.push(blocking(
                "spawn-bounds-invalid",
                &spawn.id,
                "Spawn point must lie strictly inside the map world.",
            ));
        } else if manifest.collision.iter().any(|collision| {
            collision.behavior == "hazard"
                && point_in_shape(
                    f64::from(spawn.position.x),
                    f64::from(spawn.position.y),
                    &collision.shape,
                )
        }) || manifest.zones.iter().any(|zone| {
            zone.purpose == "hazard"
                && point_in_shape(
                    f64::from(spawn.position.x),
                    f64::from(spawn.position.y),
                    &zone.shape,
                )
        }) {
            findings.push(blocking(
                "spawn-hazard-overlap",
                &spawn.id,
                "Spawn point overlaps authored hazard geometry.",
            ));
        }
    }
    if manifest.playable && manifest.exits.is_empty() {
        findings.push(blocking(
            "exit-missing",
            &manifest.id,
            "Playable maps require at least one authored exit.",
        ));
    }
    if manifest.playable {
        if request.object_library.is_none()
            || manifest.collision.is_empty()
            || manifest.spawns.is_empty()
            || manifest.exits.is_empty()
        {
            findings.push(blocking(
                "playable-runtime-closure-incomplete",
                &manifest.id,
                "Playable maps require an object library, collision, spawn, and exit data.",
            ));
        }
    } else if request.object_library.is_some()
        || !manifest.placements.is_empty()
        || !manifest.collision.is_empty()
        || !manifest.zones.is_empty()
        || !manifest.spawns.is_empty()
        || !manifest.exits.is_empty()
    {
        findings.push(blocking(
            "baked-runtime-authority-invalid",
            &manifest.id,
            "Visual-only baked scenes cannot carry editable objects or gameplay authority.",
        ));
    }
    if let Some(library) = &request.object_library {
        let collision_ids = manifest
            .collision
            .iter()
            .map(|collision| collision.id.as_str())
            .collect::<HashSet<_>>();
        for object in &library.objects {
            if let CollisionPolicy::AuthoredShape { geometry_id } = &object.collision_policy {
                if !collision_ids.contains(geometry_id.as_str()) {
                    findings.push(blocking(
                        "object-collision-reference-missing",
                        &object.id,
                        "Object collision policy references geometry absent from the runtime manifest.",
                    ));
                }
            }
        }
    }
    if let Navigation::Unavailable { reason } = &manifest.navigation {
        if reason != "no-explicit-navigation-data" {
            findings.push(blocking(
                "navigation-unavailable-reason-invalid",
                &manifest.id,
                "Unavailable navigation must use the explicit no-data reason.",
            ));
        }
    }
    let reachability = validate_reachability(manifest, &mut findings);
    let status = if findings
        .iter()
        .any(|finding| finding.severity == "blocking")
    {
        "blocked"
    } else {
        "passed"
    };
    Ok((
        RuntimeValidation {
            protocol: RUNTIME_VALIDATION_PROTOCOL.into(),
            validator: RUNTIME_VALIDATOR.into(),
            runtime_manifest_hash: observed_manifest_hash,
            status: status.into(),
            findings,
            reachability,
        },
        decoded,
    ))
}

#[tauri::command]
pub fn validate_game_map_runtime(
    request: RuntimeProcessingRequest,
) -> Result<RuntimeValidation, ProxyError> {
    validate_runtime_internal(&request).map(|(validation, _)| validation)
}

fn visual_key_for_source(manifest: &RuntimeManifest, source_id: &str) -> Option<String> {
    manifest
        .visuals
        .iter()
        .find(|visual| visual.source.artifact.id == source_id)
        .map(|visual| format!("runtime:{}", visual.role))
}

fn draw_pixel(image: &mut image::RgbaImage, x: i64, y: i64, color: image::Rgba<u8>) {
    if x < 0 || y < 0 || x >= i64::from(image.width()) || y >= i64::from(image.height()) {
        return;
    }
    let destination = image.get_pixel_mut(x as u32, y as u32);
    let alpha = u32::from(color.0[3]);
    for channel in 0..3 {
        destination.0[channel] = ((u32::from(color.0[channel]) * alpha
            + u32::from(destination.0[channel]) * (255 - alpha)
            + 127)
            / 255) as u8;
    }
    destination.0[3] = 255;
}

fn draw_line(image: &mut image::RgbaImage, start: Point, end: Point, color: image::Rgba<u8>) {
    let (mut x0, mut y0) = (i64::from(start.x), i64::from(start.y));
    let (x1, y1) = (i64::from(end.x), i64::from(end.y));
    let dx = (x1 - x0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let dy = -(y1 - y0).abs();
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut error = dx + dy;
    loop {
        draw_pixel(image, x0, y0, color);
        if x0 == x1 && y0 == y1 {
            break;
        }
        let doubled = 2 * error;
        if doubled >= dy {
            error += dy;
            x0 += sx;
        }
        if doubled <= dx {
            error += dx;
            y0 += sy;
        }
    }
}

fn draw_shape(image: &mut image::RgbaImage, shape: &Shape, color: image::Rgba<u8>) {
    match shape {
        Shape::Rectangle { bounds } => {
            let right = bounds.x + bounds.width - 1;
            let bottom = bounds.y + bounds.height - 1;
            draw_line(
                image,
                Point {
                    x: bounds.x,
                    y: bounds.y,
                },
                Point {
                    x: right,
                    y: bounds.y,
                },
                color,
            );
            draw_line(
                image,
                Point {
                    x: right,
                    y: bounds.y,
                },
                Point {
                    x: right,
                    y: bottom,
                },
                color,
            );
            draw_line(
                image,
                Point {
                    x: right,
                    y: bottom,
                },
                Point {
                    x: bounds.x,
                    y: bottom,
                },
                color,
            );
            draw_line(
                image,
                Point {
                    x: bounds.x,
                    y: bottom,
                },
                Point {
                    x: bounds.x,
                    y: bounds.y,
                },
                color,
            );
        }
        Shape::Polygon { points } => {
            for index in 0..points.len() {
                draw_line(
                    image,
                    points[index],
                    points[(index + 1) % points.len()],
                    color,
                );
            }
        }
    }
}

fn draw_cross(image: &mut image::RgbaImage, point: Point, color: image::Rgba<u8>) {
    for offset in -4_i64..=4 {
        draw_pixel(
            image,
            i64::from(point.x) + offset,
            i64::from(point.y),
            color,
        );
        draw_pixel(
            image,
            i64::from(point.x),
            i64::from(point.y) + offset,
            color,
        );
    }
}

fn compose_runtime(
    request: &RuntimeProcessingRequest,
    decoded: &BTreeMap<String, DecodedRaster>,
) -> Result<(Vec<u8>, Vec<u8>), ProxyError> {
    let manifest = &request.runtime_manifest;
    let mut preview = image::RgbaImage::from_pixel(
        manifest.world.width,
        manifest.world.height,
        image::Rgba([0, 0, 0, 0]),
    );
    let objects = request
        .object_library
        .as_ref()
        .map(|library| {
            library
                .objects
                .iter()
                .map(|object| (object.id.as_str(), object))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let mut layers = manifest.layers.iter().collect::<Vec<_>>();
    layers.sort_by_key(|layer| (layer.order(), layer.id()));
    for layer in layers {
        match layer {
            RuntimeLayer::Base { source_id, .. }
            | RuntimeLayer::Foreground { source_id, .. }
            | RuntimeLayer::Parallax { source_id, .. } => {
                let key = visual_key_for_source(manifest, source_id).ok_or_else(|| {
                    ProxyError::Request(
                        "Game Map visual source disappeared after validation".into(),
                    )
                })?;
                let source = decoded.get(&key).ok_or_else(|| {
                    ProxyError::Request("Game Map visual bytes disappeared after validation".into())
                })?;
                image::imageops::overlay(&mut preview, &source.image, 0, 0);
            }
            RuntimeLayer::Terrain { atlas, tiles, .. } => {
                let source = decoded.get("runtime:terrain-atlas").ok_or_else(|| {
                    ProxyError::Request(
                        "Game Map terrain bytes disappeared after validation".into(),
                    )
                })?;
                let mut ordered = tiles.iter().collect::<Vec<_>>();
                ordered
                    .sort_by_key(|tile| (tile.row, tile.column, tile.atlas_row, tile.atlas_column));
                for tile in ordered {
                    let cell = image::imageops::crop_imm(
                        &source.image,
                        tile.atlas_column * atlas.cell_width,
                        tile.atlas_row * atlas.cell_height,
                        atlas.cell_width,
                        atlas.cell_height,
                    )
                    .to_image();
                    image::imageops::overlay(
                        &mut preview,
                        &cell,
                        tile.column * atlas.cell_width,
                        tile.row * atlas.cell_height,
                    );
                }
            }
            RuntimeLayer::Objects { id, .. } | RuntimeLayer::Actors { id, .. } => {
                let mut placements = manifest
                    .placements
                    .iter()
                    .filter(|placement| placement.layer_id == *id)
                    .collect::<Vec<_>>();
                placements.sort_by_key(|placement| {
                    (
                        i64::from(placement.position.y) + i64::from(placement.sort_offset),
                        placement.id.as_str(),
                    )
                });
                for placement in placements {
                    let object = objects.get(placement.object_id.as_str()).ok_or_else(|| {
                        ProxyError::Request("Game Map object disappeared after validation".into())
                    })?;
                    let key = format!("object:{}@{}", object.id, object.revision);
                    let source = decoded.get(&key).ok_or_else(|| {
                        ProxyError::Request(
                            "Game Map object bytes disappeared after validation".into(),
                        )
                    })?;
                    image::imageops::overlay(
                        &mut preview,
                        &source.image,
                        placement.position.x - object.anchor.x,
                        placement.position.y - object.anchor.y,
                    );
                }
            }
        }
    }
    let preview_bytes = encode_cutout_png(&preview)?;
    let mut debug = preview;
    for collision in &manifest.collision {
        let color = if collision.behavior == "hazard" {
            image::Rgba([255, 32, 64, 230])
        } else {
            image::Rgba([255, 64, 64, 220])
        };
        draw_shape(&mut debug, &collision.shape, color);
    }
    for zone in &manifest.zones {
        draw_shape(&mut debug, &zone.shape, image::Rgba([255, 196, 32, 220]));
    }
    for exit in &manifest.exits {
        draw_shape(&mut debug, &exit.area, image::Rgba([32, 220, 255, 240]));
    }
    for spawn in &manifest.spawns {
        draw_cross(&mut debug, spawn.position, image::Rgba([32, 255, 128, 255]));
    }
    draw_shape(
        &mut debug,
        &Shape::Rectangle {
            bounds: manifest.camera.bounds,
        },
        image::Rgba([64, 128, 255, 220]),
    );
    let debug_bytes = encode_cutout_png(&debug)?;
    Ok((preview_bytes, debug_bytes))
}

#[tauri::command]
pub fn compose_game_map_preview(
    request: RuntimeProcessingRequest,
) -> Result<NativePreview, ProxyError> {
    let (validation, decoded) = validate_runtime_internal(&request)?;
    if validation.status != "passed" {
        let first = validation
            .findings
            .iter()
            .find(|finding| finding.severity == "blocking")
            .map(|finding| format!("{}: {}", finding.code, finding.message))
            .unwrap_or_else(|| "unknown validation failure".into());
        return Err(ProxyError::Request(format!(
            "Game Map preview is blocked by runtime validation: {first}"
        )));
    }
    let (preview_bytes, debug_bytes) = compose_runtime(&request, &decoded)?;
    let preview_hash = sha256(&preview_bytes);
    let debug_hash = sha256(&debug_bytes);
    if preview_hash == debug_hash {
        return Err(ProxyError::Request(
            "Game Map debug overlay must differ from the composed preview".into(),
        ));
    }
    let manifest = &request.runtime_manifest;
    let mut inputs = request
        .artifacts
        .iter()
        .map(|artifact| artifact.accepted_artifact.clone())
        .collect::<Vec<_>>();
    inputs.sort_by(|left, right| {
        (&left.artifact.id, &left.artifact.revision)
            .cmp(&(&right.artifact.id, &right.artifact.revision))
    });
    let receipt_identity = canonical_hash(&serde_json::json!({
        "plan": &request.plan,
        "runtimeManifestHash": &request.runtime_manifest_hash,
        "objectLibraryHash": &request.object_library_hash,
        "inputArtifactIds": inputs.iter().map(|input| &input.artifact.id).collect::<Vec<_>>(),
        "previewHash": &preview_hash,
        "debugHash": &debug_hash,
        "compositor": COMPOSITOR,
    }))?;
    let revision = |hash: &str| format!("revision:sha256:{hash}");
    let receipt = PreviewReceipt {
        version: "game-map.preview-receipt.v1".into(),
        id: format!("game-map-preview-receipt:sha256:{receipt_identity}"),
        map_id: manifest.map_id.clone(),
        plan: request.plan.clone(),
        runtime_manifest: RevisionReference {
            id: manifest.id.clone(),
            revision: manifest.revision.clone(),
            content_hash: request.runtime_manifest_hash.clone(),
        },
        object_library: request
            .object_library
            .as_ref()
            .zip(request.object_library_hash.as_ref())
            .map(|(library, hash)| RevisionReference {
                id: library.id.clone(),
                revision: library.revision.clone(),
                content_hash: hash.clone(),
            }),
        compositor: CompositorReference {
            id: COMPOSITOR.into(),
            implementation_hash: sha256(COMPOSITOR.as_bytes()),
        },
        inputs,
        preview: EvidenceReference {
            id: format!("artifact:sha256:{preview_hash}"),
            revision: revision(&preview_hash),
            content_hash: preview_hash,
        },
        debug_overlay: EvidenceReference {
            id: format!("artifact:sha256:{debug_hash}"),
            revision: revision(&debug_hash),
            content_hash: debug_hash,
        },
        validation_status: validation.status,
        reachability: validation.reachability,
        findings: validation.findings,
    };
    Ok(NativePreview {
        protocol: NATIVE_PREVIEW_PROTOCOL.into(),
        receipt,
        preview_bytes_base64: STANDARD.encode(preview_bytes),
        debug_overlay_bytes_base64: STANDARD.encode(debug_bytes),
        width: manifest.world.width,
        height: manifest.world.height,
    })
}

fn exact_semantic_review_requirements(
    input: &SemanticAcceptanceInput,
) -> Result<Vec<(String, String)>, ProxyError> {
    let manifest = &input.runtime.runtime_manifest;
    let visual = manifest
        .visuals
        .first()
        .ok_or_else(|| ProxyError::Request("semantic review requires one runtime visual".into()))?;
    let mut requirements = vec![(
        "visual-role-fidelity".into(),
        visual.source.artifact.id.clone(),
    )];
    let library = input.runtime.object_library.as_ref().ok_or_else(|| {
        ProxyError::Request("semantic review requires the exact object library".into())
    })?;
    requirements.extend(library.objects.iter().map(|object| {
        (
            "object-cutout-quality".into(),
            object.visual.artifact.id.clone(),
        )
    }));
    requirements.push((
        "runtime-composition".into(),
        input.preview.receipt.preview.id.clone(),
    ));
    requirements.push((
        "authored-geometry".into(),
        input.preview.receipt.debug_overlay.id.clone(),
    ));
    if manifest.mode == "tile" {
        requirements.push((
            "terrain-grid-coherence".into(),
            visual.source.artifact.id.clone(),
        ));
    }
    requirements.sort();
    Ok(requirements)
}

fn validate_semantic_decisions(
    input: &SemanticAcceptanceInput,
) -> Result<(String, String), ProxyError> {
    let mut required = exact_semantic_review_requirements(input)?;
    let mut observed = Vec::with_capacity(input.decisions.len());
    let mut reviewer: Option<(String, String)> = None;
    for decision in &input.decisions {
        let identity = (decision.reviewer_kind.clone(), decision.reviewer_id.clone());
        if reviewer
            .as_ref()
            .is_some_and(|current| current != &identity)
        {
            return Err(ProxyError::Request(
                "Game Map semantic review decisions must share one attributed reviewer".into(),
            ));
        }
        reviewer.get_or_insert(identity);
        if decision.status != "accepted"
            || !matches!(
                decision.reviewer_kind.as_str(),
                "local-agent-visual-review" | "local-human-visual-review"
            )
            || decision.reviewer_id.is_empty()
            || decision.reviewer_id.len() > 240
            || decision.reviewer_id.chars().any(char::is_control)
            || decision.notes.trim().is_empty()
            || decision.notes.len() > 2_000
            || decision
                .notes
                .chars()
                .any(|character| character.is_control() && character != '\n')
            || decision.evidence_artifact_ids.len() != 1
            || decision.evidence_artifact_ids[0] != decision.subject_id
        {
            return Err(ProxyError::Request(
                "Game Map semantic review decision is incomplete or unattributed".into(),
            ));
        }
        observed.push((decision.criterion.clone(), decision.subject_id.clone()));
    }
    observed.sort();
    required.dedup();
    if observed != required {
        return Err(ProxyError::Request(
            "Game Map semantic review does not cover the exact visual, object, composition, geometry, and mode-specific closure"
                .into(),
        ));
    }
    reviewer.ok_or_else(|| ProxyError::Request("Game Map semantic review is missing".into()))
}

fn build_semantic_acceptance_payload(
    input: &SemanticAcceptanceInput,
) -> Result<SemanticAcceptancePayload, ProxyError> {
    let manifest = &input.runtime.runtime_manifest;
    if !matches!(manifest.mode.as_str(), "scene" | "tile") {
        return Err(ProxyError::Request(
            "live Game Map semantic acceptance currently supports scene and tile modes".into(),
        ));
    }
    let validation = validate_game_map_runtime(input.runtime.clone())?;
    if validation.status != "passed" {
        return Err(ProxyError::Request(
            "Game Map semantic acceptance requires a passing runtime validation".into(),
        ));
    }
    let replayed_preview = compose_game_map_preview(input.runtime.clone())?;
    if canonical_hash(&replayed_preview)? != canonical_hash(&input.preview)? {
        return Err(ProxyError::Request(
            "Game Map semantic acceptance preview drifted from deterministic replay".into(),
        ));
    }
    if input.artifacts.len() != input.runtime.artifacts.len()
        || input.artifacts.is_empty()
        || input.artifacts.len() > 2_000
    {
        return Err(ProxyError::Request(
            "Game Map semantic acceptance artifact closure is incomplete".into(),
        ));
    }
    let mut artifacts_by_key = BTreeMap::new();
    for artifact in &input.artifacts {
        let verified = verify_live_artifact_inner(artifact.clone())?;
        let key = binding_key(&verified.binding);
        if artifacts_by_key.insert(key, verified).is_some() {
            return Err(ProxyError::Request(
                "Game Map semantic acceptance contains duplicate live artifacts".into(),
            ));
        }
    }
    let mut accepted_artifacts = Vec::with_capacity(input.runtime.artifacts.len());
    for raster in &input.runtime.artifacts {
        let key = binding_key(&raster.binding);
        let live = artifacts_by_key.remove(&key).ok_or_else(|| {
            ProxyError::Request(format!(
                "Game Map semantic acceptance is missing live artifact {key}"
            ))
        })?;
        let runtime_bytes = STANDARD
            .decode(&raster.bytes_base64)
            .map_err(|_| ProxyError::Request("Game Map runtime raster base64 is invalid".into()))?;
        let live_bytes = STANDARD
            .decode(&live.bytes_base64)
            .map_err(|_| ProxyError::Request("Game Map live raster base64 is invalid".into()))?;
        if live.binding != raster.binding
            || live.accepted_artifact != raster.accepted_artifact
            || live_bytes != runtime_bytes
        {
            return Err(ProxyError::Request(format!(
                "Game Map semantic acceptance artifact {key} differs from the runtime closure"
            )));
        }
        accepted_artifacts.push(AcceptedProductionArtifact {
            binding_key: key,
            admission_receipt_id: live.admission.receipt_id,
            admission_receipt_hash: live.admission.receipt_hash,
            source_receipt_id: live.source_receipt.receipt_id,
            source_receipt_hash: live.source_receipt.receipt_hash,
            source_artifact_id: live.source_receipt.artifact.artifact_id,
            source_artifact_sha256: live.source_receipt.artifact.sha256,
            output_artifact_id: live.accepted_artifact.artifact.id,
            output_artifact_sha256: live.accepted_artifact.artifact.content_hash,
        });
    }
    if !artifacts_by_key.is_empty() {
        return Err(ProxyError::Request(
            "Game Map semantic acceptance contains an extra live artifact".into(),
        ));
    }
    accepted_artifacts.sort_by(|left, right| left.binding_key.cmp(&right.binding_key));
    let (reviewer_kind, reviewer_id) = validate_semantic_decisions(input)?;
    let accepted_at = input
        .artifacts
        .iter()
        .map(|artifact| artifact.source_receipt.completed_at)
        .max()
        .ok_or_else(|| {
            ProxyError::Request("Game Map semantic acceptance has no source clock".into())
        })?;
    let runtime_manifest = RevisionReference {
        id: manifest.id.clone(),
        revision: manifest.revision.clone(),
        content_hash: input.runtime.runtime_manifest_hash.clone(),
    };
    let object_library = input
        .runtime
        .object_library
        .as_ref()
        .zip(input.runtime.object_library_hash.as_ref())
        .map(|(library, hash)| RevisionReference {
            id: library.id.clone(),
            revision: library.revision.clone(),
            content_hash: hash.clone(),
        });
    let preview_receipt_hash = canonical_hash(&input.preview.receipt)?;
    let verifier_implementation_hash = sha256(SEMANTIC_ACCEPTANCE_VERIFIER.as_bytes());
    let closure_hash = canonical_hash(&serde_json::json!({
        "mapId": &manifest.map_id,
        "mode": &manifest.mode,
        "plan": &input.runtime.plan,
        "runtimeManifest": &runtime_manifest,
        "objectLibrary": &object_library,
        "previewReceiptId": &input.preview.receipt.id,
        "previewReceiptHash": &preview_receipt_hash,
        "previewArtifactId": &input.preview.receipt.preview.id,
        "debugOverlayArtifactId": &input.preview.receipt.debug_overlay.id,
        "acceptedArtifacts": &accepted_artifacts,
        "decisions": &input.decisions,
        "verifierImplementationHash": &verifier_implementation_hash,
        "reviewerKind": &reviewer_kind,
        "reviewerId": &reviewer_id,
        "acceptedAt": accepted_at,
    }))?;
    Ok(SemanticAcceptancePayload {
        version: SEMANTIC_ACCEPTANCE_PROTOCOL.into(),
        receipt_id: format!("receipt:game-map-semantic-acceptance:{closure_hash}"),
        map_id: manifest.map_id.clone(),
        mode: manifest.mode.clone(),
        plan: input.runtime.plan.clone(),
        runtime_manifest,
        object_library,
        preview_receipt_id: input.preview.receipt.id.clone(),
        preview_receipt_hash,
        preview_artifact_id: input.preview.receipt.preview.id.clone(),
        debug_overlay_artifact_id: input.preview.receipt.debug_overlay.id.clone(),
        accepted_artifacts,
        decisions: input.decisions.clone(),
        verifier_implementation_hash,
        reviewer_kind,
        reviewer_id,
        accepted_at,
    })
}

fn acceptance_from_payload(
    payload: SemanticAcceptancePayload,
) -> Result<GameMapSemanticAcceptance, ProxyError> {
    let (receipt_hash, signature) = sign_host_payload(&payload)?;
    Ok(GameMapSemanticAcceptance {
        version: payload.version,
        receipt_id: payload.receipt_id,
        receipt_hash,
        map_id: payload.map_id,
        mode: payload.mode,
        plan: payload.plan,
        runtime_manifest: payload.runtime_manifest,
        object_library: payload.object_library,
        preview_receipt_id: payload.preview_receipt_id,
        preview_receipt_hash: payload.preview_receipt_hash,
        preview_artifact_id: payload.preview_artifact_id,
        debug_overlay_artifact_id: payload.debug_overlay_artifact_id,
        accepted_artifacts: payload.accepted_artifacts,
        decisions: payload.decisions,
        verifier_implementation_hash: payload.verifier_implementation_hash,
        reviewer_kind: payload.reviewer_kind,
        reviewer_id: payload.reviewer_id,
        accepted_at: payload.accepted_at,
        signature,
    })
}

#[tauri::command]
pub fn accept_game_map_semantic_review(
    input: SemanticAcceptanceInput,
) -> Result<GameMapSemanticAcceptance, ProxyError> {
    acceptance_from_payload(build_semantic_acceptance_payload(&input)?)
}

#[tauri::command]
pub fn verify_game_map_semantic_acceptance(
    acceptance: GameMapSemanticAcceptance,
    input: SemanticAcceptanceInput,
) -> Result<GameMapSemanticAcceptance, ProxyError> {
    let expected = build_semantic_acceptance_payload(&input)?;
    if canonical_hash(&acceptance.payload())? != canonical_hash(&expected)? {
        return Err(ProxyError::Request(
            "Game Map semantic acceptance drifted from its exact retained production closure"
                .into(),
        ));
    }
    verify_host_payload(
        &acceptance.payload(),
        &acceptance.receipt_hash,
        &acceptance.signature,
    )?;
    Ok(acceptance)
}

#[cfg(test)]
mod tests {
    use super::super::{
        dashscope_image::{self, DashScopeImageOperation},
        keys,
        multimodal_receipt::MultimodalHostContext,
    };
    use super::*;
    use std::path::Path;

    fn png(image: &image::RgbaImage) -> Vec<u8> {
        encode_cutout_png(image).unwrap()
    }

    fn accepted(bytes: &[u8], seed: &str) -> AcceptedArtifact {
        let digest = sha256(bytes);
        AcceptedArtifact {
            artifact: EvidenceReference {
                id: format!("artifact:sha256:{digest}"),
                revision: format!("artifact-revision:{seed}"),
                content_hash: digest,
            },
            acceptance: AcceptanceReference {
                receipt_id: format!("acceptance:{seed}"),
                receipt_revision: format!("acceptance-revision:{seed}"),
                receipt_hash: sha256(format!("acceptance:{seed}").as_bytes()),
            },
        }
    }

    fn raster(binding: RasterBinding, image: &image::RgbaImage, seed: &str) -> RasterInput {
        let bytes = png(image);
        RasterInput {
            binding,
            accepted_artifact: accepted(&bytes, seed),
            media_type: "image/png".into(),
            bytes_base64: STANDARD.encode(bytes),
        }
    }

    #[test]
    fn prop_and_terrain_extraction_are_deterministic_and_fail_closed() {
        let mut props = image::RgbaImage::from_pixel(8, 4, image::Rgba([0, 0, 0, 0]));
        for y in 1..3 {
            for x in 1..3 {
                props.put_pixel(x, y, image::Rgba([255, 0, 0, 255]));
            }
        }
        for x in 5..7 {
            props.put_pixel(x, 2, image::Rgba([0, 255, 0, 255]));
        }
        let request = PropPackExtractionRequest {
            source: raster(
                RasterBinding::ExtractionSource {
                    role: "prop-pack".into(),
                },
                &props,
                "props",
            ),
            grid: AtlasGrid {
                columns: 2,
                rows: 1,
                cell_width: 4,
                cell_height: 4,
            },
            objects: vec![
                PropDefinition {
                    id: "object:compact".into(),
                    name: "Compact".into(),
                    column: 0,
                    row: 0,
                    collision_policy: "none".into(),
                },
                PropDefinition {
                    id: "object:wide".into(),
                    name: "Wide".into(),
                    column: 1,
                    row: 0,
                    collision_policy: "none".into(),
                },
            ],
        };
        let first = extract_game_map_prop_pack(request.clone()).unwrap();
        let second = extract_game_map_prop_pack(request.clone()).unwrap();
        assert_eq!(first.status, "passed");
        assert_eq!(first.cells[1].classification, "wide");
        assert_eq!(first.cells[0].cell.sha256, second.cells[0].cell.sha256);
        assert_eq!(
            first.cells[1].cell.bytes_base64,
            second.cells[1].cell.bytes_base64
        );
        let mut collision_request = request;
        collision_request.objects.truncate(1);
        collision_request.objects[0].collision_policy = "authored-shape".into();
        let collision = extract_game_map_prop_pack(collision_request).unwrap();
        assert_eq!(collision.cells[0].classification, "collision-bearing");

        let mut edge_prop = image::RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 0, 0]));
        edge_prop.put_pixel(0, 2, image::Rgba([255, 255, 255, 255]));
        let edge_result = extract_game_map_prop_pack(PropPackExtractionRequest {
            source: raster(
                RasterBinding::ExtractionSource {
                    role: "prop-pack".into(),
                },
                &edge_prop,
                "edge-prop",
            ),
            grid: AtlasGrid {
                columns: 1,
                rows: 1,
                cell_width: 4,
                cell_height: 4,
            },
            objects: vec![PropDefinition {
                id: "object:edge".into(),
                name: "Edge".into(),
                column: 0,
                row: 0,
                collision_policy: "none".into(),
            }],
        })
        .unwrap();
        assert_eq!(edge_result.status, "blocked");
        assert_eq!(edge_result.findings[0].code, "prop-cell-edge-contact");

        let terrain = image::RgbaImage::from_pixel(4, 4, image::Rgba([20, 40, 60, 255]));
        let seamable = extract_game_map_terrain_atlas(TerrainExtractionRequest {
            source: raster(
                RasterBinding::ExtractionSource {
                    role: "terrain-atlas".into(),
                },
                &terrain,
                "terrain",
            ),
            grid: AtlasGrid {
                columns: 2,
                rows: 2,
                cell_width: 2,
                cell_height: 2,
            },
            edge_policy: "seamable".into(),
        })
        .unwrap();
        assert_eq!(seamable.status, "passed");
        assert_eq!(seamable.cells.len(), 4);
        let isolated = extract_game_map_terrain_atlas(TerrainExtractionRequest {
            source: raster(
                RasterBinding::ExtractionSource {
                    role: "terrain-atlas".into(),
                },
                &terrain,
                "terrain",
            ),
            grid: seamable.grid,
            edge_policy: "isolated".into(),
        })
        .unwrap();
        assert_eq!(isolated.status, "blocked");
        assert_eq!(isolated.findings.len(), 4);

        let partial = image::RgbaImage::from_pixel(5, 4, image::Rgba([20, 40, 60, 255]));
        assert!(extract_game_map_terrain_atlas(TerrainExtractionRequest {
            source: raster(
                RasterBinding::ExtractionSource {
                    role: "terrain-atlas".into(),
                },
                &partial,
                "partial-terrain",
            ),
            grid: AtlasGrid {
                columns: 2,
                rows: 2,
                cell_width: 2,
                cell_height: 2,
            },
            edge_policy: "seamable".into(),
        })
        .is_err());
    }

    fn scene_request() -> RuntimeProcessingRequest {
        let base_image = image::RgbaImage::from_pixel(16, 16, image::Rgba([18, 28, 38, 255]));
        let mut object_image = image::RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 0, 0]));
        object_image.put_pixel(0, 0, image::Rgba([255, 220, 40, 255]));
        object_image.put_pixel(1, 0, image::Rgba([255, 220, 40, 255]));
        let base = raster(
            RasterBinding::RuntimeVisual {
                role: "base".into(),
            },
            &base_image,
            "base",
        );
        let object_raster = raster(
            RasterBinding::ObjectVisual {
                object_id: "object:lantern".into(),
                object_revision: "object:lantern:revision:1".into(),
            },
            &object_image,
            "lantern",
        );
        let plan = ContentReference {
            id: "plan:scene".into(),
            content_hash: sha256(b"plan:scene"),
        };
        let library = ObjectLibrary {
            version: "game-map.object-library.v1".into(),
            id: "object-library:scene".into(),
            revision: "object-library:scene:revision:1".into(),
            map_id: "map:scene".into(),
            plan: plan.clone(),
            objects: vec![MapObject {
                id: "object:lantern".into(),
                revision: "object:lantern:revision:1".into(),
                name: "Lantern".into(),
                visual: object_raster.accepted_artifact.clone(),
                decoded_size: PixelSize {
                    width: 2,
                    height: 2,
                },
                anchor: Point { x: 1, y: 2 },
                occlusion_class: "actor-height".into(),
                placement_safe_area: Rectangle {
                    x: 0,
                    y: 0,
                    width: 2,
                    height: 2,
                },
                collision_policy: CollisionPolicy::None,
            }],
        };
        let library_hash = canonical_hash(&library).unwrap();
        let manifest = RuntimeManifest {
            version: "game-map.runtime-manifest.v1".into(),
            id: "runtime-manifest:scene".into(),
            revision: "runtime-manifest:scene:revision:1".into(),
            map_id: "map:scene".into(),
            plan: plan.clone(),
            mode: "scene".into(),
            playable: true,
            world: PixelSize {
                width: 16,
                height: 16,
            },
            coordinate_system: CoordinateSystem::Pixel2d {
                origin: "top-left".into(),
                unit: "pixel".into(),
            },
            camera: Camera {
                behavior: "bounded".into(),
                viewport: PixelSize {
                    width: 16,
                    height: 16,
                },
                bounds: Rectangle {
                    x: 0,
                    y: 0,
                    width: 16,
                    height: 16,
                },
            },
            object_library: Some(RevisionReference {
                id: library.id.clone(),
                revision: library.revision.clone(),
                content_hash: library_hash.clone(),
            }),
            visuals: vec![RuntimeVisual {
                role: "base".into(),
                source: base.accepted_artifact.clone(),
            }],
            layers: vec![
                RuntimeLayer::Base {
                    id: "layer:base".into(),
                    order: 0,
                    source_id: base.accepted_artifact.artifact.id.clone(),
                },
                RuntimeLayer::Objects {
                    id: "layer:objects".into(),
                    order: 10,
                    source_id: library.id.clone(),
                },
            ],
            placements: vec![Placement {
                id: "placement:lantern".into(),
                layer_id: "layer:objects".into(),
                object_id: "object:lantern".into(),
                object_revision: "object:lantern:revision:1".into(),
                position: Point { x: 8, y: 8 },
                scale: Scale { x: 1.0, y: 1.0 },
                rotation_degrees: 0.0,
                sort_offset: 0,
            }],
            collision: vec![Collision {
                id: "collision:ground".into(),
                behavior: "solid".into(),
                shape: Shape::Rectangle {
                    bounds: Rectangle {
                        x: 0,
                        y: 14,
                        width: 16,
                        height: 2,
                    },
                },
            }],
            zones: vec![],
            spawns: vec![Spawn {
                id: "spawn:player".into(),
                kind: "player".into(),
                position: Point { x: 2, y: 12 },
            }],
            exits: vec![Exit {
                id: "exit:east".into(),
                area: Shape::Rectangle {
                    bounds: Rectangle {
                        x: 14,
                        y: 8,
                        width: 2,
                        height: 4,
                    },
                },
                destination: serde_json::json!({
                    "kind": "map",
                    "mapId": "map:next",
                    "spawnId": "spawn:entry"
                }),
            }],
            navigation: Navigation::Unavailable {
                reason: "no-explicit-navigation-data".into(),
            },
        };
        let manifest_hash = canonical_hash(&manifest).unwrap();
        RuntimeProcessingRequest {
            plan,
            runtime_manifest: manifest,
            runtime_manifest_hash: manifest_hash,
            object_library: Some(library),
            object_library_hash: Some(library_hash),
            artifacts: vec![base, object_raster],
        }
    }

    #[derive(Debug, Clone, Deserialize, Serialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct RetainedRealMapClosure {
        mode: String,
        runtime: RuntimeProcessingRequest,
        preview: NativePreview,
        artifacts: Vec<LiveArtifact>,
    }

    #[derive(Debug, Clone, Deserialize, Serialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct RetainedRealMapSourceReceipts {
        runtime: MultimodalHostReceipt,
        object: MultimodalHostReceipt,
    }

    async fn execute_real_map_image(
        provider_id: &str,
        model: &str,
        run_id: &str,
        semantic_role: &str,
        node_id: &str,
        prompt: &str,
        secret: String,
    ) -> (MultimodalHostReceipt, Vec<u8>) {
        let result = dashscope_image::execute_bound(
            provider_id.into(),
            DashScopeImageOperation::Generation,
            model.into(),
            prompt.into(),
            Vec::new(),
            Some("512x512".into()),
            Some(MultimodalHostContext {
                request_id: format!("request:real-game-map:{run_id}:{semantic_role}"),
                run_id: run_id.into(),
                held_out_commitment_hash: None,
                semantic_role: Some(semantic_role.into()),
                node_id: Some(node_id.into()),
                capability_id: Some("capability:image-generation".into()),
                accepted_reference_artifact_ids: Vec::new(),
                lock_ids: vec![format!("lock:real-game-map:{run_id}:art-direction")],
            }),
            secret,
        )
        .await
        .expect("real Qwen Game Map image generation failed");
        assert_eq!(result.images.len(), 1);
        assert_eq!(result.receipts.len(), 1);
        let asset = result.images.into_iter().next().unwrap();
        let receipt = result.receipts.into_iter().next().unwrap();
        let bytes = STANDARD
            .decode(asset.data)
            .expect("real Qwen Game Map result was not base64");
        verify_receipt(&receipt, &bytes).expect("real Qwen Game Map receipt failed verification");
        (receipt, bytes)
    }

    fn admit_real_map_artifact(
        binding: RasterBinding,
        receipt: MultimodalHostReceipt,
        source_artifact_bytes: Vec<u8>,
        processing: LiveArtifactProcessing,
    ) -> LiveArtifact {
        let artifact = issue_live_artifact(LiveArtifactRequest {
            binding,
            source_receipt: receipt,
            source_artifact_bytes,
            processing,
        })
        .expect("real Qwen Game Map artifact failed native admission");
        verify_live_artifact_inner(artifact)
            .expect("real Qwen Game Map artifact failed deterministic replay")
    }

    fn real_map_runtime(
        mode: &str,
        runtime_visual: &LiveArtifact,
        object_visual: &LiveArtifact,
    ) -> RuntimeProcessingRequest {
        let map_id = format!("map:real-qwen:{mode}");
        let plan = ContentReference {
            id: format!("plan:real-qwen:{mode}"),
            content_hash: sha256(format!("real-qwen-map-plan:{mode}:512x512").as_bytes()),
        };
        let (object_id, object_revision) = match &object_visual.binding {
            RasterBinding::ObjectVisual {
                object_id,
                object_revision,
            } => (object_id.clone(), object_revision.clone()),
            _ => panic!("real Qwen Game Map object lost its binding"),
        };
        let library_revision_hash = canonical_hash(&serde_json::json!({
            "plan": &plan,
            "object": &object_visual.accepted_artifact,
            "binding": &object_visual.binding,
        }))
        .unwrap();
        let library = ObjectLibrary {
            version: "game-map.object-library.v1".into(),
            id: format!("object-library:real-qwen:{mode}"),
            revision: format!("revision:sha256:{library_revision_hash}"),
            map_id: map_id.clone(),
            plan: plan.clone(),
            objects: vec![MapObject {
                id: object_id.clone(),
                revision: object_revision.clone(),
                name: if mode == "scene" {
                    "Ancient forest shrine".into()
                } else {
                    "Frozen crystal landmark".into()
                },
                visual: object_visual.accepted_artifact.clone(),
                decoded_size: object_visual.decoded_size,
                anchor: Point { x: 96, y: 176 },
                occlusion_class: "actor-height".into(),
                placement_safe_area: Rectangle {
                    x: 0,
                    y: 0,
                    width: object_visual.decoded_size.width,
                    height: object_visual.decoded_size.height,
                },
                collision_policy: CollisionPolicy::None,
            }],
        };
        let library_hash = canonical_hash(&library).unwrap();
        let visual_role = if mode == "scene" {
            "base"
        } else {
            "terrain-atlas"
        };
        let coordinate_system = if mode == "scene" {
            CoordinateSystem::Pixel2d {
                origin: "top-left".into(),
                unit: "pixel".into(),
            }
        } else {
            CoordinateSystem::OrthogonalGrid {
                origin: "top-left".into(),
                columns: 16,
                rows: 16,
                cell_width: 32,
                cell_height: 32,
            }
        };
        let visual_layer = if mode == "scene" {
            RuntimeLayer::Base {
                id: "layer:base".into(),
                order: 0,
                source_id: runtime_visual.accepted_artifact.artifact.id.clone(),
            }
        } else {
            RuntimeLayer::Terrain {
                id: "layer:terrain".into(),
                order: 0,
                source_id: runtime_visual.accepted_artifact.artifact.id.clone(),
                atlas: AtlasGrid {
                    columns: 16,
                    rows: 16,
                    cell_width: 32,
                    cell_height: 32,
                },
                tiles: (0..16)
                    .flat_map(|row| {
                        (0..16).map(move |column| TilePlacement {
                            column,
                            row,
                            atlas_column: column,
                            atlas_row: row,
                        })
                    })
                    .collect(),
            }
        };
        let manifest_revision_hash = canonical_hash(&serde_json::json!({
            "plan": &plan,
            "runtimeVisual": &runtime_visual.accepted_artifact,
            "objectLibraryHash": &library_hash,
            "mode": mode,
        }))
        .unwrap();
        let manifest = RuntimeManifest {
            version: "game-map.runtime-manifest.v1".into(),
            id: format!("runtime-manifest:real-qwen:{mode}"),
            revision: format!("revision:sha256:{manifest_revision_hash}"),
            map_id,
            plan: plan.clone(),
            mode: mode.into(),
            playable: true,
            world: PixelSize {
                width: 512,
                height: 512,
            },
            coordinate_system,
            camera: Camera {
                behavior: if mode == "scene" {
                    "bounded".into()
                } else {
                    "grid-bounded".into()
                },
                viewport: PixelSize {
                    width: 512,
                    height: 512,
                },
                bounds: Rectangle {
                    x: 0,
                    y: 0,
                    width: 512,
                    height: 512,
                },
            },
            object_library: Some(RevisionReference {
                id: library.id.clone(),
                revision: library.revision.clone(),
                content_hash: library_hash.clone(),
            }),
            visuals: vec![RuntimeVisual {
                role: visual_role.into(),
                source: runtime_visual.accepted_artifact.clone(),
            }],
            layers: vec![
                visual_layer,
                RuntimeLayer::Objects {
                    id: "layer:objects".into(),
                    order: 10,
                    source_id: library.id.clone(),
                },
            ],
            placements: vec![Placement {
                id: "placement:landmark".into(),
                layer_id: "layer:objects".into(),
                object_id,
                object_revision,
                position: Point { x: 256, y: 384 },
                scale: Scale { x: 1.0, y: 1.0 },
                rotation_degrees: 0.0,
                sort_offset: 0,
            }],
            collision: vec![Collision {
                id: "collision:south-boundary".into(),
                behavior: "solid".into(),
                shape: Shape::Rectangle {
                    bounds: Rectangle {
                        x: 0,
                        y: 480,
                        width: 512,
                        height: 32,
                    },
                },
            }],
            zones: vec![Zone {
                id: "zone:checkpoint".into(),
                purpose: "checkpoint".into(),
                shape: Shape::Rectangle {
                    bounds: Rectangle {
                        x: 192,
                        y: 192,
                        width: 64,
                        height: 64,
                    },
                },
            }],
            spawns: vec![Spawn {
                id: "spawn:player".into(),
                kind: "player".into(),
                position: Point { x: 64, y: 416 },
            }],
            exits: vec![Exit {
                id: "exit:east".into(),
                area: Shape::Rectangle {
                    bounds: Rectangle {
                        x: 480,
                        y: 384,
                        width: 32,
                        height: 96,
                    },
                },
                destination: serde_json::json!({
                    "kind": "map",
                    "mapId": "map:next",
                    "spawnId": "spawn:west"
                }),
            }],
            navigation: if mode == "scene" {
                Navigation::Unavailable {
                    reason: "no-explicit-navigation-data".into(),
                }
            } else {
                Navigation::OrthogonalGrid {
                    movement: "cardinal-4".into(),
                    blocked_cells: Vec::new(),
                }
            },
        };
        let runtime_manifest_hash = canonical_hash(&manifest).unwrap();
        RuntimeProcessingRequest {
            plan,
            runtime_manifest: manifest,
            runtime_manifest_hash,
            object_library: Some(library),
            object_library_hash: Some(library_hash),
            artifacts: vec![
                RasterInput {
                    binding: runtime_visual.binding.clone(),
                    accepted_artifact: runtime_visual.accepted_artifact.clone(),
                    media_type: runtime_visual.media_type.clone(),
                    bytes_base64: runtime_visual.bytes_base64.clone(),
                },
                RasterInput {
                    binding: object_visual.binding.clone(),
                    accepted_artifact: object_visual.accepted_artifact.clone(),
                    media_type: object_visual.media_type.clone(),
                    bytes_base64: object_visual.bytes_base64.clone(),
                },
            ],
        }
    }

    fn write_real_map_closure(root: &Path, closure: &RetainedRealMapClosure) {
        std::fs::create_dir_all(root).expect("could not create real Game Map evidence directory");
        let runtime = &closure.artifacts[0];
        let object = &closure.artifacts[1];
        let files = [
            (
                "source-runtime.bin",
                runtime.source_artifact_bytes_base64.as_str(),
            ),
            (
                "source-object.bin",
                object.source_artifact_bytes_base64.as_str(),
            ),
            ("runtime.png", runtime.bytes_base64.as_str()),
            ("object-cutout.png", object.bytes_base64.as_str()),
            ("preview.png", closure.preview.preview_bytes_base64.as_str()),
            (
                "debug.png",
                closure.preview.debug_overlay_bytes_base64.as_str(),
            ),
        ];
        for (name, encoded) in files {
            std::fs::write(
                root.join(name),
                STANDARD
                    .decode(encoded)
                    .expect("retained real Game Map base64 is invalid"),
            )
            .expect("could not retain real Game Map raster evidence");
        }
        std::fs::write(
            root.join("closure.json"),
            serde_json::to_vec_pretty(closure).expect("could not encode real Game Map closure"),
        )
        .expect("could not retain real Game Map closure");
    }

    fn write_real_map_sources(
        root: &Path,
        runtime_receipt: &MultimodalHostReceipt,
        runtime_source: &[u8],
        object_receipt: &MultimodalHostReceipt,
        object_source: &[u8],
    ) {
        std::fs::create_dir_all(root).expect("could not create real Game Map source directory");
        for (name, bytes) in [
            ("source-runtime.bin", runtime_source),
            ("source-object.bin", object_source),
        ] {
            std::fs::write(root.join(name), bytes)
                .expect("could not retain real Qwen Game Map source bytes");
        }
        std::fs::write(
            root.join("source-receipts.json"),
            serde_json::to_vec_pretty(&RetainedRealMapSourceReceipts {
                runtime: runtime_receipt.clone(),
                object: object_receipt.clone(),
            })
            .expect("could not encode real Qwen Game Map source receipts"),
        )
        .expect("could not retain real Qwen Game Map source receipts");
    }

    fn read_real_map_sources(
        root: &Path,
    ) -> Option<(
        MultimodalHostReceipt,
        Vec<u8>,
        MultimodalHostReceipt,
        Vec<u8>,
    )> {
        let receipts: RetainedRealMapSourceReceipts =
            serde_json::from_slice(&std::fs::read(root.join("source-receipts.json")).ok()?).ok()?;
        let runtime_source = std::fs::read(root.join("source-runtime.bin")).ok()?;
        let object_source = std::fs::read(root.join("source-object.bin")).ok()?;
        verify_receipt(&receipts.runtime, &runtime_source).ok()?;
        verify_receipt(&receipts.object, &object_source).ok()?;
        Some((
            receipts.runtime,
            runtime_source,
            receipts.object,
            object_source,
        ))
    }

    fn real_map_review_decisions(closure: &RetainedRealMapClosure) -> Vec<SemanticReviewDecision> {
        let runtime_id = closure.artifacts[0].accepted_artifact.artifact.id.clone();
        let object_id = closure.artifacts[1].accepted_artifact.artifact.id.clone();
        let reviewer_kind = "local-agent-visual-review".to_string();
        let reviewer_id = "reviewer:codex:real-game-map-gate-4".to_string();
        let mut decisions = vec![
            (
                "visual-role-fidelity",
                runtime_id.clone(),
                "The retained runtime visual matches its inferred scene or tile role.",
            ),
            (
                "object-cutout-quality",
                object_id,
                "The retained reusable object has a complete silhouette and production-usable transparent edge.",
            ),
            (
                "runtime-composition",
                closure.preview.receipt.preview.id.clone(),
                "The retained deterministic runtime composition is visually coherent.",
            ),
            (
                "authored-geometry",
                closure.preview.receipt.debug_overlay.id.clone(),
                "The retained debug overlay matches the reviewed authored collision, zone, spawn, exit, and camera data.",
            ),
        ];
        if closure.mode == "tile" {
            decisions.push((
                "terrain-grid-coherence",
                runtime_id,
                "The retained terrain remains coherent through exact 32-pixel grid replay.",
            ));
        }
        decisions
            .into_iter()
            .map(|(criterion, subject_id, notes)| SemanticReviewDecision {
                evidence_artifact_ids: vec![subject_id.clone()],
                subject_id,
                criterion: criterion.into(),
                status: "accepted".into(),
                reviewer_kind: reviewer_kind.clone(),
                reviewer_id: reviewer_id.clone(),
                notes: notes.into(),
            })
            .collect()
    }

    #[test]
    #[ignore = "requires the fixed Cutout Qwen Image 3 Provider key in Keychain, network, and CUTOUT_REAL_GAME_MAP_OUTPUT_DIR"]
    fn executes_and_retains_real_qwen_scene_and_tile_maps_without_gui_automation() {
        let output_root = std::env::var("CUTOUT_REAL_GAME_MAP_OUTPUT_DIR")
            .expect("CUTOUT_REAL_GAME_MAP_OUTPUT_DIR is required");
        let provider_id = "dashscope-qwen-image3";
        let model = "qwen-image-3.0-pro";
        let secret = keys::read_secret(provider_id)
            .expect("the fixed Qwen Image 3 Provider key is unavailable in Cutout Keychain");
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("could not create the real Game Map rehearsal runtime");
        runtime.block_on(async {
            for mode in ["scene", "tile"] {
                let run_id = format!("run:real-qwen-game-map:{mode}");
                let mode_root = Path::new(&output_root).join(mode);
                let visual_role = if mode == "scene" { "base" } else { "terrain-atlas" };
                let runtime_prompt = if mode == "scene" {
                    "Create a production-ready 512x512 top-down orthographic forest-ruin game map ground plate. Clear traversable paths, mossy stone surfaces, grass and water detail. No freestanding props, buildings, characters, text, interface, grid lines, frame, border, perspective horizon, or collision marks. Fill every edge."
                } else {
                    "Create a production-ready 512x512 top-down orthographic frozen-cavern terrain plate aligned to a 32-pixel square tile rhythm. Coherent ice paths, snow shelves and dark stone variation. No props, characters, text, interface, visible grid lines, separators, frame, border, perspective horizon, or collision marks. Fill every edge."
                };
                let object_prompt = if mode == "scene" {
                    "Create exactly one reusable top-down ancient forest stone shrine game object, centered and complete with generous safe margin on a pure flat chroma magenta #FF00FF board. No ground plane, contact shadow, horizon, text, label, grid, frame, border, extra object, cropped edge, or magenta inside the shrine. The board fills every edge and stays spatially uniform."
                } else {
                    "Create exactly one reusable top-down frozen crystal landmark game object, centered and complete with generous safe margin on a pure flat chroma magenta #FF00FF board. No ground plane, contact shadow, horizon, text, label, grid, frame, border, extra object, cropped edge, or magenta inside the crystal. The board fills every edge and stays spatially uniform."
                };
                let (runtime_receipt, runtime_source, object_receipt, object_source) =
                    if let Some(retained) = read_real_map_sources(&mode_root) {
                        retained
                    } else {
                        let (runtime_receipt, runtime_source) = execute_real_map_image(
                            provider_id,
                            model,
                            &run_id,
                            &format!("game-map-{visual_role}"),
                            &format!("node:real-game-map:{mode}:{visual_role}"),
                            runtime_prompt,
                            secret.clone(),
                        )
                        .await;
                        let (object_receipt, object_source) = execute_real_map_image(
                            provider_id,
                            model,
                            &run_id,
                            "game-map-object",
                            &format!("node:real-game-map:{mode}:object-library"),
                            object_prompt,
                            secret.clone(),
                        )
                        .await;
                        write_real_map_sources(
                            &mode_root,
                            &runtime_receipt,
                            &runtime_source,
                            &object_receipt,
                            &object_source,
                        );
                        (
                            runtime_receipt,
                            runtime_source,
                            object_receipt,
                            object_source,
                        )
                    };
                let runtime_visual = admit_real_map_artifact(
                    RasterBinding::RuntimeVisual {
                        role: visual_role.into(),
                    },
                    runtime_receipt,
                    runtime_source,
                    LiveArtifactProcessing::RuntimePng,
                );
                let object_visual = admit_real_map_artifact(
                    RasterBinding::ObjectVisual {
                        object_id: format!("object:real-qwen:{mode}:landmark"),
                        object_revision: format!("object:real-qwen:{mode}:landmark:revision:1"),
                    },
                    object_receipt,
                    object_source,
                    LiveArtifactProcessing::ObjectCutout {
                        frame_size: PixelSize {
                            width: 192,
                            height: 192,
                        },
                        alpha_target: PixelSize {
                            width: 128,
                            height: 160,
                        },
                        expected_anchor: FloatPoint { x: 96.0, y: 176.0 },
                        anchor_policy: "bottom".into(),
                    },
                );
                let runtime_request = real_map_runtime(mode, &runtime_visual, &object_visual);
                let validation = validate_game_map_runtime(runtime_request.clone())
                    .expect("real Qwen Game Map runtime validation failed");
                assert_eq!(validation.status, "passed");
                let preview = compose_game_map_preview(runtime_request.clone())
                    .expect("real Qwen Game Map deterministic composition failed");
                let closure = RetainedRealMapClosure {
                    mode: mode.into(),
                    runtime: runtime_request,
                    preview,
                    artifacts: vec![runtime_visual, object_visual],
                };
                write_real_map_closure(&mode_root, &closure);
            }
        });
        println!("REAL_GAME_MAP_REHEARSAL={output_root}");
    }

    #[test]
    #[ignore = "requires visually reviewed retained closures under CUTOUT_REAL_GAME_MAP_OUTPUT_DIR; performs zero Provider calls"]
    fn accepts_visually_reviewed_real_qwen_scene_and_tile_map_closures() {
        let output_root = std::env::var("CUTOUT_REAL_GAME_MAP_OUTPUT_DIR")
            .expect("CUTOUT_REAL_GAME_MAP_OUTPUT_DIR is required");
        for mode in ["scene", "tile"] {
            let root = Path::new(&output_root).join(mode);
            let closure: RetainedRealMapClosure = serde_json::from_slice(
                &std::fs::read(root.join("closure.json"))
                    .expect("could not read retained real Game Map closure"),
            )
            .expect("retained real Game Map closure is invalid");
            assert_eq!(closure.mode, mode);
            for artifact in &closure.artifacts {
                verify_live_artifact_inner(artifact.clone())
                    .expect("retained real Game Map artifact failed native replay");
            }
            let replayed_preview = compose_game_map_preview(closure.runtime.clone())
                .expect("retained real Game Map preview failed native replay");
            assert_eq!(
                canonical_hash(&replayed_preview).unwrap(),
                canonical_hash(&closure.preview).unwrap()
            );
            let input = SemanticAcceptanceInput {
                runtime: closure.runtime.clone(),
                preview: closure.preview.clone(),
                artifacts: closure.artifacts.clone(),
                decisions: real_map_review_decisions(&closure),
            };
            let acceptance = accept_game_map_semantic_review(input.clone())
                .expect("reviewed real Game Map closure failed semantic acceptance");
            let verified = verify_game_map_semantic_acceptance(acceptance, input)
                .expect("real Game Map semantic acceptance failed native replay");
            std::fs::write(
                root.join("semantic-acceptance.json"),
                serde_json::to_vec_pretty(&verified)
                    .expect("could not encode real Game Map semantic acceptance"),
            )
            .expect("could not retain real Game Map semantic acceptance");
        }
        println!("REAL_GAME_MAP_ACCEPTANCE={output_root}");
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct ExternalSemanticAcceptanceVerificationRequest {
        acceptance: GameMapSemanticAcceptance,
        input: SemanticAcceptanceInput,
    }

    #[test]
    #[ignore = "real-only bridge for replaying one exact renderer acceptance request through the native verifier"]
    fn verifies_external_game_map_semantic_acceptance_request() {
        let request_path = std::env::var("CUTOUT_REAL_GAME_MAP_ACCEPTANCE_REQUEST")
            .expect("CUTOUT_REAL_GAME_MAP_ACCEPTANCE_REQUEST is required");
        let result_path = std::env::var("CUTOUT_REAL_GAME_MAP_ACCEPTANCE_RESULT")
            .expect("CUTOUT_REAL_GAME_MAP_ACCEPTANCE_RESULT is required");
        let request: ExternalSemanticAcceptanceVerificationRequest = serde_json::from_slice(
            &std::fs::read(&request_path)
                .expect("could not read external Game Map acceptance request"),
        )
        .expect("external Game Map acceptance request is invalid");
        let verified = verify_game_map_semantic_acceptance(request.acceptance, request.input)
            .expect("external Game Map acceptance failed native replay");
        std::fs::write(
            &result_path,
            serde_json::to_vec_pretty(&verified)
                .expect("could not encode verified external Game Map acceptance"),
        )
        .expect("could not retain verified external Game Map acceptance");
        println!("REAL_GAME_MAP_ACCEPTANCE_RESULT={result_path}");
    }

    #[test]
    fn native_preview_is_byte_deterministic_and_keeps_reachability_honest() {
        let request = scene_request();
        let validation = validate_game_map_runtime(request.clone()).unwrap();
        assert_eq!(validation.status, "passed", "{:#?}", validation.findings);
        assert!(matches!(
            validation.reachability,
            Reachability::Unavailable { .. }
        ));
        assert_eq!(validation.findings[0].code, "reachability-unavailable");
        let first = compose_game_map_preview(request.clone()).unwrap();
        let second = compose_game_map_preview(request).unwrap();
        assert_eq!(first.preview_bytes_base64, second.preview_bytes_base64);
        assert_eq!(
            first.debug_overlay_bytes_base64,
            second.debug_overlay_bytes_base64
        );
        assert_ne!(
            first.receipt.preview.content_hash,
            first.receipt.debug_overlay.content_hash
        );
    }

    #[test]
    fn stale_object_revision_blocks_runtime_composition() {
        let mut request = scene_request();
        request.runtime_manifest.placements[0].object_revision = "object:lantern:stale".into();
        request.runtime_manifest_hash = canonical_hash(&request.runtime_manifest).unwrap();
        let validation = validate_game_map_runtime(request.clone()).unwrap();
        assert_eq!(validation.status, "blocked");
        assert!(validation
            .findings
            .iter()
            .any(|finding| finding.code == "placement-reference-mismatch"));
        assert!(compose_game_map_preview(request).is_err());
    }

    #[test]
    fn explicit_navigation_reports_an_unreachable_exit_without_inferring_from_collision() {
        let mut request = scene_request();
        let terrain_image = image::RgbaImage::from_pixel(2, 2, image::Rgba([40, 120, 64, 255]));
        let terrain = raster(
            RasterBinding::RuntimeVisual {
                role: "terrain-atlas".into(),
            },
            &terrain_image,
            "tile-terrain",
        );
        request.runtime_manifest.mode = "tile".into();
        request.runtime_manifest.world = PixelSize {
            width: 4,
            height: 2,
        };
        request.runtime_manifest.coordinate_system = CoordinateSystem::OrthogonalGrid {
            origin: "top-left".into(),
            columns: 2,
            rows: 1,
            cell_width: 2,
            cell_height: 2,
        };
        request.runtime_manifest.camera = Camera {
            behavior: "grid-bounded".into(),
            viewport: PixelSize {
                width: 4,
                height: 2,
            },
            bounds: Rectangle {
                x: 0,
                y: 0,
                width: 4,
                height: 2,
            },
        };
        request.runtime_manifest.visuals = vec![RuntimeVisual {
            role: "terrain-atlas".into(),
            source: terrain.accepted_artifact.clone(),
        }];
        request.runtime_manifest.layers = vec![
            RuntimeLayer::Terrain {
                id: "layer:terrain".into(),
                order: 0,
                source_id: terrain.accepted_artifact.artifact.id.clone(),
                atlas: AtlasGrid {
                    columns: 1,
                    rows: 1,
                    cell_width: 2,
                    cell_height: 2,
                },
                tiles: vec![
                    TilePlacement {
                        column: 0,
                        row: 0,
                        atlas_column: 0,
                        atlas_row: 0,
                    },
                    TilePlacement {
                        column: 1,
                        row: 0,
                        atlas_column: 0,
                        atlas_row: 0,
                    },
                ],
            },
            RuntimeLayer::Objects {
                id: "layer:objects".into(),
                order: 10,
                source_id: request.object_library.as_ref().unwrap().id.clone(),
            },
        ];
        request.runtime_manifest.placements.clear();
        request.runtime_manifest.collision = vec![Collision {
            id: "collision:decorative-wall".into(),
            behavior: "solid".into(),
            shape: Shape::Rectangle {
                bounds: Rectangle {
                    x: 0,
                    y: 1,
                    width: 4,
                    height: 1,
                },
            },
        }];
        request.runtime_manifest.spawns = vec![Spawn {
            id: "spawn:player".into(),
            kind: "player".into(),
            position: Point { x: 0, y: 0 },
        }];
        request.runtime_manifest.exits = vec![Exit {
            id: "exit:east".into(),
            area: Shape::Rectangle {
                bounds: Rectangle {
                    x: 2,
                    y: 0,
                    width: 2,
                    height: 2,
                },
            },
            destination: serde_json::json!({
                "kind": "map",
                "mapId": "map:next",
                "spawnId": "spawn:west"
            }),
        }];
        request.runtime_manifest.navigation = Navigation::OrthogonalGrid {
            movement: "cardinal-4".into(),
            blocked_cells: vec![GridCell { column: 1, row: 0 }],
        };
        let object_raster = request
            .artifacts
            .iter()
            .find(|artifact| matches!(artifact.binding, RasterBinding::ObjectVisual { .. }))
            .unwrap()
            .clone();
        request.artifacts = vec![terrain, object_raster];
        request.runtime_manifest_hash = canonical_hash(&request.runtime_manifest).unwrap();

        let validation = validate_game_map_runtime(request.clone()).unwrap();
        assert_eq!(validation.status, "blocked");
        assert!(matches!(
            validation.reachability,
            Reachability::Blocked { .. }
        ));
        assert!(validation
            .findings
            .iter()
            .any(|finding| finding.code == "exit-unreachable"));
        assert!(compose_game_map_preview(request).is_err());
    }
}
