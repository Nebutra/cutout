//! `save_assets` command: folder-pick + least-privilege write of exported PNG slices.
//!
//! Ports the Electron `save-assets` IPC (see git history `HEAD~1:src/main.js`) to a
//! typed Tauri command. Deltas vs Electron: raw PNG bytes preferred over base64 dataURL,
//! per-file `failed[]` (partial success) instead of all-or-nothing `Promise.all`, and a
//! path-traversal guard on every write.

use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

/// One asset to write. `bytes` is the primary transport (raw PNG); `data_url` is a
/// documented fallback (`data:image/png;base64,...`). Exactly one should be present.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInput {
    pub name: String,
    pub bytes: Option<Vec<u8>>,
    pub data_url: Option<String>,
}

/// A single failed write, surfaced to the UI so it can report "24 of 25 saved".
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedWrite {
    pub name: String,
    pub error: String,
}

/// Result of a `save_assets` invocation. `canceled` is set when the user dismisses the
/// folder picker (or when there is nothing to save).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAssetsResult {
    pub canceled: bool,
    pub output_dir: Option<String>,
    pub count: usize,
    pub failed: Vec<FailedWrite>,
}

/// Errors that abort the whole command (as opposed to per-file `FailedWrite`s).
/// Serializes to a plain string so it crosses the IPC boundary cleanly.
#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("failed to open folder picker")]
    DialogChannel,
    #[error("could not resolve selected folder to a path: {0}")]
    ResolvePath(String),
}

impl Serialize for SaveError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Replicate the Electron JS sanitizer `name.replace(/[^\w.-]+/g, "_")`.
///
/// - `\w` is ASCII-only here (`[A-Za-z0-9_]`) — matches JS default (no `u` flag).
/// - The `+` quantifier collapses each run of disallowed chars into a single `_`.
/// - Empty results (all-disallowed / empty input) fall back to `"asset"` so we never
///   write a zero-length or dot-only filename.
fn sanitize_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut in_run = false;
    for ch in name.chars() {
        let allowed = ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' || ch == '-';
        if allowed {
            out.push(ch);
            in_run = false;
        } else if !in_run {
            // Start of a run of disallowed chars -> single underscore.
            out.push('_');
            in_run = true;
        }
        // else: inside a run, collapse (skip).
    }

    // Guard against empty or dot-only names (e.g. "", ".", "..", "_", "...").
    if out.is_empty() || out.chars().all(|c| c == '.') {
        return "asset".to_string();
    }
    out
}

/// True iff `path` resolves to a location strictly inside `dir` (traversal guard).
///
/// Lexical component analysis (no filesystem access — the target file does not exist
/// yet). `dir` is the picker-chosen absolute dir and `path` is typically `dir.join(name)`
/// (also absolute). We walk `path`'s components, folding `.`/`..` lexically, and require
/// the result to stay under `dir` and not equal `dir`. Any `..` that would climb to or
/// above `dir` is rejected, which stops `dir.join("../escape")` style breakouts.
fn is_within(dir: &Path, path: &Path) -> bool {
    use std::path::Component;

    // Fold `path` into a normalized component stack (lexical, no fs access).
    let mut stack: Vec<Component> = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                match stack.last() {
                    // Popping a normal segment is fine; popping the root/prefix is a climb-out.
                    Some(Component::Normal(_)) => {
                        stack.pop();
                    }
                    _ => return false,
                }
            }
            other => stack.push(other),
        }
    }
    let normalized: PathBuf = stack.iter().collect();

    normalized.starts_with(dir) && normalized != dir
}

/// Decode an asset's payload into raw PNG bytes: prefer `bytes`, else base64-decode the
/// `data_url` (stripping the `data:image/...;base64,` prefix).
fn decode_bytes(asset: &AssetInput) -> Result<Vec<u8>, String> {
    if let Some(bytes) = &asset.bytes {
        return Ok(bytes.clone());
    }
    if let Some(data_url) = &asset.data_url {
        let payload = data_url
            .find(";base64,")
            .map(|i| &data_url[i + ";base64,".len()..])
            .unwrap_or(data_url.as_str());
        return BASE64
            .decode(payload.as_bytes())
            .map_err(|e| format!("invalid base64 data URL: {e}"));
    }
    Err("asset has neither bytes nor dataUrl".to_string())
}

/// Bridge the callback-based `pick_folder` to async via a tokio oneshot channel.
async fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Result<Option<PathBuf>, SaveError> {
    let (tx, rx) = oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        // Receiver may be gone if the command future was dropped; ignore send error.
        let _ = tx.send(folder);
    });

    let selected = rx.await.map_err(|_| SaveError::DialogChannel)?;
    match selected {
        None => Ok(None),
        Some(file_path) => file_path
            .into_path()
            .map(Some)
            .map_err(|e| SaveError::ResolvePath(e.to_string())),
    }
}

/// Resolve an explicit (remembered) destination directory. Used only when it
/// still exists as a directory, so a stale/removed remembered path silently
/// falls back to the picker instead of failing every write.
fn resolve_dest(dest_dir: &Option<String>) -> Option<PathBuf> {
    let dir = dest_dir.as_ref()?;
    let path = PathBuf::from(dir);
    if path.is_dir() {
        Some(path)
    } else {
        None
    }
}

