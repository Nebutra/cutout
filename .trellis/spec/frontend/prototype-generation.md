# Prototype Route-Suite Generation

## 1. Scope / Trigger

Apply this contract whenever the prototype Planner, suite scope, page image
generation, workspace recovery, or downstream slicing source changes. It
prevents a valid multi-route application plan from collapsing to one primary
flow or a set of visually unrelated screenshots.

## 2. Signatures

```ts
type PrototypeSuiteScope = 'primary-flow' | 'full-plan'

const DEFAULT_PROTOTYPE_SUITE_SCOPE: PrototypeSuiteScope = 'full-plan'

function pagesForScope(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
): PrototypePage[]

function validatePrototypePlan(
  plan: PrototypePlan,
): Result<{ readonly reachablePageIds: readonly string[] }>

function generatePrototypePageSet<Page, Artifact>(input: {
  readonly pages: readonly Page[]
  readonly existingArtifacts?: readonly Artifact[]
  readonly mode: 'serial' | 'anchor-parallel'
  readonly concurrency: number
  readonly generate: (page: Page, anchor?: Artifact) => Promise<Artifact>
  readonly review?: (artifact: Artifact) => Promise<Artifact>
  readonly reviewMode?: 'inline' | 'overlap'
  readonly reviewConcurrency?: number
  readonly onProgress?: (artifacts: readonly Artifact[]) => void
}): Promise<Artifact[]>

function prototypePagePrompt(
  plan: PrototypePlan,
  page: PrototypePage,
  finalDesignMarkdown?: string | null,
): string

function designSystemExplorationForPlan(
  plan: PrototypePlan,
): CandidateExplorationDecision

function selectPrototypeDesignSystemCandidate(
  candidateSet: PrototypeDesignSystemCandidateSet,
  candidateId: string,
  actor: { readonly kind: 'human' | 'agent'; readonly id: string },
): PrototypeDesignSystemCandidateSet

function verifyResourcePackProductionArtifacts(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly resourcePack: PersistedPrototypeResourcePack
  readonly resolveArtifact: (artifactId: string) => Promise<{
    readonly id: string
    readonly mediaType: string
    readonly bytes: Uint8Array
  } | null>
}): Promise<readonly VerifiedResourcePackArtifact[]>

function projectPrototypeDeliveryEvidence(
  candidateSet: PersistedPrototypeSuiteCandidateSet,
  verifiedResourceArtifacts: Readonly<
    Record<string, readonly VerifiedResourcePackArtifact[]>
  >,
): Promise<readonly PrototypeDeliveryEvidence[]>

function updatePrototypeDeliveryObservation(input: {
  readonly previous?: PrototypeDeliveryObservation
  readonly update: Partial<Pick<PrototypeDeliveryObservation,
    | 'completedPages'
    | 'totalPages'
    | 'completedResources'
    | 'totalResources'
    | 'retryPreservedNodes'
  >>
  readonly at: number
}): PrototypeDeliveryObservation

function projectPrototypeDeliveryProgress(input: {
  readonly status: 'planned' | 'generating' | 'ready' | 'failed' | 'cancelled'
  readonly observation?: PrototypeDeliveryObservation
  readonly now: number
}): PrototypeDeliveryProgress
```

## 3. Contracts

- The Planner Agent owns information architecture: route count, hierarchy,
  naming, grouping, and navigation model are derived from product intent,
  content, platform conventions, and user workflows. Production code must not
  prescribe a Home/Pricing/About or other fixed route tree.
- Every alternative suite authors its own complete topology for its direction.
  A shared seed plan supplies product intent, not a page-count quota; sibling
  suites may and should differ in route count when their content model and user
  journeys require it.
- Every Agent-authored planning-seed route declares an explicit `materials`
  array with zero or more reusable non-UI visuals. Each material chooses
  `board-cutout` or `direct-generate` from its actual production needs. Zero is
  valid; production code must not infer or repair toward a per-page count.
- Local fallback and clarification projections never invent material
  opportunities. They remain zero-material UI structure until an Agent-authored
  plan identifies reusable, non-code-reproducible visuals from the real
  business context.
- New `board-cutout` materials declare a stable route-local `boardGroupId`.
  Materials share a board only when the Agent determines they are a coherent,
  legible atomic family; one route may have zero, one, or multiple board
  groups. Both generated and persisted planning boundaries reject a missing
  group id; production never invents grouping for an incomplete seed.
