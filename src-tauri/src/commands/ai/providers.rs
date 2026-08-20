//! Non-secret provider config persistence.
//!
//! The provider *list* (labels, kinds, base URLs, probed model catalogs) is
//! non-sensitive and stored as JSON in the Tauri app-config dir. **Secrets are
//! never here** — they live only in the OS keychain (see `keys.rs`). The `id`
//! of each `ProviderConfig` is the keychain account suffix.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const CONFIG_FILE: &str = "providers.json";
pub const CC_SWITCH_BASE_URL: &str = "http://127.0.0.1:15721/v1";

/// Provider kinds. Serializes as the kebab-cased tag the TS layer uses
/// Native providers plus the audited OpenAI-compatible profiles exposed by the
/// TypeScript provider registry. Unknown future kinds fail closed at this
/// persistence boundary until Rust transport policy is added.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    Anthropic,
    Openai,
    Google,
    Gateway,
    OpenaiCompatible,
    CcSwitch,
    Dashscope,
    Deepseek,
    Zhipu,
    Moonshot,
    Volcengine,
    Siliconflow,
    Openrouter,
    Together,
    Groq,
    Fireworks,
    Xai,
    Mistral,
    Ollama,
    Vllm,
    LmStudio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderWireProtocol {
    Responses,
    ChatCompletions,
    AnthropicMessages,
    GoogleGenerateContent,
}

impl ProviderWireProtocol {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Responses => "responses",
            Self::ChatCompletions => "chat-completions",
            Self::AnthropicMessages => "anthropic-messages",
            Self::GoogleGenerateContent => "google-generate-content",
        }
    }
}

impl ProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Openai => "openai",
            Self::Google => "google",
            Self::Gateway => "gateway",
            Self::OpenaiCompatible => "openai-compatible",
            Self::CcSwitch => "cc-switch",
            Self::Dashscope => "dashscope",
            Self::Deepseek => "deepseek",
            Self::Zhipu => "zhipu",
            Self::Moonshot => "moonshot",
            Self::Volcengine => "volcengine",
            Self::Siliconflow => "siliconflow",
            Self::Openrouter => "openrouter",
            Self::Together => "together",
            Self::Groq => "groq",
            Self::Fireworks => "fireworks",
            Self::Xai => "xai",
            Self::Mistral => "mistral",
            Self::Ollama => "ollama",
            Self::Vllm => "vllm",
            Self::LmStudio => "lm-studio",
        }
    }

    pub fn default_wire_protocol(self) -> Option<ProviderWireProtocol> {
        match self {
            Self::Openai | Self::CcSwitch => Some(ProviderWireProtocol::Responses),
            Self::Anthropic => Some(ProviderWireProtocol::AnthropicMessages),
            Self::Google => Some(ProviderWireProtocol::GoogleGenerateContent),
            Self::Gateway => None,
            _ => Some(ProviderWireProtocol::ChatCompletions),
        }
    }

    pub fn supports_wire_protocol(self, protocol: ProviderWireProtocol) -> bool {
        use ProviderWireProtocol::*;
        match self {
            Self::Openai | Self::CcSwitch => matches!(protocol, Responses | ChatCompletions),
            Self::Anthropic => protocol == AnthropicMessages,
            Self::Google => protocol == GoogleGenerateContent,
            Self::OpenaiCompatible => true,
            Self::Gateway => false,
            _ => protocol == ChatCompletions,
        }
    }

    pub fn effective_wire_protocol(
        self,
        selected: Option<ProviderWireProtocol>,
    ) -> Result<Option<ProviderWireProtocol>, String> {
        let protocol = selected.or_else(|| self.default_wire_protocol());
        match protocol {
            Some(value) if self.supports_wire_protocol(value) => Ok(Some(value)),
            None if self == Self::Gateway => Ok(None),
            Some(value) => Err(format!(
                "{} is not supported for {}",
                value.as_str(),
                self.as_str()
            )),
            None => Err(format!("wire protocol is required for {}", self.as_str())),
        }
    }
}

