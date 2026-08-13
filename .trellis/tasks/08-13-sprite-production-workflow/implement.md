# Game asset production profile - implementation plan

## Gate 1: Runtime-neutral sprite vertical slice

- [ ] Add the Game Asset Profile manifest/registrations and pass Profile closure,
      install/disable and protected-surface extension conformance.
- [ ] Add profile schemas, policy pack, canonical hashing, malformed-input tests,
      and a compiler from one character brief to OutcomeGraph/ExecutionPlan.
- [ ] Model identity/master action, grounded body actions, detached FX, scale
      profile, processed frames, atlas, preview, and bundle as explicit nodes.
- [ ] Add deterministic grid splitting, component selection, anchor estimation,
      scale-profile reuse, strip/grid/atlas composition, and raster evidence.
- [ ] Decode and bind observed dimensions/alpha/frame timing to receipts and QA;
      add request-versus-output mismatch fixtures that block incompatible work.
- [ ] Integrate candidate selection and revision-bound locks without changing the
      existing prototype `asset-production-plan.v1` semantics.
- [ ] Add evaluation, dependency impact, targeted repair, and preservation tests
      proving one failed action can be replaced without regenerating siblings.
- [ ] Add an independently versioned Game Asset Outcome scorecard and prove its
      quality totals cannot advance Design OS Host/rehearsal maturity.
- [ ] Add a compact workbench projection for family progress, blockers, compare,
      lock, and preview using existing material/review interaction patterns.

## Gate 2: Layered-map vertical slice

- [ ] Add base/reference/object-library/placement/collision/zone/scene-hook schemas
      and compile them into independently repairable graph nodes.
- [ ] Add compact prop-pack and terrain-atlas slicing with deterministic evidence.
- [ ] Add bounds/referential/geometry validation and reachability checks only where
      the declared map representation makes them deterministic.
- [ ] Compose a runtime preview from accepted base/object bytes plus the exact
      placement manifest; prove a dressed reference cannot satisfy delivery.
- [ ] Add a workbench map projection that distinguishes reference, runtime layers,
      debug geometry, and final preview.

## Gate 3: Managed bundle delivery

- [ ] Define and round-trip `game-asset.bundle.v1` with relative logical names,
      content hashes, provenance, policy version, and preview binding.
- [ ] Add a dry-run plan and explicit approved apply below the managed game-assets
      export root; reject absolute paths, traversal, symlinks, stale revisions,
      approval mismatch, replay, and bundle mutation.
- [ ] Add a small runtime-neutral preview consumer fixture and validate loading,
      frame order/timing, anchors, map layers, placements, and debug collision.
- [ ] Only after the surface is executable, synchronize capability manifest,
      schema, protocol/CLI/MCP surfaces, skills, and docs in the same change and
      run `pnpm agent:validate`.

## Gate 4: Optional adapters after MVP

- [ ] Add a managed Godot exporter from the accepted neutral bundle if selected as
      the first engine adapter; validate scene/resource references in a fixture.
- [ ] Evaluate a Unity-shaped managed exporter independently; do not couple it to
      Godot contracts or claim existing-project mutation.
- [ ] Add video-to-sprite only after an authorized video capability, deterministic
      frame extraction, cancellation/budget enforcement, and media QA are real.

## Validation

- [ ] Run focused profile schema, compiler, raster processor, policy, graph impact,
      repair, preview composition, and managed-export tests.
- [ ] Run existing asset-production, candidate-selection, Design OS Kernel,
      ArtifactGraph, project persistence/recovery, and Agent workbench tests.
- [ ] Run type-check, lint, dependency/security checks relevant to any new raster
      dependency, and `rtk git diff --check`.
- [ ] Run `pnpm agent:validate` for any actual Agent-surface change.
- [ ] Perform desktop visual verification at supported desktop sizes; verify long
      action/asset names do not resize stable controls or overlap evidence panels.

## Risk And Rollback Points

- Freeze profile schemas and fixture graphs before wiring UI or Provider calls.
- Keep new processing commands pure and byte-bounded so a failed algorithm can be
  replaced without migrating accepted source artifacts.
- Keep exporter work behind a separate capability gate; failure there must not
  roll back accepted sprite/map bundles.
- Do not edit generated plugin runtime manually. Regenerate synchronized runtime
  artifacts through the repository's owning build/update path when public
  contracts eventually change.
