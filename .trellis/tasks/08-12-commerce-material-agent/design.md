# Build portable commerce material agent - technical design

## First-principles Agent model

The irreducible job of a Cutout Agent is:

> Convert bounded evidence into an agreed outcome, under explicit constraints,
> using authorized effects, and retain enough proof to review, repair and
> deliver the result.

Everything domain-specific follows from seven universal records:

1. `EvidenceGraph`: facts, source identity, trust, license and uncertainty.
2. `OutcomeContract`: required deliverables and observable definition of done.
3. `CapabilityCatalog`: typed effects with schemas, preconditions, host support,
   permissions, cost and operational limits.
4. `ExecutionPlan`: dependency graph, selected capabilities, budgets and repair
   boundaries compiled for one exact outcome revision.
5. `RunLedger`: attempts, approvals, receipts, checkpoints and terminal states.
6. `ArtifactGraph`: immutable candidate/final revisions and derivation lineage.
7. `EvaluationReport`: deterministic and model-assisted gates that decide
   readiness; only a passing report can bind a target delivery manifest.

The Agent loop is therefore stable:

```text
understand -> contract -> plan -> authorize -> execute -> evaluate -> repair/deliver
```

It never contains `if prototype`, `if commerce` or `if brand`. Domain knowledge
is supplied by extensions around the loop.

The system boundary is Design OS. A valid workflow ultimately produces,
transforms, evaluates or delivers a designed artifact: interface, design system,
brand identity, campaign asset, localized commerce material, packaging or
motion. Coding and integration actions are subordinate delivery capabilities,
not independent reasons for Cutout to become a general-purpose work Agent.

## Outcome grammar and extension model

The product must not confuse a reusable recipe with the user's project. The
authoritative planning object is an `OutcomeGraph`: typed outcome nodes and
relations compiled from a universal brief. Nodes describe observable designed
results and their constraints; relations describe composition, sequence,
derivation, shared identity, variants, dependencies and delivery membership.
This permits one project to combine an interface, product demonstration,
campaign stills, localized copy and packaging without selecting one dominant
vertical. Outcome nodes share project-level evidence and locks by reference but
settle revisions, review gates and delivery readiness independently, so a
blocked video does not make an already approved interface artifact mutable or
erase its valid delivery state.

Use a common envelope plus registered typed payloads, not one ever-growing
union or a schema-less property bag. Every outcome/artifact node shares stable
identity, semantic role, evidence links, constraints, lifecycle, lineage and
evaluation bindings. Spatial frames, interactive states, audiovisual shots,
copy, audio and delivery manifests retain their own versioned payload schemas.

The planner composes the graph from orthogonal, independently versioned
fragments:

- intent and audience;
- evidence and identity locks;
- spatial, temporal and interaction composition;
- content, style and design-system rules;
- locale, market and channel policy;
- evaluation, variant and delivery requirements.

Composition must be monotonic and diagnosable: each contributed default or
constraint records its source, conflicts are surfaced before execution, and no
recipe can silently override explicit brief evidence or a stronger policy.

Shared evidence, locks and policies participate in a revisioned dependency
index. When one changes, a pure impact reducer walks typed relations and emits
an `ImpactSet` containing affected outcome/artifact revisions, invalidated
evaluations and the reason path for each edge. It marks those nodes `stale` but
does not delete candidates, revoke unrelated acceptance or execute repair. The
planner derives a new repair plan from the impact set; authorization and normal
effect boundaries still apply.

Contract revisions follow propose/authorize/freeze/execute semantics. A frozen
revision is content-addressed and executors receive only node contracts compiled
from that hash. In-contract repair may create new attempts and artifact
revisions within declared repair boundaries, but cannot rewrite graph scope,
budgets, policies or acceptance. Discoveries outside those boundaries produce a
successor proposal linked to its parent; affected execution pauses while
unrelated authorized nodes may continue.

