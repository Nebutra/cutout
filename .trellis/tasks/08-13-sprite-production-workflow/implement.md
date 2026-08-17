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
      original Provider bytes and the versioned processed Cutout PNG, and
      reproduce the latter byte-for-byte during verification. Do not route these
      facts through model-authored JSON.
- [x] Keep mocks and fixtures confined to strict decoder/rejection/replay tests.
      A real-Host or rehearsal success assertion requires an actual retained run.
- [x] Route explicit Game Asset intent from Home and the project composer into
      the real workbench without a chat-model dependency. Keep routing advisory,
      bind only one unambiguous image reference, and keep scenario selection out
      of the Create drawer.
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
- [x] Upgrade new runs to the deterministic v2 matte/trim/contain/anchor
      processor while preserving byte-for-byte v1 replay for the signed real
      run. Reprocess its four retained Qwen source PNGs offline with zero Provider
      calls: all four keep a 1024x1024 delivery canvas, normalize proportionally
      to 800px alpha height, place feet at y=912 with at most 0.5px horizontal
      quantization, and avoid every canvas edge. Retain the four v2 PNGs plus
      source/output geometry and hashes under the run's `normalized-v2/`
      directory. This is real-source algorithm evidence; it does not mint a new
      Host authorization, semantic acceptance, rehearsal completion or maturity.
- [x] Review primary SOTA implementations and deployment licenses instead of
      extending the white-flood heuristic. Benchmark BEN2 Base, Apple Vision,
      ToonOut/vision.cpp and PyMatting against retained real Qwen source bytes;
      record model revision/hash, platform runtime, latency and failure modes in
      `research/sota-cutout-decision.md`.
- [x] Upgrade controlled-board generation to v4: measured high-chroma board,
      BT.601 trimap alpha, MIT PyMatting multi-level foreground reconstruction,
      then the existing deterministic trim/contain/anchor transform. Preserve
      v3/v2/v1 implementation identities for exact replay. The shared Rust core
      processes the retained 1024x1024 Qwen source in 84ms on Apple M4 Pro and
      passes black/white/gray/checkerboard visual QC without a Provider call.
- [x] Give Qwen Image 3 one 540-second synchronous write attempt inside the
      600-second role budget. Disable automatic POST retry without idempotency;
      keep bounded retry only for safe reads/downloads and return unsigned
      partial evidence on timeout.
- [x] Complete a new four-role Qwen run through the v4 native processor and
      retain its original bytes, native receipts, deterministic processed PNGs
      and reverified signed generation authorization. The successful real run is
      content-addressed by authorization hash
      `0adb8d00d19cab1a8cbfbf87689e7b2b275aab9817a217fbe0eb6841fb4bb386`;
      all four 1024x1024 outputs avoid canvas edges, share the declared feet
      anchor, and pass white/gray/black/checkerboard visual edge QC. The run took
      703.83 seconds through `qwen-image-3.0-pro` and processor v4. This proves the
      native BYOK generation/cutout boundary, not semantic acceptance or Profile
      maturity.
- [x] Reprocess the same four retained real Qwen source PNGs through v5 with zero
      Provider calls after visual QC exposed source-board leakage that reduced
      v4 subject heights to 707/800/800/715px. The perimeter-derived thresholds
      are 292.25/216/64/328.5; v5 produces four 800px-high subjects, preserves the
      declared feet anchor, avoids every delivery edge, and passes white/gray/
      black/checkerboard QC. Preserve the signed v4 run and implementation for
      replay; the offline v5 outputs are real-source algorithm evidence, not a
      retroactively signed authorization.
- [x] Complete a fresh four-role native Qwen run through current v5 in 567.38
      seconds and reverify its signed authorization hash
      `e411fdc7f5716996685b910c367f159b6b67b2a7020001ab141911d0d515ac4c`.
      All four real outputs pass adaptive-border processing, retained-byte replay,
      alpha-envelope, anchor and edge checks. Visual review correctly leaves the
      bundle unaccepted because `role:run:right:3` contains two complete subjects;
      generation-path success is not semantic delivery acceptance.