- The conversational generation decision owns an output-token ceiling large
  enough for its complete multi-suite route/material seed. That ceiling is a
  transport guard, never a suite, page, or per-route material quota. Truncation
  must not silently turn one authoritative planning pass into a second generic
  Planner pass.
- Each `PrototypePage.route` is a unique stable logical destination. Web plans
  normally use URL/path identities; other platforms may use appropriate named
  screen or destination identities.
- New workspaces use `full-plan`. `primary-flow` remains an explicit user scope,
  not a hidden default.
- Every planned page must be reachable from at least one declared flow start.
- `anchor-parallel` generates or reuses the first planned page before bounded
  parallel generation. Every later page receives the same design-system
  reference and the same first-page visual anchor.
- A newly generated page enters observational Vision QA exactly once. When the
  locked image and QA assignments use distinct provider identities, page image
  generation and QA use separate bounded lanes: anchor bytes unblock later
  images immediately, but page-set completion still joins every queued review.
  When both assignments share a provider identity, review stays inline so the
  shared Provider quota is not amplified. Recovered pages are never reviewed
  again merely because a continuation reuses them.
- Page review transforms the generated artifact by attaching a versioned receipt
  bound to the exact page SHA-256. Workspace and Design IR round trips preserve
  valid receipts; stale receipts never satisfy terminal delivery proof.
- Each page prompt contains the complete Agent-authored route and flow contract.
- Page generation consumes the completed design-system artifact through two
  coordinated channels: `designSystem.bytes` is the immutable visual identity
  reference, and the validated `designSystem.designMarkdown` is the final text
  contract. The pre-synthesis imported/correction context is only an input to
  design-system creation and must not bypass the resulting document.
- Agent-authored plans resolve `designSystem.exploration` before visual
  generation. `count` must equal `directions.length`, remain within declared
  runtime bounds, and each direction declares a thesis, varied axes, and
  preserved constraints. A plan without this decision is incomplete and fails
  validation.
- A candidate count greater than one is a resumable workflow boundary. Generate
  and persist every candidate's visual plus image-grounded `DESIGN.md`, retain
  failed siblings, set `workflowPhase = 'design-system-selection'`, and return
  without generating pages. Never suspend a React promise while waiting for a
  selection.
- Exactly one ready candidate from a one-candidate proposal may be selected by
  the Agent. Any multi-direction proposal requires a human selection, even if
  only one sibling succeeded; this keeps partial failure visible rather than
  silently narrowing the creative decision.
- Selection starts a new bounded continuation. It re-resolves providers, reuses
  the persisted plan and exact selected artifact, does not append a duplicate
  user intent, and sends only the selected bytes plus selected `DESIGN.md` to
  page generation and Asset Production.
- Complete-suite production schedules the selected Design System direction
  first, then continues every sibling to final fidelity. A failed candidate is
  isolated: it records its candidate-local page/resource frontier while later
  siblings continue, and it never cancels independent promised deliveries.
- A retry after a transient prototype-suite failure is also a bounded
  continuation. It bypasses the already-settled intent gate, ignores any
  incidental material selection left by completed siblings, retains ready
  suite artifacts, and resumes only the failed suite's missing pages before
  continuing cancelled/unstarted alternatives. Generic outcome repair must not
  collapse this retry into one singular suite.
- A material-production retry resolves the latest same-plan run by `planHash`,
  derives target regions only from its failed tasks, and carries consumable
  tasks through `carryAssetProductionTask`. Starting the new run supersedes the
  old `partial` run to `cancelled`; do not rewrite it back to a non-authoritative
  nonterminal status. Pages and successful board/direct nodes are not replayed.
- Packaged request evidence uses stable logical node ids across attempts. The
  planned count is the compiled resolved baseline plus observed repeat attempts,
  and must equal the actual Provider call count. A retry budget is evidence of
  work that occurred, not permission for an automatic QA re-roll.
- Retry ownership begins synchronously with the visible Retry action. The
  workspace clears the settled failure and enters a busy state before any
  asynchronous Provider/route preflight, so the control cannot be clicked
  twice and the UI cannot keep presenting a stale terminal failure while the
  continuation is being prepared. Packaged evidence records a distinct retry
  acknowledgement; a DOM click alone is not proof that recovery started.
