use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{mpsc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const RESULT_PROTOCOL: &str = "cutout.packaged-e2e-result.v1";
const MAX_RESULT_PHASES: usize = 192;
const MAX_CANDIDATE_COUNT: usize = 8;
const MAX_CAPTURE_BYTES: usize = 32 * 1024 * 1024;
const MAX_EVIDENCE_FILE_BYTES: usize = 128 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES: usize = 512 * 1024 * 1024;
const MAX_EVIDENCE_FILES: usize = 40_000;
const CAPTURE_IDS: [&str; 3] = ["design-systems", "prototype-suites", "selected-delivery"];
const CAPTURE_FILE_IDS: [&str; 4] = [
    "design-systems",
    "prototype-suites",
    "selected-delivery",
    "failure",
];
const REQUIRED_SUCCESS_PHASES: [&str; 10] = [
    "native-boot",
    "webview-loaded",
    "webview-renderable",
    "ai-native-candidate-resolved",
    "ai-native-catalog-checked",
    "provider-response",
    "planner-complete",
    "design-candidates-ready",
    "prototype-suite-ready",
    "resource-pack-ready",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedE2eMode {
    enabled: bool,
    window_probe: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2ePhase {
    id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    elapsed_ms: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eResult {
    protocol: String,
    status: String,
    phases: Vec<PackagedE2ePhase>,
    failure: Option<PackagedE2eFailure>,
    outcome: Option<PackagedE2eOutcome>,
    completed_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eFailure {
    phase: String,
    code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    diagnostic: Option<PackagedE2eFailureDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    planner_progress: Option<PackagedE2ePlannerProgress>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PackagedE2eFailureDiagnostic {
    PlannerStructuredContract,
    PlannerTimeout,
    PlannerProgressiveOutline,
    PlannerProgressiveDesignFoundation,
    PlannerProgressiveDesignExploration,
    PlannerProgressiveDesignBounds,
    PlannerProgressivePage,
    PlannerProgressivePageIdentity,
    PlannerProgressiveClosure,
    PlannerProgressiveMerge,
    PlannerProgressiveGraph,
    PlannerProgressiveCoverage,
    ProviderAuth,
    ProviderConfigurationState,
    ProviderTransport,
    ProviderOutput,
    PrototypeViewport,
    BoardDecode,
    BoardComposition,
    BoardZeroSlices,
    BoardSlotAssignment,
    ArtifactPersistence,
    GenerationCandidate,
    OrchestrationState,
    QualityReviewRequired,
    PlanningEvidenceMismatch,
    CandidatePreparationTimeout,
    CandidateApprovalTimeout,
    CandidateProviderTimeout,
    CandidatePostProcessingTimeout,
    Unknown,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2ePlannerProgress {
    stage: PackagedE2ePlannerStage,
    completed_pages: u8,
    total_pages: u8,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PackagedE2ePlannerStage {
    Outline,
    DesignFoundation,
    DesignExploration,
    Page,
    Closure,
    Complete,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eOutcome {
    intent: PackagedE2eIntentEvidence,
    design_systems: Vec<PackagedE2eCandidateOutcome>,
    prototype_suites: Vec<PackagedE2eSuiteOutcome>,
    captures: Vec<PackagedE2eCaptureEvidence>,
    evidence: PackagedE2eEvidenceManifest,
    selected_suite_id: String,
    selected_visible_slice_count: u32,
    planning_turn_count: u32,
    planning_runtime_counts: PackagedE2ePlanningRuntimeCounts,
    planned_image_call_count: u32,
    image_call_count: u32,
    retry_count: u32,
    retry_image_call_count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eProviderRouteEvidence {
    purpose: String,
    kind: String,
    model: String,
    classification: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eEvidenceUpload {
    provider_routes: Vec<PackagedE2eProviderRouteEvidence>,
    files: Vec<PackagedE2eEvidenceUploadFile>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eEvidenceUploadFile {
    role: String,
    candidate_id: Option<String>,
    ordinal: Option<u32>,
    sha256: String,
    byte_length: u64,
    bytes_base64: String,
    media_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eEvidenceManifest {
    protocol: String,
    provider_routes: Vec<PackagedE2eProviderRouteEvidence>,
    files: Vec<PackagedE2eEvidenceFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eEvidenceFile {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    candidate_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ordinal: Option<u32>,
    path: String,
    sha256: String,
    byte_length: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    media_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2ePlanningRuntimeCounts {
    codex_system: u32,
    direct: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eIntentEvidence {
    text: String,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eCaptureEvidence {
    id: String,
    sha256: String,
    width: u32,
    height: u32,
    byte_length: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eCandidateOutcome {
    candidate_id: String,
    status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eSuiteOutcome {
    candidate_id: String,
    design_system_id: String,
    resource_pack_id: String,
    status: String,
    routes: Vec<String>,
    route_count: u32,
    page_count: u32,
    resource_asset_count: u32,
    artifact_count: u32,
    quality_review_status: String,
    route_graph: String,
    design_system_media: PackagedE2eMediaEvidence,
    page_media: Vec<PackagedE2ePageMediaEvidence>,
    resource_media: Vec<PackagedE2eResourceMediaEvidence>,
    digests: PackagedE2eDeliveryDigests,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphIdentity {
    version: String,
    pages: Vec<PackagedE2eRouteGraphPage>,
    flows: Vec<PackagedE2eRouteGraphFlow>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphPage {
    name: String,
    route: String,
    purpose: String,
    regions: Vec<PackagedE2eRouteGraphRegion>,
    overlays: Vec<PackagedE2eRouteGraphNamedNode>,
    states: Vec<PackagedE2eRouteGraphNamedNode>,
    interactions: Vec<PackagedE2eRouteGraphInteraction>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphRegion {
    name: String,
    role: String,
    summary: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphNamedNode {
    name: String,
    purpose: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphInteraction {
    label: String,
    trigger: String,
    source_region: Option<usize>,
    source_element: String,
    intent: String,
    action: PackagedE2eRouteGraphAction,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum PackagedE2eRouteGraphAction {
    Navigate {
        #[serde(rename = "targetPage")]
        target_page: usize,
    },
    OpenOverlay {
        #[serde(rename = "targetOverlay")]
        target_overlay: usize,
    },
    ChangeState {
        #[serde(rename = "targetState")]
        target_state: usize,
    },
    External {
        destination: String,
    },
    None {
        reason: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphFlow {
    name: String,
    goal: String,
    start_page: usize,
    steps: Vec<PackagedE2eRouteGraphStep>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eRouteGraphStep {
    from_page: usize,
    interaction: usize,
    to_page: Option<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eMediaEvidence {
    media_type: String,
    width: u32,
    height: u32,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2ePageMediaEvidence {
    ordinal: u32,
    route: String,
    media_type: String,
    width: u32,
    height: u32,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eResourceMediaEvidence {
    ordinal: u32,
    media_type: String,
    width: u32,
    height: u32,
    byte_length: u64,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eDeliveryDigests {
    plan: String,
    design_system_image: String,
    design_markdown: String,
    css_variables: String,
    tailwind_theme: String,
    tokens_json: String,
    design_ir_tokens: String,
    route_graph: String,
    page_media: String,
    manifest: String,
    bindings: String,
    resource_pack: String,
    resource_artifacts: String,
    provenance: String,
    review_document: String,
    page_reviews: String,
    resource_reviews: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackagedE2eProgress {
    protocol: String,
    status: String,
    phases: Vec<PackagedE2ePhase>,
}

pub fn enabled() -> bool {
    cfg!(feature = "packaged-e2e") && std::env::var("CUTOUT_PACKAGED_E2E").as_deref() == Ok("1")
}

pub fn window_probe_enabled() -> bool {
    enabled() && std::env::var("CUTOUT_PACKAGED_E2E_WINDOW_PROBE").as_deref() == Ok("1")
}

fn result_root() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/Users/Shared"))
            .join("Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence")
    }
    #[cfg(not(target_os = "macos"))]
    {
        std::env::temp_dir().join("cutout-packaged-e2e")
    }
}

fn merge_phases(
    existing: Vec<PackagedE2ePhase>,
    mut incoming: Vec<PackagedE2ePhase>,
) -> Vec<PackagedE2ePhase> {
    let mut merged = existing;
    for mut phase in incoming.drain(..) {
        if let Some(current) = merged.iter_mut().find(|current| current.id == phase.id) {
            if phase.elapsed_ms.is_none() {
                phase.elapsed_ms = current.elapsed_ms;
            }
            *current = phase;
        } else {
            merged.push(phase);
        }
    }
    merged
}

fn elapsed_ms() -> u64 {
    static STARTED_AT: OnceLock<Instant> = OnceLock::new();
    STARTED_AT
        .get_or_init(Instant::now)
        .elapsed()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn stamp_phases(mut phases: Vec<PackagedE2ePhase>) -> Vec<PackagedE2ePhase> {
    let at = elapsed_ms();
    for phase in &mut phases {
        phase.elapsed_ms.get_or_insert(at);
    }
    phases
}

fn read_progress_at(root: &Path) -> Option<PackagedE2eProgress> {
    let bytes = std::fs::read(root.join("progress.json")).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn read_progress() -> Option<PackagedE2eProgress> {
    read_progress_at(&result_root())
}

fn progress_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn write_progress_at(root: &Path, status: &str, phases: &[PackagedE2ePhase]) -> Result<(), String> {
    if !matches!(status, "running" | "passed" | "failed") {
        return Err("packaged-e2e-result-invalid".into());
    }
    validate_phases(phases)?;
    let path = root.join("progress.json");
    let parent = path.parent().ok_or("packaged-e2e-result-invalid")?;
    std::fs::create_dir_all(parent).map_err(|_| "packaged-e2e-write-failed")?;
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec_pretty(&serde_json::json!({
        "protocol": RESULT_PROTOCOL,
        "status": status,
        "phases": phases,
    }))
    .map_err(|_| "packaged-e2e-result-invalid")?;
    std::fs::write(&temporary, bytes).map_err(|_| "packaged-e2e-write-failed")?;
    std::fs::rename(&temporary, path).map_err(|_| "packaged-e2e-write-failed")?;
    Ok(())
}

fn write_checkpoint_at(root: &Path, phases: Vec<PackagedE2ePhase>) -> Result<(), String> {
    let _guard = progress_lock()
        .lock()
        .map_err(|_| "packaged-e2e-write-failed")?;
    let progress = read_progress_at(root);
    if progress
        .as_ref()
        .is_some_and(|value| value.status != "running")
    {
        return Ok(());
    }
    write_progress_at(
        root,
        "running",
        &stamp_phases(merge_phases(
            progress.map(|value| value.phases).unwrap_or_default(),
            phases,
        )),
    )
}

pub fn native_checkpoint(id: &str) {
    if !enabled() {
        return;
    }
    let _ = write_checkpoint_at(
        &result_root(),
        vec![PackagedE2ePhase {
            id: id.into(),
            status: "passed".into(),
            elapsed_ms: None,
        }],
    );
}

fn validate_phases(phases: &[PackagedE2ePhase]) -> Result<(), String> {
    if phases.is_empty() || phases.len() > MAX_RESULT_PHASES {
        return Err("packaged-e2e-phase-invalid".into());
    }
    for phase in phases {
        if phase.id.is_empty()
            || phase.id.len() > 80
            || matches!(phase.id.as_str(), "coding-preview-ready" | "coding-applied")
            || !phase
                .id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
            || !matches!(phase.status.as_str(), "passed" | "failed" | "skipped")
            || phase
                .elapsed_ms
                .is_some_and(|elapsed| elapsed > 24 * 60 * 60 * 1_000)
        {
            return Err("packaged-e2e-phase-invalid".into());
        }
    }
    Ok(())
}

fn validate(result: &PackagedE2eResult) -> Result<(), String> {
    if result.protocol != RESULT_PROTOCOL || !matches!(result.status.as_str(), "passed" | "failed")
    {
        return Err("packaged-e2e-result-invalid".into());
    }
    validate_phases(&result.phases)?;
    if let Some(progress) = result
        .failure
        .as_ref()
        .and_then(|failure| failure.planner_progress.as_ref())
    {
        if progress.total_pages > 12 || progress.completed_pages > progress.total_pages {
            return Err("packaged-e2e-result-invalid".into());
        }
    }
    match (&result.status[..], &result.failure, &result.outcome) {
        ("passed", None, Some(outcome)) if has_required_success_phases(&result.phases) => {
            validate_outcome(outcome)
        }
        ("failed", Some(failure), None)
            if matches!(
                failure.code.as_str(),
                "phase-rejected"
                    | "element-timeout"
                    | "journey-timeout"
                    | "capability-missing"
                    | "run-failed"
                    | "candidate-failed"
                    | "suite-failed"
                    | "unexpected"
            ) && result
                .phases
                .iter()
                .any(|phase| phase.id == failure.phase && phase.status == "failed") =>
        {
            Ok(())
        }
        _ => Err("packaged-e2e-result-invalid".into()),
    }
}

fn has_required_success_phases(phases: &[PackagedE2ePhase]) -> bool {
    REQUIRED_SUCCESS_PHASES.iter().all(|required| {
        phases
            .iter()
            .any(|phase| phase.id == *required && phase.status == "passed")
    })
}

fn validate_outcome(outcome: &PackagedE2eOutcome) -> Result<(), String> {
    let candidate_count = outcome.design_systems.len();
    if !(1..=MAX_CANDIDATE_COUNT).contains(&candidate_count)
        || outcome.prototype_suites.len() != candidate_count
        || !valid_intent(&outcome.intent)
        || !valid_capture_set(&outcome.captures)
    {
        return Err("packaged-e2e-outcome-invalid".into());
    }

    let mut design_ids = HashSet::new();
    for (index, candidate) in outcome.design_systems.iter().enumerate() {
        if candidate.status != "ready"
            || !is_opaque_candidate_id(&candidate.candidate_id, "design")
            || candidate.candidate_id != format!("design-{}", index + 1)
            || !design_ids.insert(candidate.candidate_id.as_str())
        {
            return Err("packaged-e2e-outcome-invalid".into());
        }
    }

    let mut suite_ids = HashSet::new();
    let mut bound_design_ids = HashSet::new();
    let mut resource_pack_ids = HashSet::new();
    let mut route_graphs = HashSet::new();
    let mut delivery_media = HashSet::new();
    for (index, suite) in outcome.prototype_suites.iter().enumerate() {
        if suite.status != "ready"
            || !is_opaque_candidate_id(&suite.candidate_id, "suite")
            || !is_opaque_candidate_id(&suite.design_system_id, "design")
            || !is_opaque_resource_pack_id(&suite.resource_pack_id)
            || suite.candidate_id != format!("suite-{}", index + 1)
            || suite.design_system_id != format!("design-{}", index + 1)
            || suite.resource_pack_id != format!("resource-pack-{}", index + 1)
            || !suite_ids.insert(suite.candidate_id.as_str())
            || !design_ids.contains(suite.design_system_id.as_str())
            || !bound_design_ids.insert(suite.design_system_id.as_str())
            || !resource_pack_ids.insert(suite.resource_pack_id.as_str())
            || !(1..=12).contains(&suite.routes.len())
            || suite.resource_asset_count > 4096
            || suite.route_count as usize != suite.routes.len()
            || suite.page_count as usize != suite.routes.len()
            || suite.artifact_count != suite.resource_asset_count
            || !matches!(
                suite.quality_review_status.as_str(),
                "passed" | "attention-required"
            )
            || !valid_route_graph_identity(&suite.route_graph, &suite.routes)
            || format!("{:x}", Sha256::digest(suite.route_graph.as_bytes()))
                != suite.digests.route_graph
            || !valid_media(&suite.design_system_media)
            || !delivery_media.insert(suite.design_system_media.sha256.as_str())
            || !valid_page_media(&suite.page_media, &suite.routes)
            || !valid_resource_media(&suite.resource_media, suite.resource_asset_count)
            || !valid_delivery_digests(&suite.digests)
        {
            return Err("packaged-e2e-outcome-invalid".into());
        }
        if suite
            .page_media
            .iter()
            .map(|media| media.sha256.as_str())
            .chain(
                suite
                    .resource_media
                    .iter()
                    .map(|media| media.sha256.as_str()),
            )
            .any(|sha256| !delivery_media.insert(sha256))
        {
            return Err("packaged-e2e-outcome-invalid".into());
        }
        let mut routes = HashSet::new();
        for route in &suite.routes {
            if !is_bounded_route(route) || !routes.insert(route.as_str()) {
                return Err("packaged-e2e-outcome-invalid".into());
            }
        }
        let graph = suite.route_graph.clone();
        if candidate_count > 1 && !route_graphs.insert(graph) {
            return Err("packaged-e2e-outcome-invalid".into());
        }
    }

    let selected_resource_asset_count = outcome
        .prototype_suites
        .iter()
        .find(|suite| suite.candidate_id == outcome.selected_suite_id)
        .map(|suite| suite.resource_asset_count);
    if bound_design_ids.len() != candidate_count
        || selected_resource_asset_count.is_none()
        || selected_resource_asset_count != Some(outcome.selected_visible_slice_count)
        || !(2..=256).contains(&outcome.planning_turn_count)
        || outcome
            .planning_runtime_counts
            .codex_system
            .checked_add(outcome.planning_runtime_counts.direct)
            != Some(outcome.planning_turn_count)
        || !(1..=4096).contains(&outcome.planned_image_call_count)
        || outcome.image_call_count != outcome.planned_image_call_count
        || outcome.retry_count > (MAX_CANDIDATE_COUNT * 2) as u32
        || outcome.retry_image_call_count > outcome.image_call_count
        || !valid_evidence_manifest(&outcome.evidence, &outcome.prototype_suites)
    {
        return Err("packaged-e2e-outcome-invalid".into());
    }
    Ok(())
}

fn is_opaque_candidate_id(value: &str, prefix: &str) -> bool {
    value
        .strip_prefix(prefix)
        .and_then(|suffix| suffix.strip_prefix('-'))
        .and_then(|ordinal| ordinal.parse::<usize>().ok())
        .is_some_and(|ordinal| (1..=MAX_CANDIDATE_COUNT).contains(&ordinal))
}

fn is_opaque_resource_pack_id(value: &str) -> bool {
    value
        .strip_prefix("resource-pack-")
        .and_then(|ordinal| ordinal.parse::<usize>().ok())
        .is_some_and(|ordinal| (1..=MAX_CANDIDATE_COUNT).contains(&ordinal))
}

fn valid_delivery_digests(digests: &PackagedE2eDeliveryDigests) -> bool {
    [
        &digests.plan,
        &digests.design_system_image,
        &digests.design_markdown,
        &digests.css_variables,
        &digests.tailwind_theme,
        &digests.tokens_json,
        &digests.design_ir_tokens,
        &digests.route_graph,
        &digests.page_media,
        &digests.manifest,
        &digests.bindings,
        &digests.resource_pack,
        &digests.resource_artifacts,
        &digests.provenance,
        &digests.review_document,
        &digests.page_reviews,
        &digests.resource_reviews,
    ]
    .into_iter()
    .all(|value| is_sha256(value))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn valid_intent(intent: &PackagedE2eIntentEvidence) -> bool {
    !intent.text.is_empty()
        && intent.text.len() <= 8_192
        && !intent
            .text
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\t'))
        && !contains_sensitive_evidence(&intent.text)
        && is_sha256(&intent.sha256)
        && format!("{:x}", Sha256::digest(intent.text.as_bytes())) == intent.sha256
}

fn contains_sensitive_evidence(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("authorization:")
        || lower.contains("bearer ")
        || lower.contains("api_key=")
        || lower.contains("apikey=")
        || lower.contains("file://")
        || lower.contains("/users/")
        || lower.contains("\\users\\")
        || lower.contains("/home/")
        || lower.contains("/private/tmp/")
        || lower.contains("/private/var/")
        || lower.contains("/tmp/")
        || lower.contains("/var/folders/")
        || lower.contains("/volumes/")
        || contains_windows_absolute_path(&lower)
        || value
            .split(|character: char| {
                character.is_whitespace() || matches!(character, ':' | '=' | ',' | ';')
            })
            .any(|token| {
                let normalized = token.trim_matches(|character: char| {
                    matches!(character, '"' | '\'' | '(' | ')' | '[' | ']')
                });
                normalized.len() >= 12
                    && ["sk-", "rk-", "pk-"]
                        .iter()
                        .any(|prefix| normalized.starts_with(prefix))
            })
}

fn contains_windows_absolute_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.windows(3).enumerate().any(|(index, window)| {
        window[0].is_ascii_alphabetic()
            && window[1] == b':'
            && matches!(window[2], b'\\' | b'/')
            && (index == 0 || !bytes[index - 1].is_ascii_alphanumeric())
    }) || value.contains("\\\\")
}

fn valid_capture_set(captures: &[PackagedE2eCaptureEvidence]) -> bool {
    captures.len() == CAPTURE_IDS.len()
        && CAPTURE_IDS.iter().all(|required| {
            captures
                .iter()
                .any(|capture| capture.id == *required && valid_capture(capture))
        })
        && captures
            .iter()
            .map(|capture| capture.id.as_str())
            .collect::<HashSet<_>>()
            .len()
            == captures.len()
}

fn valid_capture(capture: &PackagedE2eCaptureEvidence) -> bool {
    CAPTURE_IDS.contains(&capture.id.as_str())
        && is_sha256(&capture.sha256)
        && valid_dimension(capture.width)
        && valid_dimension(capture.height)
        && capture.width >= 320
        && capture.height >= 240
        && (1..=MAX_CAPTURE_BYTES as u64).contains(&capture.byte_length)
}

fn valid_media(media: &PackagedE2eMediaEvidence) -> bool {
    is_image_media_type(&media.media_type)
        && valid_dimension(media.width)
        && valid_dimension(media.height)
        && is_sha256(&media.sha256)
}

fn valid_page_media(media: &[PackagedE2ePageMediaEvidence], routes: &[String]) -> bool {
    media.len() == routes.len()
        && media
            .iter()
            .map(|item| item.sha256.as_str())
            .collect::<HashSet<_>>()
            .len()
            == media.len()
        && media.iter().enumerate().all(|(index, item)| {
            item.ordinal as usize == index + 1
                && item.route == routes[index]
                && valid_media(&PackagedE2eMediaEvidence {
                    media_type: item.media_type.clone(),
                    width: item.width,
                    height: item.height,
                    sha256: item.sha256.clone(),
                })
        })
}

fn valid_resource_media(media: &[PackagedE2eResourceMediaEvidence], count: u32) -> bool {
    media.len() == count as usize
        && media
            .iter()
            .map(|item| item.sha256.as_str())
            .collect::<HashSet<_>>()
            .len()
            == media.len()
        && media.iter().enumerate().all(|(index, item)| {
            item.ordinal as usize == index + 1
                && (1..=128 * 1024 * 1024).contains(&item.byte_length)
                && valid_media(&PackagedE2eMediaEvidence {
                    media_type: item.media_type.clone(),
                    width: item.width,
                    height: item.height,
                    sha256: item.sha256.clone(),
                })
        })
}

fn is_image_media_type(value: &str) -> bool {
    matches!(value, "image/png" | "image/jpeg" | "image/webp")
}

fn valid_dimension(value: u32) -> bool {
    (1..=16_384).contains(&value)
}

const DELIVERY_DOCUMENT_ROLES: [&str; 16] = [
    "plan",
    "designMarkdown",
    "cssVariables",
    "tailwindTheme",
    "tokensJson",
    "designIrTokens",
    "routeGraph",
    "pageMedia",
    "manifest",
    "bindings",
    "resourcePack",
    "resourceArtifacts",
    "provenance",
    "reviewDocument",
    "pageReviews",
    "resourceReviews",
];

fn valid_provider_routes(routes: &[PackagedE2eProviderRouteEvidence]) -> bool {
    (1..=3).contains(&routes.len())
        && routes
            .iter()
            .map(|route| route.purpose.as_str())
            .collect::<HashSet<_>>()
            .len()
            == routes.len()
        && routes.iter().all(|route| {
            matches!(route.purpose.as_str(), "planning" | "image" | "vision")
                && (1..=120).contains(&route.kind.len())
                && route.kind.bytes().enumerate().all(|(index, byte)| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || (index > 0 && matches!(byte, b'.' | b'_' | b'-'))
                })
                && (1..=256).contains(&route.model.len())
                && !route.model.chars().any(char::is_control)
                && !contains_sensitive_evidence(&route.model)
                && matches!(route.classification.as_str(), "remote" | "local")
        })
        && routes
            .iter()
            .any(|route| route.purpose == "image" && route.classification == "remote")
}

fn valid_evidence_role(role: &str) -> bool {
    role == "designIr"
        || DELIVERY_DOCUMENT_ROLES.contains(&role)
        || matches!(
            role,
            "designSystemMedia" | "pageMediaObject" | "resourceMediaObject"
        )
}

fn media_evidence_role(role: &str) -> bool {
    matches!(
        role,
        "designSystemMedia" | "pageMediaObject" | "resourceMediaObject"
    )
}

fn valid_evidence_file_shape(file: &PackagedE2eEvidenceFile) -> bool {
    if !valid_evidence_role(&file.role)
        || !is_sha256(&file.sha256)
        || file.path != format!("objects/{}", file.sha256)
        || !(1..=MAX_EVIDENCE_FILE_BYTES as u64).contains(&file.byte_length)
    {
        return false;
    }
    if file.role == "designIr" {
        return file.candidate_id.is_none()
            && file.ordinal.is_none()
            && file.media_type.is_none()
            && file.width.is_none()
            && file.height.is_none();
    }
    if file
        .candidate_id
        .as_deref()
        .is_none_or(|id| !is_opaque_candidate_id(id, "suite"))
    {
        return false;
    }
    if !media_evidence_role(&file.role) {
        return file.ordinal.is_none()
            && file.media_type.is_none()
            && file.width.is_none()
            && file.height.is_none();
    }
    (if file.role == "designSystemMedia" {
        file.ordinal.is_none()
    } else {
        file.ordinal.is_some_and(|ordinal| ordinal > 0)
    }) && file.media_type.as_deref().is_some_and(is_image_media_type)
        && file.width.is_some_and(valid_dimension)
        && file.height.is_some_and(valid_dimension)
}

fn delivery_digest<'a>(digests: &'a PackagedE2eDeliveryDigests, role: &str) -> Option<&'a str> {
    match role {
        "plan" => Some(&digests.plan),
        "designMarkdown" => Some(&digests.design_markdown),
        "cssVariables" => Some(&digests.css_variables),
        "tailwindTheme" => Some(&digests.tailwind_theme),
        "tokensJson" => Some(&digests.tokens_json),
        "designIrTokens" => Some(&digests.design_ir_tokens),
        "routeGraph" => Some(&digests.route_graph),
        "pageMedia" => Some(&digests.page_media),
        "manifest" => Some(&digests.manifest),
        "bindings" => Some(&digests.bindings),
        "resourcePack" => Some(&digests.resource_pack),
        "resourceArtifacts" => Some(&digests.resource_artifacts),
        "provenance" => Some(&digests.provenance),
        "reviewDocument" => Some(&digests.review_document),
        "pageReviews" => Some(&digests.page_reviews),
        "resourceReviews" => Some(&digests.resource_reviews),
        _ => None,
    }
}

#[cfg(test)]
fn delivery_digest_mut<'a>(
    digests: &'a mut PackagedE2eDeliveryDigests,
    role: &str,
) -> Option<&'a mut String> {
    match role {
        "plan" => Some(&mut digests.plan),
        "designMarkdown" => Some(&mut digests.design_markdown),
        "cssVariables" => Some(&mut digests.css_variables),
        "tailwindTheme" => Some(&mut digests.tailwind_theme),
        "tokensJson" => Some(&mut digests.tokens_json),
        "designIrTokens" => Some(&mut digests.design_ir_tokens),
        "routeGraph" => Some(&mut digests.route_graph),
        "pageMedia" => Some(&mut digests.page_media),
        "manifest" => Some(&mut digests.manifest),
        "bindings" => Some(&mut digests.bindings),
        "resourcePack" => Some(&mut digests.resource_pack),
        "resourceArtifacts" => Some(&mut digests.resource_artifacts),
        "provenance" => Some(&mut digests.provenance),
        "reviewDocument" => Some(&mut digests.review_document),
        "pageReviews" => Some(&mut digests.page_reviews),
        "resourceReviews" => Some(&mut digests.resource_reviews),
        _ => None,
    }
}

fn valid_evidence_manifest(
    evidence: &PackagedE2eEvidenceManifest,
    suites: &[PackagedE2eSuiteOutcome],
) -> bool {
    if evidence.protocol != "cutout.packaged-e2e-evidence.v1"
        || !valid_provider_routes(&evidence.provider_routes)
        || evidence.files.is_empty()
        || evidence.files.len() > MAX_EVIDENCE_FILES
        || !evidence.files.iter().all(valid_evidence_file_shape)
    {
        return false;
    }
    let semantic = evidence
        .files
        .iter()
        .map(|file| {
            (
                file.candidate_id.as_deref().unwrap_or("global"),
                file.role.as_str(),
                file.ordinal.unwrap_or_default(),
            )
        })
        .collect::<HashSet<_>>();
    if semantic.len() != evidence.files.len()
        || !evidence
            .files
            .iter()
            .any(|file| file.role == "designIr" && file.candidate_id.is_none())
    {
        return false;
    }
    let expected_count = 1 + suites
        .iter()
        .map(|suite| {
            DELIVERY_DOCUMENT_ROLES.len() + 1 + suite.page_media.len() + suite.resource_media.len()
        })
        .sum::<usize>();
    if evidence.files.len() != expected_count {
        return false;
    }
    suites.iter().all(|suite| {
        let files = evidence
            .files
            .iter()
            .filter(|file| file.candidate_id.as_deref() == Some(&suite.candidate_id));
        let files = files.collect::<Vec<_>>();
        DELIVERY_DOCUMENT_ROLES.iter().all(|role| {
            files.iter().any(|file| {
                file.role == *role
                    && delivery_digest(&suite.digests, role) == Some(file.sha256.as_str())
            })
        }) && files.iter().any(|file| {
            file.role == "designSystemMedia" && file.sha256 == suite.design_system_media.sha256
        }) && suite.page_media.iter().all(|media| {
            files.iter().any(|file| {
                file.role == "pageMediaObject"
                    && file.ordinal == Some(media.ordinal)
                    && file.sha256 == media.sha256
            })
        }) && suite.resource_media.iter().all(|media| {
            files.iter().any(|file| {
                file.role == "resourceMediaObject"
                    && file.ordinal == Some(media.ordinal)
                    && file.sha256 == media.sha256
                    && file.byte_length == media.byte_length
            })
        })
    })
}

fn validate_evidence_files_at(
    root: &Path,
    evidence: &PackagedE2eEvidenceManifest,
) -> Result<(), String> {
    for file in &evidence.files {
        if !valid_evidence_file_shape(file) {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        let path = root.join(&file.path);
        let metadata =
            std::fs::symlink_metadata(&path).map_err(|_| "packaged-e2e-evidence-missing")?;
        if !metadata.file_type().is_file() || metadata.len() != file.byte_length {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        let bytes = std::fs::read(&path).map_err(|_| "packaged-e2e-evidence-missing")?;
        if format!("{:x}", Sha256::digest(&bytes)) != file.sha256 {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        if media_evidence_role(&file.role) {
            let decoded =
                image::load_from_memory(&bytes).map_err(|_| "packaged-e2e-evidence-invalid")?;
            if Some(decoded.width()) != file.width || Some(decoded.height()) != file.height {
                return Err("packaged-e2e-evidence-invalid".into());
            }
        } else {
            let text = std::str::from_utf8(&bytes).map_err(|_| "packaged-e2e-evidence-invalid")?;
            if contains_sensitive_evidence(text) {
                return Err("packaged-e2e-evidence-sensitive".into());
            }
        }
    }
    Ok(())
}

fn persist_evidence_at(
    root: &Path,
    payload: PackagedE2eEvidenceUpload,
) -> Result<PackagedE2eEvidenceManifest, String> {
    if !valid_provider_routes(&payload.provider_routes)
        || payload.files.is_empty()
        || payload.files.len() > MAX_EVIDENCE_FILES
    {
        return Err("packaged-e2e-evidence-invalid".into());
    }
    let objects = root.join("objects");
    std::fs::create_dir_all(&objects).map_err(|_| "packaged-e2e-write-failed")?;
    let mut total_bytes = 0usize;
    let mut semantic = HashSet::new();
    let mut files = Vec::with_capacity(payload.files.len());
    for upload in payload.files {
        let candidate = upload.candidate_id.as_deref().unwrap_or("global");
        if !semantic.insert((candidate.to_owned(), upload.role.clone(), upload.ordinal)) {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        let bytes = BASE64
            .decode(&upload.bytes_base64)
            .map_err(|_| "packaged-e2e-evidence-invalid")?;
        if bytes.is_empty()
            || bytes.len() > MAX_EVIDENCE_FILE_BYTES
            || bytes.len() as u64 != upload.byte_length
            || BASE64.encode(&bytes) != upload.bytes_base64
        {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        total_bytes = total_bytes
            .checked_add(bytes.len())
            .ok_or("packaged-e2e-evidence-invalid")?;
        if total_bytes > MAX_EVIDENCE_TOTAL_BYTES {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        let digest = format!("{:x}", Sha256::digest(&bytes));
        if digest != upload.sha256 {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        let file = PackagedE2eEvidenceFile {
            role: upload.role,
            candidate_id: upload.candidate_id,
            ordinal: upload.ordinal,
            path: format!("objects/{digest}"),
            sha256: digest.clone(),
            byte_length: bytes.len() as u64,
            media_type: upload.media_type,
            width: upload.width,
            height: upload.height,
        };
        if !valid_evidence_file_shape(&file) {
            return Err("packaged-e2e-evidence-invalid".into());
        }
        if media_evidence_role(&file.role) {
            let decoded =
                image::load_from_memory(&bytes).map_err(|_| "packaged-e2e-evidence-invalid")?;
            if Some(decoded.width()) != file.width || Some(decoded.height()) != file.height {
                return Err("packaged-e2e-evidence-invalid".into());
            }
        } else {
            let text = std::str::from_utf8(&bytes).map_err(|_| "packaged-e2e-evidence-invalid")?;
            if contains_sensitive_evidence(text) {
                return Err("packaged-e2e-evidence-sensitive".into());
            }
        }
        let destination = objects.join(&digest);
        if destination.exists() {
            let current = std::fs::read(&destination).map_err(|_| "packaged-e2e-write-failed")?;
            if current != bytes {
                return Err("packaged-e2e-evidence-invalid".into());
            }
        } else {
            let temporary = objects.join(format!(".{digest}.{}.tmp", std::process::id()));
            std::fs::write(&temporary, &bytes).map_err(|_| "packaged-e2e-write-failed")?;
            if std::fs::rename(&temporary, &destination).is_err() {
                let _ = std::fs::remove_file(&temporary);
                return Err("packaged-e2e-write-failed".into());
            }
        }
        files.push(file);
    }
    let manifest = PackagedE2eEvidenceManifest {
        protocol: "cutout.packaged-e2e-evidence.v1".into(),
        provider_routes: payload.provider_routes,
        files,
    };
    validate_evidence_files_at(root, &manifest)?;
    Ok(manifest)
}

fn is_bounded_route(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.starts_with('/')
        && !value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
}

fn valid_graph_text(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 40_000
        && value.trim() == value
        && !value.chars().any(char::is_control)
        && !value.contains("  ")
}

fn valid_route_graph_identity(value: &str, routes: &[String]) -> bool {
    if value.is_empty() || value.len() > 512_000 {
        return false;
    }
    let identity: PackagedE2eRouteGraphIdentity = match serde_json::from_str(value) {
        Ok(identity) => identity,
        Err(_) => return false,
    };
    if identity.version != "prototype-route-graph.v1"
        || !(1..=12).contains(&identity.pages.len())
        || identity.flows.is_empty()
        || serde_json::to_string(&identity).ok().as_deref() != Some(value)
    {
        return false;
    }
    let graph_routes = identity
        .pages
        .iter()
        .map(|page| page.route.as_str())
        .collect::<HashSet<_>>();
    if graph_routes.len() != identity.pages.len()
        || graph_routes.len() != routes.len()
        || routes
            .iter()
            .any(|route| !graph_routes.contains(route.as_str()))
    {
        return false;
    }
    for page in &identity.pages {
        if !valid_graph_text(&page.name)
            || !is_bounded_route(&page.route)
            || !valid_graph_text(&page.purpose)
            || page.regions.is_empty()
            || page.regions.iter().any(|region| {
                !valid_graph_text(&region.name)
                    || !valid_graph_text(&region.role)
                    || !valid_graph_text(&region.summary)
            })
            || page
                .overlays
                .iter()
                .any(|node| !valid_graph_text(&node.name) || !valid_graph_text(&node.purpose))
            || page
                .states
                .iter()
                .any(|node| !valid_graph_text(&node.name) || !valid_graph_text(&node.purpose))
        {
            return false;
        }
        for interaction in &page.interactions {
            if !valid_graph_text(&interaction.label)
                || !matches!(
                    interaction.trigger.as_str(),
                    "click" | "tap" | "hover" | "scroll" | "submit" | "change"
                )
                || interaction
                    .source_region
                    .is_some_and(|source| source >= page.regions.len())
                || !valid_graph_text(&interaction.source_element)
                || !valid_graph_text(&interaction.intent)
                || !match &interaction.action {
                    PackagedE2eRouteGraphAction::Navigate { target_page } => {
                        *target_page < identity.pages.len()
                    }
                    PackagedE2eRouteGraphAction::OpenOverlay { target_overlay } => {
                        *target_overlay < page.overlays.len()
                    }
                    PackagedE2eRouteGraphAction::ChangeState { target_state } => {
                        *target_state < page.states.len()
                    }
                    PackagedE2eRouteGraphAction::External { destination } => {
                        valid_graph_text(destination)
                    }
                    PackagedE2eRouteGraphAction::None { reason } => valid_graph_text(reason),
                }
            {
                return false;
            }
        }
    }
    identity.flows.iter().all(|flow| {
        valid_graph_text(&flow.name)
            && valid_graph_text(&flow.goal)
            && flow.start_page < identity.pages.len()
            && flow.steps.iter().all(|step| {
                step.from_page < identity.pages.len()
                    && step.interaction < identity.pages[step.from_page].interactions.len()
                    && step
                        .to_page
                        .is_none_or(|to_page| to_page < identity.pages.len())
            })
    })
}

fn capture_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if !CAPTURE_FILE_IDS.contains(&id) {
        return Err("packaged-e2e-capture-invalid".into());
    }
    Ok(root.join("captures").join(format!("{id}.png")))
}

fn validate_png_bytes(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.is_empty() || bytes.len() > MAX_CAPTURE_BYTES {
        return Err("packaged-e2e-capture-invalid".into());
    }
    let decoded = image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .map_err(|_| "packaged-e2e-capture-invalid")?
        .to_rgba8();
    let (width, height) = decoded.dimensions();
    if !valid_dimension(width) || !valid_dimension(height) || width < 320 || height < 240 {
        return Err("packaged-e2e-capture-invalid".into());
    }
    let first = decoded
        .pixels()
        .next()
        .ok_or("packaged-e2e-capture-invalid")?
        .0;
    let total_pixels = width as usize * height as usize;
    let required_contrast_pixels = (total_pixels / 10_000)
        .max(8)
        .min(total_pixels.saturating_sub(1).max(1));
    let mut contrast_pixels = 0usize;
    let mut quantized_colors = HashSet::new();
    for pixel in decoded.pixels() {
        let rgba = pixel.0;
        quantized_colors.insert([rgba[0] >> 3, rgba[1] >> 3, rgba[2] >> 3]);
        let distance = rgba[0]
            .abs_diff(first[0])
            .max(rgba[1].abs_diff(first[1]))
            .max(rgba[2].abs_diff(first[2]));
        if distance >= 24 {
            contrast_pixels += 1;
        }
    }
    // A window chrome/background split is not product evidence. Real UI has
    // text and controls, which produce both meaningful contrast and a wider
    // quantized palette even when the surface is mostly white or mostly dark.
    if quantized_colors.len() < 8 || contrast_pixels < required_contrast_pixels {
        return Err("packaged-e2e-capture-blank".into());
    }
    Ok((width, height))
}

fn persist_capture_at(
    root: &Path,
    id: &str,
    bytes: &[u8],
) -> Result<PackagedE2eCaptureEvidence, String> {
    let (width, height) = validate_png_bytes(bytes)?;
    let path = capture_path(root, id)?;
    let parent = path.parent().ok_or("packaged-e2e-capture-invalid")?;
    std::fs::create_dir_all(parent).map_err(|_| "packaged-e2e-write-failed")?;
    let temporary = path.with_extension(format!("png.{}.tmp", std::process::id()));
    std::fs::write(&temporary, bytes).map_err(|_| "packaged-e2e-write-failed")?;
    std::fs::rename(&temporary, &path).map_err(|_| "packaged-e2e-write-failed")?;
    let reread = std::fs::read(&path).map_err(|_| "packaged-e2e-capture-missing")?;
    let (reread_width, reread_height) = validate_png_bytes(&reread)?;
    if width != reread_width || height != reread_height || reread != bytes {
        return Err("packaged-e2e-capture-invalid".into());
    }
    Ok(PackagedE2eCaptureEvidence {
        id: id.into(),
        sha256: format!("{:x}", Sha256::digest(&reread)),
        width,
        height,
        byte_length: reread.len() as u64,
    })
}

fn validate_capture_file_at(
    root: &Path,
    evidence: &PackagedE2eCaptureEvidence,
) -> Result<(), String> {
    if !valid_capture(evidence) {
        return Err("packaged-e2e-capture-invalid".into());
    }
    let path = capture_path(root, &evidence.id)?;
    let metadata = std::fs::metadata(&path).map_err(|_| "packaged-e2e-capture-missing")?;
    if !metadata.is_file() || metadata.len() != evidence.byte_length || metadata.len() == 0 {
        return Err("packaged-e2e-capture-invalid".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "packaged-e2e-capture-missing")?;
    let (width, height) = validate_png_bytes(&bytes)?;
    if width != evidence.width
        || height != evidence.height
        || format!("{:x}", Sha256::digest(&bytes)) != evidence.sha256
    {
        return Err("packaged-e2e-capture-invalid".into());
    }
    Ok(())
}

fn validate_capture_files_at(root: &Path, outcome: &PackagedE2eOutcome) -> Result<(), String> {
    for capture in &outcome.captures {
        validate_capture_file_at(root, capture)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn request_webview_snapshot(
    raw_webview: *mut std::ffi::c_void,
    sender: mpsc::SyncSender<Result<Vec<u8>, String>>,
) {
    use block2::RcBlock;
    use objc2_app_kit::NSImage;
    use objc2_foundation::NSError;
    use objc2_web_kit::WKWebView;
    use std::io::Cursor;

    if raw_webview.is_null() {
        let _ = sender.send(Err("packaged-e2e-capture-unavailable".into()));
        return;
    }
    // SAFETY: Tauri provides the retained WKWebView pointer and invokes this
    // closure on AppKit's main thread. WebKit copies the completion block and
    // calls it on the main thread after compositing the current page.
    let webview = unsafe { &*(raw_webview.cast::<WKWebView>()) };
    let completion = RcBlock::new(move |snapshot: *mut NSImage, error: *mut NSError| {
        let result = (|| {
            if !error.is_null() || snapshot.is_null() {
                return Err("packaged-e2e-capture-unavailable".into());
            }
            // SAFETY: WebKit guarantees a non-null NSImage for the duration of
            // this completion callback when the error pointer is null.
            let snapshot = unsafe { &*snapshot };
            let tiff = snapshot
                .TIFFRepresentation()
                .ok_or("packaged-e2e-capture-unavailable")?
                .to_vec();
            let decoded =
                image::load_from_memory(&tiff).map_err(|_| "packaged-e2e-capture-unavailable")?;
            let mut png = Vec::new();
            decoded
                .write_to(&mut Cursor::new(&mut png), image::ImageOutputFormat::Png)
                .map_err(|_| "packaged-e2e-capture-unavailable")?;
            Ok(png)
        })();
        let _ = sender.send(result);
    });
    unsafe {
        webview.takeSnapshotWithConfiguration_completionHandler(None, &completion);
    }
}

#[cfg(target_os = "macos")]
fn enforce_window_background(
    raw_window: *mut std::ffi::c_void,
    initialize: bool,
) -> Result<(), String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSWindow};

    if raw_window.is_null() {
        return Err("packaged-e2e-background-unavailable".into());
    }
    // SAFETY: Tauri owns this NSWindow and invokes the callback on AppKit's
    // main thread. These setters do not transfer ownership or retain the value.
    let window = unsafe { &*(raw_window.cast::<NSWindow>()) };
    let main_thread = MainThreadMarker::new().ok_or("packaged-e2e-background-unavailable")?;
    let application = NSApplication::sharedApplication(main_thread);
    let application_active = application.isActive();
    let window_owns_focus = window.isKeyWindow() || window.isMainWindow();
    if initialize {
        window.setIgnoresMouseEvents(true);
    }
    // Tick and watchdog calls are frequent. Reordering an already-safe window
    // can itself perturb AppKit's frontmost registration, so the steady-state
    // path is read-only until activation or focus ownership actually changes.
    if initialize || application_active || window_owns_focus {
        window.orderBack(None);
    }
    if application_active {
        application.deactivate();
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_window_background(app: &tauri::AppHandle, initialize: bool) -> Result<(), String> {
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .ok_or("packaged-e2e-background-unavailable")?;
    let (sender, receiver) = mpsc::sync_channel(1);
    window
        .with_webview(move |webview| {
            let result = enforce_window_background(webview.ns_window(), initialize);
            let _ = sender.send(result);
        })
        .map_err(|_| "packaged-e2e-background-unavailable")?;
    receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "packaged-e2e-background-unavailable")?
}

#[cfg(target_os = "macos")]
pub(crate) fn initialize_window_background(app: &tauri::AppHandle) -> Result<(), String> {
    set_window_background(app, true)
}

#[cfg(target_os = "macos")]
pub(crate) fn keep_window_background(app: &tauri::AppHandle) -> Result<(), String> {
    set_window_background(app, false)
}

/// Schedule one fixed, side-effect-free JavaScript evaluation so WebKit drains
/// native invoke completions while the isolated window remains backgrounded.
/// This is available only to the packaged harness and never accepts script
/// text from the renderer or another caller.
#[cfg(target_os = "macos")]
pub(crate) fn pulse_background_renderer(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if !enabled() {
        return Ok(());
    }
    let window = app
        .get_webview_window("main")
        .ok_or("packaged-e2e-background-unavailable")?;
    window
        .eval("void globalThis.performance.now()")
        .map_err(|_| "packaged-e2e-background-unavailable".into())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn pulse_background_renderer(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

/// Keep the dedicated E2E WebView behind the user's work even while renderer
/// progress is temporarily busy handling Provider completions or screenshots.
#[cfg(target_os = "macos")]
pub(crate) fn start_background_window_watchdog(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        let _ = keep_window_background(&app);
        let _ = pulse_background_renderer(&app);
        std::thread::sleep(Duration::from_millis(250));
    });
}

#[tauri::command]
pub async fn packaged_e2e_mode() -> PackagedE2eMode {
    PackagedE2eMode {
        enabled: enabled(),
        window_probe: window_probe_enabled(),
    }
}

#[tauri::command]
pub async fn packaged_e2e_tick(app: tauri::AppHandle) -> Result<(), String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    #[cfg(target_os = "macos")]
    keep_window_background(&app)?;
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    #[cfg(target_os = "macos")]
    keep_window_background(&app)?;
    Ok(())
}

#[tauri::command]
pub async fn packaged_e2e_checkpoint(phases: Vec<PackagedE2ePhase>) -> Result<(), String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    write_checkpoint_at(&result_root(), phases)
}

#[tauri::command]
pub async fn packaged_e2e_persist_evidence(
    payload: PackagedE2eEvidenceUpload,
) -> Result<PackagedE2eEvidenceManifest, String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    persist_evidence_at(&result_root(), payload)
}

#[tauri::command]
pub async fn packaged_e2e_capture_window(
    app: tauri::AppHandle,
    id: String,
) -> Result<PackagedE2eCaptureEvidence, String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    capture_path(&result_root(), &id)?;
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;

        keep_window_background(&app)?;
        let window = app
            .get_webview_window("main")
            .ok_or("packaged-e2e-capture-unavailable")?;
        let (sender, receiver) = mpsc::sync_channel(1);
        window
            .with_webview(move |webview| {
                request_webview_snapshot(webview.inner(), sender);
            })
            .map_err(|_| "packaged-e2e-capture-unavailable")?;
        let bytes = receiver
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| {
                eprintln!("packaged E2E snapshot failed: callback-timeout");
                "packaged-e2e-capture-unavailable"
            })?
            .map_err(|error| {
                eprintln!("packaged E2E snapshot failed: {error}");
                error
            })?;
        let evidence = persist_capture_at(&result_root(), &id, &bytes).map_err(|error| {
            eprintln!("packaged E2E snapshot rejected: {error}");
            error
        })?;
        keep_window_background(&app)?;
        return Ok(evidence);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("packaged-e2e-capture-unsupported".into())
    }
}

#[tauri::command]
pub async fn packaged_e2e_complete(mut result: PackagedE2eResult) -> Result<(), String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    let _guard = progress_lock()
        .lock()
        .map_err(|_| "packaged-e2e-write-failed")?;
    result.phases = stamp_phases(merge_phases(
        read_progress()
            .map(|value| value.phases)
            .unwrap_or_default(),
        result.phases,
    ));
    validate(&result)?;
    write_terminal_result_at(&result_root(), &result)
}

fn write_terminal_result_at(root: &Path, result: &PackagedE2eResult) -> Result<(), String> {
    validate(result)?;
    if let Some(outcome) = &result.outcome {
        validate_capture_files_at(root, outcome)?;
        validate_evidence_files_at(root, &outcome.evidence)?;
    }
    std::fs::create_dir_all(root).map_err(|_| "packaged-e2e-write-failed")?;
    let result_path = root.join("result.json");
    let progress_path = root.join("progress.json");
    let result_temporary = root.join(format!("result.json.{}.tmp", std::process::id()));
    let progress_temporary = root.join(format!("progress.json.{}.tmp", std::process::id()));
    let prior_progress = std::fs::read(&progress_path).ok();
    let result_bytes =
        serde_json::to_vec_pretty(result).map_err(|_| "packaged-e2e-result-invalid")?;
    let progress_bytes = serde_json::to_vec_pretty(&PackagedE2eProgress {
        protocol: RESULT_PROTOCOL.into(),
        status: result.status.clone(),
        phases: result.phases.clone(),
    })
    .map_err(|_| "packaged-e2e-result-invalid")?;
    std::fs::write(&result_temporary, result_bytes).map_err(|_| "packaged-e2e-write-failed")?;
    std::fs::write(&progress_temporary, progress_bytes).map_err(|_| "packaged-e2e-write-failed")?;
    std::fs::rename(&progress_temporary, &progress_path)
        .map_err(|_| "packaged-e2e-write-failed")?;
    if std::fs::rename(&result_temporary, &result_path).is_err() {
        if let Some(bytes) = prior_progress {
            let restore = root.join(format!("progress.json.{}.restore", std::process::id()));
            let _ = std::fs::write(&restore, bytes);
            let _ = std::fs::rename(restore, progress_path);
        } else {
            let _ = std::fs::remove_file(progress_path);
        }
        let _ = std::fs::remove_file(result_temporary);
        return Err("packaged-e2e-write-failed".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn valid_digests() -> PackagedE2eDeliveryDigests {
        let digest = "a".repeat(64);
        PackagedE2eDeliveryDigests {
            plan: digest.clone(),
            design_system_image: digest.clone(),
            design_markdown: digest.clone(),
            css_variables: digest.clone(),
            tailwind_theme: digest.clone(),
            tokens_json: digest.clone(),
            design_ir_tokens: digest.clone(),
            route_graph: digest.clone(),
            page_media: digest.clone(),
            manifest: digest.clone(),
            bindings: digest.clone(),
            resource_pack: digest.clone(),
            resource_artifacts: digest.clone(),
            provenance: digest.clone(),
            review_document: digest.clone(),
            page_reviews: digest.clone(),
            resource_reviews: digest,
        }
    }

    fn evidence_digest(value: usize) -> String {
        format!("{value:064x}")
    }

    fn valid_media(digest: String) -> PackagedE2eMediaEvidence {
        PackagedE2eMediaEvidence {
            media_type: "image/png".into(),
            width: 1440,
            height: 900,
            sha256: digest,
        }
    }

    fn valid_capture(id: &str) -> PackagedE2eCaptureEvidence {
        PackagedE2eCaptureEvidence {
            id: id.into(),
            sha256: "a".repeat(64),
            width: 1440,
            height: 900,
            byte_length: 4_096,
        }
    }

    fn valid_evidence_file(
        role: &str,
        candidate_id: Option<&str>,
        ordinal: Option<u32>,
        sha256: String,
        media: Option<(&str, u32, u32)>,
    ) -> PackagedE2eEvidenceFile {
        PackagedE2eEvidenceFile {
            role: role.into(),
            candidate_id: candidate_id.map(str::to_owned),
            ordinal,
            path: format!("objects/{sha256}"),
            sha256,
            byte_length: 1,
            media_type: media.map(|(media_type, _, _)| media_type.to_owned()),
            width: media.map(|(_, width, _)| width),
            height: media.map(|(_, _, height)| height),
        }
    }

    fn valid_route_graph(routes: &[String], suite_index: usize) -> String {
        serde_json::to_string(&PackagedE2eRouteGraphIdentity {
            version: "prototype-route-graph.v1".into(),
            pages: routes
                .iter()
                .enumerate()
                .map(|(index, route)| PackagedE2eRouteGraphPage {
                    name: format!("Suite {} page {}", suite_index + 1, index + 1),
                    route: route.clone(),
                    purpose: format!("Serve route {route}."),
                    regions: vec![PackagedE2eRouteGraphRegion {
                        name: "Primary content".into(),
                        role: "content".into(),
                        summary: format!("Content unique to {route}."),
                    }],
                    overlays: vec![],
                    states: vec![],
                    interactions: vec![],
                })
                .collect(),
            flows: vec![PackagedE2eRouteGraphFlow {
                name: format!("Suite {} primary flow", suite_index + 1),
                goal: "Explore the planned experience.".into(),
                start_page: 0,
                steps: vec![],
            }],
        })
        .unwrap()
    }

    fn valid_evidence_manifest_fixture(
        suites: &[PackagedE2eSuiteOutcome],
    ) -> PackagedE2eEvidenceManifest {
        let mut files = vec![valid_evidence_file(
            "designIr",
            None,
            None,
            evidence_digest(999),
            None,
        )];
        for suite in suites {
            for role in DELIVERY_DOCUMENT_ROLES {
                files.push(valid_evidence_file(
                    role,
                    Some(&suite.candidate_id),
                    None,
                    delivery_digest(&suite.digests, role).unwrap().to_owned(),
                    None,
                ));
            }
            files.push(valid_evidence_file(
                "designSystemMedia",
                Some(&suite.candidate_id),
                None,
                suite.design_system_media.sha256.clone(),
                Some((
                    &suite.design_system_media.media_type,
                    suite.design_system_media.width,
                    suite.design_system_media.height,
                )),
            ));
            for page in &suite.page_media {
                files.push(valid_evidence_file(
                    "pageMediaObject",
                    Some(&suite.candidate_id),
                    Some(page.ordinal),
                    page.sha256.clone(),
                    Some((&page.media_type, page.width, page.height)),
                ));
            }
            for resource in &suite.resource_media {
                let mut file = valid_evidence_file(
                    "resourceMediaObject",
                    Some(&suite.candidate_id),
                    Some(resource.ordinal),
                    resource.sha256.clone(),
                    Some((&resource.media_type, resource.width, resource.height)),
                );
                file.byte_length = resource.byte_length;
                files.push(file);
            }
        }
        PackagedE2eEvidenceManifest {
            protocol: "cutout.packaged-e2e-evidence.v1".into(),
            provider_routes: vec![PackagedE2eProviderRouteEvidence {
                purpose: "image".into(),
                kind: "openai".into(),
                model: "image-model".into(),
                classification: "remote".into(),
            }],
            files,
        }
    }

    fn valid_outcome() -> PackagedE2eOutcome {
        let intent = "Build a calm, exploratory travel planning app.";
        let prototype_suites = [(4_u32, 7_u32), (5, 11), (7, 19)]
            .into_iter()
            .enumerate()
            .map(|(suite_index, (route_count, resource_count))| {
                let routes = (1..=route_count)
                    .map(|route| format!("/suite-{}/route-{route}", suite_index + 1))
                    .collect::<Vec<_>>();
                let route_graph = valid_route_graph(&routes, suite_index);
                PackagedE2eSuiteOutcome {
                    candidate_id: format!("suite-{}", suite_index + 1),
                    design_system_id: format!("design-{}", suite_index + 1),
                    resource_pack_id: format!("resource-pack-{}", suite_index + 1),
                    status: "ready".into(),
                    page_media: routes
                        .iter()
                        .enumerate()
                        .map(|(index, route)| PackagedE2ePageMediaEvidence {
                            ordinal: index as u32 + 1,
                            route: route.clone(),
                            media_type: "image/png".into(),
                            width: 1440,
                            height: 900,
                            sha256: evidence_digest(10_000 + suite_index * 100 + index),
                        })
                        .collect(),
                    resource_media: (1..=resource_count)
                        .map(|ordinal| PackagedE2eResourceMediaEvidence {
                            ordinal,
                            media_type: "image/png".into(),
                            width: 512,
                            height: 512,
                            byte_length: 1_024,
                            sha256: evidence_digest(
                                20_000 + suite_index * 1_000 + ordinal as usize,
                            ),
                        })
                        .collect(),
                    routes,
                    route_count,
                    page_count: route_count,
                    resource_asset_count: resource_count,
                    artifact_count: resource_count,
                    quality_review_status: "passed".into(),
                    route_graph: route_graph.clone(),
                    design_system_media: valid_media(evidence_digest(1_000 + suite_index)),
                    digests: {
                        let mut digests = valid_digests();
                        digests.route_graph =
                            format!("{:x}", Sha256::digest(route_graph.as_bytes()));
                        digests
                    },
                }
            })
            .collect::<Vec<_>>();
        let evidence = valid_evidence_manifest_fixture(&prototype_suites);
        PackagedE2eOutcome {
            intent: PackagedE2eIntentEvidence {
                text: intent.into(),
                sha256: format!("{:x}", Sha256::digest(intent.as_bytes())),
            },
            design_systems: (1..=3)
                .map(|index| PackagedE2eCandidateOutcome {
                    candidate_id: format!("design-{index}"),
                    status: "ready".into(),
                })
                .collect(),
            prototype_suites,
            captures: CAPTURE_IDS.iter().map(|id| valid_capture(id)).collect(),
            evidence,
            selected_suite_id: "suite-2".into(),
            selected_visible_slice_count: 11,
            planning_turn_count: 2,
            planning_runtime_counts: PackagedE2ePlanningRuntimeCounts {
                codex_system: 0,
                direct: 2,
            },
            planned_image_call_count: 23,
            image_call_count: 23,
            retry_count: 0,
            retry_image_call_count: 0,
        }
    }

    fn valid_outcome_for_count(count: usize) -> PackagedE2eOutcome {
        assert!((1..=MAX_CANDIDATE_COUNT).contains(&count));
        let mut outcome = valid_outcome();
        if count < 3 {
            outcome.design_systems.truncate(count);
            outcome.prototype_suites.truncate(count);
        } else {
            for index in 4..=count {
                outcome.design_systems.push(PackagedE2eCandidateOutcome {
                    candidate_id: format!("design-{index}"),
                    status: "ready".into(),
                });
                let mut suite = outcome.prototype_suites[2].clone();
                suite.candidate_id = format!("suite-{index}");
                suite.design_system_id = format!("design-{index}");
                suite.resource_pack_id = format!("resource-pack-{index}");
                suite.design_system_media.sha256 = evidence_digest(1_000 + index);
                suite.routes = (1..=suite.route_count)
                    .map(|route| format!("/suite-{index}/route-{route}"))
                    .collect();
                suite.route_graph = valid_route_graph(&suite.routes, index - 1);
                suite.digests.route_graph =
                    format!("{:x}", Sha256::digest(suite.route_graph.as_bytes()));
                for (page_index, page) in suite.page_media.iter_mut().enumerate() {
                    page.route = suite.routes[page_index].clone();
                    page.sha256 = evidence_digest(10_000 + index * 100 + page_index);
                }
                for (resource_index, resource) in suite.resource_media.iter_mut().enumerate() {
                    resource.sha256 = evidence_digest(20_000 + index * 1_000 + resource_index);
                }
                outcome.prototype_suites.push(suite);
            }
        }
        let selected = &outcome.prototype_suites[count - 1];
        outcome.selected_suite_id = selected.candidate_id.clone();
        outcome.selected_visible_slice_count = selected.resource_asset_count;
        outcome.evidence = valid_evidence_manifest_fixture(&outcome.prototype_suites);
        outcome
    }

    fn valid_result() -> PackagedE2eResult {
        PackagedE2eResult {
            protocol: RESULT_PROTOCOL.into(),
            status: "passed".into(),
            phases: REQUIRED_SUCCESS_PHASES
                .iter()
                .rev()
                .map(|id| PackagedE2ePhase {
                    id: (*id).into(),
                    status: "passed".into(),
                    elapsed_ms: Some(1),
                })
                .collect(),
            failure: None,
            outcome: Some(valid_outcome()),
            completed_at: 1,
        }
    }

    fn capture_png() -> Vec<u8> {
        let image = image::RgbaImage::from_fn(640, 480, |x, y| {
            image::Rgba([
                (x.wrapping_mul(61) + y.wrapping_mul(17)) as u8,
                (x.wrapping_mul(23) + y.wrapping_mul(67)) as u8,
                (x.wrapping_mul(47) + y.wrapping_mul(31)) as u8,
                255,
            ])
        });
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageOutputFormat::Png)
            .unwrap();
        bytes
    }

    fn evidence_png(width: u32, height: u32, seed: u8) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(
            width,
            height,
            image::Rgba([seed, seed.wrapping_mul(17), seed.wrapping_mul(31), 255]),
        );
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageOutputFormat::Png)
            .unwrap();
        bytes
    }

    fn upload_file(
        role: &str,
        candidate_id: Option<&str>,
        ordinal: Option<u32>,
        bytes: &[u8],
        media: Option<(&str, u32, u32)>,
    ) -> PackagedE2eEvidenceUploadFile {
        PackagedE2eEvidenceUploadFile {
            role: role.into(),
            candidate_id: candidate_id.map(str::to_owned),
            ordinal,
            sha256: format!("{:x}", Sha256::digest(bytes)),
            byte_length: bytes.len() as u64,
            bytes_base64: BASE64.encode(bytes),
            media_type: media.map(|(media_type, _, _)| media_type.to_owned()),
            width: media.map(|(_, width, _)| width),
            height: media.map(|(_, _, height)| height),
        }
    }

    fn install_evidence_fixtures(root: &Path, result: &mut PackagedE2eResult) {
        let outcome = result.outcome.as_mut().unwrap();
        let design_ir = br#"{"version":"design-ir.v1"}"#;
        let mut uploads = vec![upload_file("designIr", None, None, design_ir, None)];
        let mut seed = 1u8;
        for suite in &mut outcome.prototype_suites {
            for role in DELIVERY_DOCUMENT_ROLES {
                let bytes = if role == "routeGraph" {
                    suite.route_graph.as_bytes().to_vec()
                } else {
                    format!("{}:{role}", suite.candidate_id).into_bytes()
                };
                let upload = upload_file(role, Some(&suite.candidate_id), None, &bytes, None);
                *delivery_digest_mut(&mut suite.digests, role).unwrap() = upload.sha256.clone();
                uploads.push(upload);
            }
            let bytes = evidence_png(
                suite.design_system_media.width,
                suite.design_system_media.height,
                seed,
            );
            seed = seed.wrapping_add(1);
            let upload = upload_file(
                "designSystemMedia",
                Some(&suite.candidate_id),
                None,
                &bytes,
                Some((
                    &suite.design_system_media.media_type,
                    suite.design_system_media.width,
                    suite.design_system_media.height,
                )),
            );
            suite.design_system_media.sha256 = upload.sha256.clone();
            suite.digests.design_system_image = upload.sha256.clone();
            uploads.push(upload);
            for page in &mut suite.page_media {
                let bytes = evidence_png(page.width, page.height, seed);
                seed = seed.wrapping_add(1);
                let upload = upload_file(
                    "pageMediaObject",
                    Some(&suite.candidate_id),
                    Some(page.ordinal),
                    &bytes,
                    Some((&page.media_type, page.width, page.height)),
                );
                page.sha256 = upload.sha256.clone();
                uploads.push(upload);
            }
            for resource in &mut suite.resource_media {
                let bytes = evidence_png(resource.width, resource.height, seed);
                seed = seed.wrapping_add(1);
                let upload = upload_file(
                    "resourceMediaObject",
                    Some(&suite.candidate_id),
                    Some(resource.ordinal),
                    &bytes,
                    Some((&resource.media_type, resource.width, resource.height)),
                );
                resource.sha256 = upload.sha256.clone();
                resource.byte_length = upload.byte_length;
                uploads.push(upload);
            }
        }
        outcome.evidence = persist_evidence_at(
            root,
            PackagedE2eEvidenceUpload {
                provider_routes: vec![PackagedE2eProviderRouteEvidence {
                    purpose: "image".into(),
                    kind: "openai".into(),
                    model: "image-model".into(),
                    classification: "remote".into(),
                }],
                files: uploads,
            },
        )
        .unwrap();
    }

    fn install_capture_fixtures(root: &Path, result: &mut PackagedE2eResult) {
        let captures = CAPTURE_IDS
            .iter()
            .map(|id| persist_capture_at(root, id, &capture_png()).unwrap())
            .collect();
        result.outcome.as_mut().unwrap().captures = captures;
        install_evidence_fixtures(root, result);
    }

    #[test]
    fn accepts_only_closed_sanitized_results() {
        let valid = valid_result();
        assert!(validate(&valid).is_ok());
        let mut invalid = valid_result();
        invalid.phases[0].id = "Bearer secret".into();
        assert!(validate(&invalid).is_err());

        let mut stale_coding_phase = valid_result();
        stale_coding_phase.phases[0].id = "coding-applied".into();
        assert!(validate(&stale_coding_phase).is_err());

        let mut incomplete = valid_result();
        incomplete.phases[0].id = "prototype-suite-selected".into();
        assert!(validate(&incomplete).is_err());
    }

    #[test]
    fn passed_result_requires_the_complete_outcome_graph() {
        let mut missing = valid_result();
        missing.outcome = None;
        assert!(validate(&missing).is_err());

        let mut design_count = valid_result();
        design_count.outcome.as_mut().unwrap().design_systems.pop();
        assert!(validate(&design_count).is_err());

        let mut zero_assets = valid_result();
        let suite = &mut zero_assets.outcome.as_mut().unwrap().prototype_suites[0];
        suite.resource_asset_count = 0;
        suite.artifact_count = 0;
        suite.resource_media.clear();
        let outcome = zero_assets.outcome.as_mut().unwrap();
        outcome.evidence = valid_evidence_manifest_fixture(&outcome.prototype_suites);
        assert!(validate(&zero_assets).is_ok());
    }

    #[test]
    fn accepts_dynamic_agent_authored_candidate_counts() {
        for count in [1, 2, 5, 8] {
            let mut result = valid_result();
            result.outcome = Some(valid_outcome_for_count(count));
            assert!(validate(&result).is_ok(), "rejected {count} candidates");
        }
    }

    #[test]
    fn rejects_tampered_intent_media_capture_and_retry_evidence() {
        let mut intent = valid_result();
        intent.outcome.as_mut().unwrap().intent.sha256 = "b".repeat(64);
        assert!(validate(&intent).is_err());

        let mut media = valid_result();
        media.outcome.as_mut().unwrap().prototype_suites[0]
            .design_system_media
            .width = 0;
        assert!(validate(&media).is_err());

        let mut page_hash = valid_result();
        page_hash.outcome.as_mut().unwrap().prototype_suites[0].page_media[0].sha256 =
            "A".repeat(64);
        assert!(validate(&page_hash).is_err());

        let mut capture = valid_result();
        capture.outcome.as_mut().unwrap().captures.pop();
        assert!(validate(&capture).is_err());

        let mut retries = valid_result();
        retries.outcome.as_mut().unwrap().retry_image_call_count = 24;
        assert!(validate(&retries).is_err());

        for text in [
            "Authorization: Bearer sk-test-secret",
            "/Users/example/private",
            "/private/tmp/cutout-private/evidence.json",
            r"C:\temp\cutout-private\evidence.json",
            "file:///private/tmp/credential",
        ] {
            let mut sensitive = valid_result();
            let intent = &mut sensitive.outcome.as_mut().unwrap().intent;
            intent.text = text.into();
            intent.sha256 = format!("{:x}", Sha256::digest(text.as_bytes()));
            assert!(validate(&sensitive).is_err());
        }
    }

    #[test]
    fn rejects_duplicate_media_across_suites_and_artifact_roles() {
        let mut duplicate_page = valid_result();
        let page_hash = duplicate_page.outcome.as_ref().unwrap().prototype_suites[0].page_media[0]
            .sha256
            .clone();
        duplicate_page.outcome.as_mut().unwrap().prototype_suites[1].page_media[0].sha256 =
            page_hash;
        assert!(validate(&duplicate_page).is_err());

        let mut duplicate_resource = valid_result();
        let resource_hash = duplicate_resource
            .outcome
            .as_ref()
            .unwrap()
            .prototype_suites[0]
            .resource_media[0]
            .sha256
            .clone();
        duplicate_resource
            .outcome
            .as_mut()
            .unwrap()
            .prototype_suites[1]
            .resource_media[0]
            .sha256 = resource_hash;
        assert!(validate(&duplicate_resource).is_err());

        let mut duplicate_role = valid_result();
        let design_hash = duplicate_role.outcome.as_ref().unwrap().prototype_suites[0]
            .design_system_media
            .sha256
            .clone();
        duplicate_role.outcome.as_mut().unwrap().prototype_suites[0].page_media[0].sha256 =
            design_hash;
        assert!(validate(&duplicate_role).is_err());
    }

    #[test]
    fn capture_files_are_nonblank_content_addressed_and_reread() {
        let root = tempfile::tempdir().unwrap();
        let evidence = persist_capture_at(root.path(), "design-systems", &capture_png()).unwrap();
        assert!(validate_capture_file_at(root.path(), &evidence).is_ok());

        let path = capture_path(root.path(), "design-systems").unwrap();
        let mut bytes = std::fs::read(&path).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        std::fs::write(path, bytes).unwrap();
        assert!(validate_capture_file_at(root.path(), &evidence).is_err());

        let blank = image::RgbaImage::from_pixel(640, 480, image::Rgba([255, 255, 255, 255]));
        let mut blank_bytes = Vec::new();
        image::DynamicImage::ImageRgba8(blank)
            .write_to(
                &mut Cursor::new(&mut blank_bytes),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        assert_eq!(
            persist_capture_at(root.path(), "prototype-suites", &blank_bytes).unwrap_err(),
            "packaged-e2e-capture-blank"
        );

        let scaffold = image::RgbaImage::from_fn(640, 480, |_x, y| {
            if y < 48 {
                image::Rgba([246, 248, 251, 255])
            } else {
                image::Rgba([255, 255, 255, 255])
            }
        });
        let mut scaffold_bytes = Vec::new();
        image::DynamicImage::ImageRgba8(scaffold)
            .write_to(
                &mut Cursor::new(&mut scaffold_bytes),
                image::ImageOutputFormat::Png,
            )
            .unwrap();
        assert_eq!(
            persist_capture_at(root.path(), "prototype-suites", &scaffold_bytes).unwrap_err(),
            "packaged-e2e-capture-blank"
        );
    }

    #[test]
    fn evidence_sink_rejects_tampering_sensitive_text_local_routes_and_bad_dimensions() {
        let remote_route = || PackagedE2eProviderRouteEvidence {
            purpose: "image".into(),
            kind: "openai".into(),
            model: "image-model".into(),
            classification: "remote".into(),
        };

        let tampered_root = tempfile::tempdir().unwrap();
        let mut tampered = upload_file(
            "designIr",
            None,
            None,
            br#"{"version":"design-ir.v1"}"#,
            None,
        );
        tampered.sha256 = "a".repeat(64);
        assert_eq!(
            persist_evidence_at(
                tampered_root.path(),
                PackagedE2eEvidenceUpload {
                    provider_routes: vec![remote_route()],
                    files: vec![tampered],
                },
            )
            .unwrap_err(),
            "packaged-e2e-evidence-invalid"
        );

        let sensitive_root = tempfile::tempdir().unwrap();
        let sensitive = upload_file(
            "designIr",
            None,
            None,
            br#"{"version":"design-ir.v1","path":"/Users/example/private"}"#,
            None,
        );
        assert_eq!(
            persist_evidence_at(
                sensitive_root.path(),
                PackagedE2eEvidenceUpload {
                    provider_routes: vec![remote_route()],
                    files: vec![sensitive],
                },
            )
            .unwrap_err(),
            "packaged-e2e-evidence-sensitive"
        );

        let local_root = tempfile::tempdir().unwrap();
        let design_ir = upload_file(
            "designIr",
            None,
            None,
            br#"{"version":"design-ir.v1"}"#,
            None,
        );
        assert_eq!(
            persist_evidence_at(
                local_root.path(),
                PackagedE2eEvidenceUpload {
                    provider_routes: vec![PackagedE2eProviderRouteEvidence {
                        purpose: "image".into(),
                        kind: "ollama".into(),
                        model: "local-image".into(),
                        classification: "local".into(),
                    }],
                    files: vec![design_ir],
                },
            )
            .unwrap_err(),
            "packaged-e2e-evidence-invalid"
        );

        let dimensions_root = tempfile::tempdir().unwrap();
        let image = evidence_png(32, 24, 7);
        let dimensions = upload_file(
            "designSystemMedia",
            Some("suite-1"),
            None,
            &image,
            Some(("image/png", 33, 24)),
        );
        assert_eq!(
            persist_evidence_at(
                dimensions_root.path(),
                PackagedE2eEvidenceUpload {
                    provider_routes: vec![remote_route()],
                    files: vec![dimensions],
                },
            )
            .unwrap_err(),
            "packaged-e2e-evidence-invalid"
        );
    }

    #[test]
    fn evidence_sink_rereads_every_content_addressed_object() {
        let root = tempfile::tempdir().unwrap();
        let bytes = br#"{"version":"design-ir.v1"}"#;
        let manifest = persist_evidence_at(
            root.path(),
            PackagedE2eEvidenceUpload {
                provider_routes: vec![PackagedE2eProviderRouteEvidence {
                    purpose: "image".into(),
                    kind: "openai".into(),
                    model: "image-model".into(),
                    classification: "remote".into(),
                }],
                files: vec![upload_file("designIr", None, None, bytes, None)],
            },
        )
        .unwrap();
        assert!(validate_evidence_files_at(root.path(), &manifest).is_ok());
        std::fs::write(root.path().join(&manifest.files[0].path), b"tampered").unwrap();
        assert!(validate_evidence_files_at(root.path(), &manifest).is_err());
    }

    #[test]
    fn rejects_duplicate_or_incomplete_route_graphs() {
        let mut duplicate = valid_result();
        let outcome = duplicate.outcome.as_mut().unwrap();
        let routes = outcome.prototype_suites[0].routes.clone();
        let route_graph = outcome.prototype_suites[0].route_graph.clone();
        let route_graph_digest = outcome.prototype_suites[0].digests.route_graph.clone();
        let suite = &mut outcome.prototype_suites[1];
        suite.routes = routes;
        suite.route_count = suite.routes.len() as u32;
        suite.page_count = suite.routes.len() as u32;
        suite.page_media.truncate(suite.routes.len());
        for (index, page) in suite.page_media.iter_mut().enumerate() {
            page.route = suite.routes[index].clone();
        }
        suite.route_graph = route_graph;
        suite.digests.route_graph = route_graph_digest;
        outcome.evidence = valid_evidence_manifest_fixture(&outcome.prototype_suites);
        assert!(validate(&duplicate).is_err());

        let mut incomplete = valid_result();
        incomplete.outcome.as_mut().unwrap().prototype_suites[2]
            .routes
            .clear();
        assert!(validate(&incomplete).is_err());
    }

    #[test]
    fn accepts_route_identical_suites_with_different_semantic_graphs() {
        let mut result = valid_result();
        let outcome = result.outcome.as_mut().unwrap();
        let routes = outcome.prototype_suites[0].routes.clone();
        let suite = &mut outcome.prototype_suites[1];
        suite.routes = routes;
        suite.route_count = suite.routes.len() as u32;
        suite.page_count = suite.routes.len() as u32;
        suite.page_media.truncate(suite.routes.len());
        for (index, page) in suite.page_media.iter_mut().enumerate() {
            page.route = suite.routes[index].clone();
        }
        suite.route_graph = valid_route_graph(&suite.routes, 99);
        suite.digests.route_graph = format!("{:x}", Sha256::digest(suite.route_graph.as_bytes()));
        outcome.evidence = valid_evidence_manifest_fixture(&outcome.prototype_suites);

        assert!(validate(&result).is_ok());
    }

    #[test]
    fn rejects_suites_without_one_to_one_design_system_bindings() {
        let mut duplicate = valid_result();
        duplicate.outcome.as_mut().unwrap().prototype_suites[2].design_system_id =
            "design-1".into();
        assert!(validate(&duplicate).is_err());
    }

    #[test]
    fn rejects_duplicate_resource_pack_identities_and_malformed_digests() {
        let mut duplicate = valid_result();
        duplicate.outcome.as_mut().unwrap().prototype_suites[2].resource_pack_id =
            "resource-pack-1".into();
        assert!(validate(&duplicate).is_err());

        for digest in ["A".repeat(64), "g".repeat(64), "a".repeat(63)] {
            let mut malformed = valid_result();
            malformed.outcome.as_mut().unwrap().prototype_suites[0]
                .digests
                .design_system_image = digest;
            assert!(validate(&malformed).is_err());
        }
    }

    #[test]
    fn rejects_unbounded_identity_slice_and_image_call_evidence() {
        let mut identity = valid_result();
        identity.outcome.as_mut().unwrap().design_systems[0].candidate_id =
            "candidate:generated-title".into();
        assert!(validate(&identity).is_err());

        let mut slices = valid_result();
        slices
            .outcome
            .as_mut()
            .unwrap()
            .selected_visible_slice_count = 47;
        assert!(validate(&slices).is_err());

        let mut selection = valid_result();
        selection.outcome.as_mut().unwrap().selected_suite_id = "suite-4".into();
        assert!(validate(&selection).is_err());

        let mut amplified = valid_result();
        amplified.outcome.as_mut().unwrap().image_call_count = 24;
        assert!(validate(&amplified).is_err());

        let mut missing_planning_turn = valid_result();
        missing_planning_turn
            .outcome
            .as_mut()
            .unwrap()
            .planning_turn_count = 1;
        assert!(validate(&missing_planning_turn).is_err());

        let mut mismatched_planning_provenance = valid_result();
        mismatched_planning_provenance
            .outcome
            .as_mut()
            .unwrap()
            .planning_runtime_counts
            .direct = 1;
        assert!(validate(&mismatched_planning_provenance).is_err());

        let mut false_plan = valid_result();
        false_plan
            .outcome
            .as_mut()
            .unwrap()
            .planned_image_call_count = 22;
        assert!(validate(&false_plan).is_err());
    }

    #[test]
    fn failed_result_may_omit_outcome_evidence() {
        let mut failed = valid_result();
        failed.status = "failed".into();
        failed.phases[0].status = "failed".into();
        failed.failure = Some(PackagedE2eFailure {
            phase: "resource-pack-ready".into(),
            code: "phase-rejected".into(),
            diagnostic: None,
            planner_progress: None,
        });
        failed.outcome = None;
        assert!(validate(&failed).is_ok());
    }

    #[test]
    fn failed_result_rejects_success_outcome_evidence() {
        let mut failed = valid_result();
        failed.status = "failed".into();
        failed.phases[0].status = "failed".into();
        failed.failure = Some(PackagedE2eFailure {
            phase: "resource-pack-ready".into(),
            code: "phase-rejected".into(),
            diagnostic: None,
            planner_progress: None,
        });

        assert!(validate(&failed).is_err());
    }

    #[test]
    fn terminal_write_closes_result_and_progress_with_identical_status_and_phases() {
        let root = tempfile::tempdir().unwrap();
        write_progress_at(
            root.path(),
            "running",
            &[PackagedE2ePhase {
                id: "bootstrap".into(),
                status: "passed".into(),
                elapsed_ms: Some(0),
            }],
        )
        .unwrap();

        let mut result = valid_result();
        result.phases = merge_phases(read_progress_at(root.path()).unwrap().phases, result.phases);
        install_capture_fixtures(root.path(), &mut result);
        write_terminal_result_at(root.path(), &result).unwrap();

        let result_value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.path().join("result.json")).unwrap())
                .unwrap();
        let progress_value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.path().join("progress.json")).unwrap())
                .unwrap();
        assert_eq!(result_value["status"], progress_value["status"]);
        assert_eq!(result_value["phases"], progress_value["phases"]);
        assert_eq!(progress_value["status"], "passed");
    }

    #[test]
    fn terminal_progress_is_not_reopened_by_late_checkpoints() {
        let root = tempfile::tempdir().unwrap();
        let mut result = valid_result();
        install_capture_fixtures(root.path(), &mut result);
        write_terminal_result_at(root.path(), &result).unwrap();
        write_checkpoint_at(
            root.path(),
            vec![PackagedE2ePhase {
                id: "late-webkit-callback".into(),
                status: "passed".into(),
                elapsed_ms: None,
            }],
        )
        .unwrap();
        let progress = read_progress_at(root.path()).unwrap();
        assert_eq!(progress.status, "passed");
        assert_ne!(progress.status, "running");
        assert!(!progress
            .phases
            .iter()
            .any(|phase| phase.id == "late-webkit-callback"));
    }

    #[test]
    fn failed_result_install_restores_or_removes_terminal_progress() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("result.json")).unwrap();
        write_progress_at(
            root.path(),
            "running",
            &[PackagedE2ePhase {
                id: "bootstrap".into(),
                status: "passed".into(),
                elapsed_ms: Some(0),
            }],
        )
        .unwrap();

        let mut result = valid_result();
        install_capture_fixtures(root.path(), &mut result);
        assert!(write_terminal_result_at(root.path(), &result).is_err());
        assert_eq!(read_progress_at(root.path()).unwrap().status, "running");

        std::fs::remove_file(root.path().join("progress.json")).unwrap();
        assert!(write_terminal_result_at(root.path(), &result).is_err());
        assert!(!root.path().join("progress.json").exists());
    }

    #[test]
    fn nested_outcome_fields_are_closed_to_generated_or_secret_bearing_data() {
        let mut value = serde_json::to_value(valid_result()).unwrap();
        value["outcome"]["designSystems"][0]["prompt"] =
            serde_json::Value::String("must-not-cross".into());
        assert!(serde_json::from_value::<PackagedE2eResult>(value).is_err());

        let mut stale_coding = serde_json::to_value(valid_result()).unwrap();
        stale_coding["outcome"]["coding"] = serde_json::json!({
            "status": "applied",
            "fileCount": 6,
            "assetCount": 55,
        });
        assert!(serde_json::from_value::<PackagedE2eResult>(stale_coding).is_err());
    }

    #[test]
    fn failure_diagnostic_is_closed_and_credential_free() {
        let mut failed = valid_result();
        failed.status = "failed".into();
        failed.phases[0].status = "failed".into();
        failed.outcome = None;
        failed.failure = Some(PackagedE2eFailure {
            phase: "resource-pack-ready".into(),
            code: "run-failed".into(),
            diagnostic: Some(PackagedE2eFailureDiagnostic::PlannerStructuredContract),
            planner_progress: Some(PackagedE2ePlannerProgress {
                stage: PackagedE2ePlannerStage::Page,
                completed_pages: 3,
                total_pages: 6,
            }),
        });
        let value = serde_json::to_value(&failed).unwrap();
        assert_eq!(
            value["failure"]["diagnostic"],
            serde_json::Value::String("planner-structured-contract".into())
        );
        assert_eq!(value["failure"]["plannerProgress"]["stage"], "page");
        assert_eq!(value["failure"]["plannerProgress"]["completedPages"], 3);
        assert!(validate(&failed).is_ok());

        for untrusted in [
            "provider-id:secret",
            "Bearer sk-secret",
            "https://example.test",
        ] {
            let mut value = serde_json::to_value(&failed).unwrap();
            value["failure"]["diagnostic"] = serde_json::Value::String(untrusted.into());
            assert!(serde_json::from_value::<PackagedE2eResult>(value).is_err());
        }

        let mut invalid_progress = serde_json::to_value(&failed).unwrap();
        invalid_progress["failure"]["plannerProgress"]["completedPages"] =
            serde_json::Value::from(7);
        let parsed = serde_json::from_value::<PackagedE2eResult>(invalid_progress).unwrap();
        assert!(validate(&parsed).is_err());
    }

    #[test]
    fn accepts_every_closed_delivery_failure_diagnostic() {
        for diagnostic in [
            "prototype-viewport",
            "board-decode",
            "board-composition",
            "board-zero-slices",
            "board-slot-assignment",
            "artifact-persistence",
            "planning-evidence-mismatch",
            "quality-review-required",
            "candidate-preparation-timeout",
            "candidate-approval-timeout",
            "candidate-provider-timeout",
            "candidate-post-processing-timeout",
        ] {
            let mut value = serde_json::to_value(valid_result()).unwrap();
            value["status"] = serde_json::Value::String("failed".into());
            value["phases"][0]["status"] = serde_json::Value::String("failed".into());
            value["failure"] = serde_json::json!({
                "phase": "resource-pack-ready",
                "code": "run-failed",
                "diagnostic": diagnostic,
            });
            value["outcome"] = serde_json::Value::Null;
            let parsed = serde_json::from_value::<PackagedE2eResult>(value).unwrap();
            assert!(validate(&parsed).is_ok(), "rejected {diagnostic}");
        }
    }

    #[test]
    fn phase_budget_covers_the_bounded_full_journey_evidence() {
        let phases = (0..160)
            .map(|index| PackagedE2ePhase {
                id: format!("journey-checkpoint-{index}"),
                status: "passed".into(),
                elapsed_ms: Some(index),
            })
            .collect::<Vec<_>>();
        assert!(validate_phases(&phases).is_ok());

        let over_budget = (0..=MAX_RESULT_PHASES)
            .map(|index| PackagedE2ePhase {
                id: format!("journey-checkpoint-{index}"),
                status: "passed".into(),
                elapsed_ms: Some(index as u64),
            })
            .collect::<Vec<_>>();
        assert!(validate_phases(&over_budget).is_err());

        let mut invalid_elapsed = phases;
        invalid_elapsed[0].elapsed_ms = Some(24 * 60 * 60 * 1_000 + 1);
        assert!(validate_phases(&invalid_elapsed).is_err());
    }

    #[test]
    fn merges_native_and_webview_phases_without_duplicate_ids() {
        let merged = merge_phases(
            vec![PackagedE2ePhase {
                id: "native-boot".into(),
                status: "passed".into(),
                elapsed_ms: Some(1),
            }],
            vec![
                PackagedE2ePhase {
                    id: "native-boot".into(),
                    status: "failed".into(),
                    elapsed_ms: None,
                },
                PackagedE2ePhase {
                    id: "webview-loaded".into(),
                    status: "passed".into(),
                    elapsed_ms: Some(3),
                },
            ],
        );
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].id, "native-boot");
        assert_eq!(merged[0].status, "failed");
        assert_eq!(merged[0].elapsed_ms, Some(1));
        assert_eq!(merged[1].id, "webview-loaded");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn uses_the_persistent_macos_evidence_root() {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/Users/Shared"));
        assert_eq!(
            result_root(),
            home.join("Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence")
        );
    }
}