Use a `Workflow Profile` as the deployable unit, composed from existing
versioned Workflow Pack concepts plus four missing contracts. It is a recipe
and compatibility bundle, not authoritative project state or a mutually
exclusive mode:

- domain pack: fact schemas, vocabulary and normalization adapters;
- policy pack: market/channel rules and deterministic constraints;
- production pack: plan templates, capability requirements and evaluators;
- delivery pack: target manifests and writers;
- presentation lens: semantic grouping, previews, inspectors and review actions
  projected from generic records without owning workflow state.

The existing `cutout.workflow-pack.v1` DAG/capability/eval metadata is useful but
not yet executable enough: its steps contain operation ids and dependencies but
no typed inputs/outputs, outcome contract, policy bindings, resource budgets,
repair semantics or presentation projection. Evolve it rather than creating a
parallel plugin concept.

Generality is "closed world per run, open world by extension": profile install
and compatibility checks may add reviewed behavior, while an active run sees
only its resolved immutable profile, exact capability set and host policy.

Profiles and recipes are declarative data packages. They may contain versioned
Outcome/schema fragments, policy and evaluator definitions, presentation
metadata, material/Library references and required semantic capability ids, but
not executable JavaScript, shell argv, network origins or filesystem paths.
Capability, Provider and Target adapters execute only behind a Cutout-owned or
explicitly trusted signed Host boundary and remain independently allowlisted.

Extension admission previews publisher/source identity, exact version and
content hash, dependency closure, requested capabilities, Cutout/schema
compatibility, migration plan and evaluation evidence. The package and closure
materialize in verified CAS and the Project records an exact lock through a
normal ChangeSet. Update follows the same path and leaves the prior closure
available for rollback/reproduction. Initial distribution is built-in or
explicit trusted-package import; a future marketplace is catalog/distribution
only and cannot confer execution authority.

Profile resolution is outcome-first and compositional. A universal brief
produces a proposed `OutcomeGraph`/`OutcomeContract`, then resolves zero or more
compatible recipe fragments and presentation lenses. The user reviews concrete
deliverables, fixed evidence, important unknowns, cost and constraints rather
than choosing an internal workflow taxonomy. An explicit profile/preset can
accelerate familiar work, but cannot become exclusive, hide graph contents or
bypass evidence, contract and compatibility validation.

## Planner and executor separation

Do not build one omniscient prompt. The planning model outputs a typed proposed
`ExecutionPlan`; a deterministic compiler resolves profile defaults, validates
dependencies, proves capability/policy/budget compatibility and freezes the
plan hash. Executors receive one bounded node contract and cannot mutate the
graph, grant permission, choose arbitrary paths or mark themselves accepted.

Subjective model review emits findings and evidence. Only the deterministic
evaluation reducer can decide whether an artifact is ready, needs repair or is
blocked. This makes model replacement and new domains possible without moving
authority into prompt wording.

### Schema evolution, reproduction and observability

Every canonical record has a strict protocol/version envelope. A registry
selects pure, idempotent migrations whose receipts bind predecessor and result
hashes; original bytes and provenance remain immutable. Unsupported newer
required schemas open only through a diagnostic/read-only path and cannot be
coerced into a weaker current record.

Every terminal Run emits a `ReproductionEnvelope` containing exact input,
schema, dependency, Contract, Plan, route, supported parameter/seed, attempt,
receipt and output-hash evidence. This supports audit and comparable replay, but
does not promise identical generated pixels unless the Provider route makes and
proves that guarantee.

Run events use stable reason codes and typed dependency paths for route choice,
budget/spend, retries, degradation, repair and terminal blockers. Indexed ids
and relations keep graph resolution, impact and replay incremental. Host graph,
artifact, byte, concurrency and time budgets are explicit Plan inputs and fail
before spend when exceeded.

## General workbench projection

The product shell should expose universal user questions, not domain internals:

- Brief: what outcome is wanted and what is fixed?
- Sources: what evidence may be used and what remains unknown?
- Board: what candidates and final artifacts exist, grouped by semantic roles
  declared by the active presentation lens?