#[tauri::command]
pub async fn save_assets<R: Runtime>(
    app: AppHandle<R>,
    assets: Vec<AssetInput>,
    dest_dir: Option<String>,
) -> Result<SaveAssetsResult, SaveError> {
    if assets.is_empty() {
        return Ok(SaveAssetsResult {
            canceled: true,
            output_dir: None,
            count: 0,
            failed: Vec::new(),
        });
    }

    // A valid remembered directory skips the picker; otherwise prompt as before.
    let dir = match resolve_dest(&dest_dir) {
        Some(dir) => dir,
        None => match pick_folder(&app).await? {
            Some(dir) => dir,
            None => {
                return Ok(SaveAssetsResult {
                    canceled: true,
                    output_dir: None,
                    count: 0,
                    failed: Vec::new(),
                })
            }
        },
    };

    let mut count = 0usize;
    let mut failed: Vec<FailedWrite> = Vec::new();

    for asset in &assets {
        let safe_name = sanitize_filename(&asset.name);
        let target = dir.join(&safe_name);

        if !is_within(&dir, &target) {
            failed.push(FailedWrite {
                name: asset.name.clone(),
                error: "path escapes the chosen directory".to_string(),
            });
            continue;
        }

        let bytes = match decode_bytes(asset) {
            Ok(b) => b,
            Err(e) => {
                failed.push(FailedWrite {
                    name: asset.name.clone(),
                    error: e,
                });
                continue;
            }
        };

        match tokio::fs::write(&target, &bytes).await {
            Ok(()) => count += 1,
            Err(e) => failed.push(FailedWrite {
                name: asset.name.clone(),
                error: e.to_string(),
            }),
        }
    }

    Ok(SaveAssetsResult {
        canceled: false,
        output_dir: Some(dir.to_string_lossy().into_owned()),
        count,
        failed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_collapses_runs() {
        // Each run of disallowed chars -> a single underscore (matches JS `+`).
        assert_eq!(sanitize_filename("hero sprite.png"), "hero_sprite.png");
        assert_eq!(sanitize_filename("a  b   c"), "a_b_c");
        assert_eq!(sanitize_filename("weird!!!@@@name"), "weird_name");
        // Contiguous non-ASCII-word run (incl. the leading é) collapses to one "_".
        assert_eq!(sanitize_filename("路径/évil.png"), "_vil.png");
    }

    #[test]
    fn sanitize_keeps_allowed_chars() {
        assert_eq!(
            sanitize_filename("Sprite_01-final.png"),
            "Sprite_01-final.png"
        );
        assert_eq!(sanitize_filename("ABC123_-."), "ABC123_-.");
    }

    #[test]
    fn sanitize_empty_and_dotfiles_fall_back() {
        assert_eq!(sanitize_filename(""), "asset");
        assert_eq!(sanitize_filename("   "), "_"); // 3 spaces -> single "_", a valid name
        assert_eq!(sanitize_filename("."), "asset");
        assert_eq!(sanitize_filename(".."), "asset");
        assert_eq!(sanitize_filename("..."), "asset");
    }

    #[test]
    fn sanitize_underscore_only_is_not_dotfile() {
        // A lone "_" is a valid (if ugly) name; only empty / all-dots fall back.
        assert_eq!(sanitize_filename("!!!"), "_");
    }

    #[test]
    fn is_within_accepts_plain_child() {
        let dir = Path::new("/tmp/export");
        assert!(is_within(dir, &dir.join("sprite.png")));
        assert!(is_within(dir, &dir.join("nested").join("a.png")));
    }

    #[test]
    fn is_within_rejects_traversal() {
        let dir = Path::new("/tmp/export");
        assert!(!is_within(dir, Path::new("/tmp/export/../secret.png")));
        assert!(!is_within(dir, Path::new("/tmp/export/../../etc/passwd")));
        assert!(!is_within(dir, Path::new("/etc/passwd")));
    }

    #[test]
    fn is_within_rejects_dir_itself() {
        let dir = Path::new("/tmp/export");
        assert!(!is_within(dir, dir));
    }

    #[test]
    fn resolve_dest_uses_existing_directory() {
        let tmp = std::env::temp_dir();
        assert_eq!(
            resolve_dest(&Some(tmp.to_string_lossy().into_owned())),
            Some(tmp)
        );
    }

    #[test]
    fn resolve_dest_falls_back_when_absent_or_missing() {
        assert_eq!(resolve_dest(&None), None);
        assert_eq!(
            resolve_dest(&Some("/no/such/dir/xyzzy-404".to_string())),
            None
        );
    }

    #[test]
    fn decode_prefers_bytes() {
        let asset = AssetInput {
            name: "a.png".into(),
            bytes: Some(vec![1, 2, 3]),
            data_url: Some("data:image/png;base64,QUJD".into()),
        };
        assert_eq!(decode_bytes(&asset).unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn decode_falls_back_to_data_url() {
        let asset = AssetInput {
            name: "a.png".into(),
            bytes: None,
            data_url: Some("data:image/png;base64,QUJD".into()), // "ABC"
        };
        assert_eq!(decode_bytes(&asset).unwrap(), b"ABC".to_vec());
    }

    #[test]
    fn decode_errors_when_empty() {
        let asset = AssetInput {
            name: "a.png".into(),
            bytes: None,
            data_url: None,
        };
        assert!(decode_bytes(&asset).is_err());
    }
}
