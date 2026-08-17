# Game Asset Profile

> Typed sprite-family and layered-map production over the domain-neutral Design
> Profile Platform and Design OS Kernel.

## Scenario: Evaluate And Repair A Game Asset Family

### 1. Scope / Trigger

Apply when `src/game-asset-profile/` declares, evaluates, repairs, inspects, or
describes delivery for sprite actions/directions/frames or layered runtime maps.
Game-specific roles, locks, geometry, animation vocabulary, and engine delivery
remain Profile-owned and must not introduce Kernel or global-navigation branches.

### 2. Signatures

```ts
createGameAssetProfilePackage(): Promise<GameAssetProfilePackage>
package.registerTrustedSchemas(registry: SchemaRegistry): void
package.registerTrustedBindings(registries: ProfileBindingRegistries): void
evaluateGameAssetFrames(input: GameAssetEvaluationInput): GameAssetEvaluation
verifyGameAssetProductionRehearsalBundle(input): Promise<VerifiedGameAssetProductionRehearsal>
prepareGameAssetProductionRehearsal(input): Promise<PreparedGameAssetProductionRehearsal>
applyPreparedGameAssetProductionRehearsal(prepared): Promise<AppliedGameAssetProductionRehearsal>
prepareGameAssetProductionRepair(parent, roles): Promise<PreparedGameAssetProductionRepair>
applyPreparedGameAssetProductionRepair(prepared): Promise<AppliedGameAssetProductionRehearsal>
prepareGameAssetSemanticAcceptance(applied, decisions): Promise<PreparedGameAssetSemanticAcceptance>
applyPreparedGameAssetSemanticAcceptance(prepared): Promise<AcceptedGameAssetProductionRehearsal>
compileGameAssetProductionBundle(bundle): Promise<CompiledGameAssetBundle>
authorGameAssetActionRun(input): Promise<GameAssetGenerationPreviewInput>
createGameAssetRehearsalRepository(): GameAssetRehearsalRepository
```

### 3. Contracts

- A `game-asset.plan.v1` declares one asset identity, art-direction evidence,
  retained reference artifact ids, unique action/direction/frame roles, expected
  frame dimensions, alpha occupancy, anchor coordinates, and delivery atlas shape.
- The manifest exposes required schema, evaluator, renderer, inspector, semantic
  repair action, delivery and Outcome-scorecard bindings. Its
  required-role closure binds frame output to identity, scale, anchor, and visible
  reference-lineage constraints.
- Reference paths or prompt mentions are not evidence. Every observed frame
  carries exact artifact identity/revision/hash and source artifact lineage.
- Evaluation uses decoded dimensions and observed alpha/anchor geometry, not
  requested generation parameters. It rejects unknown or duplicate roles,
  out-of-bounds geometry, stale locks, incomplete reference lineage, and reuse of
  one artifact/content hash across distinct semantic roles.
- `expectedAlphaSize` is the maximum normalization envelope, not permission to
  stretch a subject to an exact rectangle. A normalized frame must remain inside
  that envelope and fill at least one axis within one raster pixel. Anchor
  comparison allows only the unavoidable half-pixel produced by centering an
  odd-width or odd-height alpha rectangle on the integer pixel grid.
- Accepted siblings are returned as exact role/artifact/revision/content-hash
  records. Repair targets only failed roles; an atlas failure cannot authorize
  regeneration of accepted action families.
- Layered maps keep base, props, actors, foreground, collision, zones, and preview
  as separate typed layers. Base, collision, zones, and preview are required.
  The flattened preview is non-authoritative; collision and zones are structured
  runtime data rather than pixels inferred from the preview.
- Delivery descriptions are engine-neutral. Godot, Unity, and other engine
  behavior belongs in target adapters, not this Profile or the Kernel.
- Game Outcome score is derived from strict plan/frame/lock evidence. Design OS
  maturity remains unavailable until an adapter can re-verify authoritative Host
  receipts, retained frame bytes and conformance evidence. An id-only report or a
  deterministic test run cannot stand in for that verifier.
- Native Game execution is two-step and single-use. Preview binds the canonical
  plan hash, ordered roles, full prompts, retained references, locks,
  Provider/model and output limits. Apply atomically consumes that preview,
  runs only the stored request without a separate execution confirmation and retains every
  original multimodal receipt and output byte. Preview declares
  `executionMode: 'byok-direct'`; the signed v2 full-run authorization carries a
  truthful `executionId`, `executionMode` and `startedAt`, never a fabricated
  generation approval. Partial results are unsigned.
- Coherent action sheets expose three native commands:
  `preview_game_asset_action_sheet_generation`,
  `apply_game_asset_action_sheet_generation`, and
  `verify_game_asset_action_sheet_authorization`. The source request is one
  Provider Edit over the retained reference, and the native verifier must split
  the returned bytes into the exact decoded grid before accepting any frame.
  `preview_game_asset_action_sheet_repair` accepts
  `{ parentAuthorization, parentSource, parentClip, runId, plan, roles }`, where
  `roles` is a unique strict subset of the parent plan and `runId` is fresh.
  Each selected role receives exactly one Provider Edit with the retained parent
  sheet and that role's retained cell bytes as ordered references. The signed
  `game-asset-action-sheet-repair-authorization.v1` binds the parent receipt,
  source/clip ids, replacement role requests and outputs, and
  `preservedCells: [{ roleId, sourceArtifactId, artifactId }]`. The native
  verifier re-verifies the parent source/clip, every replacement receipt and
  retained source/output byte, then recomputes each frame with its signed processor
  implementation; new replacements use v7. Caller-authored dimensions, hashes,
  pixels, readiness and preserved lineage are never trusted.
  If DashScope rejects the multi-reference Edit or times out, return an unsigned
  failed/partial result with retained verified evidence only; do not retry a POST,
  silently fall back to a single reference, or issue an authorization.
- Targeted generation repair is a second observable, single-use native request.
  `preview_game_asset_generation_repair` first re-verifies the complete parent
  v2/v3/v4 authorization and retained bytes, then accepts a strict subset of role
  prompts under a fresh run id. Current previews use v2 and current signed repair
  authorizations use v4; historical v1/v3 remains replay-only. Apply invokes the
  Provider only for selected roles. The authorization binds the parent receipt
  id/hash, every retained evidence item, replaced role ids, and each preserved
  role's origin run, request, receipt, source artifact and processed artifact. The
  returned Bundle contains the complete ordered role closure; preserved frame
  records and bytes must be exactly equal to the parent. A repair cannot replace
  the full closure, reuse any prior output run id, merge a historical processor
  id with current v7 bytes, or authorize an unsigned partial result.
