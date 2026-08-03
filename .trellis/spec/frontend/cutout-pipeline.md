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
- `ProjectRestoreInput.params` remains optional for legacy decoding, but
  `restoreProject` ignores its value and installs `DEFAULT_PARAMS`.
- `useAutoRun` analyzes each newly loaded `autoAnalyze` source identity once.
  Agent-managed sources with `autoAnalyze: false` and restored sources that
  already contain slices do not start a duplicate worker run.
- Image-specific automatic estimation may replace the default provider later,
  but it must remain behind the worker `CutoutParams` boundary and must not
  reintroduce manual controls.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Legacy project contains custom params | Restore succeeds; runtime uses `DEFAULT_PARAMS` |
| New product-managed source loads | Start exactly one analysis with slices |
| Agent-managed source loads | Do not start a duplicate analysis |
| Restored source already has slices | Preserve the restored projection; do not auto-rerun |
| Analysis returns no regions | Show neutral retry guidance without parameter terminology or numeric tuning |

### 5. Good / Base / Bad Cases

- Good: importing a new sheet automatically cuts it with internal defaults and
  presents results without asking the user to tune computer-vision values.
- Base: a sheet produces no reusable regions; the UI suggests another source
  and leaves explicit rerun available without exposing implementation knobs.
- Bad: a hidden CLI action, persisted legacy value, settings reset, or empty-
  state quick fix can mutate the worker parameters.

### 6. Tests Required

- Static UI regression proving parameter components are absent and settings /
  empty states contain no mutation commands.
- Store regression proving the params object is frozen, mutation actions are
  absent, and custom legacy restore values normalize to defaults.
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
```

The persisted record carries `assetProduction?: AssetProductionSnapshot` and
the Zustand store carries `assetProduction: AssetProductionSnapshot`.
`analysis.slices` is a compatibility/UI projection only.

### 3. Contracts

- Task identity derives from `planHash + manifestItemId`; array position,
  filename, and completion order are never identity.
- Every new output binds `projectRevisionId`, `planId`, `runId`, `taskId`,
  `manifestItemId`, source artifact hash, output artifact hash, route, bounds,
  CV parameters, diagnostics, QA verdict, and lineage where applicable.
- `direct-generate`, `board-cutout`, and `import-cutout` are current explicit
  routes. No executor may silently reinterpret one as another.
- `semantic-repair` remains decode-only for historical production snapshots.
  New planners and executors must not emit it.
- Lifecycle composition belongs to `asset-production/coordinator.ts`. Prototype
  and manual/tool adapters may own execution strategy, but they must not
  duplicate the candidate -> review -> verify transition sequence.
- Starting a new run explicitly supersedes the previous active run. Merely
  changing `activeRunId` while leaving the old run `running` is invalid history.
- Content bytes are stored under `artifact:sha256:<digest>`. Concurrent writes
  of the same digest must converge on one existing record rather than failing
  with a duplicate-key transaction error.
- Only `ready`, revision-bound `waived`, and grandfathered `legacy-ready`
  publications are consumable. A new plan/source revision supersedes current
  authority without deleting immutable historical runs.
- A board layout with exactly one planned task may represent that one logical
  material as several disconnected CV foreground crops. Assignment must retain
  their board-relative positions, render one transparent union-bounds PNG, and
  publish only that composite for the task. Zero crops remain an integrity
  failure, and layouts with multiple tasks keep strict one-candidate-per-slot
  ambiguity and crossing checks.
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
| Prototype visual QA rejects/is unavailable or board diagnostics are non-compliant after deterministic validity succeeds | Preserve a warning on the `ready` task; do not block consumption or start paid work |
| Task fails before an image artifact exists | Show an authoritative Review blocker and retry action; do not disappear because no `Slice` exists |
| Output changes after approval | Invalidate the old decision receipt |
| Run is cancelled or superseded | Late results cannot publish or mark the run complete |
| New run starts while another run is active | Mark the old run `cancelled`, preserve settled task history, then bind the new run as active |
| New planner input requests `semantic-repair` | Reject before hashing or task binding; the route is decode-only |
| Historical snapshot contains `semantic-repair` | Decode and restore it without treating the route as a current planner option |
| Restore lacks projected blob but has a valid artifact id | Materialize from content-addressed storage |
| Restore lacks both blob and recoverable artifact | Fail recovery explicitly; do not invent pixels or readiness |
| Legacy project lacks production metadata | Add an idempotent `legacy-unverified` snapshot; do not invent QA or manifest evidence |
| One planned board material produces several contained foreground crops | Composite them at their original relative offsets into one transparent artifact |
| Multiple planned board materials produce ambiguous crops | Fail slot assignment; never guess or merge across task slots |

### 5. Good / Base / Bad Cases

- Good: all required task publications verify and the current run projects to
  Files, Canvas, Assets, Review, Outcome, Design IR, and Export consistently.
- Base: an explicitly blocking quality issue publishes evidence as
  `needs-review`; UI can inspect it, but consumers stay blocked until a receipt
  bound to that exact revision is recorded. An observational prototype QA or
  board warning remains visible on a consumable `ready` task.
- Bad: a component appends a Blob to `analysis.slices` and treats
  `slices.length > 0` as production completion.

### 6. Tests Required

- Reducer tests: illegal transitions, stale run/plan, cancellation, partial
  success, waiver invalidation, and authority supersession.
- Adapter tests: prototype board/direct routes, manual worker, Agent tool,
  targeted repair, and cross-entry overwrite prevention.
- Planner/persistence tests: current inputs reject `semantic-repair` while
  historical snapshots containing it still decode.
- Coordinator tests: new-run supersession, shared publication sequence, carry
  of settled revisions, cancellation and finalize behavior.
- Projection tests: review and failed tasks remain visible with and without an
  image artifact, and projected slices deduplicate their task blocker.
- Persistence tests: additive legacy migration, artifact-id materialization,
  repeated restore, and decision/evidence round-trip into Design IR and Export.
- Browser E2E: real canvas CV -> content-addressed writes -> task publication ->
  project restore -> current material projection -> `ready-to-deliver` Outcome.
- Content store test: concurrent identical SHA-256 writes deduplicate and quota
  counts the bytes once.

### 7. Wrong vs Correct

```typescript
// Wrong: mutable UI state becomes production authority.
appendSliceProjection(slice)
if (analysis.slices.length > 0) markReady()

