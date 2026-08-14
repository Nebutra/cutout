# Game asset production profile

## Goal

Make Cutout useful for producing coherent, reusable 2D game asset families rather
than isolated generated images. A user should be able to describe a character,
effect bundle, or layered map and receive reviewable source candidates,
deterministically processed runtime assets, structured placement/runtime data,
and evidence explaining whether the bundle is ready to use.

The product should adopt Agent Sprite Forge's strongest domain practices while
retaining Cutout's stronger authority, provenance, candidate-selection, approval,
repair, and content-addressed artifact model.

This is also the third-scenario proof for the full-scenario Design OS. It must
enter through the Design Profile Platform and demonstrate that a genuinely new
spatial/temporal/runtime-delivery domain needs no Kernel or global-navigation
branch.

## Background

- Agent Sprite Forge commit
  `64fd0b57d3f2ae117ef0a95e4c2decc25b4c9dd2` was inspected on 2026-08-13.
  It covers sprite sheets, layered maps, deterministic local processing, limited
  engine handoff, and a Grok-only video-to-sprite path.
- Cutout already owns generated-image routing, multi-candidate exploration,
  production run state, deterministic cutout evidence, managed artifacts,
  OutcomeGraph/ArtifactGraph provenance, targeted repair, and approval policy.
- The current `asset-production-plan.v1` task output is intentionally restricted
  to one `image/png` with `subjectCount: 1`. That contract cannot honestly model
  an animation action, multi-action character, atlas, prop library, or layered map.
- Cutout's public capability contract currently declares no video-processing
  pipeline, no arbitrary path writes, and no public Godot or Unity project
  exporter. Planning must not represent those capabilities as implemented.
- The Game Asset Profile now has a strict native desktop runner. Native preview
  binds the exact request closure; single-use apply directly owns real BYOK
  Provider execution without a per-call payment confirmation; returned receipts
  and original bytes are retained, passed
  through a versioned deterministic white-border Cutout processor, and
  reverified byte-for-byte before processed-frame pixel evidence is accepted.
- Post-generation semantic acceptance is separately signed only after the
  retained output set is displayed for review, native code re-verifies the exact
  generation evidence, and the local user confirms reference continuity, role
  readability and style consistency for every role. Missing acceptance remains
  blocked and cannot be replaced by caller-authored approval.
- The System inspector now has a real Game assets workbench. It builds a retained
  action plan from the user's reference image, previews the exact native paid
  request, displays processed output bytes and evaluator findings, requires an
  explicit per-role semantic review, and persists the signed bundle. Reopening a
  stored run re-verifies its receipts and bytes instead of trusting saved status.

## Requirements

### R1. Domain profile and asset-family contracts

- Add a versioned game-asset production profile that projects into the generic
  Design OS Kernel rather than replacing it.
- Package its schemas, compilers, evaluators, presentation/action bindings,
  capability requirements and delivery descriptions as a locked declarative
  Profile closure admitted by the Scene Extension Law.
- Model a sprite family as one identity with independently repairable actions,
  linked body/FX roles, frame order, timing, anchor, scale profile, and final
  delivery layouts.
- Model a layered map as terrain/base, reusable object library, placements,
  render order, collision, zones, scene hooks, and a composed QA preview.
- Keep raw generations, accepted candidates, processed frames, atlases, previews,
  metadata, and delivery bundles as distinct provenance-bound artifacts.

### R2. Agent-authored planning with deterministic execution

- Infer a useful action/bundle/map plan from natural language without requiring
  users to choose grid dimensions or processing flags.
- Separate unrelated action families before generation. In particular, keep wide
  slash/muzzle/projectile/impact FX separate from a controllable actor's body
  sheet unless the runtime contract explicitly supports shared oversized cells.
- Generate animation actions in stable multi-row layouts when appropriate, then
  assemble runtime strips or atlases deterministically after acceptance.
- Treat deterministic processors as cleanup, split, normalize, align, compose,
  validate, and package executors, not as generators of creative artwork.

### R3. Sprite QA and cross-action consistency

- Record per-frame empty/edge-touch/clamping status, alpha bounds, subject scale,
  anchor position, and retained-pixel coverage.
