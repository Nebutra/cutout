//! Sanitized discovery of provider metadata from exact, supported host locations.
//! Secret values are inspected only for presence and never serialized to the WebView.

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

use super::agent_credentials;
use super::ai_proxy;
use super::keys;
use super::providers::{
    self, ProviderConfig, ProviderKind, ProviderWireProtocol, CC_SWITCH_BASE_URL,
};

const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_CC_SWITCH_DB_BYTES: u64 = 256 * 1024 * 1024;
const MAX_CC_SWITCH_CANDIDATES: usize = 32;
const MAX_DRAFTS: usize = 32;
const DRAFT_TTL: Duration = Duration::from_secs(10 * 60);
// A hint is honored only after the authenticated catalog confirms the exact
// model id. It prevents automatic imports from retaining the obsolete 5.5
// relay default while still failing closed on a relay without this revision.
const REVIEWED_RELAY_TEXT_MODEL_HINT: &str = "gpt-5.6-terra";
const CODEX_CC_SWITCH_PROVIDER_ID: &str = "ccswitch";
const CC_SWITCH_DB_LOCATION: &str = "~/.cc-switch/cc-switch.db";
const CC_SWITCH_DB_SCHEMA_ID: &str = "cc-switch-db-codex-failover-v1";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CcSwitchSettings {
    auth: CcSwitchAuth,
    config: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CcSwitchAuth {
    #[serde(rename = "OPENAI_API_KEY")]
    api_key: String,
}

struct CcSwitchProviderRecord {
    provider_id: String,
    base_url: String,
    model_hint: Option<String>,
    secret: String,
}

struct ProviderDraftSession {
    created_at: Instant,
    kind: String,
    base_url: String,
    wire_protocol: Option<ProviderWireProtocol>,
    candidate_id: Option<String>,
    provider_id: Option<String>,
    secret: Option<String>,
    candidate_fingerprint: Option<String>,
    candidate_secret_revision: Option<String>,
    checked_models: Option<Vec<String>>,
}

fn drafts() -> &'static Mutex<HashMap<String, ProviderDraftSession>> {
    static DRAFTS: OnceLock<Mutex<HashMap<String, ProviderDraftSession>>> = OnceLock::new();
    DRAFTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn purge_expired(store: &mut HashMap<String, ProviderDraftSession>) {
    store.retain(|_, draft| draft.created_at.elapsed() < DRAFT_TTL);
}

fn take_draft(draft_id: &str) -> Result<ProviderDraftSession, DiscoveryError> {
    let mut store = drafts()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    purge_expired(&mut store);
    store.remove(draft_id).ok_or(DiscoveryError::DraftExpired)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDraftInput {
    kind: String,
    base_url: String,
    wire_protocol: Option<ProviderWireProtocol>,
    candidate_id: Option<String>,
    provider_id: Option<String>,
    secret: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSummary {
    draft_id: String,
    expires_in_seconds: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDraftInput {
    draft_id: String,
    provider_id: String,
    label: String,
    default_model: String,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CredentialPreview {
    pub source_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
    pub available: bool,
    pub importable: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCandidate {
    pub id: String,
    pub source: String,
    pub source_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_location: Option<String>,
    pub kind: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wire_protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_hint: Option<String>,
    pub credential: CredentialPreview,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProbeResult {
    pub models: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoConfigureCandidateInput {
    candidate_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoConfiguredProvider {
    provider: ProviderConfig,
    models: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error("could not resolve home directory")]
    Home,
    #[error("provider config is a symbolic link: {0}")]
    Symlink(String),
    #[error("provider config is too large: {0}")]
    TooLarge(String),
    #[error("failed to read provider config: {0}")]
    Read(String),
    #[error("failed to parse provider config: {0}")]
    Parse(String),
    #[error("provider candidate is missing or no longer available")]
    CandidateMissing,
    #[error("provider candidate credential cannot be imported")]
    NotImportable,
    #[error("provider config uses an unsupported wire protocol: {0}")]
    UnsupportedWireProtocol(String),
    #[error("local credential import failed: {0}")]
    Keychain(String),
    #[error("provider endpoint returned HTTP {0}")]
    Http(u16),
    #[error("provider model catalog response is malformed")]
    CatalogMalformed,
    #[error("provider does not expose a model catalog")]
    CatalogUnsupported,
    #[error("provider request failed: {0}")]
    Request(String),
    #[error("provider draft expired or does not exist")]
    DraftExpired,
    #[error("provider draft capacity reached")]
    DraftCapacity,
    #[error("provider draft credential source is ambiguous")]
    DraftAmbiguous,
    #[error("provider already exists")]
    Conflict,
    #[error("provider persistence failed: {0}")]
    Persistence(String),
}

impl Serialize for DiscoveryError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let code = match self {
            Self::Home | Self::Read(_) | Self::Parse(_) => "config-invalid",
            Self::Symlink(_) | Self::TooLarge(_) => "config-rejected",
            Self::UnsupportedWireProtocol(_) => "wire-protocol-unsupported",
            Self::CandidateMissing | Self::NotImportable => "credential-missing",
            Self::Keychain(_) => "credential-unavailable",
            Self::Http(401 | 403) => "unauthorized",
            Self::Http(_) | Self::Request(_) => "endpoint-unreachable",
            Self::CatalogMalformed => "catalog-malformed",
            Self::CatalogUnsupported => "catalog-unsupported",
            Self::DraftExpired => "draft-expired",
            Self::DraftCapacity => "draft-capacity",
            Self::DraftAmbiguous => "draft-invalid",
            Self::Conflict => "conflict",
            Self::Persistence(_) => "persistence-failed",
        };
        let message = match self {
            Self::Request(_) => "provider request failed".to_owned(),
            _ => self.to_string(),
        };
        let mut state = serializer.serialize_struct("ProviderDiscoveryError", 2)?;
        state.serialize_field("code", code)?;
        state.serialize_field("message", &message)?;
        state.end()
    }
}

pub(super) fn candidate_id(parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part.as_bytes());
        digest.update([0]);
    }
    format!("provider-candidate:{:x}", digest.finalize())
}

#[cfg(windows)]
fn supported_windows_prefix(component: std::path::Component<'_>) -> bool {
    use std::path::{Component, Prefix};

    match component {
        Component::Prefix(prefix) => matches!(
            prefix.kind(),
            Prefix::Disk(_)
                | Prefix::UNC(_, _)
                | Prefix::VerbatimDisk(_)
                | Prefix::VerbatimUNC(_, _)
        ),
        _ => true,
    }
}

fn metadata_is_link_or_reparse(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

fn exact_path_metadata(path: &Path) -> Result<Option<std::fs::Metadata>, DiscoveryError> {
    if !path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                std::path::Component::CurDir | std::path::Component::ParentDir
            )
        })
    {
        return Err(DiscoveryError::Read("invalid exact config path".into()));
    }
    let label = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("config");
    let mut cursor = PathBuf::new();
    let mut latest = None;
    for component in path.components() {
        #[cfg(windows)]
        if !supported_windows_prefix(component) {
            return Err(DiscoveryError::Read("invalid exact config path".into()));
        }
        cursor.push(component.as_os_str());
        #[cfg(windows)]
        if matches!(component, std::path::Component::Prefix(_)) {
            continue;
        }
        match std::fs::symlink_metadata(&cursor) {
            Ok(metadata) if metadata_is_link_or_reparse(&metadata) => {
                return Err(DiscoveryError::Symlink(label.into()))
            }
            Ok(metadata) => latest = Some(metadata),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err(DiscoveryError::Read(
                    "permission denied while reading config".into(),
                ))
            }
            Err(_) => return Err(DiscoveryError::Read("failed to inspect config".into())),
        }
    }
    Ok(latest)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FileIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(windows)]
    volume: u64,
    #[cfg(windows)]
    index: u64,
    #[cfg(not(any(unix, windows)))]
    length: u64,
    #[cfg(not(any(unix, windows)))]
    modified: Option<std::time::SystemTime>,
}

#[cfg(unix)]
fn file_identity(file: &std::fs::File) -> Result<FileIdentity, DiscoveryError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file
        .metadata()
        .map_err(|_| DiscoveryError::Read("failed to inspect opened config".into()))?;
    Ok(FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn windows_file_information(file: &std::fs::File) -> Result<(FileIdentity, u32), DiscoveryError> {
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let mut information = MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    // SAFETY: `file` owns a valid handle and the output pointer refers to
    // writable storage for the documented Windows structure.
    let succeeded =
        unsafe { GetFileInformationByHandle(file.as_raw_handle() as _, information.as_mut_ptr()) };
    if succeeded == 0 {
        return Err(DiscoveryError::Read(
            "failed to inspect opened config".into(),
        ));
    }
    // SAFETY: GetFileInformationByHandle initialized the structure on success.
    let information = unsafe { information.assume_init() };
    Ok((
        FileIdentity {
            volume: u64::from(information.dwVolumeSerialNumber),
            index: (u64::from(information.nFileIndexHigh) << 32)
                | u64::from(information.nFileIndexLow),
        },
        information.dwFileAttributes,
    ))
}

#[cfg(windows)]
fn file_identity(file: &std::fs::File) -> Result<FileIdentity, DiscoveryError> {
    Ok(windows_file_information(file)?.0)
}

#[cfg(not(any(unix, windows)))]
fn file_identity(file: &std::fs::File) -> Result<FileIdentity, DiscoveryError> {
    let metadata = file
        .metadata()
        .map_err(|_| DiscoveryError::Read("failed to inspect opened config".into()))?;
    Ok(FileIdentity {
        length: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

fn open_exact_config(path: &Path) -> Result<std::fs::File, DiscoveryError> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let file = options
        .open(path)
        .map_err(|_| DiscoveryError::Read("failed to open config".into()))?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        if windows_file_information(&file)?.1 & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            let label = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("config");
            return Err(DiscoveryError::Symlink(label.into()));
        }
    }
    Ok(file)
}

fn exact_path_file_identity(path: &Path) -> Result<Option<FileIdentity>, DiscoveryError> {
    let Some(metadata) = exact_path_metadata(path)? else {
        return Ok(None);
    };
    if !metadata.is_file() {
        return Err(DiscoveryError::Read("config is not a regular file".into()));
    }
    open_exact_config(path).and_then(|file| file_identity(&file).map(Some))
}

pub(super) fn exact_regular_file_present(path: &Path) -> Result<bool, DiscoveryError> {
    let Some(metadata) = exact_path_metadata(path)? else {
        return Ok(false);
    };
    if !metadata.is_file() {
        return Err(DiscoveryError::Read("config is not a regular file".into()));
    }
    Ok(true)
}

pub(super) fn read_exact_config(path: &Path) -> Result<Option<String>, DiscoveryError> {
    let Some(before) = exact_path_metadata(path)? else {
        return Ok(None);
    };
    let label = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("config");
    if !before.is_file() {
        return Err(DiscoveryError::Read("config is not a regular file".into()));
    }
    if before.len() > MAX_CONFIG_BYTES {
        return Err(DiscoveryError::TooLarge(label.into()));
    }
    let mut file = open_exact_config(path)?;
    let opened = file
        .metadata()
        .map_err(|_| DiscoveryError::Read("failed to inspect opened config".into()))?;
    let opened_identity = file_identity(&file)?;
    if !opened.is_file() || exact_path_file_identity(path)? != Some(opened_identity) {
        return Err(DiscoveryError::Read(
            "config identity changed before read".into(),
        ));
    }
    let mut bytes = Vec::with_capacity((opened.len() as usize).min(MAX_CONFIG_BYTES as usize));
    file.by_ref()
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| DiscoveryError::Read("failed to read config".into()))?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(DiscoveryError::TooLarge(label.into()));
    }
    if exact_path_file_identity(path)? != Some(opened_identity) {
        return Err(DiscoveryError::Read(
            "config identity changed during read".into(),
        ));
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| DiscoveryError::Parse("config is not valid UTF-8".into()))
}

fn normalize_wire(value: Option<&str>) -> Result<Option<String>, DiscoveryError> {
    match value {
        Some("responses") => Ok(Some("responses".into())),
        Some("chat") | Some("chat-completions") => Ok(Some("chat-completions".into())),
        Some(other) => Err(DiscoveryError::UnsupportedWireProtocol(other.into())),
        None => Ok(None),
    }
}

fn normalized_draft_wire_protocol(
    kind: ProviderKind,
    wire_protocol: Option<ProviderWireProtocol>,
) -> Result<Option<ProviderWireProtocol>, DiscoveryError> {
    kind.effective_wire_protocol(wire_protocol)
        .map_err(DiscoveryError::UnsupportedWireProtocol)
}

fn codex_location_from(home: &Path, configured_home: Option<PathBuf>) -> (PathBuf, &'static str) {
    match configured_home {
        Some(path) => (path, "$CODEX_HOME"),
        None => (home.join(".codex"), "~/.codex"),
    }
}

fn codex_location(home: &Path) -> (PathBuf, &'static str) {
    codex_location_from(home, std::env::var_os("CODEX_HOME").map(PathBuf::from))
}

fn codex_api_key_from(path: &Path) -> Result<Option<String>, DiscoveryError> {
    let Some(raw) = read_exact_config(path)? else {
        return Ok(None);
    };
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| DiscoveryError::Parse("Codex auth: invalid JSON".into()))?;
    Ok(value
        .get("OPENAI_API_KEY")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned))
}

