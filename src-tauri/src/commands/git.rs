use crate::commands::registry_desktop::{authorized, RegistryDesktopState};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{LazyLock, Mutex},
    thread,
    time::{Duration, Instant, SystemTime},
};
use tauri::State;

const MAX_OUTPUT_BYTES: usize = 512 * 1024;
const MAX_ERROR_BYTES: usize = 16 * 1024;
const GIT_TIMEOUT: Duration = Duration::from_secs(30);
const PLAN_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_PATHS: usize = 200;

static PUSH_PLANS: LazyLock<Mutex<HashMap<String, PushPlan>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static MUTATION_PLANS: LazyLock<Mutex<HashMap<String, MutationPlan>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct PushPlan {
    created_at: SystemTime,
    workspace_handle: String,
    repository_id: String,
    snapshot_token: String,
    branch: String,
    remote: String,
    set_upstream: bool,
}

struct MutationPlan {
    created_at: SystemTime,
    workspace_handle: String,
    repository_id: String,
    snapshot_token: String,
    mutation: GitMutation,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GitMutation {
    Commit { message: String },
    CreateBranch { name: String },
    SwitchBranch { name: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitMutationPreview {
    plan_id: String,
    repository_id: String,
    snapshot_token: String,
    mutation: GitMutation,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitMutationReceipt {
    plan_id: String,
    operation: String,
    status: GitStatusSnapshot,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCapability {
    available: bool,
    repository: bool,
    git_version: Option<String>,
    repository_id: Option<String>,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    path: String,
    original_path: Option<String>,
    index_status: String,
    worktree_status: String,
    conflicted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSnapshot {
    repository_id: String,
    snapshot_token: String,
    branch: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    detached: bool,
    files: Vec<GitFileStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    oid: String,
    short_oid: String,
    parents: Vec<String>,
    author: String,
    authored_at: String,
    decorations: Vec<String>,
    subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    path: String,
    original_path: Option<String>,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchComparison {
    base: String,
    compare: String,
    base_only: u32,
    compare_only: u32,
    files: Vec<GitCommitFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchSummary {
    name: String,
    oid: String,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    last_commit_subject: String,
    last_committed_at: String,
    current: bool,
    remote: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    path: String,
    target: String,
    kind: String,
    patch: String,
    truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushPreview {
    plan_id: String,
    repository_id: String,
    branch: String,
    remote: String,
    upstream: Option<String>,
    set_upstream: bool,
}

#[derive(Default)]
struct BranchHeader {
    branch: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    detached: bool,
}

#[tauri::command]
pub fn git_capability(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
) -> Result<GitCapability, String> {
    let selected = authorized(&state, &workspace_handle)?;
    let version = run_git(None, &["--version"])
        .ok()
        .map(|value| value.trim().to_string());
    let Some(git_version) = version else {
        return Ok(GitCapability {
            available: false,
            repository: false,
            git_version: None,
            repository_id: None,
            message: Some("Git is not available on this device.".into()),
        });
    };
    match repository_root(&selected) {
        Ok(root) => Ok(GitCapability {
            available: true,
            repository: true,
            git_version: Some(git_version),
            repository_id: Some(repository_id(&root)),
            message: None,
        }),
        Err(message) => Ok(GitCapability {
            available: true,
            repository: false,
            git_version: Some(git_version),
            repository_id: None,
            message: Some(message),
        }),
    }
}

#[tauri::command]
pub fn git_status(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
) -> Result<GitStatusSnapshot, String> {
    let selected = authorized(&state, &workspace_handle)?;
    let root = repository_root(&selected)?;
    status_snapshot(&root)
}

#[tauri::command]
pub fn git_log(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    limit: Option<u16>,
    skip: Option<u32>,
) -> Result<Vec<GitCommitSummary>, String> {
    let selected = authorized(&state, &workspace_handle)?;
    let root = repository_root(&selected)?;
    let count = limit.unwrap_or(100).clamp(1, 250).to_string();
    let skip = skip.unwrap_or(0).min(100_000).to_string();
    let value = run_git(
        Some(&root),
        &[
            "log",
            "--date=iso-strict",
            "--decorate=short",
            "--max-count",
            &count,
            "--skip",
            &skip,
            "--format=%H%x1f%h%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e",
        ],
    )?;
    parse_log(&value)
}

#[tauri::command]
pub fn git_commit_files(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    oid: String,
) -> Result<Vec<GitCommitFile>, String> {
    validate_oid(&oid)?;
    let root = authorized_repository(&state, &workspace_handle)?;
    let raw = run_git_bytes(
        Some(&root),
        &[
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--name-status",
            "-r",
            "-z",
            &oid,
        ],
    )?;
    parse_name_status(&raw)
}

#[tauri::command]
pub fn git_commit_diff(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    oid: String,
    path: String,
) -> Result<GitDiffResult, String> {
    validate_oid(&oid)?;
    validate_relative_path(&path)?;
    let root = authorized_repository(&state, &workspace_handle)?;
    let bytes = run_git_bytes(
        Some(&root),
        &[
            "show",
            "--format=",
            "--no-ext-diff",
            "--no-color",
            &oid,
            "--",
            &path,
        ],
    )?;
    Ok(diff_result(path, "commit", bytes))
}

#[tauri::command]
pub fn git_branches(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
) -> Result<Vec<GitBranchSummary>, String> {
    let selected = authorized(&state, &workspace_handle)?;
    let root = repository_root(&selected)?;
    let value = run_git(
        Some(&root),
        &[
            "for-each-ref",
            "refs/heads",
            "refs/remotes",
            "--format=%(refname)%09%(objectname)%09%(upstream:short)%09%(upstream:track)%09%(HEAD)%09%(subject)%09%(committerdate:iso-strict)",
        ],
    )?;
    parse_branches(&value)
}

#[tauri::command]
pub fn git_branch_compare(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    base: String,
    compare: String,
) -> Result<GitBranchComparison, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    validate_revision(&root, &base)?;
    validate_revision(&root, &compare)?;
    let counts = run_git(
        Some(&root),
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{base}...{compare}"),
        ],
    )?;
    let mut counts = counts.split_whitespace();
    let base_only = counts
        .next()
        .and_then(|value| value.parse().ok())
        .ok_or("Git branch comparison is malformed.")?;
    let compare_only = counts
        .next()
        .and_then(|value| value.parse().ok())
        .ok_or("Git branch comparison is malformed.")?;
    let raw = run_git_bytes(
        Some(&root),
        &["diff", "--name-status", "-z", &base, &compare],
    )?;
    Ok(GitBranchComparison {
        base,
        compare,
        base_only,
        compare_only,
        files: parse_name_status(&raw)?,
    })
}

#[tauri::command]
pub fn git_diff(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    path: String,
    target: String,
) -> Result<GitDiffResult, String> {
    validate_relative_path(&path)?;
    let selected = authorized(&state, &workspace_handle)?;
    let root = repository_root(&selected)?;
    let args: Vec<&str> = match target.as_str() {
        "worktree" => vec!["diff", "--no-ext-diff", "--no-color", "--", &path],
        "staged" => vec![
            "diff",
            "--cached",
            "--no-ext-diff",
            "--no-color",
            "--",
            &path,
        ],
        _ => return Err("Git diff target must be worktree or staged.".into()),
    };
    let bytes = run_git_bytes(Some(&root), &args)?;
    Ok(diff_result(path, &target, bytes))
}

fn diff_result(path: String, target: &str, bytes: Vec<u8>) -> GitDiffResult {
    let truncated = bytes.len() > MAX_OUTPUT_BYTES;
    let visible = &bytes[..bytes.len().min(MAX_OUTPUT_BYTES)];
    let binary = visible
        .windows("Binary files ".len())
        .any(|window| window == b"Binary files ")
        || visible
            .windows("GIT binary patch".len())
            .any(|window| window == b"GIT binary patch");
    let valid_utf8 = std::str::from_utf8(visible).is_ok();
    let kind = if binary {
        "binary"
    } else if truncated {
        "oversized"
    } else if !valid_utf8 {
        "unsupported-encoding"
    } else {
        "text"
    };
    let patch = if binary {
        String::new()
    } else {
        String::from_utf8_lossy(visible).into_owned()
    };
    GitDiffResult {
        path,
        target: target.into(),
        kind: kind.into(),
        patch,
        truncated,
    }
}

#[tauri::command]
pub fn git_stage(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
    paths: Vec<String>,
) -> Result<GitStatusSnapshot, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    require_current_snapshot(&root, &expected_snapshot_token)?;
    validate_paths(&paths)?;
    let mut args = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    run_git_bytes(Some(&root), &args)?;
    status_snapshot(&root)
}

#[tauri::command]
pub fn git_unstage(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
    paths: Vec<String>,
) -> Result<GitStatusSnapshot, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    require_current_snapshot(&root, &expected_snapshot_token)?;
    validate_paths(&paths)?;
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(paths.iter().map(String::as_str));
    run_git_bytes(Some(&root), &args)?;
    status_snapshot(&root)
}

#[tauri::command]
pub fn git_preview_mutation(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
    mutation: GitMutation,
) -> Result<GitMutationPreview, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    let snapshot = require_current_snapshot(&root, &expected_snapshot_token)?;
    validate_mutation(&root, &snapshot, &mutation)?;
    let plan_id = mutation_plan_id(&snapshot, &mutation);
    let warnings = match &mutation {
        GitMutation::SwitchBranch { .. } if !snapshot.files.is_empty() => {
            vec!["Local changes are present. Git will refuse the switch if they conflict.".into()]
        }
        _ => Vec::new(),
    };
    let mut plans = MUTATION_PLANS
        .lock()
        .map_err(|_| "Git mutation planning is unavailable.".to_string())?;
    retain_fresh_plans(&mut plans, |plan| plan.created_at);
    if plans.len() >= 64 {
        plans.clear();
    }
    plans.insert(
        plan_id.clone(),
        MutationPlan {
            created_at: SystemTime::now(),
            workspace_handle,
            repository_id: snapshot.repository_id.clone(),
            snapshot_token: snapshot.snapshot_token.clone(),
            mutation: mutation.clone(),
        },
    );
    Ok(GitMutationPreview {
        plan_id,
        repository_id: snapshot.repository_id,
        snapshot_token: snapshot.snapshot_token,
        mutation,
        warnings,
    })
}

#[tauri::command]
pub fn git_apply_mutation(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    plan_id: String,
) -> Result<GitMutationReceipt, String> {
    let plan = MUTATION_PLANS
        .lock()
        .map_err(|_| "Git mutation planning is unavailable.".to_string())?
        .remove(&plan_id)
        .ok_or("This Git preview expired. Preview the operation again.")?;
    require_fresh_plan(plan.created_at, "Git preview")?;
    if plan.workspace_handle != workspace_handle {
        return Err("This Git preview does not match the authorized workspace.".into());
    }
    let root = authorized_repository(&state, &workspace_handle)?;
    let snapshot = require_current_snapshot(&root, &plan.snapshot_token)?;
    if snapshot.repository_id != plan.repository_id {
        return Err("The repository changed. Preview the operation again.".into());
    }
    validate_mutation(&root, &snapshot, &plan.mutation)?;
    let operation = match plan.mutation {
        GitMutation::Commit { message } => {
            run_git_bytes(Some(&root), &["commit", "-m", message.trim()])?;
            "commit"
        }
        GitMutation::CreateBranch { name } => {
            run_git_bytes(Some(&root), &["switch", "-c", name.trim()])?;
            "create-branch"
        }
        GitMutation::SwitchBranch { name } => {
            run_git_bytes(Some(&root), &["switch", name.trim()])?;
            "switch-branch"
        }
    };
    Ok(GitMutationReceipt {
        plan_id,
        operation: operation.into(),
        status: status_snapshot(&root)?,
    })
}

#[tauri::command]
pub fn git_commit(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
    message: String,
) -> Result<GitStatusSnapshot, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    let snapshot = require_current_snapshot(&root, &expected_snapshot_token)?;
    let message = validate_commit_message(&message)?;
    if snapshot.files.iter().any(|file| file.conflicted) {
        return Err("Resolve merge conflicts before committing.".into());
    }
    if !snapshot.files.iter().any(|file| file.index_status != " ") {
        return Err("Stage at least one change before committing.".into());
    }
    run_git_bytes(Some(&root), &["commit", "-m", message])?;
    status_snapshot(&root)
}

#[tauri::command]
pub fn git_create_branch(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
    name: String,
) -> Result<GitStatusSnapshot, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    require_current_snapshot(&root, &expected_snapshot_token)?;
    validate_branch_name(&root, &name)?;
    run_git_bytes(Some(&root), &["switch", "-c", name.trim()])?;
    status_snapshot(&root)
}

#[tauri::command]
pub fn git_switch_branch(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
    name: String,
) -> Result<GitStatusSnapshot, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    require_current_snapshot(&root, &expected_snapshot_token)?;
    validate_branch_name(&root, &name)?;
    run_git_bytes(Some(&root), &["switch", name.trim()])?;
    status_snapshot(&root)
}

#[tauri::command]
pub fn git_push_preview(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    expected_snapshot_token: String,
) -> Result<GitPushPreview, String> {
    let root = authorized_repository(&state, &workspace_handle)?;
    let snapshot = require_current_snapshot(&root, &expected_snapshot_token)?;
    let branch = snapshot
        .branch
        .clone()
        .filter(|value| !value.is_empty())
        .ok_or("Push requires an active local branch.")?;
    let (remote, set_upstream) = match snapshot.upstream.as_deref() {
        Some(upstream) => (
            upstream
                .split_once('/')
                .map(|(remote, _)| remote.to_string())
                .ok_or("The configured upstream is invalid.")?,
            false,
        ),
        None => {
            let remotes = run_git(Some(&root), &["remote"])?;
            let remotes: Vec<&str> = remotes.lines().filter(|line| !line.is_empty()).collect();
            if remotes.len() != 1 {
                return Err("Configure one Git remote or an upstream before pushing.".into());
            }
            (remotes[0].to_string(), true)
        }
    };
    let plan_id = push_plan_id(&snapshot, &branch, &remote);
    let mut plans = PUSH_PLANS
        .lock()
        .map_err(|_| "Git push planning is unavailable.".to_string())?;
    retain_fresh_plans(&mut plans, |plan| plan.created_at);
    if plans.len() >= 64 {
        plans.clear();
    }
    plans.insert(
        plan_id.clone(),
        PushPlan {
            created_at: SystemTime::now(),
            workspace_handle,
            repository_id: snapshot.repository_id.clone(),
            snapshot_token: snapshot.snapshot_token.clone(),
            branch: branch.clone(),
            remote: remote.clone(),
            set_upstream,
        },
    );
    drop(plans);
    Ok(GitPushPreview {
        plan_id,
        repository_id: snapshot.repository_id,
        branch,
        remote,
        upstream: snapshot.upstream,
        set_upstream,
    })
}

#[tauri::command]
pub fn git_push(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    plan_id: String,
) -> Result<GitStatusSnapshot, String> {
    let plan = PUSH_PLANS
        .lock()
        .map_err(|_| "Git push planning is unavailable.".to_string())?
        .remove(&plan_id)
        .ok_or("This push preview expired. Preview the push again.")?;
    require_fresh_plan(plan.created_at, "push preview")?;
    if plan.workspace_handle != workspace_handle {
        return Err("This push preview does not match the authorized workspace.".into());
    }
    let root = authorized_repository(&state, &workspace_handle)?;
    let snapshot = require_current_snapshot(&root, &plan.snapshot_token)?;
    if snapshot.repository_id != plan.repository_id
        || snapshot.branch.as_deref() != Some(&plan.branch)
    {
        return Err("The repository changed. Preview the push again.".into());
    }
    if plan.set_upstream {
        run_git_bytes(
            Some(&root),
            &["push", "--set-upstream", &plan.remote, &plan.branch],
        )?;
    } else {
        run_git_bytes(Some(&root), &["push", &plan.remote, &plan.branch])?;
    }
    status_snapshot(&root)
}

fn authorized_repository(
    state: &State<'_, RegistryDesktopState>,
    workspace_handle: &str,
) -> Result<PathBuf, String> {
    let selected = authorized(state, workspace_handle)?;
    repository_root(&selected)
}

fn status_snapshot(root: &Path) -> Result<GitStatusSnapshot, String> {
    let raw = run_git_bytes(
        Some(root),
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--branch",
            "--untracked-files=all",
        ],
    )?;
    let (header, files) = parse_status(&raw)?;
    let mut hasher = Sha256::new();
    hasher.update(root.to_string_lossy().as_bytes());
    if let Ok(head) = run_git(Some(root), &["rev-parse", "--verify", "HEAD"]) {
        hasher.update(head.trim().as_bytes());
    }
    hasher.update(&raw);
    Ok(GitStatusSnapshot {
        repository_id: repository_id(root),
        snapshot_token: hex_digest(hasher.finalize().as_slice()),
        branch: header.branch,
        upstream: header.upstream,
        ahead: header.ahead,
        behind: header.behind,
        detached: header.detached,
        files,
    })
}

