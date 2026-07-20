# Implementation plan

## Phase 1: Contracts and state machine

- [x] Add versioned Asset Production schemas, task/run states, evidence, review
  decisions and publication receipts under `src/asset-production/`.
- [x] Implement canonical hashing and deterministic plan/task/board ids.
- [x] Implement pure reducer transitions with explicit integrity and quality
  policy checks.
- [x] Add invariant tests for illegal success transitions, stale run/plan input,
  cancellation, partial completion, retry exhaustion and waiver invalidation.
- [x] Add a memory repository for deterministic runtime tests.

Validation:

```sh
pnpm exec vitest run src/asset-production
pnpm exec tsc -b --pretty false
```

Rollback point: contracts/reducer are additive and unused by production UI.

## Phase 2: Durable artifacts, snapshots and migration

- [x] Add the durable snapshot repository over the existing content-addressed
  artifact store.
- [x] Extend local project records with optional v1 production snapshot and
  additive legacy migration.
- [x] Include readiness, inclusion, bounds, review evidence, lineage and artifact
  revision in autosave fingerprints.
- [x] Implement restore/materialization from artifact ids.
- [x] Add migration tests for empty, flat legacy, region-linked legacy, repeated
  restore and rollback to old readers.

Validation:

```sh
pnpm exec vitest run src/services/local/project-repository.local.test.ts src/asset-production
```

Rollback point: old `slices` remain intact and readable.

## Phase 3: Runtime and executors

- [x] Implement `AssetProductionRuntime` orchestration and idempotent publication.
- [x] Wrap current CV `runPipeline` as the deterministic cutout applicator.
- [x] Add board layout manifests and strict slot/candidate coverage validation.
- [x] Implement direct-generate executor using existing generation services.
- [x] Adapt the reachable AI Native semantic-slices action as an explicit
  production/repair route with stable task identity, content-addressed outputs,
  QA evidence, UI projection and Agent-visible production identity.
- [x] Persist QA verdict, QA-unavailable, board diagnostics, cutout params and
  bounds instead of logging-only behavior.
- [x] Add full cancellation, late-result and targeted task repair tests.

Validation:

```sh
pnpm exec vitest run src/asset-production src/prototype/region-deconstruct.test.ts src/services/ai/semantic-slices.test.ts
```

Rollback point: runtime remains behind an internal projection/read gate.

## Phase 4: Migrate prototype production

- [x] Compile prototype asset manifests into binding production plans.
- [x] Replace region array-index binding with board slot/task identity.
- [x] Execute `direct-generate` rather than routing direct-only plans through the
  legacy whole-sheet fallback.
- [x] Replace `beginRegionSlices`/`appendRegionSlices`/`finishRegionSlices`
  orchestration with runtime transitions and UI projections.
- [x] Make failed/unknown QA and non-compliant boards visible in Needs Review.
- [x] Repair by task ids, preserving unaffected accepted revisions.
- [x] Add browser-capable E2E coverage through persistence restore and outcome.

Validation:

```sh
pnpm exec vitest run src/prototype src/components/workspace src/agent-runtime/prototype-outcome.test.ts
```

Rollback point: feature gate can project old slices while v1 snapshots remain.

## Phase 5: Migrate manual and Agent tool entry points

- [x] Adapt imported sheets and parameter reruns to versioned production runs.
- [x] Replace `CutoutResultSink.commitCutoutResult` with runtime task publication.
- [x] Preserve desktop executor revision/abort guards and paid-tool receipts.
- [x] Verify whole-sheet worker preview remains UI-only and cannot set production
  readiness.
- [x] Add cross-entry overwrite tests proving one origin cannot silently replace
  another run's authority.

Validation:

```sh
pnpm exec vitest run src/hooks src/services/cutout-result-sink.test.ts src/services/desktop-tool-executor.test.ts
```

## Phase 6: Replace consumers and Design IR projection

- [x] Project Files, Canvas, Assets and Review from current task publications.
- [x] Replace filename-based Outcome matching with manifest task identity.
- [x] Gate Export and Library on ready/approved-waived revisions while preserving
  grandfathered legacy export.
- [x] Project task/source/review lineage into Design IR material revisions and
  provenance.
- [x] Ensure `.cutout`/managed exports consume the same authoritative revisions.
- [x] Add save/restore/export/Design IR round-trip tests for every decision field.

Validation:

```sh
pnpm agent:validate
pnpm exec vitest run src/design-ir src/agent-runtime src/components/slices src/hooks/useExport.test.ts
```

## Phase 7: Remove split authority

- [x] Remove prototype fallback to legacy whole-page board for direct-only plans.
- [x] Remove production executors' direct writes to `analysis.slices`.
- [x] Delete filename/index identity inference and obsolete auto-naming completion
  coupling.
- [x] Keep one explicit legacy import adapter; remove duplicate completion
  selectors and stale comments/docs.
- [x] Update the Cutout pipeline spec and Agent capability/docs only where public
  contracts change; run `pnpm agent:validate` for any Agent-surface change.

Final validation:

```sh
pnpm lint --deny-warnings
pnpm exec tsc -b --pretty false
pnpm test
pnpm build
pnpm agent:validate
```

## Review gates

- [x] No production status derives solely from `slices.length` or naming status.
- [x] No new output can become Ready after QA reject/unavailable without an
  explicit revision-bound decision.
- [x] No identity mapping depends on array position or filename.
- [x] Cancelled/stale runs cannot publish or transition to completed.
- [x] Old projects are non-destructively recoverable and remain exportable with
  an honest legacy warning.
- [x] Design IR and project persistence retain task, source, artifact, review and
  provenance identity through round trip.

## Phase 8: User-value performance hardening

- [x] Fix unstable projected-slice subscriptions that crash React 19 AppShell.
- [x] Make real IntentWorkspace benchmarks provide IndexedDB, local Storage and
  provider verification behavior matching production preflight.
- [x] Preserve explicit page counts with one planner repair before image spend.
- [x] Run page, direct-asset and region-board generation with concurrency 2.
- [x] Wait for in-flight concurrent work before surfacing a failure.
- [x] Reduce paid visual QA retries from two to one while retaining Needs Review.
- [ ] Prove the real gateway pipeline commits every explicitly planned page.

## Phase 9: Cutout effect hardening

- [x] Add anchored, background-connected neutral haze matting without changing
  the global background threshold or component geometry.
- [x] Protect enclosed pale interiors, standalone pale-gray assets, chromatic
  artwork and existing partial-alpha inputs.
- [x] Add a gated real-board effect benchmark that exports transparent slices,
  a dark/light contact sheet and quantitative alpha/crop/slot evidence.
- [x] Prove six-of-six slot assignment, zero crop-edge contact, white-composite
  MAE <= 3/255 and bright-neutral opaque shadow residue < 0.5%.

## Phase 10: Closure and legacy cleanup

- [x] Project failed/needs-review tasks without image artifacts into the Review
  UI and provide a production retry action.
- [x] Remove the unreachable legacy React Flow canvas and its private node,
  edge, materialization and layout cluster.
- [x] Remove executor/repository wrappers that only had unit-test callers while
  preserving their live algorithms and adapters.
- [x] Re-audit the current SOP and distinguish closed flows, incomplete public
  experiments and required migration compatibility.
- [x] Derive repair targeting and pending canvas status from authoritative task
  projections instead of the workspace `failedRegionIds` shadow state.
- [x] Unify prototype, tool/manual and semantic lifecycle transitions behind one
  transaction coordinator, while retaining route-specific execution adapters.
