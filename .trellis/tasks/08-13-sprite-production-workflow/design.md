# Game asset production profile - technical design

## Architecture

Implement this as a profile over the Design OS Kernel, analogous to the commerce
profile, with a small adapter into the existing asset-production runtime where
single-image generation/cutout behavior is reusable. Do not widen
`asset-production-plan.v1` in place: persisted prototype snapshots depend on its
one-task/one-subject semantics.

Install it through `design-profile.manifest.v1`. The manifest references the
game-domain schema/compiler/evaluator, Board/inspector/action and neutral-delivery
registrations; executable implementations remain trusted app/Host registrations,
not manifest payloads. Profile admission must pass the Scene Extension Law audit.

The profile owns game-domain schemas, graph compilation, deterministic raster
processing, QA policy, preview composition, and managed bundle export. The Kernel
continues to own frozen plans, capability admission, attempts, budgets, artifact
publication, impact propagation, repair, receipts, and replay.

The official desktop rehearsal runner crosses a narrower native boundary. The
renderer may prepare a request, but native code owns the canonical preview,
single-use consumption, direct BYOK Provider invocation and signed authorization
receipt. It returns the exact native multimodal receipts and bytes; it does not
accept a renderer-authored `approved` flag or opaque approval string.

## Replacement Boundary

Agent Sprite Forge is treated as an outcome corpus, not as an architecture to
embed. Its three Skills decompose into four independent Design OS planes:

1. **Sprite family production**: identity/master, action and direction groups,
   detached FX, frame processing, scale/anchor profile, animation clips and atlas.
2. **Map production**: map-mode planning, visual layers, reusable objects,
   placements, collision/zones/exits, composed preview and map bundle.
3. **Adapter delivery**: runtime-neutral bundle to managed Godot/Unity-shaped
   output with reference validation and no mutation of accepted source artifacts.
4. **Temporal ingestion**: authorized video bytes to deterministic decoded and
   sampled frames, then the same sprite-family QA and delivery path.

Project-specific gameplay, engine scripts, deployment and playable-prototype
assembly remain owned by the Coding Profile. The Game Asset Profile produces a
typed integration brief and accepted artifacts for that Profile. This matches the
actual upstream implementation: reusable asset Skills and processors are separate
from the project-specific coding used by its showcases.

Complete replacement is a conjunction, never a marketing boolean:

```text
replacementComplete = every required upstream outcome has
  intent route
  + executable producer
  + retained source/result evidence
  + QA authority
  + repair/revision semantics
  + preview consumer
  + accepted delivery receipt
```

Each coverage entry advances monotonically through `unsupported -> contract ->
real-host -> accepted-delivery`. Fixture or schema tests may advance only to
`contract`. A real generation without semantic acceptance may advance to
`real-host`, but cannot satisfy replacement completion.

## Profile Decomposition

The current single-action `game-asset.plan.v1` remains the atomic real-Host unit.
Do not widen it into a polymorphic mega-plan. Add aggregate contracts above it:

- `game-asset.family-plan.v1` owns identity, requested action/direction groups,
  body/FX relationships, master action selection and desired bundle layouts.
- `game-asset.action-clip.v1` binds one accepted atomic plan, its ordered frames,
  observed timing, anchor policy and scale-profile revision.
- `game-asset.scale-profile.v1` is derived from one accepted grounded master clip
  and freezes delivery canvas, standing-equivalent scale, anchor, trim/component
  policy and compatibility class.
- `game-asset.family-bundle.v1` binds accepted clips, detached FX and one or more
  deterministic atlases. It never embeds an unaccepted atomic rehearsal.
- `game-map.production-plan.v1` selects one map mode and declares required visual,
  object, geometry, camera and delivery nodes.
- `game-map.runtime-manifest.v1` replaces the current shallow layer list as the
  authoritative placement/collision/zone representation while retaining the
  existing schema for compatibility.
- `game-engine.adapter-plan.v1` binds one neutral bundle hash, adapter/version,
  managed target shape and validation policy.
- `game-temporal-ingest.v1` binds an authorized video artifact, deterministic
  decoder/sampler identity and derived-frame identities.
