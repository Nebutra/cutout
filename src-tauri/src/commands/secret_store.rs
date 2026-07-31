//! One-way migration source for the retired plaintext secret store.
//!
//! Older builds may have written API secrets to an owner-only `secrets.json`
//! file keyed by an opaque account. New reads and writes are forbidden. Signed
//! builds move every legacy entry into the OS credential vault and delete the
//! plaintext file only after all writes pass.

use std::collections::BTreeMap;
use std::io;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const FILE: &str = "secrets.json";

/// Resolved app config dir, set once at startup from `app.path().app_config_dir()`.
static SECRETS_DIR: OnceLock<PathBuf> = OnceLock::new();
/// Serializes read-modify-write cycles so concurrent set/delete don't race.
static LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Initialize the storage directory. Idempotent: the first caller wins, so
/// production `setup` sets the real config dir and later calls are no-ops.
pub fn init_dir(dir: PathBuf) {
    let _ = SECRETS_DIR.set(dir);
}

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn store_path() -> io::Result<PathBuf> {
    let dir = SECRETS_DIR.get().cloned().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "secret store directory is not initialized",
        )
    })?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(FILE))
}

#[cfg(test)]
fn load_map() -> io::Result<BTreeMap<String, String>> {
    let path = store_path()?;
    load_map_from(&path)
}

fn load_map_from(path: &std::path::Path) -> io::Result<BTreeMap<String, String>> {
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("legacy credential store is invalid: {error}"),
            )
        }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
fn write_map(map: &BTreeMap<String, String>) -> io::Result<()> {
    let path = store_path()?;
    let json = serde_json::to_vec_pretty(map)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    std::fs::write(&temporary, &json)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))?;
    }
    if let Err(error) = std::fs::rename(&temporary, &path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(())
}

/// Read a secret, or `None` when no entry exists.
#[cfg(test)]
pub fn get(account: &str) -> io::Result<Option<String>> {
    let _guard = lock();
    Ok(load_map()?.get(account).cloned())
}

/// Store (or replace) a secret.
#[cfg(test)]
pub fn set(account: &str, secret: &str) -> io::Result<()> {
    let _guard = lock();
    let mut map = load_map()?;
    map.insert(account.to_string(), secret.to_string());
    write_map(&map)
}

/// Delete a secret. A missing entry is treated as success.
#[cfg(test)]
pub fn delete(account: &str) -> io::Result<()> {
    let _guard = lock();
    let mut map = load_map()?;
    if map.remove(account).is_some() {
        write_map(&map)?;
    }
    Ok(())
}

/// Whether a secret exists, without disclosing it.
#[cfg(test)]
pub fn exists(account: &str) -> io::Result<bool> {
    let _guard = lock();
    Ok(load_map()?.contains_key(account))
}

pub fn migrate_to_keychain() -> io::Result<usize> {
    migrate_with(|account, secret| {
        keyring::Entry::new("com.nebutra.cutout", account)
            .and_then(|entry| entry.set_password(secret))
            .map_err(|_| io::Error::other("credential vault migration failed"))
    })
}

fn migrate_with(mut store: impl FnMut(&str, &str) -> io::Result<()>) -> io::Result<usize> {
    let _guard = lock();
    let path = store_path()?;
    migrate_path_with(&path, &mut store)
}

fn migrate_path_with(
    path: &std::path::Path,
    store: &mut impl FnMut(&str, &str) -> io::Result<()>,
) -> io::Result<usize> {
    let entries = load_map_from(path)?;
    if entries.is_empty() {
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        return Ok(0);
    }
    for (account, secret) in &entries {
        store(account, secret)?;
    }
    std::fs::remove_file(path)?;
    Ok(entries.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_guard() -> std::sync::MutexGuard<'static, ()> {
        static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Point the store at a unique temp dir. Idempotent across a test binary
    /// (OnceLock keeps the first dir); tests use unique accounts so they don't
    /// collide within that shared dir.
    fn ensure_test_dir() {
        init_dir(std::env::temp_dir().join(format!("cutout-secret-store-{}", std::process::id())));
    }

    #[test]
    fn set_get_delete_round_trip() {
        let _guard = test_guard();
        ensure_test_dir();
        let account = "provider:round-trip";
        set(account, "s3cr3t").expect("set");
        assert_eq!(get(account).expect("get"), Some("s3cr3t".to_string()));
        assert!(exists(account).expect("exists"));
        delete(account).expect("delete");
        assert_eq!(get(account).expect("get after delete"), None);
        assert!(!exists(account).expect("exists after delete"));
    }

    #[test]
    fn missing_entry_reads_as_none() {
        let _guard = test_guard();
        ensure_test_dir();
        assert_eq!(get("provider:never-set").expect("get"), None);
        assert!(!exists("provider:never-set").expect("exists"));
        // Deleting a missing entry is a no-op success.
        delete("provider:never-set").expect("delete missing");
    }

    #[test]
    fn replacing_a_secret_keeps_the_latest() {
        let _guard = test_guard();
        ensure_test_dir();
        let account = "provider:replace";
        set(account, "first").expect("set first");
        set(account, "second").expect("set second");
        assert_eq!(get(account).expect("get"), Some("second".to_string()));
        delete(account).expect("cleanup");
    }

    #[test]
    fn migration_deletes_plaintext_only_after_every_entry_is_stored() {
        let _guard = test_guard();
        ensure_test_dir();
        set("provider:migrate-a", "alpha").unwrap();
        set("provider:migrate-b", "beta").unwrap();
        let mut seen = Vec::new();
        let count = migrate_with(|account, _| {
            seen.push(account.to_owned());
            Ok(())
        })
        .unwrap();
        assert!(count >= 2);
        assert!(seen.iter().any(|account| account == "provider:migrate-a"));
        assert!(!store_path().unwrap().exists());
    }

    #[test]
    fn migration_preserves_a_malformed_plaintext_store() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(FILE);
        std::fs::write(&path, b"{not-json").unwrap();
        let error = migrate_path_with(&path, &mut |_, _| Ok(())).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert!(path.exists());
    }
}
