# Cutout asset production SOP closure audit

Date: 2026-07-19

## Executive finding

Cutout now has one authoritative Asset Production contract, snapshot and
transaction coordinator. Prototype, manual/worker, Agent tool, and semantic
production retain route-specific execution adapters but share begin, publish,
fail, carry, cancel and finalize transition composition.

The highest-value missing UI link was the review queue: a failed task without an
image existed in the snapshot but disappeared from `SliceOutcomeTabs`. This
audit closes that link by projecting `failed` and `needs-review` tasks into an
unframed blocker list with a retry action. It also removes the unreachable old
React Flow canvas implementation and executor/repository wrappers that had no
production consumer.

## Current production paths

### Prototype suite

1. The Agent plans the complete route set; page structure is open-world and not
   hard-coded to a single page.
2. The design system and final `DESIGN.md` become shared visual context for each
   planned page.
3. `createPrototypeAssetManifest` binds non-code UI regions to manifest ids.
4. `compilePrototypeProductionPlan` freezes source page hashes, plan hash,
   stable task ids, routes and board slot manifests.
5. `IntentWorkspace` starts a production run and executes `direct-generate`
   tasks and board groups with bounded concurrency.
6. Board candidates bind to declared spatial slots, never array position.
7. Candidate, review, verification, artifact and lineage evidence publish via
   reducer-validated transitions.
8. Ready or waived task publications project to slices, Outcome, Design IR,
   Library and Export. Failed/review tasks project to Review.

Main evidence:

- `src/prototype/planner.ts`
- `src/prototype/generate-suite.ts`
- `src/asset-production/adapters/prototype.ts`
- `src/components/workspace/IntentWorkspace.tsx`
- `src/asset-production/projection.ts`

### Manual/worker and Agent tool cutout

1. A cutout result is converted to a versioned import plan.
2. `publishToolCutoutProduction` uses `createAssetProductionRuntime` with a
   direct executor and memory repository.
3. The authoritative snapshot is committed with revision compare-and-swap.
4. Store slices are a browser projection of the current run, not independent
   production authority.

Main evidence:

- `src/asset-production/adapters/tool-cutout.ts`
- `src/hooks/useAnalysisBridge.ts`
- `src/services/cutout-result-sink.ts`
- `src/store/slices/asset-production.ts`
- `src/store/selectors.ts`

## Closed loops verified

- Stable task identity is derived from plan hash plus manifest id.
- Planned routes are binding; direct assets no longer fall through to a
  whole-page board fallback.
- Every planned prototype route is generated and shares design context.
- New outputs cannot be consumed until `ready` or revision-bound `waived`.
- Current-run selection prevents an older run's slices from replacing authority.
- Snapshot metadata, evidence, decisions and lineage survive project persistence.
- Outcome uses manifest task identity rather than filenames.
- Design IR and export consume current production projections.
- Review now includes failed tasks even when no image artifact exists.

## Closure completed 2026-07-20

### Semantic AI Native execution now publishes production

`run-semantic-slices` now publishes one stable task per unique semantic spec,
persists selected bytes, records validation evidence, projects available images,
and returns production identity. Missing outputs remain visible failed tasks;
unverified or rejected candidates remain non-consumable review tasks.

Evidence: `src/hooks/useAiNativeControl.ts`,
`src/services/ai/semantic-slices.ts`, and
`src/services/ai-native/actions.ts`.

### Lifecycle orchestration is shared

`asset-production/coordinator.ts` owns transition composition. Runtime and
prototype adapters no longer independently spell candidate/review/verification
state changes. Starting a new run also cancels the old active run explicitly.

### Workspace shadow failure state removed

Repair targeting, pending canvas labels and Review counts derive from the current
production task projection. The workspace no longer stores or fingerprints
`failedRegionIds`; the local region executor may still return failed ids as an
ephemeral call result, never authority.

### P2: legacy DAG control has no current canvas

The old `LinearCanvas` / `PlannedCanvas` UI and their node/edge/layout cluster
were unreachable and are removed. Graph state, DAG query execution and AI Native
`set-graph`/`rerun-subtree` actions still have callable consumers, so they are
not deleted as dead code. Their product surface should be reviewed separately:
either expose their state in the current Agent timeline or deprecate the public
actions and synchronize CLI/MCP/protocol/docs in one contract change.

## Removed dead code in this audit

- Unreachable `LinearCanvas`, `PlannedCanvas`, their React Flow nodes, edge,
  materializer and layout helpers.
- `createBoardCutoutExecutor`, whose only caller was its unit test. The live
  `assignBoardCandidates` identity/containment algorithm remains.
- `createSemanticRepairExecutor`, whose only callers were its unit tests. The
  reachable semantic AI Native experiment remains.
- `createStorageAssetProductionRepository`, which duplicated project
  persistence and had no caller. The runtime memory repository and durable
  project repository remain.
- The parallel `visual-decomposition.v1` proposal/review/apply protocol, whose
  only production exposure was a barrel export and which was not consumed by
  the current visual runtime or Asset Production.
- The unused pre-dock `AgentConversation` view/streaming hook and the unused
  resizable panel wrapper. Current conversation rendering is owned by
  `AgentWorkspaceDock`.
- The Home screen's static Library import. Library is now a Suspense-backed
  deferred view, reducing the production entry from 457.3 KiB to 389.5 KiB;
  the bundle gate requires the deferred chunk.

## Legitimate legacy that must remain

- Legacy slice migration and `legacy-ready` projection preserve old projects
  without inventing QA/provenance.
- Model assignment migrations preserve stored user provider settings.
- Explicit import-cutout routing is a current adapter, not a deprecated second
  source of truth.

## Remaining follow-up

1. Review graph/DAG public actions as an Agent-surface contract change.
2. Add E2E coverage for partial failure -> Review -> targeted repair -> restore
   -> Outcome/Export, including a task that fails before creating an image.
