# Replace OS keychain with a local file secret store

## Problem

On this **unsigned / ad-hoc-signed** local build, every read of an API key from
the macOS keychain triggers the "Cutout 想要使用钥匙串" authorization dialog
(worse: each rebuild changes the code identity, so per-item "Always Allow" does
not stick). Per-item `-A` patches are a band-aid. The user wants the keychain
("safe storage") removed at the source so the prompt can never appear.

## Decision (explicit user request)

Store API secrets in an **owner-only local JSON file** in the app config dir
instead of the OS keychain. This removes all keychain prompts. Security
trade-off (keys are plaintext-on-disk, `chmod 600`) is accepted for now; the
proper keychain + Touch ID path is deferred until the user has an Apple
Developer ID. See memory [[keychain-prompt-dev-signing]].

## Scope

- New `commands::secret_store` — file-backed `get/set/delete/exists(account)`,
  atomic write, `0600` perms, path from a `OnceLock<PathBuf>` initialized in
  `setup` with `app.path().app_config_dir()`.
- `commands::ai::keys` (provider keys, account `provider:{id}`) and
  `commands::vectorize` (Vectorizer.AI secret, account `vectorizer:{id}`) both
  swap their `keyring::Entry` backend for `secret_store`. Public function
  signatures are unchanged, so no caller (proxy, image_edit, provider_discovery,
  invoke_handler) changes.
- Drop the keychain-specific pieces: legacy-service migration, the macOS
  `security-framework` presence probe, and the per-process secret cache (a file
  read is cheap and never prompts).
- Keep `keyring` in `Cargo.toml` for now (unused dep is harmless; pruning is a
  separate low-value change).

## Out of scope

- Encryption / Touch ID / biometric gating (needs a stable signed identity).
- Frontend changes (the IPC surface is identical).

## Acceptance criteria

- [ ] No `keyring::` / `security_framework::` usage remains in `keys.rs` or
      `vectorize.rs`.
- [ ] Setting, reading, status, and deleting a provider key round-trips through
      `secret_store` (unit tests green in `keys.rs`).
- [ ] Secrets persist to `<app-config-dir>/secrets.json` with `0600` perms; a
      missing file reads as "no key".
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes; app builds.
- [ ] After rebuild + migrating the existing `mox` / `tds-router` keys into the
      file, verifying a provider triggers **no keychain dialog**.