- A long packaged journey must not spend one journey-global Retry allowance on
  the first transient failure. The fixed driver keys its bounded Retry budget
  by the failed candidate and its completed page/resource frontier, waits for
  product-owned acknowledgement after every click, and also enforces a total
  journey ceiling. A later suite may therefore recover without permitting an
  unbounded Provider loop or replaying already completed nodes.
- Product candidate identities and sanitized packaged evidence identities are
  separate domains. The driver uses the runtime candidate id only to observe
  selection acknowledgement, then resolves the bounded `suite-N` projection
  before matching resource counts or emitting terminal evidence. It must never
  compare a runtime candidate id directly with a sanitized suite id.
- Terminal packaged success requires one sanitized delivery record for every
  promised suite. Each record uses bounded ordinal Design System, suite, and
  distinct resource-pack IDs; exact route/page/artifact counts; explicit
  `passed` or `attention-required` review status; and lowercase SHA-256 digests for Design System
  media/Markdown, deterministic token projections, route/page media, manifest,
  exact bindings, resource-pack identity, verified bound resource media,
  provenance, page review evidence, resource review evidence, and review
  document. Page review evidence must bind the exact page digest, and resource
  review evidence must bind the exact artifact id. Missing, stale, rejected, or
  unavailable review evidence cannot be represented as a pass. Bound resource media is re-read from the
  local content-addressed store and checked against its completed production
  task digest; binding ids alone are not delivery proof.
  Missing or malformed evidence rejects success without exposing runtime IDs,
  prompts, Provider payloads, credentials, paths, or image bytes.
- Production progress is a derived, non-persisted projection of monotonic
  page/resource observations. It distinguishes completed, active, queued,
  failed, and retry-preserved nodes. Remaining time is `unavailable` until the
  graph is measurable, `collecting` until at least two real completions span a
  positive interval, then a conservative bounded range; ready and failed
  candidates never show a precise ETA.
- Packaged `progress.json` is terminal state, not a running-only heartbeat.
  Completion validates first, installs terminal progress before the matching
  result, and returns only when status and merged phases agree. Late native or
  WebKit checkpoints cannot reopen `passed` or `failed` progress.
- Selecting or auto-restoring a completed prototype suite must also select the
  completed Asset Production run named by its `resource-pack:<run-id>` binding.
  Page, material-status, slice, export-readiness, and packaged evidence
  projections must share that run authority; the last generated sibling is not
  implicit authority for the selected suite.
- A background packaged driver treats a comparison dialog as closed when it is
  no longer visible or interactive. It must not wait for exit-animation DOM
  unmount, because background WebKit may retain a closed transition node.
- If the artifact's `designMarkdown` is invalid, page generation may fall back
  to the earlier text context, while retaining the design-system image
  reference. Invalid companion documentation must not erase valid visual media.
- Downstream asset production and slicing may start only after the exact scoped
  page set has been produced. A partial suite is not success.
- Visual QA and board-background quality checks are observational after the
  single baseline generation call. When deterministic assignment, decoding,
  persistence, and required-output checks succeed, retain those findings as
  review warnings without blocking the resource pack. Missing, ambiguous,
  cross-slot, undecodable, or unavailable required outputs remain integrity
  failures and fail the pack closed.
- Keep the default scope in `src/prototype/scope.ts`. Persistence code must not
  import `generate-suite.ts`, because that pulls DESIGN.md/YAML machinery into
  the frontend entry chunk.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Duplicate page id | `validatePrototypePlan` returns an error |
