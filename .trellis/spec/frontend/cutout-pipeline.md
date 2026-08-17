# Cutout Pipeline (`src/algorithm/`) — Edge Contract

> Executable contract for the white-background cutout CV pipeline. Captured from
> task `07-17-soft-edge-matting` (2026-07-17).

---

## Stage Order (runPipeline)

```
1. floodBackground(frame, threshold)  → border-seeded 4-connected background mask
2. applyAlphaCut(frame, background)   → background alpha = 0 (binary, unchanged)
3. matteExteriorHaze(frame, background) → broad exterior neutral shadow/haze recovery
4. softenMaskEdges(frame, background) → soft alpha matting on the 1px boundary band
5. findComponents → mergeBoxes → splitCompositeBoxes → filterUiContainers → pad/sort
```

`frame.data` is worker-owned; stages 2–4 mutate it in place (spec 4b). This is
deliberate, not an immutability violation.

## Scenario: Product-Owned Cutout Parameters

### 1. Scope / Trigger

Apply this contract whenever the source panel, project restore, automatic
analysis, or the worker cutout request changes. Threshold, minimum area, merge
gap, and padding are algorithm inputs, not user or Agent preferences.

### 2. Signatures

```typescript
const DEFAULT_PARAMS: Readonly<CutoutParams>
restoreProject(input: ProjectRestoreInput): void
useAutoRun(analyze: (wantSlices: boolean) => void): void
parseAiNativeAction(action: unknown): AiNativeAction
```

### 3. Contracts

- `DEFAULT_PARAMS` is the sole product-owned configuration supplied to the
  deterministic worker pipeline.
- Store state exposes no `setParam` or `resetParams` mutation API. UI and Agent
  surfaces expose no slider, reset, patch, or numeric quick-fix command.
- Project restore installs `DEFAULT_PARAMS`; persisted input cannot override
  product-owned cutout parameters.
- `useAutoRun` analyzes each newly loaded `autoAnalyze` source identity once.
  Agent-managed sources with `autoAnalyze: false` and restored sources that
  already contain slices do not start a duplicate worker run.
- Image-specific automatic estimation may replace the default provider later,
  but it must remain behind the worker `CutoutParams` boundary and must not
  reintroduce manual controls.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| New product-managed source loads | Start exactly one analysis with slices |
| Agent-managed source loads | Do not start a duplicate analysis |
| Restored source already has slices | Preserve the restored projection; do not auto-rerun |
| Analysis returns no regions | Show neutral retry guidance without parameter terminology or numeric tuning |

### 5. Good / Base / Bad Cases

- Good: importing a new sheet automatically cuts it with internal defaults and
  presents results without asking the user to tune computer-vision values.
- Base: a sheet produces no reusable regions; the UI suggests another source
  and leaves explicit rerun available without exposing implementation knobs.
- Bad: a hidden CLI action, persisted value, settings reset, or empty-
  state quick fix can mutate the worker parameters.

### 6. Tests Required

- Static UI regression proving parameter components are absent and settings /
  empty states contain no mutation commands.
- Store regression proving the params object is frozen, mutation actions are
  absent, and project restore always installs the product defaults.
- Auto-run hook regressions for one run per source identity and no duplicate
  Agent-managed run.
- Repository guidance regression covering current CLI/API documentation and
  historical design instructions that could otherwise reintroduce controls.

### 7. Wrong vs Correct

```typescript
// Wrong: make algorithm internals a supported control surface.
store.setParam('threshold', 236)
dispatch({ type: 'set-params', params: { minArea: 400 } })

// Correct: keep the parameter contract behind automatic source analysis.
const params = DEFAULT_PARAMS
worker.postMessage({ type: 'analyze', imageId, runId, params, wantSlices: true })
```

## Board Compliance Diagnostics (task `07-17-board-compliance-diagnostics`)

The white pipeline silently degrades when the image model ignores the
pure-white board instruction. `computeBoardDiagnostics(frame, threshold)`
(`src/algorithm/boardDiagnostics.ts`, pure, single pass, no mutation) measures
this BEFORE `runPipeline` mutates the frame:

- border band = `max(2, round(min(w,h) * 0.025))`; `borderWhiteRatio` /
  `whiteRatio` use `isBackgroundPixel` with the ACTIVE threshold (never a
  hard-coded 246) so compliance agrees with floodBackground.
- `compliant = borderWhiteRatio >= BOARD_BORDER_WHITE_MIN_RATIO (0.55)`,
  tunable, outside the verbatim-port contract.
- Wiring: `sliceRegionBoardBitmap` returns `{ slices, diagnostics }`;
  `runRegionBreakdown` fires optional `onRegionDiagnostics` (before
  `onRegionSliced`) and returns `diagnosticsByRegion` (succeeded regions only).
  Diagnostics are persisted in production task evidence. In the prototype
  production baseline, non-compliance is observational: a deterministically
  assigned, decoded, persisted, and verified output remains consumable with a
  warning. A workflow may classify a quality concern as blocking only through
  its explicit quality policy; integrity failures are never downgraded.
- `regionBoardPrompt` forbids model-added text labels/captions/numbering/
  watermarks (redrawn text becomes garbled pixel "assets").

**Decision record**: LayerForge's adaptive background keying (border color
histogram → flood with detected key colors, rejection guard
removedRatio ∈ [0.08, 0.92]) and vision-model bounds with focused retry were
evaluated and deferred — adaptive keying only after `diagnosticsByRegion`
data shows material non-compliance frequency; vision bounds only as a
CV-suspect fallback, never unconditionally (cost/latency negative otherwise).

**ImageMagick evaluation (2026-07-29)**: do not add ImageMagick as the default
white-board slicer or Alpha post-processor based on the current evidence. On
the six-item effect fixture, border-connected fuzzy-white flood plus connected
components preserved 6/6 spatial slots but produced binary Alpha, increased
bright neutral opacity around the bottle shadow, and increased common-canvas
white-recomposition error. Applying `Smooth Diamond:1` only to Cutout's Alpha
reduced PNG bytes but did not improve visual quality and also increased
recomposition error. Revisit only with a new failing fixture and a targeted
operation that beats the existing pipeline on semantic coverage and the same-
canvas Alpha/recomposition gates. Reproduce with
`scripts/benchmark-imagemagick-slicing.mjs`; ImageMagick remains a developer
benchmark dependency, not a bundled or declared runtime capability.

