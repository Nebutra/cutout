# Implement — Generation quality: reskin-pipeline upgrades

## Checklist

1. [x] Prompt hardening in `src/prototype/generate-suite.ts` (page + design-system text discipline, per-region hard constraints). Tests pass unchanged.
2. [x] `regionBoardPrompt` hardening in `src/prototype/region-deconstruct.ts` (text exclusion + white-foreground safety).
3. [x] New `src/prototype/generation-qa.ts` + `generation-qa.test.ts` + new prompt catalog entry `ui-generation-qa` (registered in `src/prompts/catalog/index.ts`).
4. [x] Wired QA into `runRegionBreakdown` (`reviewBoard` dep, `qaMaxRetries`, `onRegionQa`).
5. [x] Wired QA into `generatePrototypePage` (serial + parallel paths; `chat` threaded through; flags `PROTOTYPE_QA_ENABLED` / `PROTOTYPE_QA_MAX_RETRIES` in IntentWorkspace.tsx).
6. [x] Validation: `tsc --noEmit -p tsconfig.app.json` clean; `vitest run src/prototype src/prompts` 139 passed. Full suite: only pre-existing unrelated failure (`AgentWorkspaceDock.edit.test.tsx` jsdom scrollIntoView — fails on stashed tree too).

## Validation commands

- `npx tsc --noEmit -p tsconfig.app.json` (NOT `-p .` — silent no-op)
- `npx vitest run src/prototype`

## Rollback points

- After step 2 (prompt-only changes shippable alone).
- After step 4 (QA module + board wiring shippable without page wiring).

## Deferred (follow-up child tasks)

- G4 chroma-key boards: tracked independently in
  `07-20-configurable-chroma-key-boards`. This is not part of the delivered
  white-board pipeline and must not be represented as available.
- G5 hard DESIGN.md gate: tracked independently in
  `07-20-design-markdown-hard-gate`. The later recovery contract deliberately
  preserves valid visual media, marks generated documentation
  `repair-required`, and permits valid imported DESIGN.md evidence. Changing
  that policy requires an explicit product decision rather than silently
  overriding the recovery contract while closing this prompt/QA task.

## Closure scope (2026-07-20)

This task is complete for its designed and shipped scope: G1, G2, and G3.
G4/G5 remain explicit follow-ups and are not claimed as implemented here.
