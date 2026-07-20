# Implementation Plan

## 1. Normalize Provider protocol contracts

- Add OpenAI wire-protocol schema/types and migration defaults in TypeScript and Rust.
- Add reviewed protocol capabilities/defaults to Provider definitions.
- Propagate the field through Provider persistence, Agent action validation, model
  routing, and fixtures.
- Change generation adapters to select explicit Responses or Chat factories.
- Add compatibility tests for old persisted records and both transports.

## 2. Build the Rust discovery boundary

- Add bounded, exact-path Codex TOML and Claude JSON parsers with fixture tests.
- Add Provider-specific environment allowlists and credential header semantics.
- Add an exact Keychain adapter registry covering Cutout current/legacy records.
- Add sanitized candidate contracts and deterministic deduplication/conflict rules.
- Reject symlinks, oversized files, unsupported helpers/auth modes, and unknown wire
  protocols.

## 3. Add backend draft/check/import lifecycle

- Implement a bounded TTL draft store with opaque ids and cleanup.
- Resolve env/Keychain/config credentials only inside Rust.
- Add structured catalog/check result and sanitized error codes.
- Make final import atomically persist Provider metadata and copy/set the Cutout
  Keychain item; consume the draft on success.
- Register Tauri commands and add frontend service wrappers without secret readback.

## 4. Refactor Provider setup UX

- Add discovery preview/import entry point and conflict warnings.
- Reorder form to Provider, Base URL/protocol, credential, check, model, save.
- Replace native `datalist` with themed searchable Radix controls.
- Implement the explicit form state machine and invalidation rules.
- Add manual model fallback only for unsupported/empty catalogs after user choice.
- Preserve edit mode and existing Keychain status behavior.

## 5. Synchronize contracts and documentation

- Update schemas, Rust serde structs, service interfaces, Agent actions, and relevant
  docs in the same change.
- Verify whether the public Agent capability manifest changes; if it does, update CLI,
  MCP, protocol, manifest, and docs together. Do not claim discovery through headless
  control unless it is actually exposed there.

## Validation

- Focused frontend unit/component tests for form state, dark theme, protocol routing,
  catalog errors, migration, and discovery previews.
- Rust tests for config fixtures, path/symlink/size rejection, exact Keychain lookup,
  secret-free serialization, TTL/single-use drafts, and atomic import failure paths.
- `pnpm lint`
- `pnpm test --run` or the repository's scoped equivalent during iteration.
- `cargo test` for `src-tauri`.
- `pnpm agent:validate` when Agent-facing contracts are changed.
- Desktop E2E smoke: discover -> preview -> select -> check -> model dropdown -> save ->
  generate through both Responses and Chat test providers, with no secret visible in
  WebView state/logs.

## Risk and Rollback Points

- Provider schema migration: retain optional read and deterministic normalization
  until all stored records have been rewritten.
- Backend draft lifecycle: bound memory/TTL and ensure every close/cancel path cleans
  up; retain manual setup fallback.
- Atomic persistence: if Keychain write or metadata write fails, avoid a half-created
  Provider and report a repairable error.
- Protocol defaults: existing compatible Providers must remain Chat Completions to
  avoid a silent behavior regression.
- Keychain access prompts: presence checks must avoid secret reads; only explicit
  check/import may request access.

## Closure audit (2026-07-20)

The implementation scope is complete. Environment and distribution validation is
separated into planning child task `07-20-provider-distribution-validation`; this
parent does not claim those child gates have passed.

| PRD acceptance criterion | Result | Evidence / remaining work |
| --- | --- | --- |
| Codex and Claude fixtures are deterministic and sanitized | Verified | Rust `codex_returns_only_sanitized_metadata` and `claude_literal_candidate_is_sanitized_and_helper_only_is_ignored`; strict TypeScript candidate parsing rejects extra credential-shaped fields. |
| Current and legacy Cutout Keychain records use exact lookup and no enumeration | Implemented, integration pending | `keys::has_key_exact` queries only `com.nebutra.cutout` and `com.leishi.cutout` with `provider:{id}`. A real OS Keychain fixture covering both namespaces is still required. |
| Unsupported private credential stores are not guessed | Verified by inspection | Only exact Cutout services are queried. Claude bearer/session credentials are non-importable and helper-only settings are ignored without command execution. |
| Malformed, oversized, symlinked, unknown-path, helper and wire inputs fail closed | Verified | Exact paths, 1 MiB bound, `symlink_metadata`, no path IPC, helper non-execution and strict wire normalization are implemented. Oversized, symlink and unsupported-wire regressions pass. |
| New provider check and model listing happen before persistence | Verified | Rust draft lifecycle plus mounted `ProviderForm.test.tsx` proves Save is disabled before check and creation uses atomic `importProviderDraft`, not legacy `upsert`. |
| Connection-defining changes invalidate verification and catalog | Verified | Kind, Base URL, protocol and credential handlers call `invalidateConnection`; mounted coverage proves both the initial save gate and credential-change invalidation after a successful check. |
| OpenAI Responses default and compatible Chat migration are explicit | Verified | `provider-types.test.ts`, registry tests and Rust `draft_protocol_defaults_and_validation_fail_closed`. Custom compatible drafts require an explicit protocol. |
| Generation routes both Responses and Chat Completions | Verified | `provider-adapter-registry.test.ts` proves `provider.responses(model)` and `provider.chat(model)` selection without model-name inference. |
| Catalog errors are distinct and sanitized | Verified by tests and inspection | Rust stable codes cover missing credential, unauthorized, endpoint, unsupported, malformed, wire and draft/conflict cases. URL user-info is rejected before networking/error reporting. |
| Model control is last, themed, gated and has deliberate manual fallback | Verified by component/code evidence | Native `datalist` was replaced by Radix Select; it stays disabled until check, and manual entry appears only for `catalog-unsupported`. |
| Existing CRUD, migration, routing and Agent action tests remain green | Partially verified | AI Rust tests (46/46), focused frontend tests (15/15 including mounted form), TypeScript and lint pass. A repository-wide run is still recommended after concurrent work settles. |
| Agent contract validation passes when affected | Blocked by concurrent generated drift | Capability contract (20 operations / 36 MCP tools) and product skills (20) pass. Final plugin validation reports stale bundles for concurrently modified headless/design-governance/source-scanner sources; rebuild and revalidate after those owners finish. |

### Deferred environment and distribution validation

The following are owned by `07-20-provider-distribution-validation` and remain
unverified here:

1. Real current and legacy exact Keychain records in a signed/local desktop build.
2. Packaged desktop discover -> preview -> check -> select -> save -> generate against
   controlled Responses and Chat providers, including WebView/IPC/log secret checks.
3. Codex plugin rebuild after concurrent source owners finish, followed by a clean
   `pnpm agent:validate`.
