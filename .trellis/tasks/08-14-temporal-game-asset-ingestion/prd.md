# Temporal game asset ingestion

## Goal

Turn authorized retained video into deterministic sprite frames and neutral Game
delivery while preserving exact temporal provenance and the normal Game QA gates.

## Background

- Agent Sprite Forge's `video2dsprite` is explicitly Grok-only and warns about
  softened pixels, identity drift and chroma fringes.
- Cutout has an `AuthorizedVideoHost`/`VideoReferenceExecutor` contract with frame
  timestamps and hashes, plus native multimodal video receipts. It does not yet
  provide a Game-owned retained-byte ingestion and semantic acceptance closure.
- Missing video authority must remain unavailable; frames cannot be invented from
  a fixture or reconstructed from hashes alone.

## Requirements

### R1. Authorized retained source

- Accept only a bounded supported video with an owning Host receipt and exact
  retained video bytes. Bind media type, duration, dimensions and source hash.
- Keep Provider-specific generation outside the Game Profile. Any authorized
  image-to-video route produces a normal retained video input.

### R2. Deterministic decode and sampling

- Bind decoder/version, frame timestamps, decoded frame bytes, dimensions and
  hashes in a versioned ingestion receipt.
- Select 8/16/24/48 or requested bounded frame counts deterministically from the
  observed timeline, never by fabricating or duplicating unseen frames.
- Preserve timing or explicitly derive a new playback timing policy with recorded
  resampling evidence.

### R3. Sprite processing and QA

- Route decoded frames through the same deterministic alpha/cutout, anchor, scale,
  edge and atlas evidence used by generated sprite frames.
- Treat perceptual identity drift, motion readability and loop quality as
  separately attributed semantic evidence, not deterministic facts.
- Support targeted re-sampling/reprocessing without changing the retained source.

### R4. Delivery and maturity

- Produce normal action clips/family bundles so downstream preview and engine
  adapters do not need a special video asset path.
- Contract tests cannot advance temporal maturity beyond `contract`. Real-host
  requires retained source/frames/receipts; accepted delivery additionally
  requires Game semantic acceptance.

## Acceptance Criteria

- [ ] Unsupported/unavailable Host, missing receipt/bytes, oversized video,
      duplicate/non-monotonic timestamps and altered frames fail closed.
- [ ] Identical retained video bytes and sampling policy produce identical selected
      timestamps, decoded frame hashes, processed frames and atlas.
- [ ] A real authorized video is retained and decoded with owning receipts; no mock
      or pre-extracted folder substitutes for this evidence.
- [ ] The selected frames pass deterministic Game raster QA and separately
      attributable identity/motion/loop review before accepted delivery.
- [ ] The resulting clip/family bundle is consumable by the normal runtime preview
      and neutral/engine delivery contracts without special-case authority.

## Out Of Scope

- Text-to-video Provider implementation inside Game Profile, frame interpolation,
  model-authored timestamps and claiming video conversion improves source quality.