- `game-asset.coverage-ledger.v1` records per-outcome evidence state and the exact
  receipts/artifacts that justify it.

These are Profile-owned domain contracts. Kernel contracts stay unchanged.

## Intent And Workbench Projection

The user describes an outcome once. Local intent classification selects the Game
Profile and compiles a reviewable plan; it does not ask the user to pick Sprite,
Map, Godot or Unity from a scenario card.

```text
"做一个四方向武士，带攻击特效，导出 Godot"
        |
        +-> family-plan
        |     +-> idle/down,left,right,up
        |     +-> walk/down,left,right,up
        |     +-> attack body
        |     +-> detached attack FX
        |
        +-> neutral family bundle
        +-> Godot adapter plan
```

The workbench is a projection of graph state, not a static form. It shows the
current master reference, independently reviewable action/map nodes, measured
blockers, stale dependencies, preview consumers and delivery targets. Advanced
controls remain editable, but inferred sheet/grid/processor flags are not required
up front. Changing a field recompiles a plan revision; it never mutates accepted
evidence in place.

## Delivery Layers

Delivery is deliberately split into three layers:

1. **Neutral runtime bundle**: transparent frames/atlases, animation/map manifests,
   placements, collision/zones, hashes and provenance. This is the authoritative
   portable result.
2. **Managed engine package**: deterministic Godot/Unity-shaped files generated
   solely from a neutral bundle. Adapter failure creates a failed delivery receipt
   and cannot stale or modify the accepted neutral bundle.
3. **Project integration**: a Coding Profile changes an existing project under its
   own preview, approval, filesystem and test authority. The engine adapter never
   inherits arbitrary-path access merely because the user requested Godot/Unity.

The first Godot adapter should target data-only animation resources and a minimal
preview scene under a managed export. The first Unity adapter should target atlas
metadata plus import/animation descriptors under a managed export. Neither claims
to generate gameplay controllers, combat systems or complete scenes.

## Workstream Order

The remaining replacement work is split by independently verifiable authority:

1. Sprite-family orchestration and multi-animation bundle over the proven atomic
   Qwen/cutout/repair/atlas path.
2. Scene-mode and tile-mode maps with real retained visual assets, structured
   geometry and deterministic preview composition.
3. Remaining map modes as contracts first, then representative real deliveries.
4. Godot and Unity managed adapters over accepted neutral bundles.
5. Temporal ingestion only after an authorized video Host exists.
6. Coverage-ledger promotion after every required path has accepted delivery;
   never promote from documentation, fixtures or an upstream feature checklist.

The Trellis task dependency graph is:

```text
08-13 atomic Game foundation
  +-> 08-14 multi-action sprite family ----+
  |                                         +-> managed engine adapters
  +-> 08-14 layered map production --------+
  |
  +-> temporal multimodal Host -> temporal Game ingestion -> sprite family

all owning verifier outputs -> Agent Sprite Forge coverage ledger
```

The coverage ledger may be implemented early as an honest diagnostic, but its
replacement result cannot complete before every owning child closes. Engine
adapters never block neutral Sprite/Map delivery; Temporal ingestion never blocks
non-video Game production.

Real Qwen image roles receive a 600-second native execution budget each and an
aggregate budget covering the admitted role closure. HTTPS downloads remain
closed to the exact DashScope regional-result and `dashscope-*` accelerated OSS
bucket shapes under `aliyuncs.com`; partial attempts retain completed outputs and
stage-specific diagnostics without retaining signed URLs. The synchronous Image
3 POST has a single 540-second transport attempt. Without a Provider idempotency
key, write timeout/status failure is never retried automatically; only safe
GET/HEAD reads and output downloads retain bounded retry.

```text
Brief + references + target policy
        |
        v
game-asset profile compiler -> frozen OutcomeGraph / ExecutionPlan
        |                              |
        |                              +-> image Provider candidate waves
        |                              +-> deterministic raster processors
        |                              +-> map composition / validation
        v
candidate locks -> ArtifactGraph -> measured/model/user evidence
        |                              |
        +-> targeted repair -----------+
        v
runtime-neutral bundle preview -> explicit managed export approval
```

The real evidence path is:

