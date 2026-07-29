# ImageMagick slicing evaluation

Date: 2026-07-29

## Decision

Reject ImageMagick as a production slicing dependency for the tested white-board
pipeline. Keep Cutout's browser implementation. The ImageMagick-only branch
preserves six spatial assets but degrades soft-alpha behavior. The conservative
hybrid does not produce an inspectable quality gain.

## Reproduction

Homebrew ImageMagick 7 was already installed locally but was not linked on
`PATH`; the experiment invoked its absolute path and left it unlinked. No
package, application, Tauri, Agent, or capability manifest was changed.

```bash
CUTOUT_EFFECT_BOARD_3X2=test-results/cutout-effect-e2e/source-board.png \
  CUTOUT_EFFECT_OUTPUT_DIR=test-results/cutout-effect-e2e \
  pnpm exec playwright test tests/visual/cutout-effect-evaluation.spec.ts \
  --project=desktop-chrome

IMAGEMAGICK_BIN=/opt/homebrew/opt/imagemagick/bin/magick \
  node scripts/benchmark-imagemagick-slicing.mjs
```

Detected tool: `ImageMagick 7.1.2-29 Q16-HDRI aarch64`. The generated
`test-results/imagemagick-slicing/metrics.json` records every ImageMagick argv
array, version, component, crop box, slice metric, runtime, and evidence path.
The script invokes the executable directly with `spawnSync` and `shell: false`.

## Results

| Metric | Cutout baseline | ImageMagick-only | Hybrid |
|---|---:|---:|---:|
| Semantic slots | 6/6 | 6/6 | 6/6 |
| Observed operation runtime (one sample) | 221.60 ms | 4817.10 ms | 538.26 ms |
| Output PNG bytes | 1,740,574 | 1,962,021 | 1,347,777 |
| Mean partial-alpha ratio | 0.026302 | 0 | 0.026004 |
| Mean bright-neutral opaque ratio | 0.037917 | 0.043500 | 0.037917 |
| Common-canvas white-recomposition MAE | 3.167640 | 3.190110 | 3.182634 |
| Crop-edge foreground pixels | 0 | 0 | 0 |

Runtime is one local operation-boundary sample, not Playwright wall time. The
Cutout number measures one in-browser `sliceRegionBoardBitmap` call, while the
ImageMagick-only and hybrid numbers include nine and six sequential native
process launches respectively, plus their PNG reads and writes. The observed
values describe this script's implementation boundary; they do not establish a
backend-independent speed ratio or predict a persistent native integration.

## Failure classes

- **Semantic coverage:** unchanged. All variants preserve six unique 3x2
  spatial slots. ImageMagick's connected components produce slightly different
  boxes but no lost, merged, or split expected asset on this fixture.
- **Crop-edge safety:** unchanged. All variants retain clear margins and zero
  foreground pixels on crop edges.
- **Soft and irregular edges:** regressed by ImageMagick-only. Border flood fill
  produces binary alpha (`partialAlphaRatio = 0`), visibly hardening pale and
  thin contours on the dark sheet.
- **Soft shadow / exterior haze:** regressed by ImageMagick-only. The bottle
  slot's bright-neutral opaque ratio rises from `0.000366` to `0.020203`, and
  its shadow is visibly opaque on dark.
- **White recomposition:** measured on one common source-sized canvas so crop
  size differences do not change the denominator. Error rises slightly from
  `3.167640` to `3.190110` for ImageMagick-only and `3.182634` for hybrid.
- **Alpha morphology:** unsolved by the hybrid. `Smooth Diamond:1` preserves
  geometry but slightly reduces partial alpha and increases recomposition error;
  the light and dark sheets show no compensating quality improvement.
- **Output size:** improved only for hybrid (22.5% smaller PNG total). This is
  encoding behavior, not a slicing-quality improvement, and does not justify a
  native dependency. The single-run runtime observation is not used as a
  general performance claim.

The combined contact sheets are ordered top-to-bottom as Cutout baseline,
ImageMagick-only, and hybrid. Light and dark variants plus processed alpha masks
are written under `test-results/imagemagick-slicing/` and remain ignored build
evidence rather than product assets.

ImageMagick's generated PNGs exclude timestamp chunks and stripped incidental
metadata. Two consecutive benchmark runs produced byte-identical contact
sheets and sampled pipeline PNGs; timing fields are expected to vary. The
machine-readable report hashes the source board, baseline metrics, and all six
baseline slices so a rerun can establish that it used the same inputs.