fn discover_codex_at(
    codex_home: &Path,
    display_root: &str,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let config_location = format!("{display_root}/config.toml");
    let auth_location = format!("{display_root}/auth.json");
    let auth_key = codex_api_key_from(&codex_home.join("auth.json"))?;
    let config = match read_exact_config(&codex_home.join("config.toml"))? {
        Some(raw) => Some(
            toml::from_str::<toml::Value>(&raw)
                .map_err(|_| DiscoveryError::Parse("Codex config: invalid TOML".into()))?,
        ),
        None => None,
    };
    let auth_key_available = auth_key.is_some();
    let model_hint = config
        .as_ref()
        .and_then(|value| value.get("model"))
        .and_then(toml::Value::as_str)
        .map(str::to_owned);
    let selected = config
        .as_ref()
        .and_then(|value| value.get("model_provider"))
        .and_then(toml::Value::as_str);
    let table = config
        .as_ref()
        .and_then(|value| value.get("model_providers"))
        .and_then(toml::Value::as_table);
    let mut out = Vec::new();
    let root = config.as_ref().and_then(toml::Value::as_table);
    let root_base_url = root
        .and_then(|value| value.get("base_url"))
        .and_then(toml::Value::as_str);
    let root_has_provider_binding = root_base_url.is_some();
    let root_cc_switch = root.is_some_and(|value| {
        root_base_url == Some(CC_SWITCH_BASE_URL)
            && value.get("wire_api").and_then(toml::Value::as_str) == Some("responses")
            && !value.contains_key("model_provider")
            && !value.contains_key("model_providers")
    });
    let mut has_openai_provider = root_has_provider_binding;
    if root_cc_switch && auth_key_available {
        has_openai_provider = true;
        out.push(ProviderCandidate {
            id: candidate_id(&["codex", "cc-switch-root", CC_SWITCH_BASE_URL]),
            source: "codex".into(),
            source_label: "Codex".into(),
            agent_id: Some("codex".into()),
            schema_id: Some("codex-root-cc-switch-v1".into()),
            config_location: Some(auth_location.clone()),
            kind: "cc-switch".into(),
            label: "CC Switch".into(),
            base_url: Some(CC_SWITCH_BASE_URL.into()),
            wire_protocol: Some("responses".into()),
            model_hint: model_hint.clone(),
            credential: CredentialPreview {
                source_type: "config-literal".into(),
                reference: Some("OPENAI_API_KEY".into()),
                available: true,
                importable: true,
            },
            warnings: vec![],
        });
    }
    if let Some(table) = table {
        for (provider_id, entry) in table {
            let Some(provider) = entry.as_table() else {
                continue;
            };
            let is_openai = provider_id == "openai";
            let is_cc_switch = provider_id == CODEX_CC_SWITCH_PROVIDER_ID
                && provider.get("base_url").and_then(toml::Value::as_str)
                    == Some(CC_SWITCH_BASE_URL);
            // A reviewed CC Switch profile owns the Codex auth-file credential.
            // Do not also project that same secret as a public OpenAI candidate.
            has_openai_provider |= is_openai || is_cc_switch;
            let env_key = provider.get("env_key").and_then(toml::Value::as_str);
            let env_available = env_key.and_then(std::env::var_os).is_some();
            let use_auth_file = (is_openai || is_cc_switch) && auth_key_available && !env_available;
            let base_url = provider
                .get("base_url")
                .and_then(toml::Value::as_str)
                .map(str::to_owned);
            let wire_protocol = normalize_wire(
                provider.get("wire_api").and_then(toml::Value::as_str),
            )?
            .or_else(|| {
                Some(
                    if is_openai || is_cc_switch {
                        "responses"
                    } else {
                        "chat-completions"
                    }
                    .into(),
                )
            });
            let mut warnings = Vec::new();
            if provider.contains_key("experimental_bearer_token") || provider.contains_key("auth") {
                warnings.push("Command-backed or session authentication is not importable.".into());
            }
            let label = provider
                .get("name")
                .and_then(toml::Value::as_str)
                .unwrap_or(provider_id);
            out.push(ProviderCandidate {
                id: candidate_id(&["codex", provider_id, base_url.as_deref().unwrap_or("")]),
                source: "codex".into(),
                source_label: "Codex".into(),
                agent_id: Some("codex".into()),
                schema_id: Some("codex-config-v1".into()),
                config_location: Some(if use_auth_file {
                    auth_location.clone()
                } else {
                    config_location.clone()
                }),
                kind: if is_openai {
                    "openai".into()
                } else if is_cc_switch {
                    "cc-switch".into()
                } else {
                    "openai-compatible".into()
                },
                label: label.into(),
                base_url,
                wire_protocol,
                model_hint: if selected == Some(provider_id.as_str()) {
                    model_hint.clone()
                } else {
                    None
                },
                credential: CredentialPreview {
                    source_type: if env_available {
                        "environment"
                    } else if use_auth_file {
                        "config-literal"
                    } else {
                        "none"
                    }
                    .into(),
                    reference: if use_auth_file {
                        Some("OPENAI_API_KEY".into())
                    } else {
                        env_key.map(str::to_owned)
                    },
                    available: env_available || use_auth_file,
                    importable: env_available || use_auth_file,
                },
                warnings,
            });
        }
    }
    if auth_key_available && !has_openai_provider {
        out.push(ProviderCandidate {
            id: candidate_id(&["codex", "openai", "https://api.openai.com/v1"]),
            source: "codex".into(),
            source_label: "Codex".into(),
            agent_id: Some("codex".into()),
            schema_id: Some("codex-auth-v1".into()),
            config_location: Some(auth_location),
            kind: "openai".into(),
            label: "OpenAI".into(),
            base_url: Some("https://api.openai.com/v1".into()),
            wire_protocol: Some("responses".into()),
            model_hint,
            credential: CredentialPreview {
                source_type: "config-literal".into(),
                reference: Some("OPENAI_API_KEY".into()),
                available: true,
                importable: true,
            },
            warnings: vec![],
        });
    }
    Ok(out)
}

fn discover_codex(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let (codex_home, display_root) = codex_location(home);
    discover_codex_at(&codex_home, display_root)
}

fn cc_switch_db_error() -> DiscoveryError {
    DiscoveryError::Read("CC Switch database is unavailable".into())
}

fn validate_cc_switch_provider_schema(
    connection: &rusqlite::Connection,
) -> Result<(), DiscoveryError> {
    let mut statement = connection
        .prepare("SELECT name, type, \"notnull\", pk FROM pragma_table_info('providers')")
        .map_err(|_| cc_switch_db_error())?;
    let columns = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ),
            ))
        })
        .map_err(|_| cc_switch_db_error())?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(|_| cc_switch_db_error())?;
    for (name, expected_type, expected_not_null, expected_primary_key) in [
        ("id", "TEXT", 1, 1),
        ("app_type", "TEXT", 1, 2),
        ("settings_config", "TEXT", 1, 0),
        ("is_current", "BOOLEAN", 1, 0),
        ("in_failover_queue", "BOOLEAN", 1, 0),
        ("sort_index", "INTEGER", 0, 0),
    ] {
        let Some((actual_type, actual_not_null, actual_primary_key)) = columns.get(name) else {
            return Err(DiscoveryError::Parse(
                "CC Switch database schema is unsupported".into(),
            ));
        };
        if !actual_type.eq_ignore_ascii_case(expected_type)
            || *actual_not_null != expected_not_null
            || *actual_primary_key != expected_primary_key
        {
            return Err(DiscoveryError::Parse(
                "CC Switch database schema is unsupported".into(),
            ));
        }
    }
    Ok(())
}

fn normalize_cc_switch_upstream_base_url(value: &str) -> Result<String, DiscoveryError> {
    let mut parsed = reqwest::Url::parse(value)
        .map_err(|_| DiscoveryError::Parse("CC Switch upstream endpoint is invalid".into()))?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(DiscoveryError::Parse(
            "CC Switch upstream endpoint is not importable".into(),
        ));
    }
    if matches!(parsed.path(), "" | "/") {
        parsed.set_path("/v1");
    } else {
        let normalized_path = parsed.path().trim_end_matches('/').to_owned();
        parsed.set_path(&normalized_path);
    }
    let normalized = parsed.to_string();
    ai_proxy::enforce_host("openai-compatible", &normalized).map_err(|_| {
        DiscoveryError::Parse("CC Switch upstream endpoint is not importable".into())
    })?;
    Ok(normalized)
}

fn parse_cc_switch_settings(raw: &str) -> Result<(String, Option<String>, String), DiscoveryError> {
    if raw.len() > MAX_CONFIG_BYTES as usize {
        return Err(DiscoveryError::TooLarge(
            "CC Switch provider settings".into(),
        ));
    }
    let settings: CcSwitchSettings = serde_json::from_str(raw)
        .map_err(|_| DiscoveryError::Parse("CC Switch provider settings are invalid".into()))?;
    if settings.auth.api_key.is_empty()
        || settings.auth.api_key.len() > 16 * 1024
        || settings.auth.api_key.chars().any(char::is_whitespace)
        || settings.auth.api_key.chars().any(char::is_control)
    {
        return Err(DiscoveryError::NotImportable);
    }
    let config: toml::Value = toml::from_str(&settings.config)
        .map_err(|_| DiscoveryError::Parse("CC Switch Codex config is invalid".into()))?;
    let table = config
        .as_table()
        .ok_or_else(|| DiscoveryError::Parse("CC Switch Codex config is invalid".into()))?;
    if table.contains_key("model_provider") || table.contains_key("model_providers") {
        return Err(DiscoveryError::Parse(
            "CC Switch Codex config has an ambiguous upstream".into(),
        ));
    }
    let base_url = table
        .get("base_url")
        .and_then(toml::Value::as_str)
        .ok_or_else(|| DiscoveryError::Parse("CC Switch upstream endpoint is missing".into()))?;
    if table.get("wire_api").and_then(toml::Value::as_str) != Some("responses") {
        return Err(DiscoveryError::UnsupportedWireProtocol(
            "CC Switch upstream must use Responses".into(),
        ));
    }
    let model_hint = match table.get("model") {
        Some(value) => {
            let model = value.as_str().ok_or_else(|| {
                DiscoveryError::Parse("CC Switch selected model is invalid".into())
            })?;
            validate_sanitized_text(model, 160)?;
            Some(model.to_owned())
        }
        None => None,
    };
    Ok((
        normalize_cc_switch_upstream_base_url(base_url)?,
        model_hint,
        settings.auth.api_key,
    ))
}

fn cc_switch_provider_records_at(
    database_path: &Path,
) -> Result<Vec<CcSwitchProviderRecord>, DiscoveryError> {
    fn database_identity(path: &Path) -> Result<Option<FileIdentity>, DiscoveryError> {
        let Some(metadata) = exact_path_metadata(path)? else {
            return Ok(None);
        };
        if !metadata.is_file() {
            return Err(DiscoveryError::Read(
                "CC Switch database is not a regular file".into(),
            ));
        }
        if metadata.len() > MAX_CC_SWITCH_DB_BYTES {
            return Err(DiscoveryError::TooLarge("CC Switch database".into()));
        }
        exact_path_file_identity(path)
    }

    let Some(before_identity) = database_identity(database_path)? else {
        return Ok(Vec::new());
    };
    let result = (|| {
        let connection = rusqlite::Connection::open_with_flags(
            database_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|_| cc_switch_db_error())?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(|_| cc_switch_db_error())?;
        connection
            .pragma_update(None, "query_only", "ON")
            .map_err(|_| cc_switch_db_error())?;
        validate_cc_switch_provider_schema(&connection)?;

        let mut statement = connection
            .prepare(
                "SELECT id, length(CAST(settings_config AS BLOB)), \
                        CASE WHEN length(CAST(settings_config AS BLOB)) <= ?1 THEN settings_config END, \
                        is_current, in_failover_queue, sort_index \
                 FROM providers \
                 WHERE app_type = 'codex' \
                   AND (is_current = 1 OR in_failover_queue = 1) \
                 ORDER BY is_current DESC, COALESCE(sort_index, 999999), id ASC \
                 LIMIT ?2",
            )
            .map_err(|_| cc_switch_db_error())?;
        let mut rows = statement
            .query(rusqlite::params![
                MAX_CONFIG_BYTES as i64,
                (MAX_CC_SWITCH_CANDIDATES + 1) as i64
            ])
            .map_err(|_| cc_switch_db_error())?;
        let mut selected = Vec::new();
        let mut current_count = 0;
        while let Some(row) = rows.next().map_err(|_| cc_switch_db_error())? {
            let provider_id: String = row.get(0).map_err(|_| cc_switch_db_error())?;
            let settings_length: i64 = row.get(1).map_err(|_| cc_switch_db_error())?;
            if settings_length < 0 || settings_length as u64 > MAX_CONFIG_BYTES {
                return Err(DiscoveryError::TooLarge(
                    "CC Switch provider settings".into(),
                ));
            }
            let settings: Option<String> = row.get(2).map_err(|_| cc_switch_db_error())?;
            let is_current: i64 = row.get(3).map_err(|_| cc_switch_db_error())?;
            let in_failover_queue: i64 = row.get(4).map_err(|_| cc_switch_db_error())?;
            let sort_index: Option<i64> = row.get(5).map_err(|_| cc_switch_db_error())?;
            if !matches!(is_current, 0 | 1)
                || !matches!(in_failover_queue, 0 | 1)
                || sort_index.is_some_and(|value| value < 0)
            {
                return Err(DiscoveryError::Parse(
                    "CC Switch provider ordering is invalid".into(),
                ));
            }
            current_count += usize::from(is_current == 1);
            selected.push((
                provider_id,
                settings.ok_or_else(|| {
                    DiscoveryError::TooLarge("CC Switch provider settings".into())
                })?,
            ));
        }
        if selected.len() > MAX_CC_SWITCH_CANDIDATES {
            return Err(DiscoveryError::Parse(
                "CC Switch Codex provider queue is too large".into(),
            ));
        }
        if current_count > 1 {
            return Err(DiscoveryError::Parse(
                "CC Switch has multiple current Codex providers".into(),
            ));
        }
        Ok(selected)
    })();
    if database_identity(database_path)? != Some(before_identity) {
        return Err(DiscoveryError::Read(
            "CC Switch database identity changed during read".into(),
        ));
    };
    result?
        .into_iter()
        .map(|(provider_id, settings)| {
            if provider_id.is_empty()
                || provider_id.len() > 160
                || provider_id.chars().any(char::is_control)
            {
                return Err(DiscoveryError::Parse(
                    "CC Switch provider identity is invalid".into(),
                ));
            }
            let (base_url, model_hint, secret) = parse_cc_switch_settings(&settings)?;
            Ok(CcSwitchProviderRecord {
                provider_id,
                base_url,
                model_hint,
                secret,
            })
        })
        .collect()
}

fn cc_switch_candidate(record: &CcSwitchProviderRecord) -> ProviderCandidate {
    ProviderCandidate {
        id: candidate_id(&[
            "cc-switch-db",
            &record.provider_id,
            record.base_url.as_str(),
        ]),
        source: "cc-switch".into(),
        source_label: "CC Switch".into(),
        agent_id: Some("codex".into()),
        schema_id: Some(CC_SWITCH_DB_SCHEMA_ID.into()),
        config_location: Some(CC_SWITCH_DB_LOCATION.into()),
        kind: "openai-compatible".into(),
        label: "CC Switch Codex upstream".into(),
        base_url: Some(record.base_url.clone()),
        wire_protocol: Some("responses".into()),
        model_hint: record.model_hint.clone(),
        credential: CredentialPreview {
            source_type: "cc-switch-db".into(),
            reference: Some("OPENAI_API_KEY".into()),
            available: true,
            importable: true,
        },
        warnings: vec![],
    }
}

fn discover_cc_switch(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    Ok(
        cc_switch_provider_records_at(&home.join(".cc-switch/cc-switch.db"))?
            .iter()
            .map(cc_switch_candidate)
            .collect(),
    )
}

