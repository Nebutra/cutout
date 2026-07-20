use super::registry_desktop::{authorized, RegistryDesktopState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::State;
use tokio::fs;

#[derive(Default)]
pub struct WorkspaceBridgeState {
    plans: Mutex<HashMap<String, ExportPlan>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRevision {
    document: Value,
    sha256: String,
    revision_id: String,
    revision_number: u64,
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
    registry: State<'_, RegistryDesktopState>,
    state: State<'_, WorkspaceBridgeState>,
    plan_id: String,
    approval_id: String,
) -> Result<WorkspaceRevision, String> {
    if approval_id.trim().is_empty() {
        return Err("Explicit approval id is required.".into());
    }
    let plan = state
        .plans
        .lock()
        .map_err(|_| "Workspace bridge lock poisoned.")?
        .remove(&plan_id)
        .ok_or("Export plan is missing or expired.")?;
    if plan.conflict {
        return Err("External Design IR changed; import or resolve before export.".into());
    }
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
    use tempfile::tempdir;

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
}
