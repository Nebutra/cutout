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