fn require_current_snapshot(root: &Path, expected: &str) -> Result<GitStatusSnapshot, String> {
    let snapshot = status_snapshot(root)?;
    if snapshot.snapshot_token != expected {
        return Err("The repository changed. Refresh Git and try again.".into());
    }
    Ok(snapshot)
}

fn repository_root(selected: &Path) -> Result<PathBuf, String> {
    let value = run_git(Some(selected), &["rev-parse", "--show-toplevel"])?;
    let root = std::fs::canonicalize(value.trim())
        .map_err(|_| "The Git repository root is unavailable.".to_string())?;
    let selected = std::fs::canonicalize(selected)
        .map_err(|_| "The authorized workspace is unavailable.".to_string())?;
    if root != selected && !root.starts_with(&selected) {
        return Err("The repository root is outside the authorized workspace.".into());
    }
    Ok(root)
}

fn run_git(cwd: Option<&Path>, args: &[&str]) -> Result<String, String> {
    let bytes = run_git_bytes(cwd, args)?;
    String::from_utf8(bytes).map_err(|_| "Git returned non-text output.".into())
}

fn run_git_bytes(cwd: Option<&Path>, args: &[&str]) -> Result<Vec<u8>, String> {
    if let Some(root) = cwd {
        validate_repository_config(root)?;
    }
    let mut command = Command::new("git");
    configure_safe_git_command(&mut command);
    let hooks = std::env::temp_dir().join("cutout-empty-git-hooks");
    let _ = std::fs::create_dir_all(&hooks);
    command
        .arg("-c")
        .arg(format!("core.hooksPath={}", hooks.display()))
        .args(["-c", "core.fsmonitor=false"])
        .args(["-c", "core.untrackedCache=false"])
        .args(["-c", "diff.external="])
        .args(["-c", "credential.helper="])
        .args(["-c", "protocol.file.allow=never"])
        .args(args)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LITERAL_PATHSPECS", "1");
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|_| "Git is not available on this device.".to_string())?;
    let stdout = child.stdout.take().ok_or("Git output is unavailable.")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Git diagnostics are unavailable.")?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout, MAX_OUTPUT_BYTES + 1));
    let stderr_reader = thread::spawn(move || read_bounded(stderr, MAX_ERROR_BYTES));
    let deadline = Instant::now() + GIT_TIMEOUT;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "Git process state is unavailable.".to_string())?
        {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err("Git operation timed out after 30 seconds.".into());
        }
        thread::sleep(Duration::from_millis(10));
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Git output reader failed.".to_string())??;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Git diagnostics reader failed.".to_string())??;
    if !status.success() {
        let stderr = String::from_utf8_lossy(&stderr);
        if stderr.contains("not a git repository") {
            return Err("The authorized folder is not a Git repository.".into());
        }
        return Err("Git could not complete the requested local operation.".into());
    }
    Ok(stdout)
}