| Duplicate route identity | `validatePrototypePlan` returns `Duplicate page route` |
| Missing interaction target | validation returns an unknown-page error |
| Planned page unreachable from all flows | validation returns an unreachable-pages error |
| Generator returns another page identity | generation throws before publication |
| Any scoped page is missing | generation throws `Prototype generation is incomplete` |
| Empty page list | generation throws; no downstream production starts |
| Existing explicit `primary-flow` workspace | preserve its selected scope |
| Valid image-grounded `designSystem.designMarkdown` | include it in every page prompt as `Final DESIGN.md` |
| Invalid final `designSystem.designMarkdown` | fall back to pre-synthesis text context; keep the image identity reference |
| Count exceeds `bounds.maxCandidates` | reject the plan; never clamp silently |
| Direction count differs from resolved count | reject the executable plan |
| Multiple-direction proposal has no selection | persist candidate results and stop before page generation |
| Selection references failed/missing candidate | reject without changing the singular selected projection |
| Candidate base revision differs from current revision | reject as stale and require regeneration |
| One board region fails with a retryable Provider error | expose Retry, retain ready pages/tasks, and retry only that logical region |
| Retry starts a new same-plan production run | supersede the prior `partial` authority to `cancelled`, then carry only consumable matching tasks |
| Planned and actual packaged image-call counts differ | fail the terminal E2E outcome; do not hide replay or retry amplification |
| One complete-suite candidate fails | retain its local frontier and continue every independent sibling |
| Delivery proof omits a review/token/topology/binding/resource-media/provenance digest | reject packaged terminal success |
| Delivery records reuse a resource-pack identity | reject packaged terminal success |
| Fewer than two timed logical completions exist | show `collecting`, never a precise ETA |
| A checkpoint arrives after terminal completion | preserve terminal progress status and phases |

## 5. Good / Base / Bad Cases

- Good: the Agent derives four routes across two workflows; all four images are
  generated, share one visual anchor, consume the image-grounded final
  `DESIGN.md`, and then become slicing sources.
- Base: a genuinely single-screen product yields one Agent-planned route and one
  image; no synthetic second screen is invented.
- Bad: the Agent plans account and settings in a secondary flow, but the
  workspace silently defaults to the first flow and publishes only the home and
  catalog images.
- Bad: the design-system image and final `DESIGN.md` are created, but page
  generation receives only the imported text that existed before image
  grounding, so the screens ignore refinements discovered from the visual.
- Good: the Agent proposes two deliberate directions, both retain the same
  product identity, the user selects one, and every page/production binding uses
  only that candidate.
- Base: a constrained request resolves one direction and continues without an
  unnecessary comparison step.
- Bad: three provider calls reuse the same prompt and random seed variance is
  presented as three authored directions.
- Good: the selected direction completes first, a later suite fails after three
  pages, independent siblings remain ready, and Retry resumes at the fourth
  page before producing that suite's remaining resource artifacts.
- Base: every candidate completes without Retry; the same evidence verifier
  still re-reads each bound resource artifact and closes all candidates before
  terminal success.
- Bad: a resource pack contains plausible binding IDs, but its local object was
  deleted or changed; counts still match, yet delivery is reported as complete
  without reading or hashing the bytes.
- Bad: progress computes a single completion timestamp from the first node or
  regresses after Retry, giving users false precision about a graph that is not
  yet measurable.

## 6. Tests Required

- Planner prompt test: asserts dynamic IA ownership, platform-native route meta
  rules, complete route coverage, and no fixed template instruction.
- Planning-seed tests: explicit zero materials, multiple board groups on one
  route, rejection of missing group ids, standalone direct materials, and
  duplicate route-local material ids; no benchmark count becomes a production
  default.
- Plan validation test: duplicate route identities fail while arbitrary Agent
  route names remain valid.
- Page-set unit test: all pages are generated, progress stays in plan order,
  concurrency is bounded, and every follower uses one stable anchor.
- Rendered component E2E: submit a product intent to the real
  `IntentWorkspace`, mock only external model/desktop boundaries, then assert
  every Agent-planned route is persisted and every visual task carries the full
  route contract, common series identity, shared design-system image reference,
  and a rule unique to the synthesized final `DESIGN.md`.
- Real-provider benchmark remains gated by credentials and reports transport
  failures separately from deterministic product regressions.
- Candidate contract tests: dynamic bounds, exact direction counts, ready-only
  selection, human selection for multi-direction proposals, stale revision
  rejection, and strict current candidate-set recovery.
- Persistence test: candidate visuals/Markdown, selection, provenance, and
  selected token projection survive workspace -> Design IR -> workspace.
- Rendered comparison test: cards have stable media dimensions, failed siblings
  remain visible, details open, and pages do not start before selection.
- Asset-production regression: a valid assigned output with an observational QA
  rejection remains ready with its warning visible; missing or invalid required
  output still leaves the production run incomplete.
- Rendered retry regression: fail one selected-suite page with a transient
  Provider error, retry through the visible Agent control, require immediate
  busy/failure acknowledgement before asynchronous preflight, require all
  suite candidates to become ready, and prove page calls equal the resolved
  baseline plus only the failed request rather than a full-suite replay.
