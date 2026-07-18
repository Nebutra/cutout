# Bug Analysis: Prototype Recovery State Divergence

## 1. Root Cause Category

- **Category**: B - Cross-Layer Contract, with an implicit-assumption component.
- **Specific cause**: React recovery used complete deliverable validation to decide visual
  existence, while Design IR reverse projection manufactured `0x0` raster dimensions. Pages
  were restored independently, so each consumer projected a different truth.

## 2. Why The First Fix Was Incomplete

1. Separating `DESIGN.md` validation from visual existence fixed one deletion path.
2. The installed app still showed a missing visual because repository normalization had
   already replaced valid dimensions with `0x0`; the first investigation stopped one layer too
   early at the component restore helper.
3. Old launches then autosaved the lossy projection, permanently removing the original visual
   bytes from the observed project record. Once bytes are gone, code can only offer explicit
   minimal regeneration, not pretend to recover the exact image.

## 3. Prevention Mechanisms

| Priority | Mechanism | Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | One artifact recovery/projection owner for canvas, outcome, and repair | Done |
| P0 | Persistence | Store raster `pixelSize` in Design IR content references | Done |
| P0 | Migration | Recover old dimensions from common raster headers | Done |
| P0 | Tests | Cover degraded docs, zeroed dimensions, IR round trip, UI health, minimal repair | Done |
| P1 | Documentation | Record the invariant in frontend state-management guidance | Done |

## 4. Systematic Expansion

- **Similar issues**: Any semantic companion file (metadata, provenance, export config) can be
  unhealthy while its binary artifact remains useful. Recovery must not conflate these axes.
- **Design improvement**: Durable content references should carry intrinsic media facts needed
  to reconstruct runtime artifacts; reverse projectors must never invent sentinel values that
  fail downstream validators.
- **Process improvement**: For persistence bugs, always trace the complete loop: source -> IR ->
  store -> restore -> UI -> autosave, then test the round trip rather than only the visible
  component.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/state-management.md`.
- [x] Added recovery, raster-header, Design IR, outcome, repair, and canvas regressions.
- [x] Verified the staged patch independently from concurrent worktree changes.
