# Layered game map production - implementation plan

## Gate 1: Planning contracts

- [x] Add production-plan, object-library, runtime-manifest, preview-receipt and
      map-bundle schemas with canonical hashing and compatibility tests.
- [x] Compile representative intents for all six modes into complete graph nodes.
- [x] Reject baked-only output for playable requests.

## Gate 2: Deterministic processors

- [x] Add bounded prop-pack extraction with compact/wide/collision-bearing policy.
- [x] Add terrain/tile extraction with observed cell/dimension evidence.
- [x] Add runtime preview and debug-overlay composition from exact manifest inputs.
- [x] Validate references, bounds, geometry and explicit navigation constraints.

## Gate 3: Workbench and repair

- [x] Project reference/runtime layers, object library, placements, debug geometry,
      blockers, preview and delivery.
- [x] Add targeted object/layer/manifest repair with dependency staleness tests.
- [x] Add managed neutral map bundle preview and apply.

## Gate 4: Real rehearsals

- [x] Produce and accept one retained real `scene` map.
- [x] Produce and accept one retained real `tile` map.
- [x] Reverify every visual source/result receipt and compose final previews only
      from accepted runtime artifacts and exact manifests.

## Validation

- [x] Focused schema, processor, geometry, compositor, repair and export tests.
- [x] Parent Game/Profile/Kernel regressions, type-check, lint and builds.
- [x] Real map claims cite retained evidence; fixture maps remain contract-only.