- Review: what blocks the outcome and what repair would change?
- Deliver: what exact files/targets will be produced and with what receipt?

The Agent dock remains selection-aware across all profiles. The center surface
is a result board, not an editable execution DAG. Advanced execution details can
show the plan/ledger, but users should not wire model nodes to use the product.

Current prototype assumptions must move out of shared UI contracts:

- tool eligibility cannot remain distributed in `IntentWorkspace`;
- outcome/material kinds cannot remain a closed prototype-only union;
- material impact cannot be restricted to design/page/slice;
- canvas lanes cannot be fixed to Design System/Prototype/Assets;
- navigation must not gain one new mode or inspector per workflow profile.

### Project, ChangeSet and presentation lenses

Use one durable hierarchy: Workspace contains Projects and published Library
Releases; a Project owns its EvidenceGraph, multi-outcome OutcomeGraph,
ChangeSets and Delivery records. Threads, conversations and tasks are activity
views over that Project and never become competing sources of truth.

A `ChangeSet` isolates a proposed mutation from one exact project revision. It
records semantic commands, candidates, affected graph nodes, ImpactSet,
evaluations, comments, approvals and merge/close state. This is the common
abstraction behind Figma-like controlled exploration and Git-like branch/PR
review without pretending their byte and conflict models are identical.

Concurrent ChangeSets use semantic, dependency-aware rebase rather than
arrival-order overwrite. The resolver compares the ChangeSet's command read and
write sets plus graph dependency closure against every accepted revision since
its base. If those sets remain disjoint and all invariants still hold, it may
emit a successor `RebaseProposal` bound to the current Project revision. That
proposal is visible, receives a new revision and must recompute ImpactSet,
validation, evaluation and authorization; it is never an implicit merge and
does not inherit approval from its predecessor.

Overlap on the same semantic node, shared identity or policy lock, locked
Library version, Outcome Contract or Delivery Manifest creates a typed
`ChangeConflict`. The record binds base/current/ChangeSet revisions, competing
commands and sources, affected nodes, violated invariants and permitted
resolution commands. Resolution always creates a successor ChangeSet revision;
neither side is selected by last-write-wins. Designer Lens projects this as an
outdated exploration with visual impact and explicit keep/combine choices,
while Builder Lens exposes rebase and semantic-diff detail over the same record.

The Designer Lens presents the ChangeSet as exploration with Board/Timeline
candidates, overlay/side-by-side visual comparison, brand adherence and review.
The Builder Lens presents the same record as base revision, semantic/target
diff, plan, checks, preview and delivery/PR binding. These are contextual lenses,
not global personas or modes; both converge through the same semantic dispatcher
and revision-bound approvals.

Review uses two linked records. A `ReviewThread` contains revision-bound human
or Agent observations, replies and annotations plus an optional selector for a
graph node, artifact region, component, time range or delivery target. It is
evidence only. A typed `ChangeRequest` is created explicitly from one or more
threads and records normalized intent, target scope, priority, constraints and
acceptance conditions. The Agent may propose clarification or a ChangeSet from
that request, but no thread or request carries execution or approval authority.

Thread closure is evidence-backed: `implemented` references the satisfying
ChangeSet and result revisions, while `rejected`, `duplicate`, `deferred` and
`superseded` retain actor, rationale and any replacement reference. Designer
Lens renders spatial/timeline annotations and Builder Lens renders review
threads/issues and checks, but both dispatch against the same thread,
ChangeRequest and disposition identities.

Agent Runs, conversations and task boards are append-only activity and
coordination views. A mutation-bearing Run references exactly one ChangeSet and
a declared Outcome/node scope; its events, plan and receipts remain evidence on
that proposal rather than becoming Project state. Runs on disjoint scopes may
proceed concurrently. Overlap is detected from semantic command/dependency sets
and enters the canonical rebase/conflict path. Executors may use short-lived,
renewable leases for one side-effect claim, but assignment or lease ownership
does not lock authoritative design nodes or confer review authority.

