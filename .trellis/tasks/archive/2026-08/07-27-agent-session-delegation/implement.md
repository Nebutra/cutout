# Implementation plan

1. Complete the native Host hardening child: canonical workspace locking,
   checkpoint identity/no-symlink protections, lease-aware recovery, sanitized
   durable errors, bounded process metadata, watchdog/app-exit cleanup, and
   truthful POSIX/Windows capability behavior. Verify that no provider executor
   becomes reachable as a side effect.
2. Complete the Codex child as Phase A probe-only: canonical alias, exact
   reviewed version/signature, per-probe identity revalidation, fixed bounded
   `--version` and `login status`, cleared/allowlisted environment, sanitized
   auth enum, and raw-output suppression. Do not implement `codex exec` or any
   model request path.
3. Complete the Settings/i18n child: explicit probe gesture, metadata-only
   inventory, localized probe/auth/error states, truthful ChatGPT versus
   API-key/access-token copy, and visibly unavailable session execution. Keep
   Claude `vendor-approval-required`.
4. Synchronize native IPC, frontend schemas, inventory flags, Agent capability
   manifest/limitations, permissions, CLI/MCP/protocol/docs, tests, and i18n in
   the child that owns each changed public contract. Validate Agent-surface
   changes with `pnpm agent:validate`.
5. Run a final integration review across all children. Confirm inventory never
   launches a runtime, probes require explicit user action, raw output/secrets
   never cross IPC, and no Codex/Claude execution API or misleading capability
   claim is present.
6. Leave Phase B unstarted. Create/revise its planning only after enforceable
   workspace read confinement or a reviewed stable no-tools Codex contract is
   available; require a new security review before activation.

## Validation

- Focused Rust Host tests for locking, checkpoint identity, recovery, leases,
  sanitized errors, cleanup, and platform capability truth.
- Focused native Codex probe tests using fake processes only: fixed argv,
  executable identity/version/signature, environment policy, time/byte bounds,
  auth mapping, redaction, and failure cleanup. No model calls or real auth-file
  reads in tests.
- Focused frontend tests for explicit-trigger behavior, probe state decoding,
  disabled/absent execution, Claude vendor block, and truthful localized copy.
- i18n completeness checks for every supported locale.
- `pnpm agent:validate`.
- TypeScript, lint, Rust formatting/tests, production build, and
  `git diff --check` required by touched packages.

## Release gates

- No automatic/background runtime invocation.
- No model request or provider runtime executor in Phase A.
- No caller-selected command/path/argv/environment/auth/workspace/prompt.
- No auth/session file reads and no raw stdout/stderr/path/credential
  persistence or IPC exposure.
- No claim of quota, remaining allowance, balance, billing, entitlement, or
  subscription execution readiness.
- No Codex execution based only on read-only sandboxing or cwd selection.
- No Claude execution without documented vendor approval.

## Rollback

Disable the Codex probe registry/permission and Settings action while retaining
truthful static inventory. Revert a Host-hardening child only through its own
tested rollback plan. There is no credential or run-state migration to undo.
