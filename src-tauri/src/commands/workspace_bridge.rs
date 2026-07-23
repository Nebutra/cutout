use super::registry_desktop::{authorized, RegistryDesktopState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::State;
use tokio::fs;

const RUN_EVENT_STORE_FILE: &str = "run-events.json";
const MAX_RUN_EVENT_STORE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_RUN_EVENT_COUNT: usize = 10_000;

#[derive(Default)]
pub struct WorkspaceBridgeState {
    plans: Mutex<HashMap<String, ExportPlan>>,
    run_event_write: tokio::sync::Mutex<()>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRevision {
    document: Value,
    sha256: String,
    revision_id: String,
    revision_number: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEventStoreSnapshot {
    store: Value,
    sha256: Option<String>,
    exists: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPlan {
    id: String,
    workspace_handle: String,
    expected_sha256: String,
    current_sha256: String,
    next_sha256: String,
    conflict: bool,
    requires_approval: bool,
    #[serde(skip)]
    document: Value,
}

#[derive(Deserialize)]
struct Manifest {
    files: ManifestFiles,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFiles {
    design_ir: String,
}

async fn design_ir_path(root: &Path) -> Result<PathBuf, String> {
    let bytes = fs::read(root.join(".cutout/manifest.json"))
        .await
        .map_err(|_| "Authorized workspace has no .cutout manifest.".to_string())?;
    let manifest: Manifest =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid .cutout manifest: {e}"))?;
    let relative = Path::new(&manifest.files.design_ir);
    if relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Manifest Design IR path escapes .cutout.".into());
    }
    let cutout = fs::canonicalize(root.join(".cutout"))
        .await
        .map_err(|e| format!("Invalid .cutout directory: {e}"))?;
    let candidate = fs::canonicalize(cutout.join(relative))
        .await
        .map_err(|e| format!("Invalid Design IR path: {e}"))?;
    if !candidate.starts_with(&cutout) {
        return Err("Manifest Design IR path escapes .cutout through a symbolic link.".into());
    }
    Ok(candidate)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn empty_run_event_store() -> Value {
    serde_json::json!({
        "version": "agent-run-events.v1",
        "activeRunId": null,
        "events": [],
        "activeRun": null,
    })
}

fn validate_run_event_store(store: &Value) -> Result<(), String> {
    let object = store
        .as_object()
        .ok_or("Agent run-event store must be a JSON object.")?;
    if object.get("version").and_then(Value::as_str) != Some("agent-run-events.v1") {
        return Err("Agent run-event store has an unsupported version.".into());
    }
    match object.get("activeRunId") {
        Some(Value::Null) => {}
        Some(Value::String(value)) if !value.is_empty() && value.len() <= 160 => {}
        _ => return Err("Agent run-event store has an invalid activeRunId.".into()),
    }
    if !object.contains_key("activeRun") {
        return Err("Agent run-event store is missing activeRun.".into());
    }
    let events = object
        .get("events")
        .and_then(Value::as_array)
        .ok_or("Agent run-event store events must be an array.")?;
    if events.len() > MAX_RUN_EVENT_COUNT {
        return Err(format!(
            "Agent run-event store exceeds the {MAX_RUN_EVENT_COUNT} event limit."
        ));
    }
    let mut event_ids = HashSet::with_capacity(events.len());
    for event in events {
        let event = event
            .as_object()
            .ok_or("Agent run-event entries must be JSON objects.")?;
        let required_text = |field: &str| -> Result<&str, String> {
            let value = event
                .get(field)
                .and_then(Value::as_str)
                .ok_or_else(|| format!("Agent run-event entry is missing {field}."))?;
            if value.is_empty() || value.len() > 160 {
                return Err(format!(
                    "Agent run-event {field} is outside its size limit."
                ));
            }
            Ok(value)
        };
        let event_id = required_text("eventId")?;
        required_text("runId")?;
        required_text("type")?;
        if event.get("at").and_then(Value::as_u64).is_none() {
            return Err("Agent run-event at must be a non-negative integer.".into());
        }
        if !event_ids.insert(event_id) {
            return Err(format!("Agent run-event id is duplicated: {event_id}"));
        }
    }
    if contains_secret(store) {
        return Err(
            "Agent run-event store contains credential-shaped content and cannot be written to Git."
                .into(),
        );
    }
    Ok(())
}

fn contains_secret(value: &Value) -> bool {
    match value {
        Value::Object(object) => object
            .iter()
            .any(|(key, value)| secret_key(key) || contains_secret(value)),
        Value::Array(values) => values.iter().any(contains_secret),
        Value::String(value) => secret_text(value),
        _ => false,
    }
}

fn secret_key(key: &str) -> bool {
    matches!(
        key.chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect::<String>()
            .as_str(),
        "authorization"
            | "apikey"
            | "accesstoken"
            | "authtoken"
            | "token"
            | "password"
            | "privatekey"
            | "secret"
            | "credential"
    )
}

fn secret_text(value: &str) -> bool {
    if crate::commands::scan_repository::credential_content(value.as_bytes()) {
        return true;
    }
    let lowercase = value.to_ascii_lowercase();
    if lowercase.contains("-----begin ") && lowercase.contains("private key-----") {
        return true;
    }
    [
        "authorization",
        "api_key",
        "api-key",
        "apikey",
        "access_token",
        "auth_token",
        "token",
        "password",
        "private_key",
        "private-key",
    ]
    .iter()
    .any(|name| contains_secret_assignment(&lowercase, name))
}

fn contains_secret_assignment(value: &str, name: &str) -> bool {
    value.match_indices(name).any(|(index, _)| {
        let before = value[..index].chars().next_back();
        if before.is_some_and(|character| character.is_ascii_alphanumeric() || character == '_') {
            return false;
        }
        let suffix = &value[index + name.len()..];
        let suffix = suffix.trim_start();
        let Some(suffix) = suffix
            .strip_prefix(':')
            .or_else(|| suffix.strip_prefix('='))
        else {
            return false;
        };
        suffix
            .trim_start_matches(|character: char| {
                character.is_ascii_whitespace() || matches!(character, '\'' | '"')
            })
            .chars()
            .take_while(|character| {
                !character.is_ascii_whitespace() && !matches!(character, '\'' | '"' | ',' | '}')
            })
            .count()
            >= 8
    })
}

async fn run_event_store_path(root: &Path, create_parent: bool) -> Result<PathBuf, String> {
    let root_metadata = fs::symlink_metadata(root)
        .await
        .map_err(|_| "The authorized workspace is unavailable.".to_string())?;
    if !root_metadata.is_dir() || root_metadata.file_type().is_symlink() {
        return Err("The authorized workspace must be a real directory.".into());
    }
    let canonical_root = fs::canonicalize(root)
        .await
        .map_err(|_| "The authorized workspace is unavailable.".to_string())?;
    if canonical_root != root {
        return Err("The authorized workspace identity changed.".into());
    }

    let cutout = root.join(".cutout");
    match fs::symlink_metadata(&cutout).await {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("The authorized workspace .cutout path must be a real directory.".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && create_parent => {
            fs::create_dir(&cutout)
                .await
                .map_err(|error| format!("Could not create the .cutout directory: {error}"))?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(cutout.join(RUN_EVENT_STORE_FILE))
        }
        Err(error) => return Err(error.to_string()),
    }

    let cutout_metadata = fs::symlink_metadata(&cutout)
        .await
        .map_err(|error| error.to_string())?;
    if cutout_metadata.file_type().is_symlink() || !cutout_metadata.is_dir() {
        return Err("The authorized workspace .cutout path must be a real directory.".into());
    }
    let canonical_cutout = fs::canonicalize(&cutout)
        .await
        .map_err(|error| error.to_string())?;
    if canonical_cutout.parent() != Some(canonical_root.as_path()) {
        return Err("The authorized workspace .cutout path escaped its root.".into());
    }

    let path = canonical_cutout.join(RUN_EVENT_STORE_FILE);
    match fs::symlink_metadata(&path).await {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err("The Agent run-event store must be a regular file.".into())
        }
        Ok(_) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path),
        Err(error) => Err(error.to_string()),
    }
}

async fn read_run_event_store(root: &Path) -> Result<RunEventStoreSnapshot, String> {
    let path = run_event_store_path(root, false).await?;
    let bytes = match read_regular_file_without_following(&path, MAX_RUN_EVENT_STORE_BYTES)? {
        Some(bytes) => bytes,
        None => {
            return Ok(RunEventStoreSnapshot {
                store: empty_run_event_store(),
                sha256: None,
                exists: false,
            })
        }
    };
    let store: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid Agent run-event store JSON: {error}"))?;
    validate_run_event_store(&store)?;
    Ok(RunEventStoreSnapshot {
        store,
        sha256: Some(hash(&bytes)),
        exists: true,
    })
}

fn read_regular_file_without_following(
    path: &Path,
    max_bytes: u64,
) -> Result<Option<Vec<u8>>, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not open Agent run-event store: {error}")),
    };
    let before = file
        .metadata()
        .map_err(|error| format!("Could not inspect Agent run-event store: {error}"))?;
    if !before.is_file() {
        return Err("The Agent run-event store must be a regular file.".into());
    }
    if before.len() > max_bytes {
        return Err(format!(
            "Agent run-event store exceeds the {max_bytes} byte limit."
        ));
    }
    let mut bytes = Vec::with_capacity(before.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read Agent run-event store: {error}"))?;
    let after = file
        .metadata()
        .map_err(|error| format!("Could not recheck Agent run-event store: {error}"))?;
    if !same_file_identity(&before, &after) || bytes.len() as u64 != after.len() {
        return Err("Agent run-event store changed while it was being read.".into());
    }
    Ok(Some(bytes))
}

#[cfg(unix)]
fn same_file_identity(before: &std::fs::Metadata, after: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    before.dev() == after.dev()
        && before.ino() == after.ino()
        && before.len() == after.len()
        && before.mtime() == after.mtime()
        && before.mtime_nsec() == after.mtime_nsec()
}

#[cfg(windows)]
fn same_file_identity(before: &std::fs::Metadata, after: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    before.file_attributes() == after.file_attributes()
        && before.creation_time() == after.creation_time()
        && before.last_write_time() == after.last_write_time()
        && before.file_size() == after.file_size()
}

fn validate_expected_sha256(expected_sha256: Option<&str>) -> Result<(), String> {
    if let Some(value) = expected_sha256 {
        if value.len() != 64
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
        {
            return Err("Expected Agent run-event SHA-256 must be a 64-character digest.".into());
        }
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8], expected_sha256: Option<&str>) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Agent run-event store has no parent directory.")?;
    let parent_identity = directory_identity(parent)?;
    let temporary = parent.join(format!(
        ".{RUN_EVENT_STORE_FILE}.{}.tmp",
        uuid::Uuid::new_v4()
    ));
    let result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| format!("Could not create Agent run-event temporary file: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("Could not write Agent run-event store: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Could not sync Agent run-event store: {error}"))?;
        drop(file);
        if directory_identity(parent)? != parent_identity {
            return Err("The .cutout directory changed while writing Agent run events.".into());
        }
        let current = read_regular_file_without_following(path, MAX_RUN_EVENT_STORE_BYTES)?;
        let current_sha256 = current.as_deref().map(hash);
        if current_sha256.as_deref() != expected_sha256 {
            return Err(
                "Agent run-event store changed while the replacement was being prepared.".into(),
            );
        }
        atomic_replace(&temporary, path)
            .map_err(|error| format!("Could not publish Agent run-event store: {error}"))?;
        sync_parent_directory(parent)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(unix)]
#[derive(PartialEq, Eq)]
struct DirectoryIdentity {
    canonical: PathBuf,
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn directory_identity(path: &Path) -> Result<DirectoryIdentity, String> {
    use std::os::unix::fs::MetadataExt;

    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("Could not inspect the .cutout directory: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("The .cutout path must remain a real directory.".into());
    }
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("Could not resolve the .cutout directory: {error}"))?;
    Ok(DirectoryIdentity {
        canonical,
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
#[derive(PartialEq, Eq)]
struct DirectoryIdentity {
    canonical: PathBuf,
    created: u64,
    attributes: u32,
}

#[cfg(windows)]
fn directory_identity(path: &Path) -> Result<DirectoryIdentity, String> {
    use std::os::windows::fs::MetadataExt;

    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("Could not inspect the .cutout directory: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("The .cutout path must remain a real directory.".into());
    }
    Ok(DirectoryIdentity {
        canonical: std::fs::canonicalize(path)
            .map_err(|error| format!("Could not resolve the .cutout directory: {error}"))?,
        created: metadata.creation_time(),
        attributes: metadata.file_attributes(),
    })
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> Result<(), String> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("Could not sync the .cutout directory: {error}"))
}

#[cfg(windows)]
fn sync_parent_directory(_parent: &Path) -> Result<(), String> {
    // MoveFileExW/ReplaceFileW use their write-through flags below.
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace(temporary: &Path, path: &Path) -> std::io::Result<()> {
    std::fs::rename(temporary, path)
}

async fn write_run_event_store(
    root: &Path,
    expected_sha256: Option<&str>,
    store: Value,
) -> Result<RunEventStoreSnapshot, String> {
    validate_expected_sha256(expected_sha256)?;
    validate_run_event_store(&store)?;
    let mut bytes = serde_json::to_vec_pretty(&store).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    if bytes.len() as u64 > MAX_RUN_EVENT_STORE_BYTES {
        return Err(format!(
            "Agent run-event store exceeds the {MAX_RUN_EVENT_STORE_BYTES} byte limit."
        ));
    }

    let path = run_event_store_path(root, true).await?;
    let current = read_regular_file_without_following(&path, MAX_RUN_EVENT_STORE_BYTES)?;
    let current_sha256 = current.as_deref().map(hash);
    if current_sha256.as_deref() != expected_sha256 {
        return Err(
            "Agent run-event store changed since it was read; reload before writing.".into(),
        );
    }

    let expected_persisted_sha256 = hash(&bytes);
    atomic_write(&path, &bytes, expected_sha256)?;
    let persisted = read_run_event_store(root).await?;
    if persisted.sha256.as_deref() != Some(expected_persisted_sha256.as_str()) {
        return Err("Agent run-event store changed while it was being committed.".into());
    }
    Ok(persisted)
}

#[cfg(windows)]
fn atomic_replace(temporary: &Path, path: &Path) -> std::io::Result<()> {
    use std::{iter::once, os::windows::ffi::OsStrExt, ptr::null};
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_WRITE_THROUGH, REPLACEFILE_WRITE_THROUGH,
    };

    let target_exists = path.exists();
    let temporary = temporary
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let path = path
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let succeeded = unsafe {
        if target_exists {
            ReplaceFileW(
                path.as_ptr(),
                temporary.as_ptr(),
                null(),
                REPLACEFILE_WRITE_THROUGH,
                null(),
                null(),
            )
        } else {
            MoveFileExW(temporary.as_ptr(), path.as_ptr(), MOVEFILE_WRITE_THROUGH)
        }
    };
    if succeeded == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}
fn revision(document: &Value) -> Result<(String, u64), String> {
    let value = document
        .get("revision")
        .ok_or("Design IR revision is missing.")?;
    Ok((
        value
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Design IR revision id is missing.")?
            .to_owned(),
        value
            .get("number")
            .and_then(Value::as_u64)
            .ok_or("Design IR revision number is missing.")?,
    ))
}

#[tauri::command]
pub async fn workspace_revision_read(
    registry: State<'_, RegistryDesktopState>,
    workspace_handle: String,
) -> Result<WorkspaceRevision, String> {
    let root = authorized(&registry, &workspace_handle)?;
    let bytes = fs::read(design_ir_path(&root).await?)
        .await
        .map_err(|e| e.to_string())?;
    let document: Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid Design IR: {e}"))?;
    let (revision_id, revision_number) = revision(&document)?;
    Ok(WorkspaceRevision {
        document,
        sha256: hash(&bytes),
        revision_id,
        revision_number,
    })
}

#[tauri::command]
pub async fn workspace_run_events_read(
    registry: State<'_, RegistryDesktopState>,
    workspace_handle: String,
) -> Result<RunEventStoreSnapshot, String> {
    let root = authorized(&registry, &workspace_handle)?;
    read_run_event_store(&root).await
}

#[tauri::command]
pub async fn workspace_run_events_write(
    registry: State<'_, RegistryDesktopState>,
    state: State<'_, WorkspaceBridgeState>,
    workspace_handle: String,
    expected_sha256: Option<String>,
    store: Value,
) -> Result<RunEventStoreSnapshot, String> {
    let _guard = state.run_event_write.lock().await;
    let root = authorized(&registry, &workspace_handle)?;
    write_run_event_store(&root, expected_sha256.as_deref(), store).await
}

#[tauri::command]
pub async fn workspace_revision_preview_export(
    registry: State<'_, RegistryDesktopState>,
    state: State<'_, WorkspaceBridgeState>,
    workspace_handle: String,
    expected_sha256: String,
    document: Value,
) -> Result<ExportPlan, String> {
    let root = authorized(&registry, &workspace_handle)?;
    let path = design_ir_path(&root).await?;
    let current = fs::read(&path).await.map_err(|e| e.to_string())?;
    revision(&document)?;
    let next = serde_json::to_vec_pretty(&document).map_err(|e| e.to_string())?;
    let current_sha256 = hash(&current);
    let next_sha256 = hash(&next);
    let conflict = current_sha256 != expected_sha256;
    let id = format!(
        "workspace-export.{}",
        &hash(
            format!("{workspace_handle}:{expected_sha256}:{current_sha256}:{next_sha256}")
                .as_bytes()
        )[..24]
    );
    let plan = ExportPlan {
        id: id.clone(),
        workspace_handle,
        expected_sha256,
        current_sha256,
        next_sha256,
        conflict,
        requires_approval: true,
        document,
    };
    state
        .plans
        .lock()
        .map_err(|_| "Workspace bridge lock poisoned.")?
        .insert(id, plan.clone());
    Ok(plan)
}

#[tauri::command]
pub async fn workspace_revision_apply_export(
    app: tauri::AppHandle,
    registry: State<'_, RegistryDesktopState>,
    state: State<'_, WorkspaceBridgeState>,
    plan_id: String,
) -> Result<WorkspaceRevision, String> {
    let plan = state
        .plans
        .lock()
        .map_err(|_| "Workspace bridge lock poisoned.")?
        .remove(&plan_id)
        .ok_or("Export plan is missing or expired.")?;
    if plan.conflict {
        return Err("External Design IR changed; import or resolve before export.".into());
    }
    crate::commands::native_approval::require_native_confirmation(
        &app,
        "Approve Design IR export",
        "Write the reviewed Design IR revision into the selected workspace?",
    )
    .await?;
    let root = authorized(&registry, &plan.workspace_handle)?;
    let path = design_ir_path(&root).await?;
    let current = fs::read(&path).await.map_err(|e| e.to_string())?;
    if hash(&current) != plan.current_sha256 {
        return Err("External Design IR changed after preview.".into());
    }
    let bytes = serde_json::to_vec_pretty(&plan.document).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("cutout.tmp");
    fs::write(&tmp, &bytes).await.map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).await.map_err(|e| e.to_string())?;
    let (revision_id, revision_number) = revision(&plan.document)?;
    Ok(WorkspaceRevision {
        document: plan.document,
        sha256: hash(&bytes),
        revision_id,
        revision_number,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::tempdir;

    fn run_event_store(events: Vec<Value>) -> Value {
        serde_json::json!({
            "version": "agent-run-events.v1",
            "activeRunId": events.last().and_then(|event| event.get("runId")).cloned(),
            "events": events,
            "activeRun": null,
        })
    }

    fn run_started(event_id: &str) -> Value {
        serde_json::json!({
            "eventId": event_id,
            "runId": "run.1",
            "at": 1,
            "type": "run-started",
            "mode": "create",
        })
    }

    #[test]
    fn rejects_unsafe_manifest_paths() {
        let value = Value::Null;
        assert!(revision(&value).is_err());
        assert_eq!(hash(b"a").len(), 64);
    }

    #[test]
    fn reads_authoritative_design_ir_from_cutout_manifest() {
        tauri::async_runtime::block_on(async {
            let workspace = tempdir().unwrap();
            let cutout = workspace.path().join(".cutout");
            std::fs::create_dir(&cutout).unwrap();
            std::fs::write(
                cutout.join("manifest.json"),
                r#"{"files":{"designIr":"design-ir.json"}}"#,
            )
            .unwrap();
            std::fs::write(
                cutout.join("design-ir.json"),
                r#"{"revision":{"id":"revision-smoke","number":1}}"#,
            )
            .unwrap();

            let path = design_ir_path(workspace.path()).await.unwrap();
            assert_eq!(path, cutout.join("design-ir.json").canonicalize().unwrap());
            let bytes = fs::read(path).await.unwrap();
            let document: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(revision(&document).unwrap(), ("revision-smoke".into(), 1));
        });
    }

    #[test]
    fn run_event_store_reads_missing_and_round_trips_fixed_path() {
        tauri::async_runtime::block_on(async {
            let workspace = tempdir().unwrap();
            let root = workspace.path().canonicalize().unwrap();
            let missing = read_run_event_store(&root).await.unwrap();
            assert!(!missing.exists);
            assert_eq!(missing.sha256, None);
            assert_eq!(missing.store, empty_run_event_store());

            let store = run_event_store(vec![run_started("event.1")]);
            let written = write_run_event_store(&root, None, store.clone())
                .await
                .unwrap();
            assert!(written.exists);
            assert_eq!(written.store, store);
            assert!(written.sha256.is_some());
            assert!(workspace.path().join(".cutout/run-events.json").is_file());
            assert!(!workspace.path().join("run-events.json").exists());
        });
    }

    #[test]
    fn run_event_store_rejects_conflicts_malformed_payloads_and_duplicate_ids() {
        tauri::async_runtime::block_on(async {
            let workspace = tempdir().unwrap();
            let root = workspace.path().canonicalize().unwrap();
            let original =
                write_run_event_store(&root, None, run_event_store(vec![run_started("event.1")]))
                    .await
                    .unwrap();
            let error = write_run_event_store(
                &root,
                Some(&"0".repeat(64)),
                run_event_store(vec![run_started("event.2")]),
            )
            .await
            .unwrap_err();
            assert!(error.contains("changed since it was read"));
            assert_eq!(
                read_run_event_store(&root).await.unwrap().sha256,
                original.sha256
            );

            std::fs::write(
                workspace.path().join(".cutout/run-events.json"),
                br#"{"version":"agent-run-events.v1","activeRunId":null,"events":"bad","activeRun":null}"#,
            )
            .unwrap();
            assert!(read_run_event_store(&root)
                .await
                .unwrap_err()
                .contains("events must be an array"));
            assert!(validate_run_event_store(&run_event_store(vec![
                run_started("event.1"),
                run_started("event.1"),
            ]))
            .unwrap_err()
            .contains("duplicated"));
        });
    }

    #[test]
    fn run_event_store_enforces_count_and_payload_bounds() {
        let too_many = run_event_store(vec![Value::Null; MAX_RUN_EVENT_COUNT + 1]);
        assert!(validate_run_event_store(&too_many)
            .unwrap_err()
            .contains("event limit"));

        let mut oversized = run_started("event.1");
        oversized["message"] = Value::String("x".repeat(MAX_RUN_EVENT_STORE_BYTES as usize));
        let bytes = serde_json::to_vec_pretty(&run_event_store(vec![oversized])).unwrap();
        assert!(bytes.len() as u64 > MAX_RUN_EVENT_STORE_BYTES);
    }

    #[test]
    fn run_event_store_rejects_credentials_without_writing_them() {
        tauri::async_runtime::block_on(async {
            let workspace = tempdir().unwrap();
            let root = workspace.path().canonicalize().unwrap();
            let mut event = run_started("event.secret");
            event["message"] =
                Value::String("Use sk-this-is-a-secret-value for the request".into());
            let error = write_run_event_store(&root, None, run_event_store(vec![event]))
                .await
                .unwrap_err();
            assert!(error.contains("credential-shaped"));
            assert!(!workspace.path().join(".cutout/run-events.json").exists());
            for key in ["authorization", "apiKey", "token", "password", "privateKey"] {
                assert!(secret_key(key));
            }
            assert!(secret_text("password=correct-horse-battery-staple"));
            assert!(secret_text("-----BEGIN PRIVATE KEY-----"));
            assert!(!secret_text("Please ask-something about the design"));
        });
    }

    #[cfg(unix)]
    #[test]
    fn run_event_store_rejects_symlinked_cutout_and_file() {
        use std::os::unix::fs::symlink;

        tauri::async_runtime::block_on(async {
            let workspace = tempdir().unwrap();
            let outside = tempdir().unwrap();
            let root = workspace.path().canonicalize().unwrap();
            symlink(outside.path(), workspace.path().join(".cutout")).unwrap();
            assert!(read_run_event_store(&root)
                .await
                .unwrap_err()
                .contains("real directory"));

            std::fs::remove_file(workspace.path().join(".cutout")).unwrap();
            std::fs::create_dir(workspace.path().join(".cutout")).unwrap();
            let outside_file = outside.path().join("events.json");
            std::fs::write(
                &outside_file,
                serde_json::to_vec(&empty_run_event_store()).unwrap(),
            )
            .unwrap();
            symlink(
                &outside_file,
                workspace.path().join(".cutout/run-events.json"),
            )
            .unwrap();
            assert!(read_regular_file_without_following(
                &workspace.path().join(".cutout/run-events.json"),
                MAX_RUN_EVENT_STORE_BYTES,
            )
            .unwrap_err()
            .contains("Could not open"));
            assert!(read_run_event_store(&root)
                .await
                .unwrap_err()
                .contains("regular file"));
        });
    }

    #[test]
    fn run_event_store_requires_an_authorized_handle() {
        let registry = RegistryDesktopState::default();
        assert!(authorized(&registry, "workspace.missing")
            .unwrap_err()
            .contains("missing or expired"));
    }

    #[test]
    fn run_event_store_is_visible_to_git_at_the_fixed_repository_path() {
        tauri::async_runtime::block_on(async {
            let workspace = tempdir().unwrap();
            let root = workspace.path().canonicalize().unwrap();
            let initialized = Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(workspace.path())
                .status();
            let Ok(initialized) = initialized else {
                return;
            };
            if !initialized.success() {
                return;
            }
            write_run_event_store(&root, None, run_event_store(vec![run_started("event.git")]))
                .await
                .unwrap();
            let status = Command::new("git")
                .args([
                    "-c",
                    "core.excludesFile=/dev/null",
                    "status",
                    "--porcelain",
                    "--",
                    ".cutout/run-events.json",
                ])
                .current_dir(workspace.path())
                .output()
                .unwrap();
            assert!(status.status.success());
            assert_eq!(
                String::from_utf8(status.stdout).unwrap(),
                "?? .cutout/run-events.json\n"
            );
        });
    }
}