An `ActionQueue` is a deterministic projection from unresolved ChangeRequests,
blocking EvaluationReport findings, pending approvals, ChangeConflicts and
failed Delivery records, augmented by optional assignee, priority and due date.
Manually added coordination items retain a source link or remain explicitly
non-blocking. Closing an item requires the owning source's valid disposition;
Run completion alone only submits artifacts and evidence. Designer Lens groups
these records as design work and pending review, while Builder Lens exposes
tasks, checks, Runs and delivery blockers over the same source identities.

Project history is an append-only sequence of immutable revisions produced by
validated semantic commands. Periodic content-addressed snapshots accelerate
replay but must validate against the command/revision digest and never replace
history as authority. A named `Milestone` stores an exact Project revision plus
label, author and timestamp; approvals continue to reference their own exact
closures rather than inheriting from the label.

Opening an older revision is read-only comparison. Restore computes a
dependency-aware semantic, visual and target diff against current state and
creates a `RestoreChangeSet` whose commands reproduce only the selected affected
Outcome/node closure as a new successor revision. It passes ordinary conflict,
evaluation and authorization gates and does not revive old approvals. Immutable
Provider, authorization and Delivery receipts remain in history; reversing an
external effect requires a supported compensating command or a replacement
delivery. Designer and Builder history lenses differ only in presentation.

### Shared semantic command boundary

All authoring surfaces are clients of one typed command dispatcher. A command
contains its kind and version, target ids and expected base revisions, typed
payload, actor/proposal identity, reason, authorization requirement and optional
group id. It is validated against the active Outcome Contract and capabilities,
reduced into new immutable graph/artifact revisions, then recorded with its
impact set and inverse/compensating operation where one exists.

Direct manipulation uses deterministic commands for precise authorship:
select/promote a candidate, reorder or retime, crop/reframe, edit structured
copy, set constraints and locks, create a variant, annotate, accept or reject.
The Agent proposes the same commands for local changes. Generative effects,
multi-node transformations and contract changes first compile into an
authorized plan whose successful receipts emit semantic result commands; an
executor never edits authoritative state directly.

Optimistic UI may preview a command but commits only after validation. Commands
are revision-bound: a stale base yields an explicit conflict and rebase/repair
proposal rather than last-write-wins. Undo creates a new auditable revision or
compensating command; it does not erase production receipts or provenance.
Artifact-type renderers may offer specialized controls, but do not own a second
state model or grow into unrestricted Figma, NLE or DAW clones.

Approval is a revision-bound lattice, not one project flag. `ArtifactAccepted`
binds one candidate into a required or optional role. `OutcomeApproved`
references the exact Outcome revision, accepted artifact revisions and passing
evaluation report. `DeliveryApproved` references one immutable manifest,
destination binding and approved Outcome set. Higher levels require lower-level
evidence but do not rewrite it or grant approval to sibling or newer revisions.

Batch approval validates the complete explicit set and commits one auditable
transaction or none. Dependency invalidation marks the corresponding
higher-level approval stale without mutating its historical receipt. Delivery
checks current revision closure immediately before projection, so an old token
cannot authorize changed bytes, a new channel variant or a different target.

Authority is represented by Project-scoped capability grants, independently of
presentation. A grant binds its issuing Host/policy, principal, semantic
capability, object selector, expected revision or revision range, issue/expiry
time and policy digest. Human-friendly presets such as Owner, Contributor,
Reviewer and Delivery Manager compile to these grants but have no independent
protocol authority. Designer and Builder lenses resolve the same effective
grant set through the semantic dispatcher.

Project policy declares which gates require a human principal, which require a
principal different from the author, and which a personal Owner may approve.
Agents can carry proposal identity and consume narrowly issued execution
authority, but cannot mint grants, change the separation policy or attest as a
human. The unattended competition Host issues a bounded authorization for one
exact frozen Contract/Plan, capability and budget closure and target binding.
Multi-principal records keep the kernel collaboration-ready but do not represent
remote identity, presence or cloud collaboration as implemented.

