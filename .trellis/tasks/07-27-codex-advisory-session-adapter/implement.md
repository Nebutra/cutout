# Implementation plan

1. Define the closed, versioned native Phase A probe result and failure enums.
   Keep the request limited to the fixed Codex runtime identifier; reject all
   caller paths, argv, environment, auth, workspace, and prompt input.
2. Add the native Codex probe registry entry for canonical alias `codex`, exact
   version `0.145.0`, macOS Team ID `2DC432GLL2`, fixed `--version` and
   `login status` argv, timeout, byte ceilings, and stable error mapping.
3. Implement executable resolution and immediate per-probe revalidation of
   canonical path/file identity/version/signature. Reuse one validated
   executable and environment snapshot for both fixed commands; fail closed on
   drift. Keep non-macOS platforms blocked.
4. Implement direct process spawn with no shell, `env_clear()`, a minimal
   positive allowlist, optional reviewed absolute `CODEX_HOME`, bounded capture,
   timeout, overflow handling, and process cleanup on app shutdown.
5. Parse only reviewed version and login-status forms. Map auth to `chatgpt`,
   `api-key`, `access-token`, `unauthenticated`, or `unknown`; discard raw
   stdout/stderr before constructing IPC values or logs.
6. Expose an explicit-user-action IPC command and metadata-only inventory
   integration. Verify no startup, mount, refresh, timer, or background path
   invokes Codex.
7. Add Settings state and i18n through the owning Settings child: idle,
   checking, supported/authenticated, unauthenticated, unsupported version,
   invalid identity, platform blocked, timeout/overflow, and unknown. Execution
   controls remain absent or disabled with truthful Phase B copy.
8. Add deterministic fake-process/native tests for fixed argv, shared validated
   identity/environment, auth mapping, raw-output suppression, byte/time bounds,
   drift, signature/version rejection, and cleanup. Tests must never make a
   model request or read real auth files.
9. Synchronize IPC schemas, inventory capability flags, Agent capability
   limitations, permissions, CLI/MCP/protocol/manifest/docs only where the
   Phase A contract changes their public truth. Run `pnpm agent:validate` for
   every Agent-surface contract change.

## Validation

- Focused Rust tests for resolution, identity/signature/version checks, process
  policy, auth parsing, redaction, timeout, overflow, and cleanup.
- Focused TypeScript/Vitest tests for IPC decoding, explicit-trigger behavior,
  blocked execution state, and localized copy.
- i18n validation for every supported locale.
- `pnpm agent:validate`.
- Repository TypeScript, lint, formatting, and production build gates required
  by the touched packages.
- `git diff --check`.

## Review gates

- No Codex invocation without an explicit user action.
- No model request, `codex exec`, prompt, JSONL, run, approval, apply, retry, or
  resume surface.
- No caller-selected executable/path/argv/environment/auth/config/workspace.
- No raw process output, credential fragment, or host path crosses IPC,
  persistence, telemetry, or logs.
- No API-key/access-token state is described as subscription or allowance use.
- No quota, remaining allowance, billing, or entitlement claim.
- No support for unreviewed versions, signatures, aliases, or platforms.

## Rollback point

Disable/remove the Codex Phase A registry entry and IPC permission while
preserving static inventory. Because the probe persists no credentials or run
state, rollback requires no data migration.
