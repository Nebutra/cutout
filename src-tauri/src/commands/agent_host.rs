use super::registry_desktop::{authorized, RegistryDesktopState};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Child,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const FILE: &str = "agent-host-state.json";
const MAX_CHECKPOINT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ERROR_MESSAGE_CHARS: usize = 256;
const PROCESS_GRACE: Duration = Duration::from_millis(400);

pub struct AgentHostDesktopState {
    locks: Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>,
    processes: Mutex<HashMap<ProcessKey, RegisteredProcess>>,
}

impl Default for AgentHostDesktopState {
    fn default() -> Self {
        Self {
            locks: Mutex::new(HashMap::new()),
            processes: Mutex::new(HashMap::new()),
        }
    }
}

impl Drop for AgentHostDesktopState {
    fn drop(&mut self) {
        let Ok(processes) = self.processes.get_mut() else {
            return;
        };
        for process in processes.values() {
            let _ = terminate_process_group(process);
        }
        processes.clear();
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostFile {
    version: u8,
    status: String,
    instance_id: Option<String>,
    runs: HashMap<String, Run>,
    receipts: HashMap<String, Receipt>,
    events: Vec<HostEvent>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    id: String,
    status: String,
    created_at: u64,
    updated_at: u64,
    nodes: HashMap<String, Node>,
    cancel_reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    id: String,
    effect_key: Option<String>,
    status: String,
    attempts: Vec<Attempt>,
    lease: Option<Lease>,
    receipt_id: Option<String>,
    next_attempt_at: Option<u64>,
    #[serde(deserialize_with = "deserialize_positive_u32")]
    max_attempts: u32,
}

fn deserialize_positive_u32<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let value = u32::deserialize(deserializer)?;
    if value == 0 {
        return Err(serde::de::Error::custom("expected a positive integer"));
    }
    Ok(value)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    number: u32,
    started_at: u64,
    completed_at: Option<u64>,
    error: Option<String>,
    #[serde(default)]
    error_code: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lease {
    owner: String,
    #[serde(default)]
    lease_id: String,
    heartbeat_at: u64,
    expires_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseGrant {
    owner: String,
    lease_id: String,
    attempt: u32,
    expires_at: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimOutcome {
    claimed: bool,
    grant: Option<LeaseGrant>,
    state: HostFile,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    receipt_id: String,
    run_id: String,
    node_id: String,
    committed_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEvent {
    id: String,
    run_id: Option<String>,
    node_id: Option<String>,
    kind: String,
    at: u64,
    detail: Option<String>,
    #[serde(default)]
    detail_code: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInput {
    id: String,
    effect_key: Option<String>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct ProcessKey {
    workspace: String,
    run_id: String,
    node_id: String,
}

#[derive(Clone, Debug)]
struct RegisteredProcess {
    lease_id: String,
    #[cfg(unix)]
    process_group_id: i32,
    #[cfg(unix)]
    child: Arc<Mutex<Child>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FileIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(windows)]
    volume: u64,
    #[cfg(windows)]
    index: u64,
}

#[cfg(unix)]
fn file_identity(metadata: &std::fs::Metadata) -> FileIdentity {
    use std::os::unix::fs::MetadataExt;
    FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    }
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug)]
struct WindowsFileInformation {
    identity: FileIdentity,
    attributes: u32,
}

#[cfg(windows)]
fn windows_file_information(file: &File) -> Result<WindowsFileInformation, String> {
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let mut information = MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    // SAFETY: `file` owns a valid handle for this call and the output pointer
    // refers to writable storage for the documented structure.
    let succeeded =
        unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, information.as_mut_ptr()) };
    if succeeded == 0 {
        return Err(io_error(&std::io::Error::last_os_error()));
    }
    // SAFETY: GetFileInformationByHandle initialized the structure on success.
    let information = unsafe { information.assume_init() };
    Ok(WindowsFileInformation {
        identity: FileIdentity {
            volume: u64::from(information.dwVolumeSerialNumber),
            index: (u64::from(information.nFileIndexHigh) << 32)
                | u64::from(information.nFileIndexLow),
        },
        attributes: information.dwFileAttributes,
    })
}

#[cfg(windows)]
fn file_identity(file: &File) -> Result<FileIdentity, String> {
    Ok(windows_file_information(file)?.identity)
}

fn checkpoint_error(code: &str, message: &str) -> String {
    format!("{code}: {message}")
}

fn io_error(error: &std::io::Error) -> String {
    let (code, message) = match error.kind() {
        std::io::ErrorKind::PermissionDenied => (
            "agent-host-checkpoint-permission",
            "Agent Host checkpoint access was denied.",
        ),
        _ => (
            "agent-host-checkpoint-io",
            "Agent Host checkpoint IO failed.",
        ),
    };
    checkpoint_error(code, message)
}

fn validate_directory(path: &Path) -> Result<FileIdentity, String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|error| io_error(&error))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(checkpoint_error(
            "agent-host-checkpoint-path",
            "Agent Host checkpoint directory is not a real directory.",
        ));
    }
    #[cfg(unix)]
    {
        Ok(file_identity(&metadata))
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        };

        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
            .map_err(|error| io_error(&error))?;
        let opened_metadata = directory.metadata().map_err(|error| io_error(&error))?;
        let information = windows_file_information(&directory)?;
        if !opened_metadata.is_dir() || information.attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(checkpoint_error(
                "agent-host-checkpoint-path",
                "Agent Host checkpoint directory is not a real directory.",
            ));
        }
        Ok(information.identity)
    }
}

fn validate_root_components(root: &Path) -> Result<(), String> {
    let mut components = root.ancestors().collect::<Vec<_>>();
    components.reverse();
    for component in components {
        validate_directory(component)?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn ensure_checkpoint_directory(root: &Path) -> Result<(PathBuf, FileIdentity), String> {
    validate_root_components(root)?;
    let directory = root.join(".cutout");
    match std::fs::create_dir(&directory) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(io_error(&error)),
    }
    let identity = validate_directory(&directory)?;
    Ok((directory, identity))
}

#[cfg(not(unix))]
fn checked_existing_checkpoint(target: &Path) -> Result<Option<FileIdentity>, String> {
    match std::fs::symlink_metadata(target) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(checkpoint_error(
                    "agent-host-checkpoint-type",
                    "Agent Host checkpoint must be a regular file.",
                ));
            }
            if metadata.len() > MAX_CHECKPOINT_BYTES {
                return Err(checkpoint_error(
                    "agent-host-checkpoint-size",
                    "Agent Host checkpoint exceeds the size limit.",
                ));
            }
            let file = open_checkpoint(target)?;
            let opened_metadata = file.metadata().map_err(|error| io_error(&error))?;
            if !opened_metadata.is_file() || opened_metadata.len() > MAX_CHECKPOINT_BYTES {
                return Err(checkpoint_error(
                    "agent-host-checkpoint-identity",
                    "Agent Host checkpoint identity changed.",
                ));
            }
            Ok(Some(file_identity(&file)?))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(io_error(&error)),
    }
}

#[cfg(not(unix))]
fn open_checkpoint(target: &Path) -> Result<File, String> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT,
    };

    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options.open(target).map_err(|error| io_error(&error))?;
    let metadata = file.metadata().map_err(|error| io_error(&error))?;
    let information = windows_file_information(&file)?;
    if !metadata.is_file() || information.attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(checkpoint_error(
            "agent-host-checkpoint-type",
            "Agent Host checkpoint must be a regular file.",
        ));
    }
    Ok(file)
}

fn read_checkpoint(root: &Path) -> Result<HostFile, String> {
    read_checkpoint_with_hook(root, || {})
}

fn read_checkpoint_with_hook<F>(root: &Path, after_open: F) -> Result<HostFile, String>
where
    F: FnOnce(),
{
    #[cfg(unix)]
    {
        return read_checkpoint_unix(root, after_open);
    }
    #[cfg(not(unix))]
    {
        read_checkpoint_path(root, after_open)
    }
}