## Scenario: Asset Production Authority

### 1. Scope / Trigger

This contract applies whenever a source image, generated prototype page, or
Agent cutout operation creates reusable raster assets. It prevents executors,
UI slices, persistence, Outcome, Design IR, and Export from independently
deciding which result is current or ready.

### 2. Signatures

```typescript
compileAssetProductionPlan(input: CompileAssetProductionPlanInput): Promise<AssetProductionPlan>
reduceAssetProduction(snapshot: AssetProductionSnapshot, event: AssetProductionEvent): AssetProductionSnapshot
beginAssetProduction(input: BeginAssetProductionInput): AssetProductionSnapshot
publishAssetProductionTask(input: PublishAssetProductionTaskInput): AssetProductionSnapshot
projectProductionMaterials(snapshot: AssetProductionSnapshot, runId?: string): readonly ProductionMaterialProjection[]
projectProductionReviewQueue(snapshot: AssetProductionSnapshot, runId?: string): readonly ProductionReviewProjection[]
createRestoreInputFromProject(record: LocalProjectRecord): Promise<ProjectRestoreInput>
measureForegroundCoverage(
  frame: PixelFrame,
  boxes: readonly Box[],
): PipelineForegroundCoverage
slicingCoverageIssues(
  coverage: PipelineForegroundCoverage,
): readonly ProductionIssue[]
```

The persisted record carries `assetProduction?: AssetProductionSnapshot` and
the Zustand store carries `assetProduction: AssetProductionSnapshot`.
`analysis.slices` is a compatibility/UI projection only.

### 3. Contracts

- Task identity derives from `planHash + manifestItemId`; array position,
  filename, and completion order are never identity.
- Every new output binds `projectRevisionId`, `planId`, `runId`, `taskId`,
  `manifestItemId`, source artifact hash, output artifact hash, route, bounds,
  CV parameters, diagnostics, slice-foreground coverage, QA verdict, and
  lineage where applicable. The same coverage evidence projects into Design IR;
  persistence must validate that retained plus omitted pixels equals the total
  and that `retainedRatio` agrees with those counts.
- `direct-generate`, `board-cutout`, and `import-cutout` are current explicit
  routes. No executor may silently reinterpret one as another.
- Lifecycle composition belongs to `asset-production/coordinator.ts`. Prototype
  and manual/tool adapters may own execution strategy, but they must not
  duplicate the candidate -> review -> verify transition sequence.
- Starting a new run explicitly supersedes the previous active run. Merely
  changing `activeRunId` while leaving the old run `running` is invalid history.
- When prototype resource production throws after publishing a blocking task,
  settle every still-open task with interruption evidence and immediately
  cancel the non-completed run. Cancellation preserves settled `ready`,
  `waived`, `failed`, and `needs-review` task state, including candidate bytes
  and coverage evidence. Releasing authority must not depend on a later sibling
  run happening to supersede it.
- Content bytes are stored under `artifact:sha256:<digest>`. Concurrent writes
  of the same digest must converge on one existing record rather than failing
  with a duplicate-key transaction error.
- Only `ready` and revision-bound `waived` publications are consumable. A new
  plan/source revision supersedes current
  authority without deleting immutable historical runs.
- A board layout with exactly one planned task may represent that one logical
  material as several disconnected CV foreground crops. Assignment must retain
  their board-relative positions, render one transparent union-bounds PNG, and
  publish only that composite for the task. Zero crops remain an integrity
  failure, and layouts with multiple tasks keep strict one-candidate-per-slot
  ambiguity and crossing checks.
- After the final padded boxes are known, the deterministic pipeline measures
  all non-zero-Alpha foreground retained by their union. Omission at or above
  the pipeline's own foreground noise floor is blocking quality evidence. This
  closes the gap where every slot exists and every output edge is transparent,
  but a small disconnected subject part was silently filtered before cropping.
- Review is a projection of authoritative `needs-review` and `failed` tasks,
  not only of slices with image blobs. A task that fails before producing an
  artifact remains visible with its evidence and a retry path.
- A projected review slice and its task record count once. Match them by stable
  `productionTaskId`; never duplicate the same blocker in image and text rows.
- Repair targets and pending canvas status derive from the current task
  projection. `failedRegionIds` is not workspace state or persistence input;
  region ids are grouping metadata produced at the repair-planner boundary.
- Restore resolves missing projected slice blobs from their output artifact id
  or exact production task publication before rebuilding UI state.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Source/plan/run mismatch, stale callback, invalid hash, missing output, invalid bounds, ambiguous/missing board slot | Integrity failure; never waive or export |
| Applicable policy classifies an issue as blocking quality | `needs-review`; preserve evidence; explicit revision-bound approval required |
| Prototype visual QA rejects/is unavailable or deterministic output edges violate the planned transparent/full-bleed contract | Preserve `needs-review`; block consumption and do not start Provider work automatically |
| Final crop boxes omit foreground at or above the pipeline noise floor | Preserve the candidate and coverage evidence as `needs-review`; explicit Retry targets that region |
| Persisted coverage counts do not reconcile or its ratio disagrees | Reject the evidence at the schema boundary; never infer corrected measurements |
| Board background diagnostics are non-compliant but assigned output passes semantic QA and deterministic Alpha-edge checks | Preserve a warning on the `ready` task |
| Task fails before an image artifact exists | Show an authoritative Review blocker and retry action; do not disappear because no `Slice` exists |
| Output changes after approval | Invalidate the old decision receipt |
| Run is cancelled or superseded | Late results cannot publish or mark the run complete |
| Resource production publishes `needs-review` or `failed` evidence and then rejects | Preserve settled task evidence, fail remaining open tasks, and cancel the run before returning the error |
| New run starts while another run is active | Mark the old run `cancelled`, preserve settled task history, then bind the new run as active |
| Restore lacks projected blob but has a valid artifact id | Materialize from content-addressed storage |
| Restore lacks both blob and recoverable artifact | Fail recovery explicitly; do not invent pixels or readiness |
| Project lacks valid production metadata | Use an empty current snapshot; do not infer readiness, QA, or manifest evidence from slices |
| One planned board material produces several contained foreground crops | Composite them at their original relative offsets into one transparent artifact |
| Multiple planned board materials produce ambiguous crops | Fail slot assignment; never guess or merge across task slots |

