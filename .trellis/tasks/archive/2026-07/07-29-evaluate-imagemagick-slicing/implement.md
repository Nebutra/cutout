# Implementation Plan

1. Generate a fresh Cutout baseline with the existing effect Playwright test.
2. Make ImageMagick 7 available locally without changing application manifests.
3. Add a bounded benchmark script with fixed command arguments and machine-
   readable output.
4. Run ImageMagick-only and hybrid variants against the exact baseline board.
5. Inspect all contact sheets and compare objective metrics.
6. Write the evidence-backed recommendation into task research notes.
7. Run targeted lint/tests and a Trellis quality review.

## Validation

```bash
pnpm exec playwright test tests/visual/cutout-effect-evaluation.spec.ts --project=desktop-chrome
node scripts/benchmark-imagemagick-slicing.mjs
pnpm exec oxlint scripts/benchmark-imagemagick-slicing.mjs
git diff --check
```

## Rollback

The benchmark is isolated from product code. Remove the script and task-owned
research artifacts; generated test-results remain ignored.