- Qwen image roles retain a 600-second native Host budget per role and a total
  budget that covers every admitted role; cancellation remains available and
  completed siblings survive a later partial failure. Result downloads allow
  only HTTPS DashScope regional result buckets or the observed `dashscope-*`
  accelerated OSS bucket shape under the exact `aliyuncs.com` suffix. Signed
  query strings are never logged or retained as evidence. Qwen Image 3's
  synchronous write receives one 540-second transport attempt inside that role
  budget. POST is never automatically retried because DashScope exposes no
  idempotency key or recoverable task id for this route; safe GET/HEAD reads and
  result downloads retain bounded retry.
- DashScope HTTP failures retain only the status, a bounded allowlisted error
  code and an optional whitespace-normalized Provider message of at most 320
  characters. A message containing credential markers, tokens, secrets, HTTP
  URLs or OSS origins is discarded wholesale. The diagnostic may explain an
  `InvalidParameter` response but never retains the response body, changes the
  retry class or exposes signed result URLs.
- The retained-evidence verifier strictly decodes one complete plan/evidence/frame
  bundle, authenticates the signed generation authorization, invokes
  `verifyNativeMultimodalHostArtifact` for every output and reconstructs request,
  receipt, byte, media, dimension, role, reference and revision-bound lock
  closure. It rejects caller-authored observation, score, evaluation or readiness.
- Alpha bounds, edge contact and anchor are recomputed deterministically from
  decoded real output pixels at the frozen threshold. Models cannot author or
  amend these facts. Semantic acceptance is a separate post-generation plane:
  native code first re-verifies bytes and authorization and returns a single-use
  review preview bound to every exact role and artifact. The user reviews those
  displayed retained outputs and accepts reference continuity, role readability
  and style consistency; applying the preview then requests native confirmation
  and signs the acceptance receipt. Without that receipt semantic closure stays
  blocked.
- New controlled native runs use
  `cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-shadow-prune-rust-image-0.23-v7`.
  The processor first measures a uniform high-chroma board. If strict uniformity
  fails but the decoded perimeter remains high-chroma, it uses a deterministic
  per-channel median border estimate; neutral or low-chroma inputs still fail
  closed. It derives the BT.601 hard-background threshold from decoded border
  pixels, adds frozen headroom, and rejects a threshold that approaches neutral
  chroma instead of erasing a subject or contaminant that touches an edge. It
  then derives the deterministic hard-background/unknown/foreground trimap and
  applies the MIT-licensed PyMatting Fast Multi-Level Foreground Estimation
  algorithm before geometry normalization. This reconstructs foreground colors
  contaminated by the board; applying a semantic mask to original RGB is not
  sufficient. Before reconstruction, v7 replaces unsupported long near-bottom
  board strokes with the measured board color so generated floor lines cannot
  invalidate an otherwise bounded cell. A final deterministic cleanup removes detached or unsupported
  near-bottom horizontal strokes while preserving pixels with nearby subject
  support, preventing generated floor lines from becoming sprite pixels.
  Already-transparent sources preserve alpha.
- v7 then computes tight alpha bounds, crops the subject, scales proportionally
  with Lanczos3 to contain the plan's alpha envelope, and places it on the fixed
  delivery canvas at the planned anchor. Signed evidence binds measured board
  color, derived chroma-distance-squared threshold in the closed `64..=4096`
  range, matting route, source
  size/bounds, target envelope, scale policy, resized subject, placement and
  output bounds. Frozen v6 keeps the relaxed median fallback and post-matte
  shadow cleanup but never runs v7's pre-reconstruction board cleanup. Frozen v5
  requires the strict uniform perimeter and runs neither shadow cleanup. v5, v6,
  v4 fixed-chroma, v3 adaptive-board, v2 white-board and v1 matte-only remain
  separately dispatchable solely for byte-exact replay; their implementation ids
  must never be reused for v7 output.
- Arbitrary user images still require a semantic alpha proposal before foreground
  reconstruction. Apple Vision is the current macOS proposal; BiRefNet
  HR-matting/ToonOut remain model-pack candidates until exact model revision,
  hash, license, backend and real retained output are independently rehearsed.
  Segmentation, alpha estimation, foreground reconstruction and crop/anchor
  normalization are distinct evidence stages.
- A complete Game rehearsal does not itself authorize Profile maturity or shared
  promotion. No Game maturity adapter exists until a real retained run is
  independently exercised against a Game-aware Design OS ruler.
- The Workbench Game assets tab authors a bounded action plan only from a
  user-selected retained reference, explicit domain controls and an enabled
  DashScope Qwen image route. It shows the native run preview before generation,
  displays only returned processed bytes, exposes actual evaluator findings and
  requires an explicit Keep or Regenerate decision for every role. Regenerate
  prepares the strict subset repair preview before its Provider apply. Semantic
  acceptance is available only when every displayed role is kept.
- In action-family mode, the Workbench projects every native coherent source and
  derived cell independently. Keep/Repair decisions are per cell. Previewing a
  repair requires decisions for the complete parent clip and a strict failed-cell
  subset; applying it uses the native action-sheet repair commands, re-verifies
  the returned authorization and merges only replacement outputs into the
  displayed clip. Untouched frame bytes remain the parent bytes. A repaired group
  cannot use its historical parent for a second repair; another rejection blocks
  the group until a fresh coherent source establishes new authority.
- Deterministically verified and semantically accepted rehearsal bundles are
  persisted in the dedicated IndexedDB repository with their original Provider
  bytes, processed PNG bytes, receipts and processing evidence. Listing or
  reopening stored evidence re-runs the owning verifier; stored status text is
  never trusted as authority.
- `game-asset.bundle.v1` is compiled natively from reverified processed PNG bytes.
  It uses fixed relative logical names, content-addresses the exact atlas and
  canonical manifest bytes, binds the generation receipt, native preview id, run
  id, Game plan hash, ordered cell geometry, observed anchors, frame hashes and
  frozen action timing policy. Compilation without semantic acceptance produces
  only `candidate`; `accepted` requires the exact native acceptance receipt. The
  Workbench exposes atlas and manifest downloads after that closure.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Action/direction/frame tuple or role id is duplicated | Reject the plan |