fn configure_safe_git_command(command: &mut Command) {
    let null_config = if cfg!(windows) { "NUL" } else { "/dev/null" };
    command
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", null_config)
        .env_remove("GIT_CONFIG_SYSTEM")
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_EXEC_PATH")
        .env_remove("GIT_EXTERNAL_DIFF")
        .env_remove("GIT_SSH_COMMAND")
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS");
    for index in 0..64 {
        command
            .env_remove(format!("GIT_CONFIG_KEY_{index}"))
            .env_remove(format!("GIT_CONFIG_VALUE_{index}"));
    }
}

fn validate_repository_config(root: &Path) -> Result<(), String> {
    let mut command = Command::new("git");
    configure_safe_git_command(&mut command);
    let output = command
        .current_dir(root)
        .args([
            "config",
            "--local",
            "--no-includes",
            "--name-only",
            "--list",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| "Git is not available on this device.".to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not a git repository") {
            return Ok(());
        }
        return Err(format!(
            "Unable to validate repository Git configuration: {}",
            stderr.trim()
        ));
    }
    for key in String::from_utf8_lossy(&output.stdout).lines() {
        let key = key.trim().to_ascii_lowercase();
        let executable = key == "core.hookspath"
            || key == "core.fsmonitor"
            || key == "diff.external"
            || key == "credential.helper"
            || key == "include.path"
            || key.starts_with("includeif.")
            || (key.starts_with("diff.") && key.ends_with(".command"))
            || (key.starts_with("filter.")
                && (key.ends_with(".clean")
                    || key.ends_with(".smudge")
                    || key.ends_with(".process")));
        if executable {
            return Err(format!(
                "Repository Git configuration contains executable key {key}; remove it before using Cutout Git."
            ));
        }
    }
    Ok(())
}