```text
typed Game plan + retained references + role prompts
        |
        v
native canonical preview digest
        |
        v
consume observed preview -> exact DashScope image edits
        |                                  |
        |                                  +-> native signed receipt + returned bytes
        v
signed Game authorization closure over request + output identities
        |
        v
deterministic pixel inspection -> semantic review preview
        |                              |
        |                              +-> exact roles + artifacts + decisions
        v
native confirmation -> single-use semantic acceptance receipt
        |
        v
strict retained bundle verification (blocked until both evidence planes close)
```

Targeted repair re-enters the same native boundary without regenerating accepted
siblings:

```text
parent authorization + complete retained outputs + replacement role prompts
        |
        v
native parent reverification -> strict-subset repair preview
        |
        v
Qwen only for replacement roles -> merge exact preserved outputs
        |
        v
signed v3 authorization(parent + replacement + preserved origin lineage)
        |
        v
complete retained-bundle reverification
```

## Contracts

Introduce versioned schemas under a dedicated `src/game-asset-profile/` boundary:

- `game-asset.brief.v1`: user intent, style/reference bindings, asset scope,
  desired view, target canvas/runtime constraints, and requested deliverables.
- `game-asset.sprite-family.v1`: stable identity, action nodes, body/FX links,
  frame/timing expectations, anchor policy, scale-profile reference, and delivery
  layout recipes.
- `game-asset.layered-map.v1`: runtime base/layers, reusable objects, placements,
  sort/occlusion policy, collision, zones, scene hooks, and preview recipe.
- `game-asset.raster-evidence.v1`: per-frame boxes/coverage/edge state, action
  anchor/scale measurements, residual background diagnostics, and provenance.
- `game-asset.bundle.v1`: fixed relative logical names, generation/preview/run
  provenance, ordered animation cells, observed anchors, frozen timing policy,
  exact artifact/atlas/manifest hashes and optional semantic acceptance. Missing
  acceptance produces `candidate`; it cannot be represented as accepted delivery.
- `cutout.game-asset-generation-preview.v2`: native-owned digest of the exact
  bounded BYOK request closure with `executionMode: 'byok-direct'`; it is
  observation information, not authority or a payment gate.
- `cutout.game-asset-generation-authorization.v2`: native-signed, single-use
  execution evidence binding the preview digest, execution identity/start time,
  exact role requests and every returned multimodal receipt/artifact identity.
- `cutout.game-asset-generation-repair-preview.v2` and authorization v4 bind the
  complete parent/evidence/preserved/replacement closure. Historical repair
  preview v1 and authorization v3 remain replay-only.
- `cutout.game-asset-semantic-acceptance-preview.v1`: content-addressed review
  closure over the verified generation receipt, exact outputs and per-role
  semantic decisions; it carries no approval authority.
- `cutout.game-asset-semantic-acceptance.v1`: native-signed acceptance issued
  only after consuming the displayed preview and receiving system confirmation;
  it binds the same generation receipt, output identities and decisions and must
  not predate generation completion.

Schemas reference Kernel artifact identities and revisions; they do not embed
provider payloads, raw credentials, absolute paths, or caller-invented approval.
Domain manifests use normalized coordinates or explicit canvas-space units and a
declared origin/anchor convention.

## Outcome Graph Shape

Each independently reviewable or repairable unit is a node. A representative
character graph contains:

```text
identity/reference
  -> idle candidate -> accepted scale profile
  -> run body -----------------------------+
  -> attack body --------------------------+-> engine-neutral atlas -> family bundle
  -> attack FX ----------------------------+
```

The scale profile is an actual artifact dependency, not a prompt convention.
Changing its revision propagates staleness through grounded body actions and the
atlas. Airborne actions and detached FX declare different anchor policies and do
not inherit grounded-body gates accidentally.

A representative map graph contains:

```text
terrain base -> dressed/stage reference -> object-library candidates
       |                                     |
       +-> structured placements/collision/zones
                                             |
       +-------------------------------------+-> composed runtime preview -> map bundle
```

The dressed/stage reference is evidence/planning input only. Runtime preview
composition consumes the original accepted base and accepted object artifacts.

## Generation And Candidate Review

