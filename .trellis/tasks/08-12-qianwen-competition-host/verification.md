# Verification

## Current Host Rehearsal

- Host version: `1.0.1`.
- Held-out DashScope run completed in `807527ms` with exactly eleven published
  outputs and internal A1-A7 closure.
- Offline completed-output digest:
  `d76d9e261384273c15370796495af25ae93d930f6f063d147f8955a843c0bd6d`.
- Six of six images decoded at `1024 x 1024`; manual review preserved the
  supplied purple SKU, loose silhouette, collar, button, cuff, material, and
  sibling identity across main/detail roles.
- `product_video.mp4` decoded end to end as H.264/yuv420p, `1440 x 1440`,
  30fps, 150 frames, `5039ms`, with AAC audio. Five timeline samples preserved
  product and wearer identity without color, construction, or temporal drift.
- The three localized documents bind exact physical filenames to the shared
  post-QA semantic-role contract. Free-form model descriptions of future media
  are rejected.

## Negative Controls

- A pre-fix real run passed physical closure but its model-authored media text
  described scenes absent from delivered bytes. The current validator rejects
  that output, and the Host now projects media inventory only after QA.
- A current-code rehearsal lost transport during a paid image POST. The Host
  retained accepted siblings, published no official output, persisted
  `submit-intent`, and refused a cross-process retry that could duplicate spend.

## Quality Gates

- Package tests: 19/19 on macOS and Debian 12 amd64 / Node 22.23.2.
- Package validator: 17 files, dependency-free runtime, canonical projection
  hashes current.
- Commerce/Design OS/Multimodal tests: 70/70.
- `pnpm lint`, strict TypeScript, `pnpm build`, `cargo check`,
  `cargo fmt --check`, `pnpm agent:validate`, and `git diff --check` passed.

## Benchmark Boundary

The competition Host rehearsal proves this package, not the public Cutout
headless surface. It has no canonical signed `.cutout` source-ingest and
Provider receipt bundle, so it is not imported as a trusted Commerce production
rehearsal. Design OS correctly remains `8/17`, maturity `conformance`, and
`productionReady=false` until that separate signed evidence path completes.
