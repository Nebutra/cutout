# Game asset production profile - implementation plan

## Gate 0: Real Host authority and retained evidence

- [x] Add a strict native Game generation preview that binds the exact plan hash,
      role closure, prompts, references, locks, Provider/model and output limits.
- [x] Add single-use native BYOK apply without per-call paid confirmation,
      stale/unknown/replay rejection, bounded execution and a signed v2
      authorization receipt over the exact request, execution identity/start
      time and returned native receipt/artifact identities.
- [x] Add a desktop Game runner that returns retained original bytes and receipts
      and never accepts caller-authored approval or readiness.
- [x] Reverify the signed authorization and native receipts from retained bytes;
      keep partial, unsigned, non-independent or semantically unaccepted runs
      blocked and do not register a Game maturity adapter.
- [x] Add deterministic pixel inspection for alpha bounds, edge contact and
      declared anchor policy from decoded real output bytes. Retain both the
      original Provider bytes and the versioned white-border Cutout PNG, and
      reproduce the latter byte-for-byte during verification. Do not route these
      facts through model-authored JSON.
- [x] Keep mocks and fixtures confined to strict decoder/rejection/replay tests.
      A real-Host or rehearsal success assertion requires an actual retained run.
- [x] Route explicit Game Asset intent from Home and the project composer into
      the real workbench without a chat-model dependency. Keep routing advisory,
      bind only one unambiguous image reference, and retain Create as fallback.
- [x] Compile one retained real Qwen reference into the exact GUI preview payload
      and pass the same JSON through native `preview_request` without GUI
      automation. This proves request closure only, not paid apply or rehearsal.
- [x] Execute the retained request through Cutout's native BYOK Host with
      `qwen-image-3.0-pro` and no GUI automation, mock, direct CLI or per-call
      confirmation. Four independent source frames, deterministic Cutout PNGs,
      native receipts and signed generation authorization were reverified and
      retained under
      `research/production-rehearsal-2026-08-14/native-qwen-run/e8ac2e3ffd6ab8a53db286e2776de09b9987a81fc58f68da672ec84b462b7468/`.
      All four decoded frames are unique 1024x1024 RGBA outputs without edge
      contact. Their measured alpha occupancy and feet anchors do not exactly
      match the frozen plan, so strict Game evaluation requires targeted repair.
      This proves real generation, not deliverable acceptance or Profile maturity.
- [x] Admit the observed DashScope accelerated OSS result origin without
      broadening beyond its exact HTTPS bucket/domain shape, retain failed
      attempts for diagnosis, and align per-role timeouts with real Qwen latency.

## Gate 1: Runtime-neutral sprite vertical slice

- [x] Add the Game Asset Profile manifest/registrations and pass Profile closure,
      install/disable and protected-surface extension conformance.
- [x] Add profile schemas, policy pack, canonical hashing, malformed-input tests,
      and a compiler from one character brief to OutcomeGraph/ExecutionPlan.
- [ ] Model identity/master action, grounded body actions, detached FX, scale
      profile, processed frames, atlas, preview, and bundle as explicit nodes.
- [ ] Add deterministic grid splitting, component selection, anchor estimation,
      scale-profile reuse, strip/grid/atlas composition, and raster evidence.
- [ ] Decode and bind observed dimensions/alpha/frame timing to receipts and QA;
      add request-versus-output mismatch byte cases that block incompatible work.
- [ ] Integrate candidate selection and revision-bound locks without changing the
      existing prototype `asset-production-plan.v1` semantics.
- [x] Add evaluation, dependency impact, targeted repair, and preservation tests
      proving one failed action can be replaced without regenerating siblings.
- [x] Add an independently versioned Game Asset Outcome scorecard and prove its
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
- [ ] Add a small runtime-neutral preview consumer contract case and validate loading,
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
- [x] Run type-check, lint, dependency/security checks relevant to any new raster
      dependency, and `rtk git diff --check`.
- [x] Run `pnpm agent:validate` for any actual Agent-surface change.
- [ ] Perform desktop visual verification at supported desktop sizes; verify long
      action/asset names do not resize stable controls or overlap evidence panels.

## Risk And Rollback Points

- Freeze profile schemas and contract graphs before wiring UI or Provider calls.
- Never promote a mocked or synthetic run into Profile maturity. The retained
  real run is an external evidence artifact, not a generated test snapshot.
- Keep new processing commands pure and byte-bounded so a failed algorithm can be
  replaced without migrating accepted source artifacts.
- Keep exporter work behind a separate capability gate; failure there must not
  roll back accepted sprite/map bundles.
- Do not edit generated plugin runtime manually. Regenerate synchronized runtime
  artifacts through the repository's owning build/update path when public
  contracts eventually change.
