# Asset Production Runtime refactor

## Objective

Replace the current shared mutable slicing result flow with one versioned asset
production runtime. Every production entry point must compile a plan, execute
stable asset tasks, persist review/provenance evidence, and publish one canonical
snapshot from which the UI, Outcome, Design IR, Library and Export derive.

The refactor preserves the existing CV architecture and image providers. It
changes orchestration, identity, state ownership and consumption. The later
effect-hardening phase adds deterministic exterior white-haze recovery without
changing the global background threshold, component geometry or route identity.

## Architectural boundaries

### Authority

For new production runs, the authority is a versioned
`AssetProductionSnapshot` containing plan, run, task, candidate, evidence and
publication records. Raster bytes live in the existing content-addressed desktop
artifact store. The project record persists snapshot metadata and artifact ids;
Design IR receives material revisions and provenance at publication.

`analysis.slices` remains temporarily as a browser/UI projection. Executors may
not write it directly after their adapter is migrated.

### Runtime package

Create `src/asset-production/` with these owners:

- `contracts.ts`: Zod schemas and TypeScript types.
- `planner.ts`: compile plan and stable task/board ids.
- `reducer.ts`: pure lifecycle transitions and invariants.
- `runtime.ts`: orchestrate executors, review and atomic publication.
- `repository.ts`: snapshot and content-addressed artifact boundary.
- `quality-policy.ts`: deterministic blockers, review blockers and waiver rules.
- `projection.ts`: store/UI, outcome, Design IR and export projections.
- `migration.ts`: legacy project slice migration.
- `executors/board.ts`, `executors/direct.ts`, `executors/import.ts`.

Components and hooks consume projections; they do not mutate production state.

## Versioned contracts

### AssetProductionPlan v1

```ts
interface AssetProductionPlan {
  version: 'asset-production-plan.v1'
  planId: string
  planHash: Sha256
  sourceRevision: {
    projectRevisionId: string
    designSystemArtifactId?: string
    pageArtifacts: readonly { pageId: string; artifactId: string; sha256: Sha256 }[]
  }
  tasks: readonly AssetProductionTask[]
  createdAt: number
}
```

Task ids derive from `planHash + manifestItemId`; they never depend on array
position, filename or generation time.

```ts
interface AssetProductionTask {
  taskId: string
  manifestItemId: string
  pageId: string
  regionId: string
  route: 'board-cutout' | 'direct-generate' | 'semantic-repair' | 'import-cutout'
  required: boolean
  output: { mediaType: 'image/png'; subjectCount: 1; transparent: boolean }
  boardGroupId?: string
}
```

`ignore-code-ui` creates no production task and is recorded as a planner
decision. No runtime is allowed to rewrite a route implicitly.

### BoardLayoutManifest v1

Board batching is an optimization, not identity. Every board group declares
stable slots:

```ts
interface BoardLayoutManifest {
  version: 'asset-board-layout.v1'
  boardGroupId: string
  taskIds: readonly string[]
  slots: readonly {
    taskId: string
    normalizedBounds: { x: number; y: number; width: number; height: number }
  }[]
}
```

CV candidates are assigned by containment in declared slots. Publication
requires exactly one accepted candidate for each required slot and no ambiguous
cross-slot component. Count or containment mismatch becomes `needs-review`; it
is never repaired by index order. A semantic single-slice repair may replace one
failed slot while preserving the board group evidence.

### Run and task lifecycle

```text
run: planned -> running -> partial | needs-review | completed | failed | cancelled

task: queued -> generating -> candidate-ready -> reviewing
      -> accepted -> cutting -> verifying -> ready
      -> needs-review | failed | cancelled
```

Transitions are reducer-validated. `finally` blocks release resources but never
change a task/run to a successful state.

Each task records:

- source and candidate artifact ids/hashes
- attempt number and provider route
- review verdict and normalized issues
- board diagnostics and active cutout parameters
- source/sheet bounds and output artifact id/hash
- explicit user approval/waiver receipt when applicable
- timestamps and Agent run event ids

### Quality policy

Three classes prevent the old fail-open behavior:

1. **Integrity blockers, non-waivable**: source revision drift, missing or changed
   artifact, invalid hash, out-of-bounds crop, duplicate/missing task identity,
   incomplete required manifest coverage, empty output.
2. **Quality blockers, reviewable**: model QA rejection, unavailable model QA,
   background non-compliance, suspected merged subject, edge/alpha findings.
   Automatic retries run first; exhaustion yields `needs-review`.
3. **Warnings**: optional metadata/naming issues that do not change pixels or
   identity. They may publish with a warning if deterministic output integrity
   passes.

Explicit approval/waive is allowed only for class 2 and creates a decision
receipt bound to task id, candidate/output hash, project revision, issues, actor
and timestamp. A changed output invalidates the receipt.

### Publication

Publication is atomic per task and idempotent by task input hash:

