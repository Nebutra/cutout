# Layered game map production

## Goal

Turn a natural-language playable map request into retained visual assets,
structured runtime geometry and a deterministic preview/bundle instead of a
single flattened concept image.

## Background

- Cutout currently has only a shallow `game-asset.layered-map.v1` layer list; it
  cannot express placements, collision, zones, exits, camera or mode-specific QA.
- Agent Sprite Forge distinguishes `tile`, `scene`, `side-scroll`, `grid`,
  `room-chunk` and `baked-scene` modes, but its map processors do not provide
  Cutout-grade authority, provenance or real-host acceptance.
- Existing Game generation/cutout and managed bundle primitives can be reused for
  map plates, terrain packs and transparent props after domain contracts exist.

## Requirements

### R1. Mode-specific planning

- Infer one map mode and its visual, object, geometry, camera and delivery model
  from the requested game outcome. Users need not choose implementation flags.
- `baked-scene` is admitted only when runtime editing/collision is not requested.
- A playable request cannot be satisfied by a flattened image alone.

### R2. Runtime authority

- Keep base/terrain, dressed reference, reusable object library, placements,
  collision, zones, exits/spawns, camera and preview as distinct artifacts.
- Dressed/stage references guide planning only. Runtime preview must compose from
  accepted base/tiles, accepted object bytes and the exact runtime manifest.
- Collision and zones are structured, reviewable authored data. Image pixels or
  transparent bounds cannot silently become gameplay truth.

### R3. Deterministic processing

- Add bounded prop-pack and terrain/tile extraction with decoded cell evidence,
  alpha/edge QA, hashes and explicit classification rules.
- Add deterministic preview composition, debug geometry overlays and referential/
  bounds validation.
- Validate reachability only for representations with explicit deterministic
  navigation/grid data; otherwise report it as unavailable or attributed review.

### R4. Independent repair and staleness

- A failed prop, terrain group, placement or geometry artifact is independently
  repairable. Unrelated accepted siblings retain their identities.
- Changing an accepted visual/object revision marks dependent placements/previews
  stale through graph edges without invalidating unrelated layers.

### R5. Workbench and delivery

- Show runtime layers, planning references, object library, placement/geometry
  blockers, debug overlay, composed preview and neutral bundle in one graph-backed
  workbench projection.
- Deliver fixed relative assets and manifests through managed export with content
  identities and provenance.

### R6. Real-only evidence

- All six modes require contract coverage. `scene` and `tile` require retained
  real visual production plus semantic acceptance before the map family can claim
  real-host or accepted-delivery maturity.
- Fixtures may prove schema/geometry rejection but never production readiness.

## Acceptance Criteria

- [x] Natural-language examples route deterministically to each of the six modes
      and emit mode-complete typed plans.
- [x] A flattened/dressed image cannot satisfy a playable map outcome or become an
      authoritative collision/zone artifact.
- [x] Prop/terrain extraction and preview composition reproduce identical bytes
      and measurements for identical retained inputs.
- [x] Invalid references, bounds, geometry, spawn/exit and stale revisions block
      preview/delivery with dependency paths.
- [x] Repairing one object/layer preserves unrelated accepted artifact identities.
- [x] One retained real `scene` map and one retained real `tile` map reverify every
      visual receipt/byte, obtain semantic acceptance, compose from runtime inputs
      and export accepted neutral bundles.
- [x] The current shallow layered-map schema remains readable and is not silently
      reinterpreted as the new runtime manifest.

## Out Of Scope

- Gameplay AI, navmesh authoring without explicit source data, arbitrary engine
  project mutation and treating concept art as structured level data.
