//! File-queue control plane for AI-native automation.
//!
//! External agents write JSON commands into the app data `ai-native/inbox`
//! directory. The web app polls them through these commands, executes the action
//! in-process, then writes a JSON response into `ai-native/outbox`.

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const AI_NATIVE_DIR: &str = "ai-native";
const DEFAULT_POLL_LIMIT: usize = 8;
const MAX_POLL_LIMIT: usize = 32;
const MAX_IMPORT_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiNativePaths {
    root: String,
    inbox: String,
    processing: String,
    outbox: String,
    failed: String,
    imports: String,
    artifacts: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiNativeEnvelope {
    id: String,
    action: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiNativeFile {
    name: String,
    media_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiNativeArtifact {
    path: String,
    name: String,
    media_type: String,
    byte_length: usize,
}

#[tauri::command]
pub fn ai_native_paths(app: AppHandle) -> Result<AiNativePaths, String> {
    let root = ai_native_root(&app)?;
    ensure_dirs(&root)
}

#[tauri::command]
pub fn ai_native_poll(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<AiNativeEnvelope>, String> {
    let root = ai_native_root(&app)?;
    ensure_dirs(&root)?;

    let inbox = root.join("inbox");
    let processing = root.join("processing");
    let failed = root.join("failed");
    let limit = limit.unwrap_or(DEFAULT_POLL_LIMIT).clamp(1, MAX_POLL_LIMIT);

    let mut entries = fs::read_dir(&inbox)
        .map_err(|error| format!("Could not read AI Native inbox: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect::<Vec<_>>();
    entries.sort_by_key(|path| path.file_name().map(|name| name.to_os_string()));

    let mut envelopes = Vec::new();
    for path in entries.into_iter().take(limit) {
        let fallback_id = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("command")
            .to_string();
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("Could not read AI Native command: {error}"))?;

        let value = match serde_json::from_str::<Value>(&raw) {
            Ok(value) => value,
            Err(error) => {
                let failed_id = sanitize_id(&fallback_id);
                write_json_atomic(
                    &failed.join(format!("{failed_id}.json")),
                    &json!({
                        "id": failed_id,
                        "ok": false,
                        "error": format!("Invalid JSON: {error}"),
                        "raw": raw,
                        "failedAt": now_millis(),
                    }),
                )?;
                remove_if_exists(&path)?;
                continue;
            }
        };

        let (id, action) = split_envelope(value, &fallback_id);
        let id = sanitize_id(&id);
        let processing_path = processing.join(format!("{id}.json"));
        if processing_path.exists() {
            remove_if_exists(&processing_path)?;
        }
        fs::rename(&path, &processing_path).map_err(|error| {
            format!("Could not move AI Native command into processing queue: {error}")
        })?;
        envelopes.push(AiNativeEnvelope { id, action });
    }

    Ok(envelopes)
}

#[tauri::command]
pub fn ai_native_complete(app: AppHandle, id: String, result: Value) -> Result<(), String> {
    let root = ai_native_root(&app)?;
    ensure_dirs(&root)?;

    let id = sanitize_id(&id);
    let outbox = root.join("outbox").join(format!("{id}.json"));
    write_json_atomic(
        &outbox,
        &json!({
            "id": id,
            "result": result,
            "completedAt": now_millis(),
        }),
    )?;

    remove_if_exists(&root.join("processing").join(format!("{id}.json")))?;
    Ok(())
}

#[tauri::command]
pub fn ai_native_read_file(app: AppHandle, path: String) -> Result<AiNativeFile, String> {
    let root = ai_native_root(&app)?.join("imports");
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create AI Native imports directory: {error}"))?;
    let path = controlled_import_path(&root, &path)?;
    let bytes = read_import_without_following(&path)?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image")
        .to_string();
    Ok(AiNativeFile {
        name,
        media_type: media_type_for_path(&path).to_string(),
        bytes,
    })
}

#[tauri::command]
pub fn ai_native_write_artifact(
    app: AppHandle,
    name: String,
    bytes: Vec<u8>,
    media_type: Option<String>,
) -> Result<AiNativeArtifact, String> {
    let root = ai_native_root(&app)?;
    ensure_dirs(&root)?;

    let media_type = media_type.unwrap_or_else(|| "application/octet-stream".to_string());
    let name = artifact_file_name(&name, &media_type);
    let dir = root.join("artifacts");
    let path = dir.join(&name);

    fs::write(&path, &bytes)
        .map_err(|error| format!("Could not write AI Native artifact: {error}"))?;

    Ok(AiNativeArtifact {
        path: path_to_string(&path),
        name,
        media_type,
        byte_length: bytes.len(),
    })
}

fn ai_native_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(AI_NATIVE_DIR))
        .map_err(|error| format!("Could not resolve app data directory: {error}"))
}

fn ensure_dirs(root: &Path) -> Result<AiNativePaths, String> {
    let inbox = root.join("inbox");
    let processing = root.join("processing");
    let outbox = root.join("outbox");
    let failed = root.join("failed");
    let imports = root.join("imports");
    let artifacts = root.join("artifacts");

    for dir in [
        root,
        inbox.as_path(),
        processing.as_path(),
        outbox.as_path(),
        failed.as_path(),
        imports.as_path(),
        artifacts.as_path(),
    ] {
        fs::create_dir_all(dir)
            .map_err(|error| format!("Could not create AI Native directory: {error}"))?;
    }

    Ok(AiNativePaths {
        root: path_to_string(root),
        inbox: path_to_string(&inbox),
        processing: path_to_string(&processing),
        outbox: path_to_string(&outbox),
        failed: path_to_string(&failed),
        imports: path_to_string(&imports),
        artifacts: path_to_string(&artifacts),
    })
}

fn controlled_import_path(root: &Path, value: &str) -> Result<PathBuf, String> {
    let relative = Path::new(value);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(
            "AI Native imports require a safe relative path under ai-native/imports.".into(),
        );
    }
    let target = root.join(relative);
    let parent = target
        .parent()
        .ok_or("AI Native import has no parent directory.")?;
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("Could not resolve AI Native imports directory: {error}"))?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Could not resolve AI Native import parent: {error}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("AI Native import path escapes the controlled imports directory.".into());
    }
    Ok(canonical_parent.join(
        relative
            .file_name()
            .ok_or("AI Native import name is missing.")?,
    ))
}

