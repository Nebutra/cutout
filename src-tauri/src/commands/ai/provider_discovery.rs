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
use super::providers::{self, ProviderConfig, ProviderKind, ProviderWireProtocol};

const MAX_CONFIG_BYTES: u64 = 1024 * 1024;
const MAX_DRAFTS: usize = 32;
const DRAFT_TTL: Duration = Duration::from_secs(10 * 60);

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
        let mut state = serializer.serialize_struct("ProviderDiscoveryError", 2)?;
        state.serialize_field("code", code)?;
        state.serialize_field("message", &self.to_string())?;
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
        cursor.push(component.as_os_str());
        match std::fs::symlink_metadata(&cursor) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
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

#[cfg(unix)]
fn same_file_identity(left: &std::fs::Metadata, right: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(not(unix))]
fn same_file_identity(left: &std::fs::Metadata, right: &std::fs::Metadata) -> bool {
    left.len() == right.len()
        && left.modified().ok() == right.modified().ok()
        && left.file_type() == right.file_type()
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
    let mut file = std::fs::File::open(path)
        .map_err(|_| DiscoveryError::Read("failed to open config".into()))?;
    let opened = file
        .metadata()
        .map_err(|_| DiscoveryError::Read("failed to inspect opened config".into()))?;
    if !opened.is_file() || !same_file_identity(&before, &opened) {
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
    let after = exact_path_metadata(path)?
        .ok_or_else(|| DiscoveryError::Read("config disappeared during read".into()))?;
    if !same_file_identity(&opened, &after) {
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

fn codex_location(home: &Path) -> (PathBuf, &'static str) {
    match std::env::var_os("CODEX_HOME") {
        Some(path) => (PathBuf::from(path), "$CODEX_HOME"),
        None => (home.join(".codex"), "~/.codex"),
    }
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

fn codex_auth_source(
    codex_home: &Path,
    legacy_auth: Option<&Path>,
) -> Result<(Option<String>, bool), DiscoveryError> {
    let primary = codex_home.join("auth.json");
    if read_exact_config(&primary)?.is_some() {
        return Ok((codex_api_key_from(&primary)?, false));
    }
    match legacy_auth {
        Some(path) => Ok((codex_api_key_from(path)?, true)),
        None => Ok((None, false)),
    }
}

#[cfg(test)]
fn discover_codex_at(
    codex_home: &Path,
    display_root: &str,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    discover_codex_at_with_legacy(codex_home, display_root, None)
}

fn discover_codex_at_with_legacy(
    codex_home: &Path,
    display_root: &str,
    legacy_auth: Option<&Path>,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let config_location = format!("{display_root}/config.toml");
    let (auth_key, using_legacy_auth) = codex_auth_source(codex_home, legacy_auth)?;
    let auth_location = if using_legacy_auth {
        "~/.config/codex/auth.json".into()
    } else {
        format!("{display_root}/auth.json")
    };
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
    let mut has_openai_provider = false;
    if let Some(table) = table {
        for (provider_id, entry) in table {
            let Some(provider) = entry.as_table() else {
                continue;
            };
            let is_openai = provider_id == "openai";
            has_openai_provider |= is_openai;
            let env_key = provider.get("env_key").and_then(toml::Value::as_str);
            let env_available = env_key.and_then(std::env::var_os).is_some();
            let use_auth_file = is_openai && auth_key_available && !env_available;
            let base_url = provider
                .get("base_url")
                .and_then(toml::Value::as_str)
                .map(str::to_owned);
            let wire_protocol = normalize_wire(
                provider.get("wire_api").and_then(toml::Value::as_str),
            )?
            .or_else(|| {
                Some(
                    if is_openai {
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
                schema_id: Some(
                    if use_auth_file && using_legacy_auth {
                        "codex-config-legacy-auth-v1"
                    } else {
                        "codex-config-v1"
                    }
                    .into(),
                ),
                config_location: Some(if use_auth_file {
                    auth_location.clone()
                } else {
                    config_location.clone()
                }),
                kind: if is_openai {
                    "openai".into()
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
            schema_id: Some(
                if using_legacy_auth {
                    "codex-legacy-auth-v1"
                } else {
                    "codex-auth-v1"
                }
                .into(),
            ),
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
    discover_codex_at_with_legacy(
        &codex_home,
        display_root,
        Some(&home.join(".config/codex/auth.json")),
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

fn discover_environment() -> Vec<ProviderCandidate> {
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
    definitions
        .into_iter()
        .filter_map(|(env, kind, label, base, wire)| {
            std::env::var_os(env).map(|_| ProviderCandidate {
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
        .collect()
}

fn discover_cutout_keychain<R: Runtime>(app: &AppHandle<R>) -> Vec<ProviderCandidate> {
    let Ok(path) = app
        .path()
        .app_config_dir()
        .map(|dir| dir.join("providers.json"))
    else {
        return vec![];
    };
    let Ok(Some(raw)) = read_exact_config(&path) else {
        return vec![];
    };
    let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) else {
        return vec![];
    };
    rows.into_iter()
        .filter_map(|row| {
            let id = row.get("id")?.as_str()?;
            if !keys::has_key_exact(id) {
                return None;
            }
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
        })
        .collect()
}

fn cutout_source_id<R: Runtime>(
    app: &AppHandle<R>,
    selected_candidate_id: &str,
) -> Result<String, DiscoveryError> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|error| DiscoveryError::Read(error.to_string()))?
        .join("providers.json");
    let raw = read_exact_config(&path)?.ok_or(DiscoveryError::CandidateMissing)?;
    let rows: Vec<serde_json::Value> =
        serde_json::from_str(&raw).map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    rows.into_iter()
        .find_map(|row| {
            let id = row.get("id")?.as_str()?;
            (candidate_id(&["cutout-keychain", id]) == selected_candidate_id).then(|| id.to_owned())
        })
        .ok_or(DiscoveryError::CandidateMissing)
}

#[tauri::command]
pub async fn discover_provider_candidates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let home = app.path().home_dir().map_err(|_| DiscoveryError::Home)?;
    let mut candidates = discover_codex(&home)?;
    candidates.extend(discover_claude(&home)?);
    candidates.extend(agent_credentials::discover(&home)?);
    candidates.extend(discover_environment());
    candidates.extend(discover_cutout_keychain(&app));
    for candidate in &candidates {
        validate_candidate(candidate)?;
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
            let legacy = home.join(".config/codex/auth.json");
            let primary = codex_home.join("auth.json");
            let source = if candidate
                .schema_id
                .as_deref()
                .is_some_and(|schema| schema.contains("legacy-auth"))
            {
                &legacy
            } else {
                &primary
            };
            codex_api_key_from(source)?.ok_or(DiscoveryError::CandidateMissing)
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
    let effective_wire = provider
        .kind
        .effective_wire_protocol(provider.wire_protocol)
        .map_err(DiscoveryError::UnsupportedWireProtocol)?;
    let effective_base = provider
        .base_url
        .as_deref()
        .or_else(|| ai_proxy::default_base_url(provider.kind));
    if provider.kind.as_str() != supplied_kind
        || effective_base != Some(supplied_base_url)
        || effective_wire != supplied_wire_protocol
    {
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
        let secret = if candidate.source == "cutout-keychain" {
            let source_id = cutout_source_id(app, id)?;
            keys::read_secret(&source_id)
                .map_err(|error| DiscoveryError::Keychain(error.to_string()))?
        } else {
            let home = app.path().home_dir().map_err(|_| DiscoveryError::Home)?;
            candidate_secret(candidate, &home)?
        };
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
    // supported generation protocols do not share a standardized no-cost
    // OPTIONS/HEAD probe, and Check connection must never trigger generation.
    // Runtime viability is enforced locally by the closed kind/protocol matrix,
    // protocol-specific auth, URL normalization, and exhaustive SDK adapters.
    let secret = resolve_draft_secret(app, draft).await?;
    let url = format!("{}/models", draft.base_url.trim_end_matches('/'));
    let response = ai_proxy::request_with_secret(
        &draft.kind,
        draft.wire_protocol,
        &url,
        "GET",
        Default::default(),
        None,
        &secret,
    )
    .await
    .map_err(|error| DiscoveryError::Request(error.to_string()))?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tempdir() -> std::io::Result<TempDir> {
        tempfile::tempdir_in(std::env::temp_dir().canonicalize()?)
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
    fn codex_legacy_auth_is_used_only_when_primary_auth_is_absent() {
        let home = tempdir().unwrap();
        let codex_home = home.path().join(".codex");
        let legacy = home.path().join(".config/codex/auth.json");
        std::fs::create_dir(&codex_home).unwrap();
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, r#"{"OPENAI_API_KEY":"legacy-secret"}"#).unwrap();

        let rows = discover_codex_at_with_legacy(&codex_home, "~/.codex", Some(&legacy)).unwrap();
        assert_eq!(rows[0].schema_id.as_deref(), Some("codex-legacy-auth-v1"));
        assert_eq!(
            candidate_secret_at(&rows[0], home.path(), &codex_home).unwrap(),
            "legacy-secret"
        );

        std::fs::write(
            codex_home.join("auth.json"),
            r#"{"tokens":{"access_token":"oauth"}}"#,
        )
        .unwrap();
        assert!(
            discover_codex_at_with_legacy(&codex_home, "~/.codex", Some(&legacy))
                .unwrap()
                .is_empty()
        );
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
wire_api = "legacy-completions"
"#,
        )
        .unwrap();

        assert!(matches!(
            discover_codex_at(&home.path().join(".codex"), "~/.codex"),
            Err(DiscoveryError::UnsupportedWireProtocol(value)) if value == "legacy-completions"
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
