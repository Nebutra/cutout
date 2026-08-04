# Implementation plan

## 1. Registry and inventory

- Add the pinned Paseo 2026-07-27 catalog containing all 39 Agent IDs/names,
  local CLI identities, provenance, and last-reviewed metadata.
- Add native registry types, fixed root resolvers, exact source descriptors,
  credential capability tiers, and sanitized inventory DTOs.
- Add deterministic validation for catalog completeness, duplicate IDs, unsafe
  installer-only probes, and credential adapters without evidence metadata.
- Detect installed local binaries/packages without invoking `npx -y`, `uvx`,
  login commands, or any network/install-capable process.
- Refactor existing Codex/Claude discovery onto the registry without changing
  current candidate behavior.
- Add Pi typed readers for `auth.json`, `models.json`, and metadata-only
  `settings.json` handling.
- Add OMP typed YAML readers and read-only SQLite metadata discovery that never
  selects `auth_credentials.data`.
- Add installed binary/version/capability probes that do not execute user
  configuration or helpers.
- Add the remaining Agent credential adapters only in evidence-backed batches;
  unsupported entries must still appear in inventory with truthful capability
  status.

## 2. Native authorization actions

- Extend API-key import resolution for reviewed Pi and OMP shapes.
- Add native exact-root permission grant flow and persisted scoped grant state if
  the packaged runtime requires it.
- Add separate authorization records for API-key import and delegated sessions.
- Keep secret material native-only and reject secret-shaped serialization.

## 3. Settings UX and i18n

- Replace the flat discovered-provider list with grouped Agent source rows and
  stable empty/loading/error/permission states.
- Add distinct confirmation flows for `Import API key`, `Use Agent session`, and
  `Grant access`.
- Add localized messages for English, Simplified Chinese, Japanese, French, and
  Spanish and run catalog parity checks.

## 4. Delegated session adapters

- Research and pin the supported non-interactive contract and minimum version
  for each CLI before enabling it.
- Prefer native ACP entry points for the Paseo catalog where they are already
  locally installed and do not require an installer command at launch.
- Implement adapters one at a time with fixed binary allowlists, shell-free argv,
  workspace binding, bounded input/output, timeout/cancel, environment filtering,
  redaction, provenance, and authorization receipts.
- Prefer OMP's official local gateway/broker when its lifecycle and loopback
  authorization can be safely controlled.
- Leave unsupported tools visible but disabled; do not parse/copy their OAuth
  payloads as a fallback.

## 5. Contract synchronization

- Update Tauri commands, ACL/capabilities, frontend service schemas, protocol
  documentation, manifests, and `cutout.agent-capabilities.json` together for
  every newly exposed action.
- Preserve the statement that no executor exists until a packaged delegated
  adapter is actually implemented and validated.

## 6. Validation

- Rust unit tests: root resolution, symlink/non-file/oversize rejection, typed
  parsing, unknown schema handling, SQLite query boundary, no helper execution,
  native re-resolution, and secret-free DTO serialization.
- Catalog tests: exactly 39 pinned entries for the recorded snapshot, unique
  stable IDs, source attribution, local probe safety, and unsupported-state
  behavior for entries without credential adapters.
- Frontend tests: grouped inventory, action separation, confirmation, denied
  permission, missing CLI, unsupported schema, zero-source, and retry states.
- Security tests: no caller paths, no secret IPC, fixed argv, no shell, bounded
  execution, cancellation, output redaction, and authorization replay rejection.
- Run focused suites, `pnpm i18n:ci`, `pnpm agent:validate`, type-check/lint, and
  packaged-app smoke tests for each enabled adapter.

## Review gates

- Do not enable a session adapter before its official CLI contract and provider
  terms are documented and a packaged-app smoke test passes.
- Stop and revise the plan if a source requires recursive scanning, private token
  replay, helper execution, arbitrary paths, or unbounded process execution.
- Roll back by disabling the affected registry action while retaining sanitized
  discovery and existing provider configurations.
