use super::registry_desktop::{authorize_host_root, authorized, RegistryDesktopState};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
    process::Stdio,
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tokio::process::Command;

const MAX_READ_FILES: usize = 2_000;
const MAX_READ_BYTES: u64 = 2_000_000;
const MAX_SNAPSHOT_FILES: usize = 20_000;
const MAX_SNAPSHOT_BYTES: u64 = 128 * 1024 * 1024;
const MAX_STAGE_FILES: usize = 100_000;
const MAX_STAGE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_DEPTH: usize = 64;
const MAX_MANAGED_ASSETS: usize = 1_000;
const MAX_MANAGED_ASSET_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Default)]
pub struct CodingWorkspaceState {
    stages: Mutex<HashMap<String, CodingStage>>,
    promotion: Mutex<()>,
    managed: Mutex<HashSet<String>>,
}

impl Drop for CodingWorkspaceState {
    fn drop(&mut self) {
        if let Ok(stages) = self.stages.get_mut() {
            for stage in stages.values() {
                let _ = fs::remove_dir_all(&stage.root);
            }
        }
    }
}

#[derive(Clone)]
struct CodingStage {
    workspace_handle: String,
    source_root: PathBuf,
    root: PathBuf,
    patch_sha256: String,
    allowed_paths: Vec<String>,
    allowed_commands: Vec<CodingCheck>,
    package_manager: PackageManager,
    max_duration_ms: u64,
    checks_passed: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingTask {
    constraints: CodingConstraints,
    target: CodingTarget,
    budget: CodingBudget,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodingConstraints {
    allowed_paths: Vec<String>,
    allowed_commands: Vec<CodingCheck>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodingTarget {
    package_manager: PackageManager,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodingBudget {
    max_changed_files: usize,
    max_bytes: u64,
    max_duration_ms: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CodingCheck {
    Typecheck,
    Test,
    Build,
    Lint,
    VisualTest,
}

impl CodingCheck {
    fn name(self) -> &'static str {
        match self {
            Self::Typecheck => "typecheck",
            Self::Test => "test",
            Self::Build => "build",
            Self::Lint => "lint",
            Self::VisualTest => "visual-test",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum PackageManager {
    Pnpm,
    Npm,
    Yarn,
    Bun,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingPatch {
    files: Vec<CodingFilePatch>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodingFilePatch {
    path: String,
    operation: CodingFileOperation,
    contents: Option<String>,
    previous_sha256: Option<String>,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum CodingFileOperation {
    Create,
    Replace,
    Delete,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingChangedFile {
    path: String,
    operation: CodingFileOperation,
    #[serde(skip_serializing_if = "Option::is_none")]
    sha256: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingStageResult {
    id: String,
    changed_files: Vec<CodingChangedFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingPromotionResult {
    snapshot_id: String,
    changed_files: Vec<CodingChangedFile>,
    approval_id: String,
}

#[derive(Serialize)]
pub struct CodingSnapshot {
    #[serde(rename = "snapshotId")]
    snapshot_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCodingWorkspace {
    handle: String,
    label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedCodingAsset {
    id: String,
    media_type: String,
    bytes: Vec<u8>,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCodingAssetReceipt {
    id: String,
    path: String,
    sha256: String,
    byte_length: usize,
}

#[tauri::command]
pub async fn coding_workspace_create_managed(
    app: AppHandle,
    registry: State<'_, RegistryDesktopState>,
    coding: State<'_, CodingWorkspaceState>,
) -> Result<ManagedCodingWorkspace, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let root = if super::packaged_e2e::enabled() {
        PathBuf::from("/private/tmp/cutout-packaged-e2e")
            .join("coding-output")
            .join(&id)
    } else {
        app.path()
            .app_data_dir()
            .map_err(|_| "Managed coding workspace root is unavailable.".to_string())?
            .join("coding-workspaces")
            .join(&id)
    };
    for directory in ["site/pages", "site/styles", "site/assets"] {
        fs::create_dir_all(root.join(directory))
            .map_err(|error| format!("Could not create managed coding workspace: {error}"))?;
    }
    let canonical = fs::canonicalize(&root)
        .map_err(|error| format!("Could not resolve managed coding workspace: {error}"))?;
    let (handle, _) = authorize_host_root(&registry, canonical).await?;
    coding
        .managed
        .lock()
        .map_err(|_| "Managed coding workspace registry is unavailable.".to_string())?
        .insert(handle.clone());
    Ok(ManagedCodingWorkspace {
        handle,
        label: "Managed coding workspace".into(),
    })
}

#[tauri::command]
pub async fn coding_workspace_seed_managed_assets(
    registry: State<'_, RegistryDesktopState>,
    coding: State<'_, CodingWorkspaceState>,
    workspace_handle: String,
    assets: Vec<ManagedCodingAsset>,
) -> Result<Vec<ManagedCodingAssetReceipt>, String> {
    if assets.is_empty() || assets.len() > MAX_MANAGED_ASSETS {
        return Err("Managed coding asset count is outside its budget.".into());
    }
    if !coding
        .managed
        .lock()
        .map_err(|_| "Managed coding workspace registry is unavailable.".to_string())?
        .contains(&workspace_handle)
    {
        return Err(
            "policy-denied: Asset seeding requires a host-managed coding workspace.".into(),
        );
    }
    let total = assets.iter().fold(0_u64, |sum, asset| {
        sum.saturating_add(asset.bytes.len() as u64)
    });
    if total > MAX_MANAGED_ASSET_BYTES {
        return Err("budget-exceeded: Managed coding assets exceed the byte budget.".into());
    }
    let root = authorized(&registry, &workspace_handle)?;
    let asset_root = root.join("site/assets");
    let mut receipts = Vec::with_capacity(assets.len());
    for asset in assets {
        if asset.id.is_empty()
            || asset.id.len() > 160
            || !asset.id.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':')
            })
        {
            return Err("Managed coding asset id is invalid.".into());
        }
        let actual = hash(&asset.bytes);
        if actual != asset.sha256.to_ascii_lowercase() {
            return Err("Managed coding asset SHA-256 does not match its bytes.".into());
        }
        let extension = match asset.media_type.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => return Err("Managed coding asset media type is unsupported.".into()),
        };
        let filename = format!("{actual}.{extension}");
        let target = asset_root.join(&filename);
        if target.exists() {
            if hash(&fs::read(&target).map_err(|error| error.to_string())?) != actual {
                return Err("Stored managed coding asset does not match its address.".into());
            }
        } else {
            let temporary = asset_root.join(format!(".{actual}.{}.tmp", uuid::Uuid::new_v4()));
            fs::write(&temporary, &asset.bytes).map_err(|error| error.to_string())?;
            fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
        }
        receipts.push(ManagedCodingAssetReceipt {
            id: asset.id,
            path: format!("site/assets/{filename}"),
            sha256: actual,
            byte_length: asset.bytes.len(),
        });
    }
    Ok(receipts)
}

#[derive(Serialize)]
pub struct CodingCheckResult {
    name: String,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[tauri::command]
pub async fn coding_workspace_snapshot(
    registry: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    paths: Vec<String>,
) -> Result<CodingSnapshot, String> {
    let root = authorized(&registry, &workspace_handle)?;
    Ok(CodingSnapshot {
        snapshot_id: snapshot_id(&root, &paths)?,
    })
}

#[tauri::command]
pub async fn coding_workspace_read_allowed(
    registry: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    paths: Vec<String>,
) -> Result<BTreeMap<String, String>, String> {
    let root = authorized(&registry, &workspace_handle)?;
    read_allowed(&root, &paths)
}

#[tauri::command]
pub async fn coding_workspace_preview(
    registry: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    task: CodingTask,
    patch: CodingPatch,
) -> Result<Vec<CodingChangedFile>, String> {
    let root = authorized(&registry, &workspace_handle)?;
    validate_task_patch(&task, &patch)?;
    inspect_patch(&root, &task, &patch)
}

#[tauri::command]
pub async fn coding_workspace_stage(
    registry: State<'_, RegistryDesktopState>,
    stages: State<'_, CodingWorkspaceState>,
    workspace_handle: String,
    task: CodingTask,
    patch: CodingPatch,
) -> Result<CodingStageResult, String> {
    let root = authorized(&registry, &workspace_handle)?;
    validate_task_patch(&task, &patch)?;
    inspect_patch(&root, &task, &patch)?;
    let stage_root =
        std::env::temp_dir().join(format!("cutout-coding-stage-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&stage_root)
        .map_err(|error| format!("Could not create coding stage: {error}"))?;
    let staged = (|| -> Result<Vec<CodingChangedFile>, String> {
        let mut bounds = TreeBounds::new(MAX_STAGE_FILES, MAX_STAGE_BYTES);
        clone_tree(&root, &stage_root, 0, &mut bounds)?;
        apply_patch_transaction(&stage_root, &task, &patch)
    })();
    let changed_files = match staged {
        Ok(changed_files) => changed_files,
        Err(error) => {
            let _ = fs::remove_dir_all(&stage_root);
            return Err(error);
        }
    };
    let id = uuid::Uuid::new_v4().to_string();
    let checks_passed = task.constraints.allowed_commands.is_empty();
    stages
        .stages
        .lock()
        .map_err(|_| "Coding stage registry is unavailable.".to_string())?
        .insert(
            id.clone(),
            CodingStage {
                workspace_handle,
                source_root: root,
                root: stage_root,
                patch_sha256: patch_sha256(&patch)?,
                allowed_paths: task.constraints.allowed_paths,
                allowed_commands: task.constraints.allowed_commands,
                package_manager: task.target.package_manager,
                max_duration_ms: task.budget.max_duration_ms,
                checks_passed,
            },
        );
    Ok(CodingStageResult { id, changed_files })
}

#[tauri::command]
pub async fn coding_workspace_run_checks(
    registry: State<'_, RegistryDesktopState>,
    stages: State<'_, CodingWorkspaceState>,
    workspace_handle: String,
    stage_id: String,
    commands: Vec<CodingCheck>,
    max_duration_ms: u64,
) -> Result<Vec<CodingCheckResult>, String> {
    let stage = stage(&stages, &workspace_handle, &stage_id)?;
    if authorized(&registry, &workspace_handle)? != stage.source_root {
        return Err("The authorized coding workspace identity changed.".into());
    }
    if max_duration_ms == 0 || max_duration_ms > stage.max_duration_ms {
        return Err("Coding check duration exceeds the staged task budget.".into());
    }
    if commands != stage.allowed_commands {
        return Err("Coding checks must exactly match the staged task allowlist.".into());
    }
    let started = tokio::time::Instant::now();
    let budget = Duration::from_millis(max_duration_ms);
    let mut results = Vec::with_capacity(commands.len());
    for command in commands {
        let Some(remaining) = budget.checked_sub(started.elapsed()) else {
            results.push(CodingCheckResult {
                name: command.name().into(),
                status: "failed",
                detail: Some("Controlled check exceeded the task time budget.".into()),
            });
            break;
        };
        results.push(run_check(&stage, command, remaining).await?);
    }
    if results.iter().all(|result| result.status == "passed") {
        let mut stages = stages
            .stages
            .lock()
            .map_err(|_| "Coding stage registry is unavailable.".to_string())?;
        let current = stages
            .get_mut(&stage_id)
            .ok_or("revision-conflict: Unknown or expired coding stage.")?;
        if current.workspace_handle != workspace_handle
            || current.patch_sha256 != stage.patch_sha256
        {
            return Err("revision-conflict: Coding stage changed while checks ran.".into());
        }
        current.checks_passed = true;
    }
    Ok(results)
}

#[tauri::command]
pub async fn coding_workspace_promote(
    app: AppHandle,
    registry: State<'_, RegistryDesktopState>,
    stages: State<'_, CodingWorkspaceState>,
    workspace_handle: String,
    task: CodingTask,
    patch: CodingPatch,
    stage_id: String,
    expected_snapshot_id: String,
) -> Result<CodingPromotionResult, String> {
    let root = authorized(&registry, &workspace_handle)?;
    let reviewed_stage = stage(&stages, &workspace_handle, &stage_id)?;
    validate_task_patch(&task, &patch)?;
    if patch_sha256(&patch)? != reviewed_stage.patch_sha256
        || task.constraints.allowed_paths != reviewed_stage.allowed_paths
    {
        return Err("revision-conflict: Coding stage does not match the reviewed patch.".into());
    }
    if !reviewed_stage.checks_passed {
        return Err("policy-denied: Staged coding checks have not passed.".into());
    }
    if snapshot_id(&root, &task.constraints.allowed_paths)? != expected_snapshot_id {
        return Err("revision-conflict: Repository changed before staged promotion.".into());
    }
    let approval_id = if super::packaged_e2e::enabled() {
        // The fixed harness cannot display a native modal without activating
        // the app. Native code issues this one-operation approval only after
        // the reviewed stage, patch digest, and snapshot all match.
        super::packaged_e2e::native_checkpoint("coding-native-approved");
        format!("native-e2e-approval.{}", uuid::Uuid::new_v4())
    } else {
        crate::commands::native_approval::require_native_confirmation(
            &app,
            "Approve Coding output",
            &format!(
                "Apply {} reviewed Coding file change(s) to the managed workspace?",
                patch.files.len()
            ),
        )
        .await?
    };
    let _promotion = stages
        .promotion
        .lock()
        .map_err(|_| "Coding promotion lock is unavailable.".to_string())?;
    let root = authorized(&registry, &workspace_handle)?;
    let current_stage = stage(&stages, &workspace_handle, &stage_id)?;
    validate_task_patch(&task, &patch)?;
    if patch_sha256(&patch)? != current_stage.patch_sha256
        || task.constraints.allowed_paths != current_stage.allowed_paths
    {
        return Err("revision-conflict: Coding stage changed during approval.".into());
    }
    if !current_stage.checks_passed {
        return Err("policy-denied: Staged coding checks changed during approval.".into());
    }
    if snapshot_id(&root, &task.constraints.allowed_paths)? != expected_snapshot_id {
        return Err("revision-conflict: Repository changed during coding approval.".into());
    }
    let changed_files = apply_patch_transaction(&root, &task, &patch)?;
    let result = CodingPromotionResult {
        snapshot_id: snapshot_id(&root, &task.constraints.allowed_paths)?,
        changed_files,
        approval_id,
    };
    let consumed = stages
        .stages
        .lock()
        .map_err(|_| "Coding stage registry is unavailable.".to_string())?
        .remove(&stage_id)
        .ok_or("revision-conflict: Coding stage was already consumed.")?;
    let _ = fs::remove_dir_all(consumed.root);
    Ok(result)
}

#[tauri::command]
pub async fn coding_workspace_rollback(
    stages: State<'_, CodingWorkspaceState>,
    workspace_handle: String,
    stage_id: String,
) -> Result<(), String> {
    let stage = stages
        .stages
        .lock()
        .map_err(|_| "Coding stage registry is unavailable.".to_string())?
        .remove(&stage_id);
    if let Some(stage) = stage {
        if stage.workspace_handle != workspace_handle {
            stages
                .stages
                .lock()
                .map_err(|_| "Coding stage registry is unavailable.".to_string())?
                .insert(stage_id, stage);
            return Err("Coding stage belongs to another authorized workspace.".into());
        }
        fs::remove_dir_all(stage.root)
            .map_err(|error| format!("Could not remove coding stage: {error}"))?;
    }
    Ok(())
}

fn stage(
    stages: &CodingWorkspaceState,
    workspace_handle: &str,
    stage_id: &str,
) -> Result<CodingStage, String> {
    let stage = stages
        .stages
        .lock()
        .map_err(|_| "Coding stage registry is unavailable.".to_string())?
        .get(stage_id)
        .cloned()
        .ok_or("revision-conflict: Unknown or expired coding stage.")?;
    if stage.workspace_handle != workspace_handle {
        return Err("Coding stage belongs to another authorized workspace.".into());
    }
    Ok(stage)
}

async fn run_check(
    stage: &CodingStage,
    check: CodingCheck,
    timeout: Duration,
) -> Result<CodingCheckResult, String> {
    #[cfg(not(unix))]
    {
        let _ = (stage, check, timeout);
        return Err(
            "capability-required: Controlled check process-tree custody is unavailable on this platform."
                .into(),
        );
    }
    #[cfg(unix)]
    {
        let (program, args) = check_command(stage.package_manager, check);
        let mut command = Command::new(program);
        command
            .args(args)
            .current_dir(&stage.root)
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .env("CI", "true")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        unsafe {
            command.as_std_mut().pre_exec(|| {
                if libc::setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
        let mut child = command.spawn().map_err(|error| {
            format!("Could not start controlled {} check: {error}", check.name())
        })?;
        let status = match tokio::time::timeout(timeout, child.wait()).await {
            Ok(result) => {
                result.map_err(|error| format!("Controlled check failed to run: {error}"))?
            }
            Err(_) => {
                if let Some(process_id) = child.id() {
                    unsafe {
                        libc::kill(-(process_id as i32), libc::SIGKILL);
                    }
                }
                let _ = child.wait().await;
                return Ok(CodingCheckResult {
                    name: check.name().into(),
                    status: "failed",
                    detail: Some("Controlled check exceeded the task time budget.".into()),
                });
            }
        };
        Ok(CodingCheckResult {
            name: check.name().into(),
            status: if status.success() { "passed" } else { "failed" },
            detail: if status.success() {
                None
            } else {
                Some(format!(
                    "Controlled check exited with status {}.",
                    status
                        .code()
                        .map_or_else(|| "signal".into(), |code| code.to_string())
                ))
            },
        })
    }
}

fn check_command(manager: PackageManager, check: CodingCheck) -> (&'static str, Vec<&'static str>) {
    match (manager, check) {
        (PackageManager::Pnpm, CodingCheck::Typecheck) => {
            ("pnpm", vec!["exec", "tsc", "-b", "--pretty", "false"])
        }
        (PackageManager::Pnpm, CodingCheck::Test) => ("pnpm", vec!["exec", "vitest", "run"]),
        (PackageManager::Pnpm, CodingCheck::Build) => ("pnpm", vec!["run", "build"]),
        (PackageManager::Pnpm, CodingCheck::Lint) => ("pnpm", vec!["run", "lint"]),
        (PackageManager::Pnpm, CodingCheck::VisualTest) => {
            ("pnpm", vec!["exec", "playwright", "test"])
        }
        (PackageManager::Npm, CodingCheck::Typecheck) => {
            ("npm", vec!["exec", "--", "tsc", "-b", "--pretty", "false"])
        }
        (PackageManager::Npm, CodingCheck::Test) => ("npm", vec!["exec", "--", "vitest", "run"]),
        (PackageManager::Npm, CodingCheck::Build) => ("npm", vec!["run", "build"]),
        (PackageManager::Npm, CodingCheck::Lint) => ("npm", vec!["run", "lint"]),
        (PackageManager::Npm, CodingCheck::VisualTest) => {
            ("npm", vec!["exec", "--", "playwright", "test"])
        }
        (PackageManager::Yarn, CodingCheck::Typecheck) => {
            ("yarn", vec!["exec", "tsc", "-b", "--pretty", "false"])
        }
        (PackageManager::Yarn, CodingCheck::Test) => ("yarn", vec!["exec", "vitest", "run"]),
        (PackageManager::Yarn, CodingCheck::Build) => ("yarn", vec!["run", "build"]),
        (PackageManager::Yarn, CodingCheck::Lint) => ("yarn", vec!["run", "lint"]),
        (PackageManager::Yarn, CodingCheck::VisualTest) => {
            ("yarn", vec!["exec", "playwright", "test"])
        }
        (PackageManager::Bun, CodingCheck::Typecheck) => {
            ("bun", vec!["x", "tsc", "-b", "--pretty", "false"])
        }
        (PackageManager::Bun, CodingCheck::Test) => ("bun", vec!["x", "vitest", "run"]),
        (PackageManager::Bun, CodingCheck::Build) => ("bun", vec!["run", "build"]),
        (PackageManager::Bun, CodingCheck::Lint) => ("bun", vec!["run", "lint"]),
        (PackageManager::Bun, CodingCheck::VisualTest) => ("bun", vec!["x", "playwright", "test"]),
    }
}

fn validate_task_patch(task: &CodingTask, patch: &CodingPatch) -> Result<(), String> {
    if task.constraints.allowed_paths.is_empty() || task.constraints.allowed_paths.len() > 100 {
        return Err("CodingTask has an invalid controlled path count.".into());
    }
    for path in &task.constraints.allowed_paths {
        validate_relative_path(path)?;
    }
    if patch.files.is_empty()
        || patch.files.len() > task.budget.max_changed_files
        || patch.files.len() > 2_000
    {
        return Err("budget-exceeded: Coding patch changes too many files.".into());
    }
    let bytes = patch.files.iter().try_fold(0_u64, |total, file| {
        validate_relative_path(&file.path)?;
        if file.contents.as_ref().is_some_and(|contents| {
            crate::commands::scan_repository::credential_content(contents.as_bytes())
        }) {
            return Err("policy-denied: Coding patch contains credential-shaped data.".into());
        }
        let next = total.saturating_add(file.contents.as_deref().unwrap_or_default().len() as u64);
        Ok::<u64, String>(next)
    })?;
    if bytes > task.budget.max_bytes {
        return Err("budget-exceeded: Coding patch exceeds the byte budget.".into());
    }
    Ok(())
}

fn inspect_patch(
    root: &Path,
    task: &CodingTask,
    patch: &CodingPatch,
) -> Result<Vec<CodingChangedFile>, String> {
    patch
        .files
        .iter()
        .map(|file| inspect_file_patch(root, task, file))
        .collect()
}

fn inspect_file_patch(
    root: &Path,
    task: &CodingTask,
    patch: &CodingFilePatch,
) -> Result<CodingChangedFile, String> {
    if !task
        .constraints
        .allowed_paths
        .iter()
        .any(|allowed| within_allowed(&patch.path, allowed))
    {
        return Err(format!(
            "policy-denied: Patch target is outside allowed paths: {}",
            patch.path
        ));
    }
    let target = safe_path(root, &patch.path, false)?;
    let exists = target.exists();
    if patch.operation == CodingFileOperation::Create && exists {
        return Err(format!(
            "revision-conflict: Create target already exists: {}",
            patch.path
        ));
    }
    if matches!(
        patch.operation,
        CodingFileOperation::Replace | CodingFileOperation::Delete
    ) && !exists
    {
        return Err(format!(
            "revision-conflict: Patch target does not exist: {}",
            patch.path
        ));
    }
    if patch.operation == CodingFileOperation::Delete && patch.contents.is_some() {
        return Err("Delete coding patches cannot include contents.".into());
    }
    if patch.operation != CodingFileOperation::Delete && patch.contents.is_none() {
        return Err("Coding patch file contents are required.".into());
    }
    if exists {
        let metadata = fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!(
                "policy-denied: Patch target is not a regular file: {}",
                patch.path
            ));
        }
        if let Some(expected) = &patch.previous_sha256 {
            if &hash(&fs::read(&target).map_err(|error| error.to_string())?) != expected {
                return Err(format!(
                    "revision-conflict: Previous file hash changed: {}",
                    patch.path
                ));
            }
        }
    }
    Ok(CodingChangedFile {
        path: patch.path.clone(),
        operation: patch.operation,
        sha256: patch
            .contents
            .as_ref()
            .map(|contents| hash(contents.as_bytes())),
    })
}

fn apply_patch_transaction(
    root: &Path,
    task: &CodingTask,
    patch: &CodingPatch,
) -> Result<Vec<CodingChangedFile>, String> {
    inspect_patch(root, task, patch)?;
    let transaction = root.join(format!(".cutout-coding-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&transaction)
        .map_err(|error| format!("Could not create coding transaction: {error}"))?;
    let mut touched: Vec<(PathBuf, Option<PathBuf>)> = Vec::new();
    let result = (|| -> Result<Vec<CodingChangedFile>, String> {
        for (index, file) in patch.files.iter().enumerate() {
            let target = safe_path(root, &file.path, false)?;
            let backup = if target.exists() {
                let backup = transaction.join(index.to_string());
                fs::rename(&target, &backup)
                    .map_err(|error| format!("Could not stage coding backup: {error}"))?;
                Some(backup)
            } else {
                None
            };
            touched.push((target.clone(), backup));
            if file.operation != CodingFileOperation::Delete {
                let parent = target
                    .parent()
                    .ok_or("Coding target has no parent directory.")?;
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Could not create coding output directory: {error}")
                })?;
                let temporary = parent.join(format!(".cutout-coding-{}.tmp", uuid::Uuid::new_v4()));
                fs::write(&temporary, file.contents.as_deref().unwrap_or_default())
                    .map_err(|error| format!("Could not write coding output: {error}"))?;
                fs::rename(&temporary, &target)
                    .map_err(|error| format!("Could not publish coding output: {error}"))?;
            }
        }
        inspect_applied(root, patch)
    })();
    if result.is_err() {
        for (target, backup) in touched.iter().rev() {
            let _ = fs::remove_file(target);
            if let Some(backup) = backup {
                if let Some(parent) = target.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::rename(backup, target);
            }
        }
    }
    let _ = fs::remove_dir_all(&transaction);
    result
}

fn inspect_applied(root: &Path, patch: &CodingPatch) -> Result<Vec<CodingChangedFile>, String> {
    patch
        .files
        .iter()
        .map(|file| {
            let sha256 = if file.operation == CodingFileOperation::Delete {
                None
            } else {
                Some(hash(
                    &fs::read(safe_path(root, &file.path, true)?)
                        .map_err(|error| error.to_string())?,
                ))
            };
            Ok(CodingChangedFile {
                path: file.path.clone(),
                operation: file.operation,
                sha256,
            })
        })
        .collect()
}

fn read_allowed(root: &Path, paths: &[String]) -> Result<BTreeMap<String, String>, String> {
    let mut output = BTreeMap::new();
    let mut bounds = TreeBounds::new(MAX_READ_FILES, MAX_READ_BYTES);
    for path in unique_paths(paths)? {
        collect_text(
            root,
            &safe_path(root, &path, true)?,
            0,
            &mut bounds,
            &mut output,
            true,
        )?;
    }
    Ok(output)
}

fn snapshot_id(root: &Path, paths: &[String]) -> Result<String, String> {
    let mut entries = unique_paths(paths)?;
    for path in ["package.json", "tsconfig.json"] {
        if !entries.iter().any(|entry| entry == path) {
            entries.push(path.into());
        }
    }
    let mut output = BTreeMap::new();
    let mut bounds = TreeBounds::new(MAX_SNAPSHOT_FILES, MAX_SNAPSHOT_BYTES);
    for path in entries {
        let target = safe_path(root, &path, false)?;
        if target.exists() {
            collect_text(root, &target, 0, &mut bounds, &mut output, false)?;
        }
    }
    let mut digest = Sha256::new();
    for (path, contents) in output {
        digest.update((path.len() as u64).to_le_bytes());
        digest.update(path.as_bytes());
        digest.update((contents.len() as u64).to_le_bytes());
        digest.update(contents.as_bytes());
    }
    Ok(format!("sha256:{:x}", digest.finalize()))
}

fn collect_text(
    root: &Path,
    target: &Path,
    depth: usize,
    bounds: &mut TreeBounds,
    output: &mut BTreeMap<String, String>,
    reject_credentials: bool,
) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err("policy-denied: Coding workspace exceeds the directory depth budget.".into());
    }
    let metadata = fs::symlink_metadata(target).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err(
            "policy-denied: Symbolic links are not allowed in controlled coding paths.".into(),
        );
    }
    if metadata.is_file() {
        bounds.add(metadata.len())?;
        let bytes = fs::read(target).map_err(|error| error.to_string())?;
        if reject_credentials && crate::commands::scan_repository::credential_content(&bytes) {
            return Err("policy-denied: Coding context contains credential-shaped data.".into());
        }
        let contents = String::from_utf8(bytes).map_err(|_| {
            "policy-denied: Controlled coding reads require UTF-8 text files.".to_string()
        })?;
        output.insert(relative_path(root, target)?, contents);
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(
            "policy-denied: Controlled coding paths must be regular files or directories.".into(),
        );
    }
    let mut entries = fs::read_dir(target)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let name = entry.file_name();
        if name == ".git" || name.to_string_lossy().starts_with(".cutout-coding-") {
            continue;
        }
        collect_text(
            root,
            &entry.path(),
            depth + 1,
            bounds,
            output,
            reject_credentials,
        )?;
    }
    Ok(())
}

fn clone_tree(
    source: &Path,
    target: &Path,
    depth: usize,
    bounds: &mut TreeBounds,
) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err("policy-denied: Coding workspace exceeds the directory depth budget.".into());
    }
    let mut entries = fs::read_dir(source)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let name = entry.file_name();
        if name == ".git" || name.to_string_lossy().starts_with(".cutout-coding-") {
            continue;
        }
        let from = entry.path();
        let to = target.join(&name);
        let metadata = fs::symlink_metadata(&from).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("policy-denied: Symbolic links cannot enter a coding stage.".into());
        }
        if metadata.is_dir() {
            fs::create_dir(&to).map_err(|error| error.to_string())?;
            clone_tree(&from, &to, depth + 1, bounds)?;
        } else if metadata.is_file() {
            bounds.add(metadata.len())?;
            fs::copy(&from, &to).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

struct TreeBounds {
    files: usize,
    bytes: u64,
    max_files: usize,
    max_bytes: u64,
}

impl TreeBounds {
    fn new(max_files: usize, max_bytes: u64) -> Self {
        Self {
            files: 0,
            bytes: 0,
            max_files,
            max_bytes,
        }
    }
    fn add(&mut self, bytes: u64) -> Result<(), String> {
        self.files += 1;
        self.bytes = self.bytes.saturating_add(bytes);
        if self.files > self.max_files || self.bytes > self.max_bytes {
            return Err(
                "budget-exceeded: Controlled coding workspace exceeds its file or byte budget."
                    .into(),
            );
        }
        Ok(())
    }
}

fn unique_paths(paths: &[String]) -> Result<Vec<String>, String> {
    if paths.is_empty() || paths.len() > 100 {
        return Err("Controlled coding path count is outside its budget.".into());
    }
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for path in paths {
        validate_relative_path(path)?;
        if seen.insert(path.clone()) {
            output.push(path.clone());
        }
    }
    Ok(output)
}

fn validate_relative_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.len() > 500
        || Path::new(path).is_absolute()
        || path.contains('\\')
        || path.contains('\0')
    {
        return Err("policy-denied: Expected a controlled relative path.".into());
    }
    if Path::new(path)
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("policy-denied: Expected a controlled relative path.".into());
    }
    let lowered = path.to_ascii_lowercase();
    if lowered.split('/').any(|part| {
        part.starts_with(".env")
            || part.contains("secret")
            || part.contains("credential")
            || part.contains("api-key")
            || part.contains("api_key")
            || part.contains("private-key")
            || part.contains("private_key")
            || part.contains("token")
    }) {
        return Err("policy-denied: Credential-shaped paths are not accepted.".into());
    }
    Ok(())
}

fn safe_path(root: &Path, path: &str, must_exist: bool) -> Result<PathBuf, String> {
    validate_relative_path(path)?;
    let target = root.join(path);
    let mut cursor = root.to_path_buf();
    for component in Path::new(path).components() {
        let Component::Normal(part) = component else {
            return Err("policy-denied: Coding path escapes the controlled root.".into());
        };
        cursor.push(part);
        match fs::symlink_metadata(&cursor) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(
                    "policy-denied: Symbolic links are not allowed in controlled coding paths."
                        .into(),
                )
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    if must_exist && !target.exists() {
        return Err("revision-conflict: Controlled coding path does not exist.".into());
    }
    Ok(target)
}

fn within_allowed(path: &str, allowed: &str) -> bool {
    path == allowed
        || path
            .strip_prefix(allowed)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn relative_path(root: &Path, target: &Path) -> Result<String, String> {
    target
        .strip_prefix(root)
        .map_err(|_| "policy-denied: Coding path escaped the authorized workspace.".to_string())?
        .to_str()
        .map(str::to_owned)
        .ok_or("policy-denied: Coding paths must be valid UTF-8.".to_string())
        .map(|path| path.replace('\\', "/"))
}

fn patch_sha256(patch: &CodingPatch) -> Result<String, String> {
    serde_json::to_vec(patch)
        .map(|bytes| hash(&bytes))
        .map_err(|error| error.to_string())
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn task(paths: Vec<&str>) -> CodingTask {
        CodingTask {
            constraints: CodingConstraints {
                allowed_paths: paths.into_iter().map(str::to_owned).collect(),
                allowed_commands: vec![CodingCheck::Typecheck],
            },
            target: CodingTarget {
                package_manager: PackageManager::Pnpm,
            },
            budget: CodingBudget {
                max_changed_files: 4,
                max_bytes: 10_000,
                max_duration_ms: 5_000,
            },
        }
    }

    fn patch(path: &str, operation: CodingFileOperation, contents: Option<&str>) -> CodingPatch {
        CodingPatch {
            files: vec![CodingFilePatch {
                path: path.into(),
                operation,
                contents: contents.map(str::to_owned),
                previous_sha256: None,
            }],
        }
    }

    #[test]
    fn controlled_reads_reject_paths_symlinks_credentials_and_bounds() {
        let workspace = tempdir().unwrap();
        fs::create_dir(workspace.path().join("src")).unwrap();
        fs::write(workspace.path().join("src/App.tsx"), "export default 1").unwrap();
        assert_eq!(
            read_allowed(workspace.path(), &["src".into()])
                .unwrap()
                .len(),
            1
        );
        assert!(read_allowed(workspace.path(), &["../outside".into()])
            .unwrap_err()
            .contains("relative path"));
        fs::write(
            workspace.path().join("src/config.ts"),
            "const value = 'sk-1234567890abcdef'",
        )
        .unwrap();
        assert!(read_allowed(workspace.path(), &["src".into()])
            .unwrap_err()
            .contains("credential-shaped"));
    }

    #[test]
    fn staging_and_promotion_are_patch_bound_and_revision_checked() {
        let workspace = tempdir().unwrap();
        fs::create_dir(workspace.path().join("app")).unwrap();
        fs::write(workspace.path().join("app/index.html"), "before").unwrap();
        let task = task(vec!["app"]);
        let patch = patch(
            "app/index.html",
            CodingFileOperation::Replace,
            Some("after"),
        );
        let before = snapshot_id(workspace.path(), &task.constraints.allowed_paths).unwrap();
        let changed = apply_patch_transaction(workspace.path(), &task, &patch).unwrap();
        assert_eq!(changed.len(), 1);
        assert_eq!(
            fs::read_to_string(workspace.path().join("app/index.html")).unwrap(),
            "after"
        );
        assert_ne!(
            snapshot_id(workspace.path(), &task.constraints.allowed_paths).unwrap(),
            before
        );
    }

    #[test]
    fn check_mapping_is_closed_and_shell_free() {
        assert_eq!(
            check_command(PackageManager::Pnpm, CodingCheck::Typecheck),
            ("pnpm", vec!["exec", "tsc", "-b", "--pretty", "false"])
        );
        assert_eq!(
            check_command(PackageManager::Npm, CodingCheck::VisualTest),
            ("npm", vec!["exec", "--", "playwright", "test"])
        );
    }
}