The planner chooses generation groups based on semantic cohesion, not desired
final atlas shape. One action family or canonical directional locomotion sheet may
be generated together; unrelated actions are separate. Body actions and detached
FX are separate nodes unless an explicit target layout proves shared cells are
safe.

Use the existing candidate exploration contracts for deliberate visual directions,
selection locks, and "more like this" lineage. A locked identity/master action is
passed as an exact artifact reference into dependent generation. Candidate images
remain distinct from deterministic processed outputs and from final bundle
acceptance.

## Deterministic Raster Processing

Build on Cutout's existing flood/background, alpha-cut, component, coverage, and
raster-output QA primitives. Add game-domain operations behind typed commands:

- split a declared grid into ordered source cells;
- clean and select components under a declared body/FX/object policy;
- estimate and normalize center/bottom/feet/contact anchors;
- apply a locked shared scale profile across compatible actions;
- assemble ordered strips, grids, preview animations, and neutral atlases;
- slice compact prop packs and opaque terrain atlases;
- compose layered-map previews from base, object, and placement artifacts.

Every operation must be deterministic for fixed bytes and parameters. Generated
creative content is never synthesized with procedural placeholders. Processors
emit exact artifact hashes plus measurements; review policy decides whether those
measurements block publication.

The current native single-frame processor is
`cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v5`.
It retains the exact Provider source bytes and native receipt, measures a uniform
high-chroma board from decoded border pixels, requires the complete perimeter to
remain board-colored, and derives a bounded BT.601 threshold from the observed
border range. A threshold approaching neutral chroma fails closed rather than
erasing edge-touching content. The processor derives its trimap and uses a Rust
adaptation of PyMatting's MIT-licensed Fast Multi-Level Foreground Estimation to
reconstruct colors contaminated by that board. It then extracts measured alpha
bounds, crops the retained subject, uses proportional Lanczos3 scaling to contain
the plan's alpha envelope, and places the result at the declared anchor on the
fixed delivery canvas. Already-transparent sources preserve alpha.

Signed v5 processing evidence binds measured board color, the derived squared
chroma threshold in the closed `64..=4096` range, route, source dimensions/bounds, frame size, alpha envelope,
expected anchor, anchor and scale policy, resized subject size, placement, output
bounds, source/output identities and byte length. Verification repeats the
complete transform from retained source bytes and requires byte-for-byte PNG
equality before trusting pixel measurements. Historical v4 fixed-chroma, v3
adaptive-key, v2 white-border normalization and v1 matte-only paths remain
separately dispatchable only for exact retained-evidence replay. Their
implementation identities cannot authorize v5 bytes. Grid splitting remains a
later typed processor. Atlas composition is a native deterministic processor:
it first re-verifies every processed frame, copies plan-ordered RGBA pixels into
bounded cells, emits a canonical `game-asset.bundle.v1` manifest, and
content-addresses both PNG and manifest bytes.

Pixel geometry is computed locally from decoded returned bytes. Alpha bounds are
the smallest non-transparent rectangle above the frozen alpha threshold; edge
contact is derived from that rectangle; anchors are derived from the declared
anchor policy and the measured rectangle. A vision model cannot supply or amend
these fields. `expectedAlphaSize` is a containing envelope: normalized output
must stay within it and fill one axis within one pixel, preserving aspect ratio.
Anchor matching permits at most half a pixel for odd-size raster centering.
Model/human evidence is reserved for semantic continuity and action readability
and remains independently attributable.

Requested canvas, grid and timing parameters remain part of the frozen plan.
Processors decode the settled artifact and record observed dimensions, alpha,
cell/frame bounds and effective preview timing in raster evidence. Slicing,
evaluation and delivery consume those observations. A mismatch is a typed
finding, never repaired by copying request values into the receipt.

## Evaluation Policy

Integrity blockers include malformed grid dimensions, missing/empty required
frames, unresolved artifact references, frame-order disagreement, out-of-bounds
placements, invalid collision/zone geometry, dependency revision mismatch, and
preview composition against artifacts other than the manifest's accepted inputs.

Quality blockers include edge touch, paste clamping, excessive anchor drift,
excessive scale drift, residual background contamination, broken loop timing, and
unreadable object/actor overlap according to the selected profile. Thresholds live
in a versioned policy pack; the evidence retains raw measurements so policy can be
re-evaluated without rerunning a paid generation.

