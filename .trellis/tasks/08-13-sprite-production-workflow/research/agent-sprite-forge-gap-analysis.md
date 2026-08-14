# Agent Sprite Forge comparison

## Evidence inspected

- Repository: <https://github.com/0x0funky/agent-sprite-forge>
- Commit: `64fd0b57d3f2ae117ef0a95e4c2decc25b4c9dd2`
- Commit timestamp: `2026-07-13T03:00:40+08:00`
- Reviewed: three skill contracts, ten reference documents, seven Python
  processors/helpers, two test modules, dependency file, README, and examples.
- Cutout evidence: Agent capability manifest, Design OS Kernel contracts,
  candidate selection, asset production, raster QA, prototype resource pack,
  material/outcome projections, commerce profile, and current project specs.

## What Agent Sprite Forge does well

1. **It models asset production as a workflow, not a prompt.** The agent chooses
   asset type, action family, view, layout, anchor, scaling, reference role, and
   delivery shape before generation; local code is reserved for deterministic
   cleanup and export.
2. **It encodes practical sprite failure knowledge.** Animated bodies avoid long
   raw strips, grounded actions share feet/scale rules, elongated silhouettes use
   a shared envelope, and detached combat effects are separated when they would
   shrink a body inside fixed cells.
3. **It separates generation layout from runtime layout.** Actions can be created
   and reviewed in compact grids, then assembled into engine strips/atlases only
   after per-action QA.
4. **It measures useful geometry.** The processor reports empty frames, edge
   touch, paste clamping, subject scale variation, anchor drift, and subject
   height, and it can persist/reuse a scale profile across actions.
5. **Its map contract respects runtime semantics.** Terrain base, dressed/stage
   reference, prop library, placements, collision, zones, actors, foreground,
   and flattened preview are deliberately distinct. It explicitly rejects using
   a baked reference as editable/collidable runtime truth.
6. **It demonstrates engine-facing outcomes.** Godot metadata/scenes, tiles,
   object layers, collision/zones, debug players, and runnable prototypes make
   the intended value legible beyond image generation.

## Where Cutout should improve on it

1. **Typed IR instead of skill prose as the primary contract.** Sprite Forge's
   richest invariants live in long Markdown instructions and loosely related JSON
   outputs. Cutout should compile versioned brief/family/map/bundle schemas into
   an authoritative OutcomeGraph and validate every boundary.
2. **One provenance graph across the full family.** Sprite Forge writes useful
   files, but Cutout can bind raw candidates, accepted masters, scale profiles,
   frames, atlases, maps, previews, evidence, repairs, and exports by content hash
   and exact revision.
3. **Candidate decisions and targeted repair.** Cutout can explore deliberate
   directions, lock a master, propagate impact, preserve accepted siblings, and
   explain why only one action/map object needs repair.
4. **Measured and attributed evidence.** Deterministic geometry checks, model
   identity/style review, and human promotion must remain visibly distinct. Raw
   measurements should survive policy changes.
5. **Safe delivery.** Direct convenience must not bypass preview/apply, filesystem
   boundaries, stale-revision checks, or authorization. Managed neutral bundles
   are a better base for multiple engine adapters than arbitrary project writes.
6. **Provider and Host honesty.** Video generation or engine export appears only
   when the exact Host route exists. A platform-specific instruction is never
   generalized into a false Cutout capability.

## What Cutout should not copy

- A hard dependency on solid magenta as the only cleanup route. Preserve it as a
  useful generation strategy, but use Cutout's flood/alpha/component primitives
  and record which strategy produced the evidence.
- One 1,600-line Python command as the long-term contract owner. Split planning,
  pixel processing, evidence, policy, and export into typed modules with narrow
  tests while preserving deterministic behavior.
- Prompt rules that are not reflected in runtime validation. Important rules such
  as action separation, shared scale, anchors, frame order, and reference/runtime
  map separation must become schemas and graph dependencies.
- Grok-only video-to-sprite as a nominal cross-platform feature. Cutout currently
  declares no video-processing pipeline; add it only through the separately
  authorized temporal Host work.
- Direct mutation of arbitrary Godot/Unity projects. First export a previewed,
  approved, content-addressed neutral bundle under a managed root.

## Capability matrix

| Concern | Agent Sprite Forge | Cutout now | Recommended Cutout profile |
| --- | --- | --- | --- |
| Domain planning | Rich skill heuristics | Generic prototype/asset planning | Typed sprite/map brief compiler |
| Sprite family | Actions and bundles in skill/files | Single-subject PNG task | Family DAG with action/FX nodes |
| Candidate exploration | Mostly regenerate/inspect | Versioned compare/promote/lock | Reuse Cutout selection and lineage |
| Frame processing | Grid split, chroma, align, scale | Strong general cutout/components | Add frame/anchor/atlas operations |
| QA | Useful geometry JSON | Generic raster and production issues | Versioned game QA policy + evidence |
| Layered maps | Strong reference/runtime distinction | No game-map profile | Typed layers, placements, collision/zones |
| Runtime proof | Godot/Unity examples | Prototype preview infrastructure | Neutral preview over accepted artifacts |
| Provenance | Files and metadata | ArtifactGraph/content hashes | End-to-end family/map lineage |
| Repair | Script reruns | OutcomeGraph impact and repair | Target one action/object subgraph |
| Export safety | Direct project-oriented workflow | Managed exports and approvals | Managed bundle, explicit engine adapters |
| Video sprites | Grok-only, ffmpeg/Pillow | Publicly unsupported | Later authorized capability only |

## Recommended first benchmark

Use one small but structurally complete fixture rather than a broad showcase:

- one side-view hero with accepted idle master, run, melee body, detached slash
  FX, and a deterministically assembled neutral atlas;
- one two-layer top-down map with terrain base, dressed reference, three reusable
  props, placements, blockers, spawn, exit, and composed runtime preview;
- mutate the master scale revision and prove only dependent character nodes stale;
- reject one attack frame for edge touch and prove targeted repair preserves the
  idle/run/map artifact hashes;
- export one managed neutral bundle and load it in a bounded preview fixture.

This benchmark exercises the differentiating system behavior without claiming a
full game editor, arbitrary engine integration, or video support.