| Atlas cells cannot contain every declared role | Reject the plan |
| Observed frame role is missing, duplicated, or undeclared | Block/repair that exact role |
| Decoded dimensions or normalized alpha envelope violate the plan | Reject that frame; retain valid siblings |
| Identity, scale, anchor hash, geometry, or coordinates differ | Reject that frame as stale/inconsistent |
| Required reference artifact lineage is absent | Reject that derivative |
| Artifact id or content hash is reused across semantic roles | Reject every affected role |
| Collision/zones are absent or flattened preview is authoritative | Reject the layered map |
| Caller supplies an evaluation summary to the scorecard | Reject; recompute from strict source evidence |
| Host maturity evidence has no authoritative verifier | Declare no maturity adapter and keep maturity blocked |
| Frame receipt or retained bytes/hash/media/dimensions/context differs | Reject the complete rehearsal bundle |
| Generation preview or authorization claims a separate execution approval | Reject protocol drift; BYOK generation is direct and observable |
| Qwen result URL is outside the exact regional or accelerated DashScope OSS shapes | Reject before download without exposing its signed query |
| Synchronous Qwen POST times out | Do not retry automatically; retain completed siblings as unsigned `partial` and expose the missing role for repair |
| Opaque generation board is neutral or low-chroma | Reject deterministic v7 matting; do not silently fall back to white flood or semantic readiness |
| High-chroma board is non-uniform | Current v7 uses the deterministic median border estimate, then still fails closed on unsafe adaptive threshold or edge contact; signed v5 replay keeps its historical strict-perimeter rejection |
| Coherent action-sheet cell crosses its decoded grid boundary | Reject the complete source clip; retain verified source/cells only and expose the exact failed role for isolated repair |
| Action-sheet repair parent is stale under the current processor implementation | Reject before Provider execution; the old result cannot become a repair parent |
| DashScope multi-reference action-sheet Edit returns `InvalidParameter` or times out | Retain the failed attempt without clip/authorization; never retry POST or claim repair success |
| DashScope supplies a safe diagnostic message | Show the bounded sanitized detail without changing the HTTP classification; discard the detail if it contains any credential or URL marker |
| Repair parent authorization, bytes, plan hash, processor or role order drifts | Reject before creating a repair preview |
| Repair selects every role, no role, or reuses a prior output run id | Reject; use a fresh full run or a strict subset repair |
| Preserved role bytes/request/receipt/artifact differ after repair | Reject the current v4 or historical v3 authorization and complete repaired Bundle |
| Replacement role fails or times out | Return unsigned `partial`; retain the verified parent Bundle unchanged |
| Processed frame cannot be reproduced byte-for-byte from its retained Provider source | Reject the complete rehearsal bundle |
| Semantic acceptance is absent | Verify generation and deterministic pixels but return blocked semantic closure |
| Semantic decisions are incomplete, reordered, rejected, or not natively confirmed | Reject acceptance and keep semantic closure blocked |
| Atlas frame bytes, dimensions, role order, plan hash, preview id or acceptance differ | Reject bundle compilation before returning any accepted delivery |
| Semantic acceptance is absent during bundle compilation | Return a content-addressed `candidate`; never label it accepted |
| Caller supplies observation, evaluation, score, or readiness fields | Reject the strict bundle before native verification |

### 5. Good / Base / Bad Cases

- Good: four independently generated run frames consume the same accepted
  identity/scale/anchor locks, match decoded geometry, retain reference lineage,
  and assemble into a content-addressed engine-neutral atlas plus canonical
  `game-asset.bundle.v1` manifest only after byte and authorization replay.
- Base: frame 2 touches its cell edge. Evaluation returns only frame 2 as failed
  and preserves the exact revision/hash of frames 0, 1, and 3 for targeted repair.
  Repair sends one new role request, returns a complete current v4 closure and keeps those
  three sibling PNGs byte-identical.
- Good: an action-sheet parent is natively reverified, one failed cell is selected,
  and the repair authorization contains one replacement receipt plus exact source/
  output ids for every untouched sibling.
- Bad: a verifier reruns signed v5/v6 bytes through current v7, or a Provider
  returns `InvalidParameter` for the two-image Edit. The verifier dispatches the
  exact historical implementation or rejects the result; it never manufactures a
  replacement clip.
- Bad: one attractive sprite sheet is copied into multiple semantic roles, or a
  renderer drops the rejected frame from a new Bundle and labels the remaining
  siblings complete. Evaluation rejects the evidence rather than manufacturing
  role closure.

### 6. Tests Required

- Package admission through trusted schema/binding registries and exact Profile
  closure without changes to protected Kernel/global-navigation surfaces.
- Plan validation for role/tuple uniqueness, atlas capacity, schema, identity,
  scale, anchor, and reference requirements.
- Frame evaluation for missing/duplicate/unknown roles, reused artifacts/content,
  decoded dimensions, alpha bounds, edge contact, identity/scale/anchor hashes,
  observed geometry, coordinates, and reference lineage.
- Targeted repair assertions on failed role ids plus exact accepted sibling
  artifact id/revision/content hash retention.
- Layered-map required layers, unique kinds, structured collision/zones, and
  non-authoritative preview.
- Strict evaluator invocation, inert semantic repair command, engine-neutral
  delivery descriptor, derived Outcome score, and absent maturity adapter until
  real receipt/byte reverification exists.
- Retained evidence tests cover strict caller-field rejection, byte drift before
  native verification, per-frame native invocation, blocked-without-acceptance
  behavior and fail-closed rejection when any native receipt fails. Mocked native
  verification proves only contract/failure paths and never complete rehearsal,
  maturity or production readiness. A success claim requires an actual native
  run, retained bytes and signed post-generation acceptance.
- Native raster tests use real encoded pixels to prove v7 adaptive border
  measurement, median fallback, pre-reconstruction board cleanup, BT.601 trimap
  alpha, PyMatting multi-level foreground reconstruction, trim/contain/anchor
  normalization and source/output identity. Tests must show
  that a physically blended edge is closer to its foreground color after
  reconstruction, that v5 keeps strict perimeter rejection, that v6 does not gain
  v7 cleanup, and that v6/v5/v4/v3/v2/v1 evidence remains byte-replayable through
  its exact historical dispatcher. Retained real Qwen source bytes are composited on
  black, white, gray and checkerboard backgrounds for edge QC without another
  Provider call; that does not create a new native receipt, semantic acceptance,
  maturity or promotion. Contract fixtures prove processor behavior only.
- Native apply tests assert no generation call reaches
  `require_native_confirmation`; exact execution identity and start time remain
  covered by the signed authorization verifier. Transport tests assert POST is
  not retry-safe while bounded GET/HEAD reads remain retry-safe.
- Repair contract tests assert a two-role parent causes exactly one replacement
  Provider invocation, preserves the untouched receipt and PNG bytes, changes the
  replacement artifact, signs current v4 parent/preserved lineage and re-verifies
  the complete result. Historical v1/v3 is replay-only. A production claim
  additionally requires a retained real repair run; the test fixture proves only
  protocol behavior.
- Action-sheet repair tests assert strict-subset parent closure, exact ordered
  two-reference binding, one Provider invocation per failed cell, preserved sibling
  source/output artifact identity, parent tamper rejection, stale-processor rejection,
  and unsigned retention of a real Provider `InvalidParameter`/timeout. The ignored
  native rehearsal test is the only path that may claim a real action-sheet repair;
  unit fake providers prove protocol behavior only.
