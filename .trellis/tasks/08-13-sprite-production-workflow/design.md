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

Real Qwen image roles receive a 600-second native execution budget each and an
aggregate budget covering the admitted role closure. HTTPS downloads remain
closed to the exact DashScope regional-result and `dashscope-*` accelerated OSS
bucket shapes under `aliyuncs.com`; partial attempts retain completed outputs and
stage-specific diagnostics without retaining signed URLs.

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
- `game-asset.bundle.v1`: accepted artifact references, animation/map manifests,
  hashes, compatibility metadata, preview reference, and export receipt binding.
- `cutout.game-asset-generation-preview.v2`: native-owned digest of the exact
  bounded BYOK request closure with `executionMode: 'byok-direct'`; it is
  observation information, not authority or a payment gate.
- `cutout.game-asset-generation-authorization.v2`: native-signed, single-use
  execution evidence binding the preview digest, execution identity/start time,
  exact role requests and every returned multimodal receipt/artifact identity.
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
`cutout-white-border-flood-matte-normalize-anchor-rust-image-0.23-v2`. It retains
the exact Provider source bytes and native receipt, floods only white/transparent
pixels connected to the canvas border, applies the frozen one-pixel white matte
rule, extracts the measured alpha bounds, and crops the retained subject. It then
uses proportional Lanczos3 scaling to contain the plan's alpha envelope and
places the result at the declared anchor on the fixed delivery canvas. It never
stretches width and height independently or changes cell dimensions between
animation frames.

Signed v2 processing evidence binds source dimensions/bounds, frame size, alpha
envelope, expected anchor, anchor and scale policy, resized subject size,
placement, output bounds, source/output identities and byte length. Verification
repeats the complete transform from retained source bytes and requires
byte-for-byte PNG equality before trusting pixel measurements. The matte-only
`cutout-white-border-flood-matte-rust-image-0.23-v1` path remains dispatchable
only for already signed retained runs so the algorithm upgrade does not destroy
their replay evidence. Non-white or non-removable backgrounds remain opaque and
fail normal edge/alpha evaluation; they are never silently relabeled as
successful cutouts. Grid splitting and atlas composition remain later typed
processors.

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