- Derive raster dimensions, alpha state, frame bounds and preview timing from
  decoded output bytes. Requested grid/canvas/timing values remain intent and
  cannot be copied into QA evidence when the returned artifact differs.
- Record action-level scale variation, anchor drift, output-origin consistency,
  frame count/order, and loop/one-shot timing validity.
- Let an accepted idle/run action establish a locked scale/anchor profile reused
  by other grounded body actions.
- Treat integrity failures as non-waivable and quality failures as explicit review
  blockers under the existing production policy.
- Allow targeted regeneration or reprocessing of one failing action or FX family
  while preserving accepted siblings and their hashes.

### R4. Layered-map semantics

- Distinguish concept/reference images from runtime layers. A dressed or stage
  reference may guide object choice and placement but must not masquerade as an
  editable/collidable runtime map.
- Store collision, walk bounds, trigger zones, spawn/exits, sort anchors, and
  camera bounds as structured metadata rather than inferred runtime truth from
  a flattened image.
- Compose the final review preview from the accepted runtime base, object assets,
  and placement metadata so preview and deliverable share the same authorities.
- Validate referential integrity, bounds, spawn/exit reachability where a
  deterministic grid/navigation representation exists, and obvious layer/anchor
  contract failures.

### R5. Review, evidence, and repair UX

- Present asset families as a dependency-aware set: identity/reference, actions,
  FX, object library, map/runtime data, preview, and delivery bundle.
- Support compare, promote, lock, reject, and "more like this" at the action or
  map-reference level without conflating candidate review with final delivery.
- Explain blockers using measured evidence and dependency paths; do not report a
  bundle as complete merely because generation calls finished.
- Report Design OS evidence maturity separately from a frozen Game Asset Outcome
  scorecard for identity continuity, frame integrity, motion readability, anchor/
  scale stability, map coherence and bundle usability. Neither report may mint
  the other's success.
- Reuse Cutout's OutcomeGraph impact propagation so a changed master identity or
  scale profile marks dependent actions/atlases stale while unrelated assets stay
  accepted.

### R6. Managed delivery and capability honesty

- MVP delivery must stay below a Cutout-managed export root and be previewed
  before approved apply.
- Export a runtime-neutral bundle containing transparent PNG frames/sheets,
  animation and map manifests, placement/collision/zones data, previews, hashes,
  and provenance.
- Engine-specific exporters must be explicit adapters over the accepted neutral
  bundle. They must not write into arbitrary user-selected project paths.
- The first shippable delivery is the runtime-neutral bundle plus Cutout preview.
  A managed Godot exporter is a later adapter and is not an MVP dependency.
- Video-to-sprite is out of MVP and remains unavailable until Cutout has an
  authorized video executor and verified frame-extraction/processing path.
- Do not change `cutout.agent-capabilities.json`, CLI, MCP, manifests, or docs
  until the corresponding end-to-end surface is executable and validated.

### R7. Real-only production rehearsal

- Add an official desktop Game Asset runner whose preview is a canonical digest
  of the exact run, plan, role prompts, reference-byte hashes, locks, Provider,
  model, output constraints and bounded role closure.
- The native Host must consume that preview once, run the exact observed request
  closure directly under the configured BYOK Provider policy, retain a unique
  execution identity, and sign an authorization receipt over both the request
  closure and returned native receipt/artifact identities. Generation preview
  exposes `executionMode: 'byok-direct'`; it contains no renderer boolean or
  caller-authored approval id.
- Persist the original returned bytes, processed transparent PNG bytes, native
  receipts and processing evidence in the rehearsal bundle. Reverification must
  authenticate both signatures, reproduce each processed PNG byte-for-byte from
  its original source, and reconstruct hashes, media type, decoded dimensions
  and pixel geometry from those bytes.
- Compute alpha bounds, edge contact and anchor geometry deterministically from
  decoded pixels. Model or human review may judge identity continuity, action
  readability and style, but must not author pixel facts.
- Keep production rehearsal and promotion blocked until every declared role has
  real retained evidence plus an independently attributable semantic acceptance
  receipt. API success, route identity, a fixture or a test double is not that
  evidence.