// Correct: publish through the shared coordinator, then derive the UI.
const next = publishAssetProductionTask({ snapshot, runId, taskId, artifact, ...evidence })
commitAssetProduction(expectedRevision, next)
replaceProductionSliceProjection(projectProductionMaterials(next))
```

## Scenario: Production Throughput And E2E Evidence

### 1. Scope / Trigger

Apply this contract whenever prototype planning, image generation, QA, or
region extraction changes. Schema-valid output alone is insufficient: the
journey must preserve explicit user scope and complete within a bounded amount
of paid work.

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
- One-page suites may use previous-page serial conditioning. Two or more pages
  use bounded concurrency 2 against the shared design-system reference.
- Direct assets use bounded concurrency 3. Task ids, CAS
  publication, and per-region failure isolation remain unchanged.
- Each Agent-authored route seed declares zero or more reusable non-UI visual
  materials based on genuine reuse value and non-code-reproducibility. Zero is
  valid. Each new `board-cutout` material declares a route-local
  `boardGroupId`; deterministic closure creates one exact-layout region per
  authored group, creates one `direct-generate` region per art-directed
  standalone material, and keeps ordinary layout regions `ignore-code-ui`.
  Historical seeds without group ids retain their former single-group
  projection. Closure never pads a route to a requested or benchmark count.
- Compile the logical prototype graph into an explicit paid-request budget.
  Heterogeneous fixtures include pages with zero, one, and several useful
  materials and compute their expectation as Design Systems + actual pages +
  actual board regions + actual direct assets. Mandatory hidden refine,
  text-free prepass, or automatic QA re-roll nodes must not inflate that
  resolved baseline. No fixture quantity becomes a production target.
- Route and asset counts are never production constants. They resolve from the
  Agent-authored business topology and useful material plan. The general baseline is
  `Design System calls + actual pages + actual board-cutout regions + explicit
  direct-generate assets`, compiled from the resolved plans.
- One page attempt uses one paid image invocation. OpenAI-shaped routes consume
  the selected Design System and stable anchor through one `edit-image` call;
  the desktop executor preserves every bounded ordered reference or fails
  closed when one is unavailable.
- QA is evidence by default. It records a verdict and review issues with zero
  automatic paid re-rolls; regeneration requires a later explicit user/Agent
  decision and a new bounded attempt identity.
- Compact board groups use the page, Design System, and at most one stable
  anchor as visual context. They do not generate a text-free page prepass, and
  independent page/group work runs with a combined concurrency ceiling of 3.
  The outer page pool owns that budget; groups within one active page run
  serially so nested pools cannot amplify Provider traffic to 9.
- Production visual QA is observational after the first attempt. Rejection or
  unavailability records a warning on a deterministically valid output and
  never starts an automatic paid re-roll.
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
- The packaged benchmark requires exactly 3/3 complete suites. Once a suite
  failure makes that strict outcome impossible, cancel unstarted sibling suites
  instead of spending further paid calls. Normal product generation continues
  preserving partial candidates because it does not inherit this benchmark-only
  fail-fast policy.
- Packaged E2E failure evidence uses a closed credential-free vocabulary that
  distinguishes Provider transport/output from board decode, zero-slice,
  slot-assignment, and artifact-persistence failures. Raw Provider ids,
  responses, paths, and credentials never enter the result bundle.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| User mentions N pages but the complete business topology differs | Agent explains or clarifies the resolved graph; do not mechanically pad, merge, repair, or fail on count equality |
| Provider cannot author a valid business topology | Fail closed; do not silently use a generic one-page fallback |
| Route has no reusable non-UI visual material | Preserve zero materials and create no board/direct material region |
| Route has several coherent atomic material families | Preserve Agent-authored `boardGroupId` boundaries as separate board regions; do not collapse them by page |
| Route has art-directed standalone materials | Preserve each as its own `direct-generate` region |
| One concurrent task fails | Stop new claims, settle in-flight work, then surface the first error |
| Prototype QA reviewer unavailable after deterministic validity succeeds | Preserve candidate as `ready` with a warning; no paid re-roll loop |
| Packaged 3/3 suite benchmark has one failed suite | Cancel unstarted benchmark siblings and fail with retained partial evidence |
| Selector allocates a new collection each store read | Use `useShallow` or project a stable primitive |
| Benchmark has fewer committed pages than its plan | E2E failure |

### 5. Good / Base / Bad Cases

- Good: a brief mentions two pages, the Agent derives a complete three-route
  restaurant journey and explains the additional order-status destination;
  generation then waits for all three planned routes.
- Base: a provider outage fails during planning or marks generated candidates
  for review without expanding paid retries.
- Bad: a failed Agent planner silently becomes a generic `core` page, or the
  test unmounts when the first planned page arrives and aborts its siblings.

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
  authored `boardGroupId` values become multiple board regions, legacy missing
  group ids remain compatible, and `direct-generate` materials stay standalone
  without any per-page quota.
- Component coverage proving every logical page in the resolved fixture issues
  exactly one baseline page call, with one Design System reference for anchors
  and Design System + anchor for the remaining pages.
- Desktop executor coverage proving multi-reference edits preserve input order
  and do not silently drop later references.
- Production wiring coverage proving multiple board groups on one page and
  boards across pages run concurrently, keep bounded reference context, and do
  not enable a text-free paid prepass.
- Packaged benchmark coverage proving a failed suite cancels only unstarted
  benchmark siblings while ordinary product candidate behavior remains partial.
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
```