### 5. Good / Base / Bad Cases

- Good: all required task publications verify and the current run projects to
  Files, Canvas, Assets, Review, Outcome, Design IR, and Export consistently.
- Base: an explicitly blocking quality issue publishes evidence as
  `needs-review`; UI can inspect it, but consumers stay blocked until a receipt
  bound to that exact revision is recorded. A board-background-only warning may
  remain visible on a consumable `ready` task.
- Base: a blocked crop cancels its incomplete run immediately. Its candidate,
  blocking issue, and coverage evidence remain available for exact Retry
  recovery even when no later sibling starts.
- Bad: a component appends a Blob to `analysis.slices` and treats
  `slices.length > 0` as production completion.
- Bad: slot counts and transparent outer edges pass, so the workflow ignores
  foreground pixels that the final crop boxes did not retain.

### 6. Tests Required

- Reducer tests: illegal transitions, stale run/plan, cancellation, partial
  success, waiver invalidation, and authority supersession.
- Adapter tests: prototype board/direct routes, manual worker, Agent tool,
  targeted repair, and cross-entry overwrite prevention.
- Planner/persistence tests: retired routes and statuses fail current schema validation.
- Coordinator tests: new-run supersession, shared publication sequence, carry
  of settled revisions, cancellation and finalize behavior.
- Prototype adapter/rendered tests: a deterministic coverage failure leaves the
  run `cancelled`, the task `needs-review`, and candidate bytes intact before
  any sibling can supersede it; Retry targets only that region.
- Projection tests: review and failed tasks remain visible with and without an
  image artifact, and projected slices deduplicate their task blocker.
- Persistence tests: strict current snapshot parsing, artifact-id materialization,
  repeated restore, reconciled slice-coverage evidence, and decision/evidence
  round-trip into Design IR and Export.
- Pipeline/QA tests: retained foreground passes; an independently detected part
  filtered below the output set produces `slice-foreground-omitted`; zero
  measurable foreground fails closed.
- Browser E2E: real canvas CV -> content-addressed writes -> task publication ->
  project restore -> current material projection -> `ready-to-deliver` Outcome.
- Content store test: concurrent identical SHA-256 writes deduplicate and quota
  counts the bytes once.

### 7. Wrong vs Correct

```typescript
// Wrong: mutable UI state becomes production authority.
appendSliceProjection(slice)
if (analysis.slices.length > 0) markReady()

// Wrong: complete slot count says nothing about small omitted parts.
if (assignedSlots === plannedSlots) publishReady()

// Wrong: blocked authority is released only if another sibling starts later.
publishNeedsReview(task)
throw error

// Correct: publish through the shared coordinator, then derive the UI.
const coverage = measureForegroundCoverage(frame, boxes)
const coverageIssues = slicingCoverageIssues(coverage)
let production = publishAssetProductionTask({
  snapshot,
  runId,
  taskId,
  artifact,
  reviewIssues: [...reviewIssues, ...coverageIssues],
  evidence: { ...evidence, sliceCoverage: coverage },
})
commitProduction(production)
replaceProductionSliceProjection(projectProductionMaterials(production))
production = cancelAssetProduction(production, runId, Date.now())
commitProduction(production)
```

## Scenario: Production Throughput And E2E Evidence

### 1. Scope / Trigger

Apply this contract whenever prototype planning, image generation, QA, or
region extraction changes. Schema-valid output alone is insufficient: the
journey must preserve explicit user scope and complete within a bounded amount
of Provider work.

### 2. Signatures

```typescript
explicitPrototypePageCount(brief: string): number | null
compilePrototypeImageRequestBudget(input: {
  designSystemCalls: number,
  suites: readonly Pick<PrototypePlan, 'pages'>[],
}): PrototypeImageRequestBudget
forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>,
): Promise<void>
selectSliceCount(state: Store): number

type PackagedE2eFailureDiagnostic =
  | 'provider-output'
  | 'prototype-viewport'
  | 'board-decode'
  // ...the remainder of the closed credential-free diagnostic vocabulary

enum PackagedE2eFailureDiagnostic {
  ProviderOutput,
  PrototypeViewport,
  BoardDecode,
  // ...the exact same closed vocabulary, serialized as kebab-case
}
```

Real gateway benchmarks are opt-in with
`CUTOUT_RUN_PIPELINE_BENCHMARK=1`, `MOX_API_KEY`, and `MOX_BASE_URL`.

### 3. Contracts

- Route topology is an Agent planning result derived from the user's outcome,
  business domain, content model, platform conventions, and complete user
  journeys. A page/screen count mentioned in the brief is evidence or a budget
  preference, not an automatic override. The Agent may clarify or explain a
  different complete topology; deterministic validation checks graph integrity,
  not equality to a parsed number.
- Design System candidate generation uses a combined concurrency ceiling of 3;
  the Agent-authored candidate count remains independent of that engineering
  bound.
- Generic image transport support and prototype task fitness are separate.
  Ordinary edit-image accepts any exact reviewed executable route; complete
  UI/UX production accepts only `gpt-image-2`, `qwen-image-3.0`, or
  `qwen-image-3.0-pro`. A missing task-fit route fails before prototype spend
  and never degrades to GPT Image 1/1.5.
- One-page suites may use previous-page serial conditioning. Larger suites use
  stable per-suite lanes under the shared concurrency ceiling of 3 against the
  selected Design System and first-page anchor.
- Direct assets use bounded concurrency 3. Task ids, CAS
  publication, and per-region failure isolation remain unchanged.
- Each Agent-authored route seed declares zero or more reusable non-UI visual
  materials based on genuine reuse value and non-code-reproducibility. Zero is
  valid. Each new `board-cutout` material declares a route-local
  `boardGroupId`; deterministic closure creates one exact-layout region per
  authored group, creates one `direct-generate` region per art-directed
  standalone material, and keeps ordinary layout regions `ignore-code-ui`.
  Seeds without group ids are incomplete current records and are rejected.
  Closure never pads a route to a requested or benchmark count.