- [x] Close the native single-role repair loop. The retained real repair used the
      historical v1 preview/v3 authorization; current previews use v2 and current
      authorizations use v4 with the complete retained-evidence summary. Native
      preview re-verifies the parent
      authorization and retained bytes; apply invokes Qwen only for the selected
      strict subset, binds parent/preserved lineage, merges the complete ordered
      role closure and rejects any preserved sibling byte drift. Repair the real
      v5 duplicate `role:run:right:3` with one Qwen call in 232.61 seconds. The new
      signed authorization hash is
      `c2669f54b1d02bc60d2b8bea7a20f9e54584b01a8af80363eab5b5d1c9255cf3`;
      frames 0-2 are byte-identical to parent `e411fdc7...`, and the replacement
      is one complete subject with 800px alpha height, feet at `(512, 912)` and no
      edge contact. A subsequent current v2/v4 real attempt timed out without an
      authorization and remains unsigned under
      `partial-repair-sha256-d6b9a05293691f86e6151486ce146368c8b8349bfe69b0ea80df394a214b55a0`;
      it is not current-protocol production proof and was not automatically retried.
- [ ] Obtain separate native semantic acceptance for the exact repaired v3
      output set. Do not derive it from the signed generation authorization,
      automated pixel checks, this task record, or an assistant-authored review.
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
- [x] Add deterministic single-frame alpha-bound trimming, aspect-preserving
      envelope normalization, anchor placement on a stable delivery canvas, and
      signed cross-layer raster evidence with legacy replay.
- [x] Compose ordered processed frames into a deterministic transparent atlas,
      bind each cell, observed anchor, frame hash and frozen action timing policy,
      and fail on non-contiguous animation indices or plan/output drift.
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

### Gate 1B: Multi-action sprite family

- [ ] Add `game-asset.family-plan.v1`, `game-asset.action-clip.v1`,
      `game-asset.scale-profile.v1` and `game-asset.family-bundle.v1` without
      widening or reinterpreting the atomic `game-asset.plan.v1` contract.
- [ ] Compile natural-language character requests into independent atomic action/
      direction groups. Split attack body, projectile, impact and wide detached FX
      unless the target runtime explicitly admits shared oversized cells.
- [ ] Let one accepted idle/run clip derive a content-addressed grounded scale and
      anchor profile. Require compatible body clips to reuse its exact revision;
      airborne/FX clips declare different compatibility and anchor policies.
- [ ] Orchestrate preview/apply/review/repair per atomic action group. A failed
      group must not call the Provider for accepted siblings or change their bytes,
      receipts, revisions or hashes.
- [ ] Compile accepted clips into a multi-animation neutral family bundle with
      deterministic atlas packing, timing, action loop/one-shot metadata and
      body/FX origin relationships.
- [ ] Project family graph state into the existing workbench: master identity,
      action progress, blockers, stale dependencies, runtime preview and delivery.
      Keep scenario selection out of Create.

## Gate 2: Layered-map vertical slice

- [ ] Add `game-map.production-plan.v1` with `tile`, `scene`, `side-scroll`,
      `grid`, `room-chunk` and `baked-scene` modes. Each mode declares its visual
      model, object model, geometry/collision, zones/exits, camera and outputs.
- [ ] Add `game-map.runtime-manifest.v1` while preserving the shallow
      `game-asset.layered-map.v1` schema for compatibility and inspection.
- [ ] Add base/reference/object-library/placement/collision/zone/scene-hook schemas
      and compile them into independently repairable graph nodes.
- [ ] Add compact prop-pack and terrain-atlas slicing with deterministic evidence.
- [ ] Add bounds/referential/geometry validation and reachability checks only where
      the declared map representation makes them deterministic.
- [ ] Compose a runtime preview from accepted base/object bytes plus the exact
      placement manifest; prove a dressed reference cannot satisfy delivery.
- [ ] Add a workbench map projection that distinguishes reference, runtime layers,
      debug geometry, and final preview.
- [ ] Complete retained real `scene` and `tile` deliveries before representing map
      production as real-host or accepted-delivery coverage. Other modes may enter
      at contract maturity first but remain individually visible in the ledger.

## Gate 3: Managed bundle delivery

