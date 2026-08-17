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
  readonly review?: (artifact: Artifact, attempt: number) => Promise<Artifact>
  readonly reviewMode?: 'inline' | 'overlap'
  readonly reviewConcurrency?: number
  readonly maxReviewRetries?: number
  readonly isReviewAccepted?: (artifact: Artifact) => boolean
  readonly shouldRetryReview?: (artifact: Artifact) => boolean
  readonly retryAfterReview?: (
    page: Page,
    predecessor: Artifact | undefined,
    rejected: Artifact,
    attempt: number,
  ) => Promise<Artifact>
  readonly onPageStage?: (progress: {
    readonly page: Page
    readonly stage: 'generated' | 'reviewing' | 'accepted' | 'rejected' | 'retrying'
    readonly attempt: number
  }) => void
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

interface PackagedE2eEvidenceUpload {
  readonly providerRoutes: readonly {
    readonly purpose: 'planning' | 'image' | 'vision'
    readonly kind: string
    readonly model: string
    readonly classification: 'remote' | 'local'
  }[]
  readonly files: readonly {
    readonly role: string
    readonly candidateId?: `suite-${number}`
    readonly ordinal?: number
    readonly sha256: string
    readonly byteLength: number
    readonly bytesBase64: string
    readonly mediaType?: 'image/png' | 'image/jpeg' | 'image/webp'
    readonly width?: number
    readonly height?: number
  }[]
}

function packagedE2ePersistEvidence(
  payload: PackagedE2eEvidenceUpload,
): Promise<PackagedE2eEvidenceManifest>

function updatePrototypeDeliveryObservation(input: {
  readonly previous?: PrototypeDeliveryObservation
  readonly update: Partial<Pick<PrototypeDeliveryObservation,
    | 'completedPages'
    | 'totalPages'
    | 'completedResources'
    | 'totalResources'
    | 'retryPreservedNodes'
  >> & { readonly pageProgress?: {
    readonly pageId: string
    readonly stage: 'generated' | 'reviewing' | 'accepted' | 'rejected' | 'retrying'
    readonly attempt: number
  } }
  readonly at: number
}): PrototypeDeliveryObservation

function projectPrototypeDeliveryProgress(input: {
  readonly status: 'planned' | 'generating' | 'ready' | 'failed' | 'cancelled'
  readonly observation?: PrototypeDeliveryObservation
  readonly now: number
}): PrototypeDeliveryProgress