- Compile the logical prototype graph into an explicit Provider-request budget.
  Heterogeneous fixtures include pages with zero, one, and several useful
  materials and compute their expectation as Design Systems + actual pages +
  actual board regions + actual direct assets. Mandatory hidden refine,
  text-free prepass, or automatic QA re-roll nodes must not inflate that
  resolved baseline. No fixture quantity becomes a production target.
- Route and asset counts are never production constants. They resolve from the
  Agent-authored business topology and useful material plan. The general baseline is
  `Design System calls + actual pages + actual board-cutout regions + explicit
  direct-generate assets`, compiled from the resolved plans.
- One logical page node uses one initial Provider image invocation. A classified
  transient transport failure (`408`, `429`, `5xx`, timeout, network reset)
  may re-enter the shared suite lane once with a fresh `attempt-N` tool-call
  identity and the same stable logical-node identity. The limiter observes the
  first failure before the retry is queued, so it lowers future concurrency and
  the retry returns at the lane tail instead of bypassing sibling fairness.
  Credential, configuration, policy, material, output, decode, viewport, and QA
  failures never use this transport retry. OpenAI-shaped routes consume the
  selected Design System and stable anchor through `edit-image`; the desktop
  executor preserves every bounded ordered reference or fails closed when one
  is unavailable.
- QA is evidence by default. It records a verdict and review issues with zero
  automatic Provider re-rolls; regeneration requires a later explicit user/Agent
  decision and a new bounded attempt identity.
- Compact board groups use the page, Design System, and at most one stable
  anchor as visual context. They do not generate a text-free page prepass, and
  independent page/group work runs with a combined concurrency ceiling of 3.
  The outer page pool owns that budget; groups within one active page run
  serially so nested pools cannot amplify Provider traffic to 9.
- Complete-suite alternatives resolve their route graphs through a serial
  planning barrier so every later direction sees all earlier topologies. After
  that barrier, every suite may run concurrently under the shared page,
  direct-asset, and board image ceiling of 3. The preferred direction queues
  first and exclusively owns the singular workspace projection until a human
  selects another ready direction. Ownership then follows that selection while
  in-flight siblings continue writing only candidate-local artifacts.
  Revisioned Asset Production publication remains single-writer until its
  snapshot contract supports conflict-free run merges.
- The shared image limiter serves stable suite lanes round-robin so the first
  completed anchor cannot flood every free slot with one suite's followers.
  Authentication and configuration failures close queued and future image
  claims while allowing already in-flight calls to settle. Rate-limit, timeout,
  network, and 5xx pressure lowers the future shared ceiling one step at a time
  while independent queued suites continue. Two consecutive successful image
  calls then recover one slot, bounded by the original ceiling; a new transient
  failure resets recovery evidence. Candidate-local integrity/quality
  failures do not close or throttle normal product or packaged benchmark work.
  A strict packaged 3/3 proof remains incomplete until every failed frontier is
  retried successfully, while independent siblings continue toward useful,
  candidate-local outcomes.
- Cold or recently pressured exact routes admit one Provider image call. Every
  transient page/direct/board attempt re-resolves quality-ranked task-fit
  candidates through shared route health; the successful route, not a captured
  pre-retry assignment, decides QA Provider ownership. Same-Provider Vision QA
  consumes the shared ceiling through a non-image Provider lane, while a
  distinct Provider uses its independent QA limiter. QA settlement cannot
  throttle, recover, or open image-route circuits.
- Production visual QA is a blocking quality gate after the first attempt.
  Rejection or unavailability preserves `needs-review` evidence and never starts
  an automatic Provider re-roll. Explicit Retry resumes only rejected pages or
  resource regions and carries already passing nodes.
- Page progress counts only valid QA-passing review receipts. Image bytes that
  returned but remain unreviewed or rejected stay inspectable evidence and do
  not produce a temporary `complete` state.
- Concurrent pools stop claiming new work after the first uncaught failure,
  wait for already in-flight work to settle, then reject. They never return
  while callbacks can still publish late state.
- Zustand effects that need only a count subscribe to a primitive selector.
  They must not subscribe directly to a selector that allocates an array.
- Real pipeline E2E succeeds only when every planned page is committed. The
  first concurrently completed page is not delivery.
- The packaged business-scenario E2E accepts 1-12 Agent-authored routes per
  suite, validates useful attributable assets from each resolved material plan,
  and derives its expected image-call count from the actual page, board, and
  standalone-asset graph. It owns no per-page asset-count constant.
- The packaged benchmark requires exactly 3/3 complete suites. Every failed
  suite retains its own real retry frontier without cancelling independent
  siblings. One acknowledged Retry claims all currently failed suite frontiers
  and resumes them concurrently under the same shared image ceiling; ready
  candidates and passing page/resource nodes are never replayed. Requiring one
  user click and a new full settlement cycle per failed sibling is invalid
  serial recovery for a parallel DAG.
- A packaged suite proves release fidelity only with
  `qualityReviewStatus=passed`. Product-owned `attention-required` remains a
  valid review state, but the driver and external evidence validator reject it
  as terminal release proof.
- A packaged quality rejection retains only closed aggregate counts for page
  rejection/unavailability, resource rejection/unavailability, and resource
  observational issues. It attempts the fixed `prototype-suites` native
  capture before writing the terminal failure. Provider/model identity, review
  text, prompts, paths, runtime candidate ids, and credentials never enter this
  diagnostic projection.
- Planning validation, persisted suite candidates, delivery evidence, and Retry
  matching share one canonical route-graph projection containing page identity,
  semantic regions, interactions, and flows. Packaged renderer, native, and
  external validation compare the SHA-256 of that retained canonical graph
  object, never a separately reconstructed route-string list.
- Terminal packaged evidence stores the canonical Agent plan, authoritative
  Design IR, delivery documents, and every raster as native-written
  `objects/<sha256>`. The native sink decodes uploads, recomputes length/hash and
  intrinsic raster dimensions, then re-reads every object. The standalone
  external validator repeats those checks and rejects self-reported hashes,
  missing objects, duplicate media, 1x1/scaffold captures, or plan/manifest/
  binding/review cardinality drift.
