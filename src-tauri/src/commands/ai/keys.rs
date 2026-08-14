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

/// The macOS legacy Keychain ACL API is the only system API that can grant a
/// signed desktop binary ongoing access to one generic-password item.  We use
/// it only for Cutout's own Provider credentials; it does not change the
/// login keychain or any other application's items.
#[cfg(target_os = "macos")]
mod macos_vault {
    use std::ffi::c_char;
    use std::ptr;

    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::{CFType, CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};
    use security_framework::item::{ItemClass, ItemSearchOptions, Reference, SearchResult};
    use security_framework::os::macos::access::SecAccess;
    use security_framework::os::macos::keychain_item::SecKeychainItem;
    use security_framework::os::macos::passwords::find_generic_password;
    use security_framework_sys::base::{
        errSecItemNotFound, errSecSuccess, SecAccessRef, SecKeychainItemRef,
    };
    use security_framework_sys::keychain_item::SecKeychainItemDelete;

    use super::{account, entry, KeyError, SERVICE};

    const ACL_LABEL: &str = "Cutout Provider credential";

    extern "C" {
        fn SecTrustedApplicationCreateFromPath(
            path: *const c_char,
            application: *mut CFTypeRef,
        ) -> i32;
        fn SecAccessCreate(
            descriptor: CFStringRef,
            trusted_list: CFArrayRef,
            access: *mut SecAccessRef,
        ) -> i32;
        fn SecKeychainItemSetAccess(item: SecKeychainItemRef, access: SecAccessRef) -> i32;
    }

    fn item_for(provider_id: &str) -> Result<Option<SecKeychainItem>, KeyError> {
        let mut query = ItemSearchOptions::new();
        query
            .class(ItemClass::generic_password())
            .service(SERVICE)
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

    fn current_process_access() -> Result<SecAccess, KeyError> {
        let mut trusted_application: CFTypeRef = ptr::null();
        // A null path is defined by Security.framework as the calling binary.
        // That pins the ACL to the signed Cutout process rather than a mutable
        // filesystem path supplied by a caller.
        if unsafe { SecTrustedApplicationCreateFromPath(ptr::null(), &mut trusted_application) }
            != errSecSuccess
            || trusted_application.is_null()
        {
            return Err(KeyError::Keychain);
        }
        let trusted_application = unsafe { CFType::wrap_under_create_rule(trusted_application) };
        let trusted_list = CFArray::from_CFTypes(&[trusted_application]);
        let descriptor = CFString::new(ACL_LABEL);
        let mut access = ptr::null_mut();
        if unsafe {
            SecAccessCreate(
                descriptor.as_concrete_TypeRef(),
                trusted_list.as_concrete_TypeRef(),
                &mut access,
            )
        } != errSecSuccess
            || access.is_null()
        {
            return Err(KeyError::Keychain);
        }
        Ok(unsafe { SecAccess::wrap_under_create_rule(access) })
    }

    fn set_item_access(item: &SecKeychainItem) -> Result<(), KeyError> {
        let access = current_process_access()?;
        if unsafe {
            SecKeychainItemSetAccess(item.as_concrete_TypeRef(), access.as_concrete_TypeRef())
        } == errSecSuccess
        {
            Ok(())
        } else {
            Err(KeyError::Keychain)
        }
    }

    pub(super) fn store(provider_id: &str, secret: &str) -> Result<(), KeyError> {
        match item_for(provider_id)? {
            Some(mut item) => {
                // Migrate access before changing the existing secret. If the
                // legacy ACL refuses this operation, the old credential stays
                // intact and macOS may ask once for the user's authorization.
                set_item_access(&item)?;
                item.set_password(secret.as_bytes())
                    .map_err(|_| KeyError::Keychain)
            }
            None => {
                // Let the modern SecItem path establish macOS's signed-app
                // partition metadata first, then replace only this item's ACL
                // with the current Cutout identity. Legacy-only creation here
                // can break securityd access for a later signed app launch.
                entry(provider_id)?
                    .set_password(secret)
                    .map_err(KeyError::from)?;
                let item = item_for(provider_id)?.ok_or(KeyError::Keychain)?;
                if let Err(error) = set_item_access(&item) {
                    unsafe { SecKeychainItemDelete(item.as_concrete_TypeRef()) };
                    return Err(error);
                }
                Ok(())
            }
        }
    }

    pub(super) fn read(provider_id: &str) -> Result<Option<String>, KeyError> {
        let account = account(provider_id);
        match find_generic_password(None, SERVICE, &account) {
            Ok((secret, item)) => {
                let secret =
                    String::from_utf8(secret.to_owned()).map_err(|_| KeyError::Keychain)?;
                // A legacy item can require one last OS confirmation for this
                // initial read. Once macOS permits it, upgrade its ACL so
                // later Cutout reads are silent. Never broaden a failed ACL.
                let _ = set_item_access(&item);
                Ok(Some(secret))
            }
            Err(error) if error.code() == errSecItemNotFound => Ok(None),
            Err(_) => Err(KeyError::Keychain),
        }
    }

    pub(super) fn delete(provider_id: &str) -> Result<(), KeyError> {
        let Some(item) = item_for(provider_id)? else {
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

fn cached_or_fetch(provider_id: &str) -> Result<Option<String>, KeyError> {
    let mut cache = secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(secret) = cache.get(provider_id) {
        return Ok(Some(secret.clone()));
    }
    #[cfg(target_os = "macos")]
    let secret = macos_vault::read(provider_id)?;
    #[cfg(not(target_os = "macos"))]
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
    #[cfg(target_os = "macos")]
    macos_vault::store(provider_id, secret)?;
    #[cfg(not(target_os = "macos"))]
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
    secret_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(provider_id);
    #[cfg(target_os = "macos")]
    return macos_vault::delete(provider_id);
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
