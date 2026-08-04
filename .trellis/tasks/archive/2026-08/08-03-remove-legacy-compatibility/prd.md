# Remove legacy compatibility surfaces

## Goal

Make the current Cutout data model and protocol surface the only supported
contract. Remove migration-only branches, aliases, states, and tests so new
work cannot accidentally depend on retired product architecture.

The user explicitly accepts a breaking release: old projects, navigation
preferences, model-assignment records, Pen's former Pencil names, and retired
plaintext credential files do not need to be recovered by the new build.

## Background

- `.cutout` Design IR and provenance remain authoritative; exports remain
  generated projections.
- `src/design-ir/legacy-projection.ts` mixes active Design IR projection with
  old-record migration. Active projection must survive under current naming;
  compatibility decoding must not.
- The repository still accepts `pencil-mcp` / `pencil-cli`,
  `semantic-repair`, `legacy-ready`, old workspace/navigation shapes, old
  model-assignment stores, and `secrets.json` migration.
- Current `ai-native-*` checkpoint/error identifiers describe the active
  native Provider boundary. Their name alone is not evidence of legacy code.

## Requirements

- R1. Current runtime schemas must reject retired aliases, states, fields, and
  persistence formats rather than silently migrate them.
- R2. Preserve the current Workspace <-> Design IR projection under accurate
  names and current content references; remove only compatibility behavior.
- R3. New asset-production plans and persisted snapshots must use current
  routes/statuses only. No `semantic-repair` or `legacy-ready` decoder path.
- R4. Model capability bindings are the persisted source. Current chat/image
  convenience consumers may receive a derived projection, but no old store or
  `legacy` schema field may be read or written.
- R5. Only `pen-mcp` and `pen-cli` are valid Pen external surface kinds.
- R6. Remove the retired plaintext `secrets.json` migration module and startup
  hook; OS credential vault behavior remains unchanged.
- R7. Delete tests for unreachable retired Canvas surfaces and replace
  migration assertions with strict-current rejection/current round-trip tests.
- R8. Do not alter unrelated dirty-worktree changes, expose credentials,
  weaken policy, or claim unsupported capabilities.
- R9. Current tool-approval events and their UI projections must not carry an
  `estimatedCost`. Provider execution may still enforce an internal host-bound
  budget ceiling, and completed receipts remain the authority for actual
  charged amounts.

## Acceptance Criteria

- [x] Searches across shipping source, schemas, specs, and tests find no
  `pencil-mcp`, `pencil-cli`, `semantic-repair`, `legacy-ready`,
  `migrateLegacy*`, `LegacyWorkspace*`, or plaintext secret migration.
- [x] Current Workspace records round-trip through Design IR without legacy
  fallback, dual authority, or old `cutout://legacy/` content URIs.
- [x] Invalid/retired persisted data fails closed or falls back to a clean
  current default without being guessed into valid state.
- [x] Tool approval events reject `estimatedCost`, and no Agent approval feed
  or execution timeline projects a provider-cost estimate.
- [x] Current model capability bindings load/write and primary chat/image
  projections continue to power existing consumers.
- [x] CLI, MCP, protocol, manifest, and docs stay synchronized; `pnpm
  agent:validate` passes.
- [x] Focused tests, full lint, type-check, test suite, build, Rust tests/check,
  and `git diff --check` pass.
- [x] No unrelated user changes are reverted or committed.

## Out Of Scope

- Import tooling for old Cutout projects or settings.
- Deleting user files from application-support directories as part of app
  startup.
- Renaming active internal `ai-native-*` telemetry/checkpoint identifiers.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