- The macOS packaged runner initializes one visible-to-WebKit accessory window
  as non-focusable and click-through, orders it behind the user's windows once,
  and thereafter reorders/deactivates only after AppKit reports active, key, or
  main ownership. A polling tick must be read-only while the window is already
  safe; repeated unconditional `orderBack` calls are themselves an activation
  hazard. External consecutive frontmost sampling remains a hard failure gate.
- Packaged E2E failure evidence uses a closed credential-free vocabulary that
  distinguishes Provider transport/output from board decode, zero-slice,
  slot-assignment, and artifact-persistence failures. Raw Provider ids,
  responses, paths, and credentials never enter the result bundle.
- A terminal `failed` result carries no success `outcome`. It retains only the
  closed failure record, bounded planner progress, and observed phase ledger;
  renderer, Rust persistence, and the external validator reject mixed terminal
  state instead of preserving a partial or stale success graph.
- `PackagedE2eFailureDiagnostic` is one cross-language IPC contract. The
  TypeScript union, Rust serde enum, external evidence validator, and their
  fixtures must contain exactly the same serialized kebab-case values. Adding
  or renaming a frontend diagnostic without the Rust variant is a terminal-
  settlement defect: `packaged_e2e_complete` rejects the otherwise valid
  failure payload and no `result.json` can be written. A truthful failed run
  must still cross IPC, publish a terminal result, and retain sanitized
  evidence; only unknown or secret-bearing diagnostics fail deserialization.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| User mentions N pages but the complete business topology differs | Agent explains or clarifies the resolved graph; do not mechanically pad, merge, repair, or fail on count equality |
| Provider cannot author a valid business topology | Fail closed; do not silently use a generic one-page fallback |
| Generic image route is executable but not prototype-task-fit | Keep ordinary edit support; reject prototype production before spend and do not fall back to GPT Image 1/1.5 |
| Route has no reusable non-UI visual material | Preserve zero materials and create no board/direct material region |
| Route has several coherent atomic material families | Preserve Agent-authored `boardGroupId` boundaries as separate board regions; do not collapse them by page |
| Route has art-directed standalone materials | Preserve each as its own `direct-generate` region |
| One concurrent task hits authentication/configuration failure | Stop new claims, settle in-flight work, then surface the first error |
| One page call hits transient Provider pressure | Lower future concurrency, requeue that logical page once at its suite-lane tail with a fresh attempt id, and preserve all independent work |
| A transient retry has another healthy task-fit exact route | Re-resolve after the failure and use the healthier route; do not capture the first route outside the retry loop |
| Prototype QA reviewer unavailable after deterministic validity succeeds | Preserve candidate as `needs-review`; no Provider re-roll loop |
| Packaged 3/3 suite benchmark has one or more failed suites | Retain every frontier while independent siblings continue; one Retry resumes all failed suites under the shared ceiling |
| Packaged suite has rejected or unavailable visual QA | Reject terminal release proof; retain the product review evidence |
| Frontend emits a closed diagnostic such as `prototype-viewport` | Rust accepts the matching serde variant and writes a failed terminal result with that diagnostic |
| Frontend diagnostic is absent from Rust or the external validator | Contract tests fail; do not run or release a packaged candidate |
| Selector allocates a new collection each store read | Use `useShallow` or project a stable primitive |
| Benchmark has fewer committed pages than its plan | E2E failure |

### 5. Good / Base / Bad Cases

- Good: a brief mentions two pages, the Agent derives a complete three-route
  restaurant journey and explains the additional order-status destination;
  generation then waits for all three planned routes.
- Base: a provider outage fails during planning or marks generated candidates
  for review without expanding Provider retries.
- Base: a generated page has the wrong intrinsic orientation; the frontend
  emits `prototype-viewport`, Rust persists the failed result, and the smoke
  owner finalizes evidence with a non-zero exit.
- Bad: a failed Agent planner silently becomes a generic `core` page, or the
  test unmounts when the first planned page arrives and aborts its siblings.
- Bad: TypeScript adds a diagnostic literal but Rust omits the corresponding
  enum variant, so the failure-reporting IPC call itself fails and the runner
  appears to hang without `result.json`.

### 6. Tests Required

- Hook mount regression proving empty slice projection does not trigger React
  `getSnapshot` / maximum-depth errors.
- Planner unit tests proving count mentions are parsed only as planning evidence,
  do not force repair/failure, and cannot authorize a generic local topology.
- Async-pool tests for maximum concurrency, complete visitation, invalid limit,
  and failure convergence without late work.
- Region tests proving concurrency 2, per-region isolation, diagnostics-before-
  slice ordering within each region, and bitmap cleanup.
- Planning-seed closure tests proving zero-material routes stay zero, multiple
  authored `boardGroupId` values become multiple board regions, missing group
  ids fail validation, and `direct-generate` materials stay standalone
  without any per-page quota.
- Component coverage proving every logical page in the resolved fixture issues
  exactly one baseline page call, with one Design System reference for anchors
  and Design System + anchor for the remaining pages.
- Desktop executor coverage proving multi-reference edits preserve input order
  and do not silently drop later references.
- Production wiring coverage proving multiple board groups on one page and
  boards across pages run concurrently, keep bounded reference context, and do
  not enable a text-free Provider prepass.
- Packaged benchmark coverage proving a failed suite preserves independent
  siblings and exposes Retry only for real failed frontiers.
- Rendered multi-suite coverage proving a first transient page failure retries
  once with `attempt-2`, a second transient failure closes that suite, and a
  non-transient output failure does not retry locally. One later Retry must
  concurrently resume every failed suite without replaying ready siblings or
  passing pages. Assert actual calls equal the compiled baseline plus every
  observed retry and logical-node retry counts remain exact.
- Packaged outcome and external-validator regressions proving
  `attention-required` cannot satisfy the release-quality gate.
- Packaged quality-diagnostic coverage proving review warnings wait for every
  suite's complete delivery evidence, emit only bounded closed category counts,
  and fail closed when the summary shape contains an unreviewed field.
- Cross-language diagnostic parity coverage enumerating every TypeScript
  serialized diagnostic through Rust deserialization and the external
  validator. Include `prototype-viewport` and assert a failed result is written,
  not merely that an unknown value is rejected.
