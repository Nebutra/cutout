# Design

## Boundary

The experiment is a developer benchmark, not a production backend. It consumes
the existing `test-results/cutout-effect-e2e/source-board.png` and its Cutout
metrics, invokes a pinned/local ImageMagick 7 executable with fixed argument
arrays, and writes evidence under an ignored test-results directory.

## Compared Pipelines

1. **Cutout baseline**: the existing Playwright effect evaluation and its six
   PNG slices.
2. **ImageMagick-only**: border-connected fuzzy white removal, connected
   component measurement, padded crops, and deterministic PNG output.
3. **Hybrid post-process**: preserve Cutout's semantic boxes and flood-fill
   decisions, then apply a conservative alpha morphology/edge operation to
   copies of the six slices.

The benchmark must keep variants separate. It must not silently use an
ImageMagick result as production truth.

## Evidence

The report records:

- ImageMagick version and command arguments;
- elapsed time and output byte counts;
- connected-component count and boxes;
- per-slice alpha occupancy, partial alpha, foreground on crop edges, clear
  margin, bright neutral opacity, and white recomposition error;
- light/dark contact sheets and the processed alpha mask.

The existing source board and expected six spatial slots provide the semantic
oracle. Objective pixel metrics are secondary to complete asset coverage.

## Security And Portability

- Use `spawnSync`/`execFileSync` with argument arrays, never `exec` or a shell.
- Resolve `magick` from an explicit environment override or `PATH`.
- Use a dedicated output directory and validate required input files.
- Do not add ImageMagick to app manifests, Tauri sidecars, capabilities, or CI.
- Include the exact detected version so results cannot be mistaken for a
  version-independent guarantee.

## Decision Rule

Recommend production adoption only if a targeted operation improves a measured
failure without reducing six-of-six asset coverage, increasing halo/recompose
error materially, or requiring broad heuristic retuning. Otherwise retain the
current pipeline and use ImageMagick only as a benchmark oracle or reject it.