function planDistinctSuiteTopologies<Request, Plan>(input: {
  readonly requests: readonly Request[]
  readonly concurrency: number
  readonly priorFingerprints: readonly string[]
  readonly plan: (
    request: Request,
    priorFingerprints: readonly string[],
  ) => Promise<Result<Plan>>
  readonly fingerprint: (plan: Plan) => string
}): Promise<readonly {
  readonly request: Request
  readonly result: Result<Plan>
  readonly repairedDuplicate: boolean
}[]>
```

## 3. Contracts

- The Planner Agent owns information architecture: route count, hierarchy,
  naming, grouping, and navigation model are derived from product intent,
  content, platform conventions, and user workflows. Production code must not
  prescribe a Home/Pricing/About or other fixed route tree.
- Natural business intent without an explicit page count is the normal planning
  case and uses outline-first progressive planning. The bounded outline owns
  both route nodes and business-meaningful navigation edges. It must reject
  duplicate identities, unknown edge endpoints and pages unreachable from every
  Agent-authored journey entry before any page expansion. Independent route details expand under
  the shared concurrency ceiling; the orchestrator then discards page-authored
  cross-page drift and compiles the exact outline edges into the settled pages.
  It deterministically projects flows and Markdown review documents from those
  same entries and edges, then runs final plan validation. A closure must never
  invoke a second model turn to restate authoritative navigation. A monolithic structured plan
  is reserved for an explicitly bounded one-to-three-page scope; absence of a
  count is never evidence that the task is small. The page count remains context,
  not a quota: either path may return a different justified topology.
  The closed streaming form is `CUTOUT_OUTLINE_V2`; V1 is not accepted because
  it had no edge authority and could not prove reachability before expansion.
  A compatible text route may wrap one otherwise exact V2 payload in a single
  `text`, `plaintext`, or `tsv` Markdown fence. The parser removes only that
  lossless outer wrapper and rejects prose, multiple fences, unterminated
  output, or any nonconforming protocol field.
- Every alternative suite authors its own complete topology for its direction.
  The resolved brief and Design System direction supply product intent, not a
  page-count quota; sibling suites may and should differ in route count when
  their content model and user journeys require it.
- Every formal Planner page authors its semantic regions and meaningful
  interactions, and every suite authors one or more flows over those exact
  interaction ids. Validation rejects duplicate region/interaction ids,
  missing source sections, unknown targets, mismatched flow steps, and
  unreachable pages. Production must not repair an incomplete graph with a
  generic region template or an automatically connected page ring.
- Agent-owned topology and orchestrator-owned referential integrity are
  separate. The Agent chooses which navigation edges exist and why; production
  code may compile those approved edges into exact interactions, but it must not
  invent an ordered page ring, infer missing destinations, or let independently
  expanded pages redefine the global graph. Deterministic Planner graph failures
  do not justify replaying the complete Provider planning chain; repair the smallest
  owning boundary or fail with a bounded Retry affordance.
- Alternative-suite distinctness is structural evidence, not route-order
  theater. One canonical `prototype-route-graph.v1` projection includes each
  route's semantic regions, interactions, and suite flows; it sorts unordered
  graph collections and rewrites page, region, interaction, overlay and state
  references to stable ordinals, so changing internal ids or route order cannot
  manufacture a new alternative. Planning, persisted-candidate validation,
  packaged renderer evidence, native validation and the external evidence
  validator compare that exact canonical document; its SHA-256 remains the
  content-addressed binding, not a second definition of graph identity.
- Every `direct-generate` material declares an output contract independently of
  its production route: `transparent-subject` for one isolated subject with
  clear Alpha margin, or `rectangular-media` for complete full-bleed media with
  opaque square canvas edges. Board materials are always independently
  separable transparent subjects. A collage, contact sheet, rounded UI mask, or
  adjacent variants cannot satisfy one manifest item.
- Every Agent-authored formal Planner route declares an explicit `materials`
  array with zero or more reusable non-UI visuals. Each material chooses
  `board-cutout` or `direct-generate` from its actual production needs. Zero is
  valid; production code must not infer or repair toward a per-page count.
- The semantic material manifest owns delivery cardinality. CV candidate count,
  generated blob count, DOM/component count, and a benchmark quota are evidence
  inputs, never substitutes for the Agent-authored set of independently reusable
  visual subjects. Every manifest item must bind to exactly one complete output;
  extra noise is discarded and a missing, fused, or cropped subject blocks that
  item rather than changing the expected count.
- Local fallback and clarification projections never invent material
  opportunities. They remain zero-material UI structure until an Agent-authored
  plan identifies reusable, non-code-reproducible visuals from the real
  business context.
- New `board-cutout` materials declare a stable route-local `boardGroupId`.
  Materials share a board only when the Agent determines they are a coherent,
  legible atomic family; one route may have zero, one, or multiple board
  groups. Both generated and persisted planning boundaries reject a missing
  group id; production never invents grouping for an incomplete formal Plan.
- The conversational generation decision is a short classification boundary:
  it may accept generation and distill the user's brief, but it does not author
  Design System directions, route topology, or reusable materials. The
  dedicated Planner is the sole planning authority and receives that accepted
  brief exactly once. Apply the small output ceiling only when every offered
  tool is a short classification/conversation tool; richer Astryx,
  regeneration, targeting, or material tools retain their reviewed ceiling.
  Do not duplicate the full plan in the tool gate or create competing topology
  authorities.
- Each `PrototypePage.route` is a unique stable logical destination. Web plans
  normally use URL/path identities; other platforms may use appropriate named
  screen or destination identities.
- New workspaces use `full-plan`. `primary-flow` remains an explicit user scope,
  not a hidden default.
- Every planned page must be reachable from at least one declared flow start.
- `anchor-parallel` generates or reuses the first planned page before bounded
  parallel generation. Every later page receives the same design-system
  reference and the same first-page visual anchor.
- Every newly generated page attempt enters Vision QA exactly once. Reviews may
  overlap page generation so anchor bytes unblock later images immediately, but
  page-set completion still joins every queued review. One semantic rejection
  may spend one bounded page-local image repair with the review failures appended
  as binding corrections and a fresh idempotency key; it never waits for every
  sibling page and then restarts the whole suite. Reviewer unavailability does
  not spend another image call. Each structured Vision QA review has its own
  180-second post-image deadline. Expiry aborts that review's exact Provider
  signal and produces the existing unavailable verdict even when the adapter
  ignores abort; it never spends a replacement image call. The artifact records
  its actual successful generation route out of band for this settlement: when
  review and generation share a Provider, review consumes `providerLane()` under
  the same production ceiling; a distinct-Provider review uses its independent
  bounded QA lane. Static pre-retry assignments never decide this ownership. Provider
  review settlement consumes capacity only and never opens, closes, throttles,
  or recovers image-route health. Recovered pages are never reviewed
  again merely because a continuation reuses them. Every page-local attempt
  re-resolves the currently healthy exact task-fit route before Provider execution.
  A semantic repair edits the exact rejected page: reference order is rejected
  page bytes, Design System bytes, then optional selected-material bytes. It
  omits predecessor/anchor references so Qwen Image 3 never receives more than
  three inputs. Prompt feedback and the visual edit base must describe the same
  rejected attempt; feedback-only redraw is not a repair.
  Only a passing reviewed page is reusable; a rejection after the local repair
  budget, or unavailable review, remains visible evidence and blocks downstream
  asset production until explicit Retry resumes that exact frontier.
- Planning and Vision QA are independent capabilities. A resolved composer
  route carries both the planning chat binding and an exact verified Vision
  binding; page, direct-asset, and board review always use the latter. A local
  planning-only Agent such as `codex-system` can therefore own planning while a
  separate image-capable Provider owns semantic review. Missing Vision evidence
  fails review preflight rather than treating the planning runtime as a vision
  model.
- Deterministic raster validation precedes Vision QA. The intrinsic dimensions
  decoded from image bytes must match persisted metadata, preserve the planned
  viewport orientation, and stay within the shared bounded aspect-ratio
  tolerance. Provider-side scaling is valid; rotation or a materially different
  canvas is not. Long-scroll pages retain their planned orientation. Do not
  crop, stretch, rewrite metadata, or ask Vision QA to guess these measurable
  facts. A failure names the exact page frontier and is exposed to packaged QA
  as `prototype-viewport`.
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
  and persist every candidate's visual plus deterministic `DESIGN.md` and token
  projections from the authoritative Design IR direction, retain
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
  first, then continues every sibling to final fidelity. Stable suite lanes are
  served round-robin under one shared ceiling, so a fast anchor cannot flood the
  queue with one direction's followers. A candidate-local integrity or quality
  failure records its page/resource frontier while later siblings continue.
  Authentication and configuration failures are route-terminal: the shared
  scheduler settles already in-flight calls but rejects queued and future
  claims without another Provider request. Rate-limit, timeout, network, and
  5xx pressure lowers the future shared ceiling one step at a time while
  independent queued suites continue. Two consecutive successful image calls
  recover one slot at a time up to the original ceiling; another transient
  failure resets that recovery evidence. Bulk health is a separate process-local
  projection keyed by exact provider id, exact model id, and image operation; it
  never creates or removes capability evidence. It retains only a bounded recent
  outcome/latency window, clamps latency at the existing desktop image deadline,
  and stores no raw error, credential, endpoint, prompt, or path. Repeated exact-
  route timeouts open that operation's circuit: Provider work already in flight may
  settle, but queued work and a fresh Retry scheduler consult the same health
  projection before another Provider request. A bounded cooldown admits one
  recovery probe. One page node may retry a classified transient transport
  failure once after re-entering its suite lane, using the same logical node id
  and a fresh Provider attempt id; an already-open route circuit may reject that
  claim without spend. Retry creates a fresh scheduler, preserves completed
  frontiers, and never reuses a failed Provider request identity.
- A cold or recently pressured exact image route admits one Provider request until
  a successful execution sample exists. An open circuit may drain queued claims
  immediately because those claims fail before spend; a half-open route still
  admits exactly one recovery probe. Page, direct-asset, and board retry attempts
  resolve the route again after prior pressure, and board QA receives the route
  that actually produced its bytes. Candidate quality order is applied before
  health preference, so health may select another task-fit route but cannot
  silently downgrade prototype fidelity.
- Generic image capability and prototype-task fitness are different contracts.
  Ordinary edit-image may use any exact supported adapter route. Complete
  Design System, page, direct-material, and board production admits only exact
  `gpt-image-2`, `qwen-image-3.0`, or `qwen-image-3.0-pro` routes. GPT Image
  1/1.5 and other generic edit routes remain visible/editable capabilities but
  never participate in prototype fallback.
- Recommendation within that task-fit set is objective-specific. Normal Design
  System, page, direct-material, and board work uses the `configured` objective
  and preserves the user's exact verified binding order. A page-local semantic
  QA repair uses `refinement` and prefers exact `qwen-image-3.0-pro`, then
  `gpt-image-2`. The packaged Qwen throughput experiment binds exact
  `qwen-image-3.0` in its isolated Provider fixture; it does not define a global
  Qwen-first product policy. Recommendation runs only after executable evidence
  and never changes the supported set. The exact-route health projection runs
  after static ordering, so an unhealthy preferred route yields to a healthy
  task-fit alternative.
- Page, direct-asset, board, and optional text-free image nodes use the same
  bounded transient-generation retry contract. It retries only classified
  rate-limit, timeout, network, and 5xx transport failures, propagates
  cancellation, and uses a fresh Provider attempt id while retaining the stable
  logical node id. Authentication, configuration, policy, malformed output,
  deterministic QA, and semantic QA failures are terminal for that attempt and
  never consume a transport retry.
- Progressive page-detail planning uses one bounded shared worker pool after
  the route outline and Design System foundation settle. Each page request owns
  only its exact outline plus the common graph context; results are restored in
  Agent-authored route order before closure and validation. A failed page still
  waits for already-started siblings, but never changes the expected page set.
- Progressive planning validates each page detail as soon as its parallel wave
  settles: route/viewport identity, page-local region/overlay/state references,
  and cross-page navigation targets are checked before closure. At most one
  invalid page receives one targeted structured repair that preserves its
  authored region, interaction, and reusable-material cardinality; sibling
  pages are never regenerated. Closure may use only exact settled page and
  interaction ids. An invalid flow/reference/reachability result receives one
  closure-only repair, then the final whole-plan validator remains fail-closed.
  Closure repair is generated against a runtime-closed schema derived from the
  exact settled page/interaction inventory. The schema preserves every authored
  flow id, name, goal, step count, and the original review documents while
  making an invented page/interaction pair unrepresentable. Prompt inventory
  alone is not an integrity boundary: a second model turn may hallucinate the
  same reference again even when the valid ids are present in context.
  Credential, policy, cancellation, transport, timeout, and schema-generation
  failures never trigger semantic graph repair.
- Fresh alternative topologies plan optimistically in bounded parallel from
  their distinct direction theses. The orchestrator then validates canonical
  route-graph fingerprints in stable candidate order. Only a colliding result
  receives one serial targeted repair containing the already accepted graphs;
  a second collision fails that candidate closed. Seeded and retry topologies
  bypass these model calls. Page/image production starts only after this
  topology barrier settles. Per-suite page pools must not multiply the combined
  page/board image ceiling.
- Every structured Planner stage has a 180-second aborting deadline and the
  complete plan has a 300-second parent deadline. The deadline race settles even
  when an adapter ignores abort; late output is discarded. Parent cancellation
  remains distinguishable from timeout, and neither condition starts another
  hidden Planner or image call. Desktop Planner and Vision QA deadlines use the
  bounded native monotonic owner because hidden/background WKWebView timers may
  be throttled or stopped. The desktop Provider-tool owner uses the same primitive
  at its existing 315-second image budget, after the unchanged 300-second native
  image transport failsafe. Browser and unit-test hosts retain a cancelable
  renderer fallback only when no Tauri runtime exists. A desktop command or
  permission failure settles closed immediately, and every completed/canceled
  owner releases its opaque native handle instead of leaving a native sleep.
- Native deadline or Codex process settlement is not sufficient evidence that a
  background renderer observed the completion. The isolated packaged macOS host
  pulses its hidden WebView with one fixed side-effect-free script from the
  native watchdog and at terminal native boundaries. The pulse is harness-only,
  accepts no caller script/window input, and never activates, focuses, or orders
  the window forward; foreground ownership remains externally sampled.
- Packaged E2E owns every outer journey, retry-grace, and Design System candidate
  owner deadline through the same native monotonic bridge. A long journey is a
  sequence of bounded native segments, never a `performance.now()` or renderer
  timer loop. Each active candidate-stage handle is cancelled on its terminal
  projection; expiry invokes the product Run cancel control, which aborts the
  owning lease and native Proxy request. It must settle every sibling out of
  `provider-executing` before evidence records failure, and it must not start a
  Provider retry after the expiry signal.
- A single-turn planning runtime acquires one renderer-wide session before the
  complete Plan deadline starts. Its independent page expansion uses runtime
  parallelism one, so no page-stage deadline elapses while that page is queued
  behind another native turn. Separate windows and projects may queue before
  the session boundary, but native process custody rejects every overlapping
  turn as busy and never terminates or replaces another workspace's process.
  Every Plan and classification run uses a fresh conversation identity; any
  persisted binding reuse must match both context revision and digest.
- A retry after a transient prototype-suite failure is also a bounded
  continuation. It bypasses the already-settled intent gate, ignores any
  incidental material selection left by completed siblings, retains ready
  suite artifacts, and resumes every currently failed suite's missing pages
  under the shared ceiling. Generic outcome repair must not collapse this retry
  into one singular suite.
- A suite Retry frontier retains two different authorities. Passing pages are
  reusable delivery nodes and are skipped; each incomplete page retains its
  latest rejected artifact plus hash-bound review receipt as repair input. The
  continuation feeds those failures into its first Provider attempt and edits the
  rejected bytes. Initializing or settling a continuation must not overwrite
  the frontier with passing pages only, even when the next Provider request
  fails before returning new bytes.
- One visible Retry acknowledges all failed suite frontiers in the settled DAG.
  Each sibling retains its own pages/materials and resumes independently;
  ready siblings are not replayed and no second user click is required merely
  because another independent suite failed in the same settlement.
- A material-production retry resolves the latest same-plan run by `planHash`,
  derives target regions from failed/needs-review tasks and from cancelled tasks
  that retain blocking integrity or quality evidence, and carries consumable
  tasks through `carryAssetProductionTask`. A later sibling may supersede a
  needs-review run before the user retries it, so status alone is not a durable
  retry frontier. Starting the new run supersedes the old run to `cancelled`;
  do not rewrite it back to a non-authoritative nonterminal status. Pages and
  successful board/direct nodes are not replayed.
- Packaged request evidence uses stable logical node ids across attempts. The
  planned count is the compiled resolved baseline plus observed repeat attempts,
  and must equal the actual Provider call count. A retry budget is evidence of
  work that occurred, not permission for an automatic QA re-roll.
- Planner checkpoint attempt ids come from product-owned Planner invocations,
  not the journey-wide Retry counter. A suite-only continuation reuses the
  settled plan and therefore emits no second copy of stale Planner progress.
- Required resource-pack settlement must not await optional semantic naming or
  another non-authoritative presentation enhancement. Prototype production uses
  the manifest label immediately; any later AI naming is bounded, cancellable,
  failure-observed, and detached from task publication, run finalization, and
  delivery readiness. A missing stream terminator in optional work can neither
  hold a production lane nor leave a suite `generating` after every required
  artifact has settled.
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
- Once every observed suite is terminal (`ready` or `failed`) and at least one
  failed frontier exists, the product must leave its busy state promptly. The
  packaged driver gives this local settlement transition two minutes, then
  cancels any residual run and fails as `orchestration-state`; it never hides a
  stuck state transition behind the multi-hour all-suite Provider timeout.
- Product candidate identities and sanitized packaged evidence identities are
  separate domains. The driver uses the runtime candidate id only to observe
  selection acknowledgement, then resolves the bounded `suite-N` projection
  before matching resource counts or emitting terminal evidence. It must never
  compare a runtime candidate id directly with a sanitized suite id.
- Terminal packaged success requires one sanitized delivery record for every
  promised suite. Each record uses bounded ordinal Design System, suite, and
  distinct resource-pack IDs; exact route/page/artifact counts; explicit
  `passed` review status; and lowercase SHA-256 digests for Design System
  media/Markdown, deterministic token projections, route/page media, manifest,
  exact bindings, resource-pack identity, verified bound resource media,
  provenance, page review evidence, resource review evidence, and review
  document. Page review evidence must bind the exact page digest, and resource
  review evidence must bind the exact artifact id. Missing, stale, rejected, or
  unavailable review evidence cannot be represented as a pass. Bound resource media is re-read from the
  local content-addressed store and checked against its completed production
  task digest; binding ids alone are not delivery proof.
  Product delivery may retain `attention-required` as an honest user-review
  state, but that state cannot prove release fidelity. Missing or malformed
  evidence rejects success. `result.json`, logs, and diagnostics expose no
  runtime IDs, prompts, Provider payloads, credentials, unreviewed host paths,
  or embedded image bytes; exact bytes live only in the fixed evidence object
  store described below.
- Release evidence retains the exact canonical Agent plan, authoritative Design
  IR, design documents, manifests/bindings/reviews, and every Design System,
  page, and resource raster. The renderer supplies bounded base64 bytes only in
  packaged-E2E mode; the native command recomputes length, SHA-256, media format,
  and intrinsic dimensions, writes only `objects/<sha256>` under its fixed result
  root, and re-reads every object before terminal success. Provider evidence is
  restricted to purpose, kind, exact model, and local/remote classification; a
  real remote image route is mandatory, while Provider ids, origins, prompts,
  headers, credentials, and local paths are forbidden. Finalization retains the
  referenced objects, and the external Node validator independently recomputes
  their hashes/dimensions plus plan, Design IR, manifest, binding, review, and
  contact-sheet completeness.
- Production progress is a derived, non-persisted projection of monotonic
  QA-accepted page and ready resource observations. Returned image bytes that
  are still awaiting review, rejected, or unavailable never count as completed.
  A separate bounded per-page activity projection exposes generated, reviewing,
  rejected, retrying, and accepted states plus the one-based attempt; these
  states may change without falsifying monotonic completion. The suite comparison
  remains expandable while candidates are generating so this evidence is visible
  before the first ready suite. It distinguishes completed, active, queued,
  failed, and retry-preserved nodes. Remaining time is `unavailable` until the
  graph is measurable, `collecting` until at least two real completions span a
  positive interval, then a conservative bounded range; ready and failed
  candidates never show a precise ETA.
- A generating suite whose topology has not settled yet shows an explicit
  route-planning stage instead of hiding all status or inventing `0%`/an ETA.
  It switches to resolved page/resource counts only after the Agent-authored
  graph and material manifest exist.
- Page review also emits durable `prototype-page-review-started`,
  `prototype-page-review-passed`, and `prototype-page-review-rejected` run
  events. Each binds suite candidate, page id, and one-based attempt. Rejection
  retains at most eight sanitized failure strings of at most 500 characters;
  credentials and host paths are redacted before event, prompt, or receipt use.
  These facts do not independently make the run terminal or create failure
  notifications while a local repair remains active.
- Packaged `progress.json` is terminal state, not a running-only heartbeat.
  Completion validates first, installs terminal progress before the matching
  result, and returns only when status and merged phases agree. Late native or
  WebKit checkpoints cannot reopen `passed` or `failed` progress.
- Dynamic suite activity checkpoints are bounded by candidate and lifecycle
  state, not every observed count combination. The first count still proves
  generating/reviewing/retrying/rejected activity while phase growth stays
  within the native evidence budget during long concurrent runs.
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
- Visual QA rejection/unavailability and deterministic output-edge contract
  failures are blocking after the single baseline generation call. Preserve the
  candidate and evidence as `needs-review`; do not publish a ready resource pack
  and do not start an automatic Provider re-roll. Board-background diagnostics may
  remain observational after deterministic Alpha edges and semantic QA pass.
  Missing, ambiguous, cross-slot, undecodable, or unavailable required outputs
  remain integrity failures and fail the pack closed.
- Normal Design System candidate production projects `DESIGN.md` and exportable
  tokens deterministically from the authoritative Design IR plan and selected
  direction. Do not block every candidate on reverse-synthesizing documentation
  from its stochastic preview image. Image-grounded synthesis remains an
  explicit repair operation, not a baseline critical-path call.
- Page generation and visual review use separate bounded lanes. Review starts
  as soon as an image is available and must finish before suite completion, but
  it does not retain a page-generation worker while later image slots are idle.
- Complete suite alternatives may run concurrently under the one shared image
  limiter. Queue the preferred direction first and keep it as the only singular
  workspace projection until a human selects another ready direction. From that
  point, only the human-selected direction may publish pages, mockups, slices or
  naming state; in-flight siblings continue producing candidate-local artifacts
  without replacing the visible workspace. Do not serialize every sibling behind
  its full page and resource pack.
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
| Valid authoritative `designSystem.designMarkdown` | include it in every page prompt as `Final DESIGN.md` |
| Invalid final `designSystem.designMarkdown` | fall back to pre-synthesis text context; keep the image identity reference |
| Count exceeds `bounds.maxCandidates` | reject the plan; never clamp silently |
| Direction count differs from resolved count | reject the executable plan |
| Multiple-direction proposal has no selection | persist candidate results and stop before page generation |
| Selection references failed/missing candidate | reject without changing the singular selected projection |
| Candidate base revision differs from current revision | reject as stale and require regeneration |
| One board region fails with a retryable Provider error | retry that logical node once with a fresh attempt id; after exhaustion expose Retry and retain ready pages/tasks |
| Page visual QA rejects | append its failures and reroll that page once with a fresh idempotency key; after exhaustion retain evidence, block ready publication, and let explicit Retry resume the frontier |
| Explicit Retry starts with a rejected page | edit the exact rejected bytes with prior failures; preserve passing siblings and omit anchor/predecessor references |
| Page visual QA is unavailable | retain the exact candidate and unavailable review, spend no replacement image call, and block ready publication |
| Resource visual QA rejects/is unavailable | retain its exact candidate and review evidence, block ready publication, and let explicit Retry regenerate only the rejected frontier |
| Transparent subject has foreground Alpha on an outer canvas edge | `needs-review`; possible clipping cannot satisfy delivery |
| Rectangular media has transparent/rounded outer edges | `needs-review`; UI masking cannot be baked into reusable media |
| Retry starts a new same-plan production run | supersede the prior `partial` authority to `cancelled`, then carry only consumable matching tasks |
| Planned and actual packaged image-call counts differ | fail the terminal E2E outcome; do not hide replay or retry amplification |
| One candidate has a candidate-local integrity/quality failure | retain its local frontier and continue every independent sibling |
| One candidate reports authentication/configuration failure | settle in-flight calls, stop queued image claims, and retain every frontier for explicit Retry |
| One candidate reports transient Provider pressure | lower the future shared ceiling, retain its frontier, and continue independent queued suites |
| Parallel topology results have distinct canonical fingerprints | accept them in stable candidate order without another Planner call |
| A parallel topology duplicates an accepted graph | issue one serial graph-conditioned repair; fail only that candidate if it still collides |
| Natural business intent has no explicit page count | stream the bounded route outline first; do not spend a monolithic complete-plan request before progressive expansion |
| Brief explicitly bounds one to three pages | permit the monolithic structured Planner path and progressively recover only from a compatible contract failure |
| One structured Planner stage exceeds 180 seconds | abort and return the named stage timeout; do not wait for the adapter indefinitely |
| The complete Planner exceeds 300 seconds | abort every active stage and return the total planning timeout |
| One page detail contains an invalid local/cross-page reference | repair only that page once, preserving authored cardinality; never replay sibling page expansion |
| An outline edge cannot be compiled into its settled source page | fail closed with a safe graph diagnostic; never ask a model to repair or recreate authoritative navigation |
| Page repair remains invalid | fail closed with a safe graph diagnostic and retain the original technical reason only in local diagnostics |
| A Planner run fails while a live progress label remains | clear ephemeral output at run settlement and suppress every pending feed projection when the terminal error exists |
| Any Planner deadline expires in packaged E2E | retain the closed `planner-timeout` diagnostic and the latest bounded Planner/pipeline checkpoints across renderer, native progress, and external evidence validation |
| A Vision QA review exceeds 180 seconds | abort its exact review signal, retain an unavailable verdict, and spend no replacement image call |
| A desktop Provider-tool deadline expires while renderer timers are stopped | settle from the native 315-second owner and propagate abort to the executor |
| A Design System candidate remains in one owner stage past its packaged E2E deadline | settle from the native stage handle, cancel the owning Agent run, abort registered native requests, and require every candidate to leave `provider-executing` |
| A native desktop deadline command is missing, denied, or rejected | fail closed immediately; never fall back to a throttled renderer timer |
| Native Planner work has settled but the hidden WebView has not drained its invoke completion | use the fixed packaged-only background pulse; if checkpoints still stall with no live child, fail the release run rather than waiting for the outer budget |
| Every suite is ready/failed but the run stays busy past the settlement grace | cancel the residual run and fail packaged evidence as orchestration state |
| Delivery proof omits a review/token/topology/binding/resource-media/provenance digest | reject packaged terminal success |
| Delivery records reuse a resource-pack identity | reject packaged terminal success |
| Evidence upload changes bytes, length, digest, intrinsic dimensions, or semantic role | native sink rejects it before terminal write |
| Evidence contains only digest labels, a local-only image route, a secret/path, or a 1x1/low-information capture | native/external validation rejects release success |
| Finalized evidence omits a referenced `objects/<sha256>` file or changes it after native write | external validation rejects the standalone bundle |
| Fewer than two timed logical completions exist | show `collecting`, never a precise ETA |
| A generating suite has no resolved page/resource totals yet | show route-topology planning; do not display a percentage or ETA |
| A checkpoint arrives after terminal completion | preserve terminal progress status and phases |

## 5. Good / Base / Bad Cases

- Good: the Agent derives four routes across two workflows; all four images are
  generated, share one visual anchor, consume the authoritative final
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
- Good: three distinct direction topologies plan concurrently, pass canonical
  fingerprint validation, and enter image production after one planning wave.
- Base: one parallel result duplicates an earlier graph, so only that candidate
  receives one graph-conditioned repair before the barrier settles.
- Bad: every alternative Planner call waits for the previous complete topology
  even though collisions are rare, multiplying the user's wait by candidate
  count without improving the accepted result.
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
- Good: native persistence stores exact plan/Design IR/document/media bytes by
  recomputed SHA-256; a copied final bundle validates without access to renderer
  state or the original content store.
- Base: a complete suite has zero reusable assets; its empty manifest, bindings,
  artifacts, and resource reviews still bind exactly, while its Design System
  and every page raster remain byte-backed.
- Bad: suite digests are hashes of labels such as `page-media`, captures are 1x1
  placeholders, or the image route is loopback but marked as release evidence.

## 6. Tests Required

- Planner prompt test: asserts dynamic IA ownership, platform-native route meta
  rules, complete route coverage, and no fixed template instruction.
- Planner throughput tests: progressive page expansion reaches but never exceeds
  its shared concurrency bound, preserves route order, and reports monotonic
  completion; suite topology planning starts independent candidates together,
  accepts distinct fingerprints without extra calls, and spends exactly one
  serial repair only for a collision.
- Planner integrity tests: an invalid page-local or cross-page reference repairs
  only its owning page; deterministic closure compilation uses only the accepted
  outline entries and edges and never makes a closure Provider call; a second
  invalid page result fails closed; and credential, cancellation, policy,
  timeout, transport, or schema failures never start graph repair. The final
  `validatePrototypePlan` check remains the authoritative defense even after all
  staged checks pass.
- Planner routing tests: a natural business brief with no page count starts with
  the closed outline stream before any structured expansion, while explicit
  one-to-three-page briefs retain the bounded monolithic path. Chinese count
  extraction must require the numeral to modify a page unit and must not treat a
  numeral inside a product/person name as workload evidence.
- Planner deadline tests: a stage and complete plan both settle at their exact
  budgets from the native monotonic owner even when renderer timers are disabled
  and the mocked transport ignores abort; parent cancellation still returns
  cancellation rather than timeout.
- Vision QA deadline test: a never-settling structured review that ignores abort
  returns the existing unavailable verdict at 180 seconds and its exact Provider
  signal is aborted without another image attempt.
- Native deadline tests: duration and opaque-handle validation, duplicate
  rejection, cancellation cleanup, permission/handler allowlisting, desktop
  fail-closed behavior, and browser-only fallback remain executable.
- Packaged candidate-deadline regression: with renderer timers disabled, a
  native Design System provider-stage expiry produces the exact owner diagnostic;
  a ready/failed/cancelled projection releases its native handle without a
  spurious later cancellation.
- Packaged lifecycle regression: the background watchdog and terminal native
  Planner boundaries invoke only the fixed no-op renderer pulse; source checks
  reject activation, focus, front-ordering, or a caller-provided script surface.
- Formal Planner material tests: explicit zero materials, multiple board groups
  on one route, rejection of missing group ids, standalone direct materials,
  and duplicate route-local material ids; no benchmark count becomes a
  production default.
- Single-turn Planner arbitration tests: page expansion stays at runtime
  parallelism one; independent adapter instances cannot overlap sessions;
  queued cancellation starts no native turn; cross-workspace native contention
  preserves the first owner; stale bindings reject revision or digest drift.
- Plan validation test: duplicate route identities fail while arbitrary Agent
  route names remain valid.
- Page-set unit test: all pages are generated, progress stays in plan order,
  concurrency is bounded, and every follower uses one stable anchor.
- Scheduler regression: sibling suite lanes rotate under contention; transient
  pressure lowers the future ceiling without discarding queued sibling work;
  authentication/configuration failure still closes queued claims; repeated
  exact-route operation timeouts open a bounded shared circuit, preserve Provider
  work already in flight, and block a fresh continuation before another call.
- Route-selection regression: generic GPT Image 1/1.5 edit support remains
  intact while prototype fitness rejects it; quality ordering prefers
  `gpt-image-2`, and a transient retry re-resolves to another healthy task-fit
  exact route rather than replaying the pressured route.
- Provider-lane regression: page, direct, and board review share the image
  ceiling only with the Provider that produced the reviewed bytes; distinct
  Providers may overlap, and review success/unavailability never counts as
  image concurrency-recovery evidence.
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
- Asset-production regression: visual QA rejection and deterministic edge
  violations remain `needs-review`, while a background-only observational
  warning may remain ready; missing or invalid required output still leaves the
  production run incomplete.
- Optional-enhancement liveness regression: a semantic naming promise that
  never resolves is cancelled at its own bounded deadline, while required board
  slices, coverage evidence, task states, and the enclosing resource run settle
  without waiting for it.
- Rendered retry regression: exhaust the one local transient page retry in one
  suite while a second suite fails once with a non-transient output error.
  Retry through one visible Agent control, require immediate busy/failure
  acknowledgement before asynchronous preflight, require all suite candidates
  to become ready, and prove calls equal the resolved baseline plus the exact
  repeated attempts rather than full-suite replay.
- Rejected-page continuation regression: reject one page through both local
  attempts, then pass after one explicit Retry; assert the second and third
  Provider requests use the immediately preceding rejected bytes as reference zero,
  preserve accepted sibling call ids, carry sanitized failures into the first
  continuation prompt, stay within three references, and persist three started,
  two rejected, and one passed review events.
- Packaged-driver retry regression: track each candidate page/resource frontier
  separately while allowing one acknowledged product Retry to claim all failed
  suites; prove duplicate pre-acknowledgement clicks, per-frontier loops, and
  total journey retry amplification remain bounded.
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
  private/generated keys in both driver and native validators; product
  projection retains `attention-required`, while packaged driver and external
  validator reject it as release success.
- Native/external evidence regressions: tamper uploaded and persisted object
  bytes, hash, length, media dimensions, semantic roles, Design IR routes,
  plan/manifest/binding/review cardinality, Provider classification, capture
  dimensions/pixel diversity, traversal/symlink paths, and a required contact
  sheet. Revalidate the finalized bundle independently and assert its harness
  inventory contains every unique referenced content-addressed object.
- Progress regressions: require monotonic logical counts, retry-preserved
  frontiers, page activity transitions through generated/reviewing/rejected/
  retrying/accepted, every estimate state, conservative ordered ranges, and
  terminal estimates that are unavailable rather than falsely precise.
- Terminal packaged regressions: result and progress close with identical
  terminal status/phases, late checkpoints remain ignored, and a failed result
  install restores prior progress or removes newly installed progress.
- Failure projection regression: even if an upstream progress label was not
  cleared, a terminal planner error renders one stopped message, no pending
  `Thinking` bubble, a safe actionable navigation-plan summary, and the matching
  credential-free packaged diagnostic.

## 7. Wrong vs Correct

### Wrong

```ts
// Hidden product template and hidden route loss.
const pages = [homePage, pricingPage, aboutPage]
const scope: PrototypeSuiteScope = 'primary-flow'
await Promise.all(pages.map((page) => generate(page, designSystemOnly)))