- Bundle tests must reverify generation and optional semantic acceptance, decode
  exact processed bytes, compose stable cells, bind action timing, anchor, hash
  and native preview metadata, and round-trip canonical manifest bytes across
  Rust and TypeScript. A retained real Qwen bundle must also compile without a
  Provider call; fixture composition alone is not production evidence.

### 7. Wrong vs Correct

```ts
// Wrong: requested dimensions and a prompt reference are treated as output proof.
acceptFrame({ roleId, width: request.width, reference: '/tmp/hero.png' })

// Correct: evaluate observed artifact bytes, exact locks, geometry, and lineage;
// repair only the role that failed while retaining accepted sibling hashes.
const evaluation = evaluateGameAssetFrames({
  plan,
  frames: decodedObservedFrames,
})
compileRepairCommand(evaluation.failedRoleIds, evaluation.acceptedArtifacts)

// Wrong: regenerate every role and trust matching filenames as preservation.
await runFullGeneration({ roles: plan.roles })

// Correct: native code re-verifies the parent, runs only failed roles, and signs
// the full merged closure with exact preserved identities.
const repair = await prepareGameAssetProductionRepair(parent, failedRolePrompts)
const repaired = await applyPreparedGameAssetProductionRepair(repair)

// Correct: compile only from the retained verified closure. Missing semantic
// acceptance remains a candidate rather than being promoted by the caller.
const delivery = await compileGameAssetProductionBundle(repaired.bundle)
if (delivery.deliveryStatus !== 'accepted') blockFinalExport(delivery.bundleId)
```

## Scenario: Accept And Deliver A Multi-Action Sprite Family

### 1. Scope / Trigger

Apply when one identity is compiled into independently reviewable Idle, Run,
Attack-body, detached FX, or other action groups and delivered as one
runtime-neutral family. This aggregate layer consumes verified atomic Game
evidence; it never manufactures child receipts or changes `game-asset.plan.v1`.

### 2. Signatures

```ts
createGameAssetFamilyPlan(input): Promise<GameAssetFamilyPlan>
compileDefaultGameAssetFamilyPlan(input): Promise<GameAssetFamilyPlan>
authorGameAssetFamilyRun(input): Promise<AuthoredGameAssetFamilyRun>
compileGameAssetActionSheetRepairPrompt({ role, component, failed, excludeDetachedVisual }): string
createGameAssetGroundedNormalizationDesktopRunner(): GameAssetGroundedNormalizationDesktopRunner
createGameAssetFamilyProductionDesktopRunner(): GameAssetFamilyProductionDesktopRunner
runner.preview(input): Promise<GameAssetFamilyAcceptancePreview>
runner.apply(previewId): Promise<NativeGameAssetFamilyAcceptance>
runner.verify(acceptance, input): Promise<NativeGameAssetFamilyAcceptance>
runner.compile(acceptance, input): Promise<CompiledGameAssetFamilyBundle>
verifyCompiledGameAssetFamilyBundleBytes(bundle): Promise<CompiledGameAssetFamilyBundle>
```

```rust
preview_game_asset_grounded_normalization(input)
apply_game_asset_grounded_normalization(plan_id)
verify_game_asset_grounded_normalization_authorization(authorization, input, clip)
preview_game_asset_family_acceptance(input)
apply_game_asset_family_acceptance(preview_id)
verify_game_asset_family_acceptance(acceptance, input)
compile_game_asset_family_bundle(acceptance, input)
```

### 3. Contracts

- `game-asset.family-plan.v1` contains exact atomic groups, dependency edges,
  compatibility classes, body/FX components, observed timing and
  `game-asset.family-bundle.v1` delivery. Group and role order are authoritative.
- `game-asset.family-authoring.v3` derives a bounded action program from the
  requested outcome instead of emitting one fixed action list. Player, NPC and
  grounded creature body groups use a feet anchor; grounded props use bottom.
  Alpha envelopes and prompt safety margins derive from the requested frame
  (`min(width, height) / 16`, bounded to `1..64`) rather than human proportions.
  Blade, ranged, magic and detached-visual language enters only groups selected
  by explicit request cues. The compiler fingerprint binds the subject policy,
  action program, semantic cues, geometry and prompt-policy constants. Existing
  serialized family plans remain replay-only evidence and are never recompiled
  under v3 meaning.
- When a body group has a synchronized detached-visual group, its initial brief
  explicitly reserves the detached visual for that group. Targeted body repair
  uses `excludeDetachedVisual=true`, keeps the emission origin empty and forbids
  flash, smoke, glow, projectiles, tracers, sparks and debris. The Workbench sends
  a signed partial body parent directly to isolated Provider repair in this case;
  local pixel reprocessing cannot fix semantic component leakage. Other eligible
  partial groups retain zero-call local reprocessing first.
- Family admission accepts only strict retained-evidence variants. The native
  verifier replays every parent authorization, receipt, source byte and processed
  byte, reconstructs complete clips itself, and treats any caller clip as a
  comparison input. A caller-authored `mergedClip`, measurement, readiness or
  completion field is rejected.
- `grounded-normalization-migration` derives compatible body frames only from an
  exactly reverified parent clip. The v8 processor
  `cutout-verified-alpha-family-grounded-normalize-anchor-rust-image-0.23-v8`
  contains alpha proportionally inside the successor safe canvas, preserves the
  feet anchor and records `providerCalls: 0`; it cannot authorize generation.
- `local-partial-reprocess` closes only the failed roles of a signed partial sheet.
  The current v11 spatial-board processor uses
  `contain-preserve-aspect-no-upscale-action-sheet-v1`, reuses every accepted
  sibling byte, and records `executionMode: local-deterministic` plus
  `providerCalls: 0`. Provider isolated repair remains a fallback only when the
  native local preview rejects the retained source.
- One `game-asset.scale-profile.v1` is derived from verified grounded master
  geometry and reused only by compatible grounded groups. Detached FX retains its
  own anchor/scale policy. Observed alpha width is evidence, never a cross-action
  normalization target.
- `cutout.game-asset-family-acceptance-preview.v1` binds the complete family plan,
  scale profile, accepted clip references, body/FX relationships, decisions,
  ordered roles and artifact ids. It is short-lived and single-use. Apply still
  requires explicit native-local-human semantic confirmation; expired, consumed,
  incomplete or stale previews cannot sign `game-asset.family-acceptance.v1`.
- The v1 family compiler re-verifies the acceptance and all retained inputs,
  packs canonical group/direction/frame order into bounded fixed-cell atlases,
  and emits canonical manifest bytes under fixed relative paths. The Workbench
  compiles twice and requires equal manifest/atlas identities before display.
  Playback reads manifest cells and timing from the actual compiled atlas.