/// Days from 1970-01-01 to the civil date `y-m-d` (Howard Hinnant's
/// `days_from_civil`, inverted here to `civil_from_days`). Pure integer math —
/// the app has no date crate, and `ProviderCatalog.fetchedAt` must round-trip
/// through the web layer's `z.string().datetime()`.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Format epoch seconds as `YYYY-MM-DDTHH:MM:SSZ`.
pub(crate) fn iso_timestamp_from_epoch_secs(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60,
    )
}

/// Wall-clock now as an ISO-8601 timestamp; falls back to the epoch if the
/// system clock is before 1970 (a catalog is still better than none).
pub(crate) fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);
    iso_timestamp_from_epoch_secs(secs)
}

/// Layer 2 — the models a connection advertises, captured by the last
/// successful credential probe. Persisted beside the connection so it survives
/// a browser-storage wipe.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalog {
    pub models: Vec<String>,
    /// ISO-8601 timestamp of the probe that produced `models`.
    pub fetched_at: String,
}

/// Layer 1 — a user-configured provider *connection*. Contains **no secret**
/// (the key is referenced indirectly by `id` via the keychain) and **no model
/// choice** (that is layer 3, owned by the web layer's capability bindings).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// Stable uuid; also the keychain entry account (`provider:{id}`).
    pub id: String,
    pub kind: ProviderKind,
    /// User-facing label ("My Anthropic", "Team Gateway").
    pub label: String,
    /// Required for `openai-compatible`; optional override otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wire_protocol: Option<ProviderWireProtocol>,
    /// Layer 2 catalog. `None` = never probed, or the endpoint serves none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog: Option<ProviderCatalog>,
    /// Deprecated: a connection does not own a model. Kept so pre-v0.1.25
    /// `providers.json` still parses and can seed the one-time binding
    /// migration; never written for new providers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    pub enabled: bool,
}

/// Errors from provider-config persistence. Serializes to a plain string.
#[derive(Debug, thiserror::Error)]
pub enum ProvidersError {
    #[error("could not resolve app config dir: {0}")]
    ConfigDir(String),
    #[error("failed to read provider config: {0}")]
    Read(String),
    #[error("failed to write provider config: {0}")]
    Write(String),
    #[error("invalid provider config json: {0}")]
    Parse(String),
    #[error("unsupported provider wire protocol: {0}")]
    InvalidProtocol(String),
}

impl Serialize for ProvidersError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Resolve `<app-config-dir>/providers.json`, ensuring the dir exists.
fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, ProvidersError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| ProvidersError::ConfigDir(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| ProvidersError::ConfigDir(e.to_string()))?;
    Ok(dir.join(CONFIG_FILE))
}

pub(crate) fn load_providers_sync<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Vec<ProviderConfig>, ProvidersError> {
    let path = config_path(app)?;
    match std::fs::read(&path) {
        Ok(bytes) => validate_providers(
            serde_json::from_slice(&bytes).map_err(|e| ProvidersError::Parse(e.to_string()))?,
        ),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(ProvidersError::Read(e.to_string())),
    }
}

pub(crate) fn save_providers_atomic<R: Runtime>(
    app: &AppHandle<R>,
    providers: &[ProviderConfig],
) -> Result<(), ProvidersError> {
    validate_provider_slice(providers)?;
    let path = config_path(app)?;
    let temporary = path.with_extension(format!("json.{}.tmp", uuid::Uuid::new_v4()));
    let json =
        serde_json::to_vec_pretty(providers).map_err(|e| ProvidersError::Parse(e.to_string()))?;
    std::fs::write(&temporary, json).map_err(|e| ProvidersError::Write(e.to_string()))?;
    if let Err(error) = std::fs::rename(&temporary, &path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(ProvidersError::Write(error.to_string()));
    }
    Ok(())
}

/// Load the persisted provider list. A missing file yields an empty list.
#[tauri::command]
pub async fn load_providers<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ProviderConfig>, ProvidersError> {
    let path = config_path(&app)?;
    let raw = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(ProvidersError::Read(e.to_string())),
    };
    validate_providers(
        serde_json::from_slice(&raw).map_err(|e| ProvidersError::Parse(e.to_string()))?,
    )
}

