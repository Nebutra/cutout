# Evaluate ImageMagick slicing quality

## Goal

Determine with reproducible evidence whether ImageMagick materially improves
Cutout's white-board slicing quality, and identify the narrowest useful
integration boundary before adding a native runtime dependency.

## Background

- Cutout already owns an eight-stage deterministic browser pipeline covering
  border flood fill, alpha cutting, exterior haze recovery, edge matting,
  connected components, merge/split refinement, container filtering, padding,
  and ordering.
- `tests/visual/cutout-effect-evaluation.spec.ts` exercises a realistic six-item
  board containing pale material, thin line art, glass, soft shadow, and
  irregular silhouettes and emits inspectable PNG and JSON evidence.
- Homebrew ImageMagick 7 is installed locally but is not linked on `PATH`,
  bundled, or represented as a Cutout capability.

## Requirements

- Use the existing effect benchmark as the primary fixture so the comparison
  measures the production algorithm rather than a simplified substitute.
- Compare the current Cutout result with at least one ImageMagick-only pipeline
  and one narrowly scoped ImageMagick post-processing experiment.
- Record object/slice count, bounding boxes, alpha/edge quality, white
  recomposition error, runtime, output size, tool version, and exact commands.
- Preserve the six expected semantic assets; a metric improvement that loses,
  merges, or splits an expected asset is not an improvement.
- Produce human-inspectable contact sheets on both light and dark backgrounds.
- Keep the experiment offline and deterministic. Do not call an image Provider,
  alter Agent contracts, or claim ImageMagick as a shipped Cutout capability.
- Do not change the production pipeline or Tauri bundle during this experiment.

## Acceptance Criteria

- [x] The current production benchmark passes and provides a fresh baseline.
- [x] A repeatable benchmark command runs ImageMagick against the same source.
- [x] Machine-readable comparison output and visual evidence are generated.
- [x] The report states which failure classes improve, regress, or remain
      unsolved and recommends adopt, reject, or continue experimenting.
- [x] Any checked-in script fails clearly when ImageMagick is unavailable and
      never constructs shell commands from untrusted paths.
- [x] Focused tests/lint for changed repository files pass.

## Out Of Scope

- Shipping ImageMagick inside the desktop application.
- Replacing semantic segmentation or matting models.
- Changing `.cutout` Design IR, provenance, approval, export, or Agent surfaces.
- Tuning production-owned cutout parameters from the UI or Agent.

## Notes

- User requested an experiment after reviewing the initial technical trade-off.
