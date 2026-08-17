# Managed game engine adapters

## Goal

Compile an accepted runtime-neutral Game bundle into validated Godot and Unity
packages without changing accepted source artifacts or mutating arbitrary projects.

## Background

- Agent Sprite Forge documents Godot/Unity handoff and showcases project-specific
  scenes, but its repository has no general production exporter for those games.
- Cutout already has managed atomic bundle export and content-addressed Game
  atlas/manifest output. Engine adapters must remain derived delivery projections.
- Existing-project mutation and gameplay coding belong to the Coding Profile.

## Requirements

### R1. Exact neutral input

- Accept only an exact accepted neutral family/map bundle and semantic acceptance.
- Bind adapter/version, source bundle hash, target engine/version range, output
  layout and validation policy in a previewable adapter plan.
- Candidate, stale, malformed or partially accepted bundles cannot be adapted.

### R2. Godot package

- Emit managed data/animation resources and a minimal preview scene referencing
  only package-relative assets.
- Preserve frame order/timing, loop state, anchors/origins and map geometry.
- Do not claim gameplay controllers, existing-project integration or deployment.

### R3. Unity package

- Emit an independent Unity-shaped atlas/import/animation descriptor package from
  the same neutral contract.
- Preserve the same runtime semantics without sharing Godot-specific assumptions.
- Do not hand-author opaque engine cache/database files that cannot be validated.

### R4. Validation and export

- Validate schema, paths, references, hashes and semantic projection before apply.
- Production-ready adapter evidence requires loading/importing the package with an
  owning real engine/runtime validator, not only parsing generated text in Cutout.
- Export below the managed root atomically. Adapter failure cannot mutate the
  accepted neutral bundle or leave a partial final directory.

### R5. Coding Profile handoff

- Produce a typed integration brief for optional project-specific import. Any
  project mutation uses the Coding Profile's separate preview, approval, path and
  test authority.

## Acceptance Criteria

- [ ] One accepted neutral sprite family compiles deterministically into Godot and
      Unity packages whose output hashes are stable across repeat runs.
- [ ] One accepted neutral map compiles without losing placements, collision,
      zones, exits, camera or asset references supported by the target adapter.
- [ ] Both adapters reject candidate/stale input, traversal, absolute references,
      duplicate paths, unsupported semantics and source mutation.
- [ ] Godot opens/loads its package with the supported real engine validator and
      reports the expected animation/map resources.
- [ ] Unity imports/loads its package with the supported real engine validator and
      reports the expected sprites, animation metadata and map data.
- [ ] A failed adapter/validator leaves the accepted neutral bundle unchanged and
      produces no accepted delivery receipt.
- [ ] Optional existing-project integration is delegated through a typed Coding
      Profile request rather than performed by the adapter.

## Out Of Scope

- Gameplay code, arbitrary project scans/writes, editor automation beyond bounded
  validation, WebGL/game deployment and engine-specific visual redesign.