fn discover_claude(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let (root, display_root) = match std::env::var_os("CLAUDE_CONFIG_DIR") {
        Some(value) => {
            let root = PathBuf::from(value);
            if !root.is_absolute() {
                return Err(DiscoveryError::Read(
                    "invalid CLAUDE_CONFIG_DIR root".into(),
                ));
            }
            (root, "$CLAUDE_CONFIG_DIR")
        }
        None => (home.join(".claude"), "~/.claude"),
    };
    let path = root.join("settings.json");
    let value: serde_json::Value = match read_exact_config(&path)? {
        Some(raw) => serde_json::from_str(&raw)
            .map_err(|_| DiscoveryError::Parse("Claude settings: invalid JSON".into()))?,
        None => serde_json::json!({}),
    };
    let env = value.get("env").and_then(serde_json::Value::as_object);
    let base_url = env
        .and_then(|v| v.get("ANTHROPIC_BASE_URL"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let api_key = env
        .and_then(|v| v.get("ANTHROPIC_API_KEY"))
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty());
    let auth_token = env
        .and_then(|v| v.get("ANTHROPIC_AUTH_TOKEN"))
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty());
    let helper_present = value.get("apiKeyHelper").is_some();
    let credentials_present = exact_regular_file_present(&root.join(".credentials.json"))?;
    let (source_type, reference, available, importable, warnings) = if api_key.is_some() {
        (
            "config-literal",
            Some("ANTHROPIC_API_KEY".into()),
            true,
            true,
            vec![],
        )
    } else if auth_token.is_some() {
        (
            "config-literal",
            Some("ANTHROPIC_AUTH_TOKEN".into()),
            true,
            false,
            vec!["Bearer tokens are detected but are not imported as API keys.".into()],
        )
    } else {
        let available = std::env::var_os("ANTHROPIC_API_KEY").is_some();
        (
            if available { "environment" } else { "none" },
            Some("ANTHROPIC_API_KEY".into()),
            available,
            available,
            vec![],
        )
    };
    let mut rows = Vec::new();
    if base_url.is_some() || api_key.is_some() || auth_token.is_some() || available {
        rows.push(ProviderCandidate {
            id: candidate_id(&["claude", base_url.as_deref().unwrap_or("")]),
            source: "claude".into(),
            source_label: "Claude Code".into(),
            agent_id: Some("claude-code".into()),
            schema_id: Some("claude-settings-v1".into()),
            config_location: Some(format!("{display_root}/settings.json")),
            kind: "anthropic".into(),
            label: "Claude Code Anthropic".into(),
            base_url: base_url.clone(),
            wire_protocol: Some("anthropic-messages".into()),
            model_hint: value
                .get("model")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned),
            credential: CredentialPreview {
                source_type: source_type.into(),
                reference,
                available,
                importable,
            },
            warnings,
        });
    }
    let binding_base = base_url
        .clone()
        .unwrap_or_else(|| "https://api.anthropic.com/v1".into());
    if helper_present {
        rows.push(ProviderCandidate {
            id: candidate_id(&["claude", "helper", &binding_base]),
            source: "claude".into(),
            source_label: "Claude Code".into(),
            agent_id: Some("claude-code".into()),
            schema_id: Some("claude-helper-presence-v1".into()),
            config_location: Some(format!("{display_root}/settings.json")),
            kind: "anthropic".into(),
            label: "Claude Code Anthropic".into(),
            base_url: base_url.clone(),
            wire_protocol: Some("anthropic-messages".into()),
            model_hint: None,
            credential: CredentialPreview {
                source_type: "helper".into(),
                reference: Some("API key helper".into()),
                available: true,
                importable: false,
            },
            warnings: vec!["Command-backed credentials are never executed or imported.".into()],
        });
    }
    if credentials_present {
        rows.push(ProviderCandidate {
            id: candidate_id(&["claude", "oauth-session", &binding_base]),
            source: "claude".into(),
            source_label: "Claude Code".into(),
            agent_id: Some("claude-code".into()),
            schema_id: Some("claude-oauth-presence-v1".into()),
            config_location: Some(format!("{display_root}/.credentials.json")),
            kind: "anthropic".into(),
            label: "Claude Code Anthropic".into(),
            base_url: base_url.clone(),
            wire_protocol: Some("anthropic-messages".into()),
            model_hint: None,
            credential: CredentialPreview {
                source_type: "session".into(),
                reference: Some("OAuth session".into()),
                available: true,
                importable: false,
            },
            warnings: vec![
                "OAuth sessions are display-only and cannot be imported as API keys.".into(),
            ],
        });
    }
    Ok(rows)
}

fn discover_environment_with(
    read_environment: impl Fn(&str) -> Option<std::ffi::OsString>,
) -> Vec<ProviderCandidate> {
    let definitions = [
        (
            "OPENAI_API_KEY",
            "openai",
            "OpenAI",
            Some("https://api.openai.com/v1"),
            Some("responses"),
        ),
        (
            "ANTHROPIC_API_KEY",
            "anthropic",
            "Anthropic",
            Some("https://api.anthropic.com/v1"),
            Some("anthropic-messages"),
        ),
        (
            "GOOGLE_GENERATIVE_AI_API_KEY",
            "google",
            "Google AI",
            Some("https://generativelanguage.googleapis.com/v1beta"),
            Some("google-generate-content"),
        ),
    ];
    let mut candidates: Vec<_> = definitions
        .into_iter()
        .filter_map(|(env, kind, label, base, wire)| {
            read_environment(env).map(|_| ProviderCandidate {
                id: candidate_id(&["environment", env]),
                source: "environment".into(),
                source_label: "Process environment".into(),
                agent_id: None,
                schema_id: None,
                config_location: None,
                kind: kind.into(),
                label: label.into(),
                base_url: base.map(str::to_owned),
                wire_protocol: wire.map(str::to_owned),
                model_hint: None,
                credential: CredentialPreview {
                    source_type: "environment".into(),
                    reference: Some(env.into()),
                    available: true,
                    importable: true,
                },
                warnings: vec![],
            })
        })
        .collect();

    for (env, base_env, label, expected_base, model_hint) in [
        (
            "MOX_API_KEY",
            "MOX_BASE_URL",
            "MOX",
            "https://aigw.mox.ktvsky.com/v1",
            REVIEWED_RELAY_TEXT_MODEL_HINT,
        ),
        (
            "TDS_API_KEY",
            "TDS_BASE_URL",
            "TDS Router",
            "https://router.tds.cc.cd/v1",
            REVIEWED_RELAY_TEXT_MODEL_HINT,
        ),
    ] {
        if read_environment(env).is_none() {
            checkpoint_reviewed_environment_relay(env, "key-missing");
            continue;
        }
        checkpoint_reviewed_environment_relay(env, "key-present");
        let supplied_base = read_environment(base_env)
            .and_then(|value| value.into_string().ok())
            .unwrap_or_else(|| expected_base.to_owned());
        let normalized_base = normalize_protocol_base_url(
            &supplied_base,
            Some(ProviderWireProtocol::ChatCompletions),
        );
        if normalized_base.ok().as_deref() != Some(expected_base) {
            checkpoint_reviewed_environment_relay(env, "base-rejected");
            continue;
        }
        checkpoint_reviewed_environment_relay(env, "candidate-created");
        candidates.push(ProviderCandidate {
            id: candidate_id(&["environment", env, expected_base]),
            source: "environment".into(),
            source_label: "Process environment".into(),
            agent_id: None,
            schema_id: None,
            config_location: None,
            kind: "openai-compatible".into(),
            label: label.into(),
            base_url: Some(expected_base.into()),
            wire_protocol: Some("chat-completions".into()),
            model_hint: Some(model_hint.into()),
            credential: CredentialPreview {
                source_type: "environment".into(),
                reference: Some(env.into()),
                available: true,
                importable: true,
            },
            warnings: vec![],
        });
    }
    candidates
}

fn discover_environment() -> Vec<ProviderCandidate> {
    discover_environment_with(|name| std::env::var_os(name))
}

fn reviewed_environment_relay_id(reference: &str) -> Option<&'static str> {
    match reference {
        "MOX_API_KEY" => Some("mox"),
        "TDS_API_KEY" => Some("tds"),
        _ => None,
    }
}

fn checkpoint_reviewed_environment_relay(reference: &str, outcome: &str) {
    let Some(relay) = reviewed_environment_relay_id(reference) else {
        return;
    };
    crate::commands::packaged_e2e::native_checkpoint(&format!(
        "ai-native-environment-{relay}-{outcome}"
    ));
}

fn candidate_reviewed_environment_relay(candidate: &ProviderCandidate) -> Option<&'static str> {
    if candidate.source != "environment" {
        return None;
    }
    reviewed_environment_relay_id(candidate.credential.reference.as_deref()?)
}

const PROVIDER_REGISTRY_FILE: &str = "providers.json";
const PACKAGED_E2E_PROVIDER_DISCOVERY_FILE: &str = "provider-discovery.json";

fn cutout_provider_metadata_paths(
    config_dir: &Path,
    include_packaged_e2e_discovery: bool,
) -> Vec<PathBuf> {
    let mut paths = vec![config_dir.join(PROVIDER_REGISTRY_FILE)];
    if include_packaged_e2e_discovery {
        paths.push(config_dir.join(PACKAGED_E2E_PROVIDER_DISCOVERY_FILE));
    }
    paths
}

#[derive(Default)]
struct CutoutProviderRows {
    rows: Vec<serde_json::Value>,
    readable_files: usize,
    invalid_files: usize,
}

fn cutout_provider_rows_at(
    config_dir: &Path,
    include_packaged_e2e_discovery: bool,
) -> CutoutProviderRows {
    let mut result = CutoutProviderRows::default();
    for path in cutout_provider_metadata_paths(config_dir, include_packaged_e2e_discovery) {
        match read_exact_config(&path) {
            Ok(Some(raw)) => {
                result.readable_files += 1;
                match serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                    Ok(rows) => result.rows.extend(rows),
                    Err(_) => result.invalid_files += 1,
                }
            }
            Ok(None) => {}
            Err(_) => result.invalid_files += 1,
        }
    }
    result
}

#[derive(Default)]
struct CutoutKeychainDiscovery {
    candidates: Vec<ProviderCandidate>,
    metadata_rows: usize,
    readable_files: usize,
    invalid_files: usize,
    keys_present: usize,
    keys_missing: usize,
    key_errors: usize,
}

fn discover_cutout_keychain_at(
    config_dir: &Path,
    include_packaged_e2e_discovery: bool,
    key_presence: impl Fn(&str) -> Result<bool, keys::KeyError>,
) -> CutoutKeychainDiscovery {
    let provider_rows = cutout_provider_rows_at(config_dir, include_packaged_e2e_discovery);
    let mut discovery = CutoutKeychainDiscovery {
        metadata_rows: provider_rows.rows.len(),
        readable_files: provider_rows.readable_files,
        invalid_files: provider_rows.invalid_files,
        ..CutoutKeychainDiscovery::default()
    };
    for row in provider_rows.rows {
        let Some(id) = row.get("id").and_then(serde_json::Value::as_str) else {
            continue;
        };
        match key_presence(id) {
            Ok(true) => discovery.keys_present += 1,
            Ok(false) => {
                discovery.keys_missing += 1;
                continue;
            }
            Err(_) => {
                discovery.key_errors += 1;
                continue;
            }
        }
        let candidate = (|| {
            Some(ProviderCandidate {
                id: candidate_id(&["cutout-keychain", id]),
                source: "cutout-keychain".into(),
                source_label: "Cutout local credentials".into(),
                agent_id: None,
                schema_id: None,
                config_location: None,
                kind: row.get("kind")?.as_str()?.into(),
                label: row.get("label")?.as_str()?.into(),
                base_url: row
                    .get("baseUrl")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned),
                wire_protocol: row
                    .get("wireProtocol")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned),
                model_hint: row
                    .get("defaultModel")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned),
                credential: CredentialPreview {
                    source_type: "keychain".into(),
                    reference: Some("Cutout local provider credential".into()),
                    available: true,
                    importable: true,
                },
                warnings: vec![],
            })
        })();
        if let Some(candidate) = candidate {
            discovery.candidates.push(candidate);
        }
    }
    discovery
}

fn discover_cutout_keychain<R: Runtime>(app: &AppHandle<R>) -> Vec<ProviderCandidate> {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return vec![];
    };
    let discovery = discover_cutout_keychain_at(
        &config_dir,
        crate::commands::packaged_e2e::enabled(),
        keys::key_presence_exact,
    );
    if discovery.readable_files > 0 {
        crate::commands::packaged_e2e::native_checkpoint("ai-native-cutout-registry-read");
    }
    if discovery.invalid_files > 0 {
        crate::commands::packaged_e2e::native_checkpoint("ai-native-cutout-registry-invalid");
    }
    if discovery.metadata_rows > 0 && discovery.keys_present > 0 {
        crate::commands::packaged_e2e::native_checkpoint("ai-native-cutout-keychain-key-present");
    }
    if discovery.keys_missing > 0 {
        crate::commands::packaged_e2e::native_checkpoint(
            "ai-native-cutout-keychain-some-key-missing",
        );
    }
    if discovery.key_errors > 0 {
        crate::commands::packaged_e2e::native_checkpoint("ai-native-cutout-keychain-key-error");
    }
    if !discovery.candidates.is_empty() {
        crate::commands::packaged_e2e::native_checkpoint(
            "ai-native-cutout-keychain-candidate-created",
        );
    }
    discovery.candidates
}

fn cutout_source_id_at(
    config_dir: &Path,
    selected_candidate_id: &str,
    include_packaged_e2e_discovery: bool,
) -> Result<String, DiscoveryError> {
    for path in cutout_provider_metadata_paths(config_dir, include_packaged_e2e_discovery) {
        let Some(raw) = read_exact_config(&path)? else {
            continue;
        };
        let rows: Vec<serde_json::Value> =
            serde_json::from_str(&raw).map_err(|error| DiscoveryError::Parse(error.to_string()))?;
        if let Some(id) = rows.into_iter().find_map(|row| {
            let id = row.get("id")?.as_str()?;
            (candidate_id(&["cutout-keychain", id]) == selected_candidate_id).then(|| id.to_owned())
        }) {
            return Ok(id);
        }
    }
    Err(DiscoveryError::CandidateMissing)
}

fn cutout_source_id<R: Runtime>(
    app: &AppHandle<R>,
    selected_candidate_id: &str,
) -> Result<String, DiscoveryError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| DiscoveryError::Read(error.to_string()))?;
    cutout_source_id_at(
        &config_dir,
        selected_candidate_id,
        crate::commands::packaged_e2e::enabled(),
    )
}