fn read_bounded(mut reader: impl Read, limit: usize) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(limit.min(64 * 1024));
    let mut chunk = [0_u8; 16 * 1024];
    loop {
        let count = reader
            .read(&mut chunk)
            .map_err(|_| "Git output could not be read.".to_string())?;
        if count == 0 {
            return Ok(output);
        }
        let remaining = limit.saturating_sub(output.len());
        output.extend_from_slice(&chunk[..count.min(remaining)]);
    }
}

fn plan_is_fresh(created_at: SystemTime) -> bool {
    created_at
        .elapsed()
        .map(|age| age <= PLAN_TTL)
        .unwrap_or(false)
}

fn require_fresh_plan(created_at: SystemTime, label: &str) -> Result<(), String> {
    if plan_is_fresh(created_at) {
        Ok(())
    } else {
        Err(format!(
            "This {label} expired. Preview the operation again."
        ))
    }
}

fn retain_fresh_plans<T>(plans: &mut HashMap<String, T>, created_at: impl Fn(&T) -> SystemTime) {
    plans.retain(|_, plan| plan_is_fresh(created_at(plan)));
}

fn parse_status(raw: &[u8]) -> Result<(BranchHeader, Vec<GitFileStatus>), String> {
    let records: Vec<&[u8]> = raw
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect();
    let mut header = BranchHeader::default();
    let mut files = Vec::new();
    let mut index = 0;
    while index < records.len() {
        let record = std::str::from_utf8(records[index])
            .map_err(|_| "Git status contains an unsupported file name.".to_string())?;
        if let Some(value) = record.strip_prefix("## ") {
            header = parse_branch_header(value);
            index += 1;
            continue;
        }
        if record.len() < 4 {
            return Err("Git status response is malformed.".into());
        }
        let bytes = record.as_bytes();
        let index_status = (bytes[0] as char).to_string();
        let worktree_status = (bytes[1] as char).to_string();
        let path = record[3..].to_string();
        let renamed =
            matches!(bytes[0] as char, 'R' | 'C') || matches!(bytes[1] as char, 'R' | 'C');
        let original_path = if renamed {
            index += 1;
            Some(
                std::str::from_utf8(
                    records
                        .get(index)
                        .ok_or("Git rename response is incomplete.")?,
                )
                .map_err(|_| "Git status contains an unsupported file name.".to_string())?
                .to_string(),
            )
        } else {
            None
        };
        let conflicted = matches!(
            (bytes[0] as char, bytes[1] as char),
            ('D', 'D')
                | ('A', 'U')
                | ('U', 'D')
                | ('U', 'A')
                | ('D', 'U')
                | ('A', 'A')
                | ('U', 'U')
        );
        files.push(GitFileStatus {
            path,
            original_path,
            index_status,
            worktree_status,
            conflicted,
        });
        index += 1;
    }
    Ok((header, files))
}

