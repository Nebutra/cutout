# Implementation plan

## 1. Capability and evidence model

- Add planning runtime contracts and progressive evidence states.
- Refactor readiness into a pure capability-first projection for planning,
  image generation, and image editing.
- Keep direct Provider/model evidence separate from system runtime auth.
- Add focused projection/router tests before changing UI.

## 2. Native Codex app-server adapter

- Add the closed canonical runtime registry and signed executable validation.
- Add native process custody using the durable Agent Host and fixed stdio
  app-server launch.
- Implement the stable JSON-RPC subset, bounded parsers, sanitized auth/model
  capability projection, turn streaming, steering, interruption, and cleanup.
- Add the host-managed context root and restricted-read/no-network turn policy.
- Add Rust security tests for renderer-controlled-path/argv/env rejection,
  signature/version/protocol failure, output overflow, cancellation, crash, and
  secret-shaped response redaction.

## 3. Desktop planning runtime integration

- Add a frontend/native service that maps opaque conversation handles to Codex
  threads and maps events into the existing Agent run event model.
- Route planning to Codex first and the verified direct text adapter second.
- Stage bounded, revision-bound context and validate structured planning output
  before existing preview/apply flows.
- Record capability and execution evidence from terminal runtime events.
- Test follow-up, steering, retry, cancellation, stale-event rejection,
  workspace switch, and direct-provider fallback.

## 4. Direct image evidence convergence

- Split Provider authentication/catalog evidence from exact task capability and
  last real execution evidence.
- Feed generation/edit capability rows from the existing image route assessment
  and receipts without issuing setup-time image calls.
- Preserve Keychain, exact-path import, origin pinning, and protocol/model tests.

## 5. Settings convergence

- Replace the current primary setup hierarchy with one overall readiness state
  and three capability rows.
- Put runtime/Provider/model/source diagnostics and manual configuration in
  Advanced; remove the 39-Agent matrix from the primary journey.
- Remove native/frontend inventory code if no approved diagnostics consumer
  remains after the UI change.
- Add complete empty/checking/partial/ready/failure/recovery component coverage
  and update all five locales.

## 6. Contract, packaged validation, and release gate

- Synchronize native IPC permissions, frontend schemas, capability manifest,
  protocol/docs, and any CLI/MCP claims affected by the desktop runtime.
- Run focused frontend tests and Rust tests for every touched module.
- Run `pnpm agent:validate`, i18n validation, TypeScript, lint, formatting,
  production build, and `git diff --check`.
- Build the signed packaged app and run a background packaged smoke using the
  real system Codex login: non-billable auth/model probe, one user-started
  structured planning turn, cancellation, and a real direct image task.
- Verify the packaged Settings view reports only evidence actually observed.

## Risk and rollback points

- App-server protocol drift: parse a stable subset and fail closed; do not use
  raw TUI automation or exact stdout strings.
- Runtime filesystem authority: keep restricted roots native-owned and assert
  them in packaged tests before enabling the adapter.
- Duplicate context/run state: Cutout run events and `.cutout` revisions are
  authoritative; Codex thread IDs remain opaque continuity handles only.
- Mid-turn fallback: never publish from two adapters for one lease; fallback is
  selected before turn start.
- Product rollback: disable `codex-system` and retain direct text/image Provider
  adapters without migrating credentials or Design IR.