#[tauri::command]
pub async fn discover_provider_candidates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let home = app.path().home_dir().map_err(|_| DiscoveryError::Home)?;
    let mut candidates = Vec::new();
    let mut first_error = None;
    for result in [
        discover_cc_switch(&home),
        discover_codex(&home),
        discover_claude(&home),
        agent_credentials::discover(&home),
    ] {
        match result {
            Ok(rows) => candidates.extend(rows),
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    candidates.extend(discover_environment());
    candidates.extend(discover_cutout_keychain(&app));
    finalize_candidates(candidates, first_error)
}

fn finalize_candidates(
    mut candidates: Vec<ProviderCandidate>,
    mut first_error: Option<DiscoveryError>,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    candidates.retain(|candidate| match validate_candidate(candidate) {
        Ok(()) => true,
        Err(error) => {
            if candidate.source == "cutout-keychain" {
                crate::commands::packaged_e2e::native_checkpoint(
                    "ai-native-cutout-keychain-candidate-filtered",
                );
            }
            first_error.get_or_insert(error);
            false
        }
    });
    if candidates.is_empty() {
        if let Some(error) = first_error {
            return Err(error);
        }
    }
    let mut seen = HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.id.clone()));
    candidates.sort_by(|a, b| {
        (a.source.as_str(), a.label.as_str()).cmp(&(b.source.as_str(), b.label.as_str()))
    });
    Ok(candidates)
}

fn candidate_secret_at(
    candidate: &ProviderCandidate,
    home: &Path,
    codex_home: &Path,
) -> Result<String, DiscoveryError> {
    match (
        candidate.source.as_str(),
        candidate.credential.reference.as_deref(),
    ) {
        ("environment", Some(name)) => {
            std::env::var(name).map_err(|_| DiscoveryError::CandidateMissing)
        }
        ("codex", Some(name)) if candidate.credential.source_type == "environment" => {
            std::env::var(name).map_err(|_| DiscoveryError::CandidateMissing)
        }
        ("codex", Some("OPENAI_API_KEY"))
            if candidate.credential.source_type == "config-literal" =>
        {
            if !matches!(
                candidate.schema_id.as_deref(),
                Some("codex-auth-v1" | "codex-config-v1" | "codex-root-cc-switch-v1")
            ) {
                return Err(DiscoveryError::CandidateMissing);
            }
            codex_api_key_from(&codex_home.join("auth.json"))?
                .ok_or(DiscoveryError::CandidateMissing)
        }
        ("cc-switch", Some("OPENAI_API_KEY"))
            if candidate.credential.source_type == "cc-switch-db"
                && candidate.schema_id.as_deref() == Some(CC_SWITCH_DB_SCHEMA_ID) =>
        {
            let record = cc_switch_provider_records_at(&home.join(".cc-switch/cc-switch.db"))?
                .into_iter()
                .find(|record| cc_switch_candidate(record).id == candidate.id)
                .ok_or(DiscoveryError::CandidateMissing)?;
            let resolved = cc_switch_candidate(&record);
            if candidate_fingerprint(&resolved)? != candidate_fingerprint(candidate)? {
                return Err(DiscoveryError::CandidateMissing);
            }
            Ok(record.secret)
        }
        ("claude", Some(name)) if candidate.credential.source_type == "environment" => {
            std::env::var(name).map_err(|_| DiscoveryError::CandidateMissing)
        }
        ("claude", Some("ANTHROPIC_API_KEY")) => {
            let root = match std::env::var_os("CLAUDE_CONFIG_DIR") {
                Some(value) => PathBuf::from(value),
                None => home.join(".claude"),
            };
            let path = root.join("settings.json");
            let raw = read_exact_config(&path)?.ok_or(DiscoveryError::CandidateMissing)?;
            let value: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|_| DiscoveryError::Parse("Claude settings: invalid JSON".into()))?;
            value
                .get("env")
                .and_then(|env| env.get("ANTHROPIC_API_KEY"))
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .ok_or(DiscoveryError::CandidateMissing)
        }
        _ => agent_credentials::resolve(candidate, home),
    }
}

fn candidate_fingerprint(candidate: &ProviderCandidate) -> Result<String, DiscoveryError> {
    let bytes =
        serde_json::to_vec(candidate).map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn secret_revision(secret: &str) -> String {
    format!("{:x}", Sha256::digest(secret.as_bytes()))
}

fn candidate_effective_base_url(candidate: &ProviderCandidate) -> Option<&str> {
    candidate.base_url.as_deref().or_else(|| {
        let kind: ProviderKind =
            serde_json::from_value(serde_json::Value::String(candidate.kind.clone())).ok()?;
        ai_proxy::default_base_url(kind)
    })
}

fn normalize_protocol_base_url(
    value: &str,
    wire_protocol: Option<ProviderWireProtocol>,
) -> Result<String, DiscoveryError> {
    let trimmed = value.trim().trim_end_matches('/');
    let mut parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| DiscoveryError::Parse("provider candidate has an invalid endpoint".into()))?;
    let default_path = match wire_protocol {
        Some(ProviderWireProtocol::GoogleGenerateContent) => Some("/v1beta"),
        Some(
            ProviderWireProtocol::Responses
            | ProviderWireProtocol::ChatCompletions
            | ProviderWireProtocol::AnthropicMessages,
        ) => Some("/v1"),
        None => None,
    };
    if parsed.path().trim_end_matches('/').is_empty() {
        if let Some(default_path) = default_path {
            parsed.set_path(default_path);
            parsed.set_query(None);
            parsed.set_fragment(None);
        }
    }
    Ok(parsed.to_string().trim_end_matches('/').to_owned())
}

fn provider_matches_binding(
    provider: &ProviderConfig,
    supplied_kind: ProviderKind,
    supplied_base_url: &str,
    supplied_wire_protocol: Option<ProviderWireProtocol>,
) -> Result<bool, DiscoveryError> {
    if provider.kind != supplied_kind {
        return Ok(false);
    }
    let effective_wire = provider
        .kind
        .effective_wire_protocol(provider.wire_protocol)
        .map_err(DiscoveryError::UnsupportedWireProtocol)?;
    if effective_wire != supplied_wire_protocol {
        return Ok(false);
    }
    let Some(effective_base) = provider
        .base_url
        .as_deref()
        .or_else(|| ai_proxy::default_base_url(provider.kind))
    else {
        return Ok(false);
    };
    Ok(normalize_protocol_base_url(effective_base, effective_wire)?
        == normalize_protocol_base_url(supplied_base_url, supplied_wire_protocol)?)
}

fn unique_existing_provider<'a>(
    configured: &'a [ProviderConfig],
    kind: ProviderKind,
    base_url: &str,
    wire_protocol: Option<ProviderWireProtocol>,
) -> Result<Option<&'a ProviderConfig>, DiscoveryError> {
    let mut matched = None;
    for provider in configured {
        if !provider_matches_binding(provider, kind, base_url, wire_protocol)? {
            continue;
        }
        if matched.is_some() {
            return Err(DiscoveryError::Conflict);
        }
        matched = Some(provider);
    }
    Ok(matched)
}

fn validate_existing_provider_binding<R: Runtime>(
    app: &AppHandle<R>,
    provider_id: &str,
    supplied_kind: &str,
    supplied_base_url: &str,
    supplied_wire_protocol: Option<ProviderWireProtocol>,
) -> Result<(), DiscoveryError> {
    let providers = providers::load_providers_sync(app)
        .map_err(|error| DiscoveryError::Persistence(error.to_string()))?;
    let provider = providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .ok_or(DiscoveryError::CandidateMissing)?;
    let kind: ProviderKind =
        serde_json::from_value(serde_json::Value::String(supplied_kind.to_owned()))
            .map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    if !provider_matches_binding(provider, kind, supplied_base_url, supplied_wire_protocol)? {
        return Err(DiscoveryError::NotImportable);
    }
    Ok(())
}

fn looks_secret_bearing(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("sk-")
        || lower.contains("bearer ")
        || ["api_key=", "apikey=", "token=", "secret=", "password="]
            .iter()
            .any(|marker| lower.contains(marker))
}

fn validate_sanitized_text(value: &str, maximum: usize) -> Result<(), DiscoveryError> {
    if value.is_empty()
        || value.len() > maximum
        || value.chars().any(char::is_control)
        || Path::new(value).is_absolute()
        || value.starts_with(['/', '\\'])
        || (value.len() >= 3
            && value.as_bytes()[0].is_ascii_alphabetic()
            && value.as_bytes()[1] == b':'
            && matches!(value.as_bytes()[2], b'\\' | b'/'))
        || looks_secret_bearing(value)
    {
        return Err(DiscoveryError::Parse(
            "provider candidate contains unsafe display metadata".into(),
        ));
    }
    Ok(())
}

fn validate_candidate(candidate: &ProviderCandidate) -> Result<(), DiscoveryError> {
    validate_sanitized_text(&candidate.source_label, 80)?;
    validate_sanitized_text(&candidate.label, 120)?;
    if let Some(location) = candidate.config_location.as_deref() {
        validate_sanitized_text(location, 160)?;
        if !(location.starts_with("~/") || location.starts_with('$'))
            || location.split('/').any(|part| part == "..")
            || location.contains('\\')
        {
            return Err(DiscoveryError::Parse(
                "provider candidate contains an unsafe location label".into(),
            ));
        }
    }
    if let Some(reference) = candidate.credential.reference.as_deref() {
        validate_sanitized_text(reference, 128)?;
        if matches!(
            candidate.credential.source_type.as_str(),
            "environment" | "dotenv"
        ) {
            let mut bytes = reference.bytes();
            if !matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
                || !bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
            {
                return Err(DiscoveryError::Parse(
                    "provider candidate contains an unsafe environment reference".into(),
                ));
            }
        }
    }
    if let Some(model) = candidate.model_hint.as_deref() {
        validate_sanitized_text(model, 160)?;
    }
    for warning in &candidate.warnings {
        validate_sanitized_text(warning, 240)?;
    }
    if let Some(base_url) = candidate.base_url.as_deref() {
        let parsed = reqwest::Url::parse(base_url).map_err(|_| {
            DiscoveryError::Parse("provider candidate has an invalid endpoint".into())
        })?;
        if !matches!(parsed.scheme(), "http" | "https")
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return Err(DiscoveryError::Parse(
                "provider candidate has an unsafe endpoint".into(),
            ));
        }
        ai_proxy::enforce_host(&candidate.kind, base_url).map_err(|_| {
            DiscoveryError::Parse("provider candidate endpoint is not allowed".into())
        })?;
    }
    Ok(())
}

fn candidate_secret(candidate: &ProviderCandidate, home: &Path) -> Result<String, DiscoveryError> {
    let (codex_home, _) = codex_location(home);
    candidate_secret_at(candidate, home, &codex_home)
}

fn candidate_secret_for_app<R: Runtime>(
    app: &AppHandle<R>,
    candidate: &ProviderCandidate,
) -> Result<String, DiscoveryError> {
    if candidate.source == "cutout-keychain" {
        let source_id = cutout_source_id(app, &candidate.id)?;
        let secret = keys::read_secret(&source_id)
            .map_err(|error| DiscoveryError::Keychain(error.to_string()))?;
        crate::commands::packaged_e2e::native_checkpoint("ai-native-cutout-keychain-readable");
        return Ok(secret);
    }
    let home = app.path().home_dir().map_err(|_| DiscoveryError::Home)?;
    candidate_secret(candidate, &home)
}

fn model_ids(body: &str) -> Result<Vec<String>, DiscoveryError> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| DiscoveryError::CatalogMalformed)?;
    let rows = value
        .get("data")
        .or_else(|| value.get("models"))
        .and_then(serde_json::Value::as_array)
        .ok_or(DiscoveryError::CatalogMalformed)?;
    let mut ids: Vec<String> = rows
        .iter()
        .filter_map(|row| {
            row.get("id")
                .or_else(|| row.get("name"))?
                .as_str()
                .map(|id| id.strip_prefix("models/").unwrap_or(id).to_owned())
        })
        .collect();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err(DiscoveryError::CatalogMalformed);
    }
    Ok(ids)
}

#[tauri::command]
pub async fn create_provider_draft<R: Runtime>(
    app: AppHandle<R>,
    input: CreateDraftInput,
) -> Result<DraftSummary, DiscoveryError> {
    let source_count = usize::from(input.candidate_id.is_some())
        + usize::from(input.provider_id.is_some())
        + usize::from(input.secret.as_ref().is_some_and(|value| !value.is_empty()));
    let kind: ProviderKind = serde_json::from_value(serde_json::Value::String(input.kind.clone()))
        .map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    validate_draft_source_count(kind, source_count)?;
    let wire_protocol = normalized_draft_wire_protocol(kind, input.wire_protocol)?;
    let candidate_fingerprint = if let Some(id) = input.candidate_id.as_deref() {
        let candidate = discover_provider_candidates(app.clone())
            .await?
            .into_iter()
            .find(|candidate| candidate.id == id)
            .ok_or(DiscoveryError::CandidateMissing)?;
        if !candidate.credential.importable
            || candidate.kind != input.kind
            || candidate_effective_base_url(&candidate) != Some(input.base_url.as_str())
            || candidate.wire_protocol.as_deref() != wire_protocol.map(ProviderWireProtocol::as_str)
        {
            return Err(DiscoveryError::NotImportable);
        }
        Some(candidate_fingerprint(&candidate)?)
    } else {
        None
    };
    if let Some(provider_id) = input.provider_id.as_deref() {
        validate_existing_provider_binding(
            &app,
            provider_id,
            &input.kind,
            &input.base_url,
            wire_protocol,
        )?;
    }
    let mut store = drafts()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    purge_expired(&mut store);
    if store.len() >= MAX_DRAFTS {
        return Err(DiscoveryError::DraftCapacity);
    }
    let draft_id = format!("provider-draft:{}", uuid::Uuid::new_v4());
    store.insert(
        draft_id.clone(),
        ProviderDraftSession {
            created_at: Instant::now(),
            kind: input.kind,
            base_url: input.base_url,
            wire_protocol,
            candidate_id: input.candidate_id,
            provider_id: input.provider_id,
            secret: input.secret.filter(|value| !value.is_empty()),
            candidate_fingerprint,
            candidate_secret_revision: None,
            checked_models: None,
        },
    );
    Ok(DraftSummary {
        draft_id,
        expires_in_seconds: DRAFT_TTL.as_secs(),
    })
}

fn validate_draft_source_count(
    kind: ProviderKind,
    source_count: usize,
) -> Result<(), DiscoveryError> {
    let local_without_key = matches!(
        kind,
        ProviderKind::Ollama | ProviderKind::Vllm | ProviderKind::LmStudio
    );
    if source_count > 1 || (source_count == 0 && !local_without_key) {
        Err(DiscoveryError::DraftAmbiguous)
    } else {
        Ok(())
    }
}

