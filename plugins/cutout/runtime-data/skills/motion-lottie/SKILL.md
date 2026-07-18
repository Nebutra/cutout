---
name: motion-lottie
description: Import, validate, preview, author, and export supported Motion IR and Lottie animation deliverables with reduced-motion and web-render evidence.
---

# Motion And Lottie

## Outcome

Deliver an inspectable motion asset tied to the current Design IR revision.
Keep animation structure, timing, asset references and quality evidence explicit.

## Operating Contract

Status: `internal-only`.
Operations: none exposed.
MCP tools: none exposed.
Never claim arbitrary video or After Effects compatibility.

Read [references/contract.md](references/contract.md) before claiming an artifact.
Read [../shared/references/safety.md](../shared/references/safety.md) before side effects.

## Workflow

### 1. Bind source evidence

Record DesignDocument id, revision, material references, and component references.
Visual generation may provide style references but not motion structure.

### 2. Inventory input

Validate Lottie JSON shape, version, dimensions, duration, frame rate, layers,
assets, fonts, markers, effects, masks, expressions, 3D, and external paths.

### 3. Resolve supported subset

Accept shape, null, and precomp layers with position, scale, rotation, and
opacity tracks. Block unsupported effects instead of flattening silently.

### 4. Build Motion IR

Create timelines, layers, keyframes, easing, markers, triggers, asset refs, and
a reduced-motion strategy in `motion-ir.v1`.

### 5. Preview

Use the deterministic SVG web renderer with autoplay disabled. Timeline detail
belongs in Inspector; the normal Deliverables view shows result, duration,
status, thumbnail, and reduced-motion readiness.

### 6. Verify and export

Run schema, duration, bounds, blank-frame, reduced-motion, and web-render
screenshot gates. Export Lottie JSON only for the supported subset.

## Required Inputs

- Current Design IR id and revision
- Lottie JSON or explicit Motion IR authoring intent
- Referenced assets with SHA-256 and media type
- Reduced-motion decision

## Deliverables

- `motion-ir.v1` document
- Lottie feature inventory
- Preview plan
- Supported-subset Lottie JSON
- Web runtime consumer receipt
- Render screenshot hash and quality gates

## Approval Rules

Preview mutations and exports before apply.
Require approval for paid style-reference generation.
Invalidate approval after source revision or timing changes.

## Completion Gate

Require valid duration and layer bounds.
Require no unresolved asset, component, material, marker, or trigger references.
Require a reduced-motion strategy and verified web screenshot.
Do not mark blocked Lottie features as delivered.

## Limitations

- No expressions, masks, effects, 3D layers, fonts, or unsafe external paths
- No lossless After Effects project conversion
- No visual-generation model may invent keyframe structure as verified fact
- Image layers require an explicit embedded-asset adapter before export

## User Experience

Show motion as a normal deliverable with preview and status.
Keep timeline and keyframe details in the selection Inspector.
Ask users only about direction, trigger, loop, and reduced-motion outcome.

## Failure Handling

Return a sorted unsupported-feature inventory.
Preserve the source animation and previous valid Motion IR revision.
Never expose raw file paths, fonts, credentials, or provider errors.
