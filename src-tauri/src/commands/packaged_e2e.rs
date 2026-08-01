use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};

const RESULT_PROTOCOL: &str = "cutout.packaged-e2e-result.v1";
const MAX_RESULT_PHASES: usize = 128;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedE2eMode {
    enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2ePhase {
    id: String,
    status: String,
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
    ProviderTransport,
    ProviderOutput,
    BoardDecode,
    BoardComposition,
    BoardZeroSlices,
    BoardSlotAssignment,
    ArtifactPersistence,
    GenerationCandidate,
    OrchestrationState,
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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eOutcome {
    design_systems: Vec<PackagedE2eCandidateOutcome>,
    prototype_suites: Vec<PackagedE2eSuiteOutcome>,
    selected_suite_id: String,
    selected_visible_slice_count: u32,
    planned_image_call_count: u32,
    image_call_count: u32,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eCandidateOutcome {
    candidate_id: String,
    status: String,
}

#[derive(Debug, Deserialize, Serialize)]
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
    digests: PackagedE2eDeliveryDigests,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackagedE2eDeliveryDigests {
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

fn result_root() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/private/tmp/cutout-packaged-e2e")
    }
    #[cfg(not(target_os = "macos"))]
    {
        std::env::temp_dir().join("cutout-packaged-e2e")
    }
}

fn merge_phases(
    existing: Vec<PackagedE2ePhase>,
    incoming: Vec<PackagedE2ePhase>,
) -> Vec<PackagedE2ePhase> {
    let mut merged = existing;
    for phase in incoming {
        if let Some(current) = merged.iter_mut().find(|current| current.id == phase.id) {
            *current = phase;
        } else {
            merged.push(phase);
        }
    }
    merged
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
        &merge_phases(
            progress.map(|value| value.phases).unwrap_or_default(),
            phases,
        ),
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
        ("passed", None, Some(outcome))
            if result
                .phases
                .iter()
                .any(|phase| phase.id == "resource-pack-ready" && phase.status == "passed") =>
        {
            validate_outcome(outcome)
        }
        ("failed", Some(failure), outcome)
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
            outcome.as_ref().map_or(Ok(()), validate_outcome)
        }
        _ => Err("packaged-e2e-result-invalid".into()),
    }
}

fn validate_outcome(outcome: &PackagedE2eOutcome) -> Result<(), String> {
    if outcome.design_systems.len() != 3 || outcome.prototype_suites.len() != 3 {
        return Err("packaged-e2e-outcome-invalid".into());
    }

    let mut design_ids = HashSet::new();
    for candidate in &outcome.design_systems {
        if candidate.status != "ready"
            || !is_opaque_candidate_id(&candidate.candidate_id, "design")
            || !design_ids.insert(candidate.candidate_id.as_str())
        {
            return Err("packaged-e2e-outcome-invalid".into());
        }
    }

    let mut suite_ids = HashSet::new();
    let mut bound_design_ids = HashSet::new();
    let mut resource_pack_ids = HashSet::new();
    let mut route_graphs = HashSet::new();
    for suite in &outcome.prototype_suites {
        if suite.status != "ready"
            || !is_opaque_candidate_id(&suite.candidate_id, "suite")
            || !is_opaque_candidate_id(&suite.design_system_id, "design")
            || !is_opaque_resource_pack_id(&suite.resource_pack_id)
            || !suite_ids.insert(suite.candidate_id.as_str())
            || !design_ids.contains(suite.design_system_id.as_str())
            || !bound_design_ids.insert(suite.design_system_id.as_str())
            || !resource_pack_ids.insert(suite.resource_pack_id.as_str())
            || !(1..=12).contains(&suite.routes.len())
            || !(1..=4096).contains(&suite.resource_asset_count)
            || suite.route_count as usize != suite.routes.len()
            || suite.page_count as usize != suite.routes.len()
            || suite.artifact_count != suite.resource_asset_count
            || suite.quality_review_status != "recorded"
            || !valid_delivery_digests(&suite.digests)
        {
            return Err("packaged-e2e-outcome-invalid".into());
        }
        let mut routes = HashSet::new();
        for route in &suite.routes {
            if !is_bounded_route(route) || !routes.insert(route.as_str()) {
                return Err("packaged-e2e-outcome-invalid".into());
            }
        }
        let graph =
            serde_json::to_string(&suite.routes).map_err(|_| "packaged-e2e-outcome-invalid")?;
        if !route_graphs.insert(graph) {
            return Err("packaged-e2e-outcome-invalid".into());
        }
    }

    let selected_resource_asset_count = outcome
        .prototype_suites
        .iter()
        .find(|suite| suite.candidate_id == outcome.selected_suite_id)
        .map(|suite| suite.resource_asset_count);
    if bound_design_ids.len() != 3
        || selected_resource_asset_count.is_none()
        || selected_resource_asset_count != Some(outcome.selected_visible_slice_count)
        || !(1..=4096).contains(&outcome.planned_image_call_count)
        || outcome.image_call_count != outcome.planned_image_call_count
    {
        return Err("packaged-e2e-outcome-invalid".into());
    }
    Ok(())
}