- Managed export writes only compiled relative paths and verifies every returned
  file receipt hash against the manifest or atlas identity. A preview, fixture,
  caller-rendered strip or unsigned family can never be presented as delivery.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Group/role/dependency order is missing, duplicated, cyclic or stale | Reject family admission before acceptance |
| Grounded groups mix v8 and historical scale contracts | Reject the family scale profile |
| Detached FX is forced into the grounded profile | Reject component compatibility |
| A body group with a detached dependent renders the detached visual | Reject semantic review; repair only failed body roles with `excludeDetachedVisual=true` |
| A detached-visual cue names its owning action without repeating the action verb | Add that bounded body action and synchronize the detached group to it |
| Parent receipt/source/processed bytes or preserved siblings drift | Reject the retained evidence |
| Caller clip differs from the native reconstructed clip | Reject even when caller hashes were recomputed |
| Local reprocess claims Provider calls or changes an unselected sibling | Reject authorization verification |
| Semantic decision is missing/reordered or the preview expired | Keep family acceptance blocked |
| Acceptance, scale profile or clip reference differs at compile time | Reject before producing an accepted atlas |
| A second compile changes manifest bytes or any atlas hash | Block playback/export as nondeterministic |
| Managed export receipt path/hash differs | Report export failure; do not retain a delivered directory |

### 5. Good / Base / Bad Cases

- Good: verified Idle/Run/Attack grounded migrations plus a v11 locally
  reprocessed detached FX clip close 22 exact roles with zero cleanup Provider
  calls, receive explicit family acceptance, compile twice identically and export
  only after every persisted hash matches.
- Good: a prop request for idle, charge, shoot and separate muzzle flash compiles
  bottom-anchored body groups plus a shoot-synchronized detached group. No feet,
  humanoid or blade language appears, and a failed shoot cell repairs only its
  body motion while keeping the emission point empty.
- Base: one FX cell fails v11 local preview. The family stays blocked and may use
  one isolated Provider repair for that exact role; accepted siblings and body
  groups remain byte-identical.
- Bad: a renderer supplies a plausible merged FX clip, copies requested alpha
  sizes into a scale profile, or labels a compiled fixture `accepted`. Native
  replay rejects those claims.

### 6. Tests Required

- Strict family plan tests for malformed groups, duplicate roles, cycles,
  incompatible profiles, stale references and deterministic natural-language
  compilation into body plus detached FX.
- Compiler tests cover player, creature and prop policies, action-only detached
  cues, prompt-policy fingerprint changes, frame-derived geometry and absence of
  weapon/anatomy leakage. Repair tests assert the explicit detached exclusion and
  preserved sibling identities.
- Native v8/v11 tests over encoded pixels, exact historical replay, zero Provider
  calls, anchor/containment policy, selected-role-only replacement and preserved
  sibling byte identity.
- Family verifier tests for every retained-evidence variant, incomplete decision
  closure, caller clip tampering, parent byte tampering and expired/single-use
  preview behavior.
- Bundle tests must reverify acceptance, compile the same retained family twice,
  compare canonical manifest bytes and every atlas hash, then decode manifest
  cells from the actual atlas. Export tests compare every managed receipt path and
  digest. Fixture bundles prove rejection/determinism only.
- A production claim requires retained real Qwen source/receipt bytes for every
  group, explicit signed family acceptance and the exported accepted bundle.
  Direct native/API tests are sufficient; frontend E2E is not production proof.

### 7. Wrong vs Correct

```ts
// Wrong: trust renderer assembly and compile before exact family acceptance.
await compileFamily({ clips: rendererMergedClips, accepted: true })

// Wrong: locally clear a body cell's border and retain an effect that belongs
// in a separate synchronized channel.
await reprocessPartialBodyCell(parentWithMuzzleFlash)

// Correct: preserve accepted siblings and replace only the leaking body roles.
const prompt = compileGameAssetActionSheetRepairPrompt({
  role,
  component: 'body',
  failed: true,
  excludeDetachedVisual: true,
})
await previewPartialRepair(parent, [{ roleId: role.id, prompt }])

// Correct: native replay owns closure; a human accepts the short-lived preview,
// then deterministic compilation and receipt verification own delivery.
const preview = await runner.preview(strictRetainedEvidence)
const acceptance = await runner.apply(preview.previewId)
await runner.verify(acceptance, strictRetainedEvidence)
const first = await runner.compile(acceptance, strictRetainedEvidence)
const second = await runner.compile(acceptance, strictRetainedEvidence)
assertEqualCompiledIdentities(first, second)
await saveManagedBundleAndVerifyReceipts(first)
```

## Scenario: Plan And Deterministically Process A Layered Runtime Map

### 1. Scope / Trigger

Apply when `src/game-asset-profile/` turns a natural-language map or level
request into one of six runtime-neutral map modes, decodes its authority
contracts, extracts accepted raster grids, validates authored runtime data, or
composes deterministic previews, projects the graph-backed workbench, performs
targeted graph repair, produces retained `scene` / `tile` visuals, signs semantic
acceptance, or exports a content-addressed candidate or accepted bundle.

### 2. Signatures

```ts
compileGameMapProductionPlan(input: GameMapAuthoringInput): Promise<GameMapProductionPlan>
fingerprintGameMapProductionPlan(input): Promise<string>
fingerprintGameMapObjectLibrary(input): Promise<string>
fingerprintGameMapRuntimeManifest(input): Promise<string>
fingerprintGameMapPreviewReceipt(input): Promise<string>
fingerprintGameMapBundle(input): Promise<string>
extractGameMapPropPack(input: GameMapPropPackExtractionInput): Promise<GameMapPropPackExtraction>
extractGameMapTerrainAtlas(input: GameMapTerrainExtractionInput): Promise<GameMapTerrainExtraction>
validateGameMapRuntime(input: GameMapRuntimeProcessingInput): Promise<GameMapRuntimeValidation>
composeGameMapPreview(input: GameMapRuntimeProcessingInput): Promise<NativeGameMapPreview>
produceGameMapLiveVisuals(input: GameMapLiveProductionRequest): Promise<GameMapLiveVisualProduction>
authorGameMapLiveRuntime(input): Promise<GameMapLiveRuntimeClosure>
acceptGameMapSemanticReview(
  closure: GameMapLiveRuntimeClosure,
  decisions: readonly GameMapSemanticReviewDecision[],
): Promise<{ acceptance: GameMapSemanticAcceptance, input: GameMapSemanticAcceptanceInput }>
verifyGameMapSemanticAcceptance(input): Promise<GameMapSemanticAcceptance>
projectGameMapWorkbench(input: GameMapWorkbenchInput): Promise<GameMapWorkbenchProjection>
previewGameMapRepair(
  closure: GameMapRepairClosure,
  request: GameMapRepairRequest,
): Promise<GameMapRepairPreview>
applyGameMapRepairPreview(
  closure: GameMapRepairClosure,
  preview: GameMapRepairPreview,
): Promise<GameMapRepairClosure>
prepareGameMapManagedBundle(
  input: GameMapManagedBundleInput,
): Promise<PreparedGameMapManagedBundle>
applyPreparedGameMapManagedBundle(
  prepared: PreparedGameMapManagedBundle,
  repository: BundleRepository,
): Promise<AppliedGameMapManagedBundle>
```

