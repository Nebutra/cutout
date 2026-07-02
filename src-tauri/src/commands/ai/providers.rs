//! Non-secret provider config persistence.
//!
//! The provider *list* (labels, kinds, base URLs, default models) is
//! non-sensitive and stored as JSON in the Tauri app-config dir. **Secrets are
//! never here** — they live only in the OS keychain (see `keys.rs`). The `id`
//! of each `ProviderConfig` is the keychain account suffix.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const CONFIG_FILE: &str = "providers.json";

/// Provider kinds. Serializes as the kebab-cased tag the TS layer uses
/// (`anthropic`, `openai`, `google`, `gateway`, `openai-compatible`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    Anthropic,
    Openai,
    Google,
    Gateway,
    OpenaiCompatible,
}

/// A user-configured provider connection. Contains **no secret** — the key is
/// referenced indirectly by `id` via the keychain.
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
    /// Model slug (e.g. `claude-sonnet-4-6` or `anthropic/claude-sonnet-4-6`).
    pub default_model: String,
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
    serde_json::from_slice(&raw).map_err(|e| ProvidersError::Parse(e.to_string()))
}

/// Persist the full provider list (overwrites). Secrets are never included.
#[tauri::command]
pub async fn save_providers<R: Runtime>(
    app: AppHandle<R>,
    providers: Vec<ProviderConfig>,
) -> Result<(), ProvidersError> {
    let path = config_path(&app)?;
    let json = serde_json::to_vec_pretty(&providers)
        .map_err(|e| ProvidersError::Parse(e.to_string()))?;
    tokio::fs::write(&path, &json)
        .await
        .map_err(|e| ProvidersError::Write(e.to_string()))
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
    }

    #[test]
    fn config_round_trips_camel_case_and_omits_absent_base_url() {
        let cfg = ProviderConfig {
            id: "abc".to_string(),
            kind: ProviderKind::Anthropic,
            label: "My Anthropic".to_string(),
            base_url: None,
            default_model: "claude-sonnet-4-6".to_string(),
            enabled: true,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"defaultModel\":\"claude-sonnet-4-6\""));
        assert!(!json.contains("baseUrl"), "absent base_url must be omitted");

        let back: ProviderConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "abc");
        assert_eq!(back.kind, ProviderKind::Anthropic);
        assert!(back.enabled);
    }

    #[test]
    fn config_parses_incoming_camel_case_base_url() {
        let json = r#"{
            "id":"x","kind":"openai-compatible","label":"Local",
            "baseUrl":"https://host/v1","defaultModel":"m","enabled":false
        }"#;
        let cfg: ProviderConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.base_url.as_deref(), Some("https://host/v1"));
        assert_eq!(cfg.kind, ProviderKind::OpenaiCompatible);
    }
}