fn read_import_without_following(path: &Path) -> Result<Vec<u8>, String> {
    let mut options = fs::OpenOptions::new();
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
    let mut file = options
        .open(path)
        .map_err(|error| format!("Could not read AI Native import: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Could not inspect AI Native import: {error}"))?;
    if !metadata.is_file() {
        return Err("AI Native import must be a regular file.".into());
    }
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err(format!(
            "AI Native imports over {MAX_IMPORT_BYTES} bytes are not accepted."
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read AI Native import: {error}"))?;
    if bytes.len() as u64 != metadata.len() {
        return Err("AI Native import changed while it was being read.".into());
    }
    Ok(bytes)
}

fn split_envelope(mut value: Value, fallback_id: &str) -> (String, Value) {
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or(fallback_id)
        .to_string();

    if let Some(action) = value.get("action").cloned() {
        return (id, action);
    }

    if let Some(object) = value.as_object_mut() {
        object.remove("id");
        object.remove("client");
        object.remove("createdAt");
    }
    (id, value)
}

fn sanitize_id(id: &str) -> String {
    let sanitized = id
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => ch,
            _ => '_',
        })
        .collect::<String>();

    let trimmed = sanitized.trim_matches('.').trim();
    if trimmed.is_empty() {
        format!("command-{}", now_millis())
    } else {
        trimmed.to_string()
    }
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not encode AI Native JSON: {error}"))?;
    fs::write(&tmp, bytes)
        .map_err(|error| format!("Could not write AI Native response: {error}"))?;
    fs::rename(&tmp, path).map_err(|error| format!("Could not publish AI Native response: {error}"))
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove AI Native file: {error}")),
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn artifact_file_name(name: &str, media_type: &str) -> String {
    let sanitized = name
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => ch,
            _ => '-',
        })
        .collect::<String>();
    let mut file_name = sanitized
        .trim_matches(|ch| ch == '.' || ch == '-')
        .chars()
        .take(120)
        .collect::<String>();
    if file_name.is_empty() {
        file_name = format!("artifact-{}", now_millis());
    }
    if Path::new(&file_name).extension().is_none() {
        file_name.push_str(extension_for_media_type(media_type));
    }
    file_name
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => ".jpg",
        "image/webp" => ".webp",
        "image/bmp" => ".bmp",
        "image/gif" => ".gif",
        "image/png" => ".png",
        _ => ".bin",
    }
}

fn media_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    }
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_paths_reject_absolute_and_traversal() {
        let root = tempfile::tempdir().unwrap();
        assert!(controlled_import_path(root.path(), "/etc/passwd").is_err());
        assert!(controlled_import_path(root.path(), "../secret").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn import_reader_rejects_symbolic_links() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = root.path().join("outside.png");
        fs::write(&outside, b"secret").unwrap();
        let link = root.path().join("link.png");
        symlink(&outside, &link).unwrap();
        assert!(read_import_without_following(&link).is_err());
    }
}