The frontend functions invoke the bounded native commands
`extract_game_map_prop_pack`, `extract_game_map_terrain_atlas`,
`validate_game_map_runtime`, `compose_game_map_preview`,
`admit_game_map_live_artifact`, `verify_game_map_live_artifact`,
`accept_game_map_semantic_review` and
`verify_game_map_semantic_acceptance`. Map processor and verifier commands accept
retained bytes only; they accept no filesystem path, Provider secret, network
origin or caller-authored measurement.

The registered Profile schemas are `game-map.production-plan.v1`,
`game-map.object-library.v1`, `game-map.runtime-manifest.v1`,
`game-map.preview-receipt.v1` and `game-map.bundle.v1`.

### 3. Contracts

- Natural language selects `tile`, `scene`, `side-scroll`, `grid`, `room-chunk`
  or `baked-scene` deterministically. Callers do not supply a mode flag.
- Every mode owns one exact ordered node recipe. Node role determines kind and
  authority; the decoder rejects caller-authored substitutions. The runtime
  manifest depends on every runtime input, preview depends on the exact manifest
  and accepted visual/object inputs, debug overlay depends on the manifest, and
  bundle depends on that complete derived closure.
- `dressed-reference` is `planning-reference` authority. Runtime manifest,
  preview, debug overlay and bundle dependency lists may never consume it.
- `baked-scene` is admitted only for an explicit visual-only/non-playable request.
  A request that also names playability, collision, spawn, exit, editing or
  interaction is rejected instead of silently losing runtime semantics.
- Object libraries bind exact accepted visual artifact revisions and acceptance
  receipts plus decoded size, anchor, occlusion, safe placement area and explicit
  collision policy. Pixels do not author collision.
- Runtime manifests keep accepted visuals, layers, placements, structured
  collision/zones, spawns, exits, camera and coordinates separate. Playable
  manifests require object-library, collision, spawn and exit data. Baked
  manifests reject those gameplay claims.
- Terrain layers bind exact atlas grid dimensions plus explicit destination and
  source cells. Duplicate/partial/out-of-range cells are rejected. Navigation is
  either explicitly unavailable or an authored cardinal-4 orthogonal grid;
  collision pixels and Alpha never become navigation authority.
- Prop extraction decodes the exact accepted PNG and declared grid, emits a PNG,
  byte length, SHA-256, Alpha bounds, non-zero-Alpha count and edge-contact fact
  for every declared object, then classifies it as `compact`, `wide`, or
  `collision-bearing`. Empty or edge-touching prop cells block the extraction.
- Terrain extraction emits the same byte/cell evidence for every exact cell.
  `seamable` admits deliberate edge-filling tiles; `isolated` treats Alpha at a
  cell border as a blocking cross-cell risk. Partial grids and unsafe raster
  dimensions fail before extraction.
- Native code checks encoded length, accepted SHA-256, PNG signature and header
  dimensions before full decode. One raster is limited to 64 MiB of decoded
  source bytes, 16,384 pixels per axis and 67,108,864 pixels; one runtime closure
  is limited to 384 MiB of source bytes and 50,000,000 decoded pixels. Preview
  worlds are limited to 8,192 pixels per axis and 16,777,216 pixels so preview
  plus debug buffers remain bounded.
- Runtime validation recomputes canonical manifest/object-library hashes and
  every accepted PNG content identity, rejects extra or missing raster bindings,
  stale object revisions, invalid layer sources, unsafe transforms, out-of-world
  placements/geometry/spawns/exits, and incomplete playable closure. Authored
  object collision references must resolve to exact manifest geometry.
- Reachability runs only for explicit bounded orthogonal navigation. It performs
  cardinal-4 traversal from authored player spawn cells to authored exit shapes.
  Without explicit navigation it returns informational `unavailable`; it does
  not infer a path from collision shapes, raster pixels or a dressed reference.
- Native preview composition is deterministic integer-pixel PNG composition over
  accepted runtime visuals and the exact manifest. Terrain cells are copied from
  the declared atlas; unrotated unit-scale object bytes are placed by their
  authored anchor and stable layer/y/sort/id order. Unsupported transforms block
  instead of being ignored. A separate debug PNG draws camera, collision, zones,
  spawns and exits. Dressed/extraction sources cannot enter the compositor.
- Frontend verification re-hashes every extracted cell and final preview/debug
  byte array. Identical retained inputs must produce identical PNG bytes and
  measurements under the frozen Rust `image 0.23` implementation ids.
- Preview receipts bind a compositor implementation hash, exact accepted inputs,
  manifest hash, distinct preview/debug artifacts and deterministic findings.
  They do not imply semantic acceptance.
- Live visual production currently admits `scene` and `tile` only. Each mode
  generates one Qwen runtime visual and one isolated object source through the
  native multimodal Host, retains both original receipts/bytes, and admits only
  exact replayed processing outputs into the runtime closure. The other four
  modes remain contract-complete but cannot inherit real visual-production claims.
- Map object admission uses
  `cutout-spatial-high-chroma-board-field-occlusion-interpolation-safe-margin-seed-trimap-pymatting-ml-foreground-normalize-anchor-rust-image-0.23-v12`.
  It requires a closed verified high-chroma perimeter and all existing threshold,
  PyMatting, edge-contact, safe-margin and anchor checks. When a large foreground
  legitimately hides interior board nodes, v12 interpolates only those occluded
  nodes from deterministic neighboring field support and records
  `interpolatedNodeCount`; perimeter evidence is never interpolated. v9-v11 remain
  frozen replay implementations and may not label v12 output.
- Semantic review is a separate attributed plane over the displayed retained
  closure. It must accept exact runtime-role fidelity, every object cutout,
  composed preview and authored geometry; `tile` also requires terrain-grid
  coherence. Native acceptance replays all source receipts/bytes, processing,
  runtime validation and preview composition before signing
  `game-map.semantic-acceptance.v1`.
- The workbench projection re-decodes the plan, runtime, validation, preview and
  bundle at their owner boundaries and rejects stale cross-record hashes before
  rendering. It shows planning references separately from runtime authority,
  object and layer identities, authored geometry, exact dependency blockers,
  preview/debug artifacts and delivery state from that one closure.
