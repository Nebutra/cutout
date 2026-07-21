//! Sanitized discovery of provider metadata from exact, supported host locations.
//! Secret values are inspected only for presence and never serialized to the WebView.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

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
    #[error("keychain import failed: {0}")]
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
            Self::Conflict => "conflict",
            Self::Persistence(_) => "persistence-failed",
        };
        let mut state = serializer.serialize_struct("ProviderDiscoveryError", 2)?;
        state.serialize_field("code", code)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

fn candidate_id(parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part.as_bytes());
        digest.update([0]);
    }
    format!("provider-candidate:{:x}", digest.finalize())
}

fn read_exact_config(path: &Path) -> Result<Option<String>, DiscoveryError> {
    if let Some(parent) = path.parent() {
        if std::fs::symlink_metadata(parent)
            .map(|value| value.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err(DiscoveryError::Symlink(parent.display().to_string()));
        }
    }
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(DiscoveryError::Read(error.to_string())),
    };
    if metadata.file_type().is_symlink() {
        return Err(DiscoveryError::Symlink(path.display().to_string()));
    }
    if !metadata.is_file() {
        return Ok(None);
    }
    if metadata.len() > MAX_CONFIG_BYTES {
        return Err(DiscoveryError::TooLarge(path.display().to_string()));
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|error| DiscoveryError::Read(error.to_string()))
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

fn discover_codex(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let codex_home = std::env::var_os("CODEX_HOME").map(PathBuf::from);
    let config_location = if codex_home.is_some() {
        "$CODEX_HOME/config.toml"
    } else {
        "~/.codex/config.toml"
    };
    let path = codex_home
        .unwrap_or_else(|| home.join(".codex"))
        .join("config.toml");
    let Some(raw) = read_exact_config(&path)? else {
        return Ok(vec![]);
    };
    let value: toml::Value = toml::from_str(&raw)
        .map_err(|error| DiscoveryError::Parse(format!("Codex config: {error}")))?;
    let model_hint = value
        .get("model")
        .and_then(toml::Value::as_str)
        .map(str::to_owned);
    let selected = value.get("model_provider").and_then(toml::Value::as_str);
    let Some(table) = value.get("model_providers").and_then(toml::Value::as_table) else {
        return Ok(vec![]);
    };
    let mut out = Vec::new();
    for (provider_id, entry) in table {
        let Some(provider) = entry.as_table() else {
            continue;
        };
        let env_key = provider.get("env_key").and_then(toml::Value::as_str);
        let base_url = provider
            .get("base_url")
            .and_then(toml::Value::as_str)
            .map(str::to_owned);
        let wire_protocol = normalize_wire(provider.get("wire_api").and_then(toml::Value::as_str))?;
        let mut warnings = Vec::new();
        if provider.contains_key("experimental_bearer_token") || provider.contains_key("auth") {
            warnings.push("Command-backed or session authentication is not importable.".into());
        }
        let label = provider
            .get("name")
            .and_then(toml::Value::as_str)
            .unwrap_or(provider_id);
        let reference = env_key.map(str::to_owned);
        let available = env_key.and_then(std::env::var_os).is_some();
        out.push(ProviderCandidate {
            id: candidate_id(&["codex", provider_id, base_url.as_deref().unwrap_or("")]),
            source: "codex".into(),
            source_label: "Codex".into(),
            config_location: Some(config_location.into()),
            kind: if provider_id == "openai" {
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
                source_type: if env_key.is_some() {
                    "environment"
                } else {
                    "none"
                }
                .into(),
                reference,
                available,
                importable: available,
            },
            warnings,
        });
    }
    Ok(out)
}

fn discover_claude(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let path = home.join(".claude").join("settings.json");
    let Some(raw) = read_exact_config(&path)? else {
        return Ok(vec![]);
    };
    let value: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| DiscoveryError::Parse(format!("Claude settings: {error}")))?;
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
    if base_url.is_none() && api_key.is_none() && auth_token.is_none() {
        return Ok(vec![]);
    }
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
    Ok(vec![ProviderCandidate {
        id: candidate_id(&["claude", base_url.as_deref().unwrap_or("")]),
        source: "claude".into(),
        source_label: "Claude Code".into(),
        config_location: Some("~/.claude/settings.json".into()),
        kind: "anthropic".into(),
        label: "Claude Code Anthropic".into(),
        base_url,
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
    }])
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
                source_label: "Cutout Keychain".into(),
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
                    reference: Some("Cutout provider credential".into()),
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
    candidates.extend(discover_environment());
    candidates.extend(discover_cutout_keychain(&app));
    let mut seen = HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.id.clone()));
    candidates.sort_by(|a, b| {
        (a.source.as_str(), a.label.as_str()).cmp(&(b.source.as_str(), b.label.as_str()))
    });
    Ok(candidates)
}

