# Verification

## Current Host Rehearsal

- Host version: `1.0.2`.
- Fresh held-out DashScope Run 6 completed in `944276ms` with exactly eleven published
  outputs and internal A1-A7 closure.
- Offline completed-output digest:
  `e3ccaf41326ead168c732b3455c7768f8816f135fc61c10184921bbac47761b9`.
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

- Package tests: 26/26 on macOS and Debian 12 amd64 / Node 22.23.2.
- Package validator: 17 files, dependency-free runtime, canonical projection
  hashes current.
- Final ZIP: `qianwen-commerce-agent-1.0.2.zip`, `61652` compressed bytes,
  `203831` uncompressed file bytes, SHA-256
  `21de8f008bf4fe48f3c848d2ec7cb552c3deb2b8e5b36307e49723df8b65a4de`.
- The ZIP itself passed `--version`, 26/26 tests, and package validation from a
  read-only mount in Debian 12 amd64 / Node 22.23.2 with networking disabled.
- Commerce/Design OS/Multimodal tests: 70/70.
- `pnpm lint`, strict TypeScript, `pnpm build`, `cargo check`,
  `cargo fmt --check`, `pnpm agent:validate`, and `git diff --check` passed.

## Benchmark Boundary

The competition Host rehearsal proves this package, not the public Cutout
headless surface. It has no canonical signed `.cutout` source-ingest and
Provider receipt bundle, so it is not imported as a trusted Commerce production
rehearsal. Design OS correctly remains `5/14`, maturity `contract`, and
`productionReady=false` until that separate signed evidence path completes.