- Fixtures and mocks may exercise strict decoding, rejection, cancellation and
  replay behavior only. They must never set Game maturity, production readiness,
  rehearsal completion or shared-surface promotion to passed.

### R8. Intent-first scenario launch

- Users describe the desired result before choosing a scenario. Explicit Game
  Asset deliverables route locally from both Home and the project composer into
  the real Game production workbench without requiring a chat model.
- Intent routing pre-fills reviewable controls only. It cannot preview, execute,
  approve, score, or promote a run.
- Exactly one attached image may become the retained master reference. Multiple
  images require explicit selection; the router must not guess identity authority.
- `Create -> Game assets` remains a visible fallback, not the primary workflow.

## Acceptance Criteria

- [ ] A contract case compiles into a deterministic sprite-family graph with
      separate idle, run, attack-body, attack-FX, and delivery-atlas nodes;
      this proves graph conformance only.
- [ ] Changing the accepted master scale/identity revision stales dependent body
      actions and atlases, but not unrelated props or map terrain.
- [ ] A deterministic processor turns retained real Host output bytes into
      ordered transparent frames plus sheet/preview artifacts and emits
      reproducible QA measurements for empty frames, edge touch, anchor drift,
      and scale drift. Fixed bytes may additionally test determinism but cannot
      satisfy the real-Host criterion.
- [ ] A retained artifact whose decoded dimensions or frame timing differs from the request
      records the observed values, blocks incompatible slicing/delivery, and does
      not let requested values masquerade as receipt or QA truth.
- [ ] A quality-rejected action cannot satisfy the family outcome; retrying that
      action preserves accepted sibling hashes.
- [ ] A layered-map contract case distinguishes base/reference/object/preview artifacts,
      validates structured placements/collision/zones, and composes a preview from
      the same accepted runtime objects described by its manifest.
- [ ] A runtime-neutral bundle round-trips through schema validation, uses only
      project-controlled relative references or content hashes, and can be
      previewed before any managed export apply.
- [ ] Existing prototype asset production remains compatible; no `v1` snapshot or
      current one-subject production task is silently reinterpreted.
- [ ] Installing or removing the Game Asset Profile changes no Kernel lifecycle,
      authority/history or global-navigation branch; disabled content remains
      inspectable and unrelated Profile hashes remain stable.
- [ ] Game Asset evidence maturity and Outcome quality decode from independent,
      versioned reports; raising a quality score cannot advance Host/rehearsal
      maturity, and valid Host receipts cannot manufacture sprite quality.
- [ ] The desktop runner previews one exact bounded Game request closure before
      apply, consumes the preview once without paid confirmation, invokes the
      real native image route, and returns retained bytes plus a signed execution
      receipt that independently rebinds every generation receipt and artifact.
- [ ] A complete real run is independently reverified from retained signatures
      and bytes. Missing native authorization, altered prompts/references/locks,
      receipt drift, byte drift, duplicate role output, missing semantic
      acceptance or a partial run remains blocked.
- [ ] No test fixture, mocked native verifier, synthetic Provider response or
      caller-authored score/readiness field can satisfy real-Host, production-
      rehearsal or promotion acceptance.
- [ ] Public Agent capability validation passes only after any genuinely shipped
      operations, formats, CLI/MCP tools, manifest, and docs are synchronized.
- [x] A natural-language Game Asset brief from Home or the project composer opens
      the Game workbench with extracted action/direction/frame controls, bypasses
      the generic Agent run, and binds only one unambiguous image attachment.
- [ ] Focused unit, malformed-contract, dependency/repair and deterministic-
      bytes tests pass together with native source tests, `pnpm agent:validate`,
      type-check, lint, and relevant existing production/Kernel suites. Any real-
      Host claim additionally cites a retained run rather than test output.

## Out Of Scope

- Video-to-sprite generation or frame extraction in the first release.
- Arbitrary writes into an existing Godot or Unity project.
- A complete game editor, gameplay-code generator, physics engine, or navmesh
  authoring environment.
- Claiming that model-based identity/style review is deterministic; such review
  remains separately attributed evidence.
- Pixel-perfect parity with Agent Sprite Forge's Python CLI or its magenta-only
  cleanup implementation.