fn candidate_secret(candidate: &ProviderCandidate, home: &Path) -> Result<String, DiscoveryError> {
    match (
        candidate.source.as_str(),
        candidate.credential.reference.as_deref(),
    ) {
        ("environment" | "codex", Some(name)) => {
            std::env::var(name).map_err(|_| DiscoveryError::CandidateMissing)
        }
        ("claude", Some(name)) if candidate.credential.source_type == "environment" => {
            std::env::var(name).map_err(|_| DiscoveryError::CandidateMissing)
        }
        ("claude", Some("ANTHROPIC_API_KEY")) => {
            let path = home.join(".claude/settings.json");
            let raw = read_exact_config(&path)?.ok_or(DiscoveryError::CandidateMissing)?;
            let value: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|error| DiscoveryError::Parse(format!("Claude settings: {error}")))?;
            value
                .get("env")
                .and_then(|env| env.get("ANTHROPIC_API_KEY"))
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .ok_or(DiscoveryError::CandidateMissing)
        }
        _ => Err(DiscoveryError::NotImportable),
    }
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
pub async fn create_provider_draft(
    input: CreateDraftInput,
) -> Result<DraftSummary, DiscoveryError> {
    let kind: ProviderKind = serde_json::from_value(serde_json::Value::String(input.kind.clone()))
        .map_err(|error| DiscoveryError::Parse(error.to_string()))?;
    let wire_protocol = normalized_draft_wire_protocol(kind, input.wire_protocol)?;
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
            checked_models: None,
        },
    );
    Ok(DraftSummary {
        draft_id,
        expires_in_seconds: DRAFT_TTL.as_secs(),
    })
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
        if candidate.source == "cutout-keychain" {
            let source_id = cutout_source_id(app, id)?;
            return keys::read_secret(&source_id)
                .map_err(|error| DiscoveryError::Keychain(error.to_string()));
        }
        let home = app.path().home_dir().map_err(|_| DiscoveryError::Home)?;
        return candidate_secret(candidate, &home);
    }
    if let Some(id) = &draft.provider_id {
        return keys::read_secret(id).map_err(|error| DiscoveryError::Keychain(error.to_string()));
    }
    if matches!(draft.kind.as_str(), "ollama" | "vllm" | "lm-studio") {
        return Ok(String::new());
    }
    Err(DiscoveryError::CandidateMissing)
}

async fn check_draft<R: Runtime>(
    app: &AppHandle<R>,
    draft: &ProviderDraftSession,
) -> Result<Vec<String>, DiscoveryError> {
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
    match response.status {
        200..=299 => model_ids(&response.body),
        401 | 403 => Err(DiscoveryError::Http(response.status)),
        404 | 405 => Err(DiscoveryError::CatalogUnsupported),
        status => Err(DiscoveryError::Http(status)),
    }
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
        Ok(models) => {
            current.checked_models = Some(models.clone());
            Ok(ProviderProbeResult { models })
        }
        Err(DiscoveryError::CatalogUnsupported) => {
            current.checked_models = Some(Vec::new());
            Err(DiscoveryError::CatalogUnsupported)
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
    use tempfile::tempdir;

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
        let rows = discover_codex(home.path()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].wire_protocol.as_deref(), Some("responses"));
        let json = serde_json::to_string(&rows).unwrap();
        assert!(json.contains("CUTOUT_TEST_NEVER_SET"));
        assert!(!json.contains("apiKey"));
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
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].credential.source_type, "config-literal");
        assert!(rows[0].credential.importable);
        let json = serde_json::to_string(&rows).unwrap();
        assert!(!json.contains("literal-secret-must-not-cross-ipc"));
        assert!(!json.contains("echo must-not-run"));

        std::fs::write(
            home.path().join(".claude/settings.json"),
            r#"{"apiKeyHelper":"echo must-not-run"}"#,
        )
        .unwrap();
        assert!(discover_claude(home.path()).unwrap().is_empty());
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
            discover_codex(home.path()),
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
            discover_codex(home.path()),
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
