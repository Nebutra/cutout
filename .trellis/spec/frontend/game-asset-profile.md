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
```

### 3. Contracts

- A `game-asset.plan.v1` declares one asset identity, art-direction evidence,
  retained reference artifact ids, unique action/direction/frame roles, expected
  frame dimensions, alpha occupancy, anchor coordinates, and delivery atlas shape.
- The manifest exposes required schema, evaluator, renderer, inspector, semantic
  repair action, delivery, evidence-benchmark, and Outcome-scorecard bindings. Its
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
  maturity remains a separate blocked projection until authoritative Host and
  conformance evidence exists.

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
| Host maturity evidence has no authoritative verifier | Keep maturity metrics blocked |

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
  delivery descriptor, derived Outcome score, and separate blocked maturity.

### 7. Wrong vs Correct

```ts
// Wrong: requested dimensions and a prompt reference are treated as output proof.
acceptFrame({ roleId, width: request.width, reference: '/tmp/hero.png' })

// Correct: evaluate observed artifact bytes, exact locks, geometry, and lineage;
// repair only the role that failed while retaining accepted sibling hashes.
const evaluation = evaluateGameAssetFrames({
  plan,
  frames: decodedObservedFrames,
  identityLockHash,
  scaleLockHash,
  anchorLockHash,
})
compileRepairCommand(evaluation.failedRoleIds, evaluation.acceptedArtifacts)
```