- Repair is preview-first and exact-target only. One request may replace one
  object, one runtime visual, one layer or one placement/collision/zone/spawn/exit
  record. Record identity/order and every unrelated top-level field and sibling
  are immutable. Apply recomputes the complete preview and rejects a changed or
  stale request.
- Object replacement preserves unrelated accepted identities and marks the
  object-library reference, placements of that object, preview and bundle stale.
  Runtime-visual replacement atomically rewrites only layers that reference the
  old visual identity, then marks preview and bundle stale. Layer or authored
  manifest-record repair marks only preview and bundle stale.
- Managed bundle preview re-hashes every accepted runtime/object PNG, canonical
  manifest, preview and debug byte sequence before assigning fixed relative
  paths. Without semantic acceptance it remains `candidate`. With acceptance,
  preview must call the native verifier and apply must call it again before the
  managed `BundleRepository` atomically writes the fixed closure and matches every
  native save receipt by path, SHA-256 and byte length. Only that path yields
  `accepted` / `accepted-exported`; a caller-authored acceptance shape is rejected.
- The historical `game-asset.layered-map.v1` stays readable under its original
  shallow semantics. It is never migrated or reinterpreted as a production
  runtime manifest.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Mode recipe is missing, reordered, duplicated or extended | Reject the production plan |
| Node kind, authority or exact dependency list differs from its role | Reject before any execution |
| Grid/chunk dimensions do not exactly cover the world | Reject the plan/manifest |
| Planning reference reaches manifest, preview, debug or bundle | Reject the dependency closure |
| Baked request also asks for gameplay/runtime semantics | Reject baked compilation |
| Playable manifest omits object library, collision, spawn or exit | Reject the manifest |
| Geometry or camera exceeds world bounds | Reject with the owning record identity |
| Accepted PNG bytes/hash/revision or raster binding differs | Return blocking validation; never compose |
| Prop cell is empty or Alpha reaches its cell edge | Return blocked prop extraction with the exact object id |
| Terrain atlas is partial or dimensions differ from its exact grid | Reject before emitting cells |
| PNG header, per-raster or aggregate decoded budget is unsafe | Reject before full decode/composition |
| Isolated terrain Alpha reaches a cell border | Return blocked extraction; only explicit `seamable` may admit it |
| Tile destination/source cell is duplicate or out of range | Reject the manifest/runtime validation |
| Object revision, layer source, decoded size or authored anchor placement is stale | Return blocking validation and refuse preview |
| Placement requests rotation or non-unit scaling in native v1 | Block as unsupported; never silently approximate |
| Player spawn is absent, outside the world, on a hazard, or on an explicit blocked cell | Return blocking validation |
| Explicit cardinal grid cannot reach an exit | Return `reachability.status = blocked` and refuse preview |
| No explicit navigation data exists | Return informational `unavailable`; do not claim pass/fail reachability |
| Runtime input includes a planning/extraction source or an extra accepted raster | Reject the exact raster closure |
| Preview and debug artifacts share identity/bytes | Reject the preview receipt |
| Accepted bundle lacks semantic acceptance | Reject; candidate remains the maximum status |
| Live artifact receipt, source byte, v12 processing evidence or admitted output differs | Reject semantic acceptance before signing |
| v12 interpolates a perimeter node or lacks deterministic interior support | Reject the object cutout; do not weaken board closure |
| Semantic decisions omit/reorder one required criterion or mix reviewers | Reject semantic acceptance |
| Accepted prepare/apply cannot replay the native acceptance | Reject; never project accepted delivery |
| Workbench validation, preview, bundle or export belongs to another revision | Reject the stale cross-layer projection |
| Repair changes a non-target sibling, order, identity or top-level field | Reject before issuing the repair preview |
| Object repair leaves an exact dependent placement unmarked | Reject the repair projection/test closure |
| Runtime visual repair omits or changes a dependent layer beyond `sourceId` | Reject the repair preview |
| Bundle contains an extraction source, caller path or mismatched retained bytes | Reject before managed save |
| Managed save receipt omits a file or changes its hash/length | Reject the apply result; do not report export success |
| Caller supplies a fabricated or closure-drifted semantic acceptance | Reject during native verifier replay |
| Legacy shallow map is supplied to a `game-map.*` decoder | Reject without migration |

### 5. Good / Base / Bad Cases

- Good: a side-scroll request compiles parallax, platform, object, placement,
  collision, hazard, spawn, checkpoint, exit and camera nodes before exact
  manifest/preview/debug/bundle nodes; its accepted runtime bytes compose a
  distinct visual preview and geometry debug overlay with no planning-only input.
- Base: an explicit non-playable static background compiles a visual-only baked
  plan with fixed camera and no gameplay authority. A playable scene without
  explicit navigation composes but reports reachability as unavailable.
- Base: replacing one lantern definition preserves the tree and base identities,
  but stales the object-library reference, lantern placements, preview and bundle.
- Good: a reviewed real `scene` closure replays both Qwen source receipts, v12
  object processing, runtime composition and exact semantic decisions. Preview
  and apply independently reverify acceptance before the atomic fixed-path export
  returns matching receipts and `accepted-exported`.
- Base: a fully verified map with no semantic acceptance exports only as
  `candidate-exported`; deterministic correctness does not imply visual acceptance.
- Bad: a flattened scene is labeled playable, or a hand-authored plan changes
  collision to planning-reference authority and removes it from manifest
  dependencies. Strict decoding rejects both.
- Bad: a caller edits one target and a sibling in the same repair, supplies an
  arbitrary export path, or attaches a fabricated acceptance object to make the
  candidate bundle appear accepted. Each boundary rejects the request.

### 6. Tests Required

- Representative Chinese/English intent for every mode, deterministic tie-break,
  default scene routing and rejection of non-map product requests.
- Exact role order, role policy, dependency closure, acyclicity, coordinate/camera
  compatibility and baked-playable conflict tests.
- Strict object-library, runtime-manifest, preview-receipt and bundle closure tests,
  including bounds, unique identities, safe relative paths and acceptance status.
- Native prop/terrain extraction tests with decoded PNGs, byte-stable repeated
  output, compact/wide classification, seamable edge evidence, isolated-border
  blocking and exact-grid dimension rejection.
- Native runtime tests for canonical hashes, exact accepted raster closure,
  object revision/bounds/geometry/spawn/exit failures, explicit unreachable exits,
  unavailable reachability, deterministic preview/debug bytes and compositor
  refusal on every blocking result.
- Canonical hash replay for all five contracts and explicit rejection of reordered
  authoritative node arrays.
- Workbench tests for planning/runtime separation, graph blocker paths, stale
  validation/preview/bundle/export rejection and candidate/accepted delivery status.
