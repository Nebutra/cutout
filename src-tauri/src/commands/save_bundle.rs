//! Atomic, picker-rooted export for nested Design/Brand/Starter bundles.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

const MAX_FILES: usize = 2_048;
const MAX_FILE_BYTES: usize = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 512 * 1024 * 1024;
const MAX_PATH_BYTES: usize = 1_024;
static STAGING_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleFileInput {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleInput {
    pub name: String,
    pub files: Vec<BundleFileInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleFileReceipt {
    pub path: String,
    pub size: usize,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBundleResult {
    pub canceled: bool,
    pub output_dir: Option<String>,
    pub bundle_dir: Option<String>,
    pub file_count: usize,
    pub total_bytes: usize,
    pub files: Vec<BundleFileReceipt>,
}

#[derive(Debug, thiserror::Error)]
pub enum BundleError {
    #[error("failed to open folder picker")]
    DialogChannel,
    #[error("could not resolve selected folder to a path: {0}")]
    ResolvePath(String),
    #[error("invalid bundle: {0}")]
    Invalid(String),
    #[error("bundle target already exists")]
    Conflict,
    #[error("bundle I/O failed: {0}")]
    Io(String),
}

impl Serialize for BundleError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

async fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Result<Option<PathBuf>, BundleError> {
    let (tx, rx) = oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    match rx.await.map_err(|_| BundleError::DialogChannel)? {
        None => Ok(None),
        Some(path) => path
            .into_path()
            .map(Some)
            .map_err(|error| BundleError::ResolvePath(error.to_string())),
    }
}

fn validate_bundle_name(name: &str) -> Result<(), BundleError> {
    let safe = !name.is_empty()
        && name.len() <= 128
        && name != "."
        && name != ".."
        && name.chars().enumerate().all(|(index, ch)| {
            ch.is_ascii_alphanumeric() || (index > 0 && matches!(ch, '.' | '_' | '-'))
        });
    if safe {
        Ok(())
    } else {
        Err(BundleError::Invalid(
            "bundle name must be a safe directory name".into(),
        ))
    }
}

fn validate_relative_path(value: &str) -> Result<PathBuf, BundleError> {
    if value.is_empty()
        || value.len() > MAX_PATH_BYTES
        || value.contains('\\')
        || value.contains('\0')
        || value.split('/').any(str::is_empty)
    {
        return Err(BundleError::Invalid(format!("unsafe bundle path: {value}")));
    }
    let path = Path::new(value);
    let mut count = 0usize;
    for component in path.components() {
        match component {
            Component::Normal(part) if !part.is_empty() => count += 1,
            _ => return Err(BundleError::Invalid(format!("unsafe bundle path: {value}"))),
        }
    }
    if count == 0 || path.is_absolute() {
        return Err(BundleError::Invalid(format!("unsafe bundle path: {value}")));
    }
    Ok(path.to_path_buf())
}

fn validate_input(bundle: &BundleInput) -> Result<Vec<PathBuf>, BundleError> {
    validate_bundle_name(&bundle.name)?;
    if bundle.files.is_empty() {
        return Err(BundleError::Invalid(
            "bundle must contain at least one file".into(),
        ));
    }
    if bundle.files.len() > MAX_FILES {
        return Err(BundleError::Invalid(format!(
            "bundle exceeds {MAX_FILES} files"
        )));
    }

    let mut total = 0usize;
    let mut paths = Vec::with_capacity(bundle.files.len());
    let mut seen = HashSet::with_capacity(bundle.files.len());
    for file in &bundle.files {
        if file.bytes.len() > MAX_FILE_BYTES {
            return Err(BundleError::Invalid(format!(
                "file exceeds size limit: {}",
                file.path
            )));
        }
        total = total
            .checked_add(file.bytes.len())
            .ok_or_else(|| BundleError::Invalid("bundle size overflow".into()))?;
        if total > MAX_TOTAL_BYTES {
            return Err(BundleError::Invalid(
                "bundle exceeds total size limit".into(),
            ));
        }
        let path = validate_relative_path(&file.path)?;
        if !seen.insert(path.clone()) {
            return Err(BundleError::Invalid(format!(
                "duplicate bundle path: {}",
                file.path
            )));
        }
        paths.push(path);
    }

    for (index, path) in paths.iter().enumerate() {
        for parent in path.ancestors().skip(1) {
            if parent.as_os_str().is_empty() {
                break;
            }
            if seen.contains(parent) {
                return Err(BundleError::Invalid(format!(
                    "file/directory path conflict: {}",
                    bundle.files[index].path
                )));
            }
        }
    }
    Ok(paths)
}

fn staging_path(root: &Path, bundle_name: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = STAGING_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    root.join(format!(
        ".cutout-{bundle_name}-{nonce:x}-{sequence:x}.staging"
    ))
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn write_and_verify(target: &Path, bytes: &[u8]) -> Result<String, BundleError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    let mut file = options
        .open(target)
        .map_err(|error| BundleError::Io(error.to_string()))?;
    file.write_all(bytes)
        .map_err(|error| BundleError::Io(error.to_string()))?;
    file.sync_all()
        .map_err(|error| BundleError::Io(error.to_string()))?;
    drop(file);

    let mut persisted = Vec::with_capacity(bytes.len());
    File::open(target)
        .and_then(|mut file| file.read_to_end(&mut persisted))
        .map_err(|error| BundleError::Io(error.to_string()))?;
    if persisted.len() != bytes.len() || sha256(&persisted) != sha256(bytes) {
        return Err(BundleError::Io("write verification failed".into()));
    }
    Ok(sha256(&persisted))
}

fn write_bundle_to_root(
    root: &Path,
    bundle: &BundleInput,
) -> Result<SaveBundleResult, BundleError> {
    let root_metadata =
        fs::symlink_metadata(root).map_err(|error| BundleError::Io(error.to_string()))?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(BundleError::Invalid(
            "selected root must be a regular directory".into(),
        ));
    }
    let root = fs::canonicalize(root).map_err(|error| BundleError::Io(error.to_string()))?;
    let paths = validate_input(bundle)?;
    let final_path = root.join(&bundle.name);
    if fs::symlink_metadata(&final_path).is_ok() {
        return Err(BundleError::Conflict);
    }

    let staging = staging_path(&root, &bundle.name);
    fs::create_dir(&staging).map_err(|error| BundleError::Io(error.to_string()))?;

    let result = (|| {
        let mut receipts = Vec::with_capacity(bundle.files.len());
        let mut total_bytes = 0usize;
        for (file, relative) in bundle.files.iter().zip(paths.iter()) {
            let target = staging.join(relative);
            let parent = target
                .parent()
                .ok_or_else(|| BundleError::Invalid("file has no parent".into()))?;
            fs::create_dir_all(parent).map_err(|error| BundleError::Io(error.to_string()))?;
            let hash = write_and_verify(&target, &file.bytes)?;
            total_bytes += file.bytes.len();
            receipts.push(BundleFileReceipt {
                path: file.path.clone(),
                size: file.bytes.len(),
                sha256: hash,
            });
        }

        File::open(&staging)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| BundleError::Io(error.to_string()))?;
        fs::rename(&staging, &final_path).map_err(|error| {
            if final_path.exists() {
                BundleError::Conflict
            } else {
                BundleError::Io(error.to_string())
            }
        })?;
        if let Ok(directory) = File::open(&root) {
            let _ = directory.sync_all();
        }

        Ok(SaveBundleResult {
            canceled: false,
            output_dir: Some(root.to_string_lossy().into_owned()),
            bundle_dir: Some(final_path.to_string_lossy().into_owned()),
            file_count: receipts.len(),
            total_bytes,
            files: receipts,
        })
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[tauri::command]
pub async fn save_bundle<R: Runtime>(
    app: AppHandle<R>,
    bundle: BundleInput,
) -> Result<SaveBundleResult, BundleError> {
    // Validate before opening a system dialog or allocating native write work.
    validate_input(&bundle)?;
    let Some(root) = pick_folder(&app).await? else {
        return Ok(SaveBundleResult {
            canceled: true,
            output_dir: None,
            bundle_dir: None,
            file_count: 0,
            total_bytes: 0,
            files: Vec::new(),
        });
    };
    tokio::task::spawn_blocking(move || write_bundle_to_root(&root, &bundle))
        .await
        .map_err(|error| BundleError::Io(error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn bundle(files: Vec<(&str, &[u8])>) -> BundleInput {
        BundleInput {
            name: "design-kit".into(),
            files: files
                .into_iter()
                .map(|(path, bytes)| BundleFileInput {
                    path: path.into(),
                    bytes: bytes.to_vec(),
                })
                .collect(),
        }
    }

    #[test]
    fn writes_nested_files_atomically_and_returns_verified_hashes() {
        let root = tempdir().unwrap();
        let input = bundle(vec![
            ("DESIGN.md", b"hello"),
            ("assets/logo.bin", &[0, 1, 2]),
        ]);
        let receipt = write_bundle_to_root(root.path(), &input).unwrap();

        assert_eq!(receipt.file_count, 2);
        assert_eq!(receipt.total_bytes, 8);
        assert_eq!(receipt.files[0].sha256, sha256(b"hello"));
        assert_eq!(
            fs::read(root.path().join("design-kit/DESIGN.md")).unwrap(),
            b"hello"
        );
        assert_eq!(
            fs::read(root.path().join("design-kit/assets/logo.bin")).unwrap(),
            [0, 1, 2]
        );
        assert!(fs::read_dir(root.path()).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".staging")));
    }

    #[test]
    fn rejects_traversal_absolute_backslash_duplicate_and_file_directory_conflicts() {
        for path in ["../escape", "/absolute", "a/../../b", "a\\b", "a//b", "./a"] {
            assert!(
                validate_input(&bundle(vec![(path, b"x")])).is_err(),
                "accepted {path}"
            );
        }
        assert!(validate_input(&bundle(vec![("a", b"x"), ("a", b"y")])).is_err());
        assert!(validate_input(&bundle(vec![("a", b"x"), ("a/b", b"y")])).is_err());
        assert!(validate_input(&bundle(vec![("a/b", b"x"), ("a", b"y")])).is_err());
    }

    #[test]
    fn rejects_existing_target_without_modifying_it() {
        let root = tempdir().unwrap();
        fs::create_dir(root.path().join("design-kit")).unwrap();
        fs::write(root.path().join("design-kit/existing"), b"keep").unwrap();
        assert!(matches!(
            write_bundle_to_root(root.path(), &bundle(vec![("a", b"x")])),
            Err(BundleError::Conflict)
        ));
        assert_eq!(
            fs::read(root.path().join("design-kit/existing")).unwrap(),
            b"keep"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_picker_root_and_symlink_target() {
        use std::os::unix::fs::symlink;
        let parent = tempdir().unwrap();
        let real = parent.path().join("real");
        fs::create_dir(&real).unwrap();
        let linked_root = parent.path().join("linked-root");
        symlink(&real, &linked_root).unwrap();
        assert!(write_bundle_to_root(&linked_root, &bundle(vec![("a", b"x")])).is_err());

        let target = real.join("design-kit");
        symlink(parent.path(), &target).unwrap();
        assert!(matches!(
            write_bundle_to_root(&real, &bundle(vec![("a", b"x")])),
            Err(BundleError::Conflict)
        ));
    }

    #[test]
    fn enforces_count_and_size_limits_before_writing() {
        let too_many = BundleInput {
            name: "x".into(),
            files: (0..=MAX_FILES)
                .map(|index| BundleFileInput {
                    path: format!("{index}"),
                    bytes: vec![],
                })
                .collect(),
        };
        assert!(validate_input(&too_many).is_err());
        assert!(validate_input(&bundle(vec![("huge", &vec![0; MAX_FILE_BYTES + 1])])).is_err());
    }
}