async fn resolve_draft_secret<R: Runtime>(
    app: &AppHandle<R>,
    draft: &ProviderDraftSession,
) -> Result<String, DiscoveryError> {
    if let Some(secret) = &draft.secret {
        return Ok(secret.clone());
    }
    if let Some(id) = &draft.candidate_id {
        let candidates = discover_provider_candidates(app.clone()).await?;
        let candidate = candidates
            .iter()
            .find(|item| item.id == *id)
            .ok_or(DiscoveryError::CandidateMissing)?;
        if let Some(expected) = draft.candidate_fingerprint.as_deref() {
            if candidate_fingerprint(candidate)? != expected {
                return Err(DiscoveryError::CandidateMissing);
            }
        }
        let secret = candidate_secret_for_app(app, candidate)?;
        if let Some(expected) = draft.candidate_secret_revision.as_deref() {
            if secret_revision(&secret) != expected {
                return Err(DiscoveryError::CandidateMissing);
            }
        }
        return Ok(secret);
    }
    if let Some(id) = &draft.provider_id {
        validate_existing_provider_binding(
            app,
            id,
            &draft.kind,
            &draft.base_url,
            draft.wire_protocol,
        )?;
        let secret =
            keys::read_secret(id).map_err(|error| DiscoveryError::Keychain(error.to_string()))?;
        if let Some(expected) = draft.candidate_secret_revision.as_deref() {
            if secret_revision(&secret) != expected {
                return Err(DiscoveryError::CandidateMissing);
            }
        }
        return Ok(secret);
    }
    if matches!(draft.kind.as_str(), "ollama" | "vllm" | "lm-studio") {
        return Ok(String::new());
    }
    Err(DiscoveryError::CandidateMissing)
}

async fn check_draft<R: Runtime>(
    app: &AppHandle<R>,
    draft: &ProviderDraftSession,
) -> Result<(Vec<String>, Option<String>), DiscoveryError> {
    // This intentionally remains an authenticated catalog request. The four
    // supported generation protocols do not share a standardized read-only
    // OPTIONS/HEAD probe, and Check connection must never trigger generation.
    // Runtime viability is enforced locally by the closed kind/protocol matrix,
    // protocol-specific auth, URL normalization, and exhaustive SDK adapters.
    let secret = resolve_draft_secret(app, draft).await?;
    let url = format!("{}/models", draft.base_url.trim_end_matches('/'));
    let response = ai_proxy::request_with_secret_timeout(
        &draft.kind,
        draft.wire_protocol,
        &url,
        "GET",
        Default::default(),
        None,
        &secret,
        ai_proxy::AUTOMATIC_CATALOG_TIMEOUT_SECS,
    )
    .await
    .map_err(discovery_request_error)?;
    let models = match response.status {
        200..=299 => model_ids(&response.body),
        401 | 403 => Err(DiscoveryError::Http(response.status)),
        404 | 405 => Err(DiscoveryError::CatalogUnsupported),
        status => Err(DiscoveryError::Http(status)),
    }?;
    let revision = (draft.candidate_id.is_some() || draft.provider_id.is_some())
        .then(|| secret_revision(&secret));
    Ok((models, revision))
}

#[tauri::command]
pub async fn check_provider_draft<R: Runtime>(
    app: AppHandle<R>,
    draft_id: String,
) -> Result<ProviderProbeResult, DiscoveryError> {
    let draft = {
        let mut store = drafts()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        purge_expired(&mut store);
        let draft = store.get(&draft_id).ok_or(DiscoveryError::DraftExpired)?;
        ProviderDraftSession {
            created_at: draft.created_at,
            kind: draft.kind.clone(),
            base_url: draft.base_url.clone(),
            wire_protocol: draft.wire_protocol,
            candidate_id: draft.candidate_id.clone(),
            provider_id: draft.provider_id.clone(),
            secret: draft.secret.clone(),
            candidate_fingerprint: draft.candidate_fingerprint.clone(),
            candidate_secret_revision: draft.candidate_secret_revision.clone(),
            checked_models: draft.checked_models.clone(),
        }
    };
    let result = check_draft(&app, &draft).await;
    let mut store = drafts()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let current = store
        .get_mut(&draft_id)
        .ok_or(DiscoveryError::DraftExpired)?;
    match result {
        Ok((models, revision)) => {
            current.candidate_secret_revision = revision;
            current.checked_models = Some(models.clone());
            Ok(ProviderProbeResult { models })
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn cancel_provider_draft(draft_id: String) -> Result<(), DiscoveryError> {
    drafts()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&draft_id);
    Ok(())
}

#[tauri::command]
pub async fn import_provider_draft<R: Runtime>(
    app: AppHandle<R>,
    input: ImportDraftInput,
) -> Result<ProviderConfig, DiscoveryError> {
    let draft = take_draft(&input.draft_id)?;
    let models = draft
        .checked_models
        .as_ref()
        .ok_or(DiscoveryError::NotImportable)?;
    if !models.is_empty() && !models.iter().any(|model| model == &input.default_model) {
        return Err(DiscoveryError::CatalogMalformed);
    }
    let mut configured = providers::load_providers_sync(&app)
        .map_err(|error| DiscoveryError::Persistence(error.to_string()))?;
    if configured
        .iter()
        .any(|provider| provider.id == input.provider_id)
        || keys::has_key_exact(&input.provider_id)
    {
        return Err(DiscoveryError::Conflict);
    }
    let secret = resolve_draft_secret(&app, &draft).await?;
    let kind: ProviderKind = serde_json::from_value(serde_json::Value::String(draft.kind.clone()))
        .map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    let provider = ProviderConfig {
        id: input.provider_id.clone(),
        kind,
        label: input.label,
        base_url: Some(draft.base_url),
        wire_protocol: draft.wire_protocol,
        default_model: input.default_model,
        enabled: input.enabled,
    };
    if !secret.is_empty() {
        keys::store_imported_key(&input.provider_id, &secret)
            .map_err(|error| DiscoveryError::Keychain(error.to_string()))?;
    }
    configured.push(provider.clone());
    if let Err(error) = providers::save_providers_atomic(&app, &configured) {
        if !secret.is_empty() {
            let _ = keys::delete_imported_key(&input.provider_id);
        }
        return Err(DiscoveryError::Persistence(error.to_string()));
    }
    Ok(provider)
}

fn automatic_provider_id(candidate_id: &str) -> Result<String, DiscoveryError> {
    let digest = candidate_id
        .strip_prefix("provider-candidate:")
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or(DiscoveryError::CandidateMissing)?;
    Ok(format!("local-import-{}", &digest[..24]))
}

fn automatic_default_model(
    candidate: &ProviderCandidate,
    models: &[String],
) -> Result<String, DiscoveryError> {
    candidate
        .model_hint
        .as_ref()
        .filter(|hint| models.iter().any(|model| model == *hint))
        .cloned()
        .or_else(|| models.first().cloned())
        .ok_or(DiscoveryError::CatalogMalformed)
}

fn checkpoint_automatic_error(error: &DiscoveryError) {
    let phase = match error {
        DiscoveryError::Http(401 | 403) => "ai-native-catalog-unauthorized",
        DiscoveryError::Http(_) => "ai-native-catalog-http-failed",
        DiscoveryError::CatalogMalformed | DiscoveryError::CatalogUnsupported => {
            "ai-native-catalog-invalid"
        }
        DiscoveryError::Request(_) => {
            crate::commands::packaged_e2e::native_checkpoint("ai-native-catalog-request-failed");
            crate::commands::packaged_e2e::native_checkpoint(&format!(
                "ai-native-catalog-request-{}",
                request_failure_cause(error)
            ));
            return;
        }
        DiscoveryError::CandidateMissing | DiscoveryError::NotImportable => {
            "ai-native-credential-missing"
        }
        DiscoveryError::Keychain(_) => "ai-native-credential-vault-failed",
        _ => "ai-native-configuration-failed",
    };
    crate::commands::packaged_e2e::native_checkpoint(phase);
}

fn transport_failure_cause(message: &str) -> &'static str {
    let lower = message.to_ascii_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        "timeout"
    } else if lower.contains("dns")
        || lower.contains("failed to lookup")
        || lower.contains("name or service not known")
        || lower.contains("nodename nor servname")
    {
        "dns"
    } else if lower.contains("tls") || lower.contains("ssl") || lower.contains("certificate") {
        "tls"
    } else if lower.contains("connect")
        || lower.contains("connection refused")
        || lower.contains("network is unreachable")
    {
        "connect"
    } else {
        "other"
    }
}

fn discovery_request_error(error: ai_proxy::ProxyError) -> DiscoveryError {
    let cause = match error {
        ai_proxy::ProxyError::Request(message) => transport_failure_cause(&message),
        ai_proxy::ProxyError::DisallowedHost => "host-policy",
        ai_proxy::ProxyError::BadUrl => "bad-url",
        ai_proxy::ProxyError::ProviderBinding
        | ai_proxy::ProxyError::ProviderNotConfigured
        | ai_proxy::ProxyError::ProviderDisabled
        | ai_proxy::ProxyError::UnknownKind
        | ai_proxy::ProxyError::UnsupportedWireProtocol(_) => "binding",
        ai_proxy::ProxyError::BadMethod | ai_proxy::ProxyError::BadHeader => "request-shape",
        ai_proxy::ProxyError::NoKey | ai_proxy::ProxyError::Keychain => "credential-vault",
        ai_proxy::ProxyError::Cancelled => "cancelled",
        _ => "other",
    };
    DiscoveryError::Request(cause.into())
}

fn request_failure_cause(error: &DiscoveryError) -> &str {
    match error {
        DiscoveryError::Request(cause) => cause,
        _ => "other",
    }
}

fn automatic_catalog_outcome(error: &DiscoveryError) -> String {
    match error {
        DiscoveryError::Http(401 | 403) => "unauthorized".to_owned(),
        DiscoveryError::Http(_) => "http-failed".to_owned(),
        DiscoveryError::CatalogMalformed | DiscoveryError::CatalogUnsupported => {
            "invalid".to_owned()
        }
        DiscoveryError::Request(_) => format!("request-{}", request_failure_cause(error)),
        DiscoveryError::CandidateMissing | DiscoveryError::NotImportable => {
            "credential-missing".to_owned()
        }
        DiscoveryError::Keychain(_) => "credential-vault-failed".to_owned(),
        _ => "configuration-failed".to_owned(),
    }
}

fn checkpoint_reviewed_relay_catalog(
    candidate: &ProviderCandidate,
    error: Option<&DiscoveryError>,
) {
    let Some(relay) = candidate_reviewed_environment_relay(candidate) else {
        return;
    };
    let outcome = error
        .map(automatic_catalog_outcome)
        .unwrap_or_else(|| "checked".to_owned());
    crate::commands::packaged_e2e::native_checkpoint(&format!(
        "ai-native-environment-{relay}-catalog-{outcome}"
    ));
}

fn checkpoint_cutout_keychain_catalog_error(error: &DiscoveryError, ordinal: usize) {
    let suffix = match error {
        DiscoveryError::Http(401 | 403) => "unauthorized".to_owned(),
        DiscoveryError::Http(_) => "http-failed".to_owned(),
        DiscoveryError::CatalogMalformed | DiscoveryError::CatalogUnsupported => {
            "invalid".to_owned()
        }
        DiscoveryError::Request(_) => format!("request-{}", request_failure_cause(error)),
        _ => "failed".to_owned(),
    };
    crate::commands::packaged_e2e::native_checkpoint(&format!(
        "ai-native-cutout-keychain-{ordinal}-catalog-{suffix}"
    ));
}

async fn checked_automatic_draft<R: Runtime>(
    app: &AppHandle<R>,
    draft: &ProviderDraftSession,
) -> Result<Vec<String>, DiscoveryError> {
    match check_draft(app, draft).await {
        Ok((models, _)) => {
            crate::commands::packaged_e2e::native_checkpoint("ai-native-catalog-checked");
            Ok(models)
        }
        Err(error) => {
            checkpoint_automatic_error(&error);
            Err(error)
        }
    }
}

fn existing_provider_revalidation_draft(
    provider_id: String,
    kind: String,
    base_url: String,
    wire_protocol: Option<ProviderWireProtocol>,
) -> ProviderDraftSession {
    ProviderDraftSession {
        created_at: Instant::now(),
        kind,
        base_url,
        wire_protocol,
        candidate_id: None,
        provider_id: Some(provider_id),
        secret: None,
        candidate_fingerprint: None,
        candidate_secret_revision: None,
        checked_models: None,
    }
}