- Budget compiler coverage with non-six-page route graphs, proving counts derive
  from resolved Agent/user scope rather than the benchmark fixture.
- Real planner benchmark asserts the benchmark fixture's resolved route count;
  production validation does not generalize that fixture count into policy.
- Real pipeline benchmark asserts design system plus every planned page; the
  deterministic browser E2E covers CV, content-addressed persistence, restore,
  and Outcome.

### 7. Wrong vs Correct

```typescript
// Wrong: collection allocation becomes an unstable external-store snapshot.
const slices = useStore(selectSlices)

// Correct: subscribe to the primitive the effect actually needs.
const sliceCount = useStore(selectSliceCount)

// Wrong: common two-page work is serialized and first-page arrival is success.
for (const page of pages) await generate(page)
if (generated.length > 0) delivered = true

// Correct: bounded generation plus complete-plan delivery.
await forEachConcurrent(pages, 2, generate)
delivered = generated.length === plan.pages.length

// Wrong: frontend-only addition makes terminal failure IPC unserializable.
type Diagnostic = 'provider-output' | 'prototype-viewport'
// Rust enum still has only ProviderOutput.

// Correct: update every owner of the closed wire value in one change.
type Diagnostic = 'provider-output' | 'prototype-viewport'
enum RustDiagnostic { ProviderOutput, PrototypeViewport }
externalValidator.accepts(['provider-output', 'prototype-viewport'])
```

## Scenario: Packaged macOS Background Journey Liveness

### 1. Scope / Trigger

Apply when the packaged-E2E build runs the real WKWebView journey in a macOS
guest without activating or focusing Cutout.

### 2. Contracts

- The dedicated E2E process uses a Prohibited activation policy, a visible
  non-focusable WebView window, and `NSApplication::unhideWithoutActivation()`.
  The guest's foreground application must remain unchanged.
- The background keepalive may order the test window behind on every tick, but
  it calls `NSApplication.deactivate()` only when the application is active.
  Repeatedly deactivating an already-inactive app is itself an AppKit ownership
  race and must not be used as a keepalive mechanism.
- Foreground sampling tolerates one isolated observation race but fails after
  two consecutive Cutout-frontmost samples. Retained evidence records total
  samples, total frontmost samples, and the maximum consecutive streak; a
  successful run may have a maximum streak of at most one.
- The smoke owner terminates the exact isolated bundle PID on every exit. It
  sends TERM, verifies process death, and escalates to KILL only when the
  LaunchServices-owned process does not stop within the bounded grace period.
- Tauri window visibility is necessary but not sufficient. The harness must
  also verify macOS application visibility because a hidden application can
  suspend WebContent even while `WebviewWindow::is_visible()` returns true.
- Retain an `NSProcessInfo` user-initiated activity for the complete packaged
  journey. Renderer timers and stream-finalization callbacks must continue
  after a long native Provider await and after the native socket closes.
- The background lifecycle branch exists only in the dedicated packaged-E2E
  build/mode. Normal desktop startup retains the production activation and
  focus policy, but its main window starts hidden: the renderer synchronously
  commits the first React tree and then invokes only `show` through the narrow
  `core:window:allow-show` capability. Browser startup remains concurrent.
- A Provider-free window probe exercises the same packaged bundle, activation
  policy, visible WebView, native tick and native screenshot path for a bounded
  observation interval. It must pass the same consecutive-frontmost monitor
  before a Provider-backed full journey is started.
- The Tauri React bootstrap commits its first tree synchronously before either
  inspecting the packaged-E2E `#root` viewport or showing the production
  window. It does not wait on a browser timer or depend on React child order.
  Background WKWebView timer throttling must not be able to deadlock the
  liveness probe or normal desktop startup. The native snapshot's nonblank,
  color, and contrast checks prove packaged-E2E rendered content; browser-only
  startup keeps the normal concurrent render.
- `webview-renderable` means the lifecycle prerequisites were applied; it does
  not by itself prove liveness. Closed VM evidence must include macOS process
  visibility, foreground ownership, and a later renderer checkpoint.
- Each active Design System candidate projects exactly one sanitized owner
  stage: preparing, awaiting approval, Provider execution, post-processing, or
  terminal. The projection contains no runtime candidate id, request id,
  Provider/model id, prompt, path, or credential. The packaged driver applies
  stage-local deadlines that cover the 315-second remote-image desktop owner
  (after the 300-second native transport) and 90-second DESIGN.md synthesis
  boundaries, then invokes the real product Stop control
  and waits for owner cancellation before writing a typed terminal failure.
  The terminal phase ledger remains capped at 192 entries, which covers eight
  candidates' owner transitions plus the existing bounded suite milestones;
  this is an evidence-size guard, not permission for per-request phase growth.
- A multi-direction comparison may preview settled siblings while generation
  continues, but it must keep the Agent/approval surface reachable and every
  selection disabled until all candidates settle and the orchestrator enters
  `design-system-selection`.

### 3. Validation Matrix

| Condition | Required behavior |
| --- | --- |
| Accessory app projects `visible=false` through System Events | Record it as platform evidence; require retained activity, normal process scheduling, and a later renderer checkpoint |
| Cutout becomes frontmost or focused | Fail the silent-E2E safety gate |
| One isolated frontmost sample is followed by the prior foreground app | Retain the observation and continue; do not report sustained activation |
| Candidate remains at one owner stage beyond its bounded deadline | Cancel through the owning Agent run, require native request cancellation when executing, and emit the matching closed timeout diagnostic |
| Native Provider socket closes | Renderer timeout or stream completion continues and advances to a terminal checkpoint |
| Ordinary production launch | No forced unhide, activity token, or E2E focus policy is applied |

### 4. Tests Required

- Source regression proving unhide, process activity, non-focusable window, and
  visibility/focus checks remain inside the packaged-E2E lifecycle branch.
- Source/external-evidence regressions proving one isolated foreground sample
  is accepted, two consecutive samples fail, and foreground counts are
  internally consistent.
- Rendered regression holding the last Design System direction in flight while
  earlier siblings are ready, proving the Agent drawer remains reachable and
  no direction is selectable; owner-stage parser/watchdog regressions cover
  every closed stage and typed timeout.
