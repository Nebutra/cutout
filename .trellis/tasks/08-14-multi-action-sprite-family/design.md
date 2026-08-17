# Multi-action sprite family - technical design

## Boundary

Keep `game-asset.plan.v1` as the atomic Host execution unit. Add aggregate
Profile-owned contracts above it; do not change Kernel lifecycle or authority.
This task depends on the parent atomic Game foundation and produces neutral family
bundles consumed by engine adapters and the coverage ledger.

## Contracts

- `game-asset.family-plan.v1`: identity/art direction, action groups, dependency
  edges, compatibility classes, master-selection policy and desired deliveries.
- `game-asset.action-clip.v1`: one verified atomic bundle, ordered frames,
  observed timing, anchor policy and semantic acceptance identity.
- `game-asset.action-source.v1`: `coherent-grid` or `role-isolated` execution,
  exact Provider source receipt/artifact, declared/observed grid and per-cell
  derivation identities.
- `game-asset.scale-profile.v1`: master clip/hash, canvas, measured standing scale,
  anchor, component policy and compatible action classes.
- `game-asset.family-acceptance.v1`: native review closure over exact accepted
  clips, profile revision and body/FX relationships.
- `game-asset.family-bundle.v1`: accepted clips, atlases, animation descriptors,
  FX origins, hashes and provenance.

## Data Flow

```text
intent + identity reference
  -> family plan
  -> action source plans
  -> coherent sheet generation + deterministic split
     or isolated role generation
  -> native cutout/review per derived frame
  -> accepted master clip -> scale profile
  -> compatible clips + detached FX
  -> family acceptance
  -> deterministic multi-animation bundle
```

The family orchestrator schedules independent atomic previews and consumes their
verified retained bundles. It never manufactures atomic receipts. Dependency
impact marks compatible actions and downstream atlases stale when master identity
or scale changes; unrelated FX/props remain stable when their inputs do.

## Generality Boundary

Family compilation owns an intent-derived action program, not one global
`Idle/Run/Attack/Attack FX` preset. A bounded action library supplies timing and
phase semantics, while the request selects the applicable body actions and whether
detached effects exist. The primary-subject policy derives topology-neutral
language, safe canvas envelope and anchor from the declared subject kind plus
explicit request cues. It never infers appearance facts that should come from the
retained identity reference.

The current supported family subject kinds are player, NPC, grounded creature and
grounded prop. Grounded actors use a feet anchor; props use a bottom anchor. Airborne
master profiles remain a separate successor contract rather than being mislabeled
as grounded. Blade/ranged/magic constraints are optional semantic cues; a generic
creature attack must not invent a held weapon, and a prop animation must not be
called a character body.

The compiler fingerprint includes the inferred program, subject policy, geometry
and evidence. Generalizing authoring does not migrate retained plans or receipts:
native replay consumes their embedded contracts exactly as before.

Aggregate intent and atomic Provider prompts are separate contracts. The original
family intent remains authoritative planning/provenance input, but it is never
copied wholesale into every action request: doing so lets an action list override
the current group and produces mixed-action sheets. The compiler projects only
group-local semantic cues (for example, a requested blade into attack-body and a
detached slash arc into attack-FX), exact motion phases, and negative constraints.
Idle and run prompts cannot see attack-only cues.

`coherent-grid` is the default initial strategy for multi-frame action groups:
one native Provider receipt/source artifact binds the complete action closure,
then a deterministic splitter derives cells from decoded bytes and records exact
source rectangles and hashes. Requested rows/columns are intent; observed decoded
dimensions and cell geometry are authoritative. A mismatch blocks the action.

Targeted repair switches only failed cells to `role-isolated`. The new clip binds
the original shared source for preserved cells and the isolated repair source for
replacements. The authorization signs this mixed lineage; it cannot pretend the
repaired clip still comes from one unchanged sheet.

Atlas packing is deterministic over canonical action/direction/frame order. A
first version may use fixed cells and multiple atlases when cell requirements
differ. Body/FX synchronization is represented by explicit origin and timing
references, not by baking wide effects into fixed body cells.

## Workbench

Project the family OutcomeGraph into one unframed work surface: master identity,
action rows, measured blockers, review/repair controls, playback and delivery.
Controls edit a new plan revision. They never mutate an accepted clip in place.

## Rollback

Aggregate contracts and UI can be disabled without changing atomic records. A
failed family compile leaves every accepted atomic clip inspectable and exportable.
The existing role-isolated signed protocol remains replayable if coherent-grid
generation is disabled or rolled back.