fn parse_branch_header(value: &str) -> BranchHeader {
    let (head, detail) = value
        .split_once(" [")
        .map(|(head, detail)| (head, Some(detail.trim_end_matches(']'))))
        .unwrap_or((value, None));
    let head = head.strip_prefix("No commits yet on ").unwrap_or(head);
    let (branch, upstream, detached) = if head.starts_with("HEAD ") || head == "HEAD (no branch)" {
        (None, None, true)
    } else if let Some((branch, upstream)) = head.split_once("...") {
        (Some(branch.to_string()), Some(upstream.to_string()), false)
    } else {
        (Some(head.to_string()), None, false)
    };
    let mut result = BranchHeader {
        branch,
        upstream,
        detached,
        ..Default::default()
    };
    if let Some(detail) = detail {
        for item in detail.split(", ") {
            if let Some(value) = item.strip_prefix("ahead ") {
                result.ahead = value.parse().unwrap_or(0);
            }
            if let Some(value) = item.strip_prefix("behind ") {
                result.behind = value.parse().unwrap_or(0);
            }
        }
    }
    result
}

fn parse_log(value: &str) -> Result<Vec<GitCommitSummary>, String> {
    value
        .split('\u{1e}')
        .filter(|record| !record.trim().is_empty())
        .map(|record| {
            let fields: Vec<&str> = record
                .trim_start_matches(['\n', '\r'])
                .split('\u{1f}')
                .collect();
            if fields.len() != 7 {
                return Err("Git history response is malformed.".into());
            }
            Ok(GitCommitSummary {
                oid: fields[0].into(),
                short_oid: fields[1].into(),
                parents: fields[2].split_whitespace().map(str::to_string).collect(),
                author: fields[3].into(),
                authored_at: fields[4].into(),
                decorations: fields[5]
                    .split(',')
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .map(str::to_string)
                    .collect(),
                subject: fields[6].trim_end_matches(['\n', '\r']).into(),
            })
        })
        .collect()
}

