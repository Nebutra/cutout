//! Picker-rooted, metadata-only repository inventory for the Design OS inbox.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

const MAX_ENTRIES: usize = 10_000;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 25 * 1024 * 1024;
const MAX_DEPTH: usize = 64;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryEntry {
    path: String,
    bytes: u64,
    media_type: String,
    sha256: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exclusions {
    symbolic_link: usize,
    secret_path: usize,
    secret_content: usize,
    ignored_directory: usize,
    binary: usize,
    oversized: usize,
    unsupported: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameworkHint {
    framework: String,
    evidence: Vec<String>,
    confidence: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryScanResult {
    canceled: bool,
    label: Option<String>,
    entries: Vec<RepositoryEntry>,
    framework_hints: Vec<FrameworkHint>,
    excluded: Exclusions,
}

#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("failed to open folder picker")]
    DialogChannel,
    #[error("could not resolve selected folder to a path: {0}")]
    ResolvePath(String),
    #[error("repository scan failed: {0}")]
    Invalid(String),
    #[error("repository I/O failed: {0}")]
    Io(String),
}

impl Serialize for ScanError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn scan_repository<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RepositoryScanResult, ScanError> {
    let selected = pick_folder(&app).await?;
    let Some(root) = selected else {
        return Ok(RepositoryScanResult {
            canceled: true,
            label: None,
            entries: vec![],
            framework_hints: vec![],
            excluded: Exclusions::default(),
        });
    };
    tokio::task::spawn_blocking(move || scan_selected_root(&root))
        .await
        .map_err(|error| ScanError::Io(error.to_string()))?
}

async fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Result<Option<PathBuf>, ScanError> {
    let (tx, rx) = oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    match rx.await.map_err(|_| ScanError::DialogChannel)? {
        None => Ok(None),
        Some(path) => path
            .into_path()
            .map(Some)
            .map_err(|error| ScanError::ResolvePath(error.to_string())),
    }
}

fn scan_selected_root(root: &Path) -> Result<RepositoryScanResult, ScanError> {
    let metadata = fs::symlink_metadata(root).map_err(io_error)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ScanError::Invalid(
            "selected root must be a real directory".into(),
        ));
    }
    let canonical = fs::canonicalize(root).map_err(io_error)?;
    let label = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| safe_label(name))
        .ok_or_else(|| ScanError::Invalid("selected repository has no safe display name".into()))?
        .to_owned();
    let mut state = ScanState::default();
    walk(&canonical, &canonical, 0, &mut state)?;
    state.entries.sort_by(|a, b| a.path.cmp(&b.path));
    let framework_hints = framework_hints(&state.entries);
    Ok(RepositoryScanResult {
        canceled: false,
        label: Some(label),
        entries: state.entries,
        framework_hints,
        excluded: state.excluded,
    })
}

#[derive(Default)]
struct ScanState {
    entries: Vec<RepositoryEntry>,
    excluded: Exclusions,
    visited: usize,
    accepted_bytes: u64,
}