- Fresh no-graphics Tart run proving Cutout stays non-frontmost, the prior
  foreground application remains frontmost, the process avoids low-priority
  App Nap state, and renderer checkpoints continue.
- A post-native-await checkpoint proving WebContent timers and orchestration
  continue after the native TCP connection has closed.

## Scenario: Exterior White-Haze Recovery

### 1. Scope / Trigger

Apply this contract when an opaque white-board source contains a soft neutral
cast shadow or haze already composited into its RGB pixels. A binary threshold
can separate the object but leaves the broad shadow as an opaque white/gray
patch on dark consumers.

### 2. Signatures

```typescript
matteExteriorHaze(frame: PixelFrame, background: BackgroundMask): void
```

### 3. Contracts

- Run after `applyAlphaCut` and before `softenMaskEdges`; all three use the same
  immutable `BackgroundMask` produced by `floodBackground`.
- A haze candidate is originally opaque (`alpha >= 250`), neutral
  (`max(rgb)-min(rgb) <= MATTE_HAZE_MAX_CHROMA=24`), and bright
  (`min(rgb) >= MATTE_HAZE_MIN_CHANNEL=176`).
- A candidate component is matted only when it is both 4-connected to known
  background and adjacent to a non-haze foreground anchor. This keeps an
  unoutlined standalone pale-gray asset opaque while allowing a bottle's cast
  shadow to inherit transparency from its saturated bottle anchor.
- Closed dark/color contours protect pale interiors. Existing partial Alpha is
  authoritative and is never reinterpreted as white-matted haze.
- Per eligible pixel: `alpha = min(existing, max(1, 255-min(rgb)))`, then
  un-premultiply RGB against white. Re-compositing over white must recover the
  source pixel within integer rounding.
- Alpha never becomes zero; candidate discovery, boxes, slot assignment, task
  identity, and persisted bounds remain invariant.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Broad neutral shadow touches a colored/dark object and white background | Recover translucent shadow across the whole connected haze component |
| Pale interior is enclosed by a non-haze contour | Preserve byte-for-byte |
| Standalone pale-gray component has no foreground anchor | Preserve byte-for-byte |
| Pale chromatic artwork exceeds the chroma limit | Preserve byte-for-byte |
| Source pixel already has partial Alpha | Preserve byte-for-byte |
| Background-mask pixel | Keep alpha `0`; never resurrect |

### 5. Good / Base / Bad Cases

- Good: a bottle shadow becomes a neutral translucent shadow on dark and light
  consumers while its bottle, crop box, and board slot stay unchanged.
- Base: an unsupported non-neutral/color cast shadow stays opaque and is caught
  by visual QA or review rather than being aggressively decolored.
- Bad: lowering the global white threshold or matting every bright neutral pixel
  erases light assets and enclosed highlights.

### 6. Tests Required

- Unit: wide shadow recovery, white-composite round-trip, enclosed pale
  interior, unanchored pale-gray asset, chromatic artwork, existing partial
  Alpha, and background/foreground alpha invariants.
- Pipeline: pre-matting and post-matting box geometry must match on a broad
  neutral shadow fixture.
- Browser effect gate: a 3x2 real board must keep six exact slot assignments,
  zero crop-edge foreground pixels, white-composite MAE <= `3/255`, and the
  declared soft-shadow slot's bright-neutral opaque ratio below `0.005`.

### 7. Wrong vs Correct

```typescript
// Wrong: lower the global threshold to consume more gray.
const background = floodBackground(frame, 220)

// Correct: preserve detection, then recover only anchored exterior haze.
const background = floodBackground(frame, params.threshold)
applyAlphaCut(frame, background)
matteExteriorHaze(frame, background)
softenMaskEdges(frame, background)
```

## Boundary Edge Signatures

```typescript
softenMaskEdges(frame: PixelFrame, background: BackgroundMask): void
```

- Operates ONLY on foreground pixels 4-connected to a background-mask pixel,
  using a snapshot copy of the mask (no in-pass cascading).
- Per band pixel: `d = |rgb − white|₂`; `t = smoothstep(MATTE_FULL_TRANSPARENT_DIST=24,
  MATTE_FULL_OPAQUE_DIST=96, d)`; `alpha = min(existing, max(MATTE_ALPHA_FLOOR=1, round(t·255)))`.
- When new alpha < 250, un-premultiply against white:
  `c' = clamp((c·255 − 255·(255−α)) / α)` — removes the white halo.

## Invariants (validation matrix)

| Condition | Guarantee |
|---|---|
| Background-mask pixel | alpha stays 0 (never resurrected) |
| Band foreground pixel | alpha ∈ [1, existing] — never 0, never raised |
| Non-band foreground pixel | byte-identical (untouched) |
| Final `boxes` on any input | identical to pre-matting pipeline (alpha floor keeps `findComponents` classification stable) |

## Design Decision: white matting, NOT magenta chroma key

**Context**: jagged slice edges (binary alpha cut). LayerForge solves this by
generating boards on pure magenta `#FF00FF` and chroma-keying with
smoothstep(24,96) + despill.

**Decision**: keep white boards; port only the smoothstep ramp + de-fringe,
keyed on white. Because `floodBackground` is border-seeded, light asset
interiors are already safe — white ambiguity only exists in the boundary band.
Magenta would require changing the `regionBoardPrompt` generation contract
(model-compliance risk, color contamination, breaks existing white boards).

**Revisit trigger**: reports of near-white assets losing their edges. If adopted,
gate magenta keying behind a border-ratio detector (≈8% of border pixels near
key color) with fallback to the white pipeline.

## Constants contract (`constants.ts`)

- `BACKGROUND_ALPHA_MAX = 8`, `DEFAULT_THRESHOLD = 246`: ported verbatim from
  the original Electron renderer — do NOT tweak (byte-identical port contract).
- `MATTE_*` constants: deliberate new behavior, tunable. Widen the band to 2px
  (dilate once) before touching the distance thresholds if staircase persists.
- `MATTE_HAZE_MIN_CHANNEL=176`, `MATTE_HAZE_MAX_CHROMA=24`: broad exterior
  haze eligibility; never replace the connectivity and anchor guards with a
  global brightness rewrite.

## Tests Required

