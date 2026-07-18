# Implementation Plan

## 1. Resolve Product Scope

- [x] Select a self-contained local MCP distribution and complete the plugin
  infrastructure in this task.
- [x] Defer hosted OAuth HTTP MCP and public one-install delivery to the
  roadmap; do not claim it in the current plugin.
- [x] Re-run the PRD convergence pass after the decision.
- [x] Start the Trellis task only after artifact review and approval.

## 2. Implement Plugin Source

- [x] Load `trellis-before-dev` context before code edits.
- [x] Scaffold `plugins/cutout` through the plugin-creator tooling.
- [x] Reuse canonical Cutout brand assets under the plugin package.
- [x] Add a controller skill that uses progressive disclosure and preserves the
  preview/approval/apply lifecycle.
- [x] Add repo marketplace metadata without modifying the user's personal
  marketplace during source implementation.

## 3. Implement the Selected Runtime Path

- [x] Extract the shared MCP server module and create
  a deterministic production bundle with no runtime Vite/source-checkout
  dependency.
- [x] Preserve explicit project-root binding and fail closed on missing or
  invalid `.cutout` state.
- [x] Keep existing `pnpm cutout:mcp` behavior compatible.

## 4. Synchronize Contracts and Documentation

- [x] Extend capability validation to cover plugin manifest, marketplace, skill
  tool references, and assets.
- [x] Update CLI/MCP/plugin installation docs and the capability manifest only
  where behavior is actually implemented.
- [x] Add focused tests for manifest drift, missing runtime/project binding,
  and read/preview/apply approval boundaries.

## 5. Verify and Install

- [x] Run the plugin validator from the plugin-creator skill.
- [x] Run focused unit/smoke tests.
- [x] Run `pnpm agent:validate`.
- [x] Run relevant lint/type/build checks from `trellis-check`.
- [x] Preview marketplace/install effects, then install through the Codex CLI.
- [x] Verify installed/enabled status; a new thread is required for tool discovery.
- [x] Record any remaining public-distribution prerequisites without claiming
  they are implemented.

## Rollback Points

- Plugin and marketplace source can be removed independently before runtime
  extraction begins.
- Shared MCP extraction must retain the old executable wrapper until all tests
  pass.
- Do not alter `.cutout` project data as part of plugin installation tests.