### Published libraries and code targets

Cross-project reuse is release-based and evolves `cutout.global-library.v1`.
`LibraryRelease` is the product role of an approved immutable
`GlobalLibraryItem` plus its exact dependency closure, not a new parallel
protocol. It can contain typed reusable materials, tokens, components, patterns,
identity locks, templates, policy/evaluation fragments and recipes. Existing
`ProjectLibraryReference` records one or more locks by item id, schema version,
release version and content hash. Resolved bytes live in the existing CAS so an
active Project never depends on another Project's availability.

Publishing a release and consuming it are separate approved effects. A newer
release emits `UpdateAvailable`; resolution computes schema/capability
compatibility, precedence conflicts, semantic/visual diff and dependency
ImpactSet without changing the Project. Acceptance creates a normal ChangeSet.
Detaching or forking materializes project-owned revisions with origin lineage.
The current `auto-compatible` vocabulary must not grant mutation authority in
the Design OS projection; compatible updates still require the ChangeSet path.
Multiple locked references are resolved as one deterministic dependency closure.
Explicit project overrides outrank declared library defaults, while incompatible
required tokens, component identities, policy fragments or recipes produce a
typed conflict with owning sources and affected nodes. Catalog insertion or
attachment order is never precedence.

Code is not a second mutable representation hidden behind a visual editor.
Design IR/OutcomeGraph remain authoritative for Cutout design state; a connected
repository remains authoritative for code outside Cutout. Repository snapshots
enter as versioned evidence. A code Outcome/Delivery compiles accepted design
revisions into exact generated files and an exact branch/commit/PR projection,
then stores target receipts. Later repository changes re-enter through explicit
ingestion and impact review; do not advertise live or lossless bidirectional
sync.

Project portability uses a content-addressed Project Bundle, not a second state
format. Its manifest binds required schema versions, one exact Project revision,
CAS objects, locked Library/Profile closure and receipts. Import verifies hashes,
runs supported migrations and previews an ordinary ChangeSet before mutation;
missing or unsupported closure cannot produce a partial authoritative Project.

Evidence policy travels with the evidence: source identity, license/usage,
sensitivity, permitted Provider transmission and retention class participate in
planning, authorization, delivery and Library publication. Redaction/deletion
creates an auditable tombstone/reference break. Only bytes unreachable under the
retention policy may be collected; historical derived provenance is not silently
rewritten.

## Temporal design architecture

Time is a horizontal Design OS dimension. Video generation is one Provider
effect; temporal composition and direction are product state. Keep those layers
independent:

```text
Design IR materials and locks
        ↓
Media Timeline IR -> capability compiler -> Provider shot/take operations
        ↓                                      ↓
sequence versions <- CAS artifacts + receipts + timecode QA
        ↓
delivery variants (16:9, 9:16, 1:1, captions, channel specs)
```

Do not create one universal mega-schema for every kind of time. Use a family of
typed documents sharing artifact, provenance, selection, evaluation and
delivery contracts:

- `motion-ir.v1` remains the deterministic vector/property/interaction
  representation for component and interface motion, Lottie and reduced motion;
- `media-timeline.v1` represents raster audiovisual composition and direction;
- both bind to Design IR materials and may reference each other through typed
  artifact relations without pretending they are losslessly interchangeable.

`media-timeline.v1` contains domain-neutral temporal primitives:

- `Sequence`: editorial intent, duration, frame rate, canvas/audio properties,
  locale/channel variants and final delivery selection;
- `Scene` and `Shot`: narrative/product role, time bounds, camera/blocking,
  source/reference ids and continuity group;
- `Take`: immutable generated/imported clip revision, accepted range, model
  route receipt, prompt/edit intent and quality report;
- `Track`: video, audio, voice, music, caption, overlay and marker tracks;
- `ContinuityLock`: subject/product/brand/text/style/environment/camera/audio
  constraints with evidence ids and required/optional strength;
