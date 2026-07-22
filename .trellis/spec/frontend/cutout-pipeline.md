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
analysis, AI-native actions, or the worker cutout request changes. Threshold,
minimum area, merge gap, and padding are algorithm inputs, not user or Agent
preferences.

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
- AI-native snapshots omit internal params. The action schema rejects
  `set-param`, `set-params`, and `reset-params`.
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
| AI-native request uses a removed parameter action | Schema parsing fails; no dispatch branch runs |
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
- AI-native schema and snapshot regressions for removed actions and fields.
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
  Diagnostics are persisted in production task evidence. Non-compliant boards
  may still produce candidates, but those tasks become `needs-review` and are
  not consumable until an explicit revision-bound quality decision exists.
- `regionBoardPrompt` forbids model-added text labels/captions/numbering/
  watermarks (redrawn text becomes garbled pixel "assets").

**Decision record**: LayerForge's adaptive background keying (border color
histogram → flood with detected key colors, rejection guard
removedRatio ∈ [0.08, 0.92]) and vision-model bounds with focused retry were
evaluated and deferred — adaptive keying only after `diagnosticsByRegion`
data shows material non-compliance frequency; vision bounds only as a
CV-suspect fallback, never unconditionally (cost/latency negative otherwise).

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
publishSemanticSliceProduction(input: SemanticProductionInput): Promise<SemanticProductionResult>
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
- `direct-generate`, `board-cutout`, `semantic-repair`, and `import-cutout` are
  explicit routes. No executor may silently reinterpret one as another.
- Lifecycle composition belongs to `asset-production/coordinator.ts`. Prototype,
  manual/tool, and semantic adapters may own execution strategy, but they must
  not duplicate the candidate -> review -> verify transition sequence.
- Starting a new run explicitly supersedes the previous active run. Merely
  changing `activeRunId` while leaving the old run `running` is invalid history.
- Content bytes are stored under `artifact:sha256:<digest>`. Concurrent writes
  of the same digest must converge on one existing record rather than failing
  with a duplicate-key transaction error.
- Only `ready`, revision-bound `waived`, and grandfathered `legacy-ready`
  publications are consumable. A new plan/source revision supersedes current
  authority without deleting immutable historical runs.
- Review is a projection of authoritative `needs-review` and `failed` tasks,
  not only of slices with image blobs. A task that fails before producing an
  artifact remains visible with its evidence and a retry path.
- A projected review slice and its task record count once. Match them by stable
  `productionTaskId`; never duplicate the same blocker in image and text rows.
- Repair targets and pending canvas status derive from the current task
  projection. `failedRegionIds` is not workspace state or persistence input;
  region ids are grouping metadata produced at the repair-planner boundary.
- `run-semantic-slices` compiles one stable `semantic-repair` task per unique
  semantic spec. Multiple generation routes are candidates for that task. A
  validated pass may become `ready`; missing output is `failed`; rejected,
  skipped, or unavailable QA is `needs-review`.
- Semantic outputs always enter content-addressed storage and the production
  snapshot. `writeArtifacts=false` suppresses only the optional human-readable
  file copy, never authoritative publication.
- Restore resolves missing projected slice blobs from their output artifact id
  or exact production task publication before rebuilding UI state.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Source/plan/run mismatch, stale callback, invalid hash, missing output, invalid bounds, ambiguous/missing board slot | Integrity failure; never waive or export |
