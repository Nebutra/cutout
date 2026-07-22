//! Local file-backed secret store (replaces the OS keychain).
//!
//! API secrets live in an owner-only JSON file (`secrets.json`) in the app
//! config dir, keyed by an opaque `account` string (e.g. `provider:{id}` or
//! `vectorizer:{id}`). This deliberately trades OS-keychain protection for
//! **zero access prompts** on unsigned / ad-hoc-signed builds, where the
//! keychain re-prompts on every read because the code identity is unstable.
//!
//! Security note: secrets are plaintext on disk (mode `0600`). A properly
//! signed/notarized build should reinstate the keychain + Touch ID gating —
//! this module is the dev-time replacement, not the end state.

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

fn load_map() -> io::Result<BTreeMap<String, String>> {
    let path = store_path()?;
    match std::fs::read(&path) {
        // A corrupt file degrades to "no secrets" rather than bricking the app;
        // the next write rewrites it cleanly.
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(e),
    }
}

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
pub fn get(account: &str) -> io::Result<Option<String>> {
    let _guard = lock();
    Ok(load_map()?.get(account).cloned())
}

/// Store (or replace) a secret.
pub fn set(account: &str, secret: &str) -> io::Result<()> {
    let _guard = lock();
    let mut map = load_map()?;
    map.insert(account.to_string(), secret.to_string());
    write_map(&map)
}

/// Delete a secret. A missing entry is treated as success.
pub fn delete(account: &str) -> io::Result<()> {
    let _guard = lock();
    let mut map = load_map()?;
    if map.remove(account).is_some() {
        write_map(&map)?;
    }
    Ok(())
}

/// Whether a secret exists, without disclosing it.
pub fn exists(account: &str) -> io::Result<bool> {
    let _guard = lock();
    Ok(load_map()?.contains_key(account))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Point the store at a unique temp dir. Idempotent across a test binary
    /// (OnceLock keeps the first dir); tests use unique accounts so they don't
    /// collide within that shared dir.
    fn ensure_test_dir() {
        init_dir(std::env::temp_dir().join(format!("cutout-secret-store-{}", std::process::id())));
    }

    #[test]
    fn set_get_delete_round_trip() {
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
        ensure_test_dir();
        assert_eq!(get("provider:never-set").expect("get"), None);
        assert!(!exists("provider:never-set").expect("exists"));
        // Deleting a missing entry is a no-op success.
        delete("provider:never-set").expect("delete missing");
    }

    #[test]
    fn replacing_a_secret_keeps_the_latest() {
        ensure_test_dir();
        let account = "provider:replace";
        set(account, "first").expect("set first");
        set(account, "second").expect("set second");
        assert_eq!(get(account).expect("get"), Some("second".to_string()));
        delete(account).expect("cleanup");
    }
}