/// Atomically turns one reviewed local credential into a verified Cutout
/// Provider. The secret is resolved, checked, and stored entirely in Rust.
#[tauri::command]
pub async fn auto_configure_provider_candidate<R: Runtime>(
    app: AppHandle<R>,
    input: AutoConfigureCandidateInput,
) -> Result<AutoConfiguredProvider, DiscoveryError> {
    let candidates = discover_provider_candidates(app.clone()).await?;
    let cutout_keychain_ordinal = candidates
        .iter()
        .filter(|candidate| candidate.source == "cutout-keychain")
        .position(|candidate| candidate.id == input.candidate_id)
        .map(|index| index + 1);
    let candidate = candidates
        .into_iter()
        .find(|candidate| candidate.id == input.candidate_id)
        .ok_or(DiscoveryError::CandidateMissing)?;
    if !candidate.credential.available || !candidate.credential.importable {
        return Err(DiscoveryError::NotImportable);
    }
    if let Some(relay) = candidate_reviewed_environment_relay(&candidate) {
        crate::commands::packaged_e2e::native_checkpoint(&format!(
            "ai-native-environment-{relay}-attempted"
        ));
    }
    crate::commands::packaged_e2e::native_checkpoint("ai-native-candidate-resolved");
    let base_url = candidate_effective_base_url(&candidate)
        .map(str::to_owned)
        .ok_or_else(|| DiscoveryError::Parse("provider endpoint is unavailable".into()))?;
    let kind: ProviderKind =
        serde_json::from_value(serde_json::Value::String(candidate.kind.clone()))
            .map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    let wire_protocol = normalized_draft_wire_protocol(
        kind,
        candidate
            .wire_protocol
            .as_deref()
            .map(|protocol| {
                serde_json::from_value(serde_json::Value::String(protocol.to_owned()))
                    .map_err(|error| DiscoveryError::UnsupportedWireProtocol(error.to_string()))
            })
            .transpose()?,
    )?;
    let base_url = normalize_protocol_base_url(&base_url, wire_protocol)?;
    crate::commands::packaged_e2e::native_checkpoint("ai-native-binding-normalized");
    let configured = providers::load_providers_sync(&app)
        .map_err(|error| DiscoveryError::Persistence(error.to_string()))?;
    crate::commands::packaged_e2e::native_checkpoint("ai-native-config-loaded");
    let existing = unique_existing_provider(&configured, kind, &base_url, wire_protocol)?.cloned();
    let provider_id = match &existing {
        Some(provider) => provider.id.clone(),
        None => automatic_provider_id(&candidate.id)?,
    };

    if let Some(existing) = existing {
        validate_existing_provider_binding(
            &app,
            &provider_id,
            &candidate.kind,
            &base_url,
            wire_protocol,
        )?;
        let draft = existing_provider_revalidation_draft(
            provider_id,
            candidate.kind.clone(),
            base_url,
            wire_protocol,
        );
        let models = match checked_automatic_draft(&app, &draft).await {
            Ok(models) => {
                checkpoint_reviewed_relay_catalog(&candidate, None);
                models
            }
            Err(error) => {
                checkpoint_reviewed_relay_catalog(&candidate, Some(&error));
                if let Some(ordinal) = cutout_keychain_ordinal {
                    checkpoint_cutout_keychain_catalog_error(&error, ordinal);
                }
                return Err(error);
            }
        };
        if let Some(ordinal) = cutout_keychain_ordinal {
            crate::commands::packaged_e2e::native_checkpoint(&format!(
                "ai-native-cutout-keychain-{ordinal}-catalog-checked"
            ));
        }
        return Ok(AutoConfiguredProvider {
            provider: existing,
            models,
        });
    }

    let secret = match candidate_secret_for_app(&app, &candidate) {
        Ok(secret) => secret,
        Err(error) => {
            checkpoint_automatic_error(&error);
            return Err(error);
        }
    };
    crate::commands::packaged_e2e::native_checkpoint("ai-native-secret-resolved");
    let draft = ProviderDraftSession {
        created_at: Instant::now(),
        kind: candidate.kind.clone(),
        base_url: base_url.clone(),
        wire_protocol,
        candidate_id: Some(candidate.id.clone()),
        provider_id: None,
        secret: Some(secret.clone()),
        candidate_fingerprint: Some(candidate_fingerprint(&candidate)?),
        candidate_secret_revision: None,
        checked_models: None,
    };
    let models = match checked_automatic_draft(&app, &draft).await {
        Ok(models) => {
            checkpoint_reviewed_relay_catalog(&candidate, None);
            models
        }
        Err(error) => {
            checkpoint_reviewed_relay_catalog(&candidate, Some(&error));
            if let Some(ordinal) = cutout_keychain_ordinal {
                checkpoint_cutout_keychain_catalog_error(&error, ordinal);
            }
            return Err(error);
        }
    };
    if let Some(ordinal) = cutout_keychain_ordinal {
        crate::commands::packaged_e2e::native_checkpoint(&format!(
            "ai-native-cutout-keychain-{ordinal}-catalog-checked"
        ));
    }
    let provider = ProviderConfig {
        id: provider_id.clone(),
        kind,
        label: candidate.label.clone(),
        base_url: Some(base_url),
        wire_protocol,
        default_model: automatic_default_model(&candidate, &models)?,
        enabled: true,
    };
    keys::store_imported_key(&provider_id, &secret).map_err(|_| {
        let error = DiscoveryError::Keychain("credential vault write failed".into());
        checkpoint_automatic_error(&error);
        error
    })?;
    crate::commands::packaged_e2e::native_checkpoint("ai-native-key-stored");
    let mut next = configured;
    next.push(provider.clone());
    if let Err(error) = providers::save_providers_atomic(&app, &next) {
        let _ = keys::delete_imported_key(&provider_id);
        return Err(DiscoveryError::Persistence(error.to_string()));
    }
    crate::commands::packaged_e2e::native_checkpoint("ai-native-provider-saved");
    if let Some(relay) = candidate_reviewed_environment_relay(&candidate) {
        crate::commands::packaged_e2e::native_checkpoint(&format!(
            "ai-native-environment-{relay}-provider-saved"
        ));
    }
    Ok(AutoConfiguredProvider { provider, models })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_location_prefers_configured_home_and_defaults_to_dot_codex() {
        let home = Path::new("/test-home");
        assert_eq!(
            codex_location_from(home, None),
            (home.join(".codex"), "~/.codex")
        );
        assert_eq!(
            codex_location_from(home, Some(PathBuf::from("/selected-codex"))),
            (PathBuf::from("/selected-codex"), "$CODEX_HOME")
        );
    }

    #[test]
    fn automatic_ids_are_stable_and_opaque() {
        let candidate = format!("provider-candidate:{}", "a".repeat(64));
        assert_eq!(
            automatic_provider_id(&candidate).unwrap(),
            format!("local-import-{}", "a".repeat(24))
        );
        assert!(automatic_provider_id("candidate:/local/path").is_err());
    }

    #[test]
    fn reviewed_relay_environment_candidates_use_fixed_origins_and_model_hints() {
        let values = HashMap::from([
            ("MOX_API_KEY", "available"),
            ("MOX_BASE_URL", "https://aigw.mox.ktvsky.com"),
            ("TDS_API_KEY", "available"),
            ("TDS_BASE_URL", "https://unexpected.example/v1"),
        ]);
        let candidates =
            discover_environment_with(|name| values.get(name).map(std::ffi::OsString::from));

        let mox = candidates
            .iter()
            .find(|candidate| candidate.label == "MOX")
            .unwrap();
        assert_eq!(mox.kind, "openai-compatible");
        assert_eq!(
            mox.base_url.as_deref(),
            Some("https://aigw.mox.ktvsky.com/v1")
        );
        assert_eq!(mox.wire_protocol.as_deref(), Some("chat-completions"));
        assert_eq!(
            mox.model_hint.as_deref(),
            Some(REVIEWED_RELAY_TEXT_MODEL_HINT)
        );
        assert_eq!(mox.credential.reference.as_deref(), Some("MOX_API_KEY"));
        assert!(mox.credential.importable);
        assert!(!candidates
            .iter()
            .any(|candidate| candidate.label == "TDS Router"));
    }

    #[test]
    fn packaged_e2e_provider_discovery_is_isolated_from_the_canonical_registry() {
        let config_dir = tempdir().unwrap();
        let canonical = config_dir.path().join(PROVIDER_REGISTRY_FILE);
        let discovery = config_dir.path().join(PACKAGED_E2E_PROVIDER_DISCOVERY_FILE);
        std::fs::write(&canonical, "[]").unwrap();
        std::fs::write(
            &discovery,
            serde_json::json!([{
                "id": "mox",
                "kind": "openai-compatible",
                "label": "MOX",
                "baseUrl": "https://relay.example/v1",
                "wireProtocol": "chat-completions",
                "defaultModel": "gpt-image-2",
                "enabled": true
            }])
            .to_string(),
        )
        .unwrap();

        assert_eq!(
            cutout_provider_metadata_paths(config_dir.path(), false),
            vec![canonical.clone()]
        );
        assert!(
            discover_cutout_keychain_at(config_dir.path(), false, |_| Ok(true))
                .candidates
                .is_empty()
        );

        let discovery = discover_cutout_keychain_at(config_dir.path(), true, |id| Ok(id == "mox"));
        let candidates = discovery.candidates;
        assert_eq!(discovery.readable_files, 2);
        assert_eq!(discovery.invalid_files, 0);
        assert_eq!(discovery.metadata_rows, 1);
        assert_eq!(discovery.keys_present, 1);
        assert_eq!(discovery.keys_missing, 0);
        assert_eq!(discovery.key_errors, 0);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].source, "cutout-keychain");
        assert_eq!(candidates[0].label, "MOX");
        assert_eq!(
            cutout_source_id_at(config_dir.path(), &candidates[0].id, true).unwrap(),
            "mox"
        );
        assert!(matches!(
            cutout_source_id_at(config_dir.path(), &candidates[0].id, false),
            Err(DiscoveryError::CandidateMissing)
        ));
        assert_eq!(std::fs::read_to_string(canonical).unwrap(), "[]");
        assert!(!serde_json::to_string(&candidates)
            .unwrap()
            .contains("credential-sentinel-must-not-serialize"));

        let unavailable =
            discover_cutout_keychain_at(config_dir.path(), true, |_| Err(keys::KeyError::Keychain));
        assert!(unavailable.candidates.is_empty());
        assert_eq!(unavailable.keys_present, 0);
        assert_eq!(unavailable.keys_missing, 0);
        assert_eq!(unavailable.key_errors, 1);
    }

    use tempfile::TempDir;

    fn tempdir() -> std::io::Result<TempDir> {
        tempfile::tempdir_in(std::env::temp_dir().canonicalize()?)
    }

    fn create_cc_switch_database(home: &Path, settings: &str) -> PathBuf {
        let root = home.join(".cc-switch");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("cc-switch.db");
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE providers (
                    id TEXT NOT NULL,
                    app_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    settings_config TEXT NOT NULL,
                    is_current BOOLEAN NOT NULL DEFAULT 0,
                    in_failover_queue BOOLEAN NOT NULL DEFAULT 0,
                    sort_index INTEGER,
                    PRIMARY KEY (id, app_type)
                );",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO providers (id, app_type, name, settings_config, is_current)
                 VALUES (?1, 'codex', 'Current upstream', ?2, 1)",
                rusqlite::params!["current", settings],
            )
            .unwrap();
        path
    }

    fn cc_switch_settings(base_url: &str, model: &str, secret: &str) -> String {
        serde_json::json!({
            "auth": { "OPENAI_API_KEY": secret },
            "config": format!(
                "base_url = {base_url:?}\nwire_api = \"responses\"\nmodel = {model:?}\n[features]\njs_repl = true\n"
            ),
        })
        .to_string()
    }

    #[test]
    fn cc_switch_current_upstream_is_importable_without_exposing_its_secret() {
        let home = tempdir().unwrap();
        let secret = "cc-switch-db-secret-must-stay-native";
        create_cc_switch_database(
            home.path(),
            &cc_switch_settings("https://relay.example/", "gpt-observed", secret),
        );

        let rows = discover_cc_switch(home.path()).unwrap();
        assert_eq!(rows.len(), 1);
        let candidate = &rows[0];
        assert_eq!(candidate.source, "cc-switch");
        assert_eq!(candidate.schema_id.as_deref(), Some(CC_SWITCH_DB_SCHEMA_ID));
        assert_eq!(candidate.kind, "openai-compatible");
        assert_eq!(
            candidate.base_url.as_deref(),
            Some("https://relay.example/v1")
        );
        assert_eq!(candidate.wire_protocol.as_deref(), Some("responses"));
        assert_eq!(candidate.model_hint.as_deref(), Some("gpt-observed"));
        assert!(candidate.credential.available);
        assert!(candidate.credential.importable);
        assert_eq!(candidate_secret(candidate, home.path()).unwrap(), secret);
        assert!(!serde_json::to_string(candidate).unwrap().contains(secret));
        assert!(matches!(
            automatic_default_model(candidate, &[]),
            Err(DiscoveryError::CatalogMalformed)
        ));
    }

    #[test]
    fn cc_switch_discovers_current_then_failover_queue_and_rereads_each_secret() {
        let home = tempdir().unwrap();
        let path = create_cc_switch_database(
            home.path(),
            &cc_switch_settings(
                "https://current.example/v1",
                "current-model",
                "current-secret",
            ),
        );
        let connection = rusqlite::Connection::open(path).unwrap();
        for (id, sort_index, endpoint, model, secret) in [
            (
                "later",
                20,
                "https://later.example/v1",
                "later-model",
                "later-secret",
            ),
            (
                "first",
                10,
                "https://first.example/v1",
                "first-model",
                "first-secret",
            ),
        ] {
            connection
                .execute(
                    "INSERT INTO providers (
                        id, app_type, name, settings_config, is_current,
                        in_failover_queue, sort_index
                     ) VALUES (?1, 'codex', 'Queued upstream', ?2, 0, 1, ?3)",
                    rusqlite::params![id, cc_switch_settings(endpoint, model, secret), sort_index],
                )
                .unwrap();
        }
        drop(connection);

        let candidates = discover_cc_switch(home.path()).unwrap();
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| candidate.base_url.as_deref().unwrap())
                .collect::<Vec<_>>(),
            vec![
                "https://current.example/v1",
                "https://first.example/v1",
                "https://later.example/v1",
            ]
        );
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| candidate_secret(candidate, home.path()).unwrap())
                .collect::<Vec<_>>(),
            vec!["current-secret", "first-secret", "later-secret"]
        );
        let serialized = serde_json::to_string(&candidates).unwrap();
        for sensitive in [
            "current-secret",
            "first-secret",
            "later-secret",
            "current\"",
            "first\"",
            "later\"",
        ] {
            assert!(!serialized.contains(sensitive));
        }
    }

    #[test]
    fn cc_switch_database_is_optional_and_never_created_by_discovery() {
        let home = tempdir().unwrap();
        let path = home.path().join(".cc-switch/cc-switch.db");
        assert!(discover_cc_switch(home.path()).unwrap().is_empty());
        assert!(!path.exists());
    }

    #[test]
    fn cc_switch_database_adapter_rejects_oversized_database_before_opening() {
        let home = tempdir().unwrap();
        let root = home.path().join(".cc-switch");
        std::fs::create_dir(&root).unwrap();
        let file = std::fs::File::create(root.join("cc-switch.db")).unwrap();
        file.set_len(MAX_CC_SWITCH_DB_BYTES + 1).unwrap();
        assert!(matches!(
            discover_cc_switch(home.path()),
            Err(DiscoveryError::TooLarge(_))
        ));
    }

    #[test]
    fn cc_switch_database_adapter_does_not_materialize_oversized_settings() {
        let home = tempdir().unwrap();
        create_cc_switch_database(home.path(), &"x".repeat(MAX_CONFIG_BYTES as usize + 1));
        assert!(matches!(
            discover_cc_switch(home.path()),
            Err(DiscoveryError::TooLarge(_))
        ));
    }

    #[test]
    fn cc_switch_database_adapter_rejects_schema_and_binding_ambiguity() {
        let home = tempdir().unwrap();
        let root = home.path().join(".cc-switch");
        std::fs::create_dir(&root).unwrap();
        let path = root.join("cc-switch.db");
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE providers (
                    id TEXT NOT NULL,
                    app_type TEXT NOT NULL,
                    settings_config TEXT NOT NULL,
                    PRIMARY KEY (id, app_type)
                );",
            )
            .unwrap();
        drop(connection);
        assert!(matches!(
            discover_cc_switch(home.path()),
            Err(DiscoveryError::Parse(_))
        ));

        std::fs::remove_file(&path).unwrap();
        let settings = cc_switch_settings("https://relay.example/v1", "model", "secret");
        create_cc_switch_database(home.path(), &settings);
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute(
                "INSERT INTO providers (id, app_type, name, settings_config, is_current)
                 VALUES ('other', 'codex', 'Other', ?1, 1)",
                [settings],
            )
            .unwrap();
        drop(connection);
        assert!(matches!(
            discover_cc_switch(home.path()),
            Err(DiscoveryError::Parse(_))
        ));
    }

    #[test]
    fn cc_switch_database_adapter_rejects_unreviewed_settings_shapes() {
        for settings in [
            serde_json::json!({
                "auth": { "OPENAI_API_KEY": "secret" },
                "config": "base_url = \"https://relay.example/v1\"\nwire_api = \"responses\"",
                "unexpected": true,
            })
            .to_string(),
            serde_json::json!({
                "auth": { "OPENAI_API_KEY": "secret", "access_token": "not-importable" },
                "config": "base_url = \"https://relay.example/v1\"\nwire_api = \"responses\"",
            })
            .to_string(),
            cc_switch_settings("http://127.0.0.1:9999/v1", "model", "secret"),
            cc_switch_settings(
                "https://user:password@relay.example/v1",
                "model",
                "secret",
            ),
            cc_switch_settings(
                "https://relay.example/v1?token=not-allowed",
                "model",
                "secret",
            ),
            serde_json::json!({
                "auth": { "OPENAI_API_KEY": "secret" },
                "config": "base_url = \"https://relay.example/v1\"\nwire_api = \"chat-completions\"",
            })
            .to_string(),
            serde_json::json!({
                "auth": { "OPENAI_API_KEY": "secret" },
                "config": "base_url = \"https://relay.example/v1\"\nwire_api = \"responses\"\nmodel_provider = \"other\"",
            })
            .to_string(),
        ] {
            let home = tempdir().unwrap();
            create_cc_switch_database(home.path(), &settings);
            assert!(discover_cc_switch(home.path()).is_err());
        }
    }

    #[test]
    fn cc_switch_candidate_is_reread_and_rejects_binding_drift() {
        let home = tempdir().unwrap();
        let path = create_cc_switch_database(
            home.path(),
            &cc_switch_settings("https://first.example/v1", "model-a", "first-secret"),
        );
        let candidate = discover_cc_switch(home.path()).unwrap().remove(0);
        let changed = cc_switch_settings("https://second.example/v1", "model-b", "second-secret");
        let connection = rusqlite::Connection::open(path).unwrap();
        connection
            .execute(
                "UPDATE providers SET settings_config = ?1 WHERE app_type = 'codex' AND is_current = 1",
                [changed],
            )
            .unwrap();
        drop(connection);

        assert!(matches!(
            candidate_secret(&candidate, home.path()),
            Err(DiscoveryError::CandidateMissing)
        ));
    }

    #[test]
    fn cc_switch_queue_candidate_is_reread_and_rejects_membership_drift() {
        let home = tempdir().unwrap();
        let path = create_cc_switch_database(
            home.path(),
            &cc_switch_settings("https://current.example/v1", "current", "current-secret"),
        );
        let queued = cc_switch_settings("https://queued.example/v1", "queued", "queued-secret");
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute(
                "INSERT INTO providers (
                    id, app_type, name, settings_config, is_current,
                    in_failover_queue, sort_index
                 ) VALUES ('queued', 'codex', 'Queued', ?1, 0, 1, 10)",
                [queued],
            )
            .unwrap();
        drop(connection);
        let candidate = discover_cc_switch(home.path()).unwrap().remove(1);
        assert_eq!(
            candidate_secret(&candidate, home.path()).unwrap(),
            "queued-secret"
        );

        let connection = rusqlite::Connection::open(path).unwrap();
        connection
            .execute(
                "UPDATE providers SET in_failover_queue = 0 WHERE id = 'queued' AND app_type = 'codex'",
                [],
            )
            .unwrap();
        drop(connection);
        assert!(matches!(
            candidate_secret(&candidate, home.path()),
            Err(DiscoveryError::CandidateMissing)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn cc_switch_database_adapter_rejects_symlinked_database() {
        use std::os::unix::fs::symlink;

        let source_home = tempdir().unwrap();
        let path = create_cc_switch_database(
            source_home.path(),
            &cc_switch_settings("https://relay.example/v1", "model", "secret"),
        );
        let linked_home = tempdir().unwrap();
        std::fs::create_dir(linked_home.path().join(".cc-switch")).unwrap();
        symlink(&path, linked_home.path().join(".cc-switch/cc-switch.db")).unwrap();
        assert!(matches!(
            discover_cc_switch(linked_home.path()),
            Err(DiscoveryError::Symlink(_))
        ));
    }

    #[test]
    fn exact_config_reader_accepts_platform_absolute_temp_paths() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("config.json");
        std::fs::write(&path, r#"{"model":"test"}"#).unwrap();

        assert_eq!(
            read_exact_config(&path).unwrap().as_deref(),
            Some(r#"{"model":"test"}"#)
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_config_identity_uses_the_file_index_not_mutable_metadata() {
        let directory = tempdir().unwrap();
        let left_path = directory.path().join("left.json");
        let right_path = directory.path().join("right.json");
        std::fs::write(&left_path, "{}").unwrap();
        std::fs::write(&right_path, "{}").unwrap();
        let timestamp = std::time::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        std::fs::OpenOptions::new()
            .write(true)
            .open(&left_path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(timestamp))
            .unwrap();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&right_path)
            .unwrap()
            .set_times(std::fs::FileTimes::new().set_modified(timestamp))
            .unwrap();

        let left = open_exact_config(&left_path).unwrap();
        let right = open_exact_config(&right_path).unwrap();
        assert_eq!(
            left.metadata().unwrap().len(),
            right.metadata().unwrap().len()
        );
        assert_eq!(
            left.metadata().unwrap().modified().unwrap(),
            right.metadata().unwrap().modified().unwrap()
        );
        assert_ne!(
            file_identity(&left).unwrap(),
            file_identity(&right).unwrap()
        );
    }

    #[test]
    fn sanitized_text_rejects_absolute_path_labels_on_every_platform() {
        for value in [
            "/Users/example/.codex/auth.json",
            r"C:\Users\example\.codex\auth.json",
            "C:/Users/example/.codex/auth.json",
            r"\\server\share\.codex\auth.json",
        ] {
            assert!(validate_sanitized_text(value, 160).is_err(), "{value}");
        }
    }

    #[test]
    fn codex_returns_only_sanitized_metadata() {
        let home = tempdir().unwrap();
        std::fs::create_dir(home.path().join(".codex")).unwrap();
        std::fs::write(
            home.path().join(".codex/config.toml"),
            r#"
model = "gpt-test"
model_provider = "relay"
[model_providers.relay]
name = "Relay"
base_url = "https://relay.example/v1"
env_key = "CUTOUT_TEST_NEVER_SET"
wire_api = "responses"
"#,
        )
        .unwrap();
        let rows = discover_codex_at(&home.path().join(".codex"), "~/.codex").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].wire_protocol.as_deref(), Some("responses"));
        let json = serde_json::to_string(&rows).unwrap();
        assert!(json.contains("CUTOUT_TEST_NEVER_SET"));
        assert!(!json.contains("apiKey"));
    }

    #[test]
    fn codex_auth_only_candidate_is_importable_and_secret_stays_native() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"sentinel-secret-must-not-cross-ipc"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].kind, "openai");
        assert_eq!(rows[0].wire_protocol.as_deref(), Some("responses"));
        assert_eq!(rows[0].schema_id.as_deref(), Some("codex-auth-v1"));
        assert_eq!(
            rows[0].config_location.as_deref(),
            Some("~/.codex/auth.json")
        );
        assert_eq!(rows[0].credential.source_type, "config-literal");
        assert_eq!(
            rows[0].credential.reference.as_deref(),
            Some("OPENAI_API_KEY")
        );
        assert!(rows[0].credential.available);
        assert!(rows[0].credential.importable);
        assert_eq!(
            candidate_secret_at(&rows[0], home.path(), &codex_home).unwrap(),
            "sentinel-secret-must-not-cross-ipc"
        );
        let mut unknown_schema = rows[0].clone();
        unknown_schema.schema_id = Some("unknown-codex-schema-v1".into());
        assert!(matches!(
            candidate_secret_at(&unknown_schema, home.path(), &codex_home),
            Err(DiscoveryError::CandidateMissing)
        ));
        let json = serde_json::to_string(&rows).unwrap();
        assert!(!json.contains("sentinel-secret-must-not-cross-ipc"));
    }

    #[test]
    fn codex_openai_config_falls_back_to_auth_file_when_env_is_unavailable() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            r#"
