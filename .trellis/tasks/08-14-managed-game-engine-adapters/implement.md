# Managed game engine adapters - implementation plan

## Gate 1: Shared adapter authority

- [ ] Add adapter-plan, receipt and integration-brief schemas.
- [ ] Require exact accepted neutral input and deterministic dry-run file plans.
- [ ] Add portable path/hash/reference and atomic staging validation.

## Gate 2: Godot

- [ ] Compile neutral sprite/map semantics into managed Godot resources and a
      minimal preview scene.
- [ ] Add a bounded real Godot validator and retain its version/output evidence.
- [ ] Prove frame timing, anchors, loop state and map geometry survive projection.

## Gate 3: Unity

- [ ] Compile the same neutral semantics into an independent Unity-shaped package.
- [ ] Add a bounded real Unity validator/import check and retain evidence.
- [ ] Prove no Godot-specific assumptions enter Unity contracts.

## Gate 4: Delivery and handoff

- [ ] Atomically export only validated packages below the managed root.
- [ ] Emit a typed Coding Profile integration brief without applying it.
- [ ] Add failure/rollback tests proving source acceptance remains unchanged.

## Validation

- [ ] Determinism, malformed input, path, reference and semantic-loss tests.
- [ ] Real supported Godot and Unity validation runs for production claims.
- [ ] Parent Game/delivery regressions, type-check, lint, build and Agent contract
      synchronization if an executable public surface is added.