- `EditOperation`: extend, insert, replace-range, reframe, transfer, restyle,
  relight, object/packaging replace, green-screen or audio/caption change;
- `ReviewFinding`: exact sequence/take revision, start/end timecode, evidence,
  severity, repair target and waivability.

The UI is a semantic temporal workbench, not a low-level NLE. The Board owns
frames/scenes/states/shots, candidates and compare/favorite/lock decisions. A
Timeline lens owns order, duration, accepted revisions and time-range review.
The Agent dock understands the selected temporal object and proposes bounded
edits. The active Workflow Profile supplies labels and role semantics; the
workbench itself does not assume a film, ad, launch or drama. The Inspector
exposes intent, references, locks, continuity and delivery status; advanced
receipts reveal Provider details.

Provider adapters publish an exact video capability matrix rather than a single
boolean. H3 is a strong preferred route for compatible commercial design work
because its official model description emphasizes unified multimodal context,
multi-shot, native audio and generalized editing. Seedance 2.5 is a preferred
candidate for long narrative and granular reference/edit workflows. Neither is
hard-coded as permanent authority: route fitness is evaluated per node against
verified operations, resolution/duration, accepted reference types/counts,
region, cost, latency and policy. The Qianwen competition profile remains bound
to its separate allowed model list, initially Wan 2.7 for video.

Avoid rendering an entire temporal outcome through one opaque model request.
Compile a stable composition into independently reviewable regions/revisions
where the route permits it, preserve accepted artifacts, and use continuity and
reference evidence for adjacent work. Full-composition generation remains one
possible capability, not the canonical state representation.

### Orthogonal Design OS dimensions

Generality comes from composing orthogonal dimensions rather than growing a
single domain union:

```text
Evidence and intent
  + spatial composition
  + temporal composition
  + interaction/state
  + style/design system
  + channel/market policy
  + evaluation and delivery
```

A UI prototype emphasizes spatial composition and interaction. A product demo
adds temporal state progression. A campaign video emphasizes media timing and
audio. Packaging emphasizes spatial surfaces and production policy. These are
different graph configurations over shared dimensions, not separate Agent
modes, and one Outcome Graph may contain all of them.

## Architecture

Introduce a portable production kernel with three boundaries:

```text
source adapters -> domain facts + policy packs -> production graph compiler
                                                -> portable runner
provider host <- typed capability requests <----+----> evidence + CAS artifacts
target adapters <- verified deliverables <------+
```

The kernel is pure TypeScript and Node-compatible. It owns contracts, graph
compilation, lifecycle transitions, budget scheduling, validation aggregation
and output readiness. It does not own Tauri, UI state, secrets or arbitrary
filesystem/network access.

Hosts supply narrow ports:

- `FactSource`: validated reads from an input binding;
- `ArtifactStore`: immutable bytes addressed by SHA-256;
- `CapabilityExecutor`: typed Provider operations with receipts;
- `PolicyResolver`: reviewed offline market/channel packs;
- `TargetWriter`: preview/commit of an exact output manifest;
- `RunEventSink` and monotonic clock/deadline.

The desktop host binds these ports to `.cutout`, native Provider execution and
the existing explicit-approval broker. The competition host binds them to two
validated sandbox directories, environment-provided DashScope endpoints/key,
JSONL/checkpoint files and an allowlisted HTTP client. No competition-specific
exception enters the desktop authorization path.

### Scale model

Large binary media remains in CAS and is decoded only for active validation or
visible preview. Graph composition, dependency impact, ChangeSet diff and queue
projection operate over indexed affected closures rather than full-Project model
context. Desktop Board, Timeline, history and queue projections virtualize beyond
the visible window while preserving stable selection and controls.

Synthetic graph/artifact fixtures and checked reference-hardware baselines cover
load, replay, command preview, impact, scheduling and projection memory. These
detect regressions without treating one CI timing as a universal SLA; each Host
still owns its explicit admitted budgets.

### Cross-host semantic parity