- [x] Define and round-trip `game-asset.bundle.v1` with relative logical names,
      content hashes, provenance, policy version, and preview binding.
      Reverify and compile the retained real repaired Qwen bundle with zero
      Provider calls into a 4096x1024 candidate atlas. Its atlas hash is
      `25866da5ca0704ebb4f6209f6851654552d127077d629d4b3c84f2d398cf3161`;
      candidate status remains explicit because semantic acceptance is absent.
      Recompile the same retained bytes through the optimized current compiler
      with zero Provider calls in 93.46 seconds. The current manifest binds the
      native `previewId`, repair `runId`, receipt identity and exact atlas bytes;
      its bundle hash is
      `22191cf0d8c09fb0df15e2c66fa3615218416d1bc96d4d27d375633ff5ca8dec`.
- [ ] Add a dry-run plan and explicit approved apply below the managed game-assets
      export root; reject absolute paths, traversal, symlinks, stale revisions,
      approval mismatch, replay, and bundle mutation.
- [ ] Add a small runtime-neutral preview consumer contract case and validate loading,
      frame order/timing, anchors, map layers, placements, and debug collision.
- [ ] Only after the surface is executable, synchronize capability manifest,
      schema, protocol/CLI/MCP surfaces, skills, and docs in the same change and
      run `pnpm agent:validate`.

## Gate 4: Managed engine adapters

- [ ] Add `game-engine.adapter-plan.v1` over one exact accepted neutral bundle
      identity; preview every output path/hash before managed apply.
- [ ] Add a managed Godot data/animation adapter and minimal preview scene. Validate
      every resource reference and animation frame without claiming gameplay code
      or existing-project mutation.
- [ ] Add an independent Unity-shaped atlas/import/animation adapter over the same
      neutral bundle. Do not share engine-specific schema or assumptions with the
      Godot adapter.
- [ ] Hand project-specific integration to the Coding Profile through a typed brief
      and its own authority boundary; engine adapter success cannot authorize code
      mutation or deployment.

## Gate 5: Temporal ingestion

- [ ] Keep video-to-sprite unavailable until an authorized video Host can retain
      exact input/output bytes, receipts, cancellation and budgets.
- [ ] Add `game-temporal-ingest.v1` and a deterministic decoder/sampler that binds
      frame timestamps and bytes, then sends derived frames through existing Game
      raster QA and neutral delivery.
- [ ] Prove video identity/style drift remains attributed quality evidence rather
      than being rewritten as deterministic acceptance.

## Gate 6: Replacement coverage ledger

- [ ] Add `game-asset.coverage-ledger.v1` with per-upstream-outcome states
      `unsupported`, `contract`, `real-host`, and `accepted-delivery` plus exact
      evidence references.
- [ ] Populate the ledger only through owning verifiers. Schema tests, fixtures,
      docs and caller-authored readiness may advance at most to `contract`.
- [ ] Declare Agent Sprite Forge replacement complete only when every required
      Sprite, Map, engine-handoff and video outcome reaches accepted delivery, or
      when the user explicitly narrows the required outcome set in the PRD.

## Child Task Ownership

- `.trellis/tasks/08-14-multi-action-sprite-family`: aggregate action planning,
  scale profile, family acceptance and multi-animation bundle.
- `.trellis/tasks/08-14-layered-game-map-production`: six map modes, structured
  runtime manifests, deterministic composition and real scene/tile rehearsals.
- `.trellis/tasks/08-14-managed-game-engine-adapters`: accepted neutral bundle to
  independently validated Godot/Unity managed packages.
- `.trellis/tasks/08-14-temporal-game-asset-ingestion`: retained video decode and
  sampling into the normal Game clip/family path.
- `.trellis/tasks/08-14-agent-sprite-forge-coverage-ledger`: pinned outcome
  inventory, owning proof adapters and derived replacement result.

## Validation

- [x] Run focused profile schema, compiler, raster processor, policy, graph impact,
      repair, preview composition, and managed-export tests.
- [ ] Run existing asset-production, candidate-selection, Design OS Kernel,
      ArtifactGraph, project persistence/recovery, and Agent workbench tests.
- [x] Run type-check, lint, dependency/security checks relevant to any new raster
      dependency, `rtk git diff --check`, production frontend build, and the full
      Tauri debug application link build without bundling.
- [x] Run `pnpm agent:validate` for any actual Agent-surface change.
- [ ] Perform desktop visual verification at supported desktop sizes; verify long
      action/asset names do not resize stable controls or overlap evidence panels.
      Frontend E2E was intentionally not run at the user's request; this remains
      open rather than being replaced by a mocked visual claim.

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