fn parse_branches(value: &str) -> Result<Vec<GitBranchSummary>, String> {
    value
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let fields: Vec<&str> = line.splitn(7, '\t').collect();
            if fields.len() != 7 {
                return Err("Git branch response is malformed.".into());
            }
            let remote = fields[0].starts_with("refs/remotes/");
            let prefix = if remote {
                "refs/remotes/"
            } else {
                "refs/heads/"
            };
            let (ahead, behind) = parse_tracking_counts(fields[3]);
            Ok(GitBranchSummary {
                name: fields[0].strip_prefix(prefix).unwrap_or(fields[0]).into(),
                oid: fields[1].into(),
                upstream: (!fields[2].is_empty()).then(|| fields[2].into()),
                ahead,
                behind,
                last_commit_subject: fields[5].into(),
                last_committed_at: fields[6].into(),
                current: fields[4] == "*",
                remote,
            })
        })
        .collect()
}

fn parse_name_status(raw: &[u8]) -> Result<Vec<GitCommitFile>, String> {
    let records: Vec<&[u8]> = raw
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect();
    let mut files = Vec::new();
    let mut index = 0;
    while index < records.len() {
        let status = std::str::from_utf8(records[index])
            .map_err(|_| "Git changed-file status is malformed.")?
            .to_string();
        index += 1;
        let path = std::str::from_utf8(
            records
                .get(index)
                .ok_or("Git changed-file path is missing.")?,
        )
        .map_err(|_| "Git changed-file path has an unsupported encoding.")?
        .to_string();
        index += 1;
        if status.starts_with(['R', 'C']) {
            let renamed_path = std::str::from_utf8(
                records
                    .get(index)
                    .ok_or("Git renamed-file path is missing.")?,
            )
            .map_err(|_| "Git renamed-file path has an unsupported encoding.")?
            .to_string();
            index += 1;
            files.push(GitCommitFile {
                path: renamed_path,
                original_path: Some(path),
                status,
            });
            continue;
        }
        files.push(GitCommitFile {
            path,
            original_path: None,
            status,
        });
    }
    Ok(files)
}