#[cfg(not(unix))]
fn read_checkpoint_path<F>(root: &Path, after_open: F) -> Result<HostFile, String>
where
    F: FnOnce(),
{
    validate_root_components(root)?;
    let directory = root.join(".cutout");
    let directory_identity = match std::fs::symlink_metadata(&directory) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(checkpoint_error(
                    "agent-host-checkpoint-path",
                    "Agent Host checkpoint directory is not a real directory.",
                ));
            }
            validate_directory(&directory)?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(empty()),
        Err(error) => return Err(io_error(&error)),
    };
    let target = directory.join(FILE);
    let Some(path_identity) = checked_existing_checkpoint(&target)? else {
        return Ok(empty());
    };
    let mut file = open_checkpoint(&target)?;
    let opened_metadata = file.metadata().map_err(|error| io_error(&error))?;
    if !opened_metadata.is_file()
        || opened_metadata.len() > MAX_CHECKPOINT_BYTES
        || file_identity(&file)? != path_identity
    {
        return Err(checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint identity changed.",
        ));
    }
    after_open();
    let mut bytes = Vec::with_capacity(opened_metadata.len() as usize);
    Read::by_ref(&mut file)
        .take(MAX_CHECKPOINT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| io_error(&error))?;
    if bytes.len() as u64 > MAX_CHECKPOINT_BYTES {
        return Err(checkpoint_error(
            "agent-host-checkpoint-size",
            "Agent Host checkpoint exceeds the size limit.",
        ));
    }
    let final_opened_identity = file_identity(&file)?;
    let final_path_identity = checked_existing_checkpoint(&target)?.ok_or_else(|| {
        checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint identity changed.",
        )
    })?;
    let final_directory_identity = validate_directory(&directory)?;
    if final_opened_identity != path_identity
        || final_path_identity != path_identity
        || final_directory_identity != directory_identity
    {
        return Err(checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint identity changed.",
        ));
    }
    std::str::from_utf8(&bytes).map_err(|_| {
        checkpoint_error(
            "agent-host-checkpoint-utf8",
            "Agent Host checkpoint must be UTF-8 JSON.",
        )
    })?;
    let mut state = serde_json::from_slice::<HostFile>(&bytes).map_err(|_| {
        checkpoint_error(
            "agent-host-checkpoint-json",
            "Agent Host checkpoint contains invalid JSON.",
        )
    })?;
    sanitize_state(&mut state);
    Ok(state)
}

fn write_checkpoint(root: &Path, state: &HostFile) -> Result<(), String> {
    write_checkpoint_with_hook(root, state, || {})
}

fn write_checkpoint_with_hook<F>(
    root: &Path,
    state: &HostFile,
    before_rename: F,
) -> Result<(), String>
where
    F: FnOnce(),
{
    let mut safe_state = state.clone();
    sanitize_state(&mut safe_state);
    let bytes = serde_json::to_vec_pretty(&safe_state).map_err(|_| {
        checkpoint_error(
            "agent-host-checkpoint-json",
            "Agent Host checkpoint could not be encoded.",
        )
    })?;
    if bytes.len() as u64 > MAX_CHECKPOINT_BYTES {
        return Err(checkpoint_error(
            "agent-host-checkpoint-size",
            "Agent Host checkpoint exceeds the size limit.",
        ));
    }
    #[cfg(unix)]
    {
        return write_checkpoint_unix(root, &bytes, before_rename);
    }
    #[cfg(not(unix))]
    {
        write_checkpoint_path(root, &bytes, before_rename)
    }
}

#[cfg(not(unix))]
fn write_checkpoint_path<F>(root: &Path, bytes: &[u8], before_rename: F) -> Result<(), String>
where
    F: FnOnce(),
{
    let (directory, directory_identity) = ensure_checkpoint_directory(root)?;
    let target = directory.join(FILE);
    let prior_target_identity = checked_existing_checkpoint(&target)?;
    let temporary = directory.join(format!(".{FILE}.{}.{}.tmp", std::process::id(), now()));
    let result = (|| -> Result<(), String> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options
                .mode(0o600)
                .custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
        }
        let mut file = options.open(&temporary).map_err(|error| io_error(&error))?;
        file.write_all(&bytes).map_err(|error| io_error(&error))?;
        file.sync_all().map_err(|error| io_error(&error))?;
        let metadata = file.metadata().map_err(|error| io_error(&error))?;
        if !metadata.is_file() || metadata.len() != bytes.len() as u64 {
            return Err(checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint temporary file changed identity.",
            ));
        }
        let temporary_identity = file_identity(&file)?;
        if checked_existing_checkpoint(&temporary)? != Some(temporary_identity) {
            return Err(checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint temporary file changed identity.",
            ));
        }
        if validate_directory(&directory)? != directory_identity
            || checked_existing_checkpoint(&target)? != prior_target_identity
        {
            return Err(checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint identity changed.",
            ));
        }
        before_rename();
        std::fs::rename(&temporary, &target).map_err(|error| io_error(&error))?;
        sync_directory(&directory)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(unix)]
#[derive(Clone, Copy, Debug)]
struct UnixStat {
    identity: FileIdentity,
    mode: libc::mode_t,
    size: u64,
}

#[cfg(unix)]
fn stat_from_raw(stat: &libc::stat) -> UnixStat {
    UnixStat {
        identity: FileIdentity {
            device: stat.st_dev as u64,
            inode: stat.st_ino as u64,
        },
        mode: stat.st_mode,
        size: stat.st_size.max(0) as u64,
    }
}

#[cfg(unix)]
fn fstat(file: &File) -> Result<UnixStat, String> {
    use std::os::fd::AsRawFd;
    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe { libc::fstat(file.as_raw_fd(), stat.as_mut_ptr()) } != 0 {
        return Err(io_error(&std::io::Error::last_os_error()));
    }
    Ok(stat_from_raw(unsafe { &stat.assume_init() }))
}

#[cfg(unix)]
fn fstatat(file: &File, name: &std::ffi::CStr) -> Result<Option<UnixStat>, String> {
    use std::os::fd::AsRawFd;
    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe {
        libc::fstatat(
            file.as_raw_fd(),
            name.as_ptr(),
            stat.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::NotFound {
            return Ok(None);
        }
        return Err(io_error(&error));
    }
    Ok(Some(stat_from_raw(unsafe { &stat.assume_init() })))
}

#[cfg(unix)]
fn open_directory(path: &Path) -> Result<File, String> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(libc::O_CLOEXEC | libc::O_DIRECTORY | libc::O_NOFOLLOW);
    options.open(path).map_err(|error| io_error(&error))
}

#[cfg(unix)]
fn openat(
    directory: &File,
    name: &std::ffi::CStr,
    flags: i32,
    mode: libc::mode_t,
) -> Result<File, String> {
    use std::os::fd::{AsRawFd, FromRawFd};
    let descriptor = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            flags,
            mode as libc::c_uint,
        )
    };
    if descriptor < 0 {
        return Err(io_error(&std::io::Error::last_os_error()));
    }
    Ok(unsafe { File::from_raw_fd(descriptor) })
}