// Bypasses the authoritative Design System contract that was just projected.
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
  review: reviewPage,
  maxReviewRetries: 1,
  isReviewAccepted: (artifact) => artifact.review?.verdict.pass === true,
  shouldRetryReview: (artifact) =>
    artifact.review?.verdict.pass === false
    && artifact.review.verdict.unavailable !== true,
  retryAfterReview: (page, _anchor, rejected, attempt) =>
    generatePage(
      page,
      [rejected.bytes, designSystem.bytes, optionalMaterial].filter(Boolean),
      rejected.review.verdict.failures,
      attempt,
    ),
})

const pageDesignContext = isValidDesignMarkdown(designSystem.designMarkdown)
  ? designSystem.designMarkdown
  : preSynthesisContext
```

```ts
// Wrong: serialize the normal path merely so each prompt can see prior graphs.
for (const candidate of candidates) {
  plans.push(await plan(candidate, plans.map(prototypeRouteGraphFingerprint)))
}

// Correct: parallelize independent work, then validate deterministically and
// repair only the exceptional collision against accepted graph evidence.
const outcomes = await planDistinctSuiteTopologies({
  requests: candidates,
  concurrency: 3,
  priorFingerprints,
  plan,
  fingerprint: prototypeRouteGraphFingerprint,
})
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
// Wrong: a label hash and metadata-only image stand in for retained delivery.
files.push({ role: 'pageMediaObject', sha256: sha256('page-media') })

// Correct: native persistence recomputes the exact bytes and returns only a
// content-addressed reference that the external validator can re-read.
const evidence = await invoke('packaged_e2e_persist_evidence', {
  payload: { providerRoutes: sanitizedRoutes, files: exactUploads },
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