Identity/style continuity that cannot be measured reliably is recorded as
model-review or human evidence, never mislabeled as a deterministic check.

## Native Execution And Retention

The Game runner uses a two-step native API. `preview` strictly decodes the plan,
role closure, prompts, reference bytes and output limits, recomputes all hashes,
stores the bounded request in native memory and returns a content-addressed plan
id. `apply(planId)` atomically consumes that stored preview and executes only the
stored request under the configured BYOK Provider policy. Cancelled, expired, unknown
and replayed previews fail before Provider traffic.

After execution, native code retains each original Provider image, runs the
versioned deterministic Cutout processor and signs an authorization receipt over
the plan id, request digest, execution id/mode/start time, run/Provider/model identity, canonical
role request digests, returned multimodal receipt/source identities, processed
PNG identities and processing evidence. Partial runs return retained source and
processed outputs for repair but cannot mint a successful closure. The TypeScript
runner builds a rehearsal bundle only from those returned native bytes and
receipts; it cannot backfill or re-sign a prior generic API run.

The retained-evidence verifier authenticates the Game authorization receipt and
every multimodal receipt against original Provider bytes, reproduces the exact
processed PNG from those source bytes, reconstructs output metadata, and then
recomputes deterministic pixel evidence. Semantic acceptance remains separate.
Until a complete real bundle exists, no Game maturity adapter is registered and
no promotion proof is emitted.

The System inspector exposes a real Game assets workbench. It builds one bounded
action plan from an uploaded retained reference and explicit sprite controls,
selects only an enabled DashScope Provider whose configured model is supported by
the native runner, displays the observable native run preview, and shows only
returned processed frames and recomputed findings. Each exact role must be
checked before the native semantic review preview can be created. Verified
bundles persist in a dedicated IndexedDB repository; list/load re-runs the full
native and deterministic verifier rather than trusting persisted status labels.

The Profile publishes a versioned Game Asset Outcome scorecard over retained
artifact evidence. It measures domain result quality such as identity continuity,
frame integrity, motion readability, anchor/scale stability, map coherence and
bundle usability. The Profile-neutral Design OS evidence benchmark separately
reports contract, conformance, real-Host and rehearsal maturity. The Workbench may
show both but cannot average one into the other's authority or readiness.

## Storage, Preview, And Export

Raw candidates, processed frames, metadata, previews, and bundles enter the
content-addressed object store. Design IR stores the authoritative graph,
accepted revisions, locks, and bundle references. Derived exports stay generated.

The first exporter writes only under a managed `.cutout/exports/game-assets/<id>`
root after a preview and an exact approval lease. The neutral layout contains PNG
assets and JSON manifests; a preview page/player may consume them without becoming
the source of truth.

Engine adapters compile the neutral bundle into managed Godot/Unity-shaped output
later. They cannot scan or mutate arbitrary existing projects. Import into an
engine project remains an explicit consumer action until a separately authorized
bounded coding/export adapter is implemented.

## Compatibility And Rollback

- Keep `asset-production-plan.v1`, current MaterialKind values, prototype
  projections, and existing workspace snapshots unchanged for the first slice.
- Add profile-specific projection into the general Kernel/ArtifactGraph rather
  than teaching every existing prototype component about animation frames.
- Gate UI routes and exporter availability on exact Host capability descriptors.
- If the feature is disabled, stored game-asset records remain inspectable and
  exportable as data; existing prototype/commerce workflows are unaffected.
- A failed exporter cannot change accepted profile artifacts. Retrying export
  produces a new receipt over the same bundle hash.

## Important Trade-offs

- A focused profile duplicates a small amount of top-level orchestration but
  avoids breaking the mature one-subject prototype pipeline.
- Runtime-neutral output ships less immediate engine convenience than direct
  project writes, but it provides a stable contract that can support multiple
  engines and preserves Cutout's filesystem/approval boundary.
- Multi-row generation and separate FX cost more provider calls than one mixed
  atlas, but they make quality review and targeted repair materially more reliable.
- Model review is useful for identity continuity but cannot replace measured
  frame geometry or human promotion decisions.
