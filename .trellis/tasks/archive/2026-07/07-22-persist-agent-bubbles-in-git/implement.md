# Implementation Plan

- [x] Extend Agent run-event schemas/types with backward-compatible parent,
  response, and branch-selection relationships.
- [x] Add pure replay/projection helpers for sibling grouping, selected branch,
  active conversation head, and legacy linear migration.
- [x] Change Regenerate to append a sibling Agent response and select it instead
  of revising the original response.
- [x] Add previous/next response controls and `index / count` presentation to
  the Agent bubble without changing Retry or paid-tool actions.
- [x] Attach new user turns to the selected branch and restore the selection
  after restart.
- [x] Replace the React-only preparing bubble with persisted lifecycle step
  events and terminal projection.
- [x] Add controlled desktop `.cutout/run-events.json` persistence for
  repository-backed projects and reconcile it with `workspace.v1` recovery.
- [x] Update Agent/Headless documentation, schemas, CLI/MCP/plugin runtime
  surfaces when their event contract changes, then run `pnpm agent:validate`.
- [x] Add event-DAG, component, workspace persistence, restart recovery,
  native-path safety, Git status, and legacy migration regressions.
- [x] Run focused tests, full Vitest, lint, TypeScript, build, Rust tests/check,
  Agent validation, and `git diff --check` before release integration.

## Rollback Points

- Event schema fields remain optional until every producer/consumer is updated.
- Keep repository persistence behind the authorized workspace capability; local
  IndexedDB projects continue working if no repository is bound.
- Do not delete `message-revised` compatibility until old persisted projects
  have a versioned migration.