- Targeted repair tests for all four target kinds, single-record/order isolation,
  preserved sibling identities, exact object-placement staleness, atomic visual
  layer rewrites and stale preview replay rejection.
- Managed bundle tests for fixed paths, canonical manifest bytes, exclusion of
  extraction sources, per-file re-hashing, preview replay, native receipt
  path/hash/length matching, candidate behavior without acceptance and native
  acceptance replay during both accepted preview and apply.
- Real-only `scene` and `tile` rehearsals must retain original Qwen receipts and
  source/output bytes, visually review every required criterion, replay v12 and
  composed previews natively, and atomically export accepted neutral bundles.
  Contract fixtures and mock runners cannot establish this claim.
- Bidirectional compatibility tests: old layered maps still decode only as old
  layered maps, while new plans/manifests cannot decode as the legacy schema.
- Contract fixtures prove schema behavior only and the remaining four modes have
  no real-host visual claim until equivalent retained rehearsals exist.

### 7. Wrong vs Correct

```ts
// Wrong: infer gameplay geometry from one attractive flattened image.
const manifest = { collision: alphaBounds(flattenedScene), preview: flattenedScene }

// Correct: compile the exact mode graph, then author structured runtime data;
// planning references never become compositor or gameplay inputs.
const plan = await compileGameMapProductionPlan({ sourceText, mapName })
const manifest = gameMapRuntimeManifestSchema.parse(authoredRuntimeManifest)
const planHash = await fingerprintGameMapProductionPlan(plan)

// Correct: native validation replays exact accepted bytes before composition.
const validation = await validateGameMapRuntime(runtimeInput)
if (validation.status === 'blocked') throw new Error('Map runtime is blocked')
const preview = await composeGameMapPreview(runtimeInput)

// Wrong: schema registration is described as production delivery.
claimAcceptedMap(gameMapBundleSchema.parse(candidate))

// Correct: remain candidate unless the native verifier replays the exact
// semantic acceptance receipt during both preview and apply.
if (candidate.deliveryStatus !== 'accepted') blockManagedMapExport()

// Wrong: repair by replacing an entire manifest and trust a caller-selected path.
await saveMapBundle(request.outputPath, request.nextManifest)

// Correct: preview one isolated graph mutation, replay it on apply, and export
// the resulting closure through the managed fixed-path repository. Accepted
// delivery additionally supplies the exact retained acceptance artifacts.
const repair = await previewGameMapRepair(current, oneTargetRequest)
const repaired = await applyGameMapRepairPreview(current, repair)
const preparedBundle = await prepareGameMapManagedBundle({
  runtime,
  preview,
  semanticAcceptance: { receipt: acceptance, artifacts: liveArtifacts },
})
await applyPreparedGameMapManagedBundle(preparedBundle, managedBundleRepository)
```

## Scenario: Launch Game Production From Natural Language

### 1. Scope / Trigger

Apply when Home or the project Agent composer receives a brief that may describe
a Game Asset deliverable. Scenario selection is an internal Design OS routing
decision; users must not have to choose a Profile before describing the result.

### 2. Signatures

```ts
recognizeGameAssetIntent(input: string): DesignScenarioIntentMatch<GameAssetIntent> | undefined
routeWorkspaceSubmission(input: string):
  | { kind: 'game-assets'; intent: GameAssetIntent }
  | { kind: 'agent' }
createGameAssetLaunchRequest(intent, references): GameAssetLaunchRequest
CanvasProfileLaunch = { kind: 'game-assets'; launch: GameAssetLaunchRequest }
GameAssetProductionPanel(props: { launch: GameAssetLaunchRequest }): JSX.Element
```

### 3. Contracts

- Explicit deliverables such as `sprite sheet`, `游戏素材`, `角色动画`, or
  `动作帧` route locally without requiring a chat model. Compound intent requires
  a game subject, action language, and either frame or asset language.
- Recognition may extract kind, view, action, direction and frame count. It
  creates a typed Canvas Profile launch but never previews, applies, approves,
  scores, or advances evidence.
- Home creates and persists the project before opening Game production on the
  Project Canvas, then returns without `requestAgentRun("create-assets")`.
  Project-composer routing opens the same Canvas stage directly. The Agent
  remains mounted and closing the stage restores the existing artifact board.
- Exactly one image attachment becomes the launch reference. Zero or multiple
  images remain unselected; the router must not guess which image owns identity.
- Unmatched or ambiguous intent stays on the Agent path. The primary workspace
  does not expose a Game Asset scenario picker; the Profile is selected from the
  user's requested outcome and its extracted controls remain reviewable on
  Canvas. The legacy Workbench may inspect the same Profile but is not required.
- Direct request tests may compile the exact GUI payload and pass it to native
  preview. They do not prove GUI interaction or replace native confirmation for
  apply.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Explicit Game Asset deliverable | Open the Game Canvas stage with extracted controls |
| Game-adjacent website/product request | Keep the Agent route |
| More than one scenario matches | Keep the Agent route for clarification |
| Exactly one image attachment | Bind its retained bytes to the launch request |
| Multiple image attachments | Bind no reference; require explicit selection |
| No chat model but explicit Game intent | Open Game production without starting Agent execution |
| Native preview payload contains approval/readiness | Reject the contract; launch owns no authority |

### 5. Good / Base / Bad Cases

- Good: `给这个角色做 4 帧向右跑步素材` plus one PNG opens Canvas production
  with `run`, `right`, four frames and that exact retained reference.
- Base: `Create a sprite sheet` opens the Canvas stage with bounded defaults and
  waits for the user to supply missing name/reference details.
- Bad: `设计一个游戏官网首页` is intercepted because it contains `游戏`, or
  launch recognition immediately starts a Qwen request.

### 6. Tests Required

- Chinese compound and English explicit recognition with extracted controls.
- Negative game-adjacent website and industry-analysis requests.
- Workspace routing assertions for Game versus Agent and one-versus-many image
  attachment binding.
- Home source/integration assertion that Game routing returns before
  `requestAgentRun("create-assets")`.
- A real-only direct request test may use retained Qwen image bytes to compile the
  exact renderer payload and pass the same JSON through native `preview_request`.
  It must assert `executionMode: 'byok-direct'` and absence of
  approval/readiness fields.

### 7. Wrong vs Correct

```ts
// Wrong: make the user understand internal Profile names before describing work.
openScenarioPicker(['Game assets', 'Commerce', 'Brand'])

// Correct: route a clear brief locally, keep Agent mounted, and expose the
// extracted controls in the bounded Canvas stage.
const route = routeWorkspaceSubmission(userBrief)
if (route.kind === 'game-assets') {
  setCanvasProfileLaunch({
    kind: 'game-assets',
    launch: createGameAssetLaunchRequest(route.intent, references),
  })
} else {
  requestAgentClarification(userBrief)
}
```