model = "gpt-test"
model_provider = "openai"
[model_providers.openai]
name = "OpenAI from Codex"
env_key = "CUTOUT_TEST_NEVER_SET"
wire_api = "responses"
"#,
        )
        .unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"native-auth-secret"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].label, "OpenAI from Codex");
        assert_eq!(rows[0].model_hint.as_deref(), Some("gpt-test"));
        assert_eq!(rows[0].schema_id.as_deref(), Some("codex-config-v1"));
        assert_eq!(
            rows[0].config_location.as_deref(),
            Some("~/.codex/auth.json")
        );
        assert_eq!(rows[0].credential.source_type, "config-literal");
        assert_eq!(
            candidate_secret_at(&rows[0], home.path(), &codex_home).unwrap(),
            "native-auth-secret"
        );
        assert!(!serde_json::to_string(&rows)
            .unwrap()
            .contains("native-auth-secret"));
    }

    #[test]
    fn codex_cc_switch_profile_reuses_auth_file_without_exposing_it() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            r#"
model = "gpt-5.6-sol"
model_provider = "ccswitch"
[model_providers.ccswitch]
name = "CC Switch"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
"#,
        )
        .unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"cc-switch-native-secret"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert_eq!(rows.len(), 1);
        let candidate = &rows[0];
        assert_eq!(candidate.kind, "cc-switch");
        assert_eq!(candidate.base_url.as_deref(), Some(CC_SWITCH_BASE_URL));
        assert_eq!(candidate.wire_protocol.as_deref(), Some("responses"));
        assert_eq!(candidate.model_hint.as_deref(), Some("gpt-5.6-sol"));
        assert_eq!(candidate.credential.source_type, "config-literal");
        assert!(candidate.credential.available);
        assert!(candidate.credential.importable);
        assert_eq!(
            candidate_secret_at(candidate, home.path(), &codex_home).unwrap(),
            "cc-switch-native-secret"
        );
        assert!(!serde_json::to_string(&rows)
            .unwrap()
            .contains("cc-switch-native-secret"));
    }

    #[test]
    fn codex_root_cc_switch_profile_reuses_only_the_auth_file_api_key() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            r#"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
model = "gpt-image-2"
experimental_bearer_token = "session-material-must-not-import"
"#,
        )
        .unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"root-cc-switch-api-key"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert_eq!(rows.len(), 1);
        let candidate = &rows[0];
        assert_eq!(candidate.kind, "cc-switch");
        assert_eq!(
            candidate.schema_id.as_deref(),
            Some("codex-root-cc-switch-v1")
        );
        assert_eq!(candidate.base_url.as_deref(), Some(CC_SWITCH_BASE_URL));
        assert_eq!(candidate.wire_protocol.as_deref(), Some("responses"));
        assert_eq!(candidate.model_hint.as_deref(), Some("gpt-image-2"));
        assert_eq!(
            candidate_secret_at(candidate, home.path(), &codex_home).unwrap(),
            "root-cc-switch-api-key"
        );
        let serialized = serde_json::to_string(&rows).unwrap();
        assert!(!serialized.contains("root-cc-switch-api-key"));
        assert!(!serialized.contains("session-material-must-not-import"));
    }

    #[test]
    fn codex_root_provider_binding_never_falls_back_to_public_openai() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            r#"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
model_provider = "relay"
[model_providers.relay]
base_url = "https://relay.example/v1"
wire_api = "responses"
"#,
        )
        .unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"must-not-bind-to-public-openai"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert!(rows
            .iter()
            .all(|candidate| candidate.schema_id.as_deref() != Some("codex-root-cc-switch-v1")));
        assert!(rows.iter().all(|candidate| candidate.kind != "openai"));
        assert!(!serde_json::to_string(&rows)
            .unwrap()
            .contains("must-not-bind-to-public-openai"));
    }

    #[test]
    fn codex_root_wire_protocol_without_a_base_keeps_the_openai_default() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            "wire_api = \"responses\"\nmodel = \"gpt-default\"\n",
        )
        .unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"default-openai-api-key"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].kind, "openai");
        assert_eq!(rows[0].model_hint.as_deref(), Some("gpt-default"));
        assert!(!serde_json::to_string(&rows)
            .unwrap()
            .contains("default-openai-api-key"));
    }

    #[test]
    fn codex_cc_switch_name_does_not_authorize_an_unreviewed_endpoint() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            r#"