fn is_opaque_candidate_id(value: &str, prefix: &str) -> bool {
    value
        .strip_prefix(prefix)
        .and_then(|suffix| suffix.strip_prefix('-'))
        .is_some_and(|ordinal| matches!(ordinal, "1" | "2" | "3"))
}

fn is_opaque_resource_pack_id(value: &str) -> bool {
    matches!(
        value,
        "resource-pack-1" | "resource-pack-2" | "resource-pack-3"
    )
}

fn valid_delivery_digests(digests: &PackagedE2eDeliveryDigests) -> bool {
    [
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
    ]
    .into_iter()
    .all(|value| {
        value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    })
}

fn is_bounded_route(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.starts_with('/')
        && !value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
}

#[tauri::command]
pub async fn packaged_e2e_mode() -> PackagedE2eMode {
    PackagedE2eMode { enabled: enabled() }
}

#[tauri::command]
pub async fn packaged_e2e_tick() -> Result<(), String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
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
pub async fn packaged_e2e_complete(mut result: PackagedE2eResult) -> Result<(), String> {
    if !enabled() {
        return Err("packaged-e2e-disabled".into());
    }
    let _guard = progress_lock()
        .lock()
        .map_err(|_| "packaged-e2e-write-failed")?;
    result.phases = merge_phases(
        read_progress()
            .map(|value| value.phases)
            .unwrap_or_default(),
        result.phases,
    );
    validate(&result)?;
    write_terminal_result_at(&result_root(), &result)
}

