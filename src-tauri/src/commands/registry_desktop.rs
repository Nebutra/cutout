use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tokio::{fs, sync::oneshot};

#[derive(Default)]
pub struct RegistryDesktopState {
    roots: Mutex<HashMap<String, PathBuf>>,
    plans: Mutex<HashMap<String, InstallPlan>>,
    receipts: Mutex<HashMap<String, InstallReceipt>>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFile {
    path: String,
    bytes_base64: String,
    sha256: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diff {
    path: String,
    status: String,
    before_hash: Option<String>,
    after_hash: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    protocol: String,
    id: String,
    workspace_handle: String,
    item_id: String,
    item_version: String,
    files: Vec<Diff>,
    conflicts: Vec<String>,
    requires_approval: bool,
    #[serde(skip)]
    payload: Vec<InstallFile>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReceipt {
    protocol: String,
    plan_id: String,
    item_id: String,
    item_version: String,
    status: String,
    file_hashes: Vec<ReceiptFile>,
    approval_id: String,
    completed_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptFile {
    path: String,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAuthorization {
    canceled: bool,
    handle: Option<String>,
    label: Option<String>,
}

#[tauri::command]
pub async fn registry_authorize_workspace<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, RegistryDesktopState>,
) -> Result<WorkspaceAuthorization, String> {
    let (tx, rx) = oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let Some(folder) = rx
        .await
        .map_err(|_| "Folder picker closed unexpectedly.".to_string())?
    else {
        return Ok(WorkspaceAuthorization {
            canceled: true,
            handle: None,
            label: None,
        });
    };
    let path = folder.into_path().map_err(|e| e.to_string())?;
    let root = fs::canonicalize(&path).await.map_err(|e| e.to_string())?;
    let metadata = fs::symlink_metadata(&root)
        .await
        .map_err(|e| e.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Registry workspace must be a real directory.".into());
    }
    let handle = format!(
        "workspace.{}",
        &hex(&Sha256::digest(
            format!("{}:{}", root.display(), uuid()).as_bytes()
        ))[..24]
    );
    state
        .roots
        .lock()
        .map_err(lock)?
        .insert(handle.clone(), root.clone());
    for receipt in load_receipts(&root).await? {
        state
            .receipts
            .lock()
            .map_err(lock)?
            .insert(receipt.plan_id.clone(), receipt);
    }
    Ok(WorkspaceAuthorization {
        canceled: false,
        handle: Some(handle),
        label: root.file_name().map(|v| v.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub async fn registry_preview_install(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    item_id: String,
    item_version: String,
    files: Vec<InstallFile>,
) -> Result<InstallPlan, String> {
    let root = authorized(&state, &workspace_handle)?;
    let mut diffs = Vec::new();
    for file in &files {
        let target = checked_target(&root, &file.path).await?;
        let bytes = decode_and_verify(file)?;
        let after = hash(&bytes);
        let before = read_hash(&target).await?;
        let status = match &before {
            None => "create",
            Some(value) if value == &after => "unchanged",
            Some(_) => "three-way-conflict",
        };
        diffs.push(Diff {
            path: file.path.clone(),
            status: status.into(),
            before_hash: before,
            after_hash: after,
        });
    }
    let conflicts = diffs
        .iter()
        .filter(|d| d.status == "three-way-conflict")
        .map(|d| d.path.clone())
        .collect::<Vec<_>>();
    let id = format!(
        "install.{}",
        &hex(&Sha256::digest(
            serde_json::to_vec(&(&workspace_handle, &item_id, &item_version, &diffs))
                .map_err(|e| e.to_string())?
        ))[..24]
    );
    let plan = InstallPlan {
        protocol: "cutout.registry-install-plan.v1".into(),
        id: id.clone(),
        workspace_handle,
        item_id,
        item_version,
        files: diffs,
        conflicts,
        requires_approval: true,
        payload: files,
    };
    state.plans.lock().map_err(lock)?.insert(id, plan.clone());
    Ok(plan)
}

#[tauri::command]
pub async fn registry_apply_install(
    app: AppHandle,
    state: State<'_, RegistryDesktopState>,
    plan_id: String,
) -> Result<InstallReceipt, String> {
    if let Some(receipt) = state.receipts.lock().map_err(lock)?.get(&plan_id).cloned() {
        return Ok(receipt);
    }
    let plan = state
        .plans
        .lock()
        .map_err(lock)?
        .get(&plan_id)
        .cloned()
        .ok_or("Install plan is missing or expired.")?;
    if !plan.conflicts.is_empty() {
        return Err("Install has unresolved conflicts.".into());
    }
    let approval_id = crate::commands::native_approval::require_native_confirmation(
        &app,
        "Approve registry install",
        &format!(
            "Install {} {} into the selected workspace? This writes {} reviewed file(s).",
            plan.item_id,
            plan.item_version,
            plan.files.len()
        ),
    )
    .await?;
    let root = authorized(&state, &plan.workspace_handle)?;
    let receipt = apply_plan(&root, &plan, approval_id, None).await?;
    state
        .receipts
        .lock()
        .map_err(lock)?
        .insert(plan_id, receipt.clone());
    Ok(receipt)
}

#[tauri::command]
pub async fn registry_validate_install(
    state: State<'_, RegistryDesktopState>,
    workspace_handle: String,
    receipt: InstallReceipt,
) -> Result<bool, String> {
    let root = authorized(&state, &workspace_handle)?;
    for file in receipt.file_hashes {
        let bytes = fs::read(checked_target(&root, &file.path).await?)
            .await
            .map_err(|e| e.to_string())?;
        if hash(&bytes) != file.sha256 {
            return Ok(false);
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn registry_install_receipt(
    state: State<'_, RegistryDesktopState>,
    plan_id: String,
) -> Result<Option<InstallReceipt>, String> {
    Ok(state.receipts.lock().map_err(lock)?.get(&plan_id).cloned())
}

async fn apply_plan(
    root: &Path,
    plan: &InstallPlan,
    approval_id: String,
    fail_after: Option<usize>,
) -> Result<InstallReceipt, String> {
    // Recheck the exact preview snapshot before touching disk (CAS/stale-plan guard).
    for diff in &plan.files {
        let current = read_hash(&checked_target(root, &diff.path).await?).await?;
        if current != diff.before_hash {
            return Err(format!(
                "Install plan is stale: {} changed after preview.",
                diff.path
            ));
        }
    }
    let transaction = root
        .join(".cutout/registry")
        .join(format!("transaction-{}", uuid()));
    let staged_root = transaction.join("staged");
    let backup_root = transaction.join("backup");
    fs::create_dir_all(&staged_root)
        .await
        .map_err(|e| e.to_string())?;
    for file in &plan.payload {
        let bytes = decode_and_verify(file)?;
        let staged = target(&staged_root, &file.path)?;
        if let Some(parent) = staged.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| e.to_string())?;
        }
        fs::write(&staged, bytes).await.map_err(|e| e.to_string())?;
    }
    let mut committed: Vec<(PathBuf, Option<PathBuf>)> = Vec::new();
    let result: Result<(), String> = async {
        for (index, file) in plan.payload.iter().enumerate() {
            if fail_after == Some(index) {
                return Err("Injected registry commit failure.".into());
            }
            let destination = checked_target(root, &file.path).await?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            let backup = if fs::symlink_metadata(&destination).await.is_ok() {
                let path = target(&backup_root, &file.path)?;
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)
                        .await
                        .map_err(|e| e.to_string())?;
                }
                fs::rename(&destination, &path)
                    .await
                    .map_err(|e| e.to_string())?;
                Some(path)
            } else {
                None
            };
            committed.push((destination.clone(), backup));
            fs::rename(target(&staged_root, &file.path)?, destination)
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        rollback(&mut committed).await;
        let _ = fs::remove_dir_all(&transaction).await;
        return Err(error);
    }
    let receipt = InstallReceipt {
        protocol: "cutout.registry-install-receipt.v1".into(),
        plan_id: plan.id.clone(),
        item_id: plan.item_id.clone(),
        item_version: plan.item_version.clone(),
        status: if plan.files.iter().all(|f| f.status == "unchanged") {
            "no-op".into()
        } else {
            "succeeded".into()
        },
        file_hashes: plan
            .files
            .iter()
            .map(|d| ReceiptFile {
                path: d.path.clone(),
                sha256: d.after_hash.clone(),
            })
            .collect(),
        approval_id,
        completed_at: now(),
    };
    if let Err(error) = persist_receipt(root, &receipt).await {
        rollback(&mut committed).await;
        let _ = fs::remove_dir_all(&transaction).await;
        return Err(error);
    }
    let _ = fs::remove_dir_all(&transaction).await;
    Ok(receipt)
}

async fn rollback(committed: &mut Vec<(PathBuf, Option<PathBuf>)>) {
    for (destination, backup) in committed.drain(..).rev() {
        let _ = fs::remove_file(&destination).await;
        if let Some(backup) = backup {
            let _ = fs::rename(backup, destination).await;
        }
    }
}

async fn persist_receipt(root: &Path, receipt: &InstallReceipt) -> Result<(), String> {
    let dir = root.join(".cutout/registry/receipts");
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let destination = dir.join(format!("{}.json", safe_name(&receipt.plan_id)));
    let temporary = dir.join(format!(".{}.{}.tmp", safe_name(&receipt.plan_id), uuid()));
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(receipt).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    fs::rename(&temporary, &destination)
        .await
        .map_err(|e| e.to_string())
}

async fn load_receipts(root: &Path) -> Result<Vec<InstallReceipt>, String> {
    let dir = root.join(".cutout/registry/receipts");
    let mut entries = match fs::read_dir(&dir).await {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut receipts = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        if entry
            .file_type()
            .await
            .map_err(|e| e.to_string())?
            .is_symlink()
        {
            continue;
        }
        let bytes = fs::read(entry.path()).await.map_err(|e| e.to_string())?;
        let Ok(receipt) = serde_json::from_slice::<InstallReceipt>(&bytes) else {
            continue;
        };
        if receipt.protocol != "cutout.registry-install-receipt.v1"
            || receipt.status != "succeeded" && receipt.status != "no-op"
        {
            continue;
        }
        if !receipt.file_hashes.iter().all(|f| {
            target(root, &f.path).is_ok()
                && f.sha256.len() == 64
                && f.sha256.bytes().all(|c| c.is_ascii_hexdigit())
        }) {
            continue;
        }
        let mut intact = true;
        for file in &receipt.file_hashes {
            let Ok(path) = checked_target(root, &file.path).await else {
                intact = false;
                break;
            };
            if read_hash(&path).await? != Some(file.sha256.clone()) {
                intact = false;
                break;
            }
        }
        if intact {
            receipts.push(receipt);
        }
    }
    Ok(receipts)
}

async fn checked_target(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let value = target(root, relative)?;
    let mut cursor = root.to_path_buf();
    for part in Path::new(relative).components() {
        cursor.push(part);
        match fs::symlink_metadata(&cursor).await {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!("Registry target traverses a symlink: {}", relative))
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(value)
}

fn decode_and_verify(file: &InstallFile) -> Result<Vec<u8>, String> {
    let bytes = STANDARD
        .decode(&file.bytes_base64)
        .map_err(|_| "Invalid registry file encoding.".to_string())?;
    if hash(&bytes) != file.sha256.to_lowercase() {
        return Err(format!("Registry file hash mismatch: {}", file.path));
    }
    Ok(bytes)
}

async fn read_hash(path: &Path) -> Result<Option<String>, String> {
    match fs::read(path).await {
        Ok(value) => Ok(Some(hash(&value))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) fn authorized(state: &RegistryDesktopState, handle: &str) -> Result<PathBuf, String> {
    state
        .roots
        .lock()
        .map_err(lock)?
        .get(handle)
        .cloned()
        .ok_or("Workspace authorization handle is missing or expired.".into())
}
fn target(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty()
        || relative.starts_with('/')
        || relative
            .split(['/', '\\'])
            .any(|part| part.is_empty() || part == "." || part == "..")
        || relative.starts_with(".cutout/")
    {
        return Err("Registry target must be a safe project-relative path.".into());
    }
    let value = root.join(relative);
    if !value.starts_with(root) {
        return Err("Registry target escapes authorized workspace.".into());
    }
    Ok(value)
}
fn hash(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn uuid() -> String {
    format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}
fn now() -> String {
    "2026-07-12T00:00:00Z".into()
}
fn safe_name(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
fn lock<T>(_: std::sync::PoisonError<T>) -> String {
    "Registry state lock poisoned.".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn file(path: &str, bytes: &[u8]) -> InstallFile {
        InstallFile {
            path: path.into(),
            bytes_base64: STANDARD.encode(bytes),
            sha256: hash(bytes),
        }
    }
    fn plan(_root: &Path, files: Vec<InstallFile>) -> InstallPlan {
        let diffs = files
            .iter()
            .map(|f| Diff {
                path: f.path.clone(),
                status: "create".into(),
                before_hash: None,
                after_hash: f.sha256.clone(),
            })
            .collect();
        InstallPlan {
            protocol: "cutout.registry-install-plan.v1".into(),
            id: "install.test".into(),
            workspace_handle: "workspace.test".into(),
            item_id: "item.test".into(),
            item_version: "1.0.0".into(),
            files: diffs,
            conflicts: vec![],
            requires_approval: true,
            payload: files,
        }
    }

    #[test]
    fn rejects_unsafe_targets() {
        let root = PathBuf::from("/tmp/project");
        assert!(target(&root, "../escape").is_err());
        assert!(target(&root, ".cutout/policy.json").is_err());
        assert!(target(&root, "src/Button.tsx").is_ok());
    }

    #[test]
    fn rejects_stale_plan_before_writing() {
        tauri::async_runtime::block_on(async {
            let dir = tempdir().unwrap();
            let p = plan(dir.path(), vec![file("a.txt", b"new")]);
            fs::write(dir.path().join("a.txt"), b"changed")
                .await
                .unwrap();
            let error = apply_plan(dir.path(), &p, "approval".into(), None)
                .await
                .unwrap_err();
            assert!(error.contains("stale"));
            assert_eq!(
                fs::read(dir.path().join("a.txt")).await.unwrap(),
                b"changed"
            );
        });
    }

    #[test]
    fn rolls_back_a_mid_commit_failure() {
        tauri::async_runtime::block_on(async {
            let dir = tempdir().unwrap();
            let p = plan(
                dir.path(),
                vec![file("a.txt", b"one"), file("nested/b.txt", b"two")],
            );
            let error = apply_plan(dir.path(), &p, "approval".into(), Some(1))
                .await
                .unwrap_err();
            assert!(error.contains("Injected"));
            assert!(!dir.path().join("a.txt").exists());
            assert!(!dir.path().join("nested/b.txt").exists());
        });
    }

    #[test]
    fn restores_an_existing_file_on_mid_commit_failure() {
        tauri::async_runtime::block_on(async {
            let dir = tempdir().unwrap();
            fs::write(dir.path().join("a.txt"), b"old").await.unwrap();
            let mut p = plan(
                dir.path(),
                vec![file("a.txt", b"new"), file("b.txt", b"two")],
            );
            p.files[0].before_hash = Some(hash(b"old"));
            p.files[0].status = "update".into();
            apply_plan(dir.path(), &p, "approval".into(), Some(1))
                .await
                .unwrap_err();
            assert_eq!(fs::read(dir.path().join("a.txt")).await.unwrap(), b"old");
            assert!(!dir.path().join("b.txt").exists());
        });
    }

    #[test]
    fn persists_and_recovers_receipt_after_restart() {
        tauri::async_runtime::block_on(async {
            let dir = tempdir().unwrap();
            let p = plan(dir.path(), vec![file("a.txt", b"one")]);
            let receipt = apply_plan(dir.path(), &p, "approval".into(), None)
                .await
                .unwrap();
            let recovered = load_receipts(dir.path()).await.unwrap();
            assert_eq!(recovered.len(), 1);
            assert_eq!(recovered[0].plan_id, receipt.plan_id);
            assert_eq!(fs::read(dir.path().join("a.txt")).await.unwrap(), b"one");
            fs::write(dir.path().join("a.txt"), b"tampered")
                .await
                .unwrap();
            assert!(load_receipts(dir.path()).await.unwrap().is_empty());
        });
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_ancestors() {
        tauri::async_runtime::block_on(async {
            use std::os::unix::fs::symlink;
            let dir = tempdir().unwrap();
            let outside = tempdir().unwrap();
            symlink(outside.path(), dir.path().join("linked")).unwrap();
            assert!(checked_target(dir.path(), "linked/file.txt")
                .await
                .unwrap_err()
                .contains("symlink"));
        });
    }

    #[test]
    fn rejects_payload_hash_mismatch_and_unsafe_receipt_files() {
        tauri::async_runtime::block_on(async {
            let dir = tempdir().unwrap();
            let mut bad = file("a.txt", b"one");
            bad.sha256 = "0".repeat(64);
            assert!(apply_plan(
                dir.path(),
                &plan(dir.path(), vec![bad]),
                "approval".into(),
                None
            )
            .await
            .unwrap_err()
            .contains("hash mismatch"));
            let receipts = dir.path().join(".cutout/registry/receipts");
            fs::create_dir_all(&receipts).await.unwrap();
            fs::write(receipts.join("bad.json"), br#"{"protocol":"cutout.registry-install-receipt.v1","planId":"bad","itemId":"x","itemVersion":"1","status":"succeeded","fileHashes":[{"path":"../escape","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"approvalId":"x","completedAt":"x"}"#).await.unwrap();
            assert!(load_receipts(dir.path()).await.unwrap().is_empty());
        });
    }
}
