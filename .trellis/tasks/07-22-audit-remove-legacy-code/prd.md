# Audit and remove legacy code

## Goal

Reduce Cutout's maintenance surface by identifying and removing evidence-backed
legacy code while preserving supported persisted data, public CLI/MCP/plugin
contracts, updater behavior, and current product workflows.

## Background

- The request covers the repository broadly rather than one named module.
- `.cutout` Design IR and provenance are authoritative; generated exports are
  not source-of-truth candidates for manual cleanup.
- CLI, MCP, protocol, capability manifest, plugin runtime, and docs must remain
  synchronized whenever an Agent-facing contract changes.
- The repository contains active parallel tasks, so cleanup must be performed
  from a clean `github/main` baseline without importing unrelated worktree edits.
- `docs/AI_NATIVE.md` and `docs/AGENT_INTEGRATION.md` explicitly classify the
  `pnpm ai` / `window.__CUTOUT_AI__` GUI queue as deprecated and
  compatibility-only. The supported external control plane is
  `cutout.control.v1` through CLI/MCP.
- That legacy control surface still owns at least 2,344 lines across its CLI,
  React dispatcher, TypeScript action schema/tests, native commands, and docs,
  plus AppShell wiring, Tauri permissions, and visual-test stubs.
- Persisted project/provider compatibility paths have explicit current owners:
  asset-production `legacy-ready` migration, workspace-navigation v2 migration,
  global-library catalog migration/downgrade preview, and model-assignment
  migration. These are not dead code merely because they contain `legacy`.
- The user approved breaking the deprecated GUI Queue compatibility surface.
- `semantic-slices.v0` and its Asset Production semantic adapter have no
  production consumer outside the legacy Queue; after Queue removal they would
  be test-only self-references and are part of the same deletion unit.
- The diagnostics collector under `services/ai-native` is still used by current
  startup recovery and Agent workspace flows; it must be retained under a
  neutral runtime-diagnostics name.

## Requirements

- Build an evidence-backed inventory of legacy candidates using references,
  runtime entry points, tests, configs, release packaging, persisted schemas,
  and recent task/history evidence.
- Classify candidates as dead code, redundant compatibility layer, required
  migration/reader, generated output, deprecated-but-public contract, or
  uncertain ownership before deleting anything.
- Remove only candidates whose consumers and compatibility responsibility are
  disproven or explicitly retired by the agreed scope.
- Remove the complete GUI Queue surface: `pnpm ai`, `window.__CUTOUT_AI__`, its
  React dispatcher/action schema, native `ai_native_*` commands, permissions,
  tests, documentation, and test stubs.
- Remove the orphaned `semantic-slices.v0` experiment and semantic production
  adapter while preserving the current local semantic slice naming fallback.
- Rename the still-current in-memory diagnostic collector away from
  `ai-native` and update all consumers without changing its behavior.
- Remove the deprecated `@types/uuid` stub dependency and regenerate the lockfile.
- Prefer cohesive deletions that also remove obsolete tests, types, exports,
  docs, dependencies, and configuration in the same change.
- Do not weaken approval, path, secret, updater-signature, notarization, or
  Agent capability policy while simplifying code.
- Keep user-visible behavior and supported persisted projects compatible unless
  an explicit breaking-cleanup decision is approved.
- Validate affected modules first, then run full lint, TypeScript, Vitest, Rust,
  build, i18n, Agent-contract, release-contract, and `git diff --check` gates as
  applicable to the final scope.

## Acceptance Criteria

- [x] A repository-backed legacy inventory records each candidate, evidence,
  classification, owner/consumer, risk, and disposition.
- [x] Every deleted path has no supported runtime, persisted-data, release,
  plugin, CLI/MCP, documentation, or test consumer left behind.
- [x] Required compatibility and migration paths are documented and retained.
- [x] Removed code includes its obsolete exports, tests, dependencies, docs,
  and configuration without leaving aliases or duplicated replacement paths.
- [x] No `pnpm ai`, `window.__CUTOUT_AI__`, `ai_native_*`, `semantic-slices.v0`,
  or legacy AI Native documentation/reference remains in shipping source,
  permissions, scripts, tests, README, or active specs.
- [x] Current runtime diagnostics remain available to startup recovery, Agent
  execution, and diagnostic bundle export under a neutral module name.
- [x] Current core workflows and public Agent/release contracts remain valid.
- [x] Focused and full validation pass for the final deletion set.
- [ ] Changes are delivered to `main` without including unrelated work.

## Out Of Scope

- Rewriting working subsystems solely for style or architectural preference.
- Removing compatibility behavior that still protects supported project data or
  published clients without an explicit breaking-change decision.
- Claiming unavailable capabilities such as live Figma sync, web fetching,
  video processing, cloud collaboration, or a headless provider.

## Notes

- This is a complex repository-wide cleanup and requires `design.md`,
  `implement.md`, and curated implementation/check context before activation.