fn write_terminal_result_at(root: &Path, result: &PackagedE2eResult) -> Result<(), String> {
    validate(result)?;
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

    fn valid_digests() -> PackagedE2eDeliveryDigests {
        let digest = "a".repeat(64);
        PackagedE2eDeliveryDigests {
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
            review_document: digest,
        }
    }

    fn valid_outcome() -> PackagedE2eOutcome {
        PackagedE2eOutcome {
            design_systems: (1..=3)
                .map(|index| PackagedE2eCandidateOutcome {
                    candidate_id: format!("design-{index}"),
                    status: "ready".into(),
                })
                .collect(),
            prototype_suites: [(4_u32, 7_u32), (5, 11), (7, 19)]
                .into_iter()
                .enumerate()
                .map(
                    |(suite_index, (route_count, resource_count))| PackagedE2eSuiteOutcome {
                        candidate_id: format!("suite-{}", suite_index + 1),
                        design_system_id: format!("design-{}", suite_index + 1),
                        resource_pack_id: format!("resource-pack-{}", suite_index + 1),
                        status: "ready".into(),
                        routes: (1..=route_count)
                            .map(|route| format!("/suite-{}/route-{route}", suite_index + 1))
                            .collect(),
                        route_count,
                        page_count: route_count,
                        resource_asset_count: resource_count,
                        artifact_count: resource_count,
                        quality_review_status: "recorded".into(),
                        digests: valid_digests(),
                    },
                )
                .collect(),
            selected_suite_id: "suite-2".into(),
            selected_visible_slice_count: 11,
            planned_image_call_count: 23,
            image_call_count: 23,
        }
    }

    fn valid_result() -> PackagedE2eResult {
        PackagedE2eResult {
            protocol: RESULT_PROTOCOL.into(),
            status: "passed".into(),
            phases: vec![PackagedE2ePhase {
                id: "resource-pack-ready".into(),
                status: "passed".into(),
            }],
            failure: None,
            outcome: Some(valid_outcome()),
            completed_at: 1,
        }
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

        let mut suite_assets = valid_result();
        suite_assets.outcome.as_mut().unwrap().prototype_suites[0].resource_asset_count = 0;
        assert!(validate(&suite_assets).is_err());
    }

    #[test]
    fn rejects_duplicate_or_incomplete_route_graphs() {
        let mut duplicate = valid_result();
        let routes = duplicate.outcome.as_ref().unwrap().prototype_suites[0]
            .routes
            .clone();
        duplicate.outcome.as_mut().unwrap().prototype_suites[1].routes = routes;
        assert!(validate(&duplicate).is_err());

        let mut incomplete = valid_result();
        incomplete.outcome.as_mut().unwrap().prototype_suites[2]
            .routes
            .clear();
        assert!(validate(&incomplete).is_err());
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
    fn terminal_write_closes_result_and_progress_with_identical_status_and_phases() {
        let root = std::env::temp_dir().join(format!(
            "cutout-packaged-e2e-terminal-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("test"),
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        write_progress_at(
            &root,
            "running",
            &[PackagedE2ePhase {
                id: "bootstrap".into(),
                status: "passed".into(),
            }],
        )
        .unwrap();

        let mut result = valid_result();
        result.phases = merge_phases(read_progress_at(&root).unwrap().phases, result.phases);
        write_terminal_result_at(&root, &result).unwrap();

        let result_value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("result.json")).unwrap()).unwrap();
        let progress_value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("progress.json")).unwrap()).unwrap();
        assert_eq!(result_value["status"], progress_value["status"]);
        assert_eq!(result_value["phases"], progress_value["phases"]);
        assert_eq!(progress_value["status"], "passed");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn terminal_progress_is_not_reopened_by_late_checkpoints() {
        let root = std::env::temp_dir()
            .join(format!("cutout-packaged-e2e-sticky-{}", std::process::id(),));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let result = valid_result();
        write_terminal_result_at(&root, &result).unwrap();
        write_checkpoint_at(
            &root,
            vec![PackagedE2ePhase {
                id: "late-webkit-callback".into(),
                status: "passed".into(),
            }],
        )
        .unwrap();
        let progress = read_progress_at(&root).unwrap();
        assert_eq!(progress.status, "passed");
        assert_ne!(progress.status, "running");
        assert!(!progress
            .phases
            .iter()
            .any(|phase| phase.id == "late-webkit-callback"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn failed_result_install_restores_or_removes_terminal_progress() {
        let root = std::env::temp_dir().join(format!(
            "cutout-packaged-e2e-terminal-rollback-{}-{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("test"),
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("result.json")).unwrap();
        write_progress_at(
            &root,
            "running",
            &[PackagedE2ePhase {
                id: "bootstrap".into(),
                status: "passed".into(),
            }],
        )
        .unwrap();

        assert!(write_terminal_result_at(&root, &valid_result()).is_err());
        assert_eq!(read_progress_at(&root).unwrap().status, "running");

        std::fs::remove_file(root.join("progress.json")).unwrap();
        assert!(write_terminal_result_at(&root, &valid_result()).is_err());
        assert!(!root.join("progress.json").exists());
        let _ = std::fs::remove_dir_all(root);
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
    fn accepts_every_closed_board_failure_diagnostic() {
        for diagnostic in [
            "board-decode",
            "board-composition",
            "board-zero-slices",
            "board-slot-assignment",
            "artifact-persistence",
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
        let phases = (0..65)
            .map(|index| PackagedE2ePhase {
                id: format!("journey-checkpoint-{index}"),
                status: "passed".into(),
            })
            .collect::<Vec<_>>();
        assert!(validate_phases(&phases).is_ok());

        let over_budget = (0..=MAX_RESULT_PHASES)
            .map(|index| PackagedE2ePhase {
                id: format!("journey-checkpoint-{index}"),
                status: "passed".into(),
            })
            .collect::<Vec<_>>();
        assert!(validate_phases(&over_budget).is_err());
    }

    #[test]
    fn merges_native_and_webview_phases_without_duplicate_ids() {
        let merged = merge_phases(
            vec![PackagedE2ePhase {
                id: "native-boot".into(),
                status: "passed".into(),
            }],
            vec![
                PackagedE2ePhase {
                    id: "native-boot".into(),
                    status: "failed".into(),
                },
                PackagedE2ePhase {
                    id: "webview-loaded".into(),
                    status: "passed".into(),
                },
            ],
        );
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].id, "native-boot");
        assert_eq!(merged[0].status, "failed");
        assert_eq!(merged[1].id, "webview-loaded");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn uses_the_fixed_macos_evidence_root() {
        assert_eq!(
            result_root(),
            PathBuf::from("/private/tmp/cutout-packaged-e2e")
        );
    }
}