model_provider = "ccswitch"
[model_providers.ccswitch]
name = "CC Switch"
base_url = "http://192.168.1.20:15721/v1"
wire_api = "responses"
"#,
        )
        .unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"OPENAI_API_KEY":"must-not-bind-to-lan"}"#,
        )
        .unwrap();

        let rows = discover_codex_at(&codex_home, "~/.codex").unwrap();
        assert_eq!(rows.len(), 2);
        let configured = rows
            .iter()
            .find(|candidate| candidate.label == "CC Switch")
            .unwrap();
        assert_eq!(configured.kind, "openai-compatible");
        assert!(!configured.credential.available);
        assert!(!configured.credential.importable);
        assert!(rows.iter().any(|candidate| candidate.kind == "openai"));
    }

    #[test]
    fn codex_oauth_or_empty_auth_is_not_imported_as_an_api_key() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"tokens":{"access_token":"oauth-session-must-not-import"}}"#,
        )
        .unwrap();
        assert!(discover_codex_at(&codex_home, "~/.codex")
            .unwrap()
            .is_empty());

        std::fs::write(codex_home.join("auth.json"), r#"{"OPENAI_API_KEY":""}"#).unwrap();
        assert!(discover_codex_at(&codex_home, "~/.codex")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn claude_literal_candidate_is_sanitized_and_helper_only_is_ignored() {
        let home = tempdir().unwrap();
        std::fs::create_dir(home.path().join(".claude")).unwrap();
        std::fs::write(
            home.path().join(".claude/settings.json"),
            r#"{
              "model": "claude-test",
              "apiKeyHelper": "echo must-not-run",
              "env": {
                "ANTHROPIC_BASE_URL": "https://api.anthropic.com/v1",
                "ANTHROPIC_API_KEY": "literal-secret-must-not-cross-ipc"
              }
            }"#,
        )
        .unwrap();

        let rows = discover_claude(home.path()).unwrap();
        assert_eq!(rows.len(), 2);
        let api = rows.iter().find(|row| row.credential.importable).unwrap();
        assert_eq!(api.credential.source_type, "config-literal");
        let json = serde_json::to_string(&rows).unwrap();
        assert!(!json.contains("literal-secret-must-not-cross-ipc"));
        assert!(!json.contains("echo must-not-run"));

        std::fs::write(
            home.path().join(".claude/settings.json"),
            r#"{"apiKeyHelper":"echo must-not-run"}"#,
        )
        .unwrap();
        let rows = discover_claude(home.path()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].credential.source_type, "helper");
        assert!(!rows[0].credential.importable);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_config() {
        use std::os::unix::fs::symlink;
        let home = tempdir().unwrap();
        std::fs::create_dir(home.path().join(".codex")).unwrap();
        let target = home.path().join("actual.toml");
        std::fs::write(&target, "model='x'").unwrap();
        symlink(&target, home.path().join(".codex/config.toml")).unwrap();
        assert!(matches!(
            discover_codex_at(&home.path().join(".codex"), "~/.codex"),
            Err(DiscoveryError::Symlink(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_codex_auth() {
        use std::os::unix::fs::symlink;
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        let target = home.path().join("actual-auth.json");
        std::fs::write(&target, r#"{"OPENAI_API_KEY":"secret"}"#).unwrap();
        symlink(&target, codex_home.join("auth.json")).unwrap();
        assert!(matches!(
            discover_codex_at(&codex_home, "~/.codex"),
            Err(DiscoveryError::Symlink(_))
        ));
    }

    #[test]
    fn rejects_oversized_config_before_reading_or_parsing() {
        let home = tempdir().unwrap();
        std::fs::create_dir(home.path().join(".codex")).unwrap();
        let path = home.path().join(".codex/config.toml");
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_CONFIG_BYTES + 1).unwrap();
        assert!(matches!(
            read_exact_config(&path),
            Err(DiscoveryError::TooLarge(_))
        ));
    }

    #[test]
    fn rejects_oversized_codex_auth_before_parsing() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        std::fs::create_dir(&codex_home).unwrap();
        let file = std::fs::File::create(codex_home.join("auth.json")).unwrap();
        file.set_len(MAX_CONFIG_BYTES + 1).unwrap();
        assert!(matches!(
            discover_codex_at(&codex_home, "~/.codex"),
            Err(DiscoveryError::TooLarge(_))
        ));
    }

    #[test]
    fn rejects_unsupported_codex_wire_protocol() {
        let home = tempdir().unwrap();
        std::fs::create_dir(home.path().join(".codex")).unwrap();
        std::fs::write(
            home.path().join(".codex/config.toml"),
            r#"
[model_providers.relay]
base_url = "https://relay.example/v1"
env_key = "RELAY_API_KEY"
wire_api = "unsupported-completions"
"#,
        )
        .unwrap();

        assert!(matches!(
            discover_codex_at(&home.path().join(".codex"), "~/.codex"),
            Err(DiscoveryError::UnsupportedWireProtocol(value)) if value == "unsupported-completions"
        ));
    }

    #[test]
    fn draft_protocol_defaults_and_validation_fail_closed() {
        assert_eq!(
            normalized_draft_wire_protocol(ProviderKind::Openai, None).unwrap(),
            Some(ProviderWireProtocol::Responses)
        );
        assert!(matches!(
            normalized_draft_wire_protocol(ProviderKind::OpenaiCompatible, None).unwrap(),
            Some(ProviderWireProtocol::ChatCompletions)
        ));
        assert!(matches!(
            normalized_draft_wire_protocol(
                ProviderKind::Deepseek,
                Some(ProviderWireProtocol::Responses)
            ),
            Err(DiscoveryError::UnsupportedWireProtocol(_))
        ));
        assert!(matches!(
            normalized_draft_wire_protocol(
                ProviderKind::Anthropic,
                Some(ProviderWireProtocol::ChatCompletions)
            ),
            Err(DiscoveryError::UnsupportedWireProtocol(_))
        ));
        assert_eq!(
            normalized_draft_wire_protocol(ProviderKind::Anthropic, None).unwrap(),
            Some(ProviderWireProtocol::AnthropicMessages)
        );
        assert_eq!(
            normalized_draft_wire_protocol(
                ProviderKind::OpenaiCompatible,
                Some(ProviderWireProtocol::GoogleGenerateContent)
            )
            .unwrap(),
            Some(ProviderWireProtocol::GoogleGenerateContent)
        );
        assert!(validate_draft_source_count(ProviderKind::Openai, 0).is_err());
        assert!(validate_draft_source_count(ProviderKind::Openai, 2).is_err());
        assert!(validate_draft_source_count(ProviderKind::Openai, 1).is_ok());
        assert!(validate_draft_source_count(ProviderKind::Ollama, 0).is_ok());
        assert!(validate_draft_source_count(ProviderKind::Vllm, 0).is_ok());
        assert!(validate_draft_source_count(ProviderKind::LmStudio, 0).is_ok());
    }

    #[test]
    fn automatic_setup_normalizes_protocol_base_paths_like_the_renderer() {
        assert_eq!(
            normalize_protocol_base_url(
                "https://relay.example/",
                Some(ProviderWireProtocol::ChatCompletions)
            )
            .unwrap(),
            "https://relay.example/v1"
        );
        assert_eq!(
            normalize_protocol_base_url(
                "https://relay.example",
                Some(ProviderWireProtocol::GoogleGenerateContent)
            )
            .unwrap(),
            "https://relay.example/v1beta"
        );
        assert_eq!(
            normalize_protocol_base_url(
                "https://relay.example/api/openai/",
                Some(ProviderWireProtocol::Responses)
            )
            .unwrap(),
            "https://relay.example/api/openai"
        );
    }

    #[test]
    fn automatic_setup_reuses_one_normalized_existing_provider_binding() {
        let configured = vec![ProviderConfig {
            id: "existing-keychain-provider".into(),
            kind: ProviderKind::Openai,
            label: "Existing OpenAI".into(),
            base_url: None,
            wire_protocol: None,
            default_model: "gpt-5".into(),
            enabled: true,
        }];

        let matched = unique_existing_provider(
            &configured,
            ProviderKind::Openai,
            "https://api.openai.com/",
            Some(ProviderWireProtocol::Responses),
        )
        .unwrap()
        .unwrap();

        assert_eq!(matched.id, "existing-keychain-provider");
        assert_ne!(
            matched.id,
            automatic_provider_id(&candidate_id(&["agent-openai"])).unwrap()
        );
        assert!(unique_existing_provider(
            &configured,
            ProviderKind::Openai,
            "https://api.openai.com/v1",
            Some(ProviderWireProtocol::ChatCompletions),
        )
        .unwrap()
        .is_none());

        let draft = existing_provider_revalidation_draft(
            matched.id.clone(),
            matched.kind.as_str().into(),
            "https://api.openai.com/v1".into(),
            Some(ProviderWireProtocol::Responses),
        );
        assert_eq!(
            draft.provider_id.as_deref(),
            Some("existing-keychain-provider")
        );
        assert!(draft.candidate_id.is_none());
        assert!(draft.secret.is_none());
    }

    #[test]
    fn automatic_setup_rejects_an_ambiguous_existing_provider_binding() {
        let provider = ProviderConfig {
            id: "first".into(),
            kind: ProviderKind::OpenaiCompatible,
            label: "First".into(),
            base_url: Some("https://relay.example".into()),
            wire_protocol: Some(ProviderWireProtocol::Responses),
            default_model: "gpt-5".into(),
            enabled: true,
        };
        let configured = vec![
            provider.clone(),
            ProviderConfig {
                id: "second".into(),
                base_url: Some("https://relay.example/v1/".into()),
                ..provider
            },
        ];

        assert!(matches!(
            unique_existing_provider(
                &configured,
                ProviderKind::OpenaiCompatible,
                "https://relay.example/v1",
                Some(ProviderWireProtocol::Responses),
            ),
            Err(DiscoveryError::Conflict)
        ));
    }

    #[test]
    fn candidate_sanitization_rejects_config_exfiltration_fields() {
        let base = ProviderCandidate {
            id: candidate_id(&["test"]),
            source: "codex".into(),
            source_label: "Codex".into(),
            agent_id: Some("codex".into()),
            schema_id: Some("codex-config-v1".into()),
            config_location: Some("~/.codex/config.toml".into()),
            kind: "openai-compatible".into(),
            label: "Reviewed relay".into(),
            base_url: Some("https://relay.example/v1".into()),
            wire_protocol: Some("responses".into()),
            model_hint: Some("model-1".into()),
            credential: CredentialPreview {
                source_type: "environment".into(),
                reference: Some("RELAY_API_KEY".into()),
                available: true,
                importable: true,
            },
            warnings: vec![],
        };
        assert!(validate_candidate(&base).is_ok());
        for invalid in [
            ProviderCandidate {
                base_url: Some("https://user:secret@relay.example/v1".into()),
                ..base.clone()
            },
            ProviderCandidate {
                base_url: Some("https://relay.example/v1?api_key=secret".into()),
                ..base.clone()
            },
            ProviderCandidate {
                model_hint: Some("sk-secret-model".into()),
                ..base.clone()
            },
            ProviderCandidate {
                label: "/Users/person/.codex/auth.json".into(),
                ..base.clone()
            },
            ProviderCandidate {
                config_location: Some("../../secret".into()),
                ..base.clone()
            },
            ProviderCandidate {
                credential: CredentialPreview {
                    reference: Some("NOT-A-VAR".into()),
                    ..base.credential.clone()
                },
                ..base.clone()
            },
        ] {
            assert!(validate_candidate(&invalid).is_err());
        }

        let unsupported_source = ProviderCandidate {
            id: candidate_id(&["unsupported-source"]),
            base_url: Some("http://192.168.1.20:15721/v1".into()),
            ..base.clone()
        };
        let isolated = finalize_candidates(vec![unsupported_source.clone(), base], None).unwrap();
        assert_eq!(isolated.len(), 1);
        assert_eq!(isolated[0].label, "Reviewed relay");
        assert!(finalize_candidates(vec![unsupported_source], None).is_err());
    }

    #[test]
    fn candidate_and_secret_revisions_bind_source_and_binding_without_serializing_secret() {
        let candidate = ProviderCandidate {
            id: candidate_id(&["source"]),
            source: "codex".into(),
            source_label: "Codex".into(),
            agent_id: Some("codex".into()),
            schema_id: Some("codex-auth-v1".into()),
            config_location: Some("~/.codex/auth.json".into()),
            kind: "openai".into(),
            label: "OpenAI".into(),
            base_url: Some("https://api.openai.com/v1".into()),
            wire_protocol: Some("responses".into()),
            model_hint: None,
            credential: CredentialPreview {
                source_type: "config-literal".into(),
                reference: Some("OPENAI_API_KEY".into()),
                available: true,
                importable: true,
            },
            warnings: vec![],
        };
        let fingerprint = candidate_fingerprint(&candidate).unwrap();
        let changed = ProviderCandidate {
            base_url: Some("https://relay.example/v1".into()),
            ..candidate.clone()
        };
        assert_ne!(fingerprint, candidate_fingerprint(&changed).unwrap());
        assert_ne!(
            secret_revision("first-secret"),
            secret_revision("second-secret")
        );
        assert!(!fingerprint.contains("first-secret"));
    }

    #[test]
    fn purges_expired_drafts_and_keeps_live_drafts() {
        let mut store = HashMap::new();
        let session = |created_at| ProviderDraftSession {
            created_at,
            kind: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            wire_protocol: Some(ProviderWireProtocol::Responses),
            candidate_id: None,
            provider_id: None,
            secret: None,
            candidate_fingerprint: None,
            candidate_secret_revision: None,
            checked_models: None,
        };
        store.insert(
            "expired".into(),
            session(Instant::now() - DRAFT_TTL - Duration::from_secs(1)),
        );
        store.insert("live".into(), session(Instant::now()));
        purge_expired(&mut store);
        assert!(!store.contains_key("expired"));
        assert!(store.contains_key("live"));
    }

    #[test]
    fn catalog_parser_normalizes_and_rejects_empty_payloads() {
        assert_eq!(
            model_ids(r#"{"data":[{"id":"z"},{"id":"a"},{"id":"a"}]}"#).unwrap(),
            vec!["a", "z"]
        );
        assert_eq!(
            model_ids(
                r#"{"models":[{"name":"models/gemini-2.5-pro"},{"name":"models/gemini-2.5-flash"}]}"#
            )
            .unwrap(),
            vec!["gemini-2.5-flash", "gemini-2.5-pro"]
        );
        assert!(matches!(
            model_ids(r#"{"data":[]}"#),
            Err(DiscoveryError::CatalogMalformed)
        ));
        assert!(matches!(
            model_ids("not-json"),
            Err(DiscoveryError::CatalogMalformed)
        ));
    }

    #[test]
    fn errors_serialize_with_stable_codes() {
        let json = serde_json::to_value(DiscoveryError::Http(401)).unwrap();
        assert_eq!(json["code"], "unauthorized");
        assert_eq!(
            serde_json::to_value(DiscoveryError::DraftExpired).unwrap()["code"],
            "draft-expired"
        );
        let request = serde_json::to_value(DiscoveryError::Request(
            "dns error for https://private.example/v1/models".into(),
        ))
        .unwrap();
        assert_eq!(request["code"], "endpoint-unreachable");
        assert_eq!(request["message"], "provider request failed");
        assert!(!request.to_string().contains("private.example"));
    }

    #[test]
    fn request_failure_causes_are_closed_and_sanitized() {
        for (message, expected) in [
            ("operation timed out", "timeout"),
            ("dns error: failed to lookup address", "dns"),
            ("certificate verify failed during tls", "tls"),
            ("client error (Connect)", "connect"),
            ("opaque transport failure", "other"),
        ] {
            assert_eq!(transport_failure_cause(message), expected);
        }
        assert_eq!(
            request_failure_cause(&discovery_request_error(
                ai_proxy::ProxyError::DisallowedHost
            )),
            "host-policy"
        );
        assert_eq!(
            request_failure_cause(&discovery_request_error(ai_proxy::ProxyError::Request(
                "dns error for https://private.example/v1/models".into(),
            ))),
            "dns"
        );
    }

    #[test]
    fn draft_store_is_bounded_and_take_is_single_use() {
        let mut store = drafts()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        store.clear();
        for index in 0..MAX_DRAFTS {
            store.insert(
                format!("draft-{index}"),
                ProviderDraftSession {
                    created_at: Instant::now(),
                    kind: "openai".into(),
                    base_url: "https://api.openai.com/v1".into(),
                    wire_protocol: Some(ProviderWireProtocol::Responses),
                    candidate_id: None,
                    provider_id: None,
                    secret: None,
                    candidate_fingerprint: None,
                    candidate_secret_revision: None,
                    checked_models: Some(vec!["model".into()]),
                },
            );
        }
        assert_eq!(store.len(), MAX_DRAFTS);
        drop(store);
        assert!(take_draft("draft-0").is_ok());
        assert!(matches!(
            take_draft("draft-0"),
            Err(DiscoveryError::DraftExpired)
        ));
        drafts()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }
}