fn parse_tracking_counts(value: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for item in value.trim_matches(['[', ']']).split(", ") {
        if let Some(value) = item.strip_prefix("ahead ") {
            ahead = value.parse().unwrap_or(0);
        } else if let Some(value) = item.strip_prefix("behind ") {
            behind = value.parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

fn validate_relative_path(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.starts_with(['/', '\\', '-'])
        || value.contains('\0')
        || Path::new(value).is_absolute()
        || value
            .split(['/', '\\'])
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("Git path must be a safe repository-relative path.".into());
    }
    Ok(())
}

fn validate_paths(paths: &[String]) -> Result<(), String> {
    if paths.is_empty() || paths.len() > MAX_PATHS {
        return Err("Select between 1 and 200 changed files.".into());
    }
    paths
        .iter()
        .try_for_each(|path| validate_relative_path(path))
}

fn validate_commit_message(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 500 || value.contains('\0') {
        return Err("Commit message must contain between 1 and 500 characters.".into());
    }
    Ok(value)
}

fn validate_branch_name(root: &Path, value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 200 || value.contains('\0') || value.starts_with('-') {
        return Err("Enter a valid Git branch name.".into());
    }
    run_git_bytes(Some(root), &["check-ref-format", "--branch", value])
        .map(|_| ())
        .map_err(|_| "Enter a valid Git branch name.".into())
}

fn validate_oid(value: &str) -> Result<(), String> {
    if value.len() != 40 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Git commit id must be a full hexadecimal object id.".into());
    }
    Ok(())
}

fn validate_revision(root: &Path, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 255
        || value.starts_with('-')
        || value.contains(['\0', '\n', '\r'])
    {
        return Err("Git revision is invalid.".into());
    }
    let revision = format!("{value}^{{commit}}");
    run_git_bytes(Some(root), &["rev-parse", "--verify", &revision])
        .map(|_| ())
        .map_err(|_| "Git revision is unavailable.".into())
}

fn validate_mutation(
    root: &Path,
    snapshot: &GitStatusSnapshot,
    mutation: &GitMutation,
) -> Result<(), String> {
    match mutation {
        GitMutation::Commit { message } => {
            validate_commit_message(message)?;
            if snapshot.files.iter().any(|file| file.conflicted) {
                return Err("Resolve merge conflicts before committing.".into());
            }
            if !snapshot.files.iter().any(|file| file.index_status != " ") {
                return Err("Stage at least one change before committing.".into());
            }
        }
        GitMutation::CreateBranch { name } | GitMutation::SwitchBranch { name } => {
            validate_branch_name(root, name)?
        }
    }
    Ok(())
}

fn mutation_plan_id(snapshot: &GitStatusSnapshot, mutation: &GitMutation) -> String {
    let mut hasher = Sha256::new();
    hasher.update(snapshot.repository_id.as_bytes());
    hasher.update(snapshot.snapshot_token.as_bytes());
    hasher.update(serde_json::to_vec(mutation).unwrap_or_default());
    hasher.update(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    format!(
        "mutation.{}",
        &hex_digest(hasher.finalize().as_slice())[..32]
    )
}

fn push_plan_id(snapshot: &GitStatusSnapshot, branch: &str, remote: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(snapshot.repository_id.as_bytes());
    hasher.update(snapshot.snapshot_token.as_bytes());
    hasher.update(branch.as_bytes());
    hasher.update(remote.as_bytes());
    hasher.update(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    format!("push.{}", &hex_digest(hasher.finalize().as_slice())[..32])
}

fn repository_id(root: &Path) -> String {
    let digest = Sha256::digest(root.to_string_lossy().as_bytes());
    format!("repo.{}", &hex_digest(digest.as_slice())[..24])
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_paths() {
        for value in ["", "/tmp/a", "../a", "a/../b", "-p", "a//b", "a\\..\\b"] {
            assert!(validate_relative_path(value).is_err(), "{value}");
        }
        assert!(validate_relative_path("src/components/App.tsx").is_ok());
    }

    #[test]
    fn parses_status_branch_files_and_rename() {
        let raw = b"## main...origin/main [ahead 2, behind 1]\0 M src/App.tsx\0R  new.ts\0old.ts\0UU conflict.ts\0";
        let (header, files) = parse_status(raw).unwrap();
        assert_eq!(header.branch.as_deref(), Some("main"));
        assert_eq!(header.upstream.as_deref(), Some("origin/main"));
        assert_eq!((header.ahead, header.behind), (2, 1));
        assert_eq!(files.len(), 3);
        assert_eq!(files[1].original_path.as_deref(), Some("old.ts"));
        assert!(files[2].conflicted);
    }

    #[test]
    fn parses_unborn_branch_and_validates_mutation_inputs() {
        let header = parse_branch_header("No commits yet on main");
        assert_eq!(header.branch.as_deref(), Some("main"));
        assert!(!header.detached);
        assert!(validate_paths(&[]).is_err());
        assert!(validate_commit_message("  ").is_err());
        assert_eq!(validate_commit_message(" ship ").unwrap(), "ship");
    }

    #[test]
    fn parses_history_and_branches() {
        let log = "abc\u{1f}abc\u{1f}parent\u{1f}Ada\u{1f}2026-07-20T10:00:00+08:00\u{1f}HEAD -> main, tag: v1\u{1f}Ship it\u{1e}";
        let commits = parse_log(log).unwrap();
        assert_eq!(commits[0].subject, "Ship it");
        assert_eq!(commits[0].decorations.len(), 2);
        let branches = parse_branches(
            "refs/heads/main\tabc\torigin/main\t[ahead 2, behind 1]\t*\tShip it\t2026-07-20T10:00:00+08:00\nrefs/remotes/origin/main\tabc\t\t\t \tShip it\t2026-07-20T10:00:00+08:00\n",
        )
        .unwrap();
        assert!(branches[0].current);
        assert_eq!((branches[0].ahead, branches[0].behind), (2, 1));
        assert_eq!(branches[0].last_commit_subject, "Ship it");
        assert!(branches[1].remote);
    }

    #[test]
    fn bounded_reader_drains_but_retains_only_the_limit() {
        let input = vec![b'x'; 128];
        let output = read_bounded(input.as_slice(), 17).unwrap();
        assert_eq!(output, vec![b'x'; 17]);
    }

    #[test]
    fn preview_plans_expire_and_future_timestamps_are_rejected() {
        assert!(plan_is_fresh(SystemTime::now()));
        assert!(!plan_is_fresh(
            SystemTime::now() - PLAN_TTL - Duration::from_secs(1)
        ));
        assert!(!plan_is_fresh(SystemTime::now() + Duration::from_secs(1)));
        assert!(require_fresh_plan(
            SystemTime::now() - PLAN_TTL - Duration::from_secs(1),
            "Git preview",
        )
        .unwrap_err()
        .contains("expired"));
    }

    #[test]
    fn rejects_repository_local_executable_configuration() {
        let root = tempfile::tempdir().unwrap();
        let status = Command::new("git")
            .current_dir(root.path())
            .args(["init", "--quiet"])
            .status()
            .unwrap();
        assert!(status.success());
        let status = Command::new("git")
            .current_dir(root.path())
            .args(["config", "core.fsmonitor", "malicious-helper"])
            .status()
            .unwrap();
        assert!(status.success());
        assert!(validate_repository_config(root.path())
            .unwrap_err()
            .contains("core.fsmonitor"));
    }
}
