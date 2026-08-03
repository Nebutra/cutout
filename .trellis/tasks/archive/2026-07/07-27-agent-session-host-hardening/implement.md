# Implementation plan

1. Factor canonical workspace identity locking and hardened Host checkpoint IO.
2. Extend node state with recovery-owned retry limits and backwards-compatible
   defaults; align Rust recovery with live-lease semantics.
3. Add stable error code/sanitized message storage and migration from legacy raw
   strings.
4. Add crate-private process custody registry, POSIX process-group termination,
   Windows capability-required behavior, idempotent unregister, and cleanup.
5. Connect run cancel, lease-expiry/loss hooks, and Host shutdown to process
   termination without changing public PID/command authority.
6. Add Rust fixtures for checkpoint attacks, recovery transitions, canonical
   locking, error redaction, child-tree cancellation, and cleanup. Preserve
   existing TypeScript lifecycle/durable-effect tests.
7. Run Rust Agent Host tests, focused Vitest, TypeScript, lint, formatting,
   `pnpm agent:validate`, production build, and `git diff --check`.

## Review gates

- No executable/argv/path/PID/signal in public IPC.
- No signaling persisted PIDs after restart without a live native handle.
- No automatic retry for one-attempt session nodes.
- No raw error/stderr/path/credential persistence.
- No Windows execution claim without Job Object support.