/// Persist the full provider list (overwrites). Secrets are never included.
#[tauri::command]
pub async fn save_providers<R: Runtime>(
    app: AppHandle<R>,
    providers: Vec<ProviderConfig>,
) -> Result<(), ProvidersError> {
    validate_provider_slice(&providers)?;
    let path = config_path(&app)?;
    let json =
        serde_json::to_vec_pretty(&providers).map_err(|e| ProvidersError::Parse(e.to_string()))?;
    tokio::fs::write(&path, &json)
        .await
        .map_err(|e| ProvidersError::Write(e.to_string()))
}

fn validate_provider_slice(providers: &[ProviderConfig]) -> Result<(), ProvidersError> {
    for provider in providers {
        if provider.kind != ProviderKind::Gateway && provider.wire_protocol.is_none() {
            return Err(ProvidersError::InvalidProtocol(format!(
                "wire protocol is required for {}",
                provider.kind.as_str()
            )));
        }
        provider
            .kind
            .effective_wire_protocol(provider.wire_protocol)
            .map_err(ProvidersError::InvalidProtocol)?;
    }
    Ok(())
}

fn validate_providers(
    providers: Vec<ProviderConfig>,
) -> Result<Vec<ProviderConfig>, ProvidersError> {
    validate_provider_slice(&providers)?;
    Ok(providers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_serializes_kebab_case() {
        assert_eq!(
            serde_json::to_string(&ProviderKind::OpenaiCompatible).unwrap(),
            "\"openai-compatible\""
        );
        assert_eq!(
            serde_json::to_string(&ProviderKind::Anthropic).unwrap(),
            "\"anthropic\""
        );
        assert_eq!(
            serde_json::to_string(&ProviderKind::Gateway).unwrap(),
            "\"gateway\""
        );
        assert_eq!(
            serde_json::to_string(&ProviderKind::CcSwitch).unwrap(),
            "\"cc-switch\""
        );
    }

    #[test]
    fn config_round_trips_camel_case_and_omits_absent_base_url() {
        let cfg = ProviderConfig {
            id: "abc".to_string(),
            kind: ProviderKind::Anthropic,
            label: "My Anthropic".to_string(),
            base_url: None,
            wire_protocol: Some(ProviderWireProtocol::AnthropicMessages),
            catalog: Some(ProviderCatalog {
                models: vec!["claude-sonnet-4-6".to_string()],
                fetched_at: "2026-08-20T00:00:00Z".to_string(),
            }),
            default_model: None,
            enabled: true,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"catalog\":{\"models\":[\"claude-sonnet-4-6\"]"));
        assert!(
            !json.contains("defaultModel"),
            "a connection must not serialize a model choice"
        );
        assert!(!json.contains("baseUrl"), "absent base_url must be omitted");
        assert!(json.contains("\"wireProtocol\":\"anthropic-messages\""));

        let back: ProviderConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "abc");
        assert_eq!(back.kind, ProviderKind::Anthropic);
        assert_eq!(
            back.catalog.as_ref().map(|catalog| catalog.models.as_slice()),
            Some(["claude-sonnet-4-6".to_string()].as_slice())
        );
        assert!(back.enabled);
    }

    #[test]
    fn config_parses_pre_catalog_files_and_keeps_the_legacy_model_for_migration() {
        // A `providers.json` written before the three-layer split: no catalog,
        // a required defaultModel. It must still load, and the legacy model must
        // survive so the web layer can seed a `text` binding from it exactly once.
        let json = r#"{
            "id":"legacy","kind":"anthropic","label":"My Anthropic",
            "wireProtocol":"anthropic-messages",
            "defaultModel":"claude-sonnet-4-6","enabled":true
        }"#;
        let cfg: ProviderConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.default_model.as_deref(), Some("claude-sonnet-4-6"));
        assert!(cfg.catalog.is_none());
    }

    #[test]
    fn iso_timestamps_format_epoch_seconds_without_a_date_crate() {
        assert_eq!(iso_timestamp_from_epoch_secs(0), "1970-01-01T00:00:00Z");
        // 2026-08-20T13:45:07Z — a leap-year-adjacent date past 2000.
        assert_eq!(
            iso_timestamp_from_epoch_secs(1_787_233_507),
            "2026-08-20T13:45:07Z"
        );
        // 2024-02-29 proves the leap-day branch.
        assert_eq!(
            iso_timestamp_from_epoch_secs(1_709_164_800),
            "2024-02-29T00:00:00Z"
        );
    }

    #[test]
    fn config_parses_incoming_camel_case_base_url() {
        let json = r#"{
            "id":"x","kind":"openai-compatible","label":"Local",
            "baseUrl":"https://host/v1","wireProtocol":"chat-completions",
            "defaultModel":"m","enabled":false
        }"#;
        let cfg: ProviderConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.base_url.as_deref(), Some("https://host/v1"));
        assert_eq!(cfg.kind, ProviderKind::OpenaiCompatible);
    }

    #[test]
    fn wire_protocol_values_round_trip_without_changing_old_strings() {
        for (protocol, expected) in [
            (ProviderWireProtocol::Responses, "responses"),
            (ProviderWireProtocol::ChatCompletions, "chat-completions"),
            (
                ProviderWireProtocol::AnthropicMessages,
                "anthropic-messages",
            ),
            (
                ProviderWireProtocol::GoogleGenerateContent,
                "google-generate-content",
            ),
        ] {
            assert_eq!(
                serde_json::to_string(&protocol).unwrap(),
                format!("\"{expected}\"")
            );
        }
    }

    #[test]
    fn protocol_defaults_and_combinations_are_explicit() {
        assert_eq!(
            ProviderKind::Openai.effective_wire_protocol(None).unwrap(),
            Some(ProviderWireProtocol::Responses)
        );
        assert_eq!(
            ProviderKind::CcSwitch
                .effective_wire_protocol(None)
                .unwrap(),
            Some(ProviderWireProtocol::Responses)
        );
        assert!(ProviderKind::CcSwitch
            .effective_wire_protocol(Some(ProviderWireProtocol::ChatCompletions))
            .is_ok());
        assert!(ProviderKind::CcSwitch
            .effective_wire_protocol(Some(ProviderWireProtocol::AnthropicMessages))
            .is_err());
        assert_eq!(
            ProviderKind::OpenaiCompatible
                .effective_wire_protocol(None)
                .unwrap(),
            Some(ProviderWireProtocol::ChatCompletions)
        );
        assert_eq!(
            ProviderKind::Anthropic
                .effective_wire_protocol(None)
                .unwrap(),
            Some(ProviderWireProtocol::AnthropicMessages)
        );
        assert_eq!(
            ProviderKind::Google.effective_wire_protocol(None).unwrap(),
            Some(ProviderWireProtocol::GoogleGenerateContent)
        );
        assert!(ProviderKind::Deepseek
            .effective_wire_protocol(Some(ProviderWireProtocol::Responses))
            .is_err());
        assert!(ProviderKind::Gateway
            .effective_wire_protocol(Some(ProviderWireProtocol::ChatCompletions))
            .is_err());
    }

    #[test]
    fn persisted_configs_reject_unsupported_combinations() {
        let invalid = ProviderConfig {
            id: "p".to_string(),
            kind: ProviderKind::Deepseek,
            label: "DeepSeek".to_string(),
            base_url: None,
            wire_protocol: Some(ProviderWireProtocol::AnthropicMessages),
            catalog: Some(ProviderCatalog {
                models: vec!["m".to_string()],
                fetched_at: "2026-08-20T00:00:00Z".to_string(),
            }),
            default_model: None,
            enabled: true,
        };
        assert!(matches!(
            validate_provider_slice(&[invalid]),
            Err(ProvidersError::InvalidProtocol(_))
        ));
    }

    #[test]
    fn persisted_non_gateway_configs_require_an_explicit_protocol() {
        let missing = ProviderConfig {
            id: "p".to_string(),
            kind: ProviderKind::Openai,
            label: "OpenAI".to_string(),
            base_url: None,
            wire_protocol: None,
            catalog: Some(ProviderCatalog {
                models: vec!["gpt-5.4".to_string()],
                fetched_at: "2026-08-20T00:00:00Z".to_string(),
            }),
            default_model: None,
            enabled: true,
        };
        assert!(matches!(
            validate_provider_slice(&[missing]),
            Err(ProvidersError::InvalidProtocol(_))
        ));
    }
}