The competition deliverable is a thin assembly and deployment projection, not
a fork. Both hosts import one canonical package for graph schemas, recipe
resolution, plan compilation, reducers, evaluation and artifact/provenance
semantics. Host adapters may bind different `FactSource`, `ArtifactStore`,
`CapabilityExecutor`, `TargetWriter`, authorization policy and availability
catalogs, but cannot reinterpret a shared record or add private lifecycle
states.

Parity is semantic rather than byte-identical: an approved Desktop plan may
contain an approval binding and H3 route while the benchmark plan contains its
pre-authorized policy and Wan route. After erasing these explicitly declared
host bindings, a canonical fixture must retain the same evidence, outcomes,
dependencies, constraints, repair boundaries and evaluation gates. A host
capability gap must produce an unsupported/blocked diagnostic, never silently
delete or rewrite an outcome.

The package build records source contract versions and content hashes. CI
regenerates projections, rejects dirty/stale output and runs the same golden
fixture against both hosts. Shared behavior changes land once with cross-host
tests; host-local copies of schemas, recipe prompts, reducers or evaluators are
forbidden.

Competition findings flow back through an explicit promotion gate:

1. capture the failure or score delta as reproducible fixture/run evidence;
2. classify ownership as canonical Kernel, reusable Profile/recipe or benchmark
   Host binding;
3. require cross-profile regression evidence for Kernel promotion and profile
   isolation evidence for domain behavior;
4. land the change in its single source of truth and regenerate the package;
5. rerun cross-host semantic conformance and benchmark evaluation.

This makes rollout deliberately asymmetric but architecture bidirectional: the
competition Host ships first and stresses the system, while validated general
improvements strengthen Desktop through the shared kernel. Fixed evaluator
filenames, sample shapes, score gaming and sandbox pre-authorization never gain
authority over the canonical product model.

## Contract model

Create `material-production.v1` as a generalized DAG rather than enlarging the
prototype-specific task union indefinitely. Each node declares:

- stable id, kind (`structured-text`, `image`, `video`, `document`, `validate`,
  `package`), dependency ids and required/optional status;
- semantic role, locale, market, channel and content specification;
- fact/source ids and policy-pack versions;
- exact capability requirements and allowed route set;
- deadline, attempt, concurrency, byte and cost/request budgets;
- output schema, media constraints and quality gates.

State records candidates and final artifacts separately and preserves attempts,
receipts, validation findings, lineage and terminal reason. Existing
`asset-production.v1` compiles through a compatibility adapter and remains the
persisted prototype projection until an explicit migration is designed. This
keeps old projects readable and prevents a cross-domain schema rewrite under the
competition deadline.

Design IR stays authoritative for product/design entities and selected material
references. Commerce facts and production graphs are companion source/evidence
documents whose verified artifacts project into Design IR; product catalogs do
not become fake components, tokens or prototype nodes.

## Commerce source and truth graph

The Qianwen adapter reads the prompt only to extract one input and one output
directory using a closed grammar plus existence checks. It inventories regular
files below input, rejects symlinks/traversal and applies per-file and aggregate
byte limits before parsing JSON.

Normalize source records into `product-facts.v1`. Every fact has an id, typed
value, unit/locale when applicable, source file plus JSON pointer, and confidence
class (`explicit`, `derived`, `unknown`). HTML is parsed structurally to extract
referenced media and visible text; it is never interpolated into prompts as
trusted instruction text.

Normalize `clothing_categories.json` and `clothing_attributes.json` into local
maps/indexes once per run. The planning model may propose a category and
attributes, but a deterministic resolver accepts only an exact catalog leaf and
allowed enum values. A repair pass can choose among catalog-backed candidates;
it cannot invent a new value.

## Policy packs

Use versioned data plus deterministic functions:

- channel output names, formats, dimensions, limits and main/detail/video rules;
- locale language, spelling, units, size conversion and title/copy constraints;
- forbidden/sensitive claims, imagery and overlay patterns;
- creative roles for main and five detail images;
- source citations for reviewed rules.

