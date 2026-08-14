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
prepareGameAssetSemanticAcceptance(applied, decisions): Promise<PreparedGameAssetSemanticAcceptance>
applyPreparedGameAssetSemanticAcceptance(prepared): Promise<AcceptedGameAssetProductionRehearsal>
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
  runs only the stored request without a paid confirmation and retains every
  original multimodal receipt and output byte. Preview declares
  `executionMode: 'byok-direct'`; the signed v2 authorization carries a truthful
  `executionId`, `executionMode` and `startedAt`, never a fabricated generation
  approval. Partial results are unsigned.
- Qwen image roles retain a 600-second native Host budget per role and a total
  budget that covers every admitted role; cancellation remains available and
  completed siblings survive a later partial failure. Result downloads allow
  only HTTPS DashScope regional result buckets or the observed `dashscope-*`
  accelerated OSS bucket shape under the exact `aliyuncs.com` suffix. Signed
  query strings are never logged or retained as evidence.
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
- A complete Game rehearsal does not itself authorize Profile maturity or shared
  promotion. No Game maturity adapter exists until a real retained run is
  independently exercised against a Game-aware Design OS ruler.
- The Workbench Game assets tab authors a bounded action plan only from a
  user-selected retained reference, explicit domain controls and an enabled
  DashScope Qwen image route. It shows the native run preview before generation,
  displays only returned processed bytes, exposes actual evaluator findings and
  requires every role to be checked before the native semantic-acceptance
  preview can be prepared.
- Deterministically verified and semantically accepted rehearsal bundles are
  persisted in the dedicated IndexedDB repository with their original Provider
  bytes, processed PNG bytes, receipts and processing evidence. Listing or
  reopening stored evidence re-runs the owning verifier; stored status text is
  never trusted as authority.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Action/direction/frame tuple or role id is duplicated | Reject the plan |
| Atlas cells cannot contain every declared role | Reject the plan |
| Observed frame role is missing, duplicated, or undeclared | Block/repair that exact role |
| Decoded dimensions or alpha bounds violate the plan | Reject that frame; retain valid siblings |
| Identity, scale, anchor hash, geometry, or coordinates differ | Reject that frame as stale/inconsistent |
| Required reference artifact lineage is absent | Reject that derivative |
| Artifact id or content hash is reused across semantic roles | Reject every affected role |
| Collision/zones are absent or flattened preview is authoritative | Reject the layered map |
| Caller supplies an evaluation summary to the scorecard | Reject; recompute from strict source evidence |
| Host maturity evidence has no authoritative verifier | Declare no maturity adapter and keep maturity blocked |
| Frame receipt or retained bytes/hash/media/dimensions/context differs | Reject the complete rehearsal bundle |
| Generation preview or authorization claims a paid approval | Reject protocol drift; BYOK generation is direct and observable |
| Qwen result URL is outside the exact regional or accelerated DashScope OSS shapes | Reject before download without exposing its signed query |
| Processed frame cannot be reproduced byte-for-byte from its retained Provider source | Reject the complete rehearsal bundle |
| Semantic acceptance is absent | Verify generation and deterministic pixels but return blocked semantic closure |
| Semantic decisions are incomplete, reordered, rejected, or not natively confirmed | Reject acceptance and keep semantic closure blocked |
| Caller supplies observation, evaluation, score, or readiness fields | Reject the strict bundle before native verification |

### 5. Good / Base / Bad Cases

- Good: four independently generated run frames consume the same accepted
  identity/scale/anchor locks, match decoded geometry, retain reference lineage,
  and assemble into an engine-neutral atlas manifest.
- Base: frame 2 touches its cell edge. Evaluation returns only frame 2 as failed
  and preserves the exact revision/hash of frames 0, 1, and 3 for targeted repair.
- Bad: one attractive sprite sheet is copied into multiple semantic roles, or a
  flattened map image is treated as collision truth. Evaluation rejects the
  evidence rather than manufacturing role closure.

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
- Native raster tests use real encoded pixels to prove the fixed white-border
  flood/matte processor is reproducible, preserves source identity, emits a
  content-addressed PNG and derives alpha geometry from that PNG. This is
  deterministic processor evidence only; it is not a real-Host rehearsal.
- Native apply tests assert no generation call reaches
  `require_native_confirmation`; exact execution identity and start time remain
  covered by the signed authorization verifier.

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
GameAssetProductionPanel(props: { launch?: GameAssetLaunchRequest }): JSX.Element
```

### 3. Contracts

- Explicit deliverables such as `sprite sheet`, `游戏素材`, `角色动画`, or
  `动作帧` route locally without requiring a chat model. Compound intent requires
  a game subject, action language, and either frame or asset language.
- Recognition may extract kind, view, action, direction and frame count. It
  pre-fills the real Game workbench but never previews, applies, approves, scores,
  or advances evidence.
- Home creates and persists the project before opening Game production, then
  returns without `requestAgentRun("create-assets")`. Project-composer routing
  opens the same workbench directly.
- Exactly one image attachment becomes the launch reference. Zero or multiple
  images remain unselected; the router must not guess which image owns identity.
- Unmatched or ambiguous intent stays on the Agent path. The manual
  `Create -> Game assets` entry remains a discoverability and recovery fallback,
  not a required scenario-selection step.
- Direct request tests may compile the exact GUI payload and pass it to native
  preview. They do not prove GUI interaction or replace native confirmation for
  apply.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Explicit Game Asset deliverable | Open the Game workbench with extracted controls |
| Game-adjacent website/product request | Keep the Agent route |
| More than one scenario matches | Keep the Agent route for clarification |
| Exactly one image attachment | Bind its retained bytes to the launch request |
| Multiple image attachments | Bind no reference; require explicit selection |
| No chat model but explicit Game intent | Open Game production without starting Agent execution |
| Native preview payload contains approval/readiness | Reject the contract; launch owns no authority |

### 5. Good / Base / Bad Cases

- Good: `给这个角色做 4 帧向右跑步素材` plus one PNG opens Game production
  with `run`, `right`, four frames and that exact retained reference.
- Base: `Create a sprite sheet` opens the workbench with bounded defaults and
  waits for the user to supply missing name/reference details.
- Bad: `设计一个游戏官网首页` is intercepted because it contains `游戏`, or
  launch recognition immediately starts a paid Qwen request.

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

// Correct: route a clear brief locally, expose the extracted controls for review,
// and retain manual Create navigation only as a fallback.
const route = routeWorkspaceSubmission(userBrief)
if (route.kind === 'game-assets') openGameWorkbench(route.intent)
else requestAgentClarification(userBrief)
```