`src/algorithm/softenMaskEdges.test.ts` must keep asserting:
- monotonic band alpha vs distance-to-white on an anti-aliased circle fixture
- alpha floor ≥ 1 in band; interior untouched; background stays 0
- de-fringe round-trip: composite-over-white recovers input within ±3
- `runPipeline.test.ts`: exact box geometry unchanged (detection invariance)
- `src/algorithm/matteExteriorHaze.test.ts`: anchored wide haze is recovered;
  pale enclosed/unanchored/chromatic assets and existing partial Alpha remain
  untouched; white composition round-trips.

Gates: `npx vitest run src/algorithm` · `npx tsc --noEmit -p tsconfig.app.json`
(NOT `-p .`, which is a silent no-op) · `npx oxlint src/algorithm`.

## Wrong vs Correct

```typescript
// Wrong: binary cut + near-white-only feather (pre-2026-07-17 behavior)
if (nearWhite(px) && touchesBackground(px)) px.a = Math.min(px.a, 90)
// → staircase on every dark/colored curved edge

// Correct: continuous ramp + un-premultiply, any color
const t = smoothstep(24, 96, distToWhite(px))
px.a = Math.min(px.a, Math.max(1, Math.round(t * 255)))
unpremultiplyAgainstWhite(px) // when px.a < 250
```

## Scenario: Faithful Uploaded-Material Processing

### 1. Scope / Trigger

Apply this contract when the Agent processes the currently loaded raster as an
input material rather than generating a prototype. It covers isolated asset
sheet slicing and semantic foreground extraction while preserving source
pixels, provenance, cancellation, and source revision identity.

### 2. Signatures

```typescript
type UploadedMaterialOperation =
  | 'split-isolated-assets'
  | 'extract-foreground'

resolveSourceMaterial(source: SourceState): Promise<{
  bytes: Uint8Array
  mediaType: string
  encoding: 'original' | 'normalized-png'
}>

foreground_segmentation_capabilities(): ForegroundSegmentationCapabilities
foreground_segment(bytes: Vec<u8>): ForegroundSegmentationResult
```

`DesktopToolExecution.expectedSourceImageId` and `signal` bind execution to the
source and Agent run that obtained approval. Production evidence may include
`maskArtifactId` and the executor route.

### 3. Contracts

- `split-isolated-assets` uses the existing border-connected white/transparent
  deterministic worker. It does not require an image-generation provider.
- `extract-foreground` first uses Apple Vision on macOS 14+ to create a
  full-size transparent PNG, then sends that result through the deterministic
  worker to produce one or more slices. It never redraws source pixels.
- Imported and provider-returned encoded bytes remain attached to `SourceState`
  and are used for CAS persistence and material execution. Bitmap-only sources
  are invalid persistence input and are never presented as exact originals.
- The full-size Vision result is stored as mask evidence but is not projected as
  a user slice. Final PNG slices bind the original source artifact, mask
  artifact, bounds, cutout parameters, provider route, QA, and lineage.
- Semantic availability is queried immediately before artifact writes or
  approval. A missing capability fails closed and cannot enter prototype,
  image-edit, or image-generation routing.
- Source identity, project revision, and cancellation are checked before
  invocation, after source-byte resolution, after execution, and immediately
  before Asset Production publication.
- The Apple Vision bridge accepts bounded encoded inputs and validates output
  dimensions, pixel count, row bytes, pixel format, checked byte length, and
  `CVPixelBufferGetDataSize` before reading the native buffer.
- This executor is desktop-internal. `cutout.control.v1`, CLI, MCP, and
  `cutout.agent-capabilities.json` do not advertise a new operation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| No loaded source | Do not offer the uploaded-material decision tool |
| Isolated white/transparent sheet | Run deterministic cutout only |
| Foreground extraction on macOS 14+ | Require explicit approval, retain mask evidence, publish transparent slices |
| Unsupported host or unavailable Vision | Return `capability-required` before artifact writes or approval; no generative fallback |
| Source changes or run is cancelled | Do not publish output or mutate stopped/superseded UI state |
| Vision returns no instances or unsafe buffer metadata | Fail closed; preserve the prior source and production state |
| Semantic mask succeeds but deterministic slicing yields no subjects | Publish no production result; orphaned CAS evidence may remain |
| Restored source has encoded bytes | Reuse the exact stored encoding and media type |
| Persisted source has only an `ImageBitmap` | Reject the incomplete source; do not invent an encoded original |

### 5. Good / Base / Bad Cases

- Good: a JPEG photo remains byte-identical in source storage, Vision creates a
  transparent mask, deterministic slicing publishes PNG assets, and production
  evidence points to both source and mask artifacts.
- Base: Windows, Linux, or older macOS reports `capability-required` without an
  approval prompt and leaves the source ready for another supported operation.
- Bad: re-encode every upload before persistence, silently reconstruct a
  subject with an image model, or publish a late result after the source changed.

### 6. Tests Required

- Source store and project repository: exact byte/media-type round-trip for
  imports and provider outputs; explicit PNG fallback for bitmap-only sources.
- Agent routing E2E: deterministic slicing without an image assignment,
  semantic capability preflight before approval, no prototype/generation
  fallthrough, cancellation, and source replacement.
- Desktop executor and sink: mask CAS evidence, final-slice-only projection,
  provider route, revision/source binding, and atomic publication.
- Native Rust: input limits, unsafe output dimensions, BGRA row padding,
  unsupported hosts, and an ignored macOS 14 Apple Vision smoke fixture.
- Full gates: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm agent:validate`,
  `pnpm i18n:ci`, Tauri capability tests, `cargo fmt --check`, `cargo check`,
  `cargo test`, and the ignored Vision smoke on a supported Mac.

### 7. Wrong vs Correct

```typescript
// Wrong: normalize every upload and let unavailable extraction fall through.
const bytes = await bitmapToBytes(source.bitmap)
await generateOrEditSubject(bytes)

// Correct: preserve the encoded source, preflight the selected capability,
// and bind publication to the approved source identity.
const material = await resolveSourceMaterial(source)
await foregroundSegmentation.capabilities()
await desktopTools.invoke({
  capability: 'semantic-cutout',
  inputs: [{ id: source.imageId, ...material }],
  expectedSourceImageId: source.imageId,
  signal: lease.controller.signal,
})
```