1. Verify source revision and active run lease.
2. Write candidate/output bytes to content-addressed artifact storage.
3. Validate all artifact ids/hashes and evidence.
4. Append/update the task publication record.
5. Add a Design IR material revision and `derive` provenance edge.
6. Emit material/run events.
7. Recompute projections.

The runtime may expose partial accepted results, but the run is `completed` only
when every required task is `ready` or explicitly waived. `partial` and
`cancelled` never project as completed.

## Entry-point adapters

### Prototype adapter

- Compile `createPrototypeAssetManifest` into binding task ids.
- Execute `board-cutout` through board groups.
- Execute `direct-generate` as one semantic asset generation task, using page and
  design-system references.
- Record `ignore-code-ui` as an intentional no-op.
- Delete the fallback that sends a direct-only plan through whole-page board
  deconstruction.
- Retry by task ids. Region ids are only grouping metadata.

### Manual/import adapter

- Imported whole sheets compile `import-cutout` tasks after deterministic/vision
  decomposition proposes stable elements.
- User parameter changes create a new plan revision/run against the same source
  artifact; they do not overwrite history in place.
- The Source/Result/Review UI reads the same task evidence as prototype assets.

### Agent tool adapter

- Preserve the desktop executor's revision/abort guards, content-addressed writes
  and paid-tool receipt.
- Replace `createCutoutResultSink`'s direct store commit with runtime publication.
- Associate every output artifact id with its production task and provenance.

### Semantic repair adapter

- Promote the existing semantic-slices planner/generator/validator from
  experiment result to an executor.
- It is selected explicitly by plan or repair policy, never by silent fallback.
- A repaired asset keeps the original manifest task id and records the prior
  candidate as lineage.

Implemented 2026-07-20: the AI Native semantic action compiles one stable task
per unique spec, treats multiple model routes as candidates, persists selected
bytes content-addressably, records QA evidence, publishes ready/review/failed
state through the shared coordinator, projects available images, and returns
the production plan/run identity to the caller.

## Projections and consumers

### UI projection

Extend projected `Slice` with production identity while migration is active:

- `productionTaskId`
- `productionRunId`
- `outputArtifactId`
- `manifestItemId`
- `readiness`
- persisted `reviewIssues`, diagnostics and decision status

`analysis.status` is derived from the active production run. Legacy worker
preview can remain independently observable but cannot set production readiness.

### Outcome

Outcome evidence binds directly to `manifestItemId`. Filename matching is
removed. Only ready/approved-waived task publications count. Included/excluded is
a consumption decision and does not mutate production success; Outcome and
Export explicitly apply their own inclusion policy on ready revisions.

### Review and export

- Needs Review shows all reviewable blockers and their evidence.
- Export consumes only ready or explicitly approved-waived current revisions.
- Legacy grandfathered assets remain exportable with `legacy-unverified`
  warning; new unverified assets do not.

### Persistence and Design IR

- Add `assetProduction?: AssetProductionSnapshot` to project persistence.
- Fingerprint every field that affects readiness, consumption, bounds, lineage or
  current artifact revision.
- Resolve output blobs from content-addressed ids during restore.
- Project exact page/region/manifest/task provenance into Design IR rather than a
  project-level generic provenance record.

## Migration

### Existing projects

On first restore without `assetProduction`:

1. Hash each stored slice and write it to the content-addressed store.
2. Create a deterministic legacy task id from project id + slice id + hash.
3. Preserve name, box, included, region/page/manifest fields when present.
4. Mark `origin = legacy-imported`, `verification = legacy-unverified`, and
   `publicationPolicy = grandfathered`.
5. Do not invent QA, source hash, manifest identity or review receipts.

Legacy assets remain visible/exportable. Any regeneration creates a normal v1
task subject to current quality policy.

### Compatibility window

During migration:

- project records write both v1 snapshot metadata and the existing slice payload
  required by the current UI restore path;
- projections compare both representations in tests;
- direct legacy writes are removed one entry point at a time;
- dual-write is deleted only after all entry points and restore/export paths use
  v1 authority.

## Concurrency, cancellation and recovery

- Run id and plan hash guard every transition.
- A new run cancels/supersedes the prior active run but never deletes its already
  published immutable task revisions.
- Late callbacks are discarded before artifact publication.
- Cancellation records `cancelled`; cleanup cannot call a success transition.
- Task attempts and task publications are idempotent and recoverable from stored
  checkpoints.
- Targeted repair reruns task ids and their dependent board/semantic node only.

## Rollout and rollback

Feature-gate new production authority internally until projection parity tests
pass. Rollback switches reads to the old stored slices without deleting v1
snapshots/artifacts. New code must never destructively migrate or rewrite old
records; migration is additive and idempotent.

## Out of scope

- Replacing deterministic CV with an ML segmentation/matting provider.
- Cloud collaboration or hosted production state.
- Live Figma sync.
- New image/video provider integrations.
- A public HTTP MCP transport.