## Scenario: Packaged macOS Background Journey Liveness

### 1. Scope / Trigger

Apply when the packaged-E2E build runs the real WKWebView journey in a macOS
guest without activating or focusing Cutout.

### 2. Contracts

- The dedicated E2E process uses an Accessory activation policy, a visible
  non-focusable WebView window, and `NSApplication::unhideWithoutActivation()`.
  The guest's foreground application must remain unchanged.
- Tauri window visibility is necessary but not sufficient. The harness must
  also verify macOS application visibility because a hidden application can
  suspend WebContent even while `WebviewWindow::is_visible()` returns true.
- Retain an `NSProcessInfo` user-initiated activity for the complete packaged
  journey. Renderer timers and stream-finalization callbacks must continue
  after a long native Provider await and after the native socket closes.
- The lifecycle branch exists only in the dedicated packaged-E2E build/mode.
  Normal production startup, activation, focus, and window behavior remain
  unchanged.
- `webview-renderable` means the lifecycle prerequisites were applied; it does
  not by itself prove liveness. Closed VM evidence must include macOS process
  visibility, foreground ownership, and a later renderer checkpoint.

### 3. Validation Matrix

| Condition | Required behavior |
| --- | --- |
| Accessory app projects `visible=false` through System Events | Record it as platform evidence; require retained activity, normal process scheduling, and a later renderer checkpoint |
| Cutout becomes frontmost or focused | Fail the silent-E2E safety gate |
| Native Provider socket closes | Renderer timeout or stream completion continues and advances to a terminal checkpoint |
| Ordinary production launch | No forced unhide, activity token, or E2E focus policy is applied |

### 4. Tests Required

- Source regression proving unhide, process activity, non-focusable window, and
  visibility/focus checks remain inside the packaged-E2E lifecycle branch.
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
  and are used for CAS persistence and material execution. Bitmap-only legacy
  sources are explicitly normalized to PNG; they are never presented as exact
  original encodings.
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
| Legacy source has only an `ImageBitmap` | Normalize to PNG and mark the encoding as `normalized-png` |

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
