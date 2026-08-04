# Execution plan

Ordering principle: **secure completed work first**, then spend the long
unattended block on the two things that have never been measured, then cheap
fixes. An overnight failure must never lose finished work.

## Phase 1 — Secure the tree `~40 min`

- [ ] 1.1 `git switch -c release/v0.1.19-rc`
- [ ] 1.2 Commit thread A (`08-04-unify-agent-provider-readiness`): `src-tauri/src/commands/ai/**`,
      capability manifest, schema, permissions, specs, docs
- [ ] 1.3 Commit thread B (`08-04-expandable-planning-progress`): `IntentWorkspace.tsx`,
      `agent-view-model.ts`, `AgentWorkspaceDock.tsx` + tests + spec
- [ ] 1.4 Write a PRD for thread C, then commit thread C (money/budget removal)
- [ ] 1.5 Commit remaining (locales, visual baselines, misc)

Gate after each commit: `npx tsc -b && npx oxlint`.

## Phase 2 — Governance truth `~45 min`

- [ ] 2.1 Delete 4 directories duplicated into `archive/`:
      `07-22-agent-response-regenerate`, `07-22-harden-release-updater-close-issues`,
      `07-27-agent-credential-adapters`, `07-28-simplify-automatic-ai-setup`
- [ ] 2.2 `task.py archive` the verified-complete tasks (see prd audit)
- [ ] 2.3 Commit the untracked task directories
- [ ] 2.4 Leave open: `08-03-publish-install-v0-1-16` (real failure, needs human),
      `07-20-authenticated-github-pr-host`, `07-20-configurable-chroma-key-boards`,
      and this task

Gate: `task.py list` shows only genuinely-open tasks.

## Phase 3 — The proof that has never run `~2-4 h` `core value`

- [ ] 3.1 `CUTOUT_RUN_TOOL_GATE_BENCHMARK=1` → `tool-gate-classification.integration.test.ts`,
      `human-loop-ask.e2e.test.tsx` (cheapest first, validates credentials work)
- [ ] 3.2 `CUTOUT_RUN_PIPELINE_BENCHMARK=1` → `prototype-planner.integration.test.ts`,
      `region-naming.integration.test.ts`, `gateway-images.integration.test.ts`
- [ ] 3.3 `CUTOUT_RUN_PIPELINE_BENCHMARK=1` → `prototype-pipeline.e2e.test.tsx` (the big one)
- [ ] 3.4 `CUTOUT_RUN_BRAND_BENCHMARK=1` → `brand-benchmark.integration.test.ts`
- [ ] 3.5 Write `docs/experiments/real-model-e2e-2026-08-05.md` with verdict, wall-clock, failures verbatim

Run each separately so one failure does not mask the rest. Capture full output.
**Record failures; do not fix-and-rerun to manufacture green.**

## Phase 4 — Packaged desktop evidence `~2 h` `macOS`

- [ ] 4.1 `bash scripts/build-packaged-e2e-macos.sh`
- [ ] 4.2 `CUTOUT_PACKAGED_E2E=1 bash scripts/smoke-packaged-macos.sh <bundle>/macos`
- [ ] 4.3 Record `cutout.packaged-e2e-result.v1`; note whether it unblocks
      `conversationBinding` / `turnExecution` behind `packaged-turn-execution-proof-required`

If signing identity is unavailable, record that as the blocking reason — do not fake it.

## Phase 5 — Close the loose ends `~90 min`

- [ ] 5.1 `src/visual-generation/contracts.ts:108` — read-path migration for `task.budget`→`task.execution`
- [ ] 5.2 `src/services/ai/planning-runtime.ts:52-57` — tolerate legacy evidence without `lastFailure`
- [ ] 5.3 `src/visual-generation/executor.ts:80` — restore a spend ceiling or record the decision
- [ ] 5.4 `tests/visual/workspace-layout.spec.ts:76` — tighten `/Back to Canvas|Back/` to `Back to Agent`
- [ ] 5.5 `src/design-kit/compiler.ts:609-616` — `pick` returns `T | undefined`; drop six type lies
- [ ] 5.6 `tests/visual/outcome-first.spec.ts:613` — justify or remove the 3× tolerance

## Phase 6 — Version + CI gaps `~90 min`

- [ ] 6.1 Bump 0.1.19 across the five sites `validate-release-version.mjs` enforces
- [ ] 6.2 CHANGELOG entry
- [ ] 6.3 `src/release-notes/catalog.json` — all five locales (hard release gate)
- [ ] 6.4 Add `i18n:ci` to `ci.yml` contract job (currently defined but never invoked)
- [ ] 6.5 Investigate the two `worker-6 ... force-killed` hangs from the full visual run

## Phase 7 — Brief `~30 min`

- [ ] 7.1 `docs/experiments/v0-1-19-review-brief.md`
- [ ] 7.2 Final full gate run
- [ ] 7.3 Report — including anything that failed

## Validation commands

```
npx tsc -b
npx oxlint
npx vitest run
cargo check --all-targets --manifest-path src-tauri/Cargo.toml
npx playwright test
pnpm agent:validate
node scripts/validate-release-version.mjs
```

## Rollback

Every phase is a separate commit on `release/v0.1.19-rc`. `main` is untouched.
`git reset --hard <sha>` returns to any phase boundary. Nothing is pushed.
