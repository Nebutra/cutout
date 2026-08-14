# Agent Sprite Forge promotion analysis

## Evidence boundary

This review inspected `0x0funky/agent-sprite-forge` at its `main` branch on
2026-08-13 as design-workflow evidence. Cutout does not vendor its scripts or
claim its Provider/engine integrations. The useful output is a set of Game Asset
Profile laws that can be expressed through the Design Profile Platform.

## Strengths to preserve

- Start from a typed asset plan: asset/action/view, action family, grid/frame
  closure, anchor, scale strategy, art style and engine delivery shape.
- Generate coherent action families separately, validate them separately, then
  deterministically assemble delivery strips/atlases. A mixed raw atlas is not a
  substitute for per-action quality closure.
- Treat visible reference pixels as the identity source. A local path or prompt
  mention is not reference evidence; retained bytes/hash/lineage must bind each
  derivative.
- Separate creative generation from deterministic cleanup: chroma removal,
  splitting, component filtering, common-scale normalization, anchor alignment,
  atlas assembly, GIF/PNG export and QA metadata.
- Reuse an accepted idle/run scale profile across compatible grounded actions.
  Repair one failed action/frame while retaining accepted sibling hashes.
- Model runtime maps as base, props, actors, foreground, collision, zones and
  preview. The flattened preview is QA evidence, not the authoritative runtime
  map. Collision is structured metadata, not inferred from PNG bounds.
- Deliver engine-neutral manifests first; Godot/Unity/raw 2D are delivery
  adapters. Host and engine specifics do not belong in the Kernel.

## Improvements for Cutout

- Replace prompt-only invariants and ad hoc QC JSON with a declared semantic-role
  closure and revision-bound identity/scale/anchor locks.
- Record observed frame count, decoded dimensions, alpha bounds, edge contact,
  anchor dispersion and content hashes from bytes; requested layout is intent,
  not proof.
- Make raw generations, accepted action sheets, extracted frames, scale
  profiles, maps, collision/zones and delivery atlases nodes in one provenance
  graph. Reference mockups stay planning evidence and cannot satisfy delivery.
- Freeze Profile-owned Outcome scorecards independently from Design OS evidence
  maturity. A visually good sprite does not prove Host readiness, and a verified
  Host run does not prove animation quality.
- Route every repair to failed role/frame nodes. Never regenerate accepted
  action families merely because an atlas or sibling frame failed.

## Platform implications

The Kernel needs no sprite-, direction-, animation- or map-specific branch. The
Game Asset Profile declares those schemas, required roles, constraints,
evaluators, renderers, inspectors, semantic actions and delivery descriptions.
The Platform only verifies closure, identity-lock consumption, registered
implementations, lifecycle and cross-Host meaning.