- Packaged-driver retry regression: recover one failed suite frontier, then
  fail a different suite frontier and require a second visible Retry while
  proving duplicate pre-acknowledgement clicks, per-frontier loops, and total
  journey retry amplification remain bounded.
- Packaged selection regression: acknowledge selection with the runtime
  candidate id, then require resource-pack and terminal matching to use only
  the validated `suite-N` projection; a runtime id must be rejected as
  sanitized evidence.
- Suite-switch regression: selecting a ready alternative restores exactly its
  resource artifacts and activates the completed production run named by that
  resource pack, while a hidden exit-transition dialog cannot block packaged
  progress.
- Material retry regression: fail one board call after its suite pages are
  ready, assert the pre-retry run is `partial`, retry through the visible
  control, then assert the old run is `cancelled`, three suite runs complete,
  page call ids are unchanged, exactly one board logical node has a second
  attempt, and dynamically compiled planned calls equal actual calls.
- Delivery-evidence regressions: require every candidate's Design System/token,
  route/page, manifest/binding, resource-pack, verified resource-media,
  provenance, and review digests;
  reject missing fields, malformed digests, duplicate pack identities, and
  private/generated keys in both driver and native validators.
- Progress regressions: require monotonic logical counts, retry-preserved
  frontiers, every estimate state, conservative ordered ranges, and terminal
  estimates that are unavailable rather than falsely precise.
- Terminal packaged regressions: result and progress close with identical
  terminal status/phases, late checkpoints remain ignored, and a failed result
  install restores prior progress or removes newly installed progress.

## 7. Wrong vs Correct

### Wrong

```ts
// Hidden product template and hidden route loss.
const pages = [homePage, pricingPage, aboutPage]
const scope: PrototypeSuiteScope = 'primary-flow'
await Promise.all(pages.map((page) => generate(page, designSystemOnly)))

// Bypasses the image-grounded contract that was just synthesized.
const pageDesignContext = preSynthesisContext
```

### Correct

```ts
// The Agent authors `plan.pages`; the executor consumes the complete graph.
const pages = pagesForScope(plan, DEFAULT_PROTOTYPE_SUITE_SCOPE)
await generatePrototypePageSet({
  pages,
  mode: 'anchor-parallel',
  concurrency: 2,
  generate: (page, anchor) => generatePage(page, designSystem, anchor),
})

const pageDesignContext = isValidDesignMarkdown(designSystem.designMarkdown)
  ? designSystem.designMarkdown
  : preSynthesisContext
```

```ts
// Wrong: binding identity and matching counts are treated as byte delivery.
const evidence = projectPrototypeDeliveryEvidence(candidateSet, {})

// Correct: bind the completed production run, re-read every local object, and
// verify media type plus SHA-256 before projecting sanitized evidence.
const verified = await verifyResourcePackProductionArtifacts({
  snapshot,
  resourcePack,
  resolveArtifact,
})
const evidence = await projectPrototypeDeliveryEvidence(candidateSet, {
  [candidateId]: verified,
})
```

```ts
// Wrong: multiple candidates immediately collapse back to the first result.
const selected = candidates[0]
await generatePages(selected)

// Correct: publish a durable selection boundary and resume in a later run.
if (candidateSet.proposal.count > 1) {
  setWorkflowPhase('design-system-selection')
  return
}
const selected = selectPrototypeDesignSystemCandidate(candidateSet, readyId, agent)
await generatePages(selectedPrototypeDesignSystem(selected))
```

```ts
// Wrong: restart every page/board and repair the expected count with a constant.
const expectedCalls = 39
await generatePrototypeSuite(plan)

// Correct: carry same-plan successes and budget the one observed repeated node.
const baseline = compilePrototypeImageRequestBudget({ designSystemCalls, suites })
const targetRegionIds = productionPlan.tasks.flatMap((task) =>
  previousRun.tasks[task.taskId]?.status === 'failed' ? [task.regionId] : [],
)
let retry = beginPrototypeProduction({ snapshot, plan: productionPlan, runId, at })
for (const task of productionPlan.tasks) {
  if (!targetRegionIds.includes(task.regionId)) {
    retry = carryPrototypeTaskPublication({
      snapshot: retry, fromRunId: previousRun.runId, toRunId: runId, taskId: task.taskId, at,
    })
  }
}
expect(actualCalls).toBe(baseline.totalCalls + repeatedLogicalNodeAttempts)
```
