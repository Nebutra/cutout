//! OS credential-vault backed provider secret management.
//!
//! Secret values never cross native IPC. The renderer can write a secret or
//! query presence, while provider transport is the only reader.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use keyring::{Entry, Error as KeyringError};
use serde::Serialize;

const SERVICE: &str = "com.nebutra.cutout";

fn account(provider_id: &str) -> String {
    format!("provider:{provider_id}")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub id: String,
    pub has_key: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum KeyError {
    #[error("secret must not be empty")]
    EmptySecret,
    #[error("no key configured")]
    NotFound,
    #[error("credential vault is unavailable")]
    Keychain,
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
    fn from(error: KeyringError) -> Self {
        match error {
            KeyringError::NoEntry => Self::NotFound,
            _ => Self::Keychain,
        }
    }
}

fn entry_for(service: &str, provider_id: &str) -> Result<Entry, KeyError> {
    Entry::new(service, &account(provider_id)).map_err(KeyError::from)
}

fn entry(provider_id: &str) -> Result<Entry, KeyError> {
    entry_for(SERVICE, provider_id)
}

#[cfg(target_os = "macos")]
fn keychain_item_exists(service: &str, provider_id: &str) -> Result<bool, KeyError> {
    use security_framework::item::{ItemClass, ItemSearchOptions};
    use security_framework_sys::base::errSecItemNotFound;

    let mut query = ItemSearchOptions::new();
    query
        .class(ItemClass::generic_password())
        .service(service)
        .account(&account(provider_id))
        .load_attributes(true);
    match query.search() {
        Ok(items) => Ok(!items.is_empty()),
        Err(error) if error.code() == errSecItemNotFound => Ok(false),
        Err(_) => Err(KeyError::Keychain),
    }
}

fn secret_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_or_fetch(provider_id: &str) -> Result<Option<String>, KeyError> {
    let mut cache = secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(secret) = cache.get(provider_id) {
        return Ok(Some(secret.clone()));
    }
    let secret = match entry(provider_id)?.get_password() {
        Ok(secret) => Some(secret),
        Err(KeyringError::NoEntry) => None,
        Err(error) => return Err(KeyError::from(error)),
    };
    if let Some(secret) = &secret {
        cache.insert(provider_id.to_owned(), secret.clone());
    }
    Ok(secret)
}

pub(crate) fn read_secret(provider_id: &str) -> Result<String, KeyError> {
    cached_or_fetch(provider_id)?.ok_or(KeyError::NotFound)
}

fn set_key_inner(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    if secret.is_empty() {
        return Err(KeyError::EmptySecret);
    }
    entry(provider_id)?
        .set_password(secret)
        .map_err(KeyError::from)?;
    secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(provider_id.to_owned(), secret.to_owned());
    Ok(())
}

fn key_status_inner(provider_id: &str) -> Result<bool, KeyError> {
    #[cfg(target_os = "macos")]
    {
        return keychain_item_exists(SERVICE, provider_id);
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(cached_or_fetch(provider_id)?.is_some())
    }
}

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
    secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(provider_id);
    match entry(provider_id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(KeyError::from(error)),
    }
}

fn list_key_status_inner(provider_ids: Vec<String>) -> Vec<KeyStatus> {
    provider_ids
        .into_iter()
        .map(|id| KeyStatus {
            has_key: key_status_inner(&id).unwrap_or(false),
            id,
        })
        .collect()
}

#[tauri::command]
pub async fn set_key(provider_id: String, secret: String) -> Result<(), KeyError> {
    set_key_inner(&provider_id, &secret)
}

#[tauri::command]
pub async fn key_status(provider_id: String) -> Result<bool, KeyError> {
    key_status_inner(&provider_id)
}

#[tauri::command]
pub async fn delete_key(provider_id: String) -> Result<(), KeyError> {
    delete_key_inner(&provider_id)
}

#[tauri::command]
pub async fn list_key_status(provider_ids: Vec<String>) -> Result<Vec<KeyStatus>, KeyError> {
    Ok(list_key_status_inner(provider_ids))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_secret_is_rejected() {
        assert!(matches!(
            set_key_inner("any", ""),
            Err(KeyError::EmptySecret)
        ));
    }

    #[test]
    fn errors_do_not_serialize_backend_details() {
        assert_eq!(
            serde_json::to_string(&KeyError::Keychain).unwrap(),
            "\"credential vault is unavailable\""
        );
    }

    #[test]
    fn status_projection_preserves_ids() {
        let rows = list_key_status_inner(vec!["a".into(), "b".into()]);
        assert_eq!(
            rows.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
    }
}