Packs compile into both prompts and validators to avoid a prompt-only policy.
Rules that cannot be deterministically verified become explicit model-review
rubrics with evidence, never silent assumptions.

## Orchestration and model routing

Use a graph compiler to produce a bounded plan before Provider execution:

1. parse/normalize and select catalog-backed category/attributes;
2. establish one fact-locked creative brief and output role matrix;
3. generate localized structured copy candidates;
4. generate/edit main and detail images with shared product references;
5. create a short product video from a selected verified image/reference URL;
6. validate deterministically, then run focused vision/OCR/text review;
7. perform only bounded targeted repair nodes;
8. write an atomic verified manifest and strategy document.

Route selection consumes the competition allowlist captured from a local
configuration file. Initial recommended roles are: a structured Qwen text model
for planning/copy, Qwen VL/OCR for review, `qwen-image-3.0-pro` or
`wan2.7-image(-pro)` only where exact implemented transport supports it, and
`wan2.7-i2v-2026-04-25` for video. Recommendations never grant capability.

The runner uses a single resource scheduler across modalities. It reserves a
hard finalization buffer, applies adaptive concurrency and `Retry-After` aware
backoff, and checkpoints every settled node. Idempotency keys derive from plan
hash, node id, attempt and exact route. A transient failure can retry within its
budget; integrity, policy and malformed-output failures do not. Semantic repair
targets only failed nodes and retains valid sibling artifacts.

## Quality and delivery

Deterministic validators own objective evaluator constraints: exact filenames
and counts, document sections, catalog membership, MIME and magic bytes,
dimensions, file sizes, hashes, image decode, video container/playback and
output-manifest closure. Use bundled pure-JS or a small vendored executable only
after proving Debian x86_64 compatibility and ZIP budget; do not assume ffmpeg
is installed.

Model reviewers compare generated copy and OCR/visual summaries against the
fact graph and policy rubrics. Each finding has gate, severity, evidence ids,
waivability and suggested repair. The competition profile has no human waiver:
all required blocking gates must pass. Desktop may preserve its existing exact
revision-bound human review/waiver semantics.

The target adapter stages files inside the validated output root, verifies the
complete manifest from bytes, then renames files into place. It never accepts an
arbitrary destination per node. `strategy_document` is generated last from the
actual fact coverage, policies, DAG, model receipts, validation results and
fallback/repair history.

## Packaging and synchronization

Bundle a tree-shaken Node 22 entry with vendored runtime dependencies and no
install step. Add a package validator/container test for root filenames,
semver/version behavior, dependency closure, ZIP size, environment use, path
confinement, network allowlist, time/memory bounds and exact deliverables.

Only implemented and proven general capabilities graduate into
`cutout.agent-capabilities.json`, protocol/CLI/MCP/docs and generated plugin
runtime. The initial competition entry can remain a separate host package; do
not change `headlessAvailable`, `turnExecution` or the current video limitation
until their stated public surface is actually available.

## Rollout and rollback

Implementation is owned by six linked Trellis children. The critical path is
Kernel -> Commerce Profile plus Temporal/Multimodal Gate A -> Competition Host.
Project Change Management is based on the same Kernel but does not block the
competition. Temporal Gate B and the general Desktop Workbench follow once their
shared records are stable.

- Land the Kernel behind internal adapters with golden prototype regressions.
- Land commerce facts/policies and minimum text/image/Wan Host routes in parallel
  against frozen interfaces, with mocked execution before real calls.
- Package and repeatedly score the Competition Host while retaining cross-host
  semantic conformance; promote only classified, proven findings.
- Land commands, ChangeSets, review, authority, history, Project Bundle and
  Library/repository evolution without claiming a remote collaboration service.
- Complete Media Timeline and general Workbench projections incrementally; keep
  the current prototype workspace until parity and mixed-Outcome journeys pass.
- Every stage is additive and independently removable. A failed route remains
  capability-required and cannot create a false artifact or public claim.