#[cfg(unix)]
fn verify_root_path(root: &Path, root_directory: &File) -> Result<(), String> {
    if validate_directory(root)? != fstat(root_directory)?.identity {
        return Err(checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host workspace identity changed.",
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn verify_child_directory(
    root_directory: &File,
    directory: &File,
    name: &std::ffi::CStr,
    expected: &FileIdentity,
) -> Result<(), String> {
    let path_stat = fstatat(root_directory, name)?.ok_or_else(|| {
        checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint directory identity changed.",
        )
    })?;
    if path_stat.mode & libc::S_IFMT != libc::S_IFDIR
        || &path_stat.identity != expected
        || &fstat(directory)?.identity != expected
    {
        return Err(checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint directory identity changed.",
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn open_cutout_directory(root: &Path, create: bool) -> Result<Option<(File, File)>, String> {
    use std::os::fd::AsRawFd;
    validate_root_components(root)?;
    let root_directory = open_directory(root)?;
    verify_root_path(root, &root_directory)?;
    let cutout_name = c".cutout";
    let directory = match openat(
        &root_directory,
        cutout_name,
        libc::O_RDONLY | libc::O_CLOEXEC | libc::O_DIRECTORY | libc::O_NOFOLLOW,
        0,
    ) {
        Ok(directory) => directory,
        Err(error) => match fstatat(&root_directory, cutout_name)? {
            Some(stat) if stat.mode & libc::S_IFMT != libc::S_IFDIR => {
                return Err(checkpoint_error(
                    "agent-host-checkpoint-path",
                    "Agent Host checkpoint directory is not a real directory.",
                ));
            }
            Some(_) => return Err(error),
            None if !create => return Ok(None),
            None => {
                let result = unsafe {
                    libc::mkdirat(root_directory.as_raw_fd(), cutout_name.as_ptr(), 0o700)
                };
                if result != 0 {
                    let source = std::io::Error::last_os_error();
                    if source.kind() != std::io::ErrorKind::AlreadyExists {
                        return Err(io_error(&source));
                    }
                }
                openat(
                    &root_directory,
                    cutout_name,
                    libc::O_RDONLY | libc::O_CLOEXEC | libc::O_DIRECTORY | libc::O_NOFOLLOW,
                    0,
                )?
            }
        },
    };
    let identity = fstat(&directory)?.identity;
    verify_child_directory(&root_directory, &directory, cutout_name, &identity)?;
    verify_root_path(root, &root_directory)?;
    Ok(Some((root_directory, directory)))
}

#[cfg(unix)]
fn checked_regular_at(directory: &File, name: &std::ffi::CStr) -> Result<Option<UnixStat>, String> {
    let Some(stat) = fstatat(directory, name)? else {
        return Ok(None);
    };
    if stat.mode & libc::S_IFMT != libc::S_IFREG {
        return Err(checkpoint_error(
            "agent-host-checkpoint-type",
            "Agent Host checkpoint must be a regular file.",
        ));
    }
    if stat.size > MAX_CHECKPOINT_BYTES {
        return Err(checkpoint_error(
            "agent-host-checkpoint-size",
            "Agent Host checkpoint exceeds the size limit.",
        ));
    }
    Ok(Some(stat))
}

#[cfg(unix)]
fn read_checkpoint_unix<F>(root: &Path, after_open: F) -> Result<HostFile, String>
where
    F: FnOnce(),
{
    let Some((root_directory, directory)) = open_cutout_directory(root, false)? else {
        return Ok(empty());
    };
    let target_name = c"agent-host-state.json";
    let Some(path_stat) = checked_regular_at(&directory, target_name)? else {
        return Ok(empty());
    };
    let mut file = openat(
        &directory,
        target_name,
        libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        0,
    )?;
    let opened_stat = fstat(&file)?;
    if opened_stat.mode & libc::S_IFMT != libc::S_IFREG
        || opened_stat.size > MAX_CHECKPOINT_BYTES
        || opened_stat.identity != path_stat.identity
    {
        return Err(checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint identity changed.",
        ));
    }
    after_open();
    let mut bytes = Vec::with_capacity(opened_stat.size as usize);
    Read::by_ref(&mut file)
        .take(MAX_CHECKPOINT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| io_error(&error))?;
    if bytes.len() as u64 > MAX_CHECKPOINT_BYTES {
        return Err(checkpoint_error(
            "agent-host-checkpoint-size",
            "Agent Host checkpoint exceeds the size limit.",
        ));
    }
    let final_path_stat = checked_regular_at(&directory, target_name)?.ok_or_else(|| {
        checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint identity changed.",
        )
    })?;
    if fstat(&file)?.identity != path_stat.identity
        || final_path_stat.identity != path_stat.identity
    {
        return Err(checkpoint_error(
            "agent-host-checkpoint-identity",
            "Agent Host checkpoint identity changed.",
        ));
    }
    let directory_identity = fstat(&directory)?.identity;
    verify_child_directory(&root_directory, &directory, c".cutout", &directory_identity)?;
    verify_root_path(root, &root_directory)?;
    std::str::from_utf8(&bytes).map_err(|_| {
        checkpoint_error(
            "agent-host-checkpoint-utf8",
            "Agent Host checkpoint must be UTF-8 JSON.",
        )
    })?;
    let mut state = serde_json::from_slice::<HostFile>(&bytes).map_err(|_| {
        checkpoint_error(
            "agent-host-checkpoint-json",
            "Agent Host checkpoint contains invalid JSON.",
        )
    })?;
    sanitize_state(&mut state);
    Ok(state)
}

#[cfg(unix)]
fn write_checkpoint_unix<F>(root: &Path, bytes: &[u8], before_rename: F) -> Result<(), String>
where
    F: FnOnce(),
{
    use std::os::fd::AsRawFd;
    let (root_directory, directory) = open_cutout_directory(root, true)?.ok_or_else(|| {
        checkpoint_error(
            "agent-host-checkpoint-io",
            "Agent Host checkpoint directory could not be created.",
        )
    })?;
    let directory_identity = fstat(&directory)?.identity;
    let target_name = c"agent-host-state.json";
    let prior_target = checked_regular_at(&directory, target_name)?;
    let temporary_name =
        std::ffi::CString::new(format!(".{FILE}.{}.tmp", uuid::Uuid::new_v4().simple()))
            .map_err(|_| io_error(&std::io::Error::from(std::io::ErrorKind::InvalidInput)))?;
    let result = (|| -> Result<(), String> {
        let mut file = openat(
            &directory,
            &temporary_name,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            0o600,
        )?;
        file.write_all(bytes).map_err(|error| io_error(&error))?;
        file.sync_all().map_err(|error| io_error(&error))?;
        let temporary_stat = fstat(&file)?;
        if temporary_stat.mode & libc::S_IFMT != libc::S_IFREG
            || temporary_stat.size != bytes.len() as u64
            || !checked_regular_at(&directory, &temporary_name)?
                .is_some_and(|path_stat| path_stat.identity == temporary_stat.identity)
        {
            return Err(checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint temporary file changed identity.",
            ));
        }
        before_rename();
        verify_child_directory(&root_directory, &directory, c".cutout", &directory_identity)?;
        verify_root_path(root, &root_directory)?;
        if checked_regular_at(&directory, target_name)?.map(|stat| stat.identity)
            != prior_target.map(|stat| stat.identity)
        {
            return Err(checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint identity changed.",
            ));
        }
        if unsafe {
            libc::renameat(
                directory.as_raw_fd(),
                temporary_name.as_ptr(),
                directory.as_raw_fd(),
                target_name.as_ptr(),
            )
        } != 0
        {
            return Err(io_error(&std::io::Error::last_os_error()));
        }
        directory.sync_all().map_err(|error| io_error(&error))?;
        let installed = checked_regular_at(&directory, target_name)?.ok_or_else(|| {
            checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint identity changed.",
            )
        })?;
        if installed.identity != temporary_stat.identity {
            return Err(checkpoint_error(
                "agent-host-checkpoint-identity",
                "Agent Host checkpoint identity changed.",
            ));
        }
        verify_child_directory(&root_directory, &directory, c".cutout", &directory_identity)?;
        verify_root_path(root, &root_directory)
    })();
    if result.is_err() {
        unsafe {
            libc::unlinkat(directory.as_raw_fd(), temporary_name.as_ptr(), 0);
        }
    }
    result
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) -> Result<(), String> {
    Ok(())
}
fn empty() -> HostFile {
    HostFile {
        version: 1,
        status: "stopped".into(),
        instance_id: None,
        runs: HashMap::new(),
        receipts: HashMap::new(),
        events: Vec::new(),
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn event(
    state: &mut HostFile,
    run: Option<&str>,
    node: Option<&str>,
    kind: &str,
    detail: Option<String>,
) {
    event_with_code(state, run, node, kind, detail, None)
}
fn event_with_code(
    state: &mut HostFile,
    run: Option<&str>,
    node: Option<&str>,
    kind: &str,
    detail: Option<String>,
    detail_code: Option<&str>,
) {
    let at = now();
    state.events.push(HostEvent {
        id: format!("host.{at}.{}", state.events.len()),
        run_id: run.map(str::to_owned),
        node_id: node.map(str::to_owned),
        kind: kind.into(),
        at,
        detail: detail.map(|value| sanitize_message(&value)),
        detail_code: detail_code.map(str::to_owned),
    })
}
fn sanitize_state(state: &mut HostFile) {
    for run in state.runs.values_mut() {
        run.cancel_reason = run
            .cancel_reason
            .take()
            .map(|value| sanitize_message(&value));
        for node in run.nodes.values_mut() {
            for attempt in &mut node.attempts {
                if let Some(error) = attempt.error.take() {
                    attempt.error = Some(sanitize_message(&error));
                }
            }
        }
    }
    for entry in &mut state.events {
        if let Some(detail) = entry.detail.take() {
            entry.detail = Some(sanitize_message(&detail));
        }
    }
}
fn sanitize_message(value: &str) -> String {
    let without_ansi = strip_ansi(value);
    let mut output = Vec::new();
    for word in without_ansi.split_whitespace() {
        let lowered = word.to_ascii_lowercase();
        let unwrapped = word.trim_start_matches(['(', '[', '{', '<', '\'', '"', '=']);
        let path_shaped = unwrapped.starts_with('/')
            || unwrapped.starts_with("~/")
            || unwrapped.to_ascii_lowercase().starts_with("file:/")
            || word.contains(":/")
            || word.contains(":\\")
            || unwrapped
                .as_bytes()
                .get(1..3)
                .is_some_and(|bytes| bytes == b":\\" || bytes == b":/");
        let credential_shaped = [
            "api_key",
            "apikey",
            "authorization",
            "bearer",
            "password",
            "secret",
            "token",
        ]
        .iter()
        .any(|marker| lowered.contains(marker))
            || crate::commands::scan_repository::credential_content(word.as_bytes());
        output.push(if path_shaped {
            "[path]"
        } else if credential_shaped {
            "[credential]"
        } else {
            word
        });
    }
    let mut message = output.join(" ");
    if message.is_empty() {
        message = "Operation failed.".into();
    }
    if message.chars().count() > MAX_ERROR_MESSAGE_CHARS {
        message = message.chars().take(MAX_ERROR_MESSAGE_CHARS).collect();
    }
    message
}
fn strip_ansi(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if matches!(
            ch,
            '\u{1b}' | '\u{9b}' | '\u{9d}' | '\u{90}' | '\u{98}' | '\u{9e}' | '\u{9f}'
        ) {
            match chars.peek().copied() {
                Some('[') if ch == '\u{1b}' => {
                    chars.next();
                    for next in chars.by_ref() {
                        if ('@'..='~').contains(&next) {
                            break;
                        }
                    }
                }
                Some(']') if ch == '\u{1b}' => {
                    chars.next();
                    while let Some(next) = chars.next() {
                        if next == '\u{7}' {
                            break;
                        }
                        if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some('P' | 'X' | '^' | '_') if ch == '\u{1b}' => {
                    chars.next();
                    while let Some(next) = chars.next() {
                        if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                _ if matches!(ch, '\u{9d}' | '\u{90}' | '\u{98}' | '\u{9e}' | '\u{9f}') => {
                    while let Some(next) = chars.next() {
                        if next == '\u{7}' || next == '\u{9c}' {
                            break;
                        }
                        if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                _ if ch == '\u{9b}' => {
                    for next in chars.by_ref() {
                        if ('@'..='~').contains(&next) {
                            break;
                        }
                    }
                }
                Some(_) => {
                    chars.next();
                }
                None => {}
            }
        } else if ch.is_control() {
            output.push(' ');
        } else {
            output.push(ch);
        }
    }
    output
}
async fn load(root: &Path) -> Result<HostFile, String> {
    read_checkpoint(root)
}
async fn save(root: &Path, state: &HostFile) -> Result<(), String> {
    write_checkpoint(root, state)
}
fn recover_at(mut state: HostFile, instance: &str, at: u64) -> HostFile {
    for run in state.runs.values_mut() {
        if run.status == "queued" {
            run.status = "paused".into();
            run.updated_at = at
        } else if run.status == "running" {
            let mut changed = false;
            for node in run.nodes.values_mut() {
                if node.status == "running" {
                    if node
                        .lease
                        .as_ref()
                        .is_some_and(|lease| lease.expires_at > at)
                    {
                        continue;
                    }
                    changed = true;
                    node.lease = None;
                    if let Some(attempt) = node.attempts.last_mut() {
                        attempt.completed_at.get_or_insert(at);
                        attempt.error = Some("The Agent process lease expired.".into());
                        attempt.error_code = Some("lease-expired".into());
                    }
                    if node.attempts.len() as u32 >= retry_limit(node) {
                        node.status = "failed".into();
                    } else {
                        node.status = "queued".into();
                    }
                }
            }
            if changed {
                run.status = if run.nodes.values().any(|node| node.status == "failed") {
                    "failed"
                } else {
                    "recovering"
                }
                .into();
                run.updated_at = at;
            }
        }
    }
    sanitize_state(&mut state);
    state.status = "running".into();
    state.instance_id = Some(instance.into());
    event(&mut state, None, None, "host-recovered", None);
    state
}
fn retry_limit(node: &Node) -> u32 {
    node.max_attempts
}
fn lock_for(
    state: &AgentHostDesktopState,
    root: &Path,
) -> Result<Arc<tokio::sync::Mutex<()>>, String> {
    let mut locks = state
        .locks
        .lock()
        .map_err(|_| "Agent Host lock poisoned.".to_string())?;
    Ok(locks.entry(root.to_path_buf()).or_default().clone())
}
async fn root_locked(
    registry: &RegistryDesktopState,
    host: &AgentHostDesktopState,
    handle: &str,
) -> Result<(PathBuf, Arc<tokio::sync::Mutex<()>>), String> {
    let root = authorized(registry, handle)?;
    let lock = lock_for(host, &root)?;
    Ok((root, lock))
}
fn workspace_identity(root: &Path) -> String {
    let mut hash = Sha256::new();
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        hash.update(root.as_os_str().as_bytes());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        for unit in root.as_os_str().encode_wide() {
            hash.update(unit.to_le_bytes());
        }
    }
    hash.finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn process_key(root: &Path, run_id: &str, node_id: &str) -> ProcessKey {
    ProcessKey {
        workspace: workspace_identity(root),
        run_id: run_id.into(),
        node_id: node_id.into(),
    }
}
#[cfg(unix)]
#[allow(dead_code)]
pub(crate) fn register_process_group(
    host: &AgentHostDesktopState,
    root: &Path,
    run_id: &str,
    node_id: &str,
    grant: &LeaseGrant,
    mut child: Child,
) -> Result<(), String> {
    let process_group_id = child.id() as i32;
    if process_group_id <= 1 || process_group_id == unsafe { libc::getpgrp() } {
        return Err("process-custody-invalid: Invalid Agent process group.".into());
    }
    if child
        .try_wait()
        .map_err(|_| "process-custody-inspect: Agent process inspection failed.".to_string())?
        .is_some()
        || unsafe { libc::getpgid(process_group_id) } != process_group_id
    {
        return Err("process-custody-invalid: Agent child does not own its process group.".into());
    }
    let key = process_key(root, run_id, node_id);
    let mut processes = host
        .processes
        .lock()
        .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
    if processes.contains_key(&key) {
        return Err("process-custody-conflict: Agent node already owns a process group.".into());
    }
    processes.insert(
        key,
        RegisteredProcess {
            lease_id: grant.lease_id.clone(),
            process_group_id,
            child: Arc::new(Mutex::new(child)),
        },
    );
    Ok(())
}
#[cfg(windows)]
#[allow(dead_code)]
pub(crate) fn register_process_group(
    _host: &AgentHostDesktopState,
    _root: &Path,
    _run_id: &str,
    _node_id: &str,
    _grant: &LeaseGrant,
    _child: Child,
) -> Result<(), String> {
    Err("capability-required: Windows Job Object process custody is unavailable.".into())
}
#[allow(dead_code)]
pub(crate) fn unregister_process_group(
    host: &AgentHostDesktopState,
    root: &Path,
    run_id: &str,
    node_id: &str,
    lease_id: &str,
) -> Result<(), String> {
    let key = process_key(root, run_id, node_id);
    let registered = {
        let processes = host
            .processes
            .lock()
            .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
        processes
            .get(&key)
            .filter(|process| process.lease_id == lease_id)
            .cloned()
    };
    let Some(registered) = registered else {
        return Ok(());
    };
    #[cfg(unix)]
    {
        let mut child = registered
            .child
            .lock()
            .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
        if child
            .try_wait()
            .map_err(|_| "process-custody-inspect: Agent process inspection failed.".to_string())?
            .is_none()
        {
            return Err("process-custody-active: Agent process is still running.".into());
        }
    }
    let mut processes = host
        .processes
        .lock()
        .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
    if processes.get(&key).is_some_and(|current| {
        current.lease_id == registered.lease_id && {
            #[cfg(unix)]
            {
                Arc::ptr_eq(&current.child, &registered.child)
            }
            #[cfg(windows)]
            {
                true
            }
        }
    }) {
        processes.remove(&key);
    }
    Ok(())
}
async fn terminate_matching_processes<F>(
    host: &AgentHostDesktopState,
    matches: F,
) -> Result<(), String>
where
    F: Fn(&ProcessKey, &RegisteredProcess) -> bool,
{
    let selected = {
        let processes = host
            .processes
            .lock()
            .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
        processes
            .iter()
            .filter(|(key, process)| matches(key, process))
            .map(|(key, process)| (key.clone(), process.clone()))
            .collect::<Vec<_>>()
    };
    let terminated = selected.clone();
    tokio::task::spawn_blocking(move || {
        let mut first_error = None;
        for (_, process) in &terminated {
            if let Err(error) = terminate_process_group(process) {
                first_error.get_or_insert(error);
            }
        }
        first_error.map_or(Ok(()), Err)
    })
    .await
    .map_err(|_| "process-custody-join: Agent process termination failed.".to_string())??;
    let mut processes = host
        .processes
        .lock()
        .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
    for (key, process) in selected {
        if processes
            .get(&key)
            .is_some_and(|current| current.lease_id == process.lease_id)
        {
            processes.remove(&key);
        }
    }
    Ok(())
}
#[allow(dead_code)]
pub(crate) async fn cancel_registered_node(
    host: &AgentHostDesktopState,
    root: &Path,
    run_id: &str,
    node_id: &str,
) -> Result<(), String> {
    let expected = process_key(root, run_id, node_id);
    terminate_matching_processes(host, move |key, _| key == &expected).await
}
async fn cancel_registered_lease(
    host: &AgentHostDesktopState,
    root: &Path,
    run_id: &str,
    node_id: &str,
    lease_id: &str,
) -> Result<(), String> {
    let expected = process_key(root, run_id, node_id);
    let lease_id = lease_id.to_owned();
    terminate_matching_processes(host, move |key, process| {
        key == &expected && process.lease_id == lease_id
    })
    .await
}
async fn cancel_run_processes(
    host: &AgentHostDesktopState,
    root: &Path,
    run_id: &str,
) -> Result<(), String> {
    let workspace = workspace_identity(root);
    let run_id = run_id.to_owned();
    terminate_matching_processes(host, move |key, _| {
        key.workspace == workspace && key.run_id == run_id
    })
    .await
}
async fn cancel_workspace_processes(
    host: &AgentHostDesktopState,
    root: &Path,
) -> Result<(), String> {
    let workspace = workspace_identity(root);
    terminate_matching_processes(host, move |key, _| key.workspace == workspace).await
}
async fn cancel_expired_processes(
    host: &AgentHostDesktopState,
    root: &Path,
    state: &HostFile,
    at: u64,
) -> Result<(), String> {
    for (run_id, run) in &state.runs {
        for (node_id, node) in &run.nodes {
            let Some(lease) = node
                .lease
                .as_ref()
                .filter(|lease| node.status == "running" && lease.expires_at <= at)
            else {
                continue;
            };
            cancel_registered_lease(host, root, run_id, node_id, &lease.lease_id).await?;
        }
    }
    Ok(())
}
fn expire_rejected_heartbeat(
    state: &mut HostFile,
    run_id: &str,
    node_id: &str,
    lease_id: &str,
    at: u64,
) -> Result<bool, String> {
    let changed = {
        let run = state.runs.get_mut(run_id).ok_or("Unknown run.")?;
        let node = run.nodes.get_mut(node_id).ok_or("Unknown node.")?;
        if !node
            .lease
            .as_ref()
            .is_some_and(|lease| lease.lease_id == lease_id && lease.expires_at <= at)
        {
            false
        } else {
            node.lease = None;
            if node.attempts.len() as u32 >= retry_limit(node) {
                node.status = "failed".into();
                run.status = "failed".into();
            } else {
                node.status = "queued".into();
                run.status = "recovering".into();
            }
            if let Some(attempt) = node.attempts.last_mut() {
                attempt.completed_at.get_or_insert(at);
                attempt.error = Some("The Agent process lease expired.".into());
                attempt.error_code = Some("lease-expired".into());
            }
            run.updated_at = at;
            true
        }
    };
    if changed {
        event_with_code(
            state,
            Some(run_id),
            Some(node_id),
            "node-lease-expired",
            Some("The Agent process lease expired.".into()),
            Some("lease-expired"),
        );
    }
    Ok(changed)
}
fn lease_is_expired_for(
    state: &HostFile,
    run_id: &str,
    node_id: &str,
    lease_id: &str,
    at: u64,
) -> bool {
    state
        .runs
        .get(run_id)
        .and_then(|run| run.nodes.get(node_id))
        .and_then(|node| node.lease.as_ref())
        .is_some_and(|lease| lease.lease_id == lease_id && lease.expires_at <= at)
}
#[cfg(unix)]
fn child_exited_without_reap(child: &Child) -> Result<bool, String> {
    let mut information = std::mem::MaybeUninit::<libc::siginfo_t>::zeroed();
    let result = unsafe {
        libc::waitid(
            libc::P_PID,
            child.id() as libc::id_t,
            information.as_mut_ptr(),
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    if result != 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ECHILD) {
            return Ok(true);
        }
        return Err("process-custody-inspect: Agent process inspection failed.".into());
    }
    Ok(unsafe { information.assume_init().si_pid() } == child.id() as i32)
}

#[cfg(unix)]
fn terminate_process_group(process: &RegisteredProcess) -> Result<(), String> {
    let mut child = process
        .child
        .lock()
        .map_err(|_| "process-custody-lock: Agent process custody lock failed.".to_string())?;
    if child
        .try_wait()
        .map_err(|_| "process-custody-inspect: Agent process inspection failed.".to_string())?
        .is_some()
    {
        return Ok(());
    }
    let leader = child.id() as i32;
    let observed_group = unsafe { libc::getpgid(leader) };
    if observed_group < 0
        && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
        && child
            .try_wait()
            .map_err(|_| "process-custody-inspect: Agent process inspection failed.".to_string())?
            .is_some()
    {
        return Ok(());
    }
    if leader != process.process_group_id || observed_group != process.process_group_id {
        return Err("process-custody-identity: Agent process identity changed.".into());
    }
    let group = -process.process_group_id;
    let signal = unsafe { libc::kill(group, libc::SIGINT) };
    if signal != 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            return Ok(());
        }
        return Err("process-termination-failed: Agent process termination failed.".into());
    }
    let deadline = std::time::Instant::now() + PROCESS_GRACE;
    while std::time::Instant::now() < deadline {
        if unsafe { libc::kill(group, 0) } != 0
            && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
        {
            child.wait().map_err(|_| {
                "process-termination-failed: Agent process did not exit.".to_string()
            })?;
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let killed = unsafe { libc::kill(group, libc::SIGKILL) };
    if killed != 0 {
        let error = std::io::Error::last_os_error();
        let group_has_no_signalable_process = error.raw_os_error() == Some(libc::ESRCH)
            || (error.raw_os_error() == Some(libc::EPERM) && child_exited_without_reap(&child)?);
        if !group_has_no_signalable_process {
            return Err(
                "process-termination-failed: Agent process force termination failed.".into(),
            );
        }
    }
    child
        .wait()
        .map_err(|_| "process-termination-failed: Agent process did not exit.".to_string())?;
    Ok(())
}
#[cfg(windows)]
fn terminate_process_group(_process: &RegisteredProcess) -> Result<(), String> {
    Err("capability-required: Windows Job Object process custody is unavailable.".into())
}
#[tauri::command]
pub async fn agent_host_start(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    instance_id: String,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    let loaded = load(&root).await?;
    let at = now();
    cancel_expired_processes(&host, &root, &loaded, at).await?;
    let state = recover_at(loaded, &instance_id, at);
    save(&root, &state).await?;
    Ok(state)
}
#[tauri::command]
pub async fn agent_host_status(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    load(&root).await
}
#[tauri::command]
pub async fn agent_host_shutdown(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    cancel_workspace_processes(&host, &root).await?;
    let mut state = load(&root).await?;
    {
        state.status = "stopped".into();
        state.instance_id = None;
        event(&mut state, None, None, "host-stopped", None);
    }
    save(&root, &state).await?;
    Ok(state)
}
#[tauri::command]
pub async fn agent_host_recover(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    instance_id: String,
) -> Result<HostFile, String> {
    agent_host_start(registry, host, workspace_handle, instance_id).await
}
#[tauri::command]
pub async fn agent_host_run_start(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    nodes: Vec<NodeInput>,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        if state.runs.contains_key(&run_id) {
            return Ok(());
        }
        let at = now();
        let map = nodes
            .into_iter()
            .map(|n| {
                (
                    n.id.clone(),
                    Node {
                        id: n.id,
                        effect_key: n.effect_key,
                        status: "queued".into(),
                        attempts: vec![],
                        lease: None,
                        receipt_id: None,
                        next_attempt_at: None,
                        max_attempts: 1,
                    },
                )
            })
            .collect();
        state.runs.insert(
            run_id.clone(),
            Run {
                id: run_id.clone(),
                status: "queued".into(),
                created_at: at,
                updated_at: at,
                nodes: map,
                cancel_reason: None,
            },
        );
        event(state, Some(&run_id), None, "run-started", None);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_node_claim(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    lease_ms: u64,
    max_attempts: u32,
) -> Result<ClaimOutcome, String> {
    if max_attempts == 0 {
        return Err("Retry limit must be at least 1.".into());
    }
    let mut granted = None;
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    let mut state = load(&root).await?;
    let at = now();
    if let Some(lease_id) = state
        .runs
        .get(&run_id)
        .and_then(|run| run.nodes.get(&node_id))
        .and_then(|node| node.lease.as_ref())
        .filter(|lease| lease.expires_at <= at)
        .map(|lease| lease.lease_id.clone())
    {
        cancel_registered_lease(&host, &root, &run_id, &node_id, &lease_id).await?;
        expire_rejected_heartbeat(&mut state, &run_id, &node_id, &lease_id, at)?;
    }
    {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        let node = run.nodes.get_mut(&node_id).ok_or("Unknown node.")?;
        let blocked = matches!(node.status.as_str(), "succeeded" | "failed" | "cancelled")
            || node.lease.as_ref().is_some_and(|v| v.expires_at > at)
            || node.next_attempt_at.is_some_and(|value| value > at);
        if !blocked {
            if node.attempts.is_empty() {
                node.max_attempts = max_attempts;
            }
            let configured_max_attempts = node.max_attempts;
            if node.attempts.len() as u32 >= configured_max_attempts {
                node.status = "failed".into();
            } else {
                let attempt = node.attempts.len() as u32 + 1;
                node.attempts.push(Attempt {
                    number: attempt,
                    started_at: at,
                    completed_at: None,
                    error: None,
                    error_code: None,
                });
                node.status = "running".into();
                node.next_attempt_at = None;
                let owner = state.instance_id.clone().ok_or("Host is not started.")?;
                let lease_id = format!("{owner}:{run_id}:{node_id}:{attempt}:{at}");
                let expires_at = at.saturating_add(lease_ms);
                node.lease = Some(Lease {
                    owner: owner.clone(),
                    lease_id: lease_id.clone(),
                    heartbeat_at: at,
                    expires_at,
                });
                granted = Some(LeaseGrant {
                    owner,
                    lease_id,
                    attempt,
                    expires_at,
                });
                run.status = "running".into();
                run.updated_at = at;
                event(
                    &mut state,
                    Some(&run_id),
                    Some(&node_id),
                    "node-started",
                    None,
                );
            }
        }
    }
    save(&root, &state).await?;
    Ok(ClaimOutcome {
        claimed: granted.is_some(),
        grant: granted,
        state,
    })
}
fn validate_grant(node: &Node, grant: &LeaseGrant, at: u64) -> Result<(), String> {
    let lease = node.lease.as_ref().ok_or("Node has no active lease.")?;
    let attempt = node.attempts.last().map(|value| value.number);
    if node.status != "running"
        || lease.owner != grant.owner
        || lease.lease_id.is_empty()
        || lease.lease_id != grant.lease_id
        || attempt != Some(grant.attempt)
        || at >= lease.expires_at
    {
        return Err("Node lease grant is stale.".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn agent_host_node_heartbeat(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    lease_ms: u64,
    grant: LeaseGrant,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    let mut state = load(&root).await?;
    let at = now();
    let validation = state
        .runs
        .get(&run_id)
        .ok_or_else(|| "Unknown run.".to_string())?
        .nodes
        .get(&node_id)
        .ok_or_else(|| "Unknown node.".to_string())
        .and_then(|node| validate_grant(node, &grant, at));
    if let Err(error) = validation {
        if lease_is_expired_for(&state, &run_id, &node_id, &grant.lease_id, at) {
            cancel_registered_lease(&host, &root, &run_id, &node_id, &grant.lease_id).await?;
            expire_rejected_heartbeat(&mut state, &run_id, &node_id, &grant.lease_id, at)?;
            save(&root, &state).await?;
        }
        return Err(error);
    }
    let lease = state
        .runs
        .get_mut(&run_id)
        .ok_or("Unknown run.")?
        .nodes
        .get_mut(&node_id)
        .ok_or("Unknown node.")?
        .lease
        .as_mut()
        .ok_or("Node has no active lease.")?;
    lease.heartbeat_at = at;
    lease.expires_at = at.saturating_add(lease_ms);
    save(&root, &state).await?;
    Ok(state)
}
#[tauri::command]
pub async fn agent_host_run_pause(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if !matches!(run.status.as_str(), "completed" | "failed" | "cancelled") {
            run.status = "paused".into();
            run.updated_at = now();
            event(state, Some(&run_id), None, "run-paused", None)
        }
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_run_resume(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if matches!(run.status.as_str(), "paused" | "recovering") {
            run.status = "queued".into();
            run.updated_at = now();
            event(state, Some(&run_id), None, "run-resumed", None)
        }
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_node_fail(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    error: String,
    max_attempts: u32,
    base_delay_ms: u64,
    max_delay_ms: u64,
    jitter_milli: u16,
    grant: LeaseGrant,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        if jitter_milli > 1000 {
            return Err("Retry jitter must be at most 1000 milli-units.".into());
        }
        let error = sanitize_message(&error);
        let at = now();
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if run.status == "cancelled" {
            return Ok(());
        }
        let node = run.nodes.get_mut(&node_id).ok_or("Unknown node.")?;
        validate_grant(node, &grant, at)?;
        if max_attempts != node.max_attempts {
            return Err("Retry limit does not match the claimed node policy.".into());
        }
        if let Some(attempt) = node.attempts.last_mut() {
            attempt.completed_at = Some(at);
            attempt.error = Some(error.clone());
            attempt.error_code = Some("effect-failed".into())
        }
        node.lease = None;
        let configured_max_attempts = node.max_attempts;
        if node.attempts.len() as u32 >= configured_max_attempts {
            node.status = "failed".into();
            run.status = "failed".into();
            event_with_code(
                state,
                Some(&run_id),
                Some(&node_id),
                "node-failed",
                Some(error),
                Some("effect-failed"),
            );
            return Ok(());
        }
        let exponent = (node.attempts.len().saturating_sub(1)).min(31) as u32;
        let base = base_delay_ms
            .saturating_mul(2u64.saturating_pow(exponent))
            .min(max_delay_ms);
        let spread = base.saturating_mul(jitter_milli as u64) / 1000;
        let offset = if spread == 0 {
            0
        } else {
            at % (spread.saturating_mul(2) + 1)
        };
        node.next_attempt_at = Some(at + base.saturating_sub(spread) + offset);
        node.status = "retry-wait".into();
        event_with_code(
            state,
            Some(&run_id),
            Some(&node_id),
            "node-retry-scheduled",
            Some(error),
            Some("effect-failed"),
        );
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_node_complete(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    receipt_id: Option<String>,
    grant: LeaseGrant,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let at = now();
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if run.status == "cancelled" {
            return Ok(());
        }
        let node = run.nodes.get_mut(&node_id).ok_or("Unknown node.")?;
        if node.status == "succeeded" {
            if node.receipt_id != receipt_id {
                return Err("Side-effect receipt conflict.".into());
            }
            return Ok(());
        }
        if node.status != "running" {
            return Err("Node completion requires an active attempt.".into());
        }
        validate_grant(node, &grant, at)?;
        if let Some(key) = &node.effect_key {
            let receipt_id = receipt_id
                .clone()
                .ok_or("Side-effect completion requires a receipt.")?;
            if let Some(existing) = state.receipts.get(key) {
                if existing.receipt_id != receipt_id {
                    return Err("Side-effect receipt conflict.".into());
                }
            } else {
                state.receipts.insert(
                    key.clone(),
                    Receipt {
                        receipt_id: receipt_id.clone(),
                        run_id: run_id.clone(),
                        node_id: node_id.clone(),
                        committed_at: at,
                    },
                );
            }
        }
        node.status = "succeeded".into();
        node.lease = None;
        node.receipt_id = receipt_id;
        if let Some(attempt) = node.attempts.last_mut() {
            attempt.completed_at = Some(at)
        }
        run.updated_at = at;
        if run.nodes.values().all(|n| n.status == "succeeded") {
            run.status = "completed".into()
        }
        event(state, Some(&run_id), Some(&node_id), "node-succeeded", None);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_run_cancel(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    reason: String,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    cancel_run_processes(&host, &root, &run_id).await?;
    let mut state = load(&root).await?;
    {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if run.status == "completed" {
            return Ok(state);
        }
        let reason = sanitize_message(&reason);
        run.status = "cancelled".into();
        run.cancel_reason = Some(reason.clone());
        run.updated_at = now();
        for node in run.nodes.values_mut() {
            if node.status != "succeeded" {
                node.status = "cancelled".into();
                node.lease = None
            }
        }
        event_with_code(
            &mut state,
            Some(&run_id),
            None,
            "run-cancelled",
            Some(reason),
            Some("run-cancelled"),
        );
    }
    save(&root, &state).await?;
    Ok(state)
}
async fn mutate<F>(
    registry: &RegistryDesktopState,
    host: &AgentHostDesktopState,
    handle: &str,
    change: F,
) -> Result<HostFile, String>
where
    F: FnOnce(&mut HostFile) -> Result<(), String>,
{
    let (root, lock) = root_locked(registry, host, handle).await?;
    let _guard = lock.lock().await;
    let mut state = load(&root).await?;
    change(&mut state)?;
    save(&root, &state).await?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::os::unix::{fs::PermissionsExt, process::CommandExt};

    fn attempt(number: u32) -> Attempt {
        Attempt {
            number,
            started_at: 10,
            completed_at: None,
            error: None,
            error_code: None,
        }
    }

    fn running_node(expires_at: u64, max_attempts: u32) -> Node {
        Node {
            id: "node".into(),
            effect_key: None,
            status: "running".into(),
            attempts: vec![attempt(1)],
            lease: Some(Lease {
                owner: "host".into(),
                lease_id: "lease-1".into(),
                heartbeat_at: 10,
                expires_at,
            }),
            receipt_id: None,
            next_attempt_at: None,
            max_attempts,
        }
    }

    fn state_with_node(node: Node) -> HostFile {
        let mut state = empty();
        state.status = "running".into();
        state.runs.insert(
            "run".into(),
            Run {
                id: "run".into(),
                status: "running".into(),
                created_at: 1,
                updated_at: 1,
                nodes: HashMap::from([("node".into(), node)]),
                cancel_reason: None,
            },
        );
        state
    }

    #[tokio::test]
    async fn atomic_file_recovery_keeps_completed_nodes() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let mut state = empty();
        state.status = "running".into();
        state.runs.insert(
            "r".into(),
            Run {
                id: "r".into(),
                status: "running".into(),
                created_at: 1,
                updated_at: 1,
                nodes: HashMap::from([
                    (
                        "done".into(),
                        Node {
                            id: "done".into(),
                            effect_key: None,
                            status: "succeeded".into(),
                            attempts: vec![],
                            lease: None,
                            receipt_id: None,
                            next_attempt_at: None,
                            max_attempts: 1,
                        },
                    ),
                    (
                        "active".into(),
                        Node {
                            id: "active".into(),
                            effect_key: None,
                            status: "running".into(),
                            attempts: vec![],
                            lease: Some(Lease {
                                owner: "old".into(),
                                lease_id: "old:r:active:1:1".into(),
                                heartbeat_at: 1,
                                expires_at: 2,
                            }),
                            receipt_id: None,
                            next_attempt_at: None,
                            max_attempts: 3,
                        },
                    ),
                ]),
                cancel_reason: None,
            },
        );
        save(&root, &state).await.unwrap();
        let next = recover_at(load(&root).await.unwrap(), "new", now());
        assert_eq!(next.runs["r"].status, "recovering");
        assert_eq!(next.runs["r"].nodes["done"].status, "succeeded");
        assert_eq!(next.runs["r"].nodes["active"].status, "queued");
        assert!(next.runs["r"].nodes["active"].lease.is_none())
    }

    #[test]
    fn lease_grant_is_bound_to_owner_attempt_and_live_lease() {
        let node = Node {
            id: "node".into(),
            effect_key: None,
            status: "running".into(),
            attempts: vec![Attempt {
                number: 2,
                started_at: 10,
                completed_at: None,
                error: None,
                error_code: None,
            }],
            lease: Some(Lease {
                owner: "host".into(),
                lease_id: "lease-2".into(),
                heartbeat_at: 10,
                expires_at: 20,
            }),
            receipt_id: None,
            next_attempt_at: None,
            max_attempts: 3,
        };
        let grant = LeaseGrant {
            owner: "host".into(),
            lease_id: "lease-2".into(),
            attempt: 2,
            expires_at: 20,
        };
        assert!(validate_grant(&node, &grant, 19).is_ok());
        assert!(validate_grant(&node, &grant, 20).is_err());
        assert!(validate_grant(
            &node,
            &LeaseGrant {
                lease_id: "other".into(),
                ..grant
            },
            19
        )
        .is_err());
        let state = state_with_node(node);
        assert!(!lease_is_expired_for(&state, "run", "node", "lease-2", 19));
        assert!(!lease_is_expired_for(&state, "run", "node", "other", 20));
        assert!(lease_is_expired_for(&state, "run", "node", "lease-2", 20));
    }

    #[test]
    fn recovery_preserves_live_leases_and_exhausts_one_attempt_nodes() {
        let live = recover_at(state_with_node(running_node(101, 1)), "next", 100);
        assert_eq!(live.runs["run"].status, "running");
        assert_eq!(live.runs["run"].nodes["node"].status, "running");
        assert_eq!(
            live.runs["run"].nodes["node"]
                .lease
                .as_ref()
                .unwrap()
                .lease_id,
            "lease-1"
        );

        let expired = recover_at(state_with_node(running_node(100, 1)), "next", 100);
        let node = &expired.runs["run"].nodes["node"];
        assert_eq!(expired.runs["run"].status, "failed");
        assert_eq!(node.status, "failed");
        assert!(node.lease.is_none());
        assert_eq!(
            node.attempts[0].error_code.as_deref(),
            Some("lease-expired")
        );

        let retryable = recover_at(state_with_node(running_node(100, 2)), "next", 100);
        let node = &retryable.runs["run"].nodes["node"];
        assert_eq!(retryable.runs["run"].status, "recovering");
        assert_eq!(node.status, "queued");
        assert_eq!(node.attempts[0].completed_at, Some(100));
        assert_eq!(
            node.attempts[0].error_code.as_deref(),
            Some("lease-expired")
        );
    }

    #[test]
    fn retry_limit_round_trips_without_inventing_a_missing_policy() {
        let session = running_node(100, 1);
        assert_eq!(retry_limit(&session), 1);
        let persisted = serde_json::to_vec(&state_with_node(session.clone())).unwrap();
        let restored: HostFile = serde_json::from_slice(&persisted).unwrap();
        assert_eq!(restored.runs["run"].nodes["node"].max_attempts, 1);
        assert_eq!(
            recover_at(state_with_node(session), "next", 100).runs["run"].status,
            "failed"
        );
    }

    #[test]
    fn retry_limit_rejects_missing_or_zero_persisted_policy() {
        let mut missing = serde_json::to_value(state_with_node(running_node(100, 1))).unwrap();
        missing["runs"]["run"]["nodes"]["node"]
            .as_object_mut()
            .unwrap()
            .remove("maxAttempts");
        assert!(serde_json::from_value::<HostFile>(missing).is_err());

        let mut zero = serde_json::to_value(state_with_node(running_node(100, 1))).unwrap();
        zero["runs"]["run"]["nodes"]["node"]["maxAttempts"] = serde_json::json!(0);
        assert!(serde_json::from_value::<HostFile>(zero).is_err());
    }

    #[test]
    fn canonical_workspace_identity_shares_one_lock() {
        let state = AgentHostDesktopState::default();
        let root = PathBuf::from("/canonical/workspace");
        let first = lock_for(&state, &root).unwrap();
        let second = lock_for(&state, &root).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn checkpoint_rejects_malformed_oversized_and_non_regular_files() {
        let directory = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(directory.path()).unwrap();
        let cutout = root.join(".cutout");
        std::fs::create_dir(&cutout).unwrap();
        let target = cutout.join(FILE);
        std::fs::write(&target, [0xff]).unwrap();
        assert!(read_checkpoint(&root).unwrap_err().contains("utf8"));
        std::fs::write(&target, b"{").unwrap();
        assert!(read_checkpoint(&root).unwrap_err().contains("json"));
        let file = File::create(&target).unwrap();
        file.set_len(MAX_CHECKPOINT_BYTES + 1).unwrap();
        assert!(read_checkpoint(&root).unwrap_err().contains("size"));
        std::fs::remove_file(&target).unwrap();
        std::fs::create_dir(&target).unwrap();
        assert!(read_checkpoint(&root).unwrap_err().contains("regular file"));
    }

    #[cfg(unix)]
    #[test]
    fn checkpoint_rejects_symlinks_permissions_and_identity_changes() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(directory.path()).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.join(".cutout")).unwrap();
        assert!(read_checkpoint(&root)
            .unwrap_err()
            .contains("real directory"));
        std::fs::remove_file(root.join(".cutout")).unwrap();
        let cutout = root.join(".cutout");
        std::fs::create_dir(&cutout).unwrap();
        let target = cutout.join(FILE);
        std::fs::write(&target, serde_json::to_vec(&empty()).unwrap()).unwrap();
        let replacement = cutout.join("replacement.json");
        std::fs::write(&replacement, serde_json::to_vec(&empty()).unwrap()).unwrap();
        let identity_error = read_checkpoint_with_hook(&root, || {
            std::fs::rename(&replacement, &target).unwrap();
        })
        .unwrap_err();
        assert!(identity_error.contains("identity"));
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o000)).unwrap();
        let permission_error = read_checkpoint(&root).unwrap_err();
        assert!(permission_error.contains("permission"));
        assert!(!permission_error.contains(root.to_string_lossy().as_ref()));
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600)).unwrap();
        std::fs::remove_file(&target).unwrap();
        std::os::unix::fs::symlink(outside.path().join("state.json"), &target).unwrap();
        assert!(read_checkpoint(&root).unwrap_err().contains("regular file"));
    }

    #[cfg(unix)]
    #[test]
    fn checkpoint_temporary_and_final_files_are_owner_only() {
        let directory = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(directory.path()).unwrap();
        write_checkpoint(&root, &empty()).unwrap();
        let mode = std::fs::metadata(root.join(".cutout").join(FILE))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn checkpoint_write_cannot_be_redirected_by_directory_replacement() {
        let directory = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(directory.path()).unwrap();
        write_checkpoint(&root, &empty()).unwrap();
        let cutout = root.join(".cutout");
        let displaced = root.join(".cutout-displaced");
        let attacker_bytes = b"attacker-controlled";
        let error = write_checkpoint_with_hook(&root, &empty(), || {
            std::fs::rename(&cutout, &displaced).unwrap();
            std::fs::create_dir(&cutout).unwrap();
            std::fs::write(cutout.join(FILE), attacker_bytes).unwrap();
        })
        .unwrap_err();
        assert!(error.contains("identity"));
        assert_eq!(std::fs::read(cutout.join(FILE)).unwrap(), attacker_bytes);
        assert!(std::fs::read_dir(&displaced).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".tmp")));
    }

    #[test]
    fn caller_errors_are_sanitized_before_state_projection() {
        let message = sanitize_message(
            "\u{1b}[31mfailed\u{1b}[0m at:/Users/name/project file:///private/tmp/key OPENAI_API_KEY=sk-12345678901234567890\nnext \u{1b}Pprivate-diagnostic\u{1b}\\done",
        );
        assert_eq!(message, "failed [path] [path] [credential] next done");
        assert!(!message.contains("Users"));
        assert!(!message.contains("private-diagnostic"));
        assert!(!message.contains("sk-"));
        assert!(!message.contains('\u{1b}'));
    }

    #[cfg(unix)]
    fn spawn_process_group() -> std::process::Child {
        let mut command = std::process::Command::new("/bin/sh");
        command.args(["-c", "sleep 30 & wait"]);
        unsafe {
            command.pre_exec(|| {
                if libc::setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
        command.spawn().unwrap()
    }

    #[cfg(unix)]
    async fn wait_for_exit(child: &Arc<Mutex<std::process::Child>>) {
        for _ in 0..50 {
            if child.lock().unwrap().try_wait().unwrap().is_some() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let _ = child.lock().unwrap().kill();
        panic!("registered process group did not exit");
    }

    #[cfg(unix)]
    fn registered_child(
        host: &AgentHostDesktopState,
        root: &Path,
        run_id: &str,
        node_id: &str,
    ) -> Arc<Mutex<std::process::Child>> {
        host.processes.lock().unwrap()[&process_key(root, run_id, node_id)]
            .child
            .clone()
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn native_process_custody_is_lease_bound_and_idempotent() {
        let directory = tempfile::tempdir().unwrap();
        let host = AgentHostDesktopState::default();
        let grant = LeaseGrant {
            owner: "host".into(),
            lease_id: "lease-1".into(),
            attempt: 1,
            expires_at: 20,
        };
        let child = spawn_process_group();
        register_process_group(&host, directory.path(), "run", "node", &grant, child).unwrap();
        let child = registered_child(&host, directory.path(), "run", "node");
        cancel_registered_node(&host, directory.path(), "run", "node")
            .await
            .unwrap();
        cancel_registered_node(&host, directory.path(), "run", "node")
            .await
            .unwrap();
        wait_for_exit(&child).await;
        assert!(host.processes.lock().unwrap().is_empty());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn stale_registration_never_signals_a_reused_process_group_id() {
        let directory = tempfile::tempdir().unwrap();
        let host = AgentHostDesktopState::default();
        let grant = LeaseGrant {
            owner: "host".into(),
            lease_id: "lease-1".into(),
            attempt: 1,
            expires_at: 20,
        };
        register_process_group(
            &host,
            directory.path(),
            "run",
            "node",
            &grant,
            spawn_process_group(),
        )
        .unwrap();
        let original = registered_child(&host, directory.path(), "run", "node");
        {
            let mut original = original.lock().unwrap();
            original.kill().unwrap();
            original.wait().unwrap();
        }
        let mut unrelated = spawn_process_group();
        host.processes
            .lock()
            .unwrap()
            .get_mut(&process_key(directory.path(), "run", "node"))
            .unwrap()
            .process_group_id = unrelated.id() as i32;

        cancel_registered_node(&host, directory.path(), "run", "node")
            .await
            .unwrap();
        assert!(unrelated.try_wait().unwrap().is_none());
        unsafe {
            libc::kill(-(unrelated.id() as i32), libc::SIGKILL);
        }
        unrelated.wait().unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn expired_lease_and_shutdown_cleanup_terminate_registered_groups() {
        let directory = tempfile::tempdir().unwrap();
        let host = AgentHostDesktopState::default();
        let grant = LeaseGrant {
            owner: "host".into(),
            lease_id: "lease-1".into(),
            attempt: 1,
            expires_at: 20,
        };
        let expired_child = spawn_process_group();
        register_process_group(
            &host,
            directory.path(),
            "run",
            "node",
            &grant,
            expired_child,
        )
        .unwrap();
        let expired_child = registered_child(&host, directory.path(), "run", "node");
        let state = state_with_node(running_node(20, 1));
        cancel_expired_processes(&host, directory.path(), &state, 20)
            .await
            .unwrap();
        wait_for_exit(&expired_child).await;

        let shutdown_child = spawn_process_group();
        register_process_group(
            &host,
            directory.path(),
            "shutdown",
            "node",
            &grant,
            shutdown_child,
        )
        .unwrap();
        let shutdown_child = registered_child(&host, directory.path(), "shutdown", "node");
        cancel_workspace_processes(&host, directory.path())
            .await
            .unwrap();
        wait_for_exit(&shutdown_child).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejected_expired_heartbeat_terminates_exact_lease_before_failure() {
        let directory = tempfile::tempdir().unwrap();
        let host = AgentHostDesktopState::default();
        let grant = LeaseGrant {
            owner: "host".into(),
            lease_id: "lease-1".into(),
            attempt: 1,
            expires_at: 20,
        };
        let child = spawn_process_group();
        register_process_group(&host, directory.path(), "run", "node", &grant, child).unwrap();
        let child = registered_child(&host, directory.path(), "run", "node");
        let mut state = state_with_node(running_node(20, 1));
        assert!(validate_grant(&state.runs["run"].nodes["node"], &grant, 20).is_err());
        cancel_registered_lease(&host, directory.path(), "run", "node", &grant.lease_id)
            .await
            .unwrap();
        assert!(expire_rejected_heartbeat(&mut state, "run", "node", &grant.lease_id, 20).unwrap());
        wait_for_exit(&child).await;
        assert_eq!(state.runs["run"].status, "failed");
        assert_eq!(state.runs["run"].nodes["node"].status, "failed");
        assert_eq!(
            state.runs["run"].nodes["node"].attempts[0]
                .error_code
                .as_deref(),
            Some("lease-expired")
        );
    }
}