fn walk(
    root: &Path,
    directory: &Path,
    depth: usize,
    state: &mut ScanState,
) -> Result<(), ScanError> {
    if depth > MAX_DEPTH {
        return Err(ScanError::Invalid(format!(
            "repository scan depth limit ({MAX_DEPTH}) exceeded"
        )));
    }
    let canonical = fs::canonicalize(directory).map_err(io_error)?;
    ensure_contained(root, &canonical)?;
    let mut children = fs::read_dir(&canonical)
        .map_err(io_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(io_error)?;
    children.sort_by_key(|entry| entry.file_name());
    for child in children {
        state.visited += 1;
        if state.visited > MAX_ENTRIES {
            return Err(ScanError::Invalid(format!(
                "repository entry limit ({MAX_ENTRIES}) exceeded"
            )));
        }
        let target = child.path();
        ensure_contained(root, &target)?;
        let metadata = fs::symlink_metadata(&target).map_err(io_error)?;
        if metadata.file_type().is_symlink() {
            state.excluded.symbolic_link += 1;
            continue;
        }
        let relative = relative_path(root, &target)?;
        if metadata.is_dir() {
            if ignored_directory(child.file_name().to_string_lossy().as_ref()) {
                state.excluded.ignored_directory += 1;
                continue;
            }
            walk(root, &target, depth + 1, state)?;
            continue;
        }
        if !metadata.is_file() {
            state.excluded.unsupported += 1;
            continue;
        }
        if secret_path(&relative) {
            state.excluded.secret_path += 1;
            continue;
        }
        if binary_extension(&relative) {
            state.excluded.binary += 1;
            continue;
        }
        if !eligible_path(&relative) {
            state.excluded.unsupported += 1;
            continue;
        }
        if metadata.len() > MAX_FILE_BYTES {
            state.excluded.oversized += 1;
            continue;
        }
        if state.accepted_bytes + metadata.len() > MAX_TOTAL_BYTES {
            return Err(ScanError::Invalid(format!(
                "repository total byte limit ({MAX_TOTAL_BYTES}) exceeded"
            )));
        }
        let mut file = open_without_following(&target)?;
        let opened = file.metadata().map_err(io_error)?;
        if !opened.is_file() {
            return Err(ScanError::Invalid(
                "repository entry changed during scan".into(),
            ));
        }
        let opened_identity = file_identity(&file)?;
        if opened.len() > MAX_FILE_BYTES {
            state.excluded.oversized += 1;
            continue;
        }
        let mut bytes = Vec::with_capacity(opened.len() as usize);
        file.by_ref()
            .take(MAX_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(io_error)?;
        if bytes.len() as u64 > MAX_FILE_BYTES {
            state.excluded.oversized += 1;
            continue;
        }
        let after = file.metadata().map_err(io_error)?;
        let current_file = open_without_following(&target)?;
        let current = current_file.metadata().map_err(io_error)?;
        if !current.is_file()
            || file_identity(&file)? != opened_identity
            || file_identity(&current_file)? != opened_identity
            || bytes.len() as u64 != after.len()
        {
            return Err(ScanError::Invalid(
                "repository entry changed during scan".into(),
            ));
        }
        if bytes.contains(&0) {
            state.excluded.binary += 1;
            continue;
        }
        if credential_content(&bytes) {
            state.excluded.secret_content += 1;
            continue;
        }
        state.accepted_bytes += bytes.len() as u64;
        state.entries.push(RepositoryEntry {
            path: relative.clone(),
            bytes: bytes.len() as u64,
            media_type: media_type(&relative).into(),
            sha256: format!("{:x}", Sha256::digest(&bytes)),
        });
    }
    Ok(())
}

fn ensure_contained(root: &Path, path: &Path) -> Result<(), ScanError> {
    if !path.starts_with(root) {
        return Err(ScanError::Invalid(
            "repository path escapes selected root".into(),
        ));
    }
    Ok(())
}
fn relative_path(root: &Path, path: &Path) -> Result<String, ScanError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| ScanError::Invalid("repository path escapes selected root".into()))?;
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(ScanError::Invalid(
            "repository path is not a safe relative path".into(),
        ));
    }
    let parts = relative
        .iter()
        .map(|p| {
            p.to_str()
                .ok_or_else(|| ScanError::Invalid("repository paths must be UTF-8".into()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(parts.join("/"))
}
fn io_error(error: std::io::Error) -> ScanError {
    ScanError::Io(error.to_string())
}
#[cfg(unix)]
fn open_without_following(path: &Path) -> Result<File, ScanError> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .map_err(io_error)
}
#[cfg(windows)]
fn open_without_following(path: &Path) -> Result<File, ScanError> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(io_error)
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileIdentity {
    volume: u64,
    index: u64,
}

#[cfg(unix)]
fn file_identity(file: &File) -> Result<FileIdentity, ScanError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata().map_err(io_error)?;
    Ok(FileIdentity {
        volume: metadata.dev(),
        index: metadata.ino(),
    })
}
#[cfg(windows)]
fn file_identity(file: &File) -> Result<FileIdentity, ScanError> {
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let mut information = MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    // SAFETY: `file` owns a valid handle for the duration of this call and the
    // output pointer refers to writable storage for the documented structure.
    let succeeded =
        unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, information.as_mut_ptr()) };
    if succeeded == 0 {
        return Err(io_error(std::io::Error::last_os_error()));
    }
    // SAFETY: GetFileInformationByHandle initialized the structure on success.
    let information = unsafe { information.assume_init() };
    Ok(FileIdentity {
        volume: u64::from(information.dwVolumeSerialNumber),
        index: (u64::from(information.nFileIndexHigh) << 32) | u64::from(information.nFileIndexLow),
    })
}
fn safe_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value != "."
        && value != ".."
        && !value.contains(['/', '\\', '\0'])
}
fn ignored_directory(name: &str) -> bool {
    matches!(
        name,
        ".cutout"
            | ".git"
            | ".next"
            | ".nuxt"
            | ".output"
            | ".turbo"
            | ".vercel"
            | "build"
            | "coverage"
            | "dist"
            | "node_modules"
    )
}
fn secret_path(path: &str) -> bool {
    path.split('/').any(|part| {
        let p = part.to_ascii_lowercase();
        p.starts_with(".env")
            || [
                "secret",
                "credential",
                "api-key",
                "apikey",
                "private-key",
                "access-token",
                "auth-token",
            ]
            .iter()
            .any(|needle| p.contains(needle))
    })
}
fn binary_extension(path: &str) -> bool {
    [
        "7z", "avif", "bin", "bmp", "class", "dll", "dmg", "docx", "exe", "gif", "gz", "ico",
        "icns", "jar", "jpeg", "jpg", "lockb", "mov", "mp3", "mp4", "o", "otf", "pdf", "png", "so",
        "tar", "ttf", "wav", "webm", "webp", "woff", "woff2", "zip",
    ]
    .iter()
    .any(|ext| path.to_ascii_lowercase().ends_with(&format!(".{ext}")))
}
fn eligible_path(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    [
        ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".css", ".scss", ".sass", ".less",
        ".html", ".md", ".mdx", ".json", ".yaml", ".yml",
    ]
    .iter()
    .any(|ext| p.ends_with(ext))
        || p.rsplit('/')
            .next()
            .is_some_and(|name| name.starts_with("readme") || name == "design.md")
}
pub(crate) fn credential_content(bytes: &[u8]) -> bool {
    let s = String::from_utf8_lossy(bytes);
    contains_credential_token(&s, "sk-", 8)
        || contains_credential_token(&s, "ghp_", 20)
        || contains_credential_token(&s, "AKIA", 16)
}
fn contains_credential_token(value: &str, prefix: &str, minimum_suffix: usize) -> bool {
    value.match_indices(prefix).any(|(index, _)| {
        if value[..index].chars().next_back().is_some_and(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
        }) {
            return false;
        }
        value[index + prefix.len()..]
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
            .count()
            >= minimum_suffix
    })
}
fn media_type(path: &str) -> &'static str {
    if path.ends_with(".json") {
        "application/json"
    } else if path.ends_with(".css") {
        "text/css"
    } else if path.ends_with(".html") {
        "text/html"
    } else if path.ends_with(".md") || path.ends_with(".mdx") {
        "text/markdown"
    } else if path.ends_with(".ts") || path.ends_with(".tsx") {
        "text/typescript"
    } else {
        "text/plain;charset=utf-8"
    }
}
fn framework_hints(entries: &[RepositoryEntry]) -> Vec<FrameworkHint> {
    let paths = entries.iter().map(|e| e.path.as_str()).collect::<Vec<_>>();
    let mut out = vec![];
    let mut add = |framework: &str, evidence: Vec<String>| {
        if !evidence.is_empty() {
            out.push(FrameworkHint {
                framework: framework.into(),
                confidence: if evidence.len() > 1 {
                    "high".into()
                } else {
                    "medium".into()
                },
                evidence,
            });
        }
    };
    add(
        "next",
        paths
            .iter()
            .filter(|p| {
                p.starts_with("next.config.") || p.starts_with("app/") || p.starts_with("pages/")
            })
            .map(|p| (*p).into())
            .collect(),
    );
    add(
        "vite",
        paths
            .iter()
            .filter(|p| {
                p.starts_with("vite.config.") || **p == "src/main.tsx" || **p == "src/main.ts"
            })
            .map(|p| (*p).into())
            .collect(),
    );
    add(
        "nuxt",
        paths
            .iter()
            .filter(|p| p.starts_with("nuxt.config.") || p.starts_with("pages/"))
            .map(|p| (*p).into())
            .collect(),
    );
    add(
        "tanstack-start",
        paths
            .iter()
            .filter(|p| p.contains("routeTree.gen") || p.starts_with("app/routes/"))
            .map(|p| (*p).into())
            .collect(),
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn file_identity_tracks_opened_files_and_hard_links() {
        let root = tempdir().unwrap();
        let original_path = root.path().join("original.ts");
        let hard_link_path = root.path().join("hard-link.ts");
        let other_path = root.path().join("other.ts");
        File::create(&original_path).unwrap();
        fs::hard_link(&original_path, &hard_link_path).unwrap();
        File::create(&other_path).unwrap();

        let original = File::open(original_path).unwrap();
        let hard_link = File::open(hard_link_path).unwrap();
        let other = File::open(other_path).unwrap();

        assert_eq!(
            file_identity(&original).unwrap(),
            file_identity(&hard_link).unwrap()
        );
        assert_ne!(
            file_identity(&original).unwrap(),
            file_identity(&other).unwrap()
        );
    }

    #[test]
    fn scan_never_emits_root_or_secrets_and_reports_frameworks() {
        let root = tempdir().unwrap();
        fs::create_dir(root.path().join("src")).unwrap();
        File::create(root.path().join("vite.config.ts"))
            .unwrap()
            .write_all(b"export default {}")
            .unwrap();
        File::create(root.path().join("src/main.tsx"))
            .unwrap()
            .write_all(b"export const app=true")
            .unwrap();
        File::create(root.path().join(".env"))
            .unwrap()
            .write_all(b"TOKEN=secret")
            .unwrap();
        File::create(root.path().join("src/config.ts"))
            .unwrap()
            .write_all(b"export const value='sk-this-is-a-secret-value'")
            .unwrap();
        let result = scan_selected_root(root.path()).unwrap();
        let json = serde_json::to_string(&result).unwrap();
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.excluded.secret_path, 1);
        assert_eq!(result.excluded.secret_content, 1);
        assert_eq!(result.framework_hints[0].framework, "vite");
        assert!(!json.contains(root.path().to_str().unwrap()));
        assert!(!json.contains("sk-this-is-a-secret-value"));
    }

    #[cfg(unix)]
    #[test]
    fn scan_rejects_a_symlink_selected_as_root() {
        use std::os::unix::fs::symlink;

        let parent = tempdir().unwrap();
        let repository = parent.path().join("repository");
        let alias = parent.path().join("repository-alias");
        fs::create_dir(&repository).unwrap();
        symlink(&repository, &alias).unwrap();

        let error = scan_selected_root(&alias).unwrap_err();
        assert!(error.to_string().contains("real directory"));
    }

    #[test]
    fn scan_rejects_trees_beyond_depth_budget() {
        let root = tempdir().unwrap();
        let mut current = root.path().to_path_buf();
        for depth in 0..=MAX_DEPTH {
            current = current.join(format!("d{depth}"));
            fs::create_dir(&current).unwrap();
        }
        File::create(current.join("source.ts")).unwrap();
        let error = scan_selected_root(root.path()).unwrap_err();
        assert!(error.to_string().contains("depth limit"));
    }
}
