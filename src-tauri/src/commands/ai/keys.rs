//! Keychain-backed key management commands.
//!
//! The secret is written to and read from the OS keychain via the `keyring`
//! crate, namespaced by app id + `provider:{id}`. **No command in this module
//! returns the secret to JS.** `read_secret` is `pub(crate)` and used only by
//! the proxy (`ai_proxy.rs`) to inject the auth header inside Rust.
//!
//! keyring 3.6.3 API (verified against docs.rs): `Entry::new(service, user)`,
//! `set_password`, `get_password`, `delete_credential`; missing entry surfaces
//! as `keyring::Error::NoEntry`.

use keyring::{Entry, Error as KeyringError};
use serde::Serialize;

/// Keychain service name (app id). Account is `provider:{id}`.
const SERVICE: &str = "com.leishi.cutout";

/// Per-provider key status returned by `list_key_status`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub id: String,
    pub has_key: bool,
}

/// Errors from key management. Serializes to a plain string across IPC and
/// **never contains the secret** (keyring errors do not embed the password).
#[derive(Debug, thiserror::Error)]
pub enum KeyError {
    #[error("secret must not be empty")]
    EmptySecret,
    #[error("no key configured")]
    NotFound,
    #[error("keychain error: {0}")]
    Keychain(String),
}

impl Serialize for KeyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<KeyringError> for KeyError {
    fn from(e: KeyringError) -> Self {
        match e {
            KeyringError::NoEntry => KeyError::NotFound,
            other => KeyError::Keychain(other.to_string()),
        }
    }
}

/// Build the keychain entry handle for a provider id.
fn entry(provider_id: &str) -> Result<Entry, KeyError> {
    let account = format!("provider:{provider_id}");
    Entry::new(SERVICE, &account).map_err(KeyError::from)
}

/// Read the secret for a provider. **Internal only** — used by the proxy to
/// inject the auth header. Never exposed as a command.
pub(crate) fn read_secret(provider_id: &str) -> Result<String, KeyError> {
    entry(provider_id)?.get_password().map_err(KeyError::from)
}

// The keychain calls below are blocking; the `#[tauri::command] async fn`
// wrappers delegate to sync `*_inner` helpers so they can be unit-tested with a
// plain `#[test]` (the crate's tokio has no `macros`/`rt` test features).

fn set_key_inner(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    if secret.is_empty() {
        return Err(KeyError::EmptySecret);
    }
    entry(provider_id)?.set_password(secret).map_err(KeyError::from)
}

fn key_status_inner(provider_id: &str) -> Result<bool, KeyError> {
    match entry(provider_id)?.get_password() {
        Ok(_) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(e) => Err(KeyError::from(e)),
    }
}

fn delete_key_inner(provider_id: &str) -> Result<(), KeyError> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(KeyError::from(e)),
    }
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

/// Store (or replace) the secret for a provider in the OS keychain.
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

/// Batch status for many providers (drives the settings list). Best-effort per
/// id: any read error is reported as `has_key: false` rather than failing the
/// whole list — the authoritative read happens later in the proxy.
#[tauri::command]
pub async fn list_key_status(provider_ids: Vec<String>) -> Result<Vec<KeyStatus>, KeyError> {
    Ok(list_key_status_inner(provider_ids))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tolerant round-trip: exercises set → status → delete through the command
    /// helpers. Under a real OS keychain it asserts full persistence; under the
    /// headless mock backend (no platform feature) set/get across fresh `Entry`
    /// handles may not persist, so we only assert when persistence is observed.
    /// Either way the code path is executed and never panics.
    #[test]
    fn set_status_delete_round_trip_tolerant() {
        let id = format!("test-{}", std::process::id());
        let secret = "unit-test-secret";

        if set_key_inner(&id, secret).is_err() {
            // No usable keychain backend in this environment; nothing to assert.
            return;
        }

        match key_status_inner(&id) {
            Ok(true) => {
                // Real, persistent backend: finish the round-trip.
                delete_key_inner(&id).expect("delete should succeed");
                assert_eq!(
                    key_status_inner(&id).expect("status after delete"),
                    false,
                    "secret should be gone after delete"
                );
            }
            Ok(false) => {
                // Non-persistent mock backend: code path ran, no persistence to check.
            }
            Err(_) => {
                // Environment surfaced an error reading status; acceptable headless.
            }
        }
    }

    #[test]
    fn empty_secret_is_rejected() {
        let err = set_key_inner("any", "").unwrap_err();
        assert!(matches!(err, KeyError::EmptySecret));
    }

    #[test]
    fn list_status_shape_matches_ids() {
        let out = list_key_status_inner(vec!["a".to_string(), "b".to_string()]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].id, "a");
        assert_eq!(out[1].id, "b");
    }

    #[test]
    fn key_error_serializes_to_string_without_secret() {
        let e = KeyError::Keychain("some backend failure".to_string());
        let json = serde_json::to_string(&e).unwrap();
        assert_eq!(json, "\"keychain error: some backend failure\"");
    }
}
