//! Provider key management, backed by the local file secret store.
//!
//! Secrets are stored via `commands::secret_store` (an owner-only JSON file),
//! **not** the OS keychain — see that module for the rationale and the security
//! trade-off. Keys are namespaced by `provider:{id}`. **No command in this
//! module returns the secret to JS.** `read_secret` is `pub(crate)` and used
//! only by the proxy (`ai_proxy.rs`) to inject the auth header inside Rust.

use serde::Serialize;

use crate::commands::secret_store;

/// Keychain-compatible account namespace, retained so pre-existing entries and
/// callers keep the same identifier shape.
fn account(provider_id: &str) -> String {
    format!("provider:{provider_id}")
}

/// Per-provider key status returned by `list_key_status`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub id: String,
    pub has_key: bool,
}

/// Errors from key management. Serializes to a plain string across IPC and
/// **never contains the secret**.
#[derive(Debug, thiserror::Error)]
pub enum KeyError {
    #[error("secret must not be empty")]
    EmptySecret,
    #[error("no key configured")]
    NotFound,
    #[error("secret store error: {0}")]
    Store(String),
}

impl Serialize for KeyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for KeyError {
    fn from(e: std::io::Error) -> Self {
        KeyError::Store(e.to_string())
    }
}

/// Read the secret for a provider. **Internal only** — used by the proxy to
/// inject the auth header. Never exposed as a command.
pub(crate) fn read_secret(provider_id: &str) -> Result<String, KeyError> {
    secret_store::get(&account(provider_id))?.ok_or(KeyError::NotFound)
}

fn set_key_inner(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    if secret.is_empty() {
        return Err(KeyError::EmptySecret);
    }
    secret_store::set(&account(provider_id), secret)?;
    Ok(())
}

fn key_status_inner(provider_id: &str) -> Result<bool, KeyError> {
    Ok(secret_store::exists(&account(provider_id))?)
}

/// Internal presence-only lookup for exact Cutout provider accounts.
pub(crate) fn has_key_exact(provider_id: &str) -> bool {
    key_status_inner(provider_id).unwrap_or(false)
}

pub(crate) fn store_imported_key(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    set_key_inner(provider_id, secret)
}

pub(crate) fn delete_imported_key(provider_id: &str) -> Result<(), KeyError> {
    delete_key_inner(provider_id)
}

fn delete_key_inner(provider_id: &str) -> Result<(), KeyError> {
    secret_store::delete(&account(provider_id))?;
    Ok(())
}

fn list_key_status_inner(provider_ids: Vec<String>) -> Vec<KeyStatus> {
    provider_ids
        .into_iter()
        .map(|id| {
            let has_key = key_status_inner(&id).unwrap_or(false);
            KeyStatus { id, has_key }
        })
        .collect()
}

/// Store (or replace) the secret for a provider.
#[tauri::command]
pub async fn set_key(provider_id: String, secret: String) -> Result<(), KeyError> {
    set_key_inner(&provider_id, &secret)
}

/// Whether a secret is configured for a provider. Returns `bool` only — the
/// secret value is never returned.
#[tauri::command]
pub async fn key_status(provider_id: String) -> Result<bool, KeyError> {
    key_status_inner(&provider_id)
}

/// Delete a provider's secret. Idempotent: a missing entry is treated as success.
#[tauri::command]
pub async fn delete_key(provider_id: String) -> Result<(), KeyError> {
    delete_key_inner(&provider_id)
}

/// Batch status for many providers (drives the settings list).
#[tauri::command]
pub async fn list_key_status(provider_ids: Vec<String>) -> Result<Vec<KeyStatus>, KeyError> {
    Ok(list_key_status_inner(provider_ids))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ensure_store() {
        secret_store::init_dir(
            std::env::temp_dir().join(format!("cutout-keys-test-{}", std::process::id())),
        );
    }

    #[test]
    fn set_status_read_delete_round_trip() {
        ensure_store();
        let id = format!("keys-rt-{}", std::process::id());
        set_key_inner(&id, "unit-test-secret").expect("set");
        assert!(key_status_inner(&id).expect("status"));
        assert_eq!(read_secret(&id).expect("read"), "unit-test-secret");
        delete_key_inner(&id).expect("delete");
        assert!(!key_status_inner(&id).expect("status after delete"));
        assert!(matches!(read_secret(&id), Err(KeyError::NotFound)));
    }

    #[test]
    fn empty_secret_is_rejected() {
        ensure_store();
        let err = set_key_inner("any", "").unwrap_err();
        assert!(matches!(err, KeyError::EmptySecret));
    }

    #[test]
    fn list_status_shape_matches_ids() {
        ensure_store();
        let out = list_key_status_inner(vec!["a".to_string(), "b".to_string()]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].id, "a");
        assert_eq!(out[1].id, "b");
    }

    #[test]
    fn key_error_serializes_to_string_without_secret() {
        let e = KeyError::Store("some backend failure".to_string());
        let json = serde_json::to_string(&e).unwrap();
        assert_eq!(json, "\"secret store error: some backend failure\"");
    }
}
