# Implementation Plan

## 1. Project contracts and input validation

- [x] Add strict Project input/source/result/progress contracts.
- [x] Add bounded ordinary-record preprocessing with local reference descriptors.
- [x] Validate filenames, media signatures, decoded dimensions, byte limits, and duplicate hashes.
- [x] Add pure contract tests for accepted and rejected inputs.

## 2. Shared production executor

- [x] Extract the common eleven-role generation body from `runCommerceHeldOutProduction` into `executeCommerceProduction`.
- [x] Make held-out authority optional at the executor boundary and omit it from Project host context.
- [x] Preserve held-out wrapper preparation, native ingestion, rehearsal verification, and completion request.
- [x] Emit ordered progress and completed deliverables from the shared executor.
- [x] Add runner tests proving Project contexts omit held-out authority and Benchmark contexts retain it.

## 3. Project session and exports

- [x] Implement `runCommerceProjectProduction` with Provider preflight, graph compilation, project bindings, strict result assembly, and final validation.
- [x] Add helpers for safe filenames, retained-byte decoding, previews, individual download, and manifest/all export.
- [x] Export Project APIs from the Commerce profile barrel without changing CLI/MCP.

## 4. Commerce workbench

- [x] Split the panel into default Project and isolated Benchmark modes.
- [x] Add three JSON file inputs, one-to-three local image selection, Provider selection, run/cancel/reset/retry, stable progress, partial results, QA state, previews, and export controls.
- [x] Keep all evaluator language and `14/14` claims inside Benchmark mode.
- [x] Update UI tests for default Project behavior and isolated Benchmark behavior.

## 5. Contract and spec synchronization

- [x] Update `cutout.agent-capabilities.json` and generated plugin copy truthfully: desktop-only Project production is available; held-out binary remains evaluator-restricted; CLI/MCP remain unchanged.
- [x] Update Commerce production spec, including the stale `AGENT_LOG_DIR` requirement contradiction.
- [x] Run `pnpm agent:validate` after manifest synchronization.

## Validation

```bash
pnpm vitest run src/commerce-profile/production-runner.contract.test.ts src/commerce-profile/project-production.test.ts src/components/design-os-workbench/CommerceProductionPanel.test.tsx
pnpm lint
pnpm exec tsc --noEmit --pretty false
pnpm agent:validate
pnpm design-os:benchmark
git diff --check
```

## Risky Files And Rollback Points

- `src/commerce-profile/production-runner.ts`: preserve held-out receipt bindings and exact artifact order; run held-out contract tests immediately after extraction.
- `src/components/design-os-workbench/CommerceProductionPanel.tsx`: keep Benchmark state self-contained so Project reset/cancel cannot alter evaluator evidence.
- `cutout.agent-capabilities.json`: do not broaden CLI/MCP or generic Provider claims; synchronize the plugin runtime copy through the repository's established artifact update command.