| QA rejects or is unavailable, board is non-compliant, visual edge/alpha concern | `needs-review`; preserve evidence; explicit approval required |
| Task fails before an image artifact exists | Show an authoritative Review blocker and retry action; do not disappear because no `Slice` exists |
| Output changes after approval | Invalidate the old decision receipt |
| Run is cancelled or superseded | Late results cannot publish or mark the run complete |
| New run starts while another run is active | Mark the old run `cancelled`, preserve settled task history, then bind the new run as active |
| Semantic plan contains duplicate spec ids | Reject the plan before generation/task binding |
| Semantic output exists but QA is rejected, skipped, or unavailable | Persist candidate and evidence as `needs-review`; do not export |
| Semantic output is missing | Record non-waivable `semantic-output-missing`; keep it visible in Review without a slice |
| Restore lacks projected blob but has a valid artifact id | Materialize from content-addressed storage |
| Restore lacks both blob and recoverable artifact | Fail recovery explicitly; do not invent pixels or readiness |
| Legacy project lacks production metadata | Add an idempotent `legacy-unverified` snapshot; do not invent QA or manifest evidence |

### 5. Good / Base / Bad Cases

- Good: all required task publications verify and the current run projects to
  Files, Canvas, Assets, Review, Outcome, Design IR, and Export consistently.
- Base: a quality issue publishes evidence as `needs-review`; UI can inspect it,
  but consumers stay blocked until a receipt bound to that exact revision is
  recorded.
- Good semantic: the command returns `production.planId`, `runId`, status and
  task ids; the Agent snapshot exposes the same run and the UI projects ready
  or review slices from it.
- Bad: a component appends a Blob to `analysis.slices` and treats
  `slices.length > 0` as production completion.

### 6. Tests Required

- Reducer tests: illegal transitions, stale run/plan, cancellation, partial
  success, waiver invalidation, and authority supersession.
- Adapter tests: prototype board/direct routes, manual worker, Agent tool,
  semantic publication, targeted repair, and cross-entry overwrite prevention.
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

- Explicit page/screen counts in a brief override planner minimality. A
  mismatched first plan gets one structured repair; a second mismatch fails
  before any image call.
- One-page suites may use previous-page serial conditioning. Two or more pages
  use bounded concurrency 2 against the shared design-system reference.
- Direct assets and region boards use bounded concurrency 2. Task ids, CAS
  publication, and per-region failure isolation remain unchanged.
- Production visual QA permits one paid re-roll after the first attempt. QA
  unavailable stops automatic re-rolls and records `needs-review` evidence.
- Concurrent pools stop claiming new work after the first uncaught failure,
  wait for already in-flight work to settle, then reject. They never return
  while callbacks can still publish late state.
- Zustand effects that need only a count subscribe to a primitive selector.
  They must not subscribe directly to a selector that allocates an array.
- Real pipeline E2E succeeds only when every planned page is committed. The
  first concurrently completed page is not delivery.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Explicit N pages, first plan has another count | Run one planner repair before paid image work |
| Repair still violates N | Fail with explicit-scope error; generate no images |
| Provider fails and local fallback violates N | Fail closed; do not silently use a one-page fallback |
| One concurrent task fails | Stop new claims, settle in-flight work, then surface the first error |
| QA reviewer unavailable | Preserve candidate as `needs-review`; no paid re-roll loop |
| Selector allocates a new collection each store read | Use `useShallow` or project a stable primitive |
| Benchmark has fewer committed pages than its plan | E2E failure |

### 5. Good / Base / Bad Cases

- Good: a two-page brief plans exactly two pages, generates them concurrently,
  and the benchmark waits for both.
- Base: a provider outage fails during planning or marks generated candidates
  for review without expanding paid retries.
- Bad: one `core` page satisfies a two-page brief, or the test unmounts when the
  first page arrives and aborts the second task.

### 6. Tests Required

- Hook mount regression proving empty slice projection does not trigger React
  `getSnapshot` / maximum-depth errors.
- Planner unit tests for Arabic, Chinese, and English explicit counts, one
  successful repair, and one fail-closed repair.
- Async-pool tests for maximum concurrency, complete visitation, invalid limit,
  and failure convergence without late work.
- Region tests proving concurrency 2, per-region isolation, diagnostics-before-
  slice ordering within each region, and bitmap cleanup.
- Real planner benchmark asserts the explicit page count.
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
