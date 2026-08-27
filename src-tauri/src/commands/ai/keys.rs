//! OS credential-vault backed provider secret management.
//!
//! Secret values never cross native IPC. The renderer can write a secret or
//! query presence, while provider transport is the only reader.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use keyring::{Entry, Error as KeyringError};
use serde::Serialize;

const SERVICE: &str = "com.nebutra.cutout";
const COMMERCE_OPERATOR_SERVICE: &str = "com.nebutra.cutout.commerce-operator";

fn commerce_operator_vault_enabled() -> &'static AtomicBool {
    static ENABLED: AtomicBool = AtomicBool::new(false);
    &ENABLED
}

pub(crate) fn enable_commerce_operator_vault() {
    commerce_operator_vault_enabled().store(true, Ordering::SeqCst);
}

pub(crate) fn active_keychain_service() -> &'static str {
    if commerce_operator_vault_enabled().load(Ordering::SeqCst) {
        COMMERCE_OPERATOR_SERVICE
    } else {
        SERVICE
    }
}

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
    entry_for(active_keychain_service(), provider_id)
}

/// macOS credential storage, which deliberately never writes an item ACL.
///
/// `SecKeychainItemSetAccess` is a privileged *write*: macOS demands the login
/// keychain password on every call, while reading through an ACL that already
/// admits this app is silent. An ACL "migration" here therefore bought nothing
/// and cost a password prompt on every launch. The SecItem write path attaches
/// the access metadata a signed app needs for its own items — do not add one
/// back.
#[cfg(target_os = "macos")]
mod macos_vault {
    use core_foundation::base::TCFType;
    use security_framework::item::{ItemClass, ItemSearchOptions, Reference, SearchResult};
    use security_framework::os::macos::keychain_item::SecKeychainItem;
    use security_framework::os::macos::passwords::find_generic_password;
    use security_framework_sys::base::{errSecItemNotFound, errSecSuccess};
    use security_framework_sys::keychain_item::SecKeychainItemDelete;

    use super::{account, entry_for, KeyError};

    fn item_for(service: &str, provider_id: &str) -> Result<Option<SecKeychainItem>, KeyError> {
        let mut query = ItemSearchOptions::new();
        query
            .class(ItemClass::generic_password())
            .service(service)
            .account(&account(provider_id))
            .load_refs(true);
        match query.search() {
            Ok(mut rows) => match rows.pop() {
                Some(SearchResult::Ref(Reference::KeychainItem(item))) => Ok(Some(item)),
                _ => Err(KeyError::Keychain),
            },
            Err(error) if error.code() == errSecItemNotFound => Ok(None),
            Err(_) => Err(KeyError::Keychain),
        }
    }

    pub(super) fn store(service: &str, provider_id: &str, secret: &str) -> Result<(), KeyError> {
        entry_for(service, provider_id)?
            .set_password(secret)
            .map_err(KeyError::from)
    }

    pub(super) fn read(service: &str, provider_id: &str) -> Result<Option<String>, KeyError> {
        let account = account(provider_id);
        match find_generic_password(None, service, &account) {
            Ok((secret, _item)) => {
                let secret =
                    String::from_utf8(secret.to_owned()).map_err(|_| KeyError::Keychain)?;
                Ok(Some(secret))
            }
            Err(error) if error.code() == errSecItemNotFound => Ok(None),
            Err(_) => Err(KeyError::Keychain),
        }
    }

    pub(super) fn delete(service: &str, provider_id: &str) -> Result<(), KeyError> {
        let Some(item) = item_for(service, provider_id)? else {
            return Ok(());
        };
        if unsafe { SecKeychainItemDelete(item.as_concrete_TypeRef()) } == errSecSuccess {
            Ok(())
        } else {
            Err(KeyError::Keychain)
        }
    }
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

fn cache_key(service: &str, provider_id: &str) -> String {
    format!("{service}\0{provider_id}")
}

fn cached_or_fetch(provider_id: &str) -> Result<Option<String>, KeyError> {
    let service = active_keychain_service();
    let cache_key = cache_key(service, provider_id);
    let mut cache = secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(secret) = cache.get(&cache_key) {
        return Ok(Some(secret.clone()));
    }
    #[cfg(target_os = "macos")]
    let secret = macos_vault::read(service, provider_id)?;
    #[cfg(not(target_os = "macos"))]
    let secret = match entry(provider_id)?.get_password() {
        Ok(secret) => Some(secret),
        Err(KeyringError::NoEntry) => None,
        Err(error) => return Err(KeyError::from(error)),
    };
    if let Some(secret) = &secret {
        cache.insert(cache_key, secret.clone());
    }
    Ok(secret)
}

pub(crate) fn read_secret(provider_id: &str) -> Result<String, KeyError> {
    cached_or_fetch(provider_id)?.ok_or(KeyError::NotFound)
}

fn set_key_for_service(service: &str, provider_id: &str, secret: &str) -> Result<(), KeyError> {
    if secret.is_empty() {
        return Err(KeyError::EmptySecret);
    }
    #[cfg(target_os = "macos")]
    macos_vault::store(service, provider_id, secret)?;
    #[cfg(not(target_os = "macos"))]
    entry_for(service, provider_id)?
        .set_password(secret)
        .map_err(KeyError::from)?;
    secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(cache_key(service, provider_id), secret.to_owned());
    Ok(())
}

fn set_key_inner(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    set_key_for_service(active_keychain_service(), provider_id, secret)
}

pub(crate) fn store_commerce_operator_key(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    set_key_for_service(COMMERCE_OPERATOR_SERVICE, provider_id, secret)
}

fn key_status_inner(provider_id: &str) -> Result<bool, KeyError> {
    let service = active_keychain_service();
    #[cfg(target_os = "macos")]
    {
        return keychain_item_exists(service, provider_id);
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(cached_or_fetch(provider_id)?.is_some())
    }
}

pub(crate) fn key_presence_exact(provider_id: &str) -> Result<bool, KeyError> {
    key_status_inner(provider_id)
}

pub(crate) fn has_key_exact(provider_id: &str) -> bool {
    key_presence_exact(provider_id).unwrap_or(false)
}

pub(crate) fn store_imported_key(provider_id: &str, secret: &str) -> Result<(), KeyError> {
    set_key_inner(provider_id, secret)
}

pub(crate) fn delete_imported_key(provider_id: &str) -> Result<(), KeyError> {
    delete_key_inner(provider_id)
}

fn delete_key_inner(provider_id: &str) -> Result<(), KeyError> {
    let service = active_keychain_service();
    secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&cache_key(service, provider_id));
    #[cfg(target_os = "macos")]
    return macos_vault::delete(service, provider_id);
    #[cfg(not(target_os = "macos"))]
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

    #[test]
    fn provider_account_is_scoped_to_cutout() {
        assert_eq!(account("qwen-image-3"), "provider:qwen-image-3");
    }
}
