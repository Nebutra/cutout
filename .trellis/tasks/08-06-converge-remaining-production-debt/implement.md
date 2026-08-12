# Converge remaining production debt - implementation plan

## 1. Provider strategy convergence

- [x] Introduce one closed image transport strategy registry and use it from
      route assessment, capability projection and desktop execution.
- [x] Wire Google observed/verified edit routes to reference-conditioned
      multimodal generation with all locked image inputs.
- [x] Implement native DashScope generation/edit request, polling, cancellation,
      bounded download and sanitized error contracts.
- [x] Add contract/mocked-native tests for supported and rejected route matrices,
      transient retries, cancellation, malformed payloads and secret/path leaks.
- [x] Synchronize Provider specs, registries, settings/status copy and generated
      plugin runtime; run `pnpm agent:validate` for any Agent-surface change.

Validation: focused Vitest/Rust tests, type-check, agent validation, mock server
contracts. Rollback point: Provider commits before live execution is enabled.

## 2. Real packaged asset-production proof

- [x] Split supported prototype route recommendation into explicit `configured`
      and `refinement` objectives; preserve the user's verified binding for
      normal work and use reviewed fidelity routes for bounded semantic repair,
      while preserving exact route health demotion. Keep Qwen-first scoped to
      the packaged throughput fixture rather than global product policy.
- [x] Make outline-first progressive planning the default for natural intent,
      reserve monolithic planning for explicit one-to-three-page scope, retain
      bounded stage checkpoints, and close Planner deadline evidence as
      `planner-timeout` across renderer/native/validator layers.
- [ ] Build the release-equivalent packaged app and run it in a controlled
      background session without foreground activation.
- [ ] Exercise automatic local credential discovery and one real planning/image
      Provider through product UI/native boundaries.
- [ ] Submit a natural-language asset brief and wait for the Agent-authored plan,
      all route pages, reusable assets/slices and resource packs.
- [ ] Verify output bytes, dimensions, hashes, provenance, plan completeness and
      non-duplication; retain a sanitized timing/evidence bundle.
- [ ] Fix every reproduced transport, orchestration, state, fidelity or progress
      defect and rerun until the same complete outcome passes.

Validation: packaged lifecycle smoke, artifact validator, screenshot/contact-sheet
inspection and evidence redaction scan. Rollback point: no capability flag changes
until a successful signed/release-equivalent proof exists.

## 3. Documentation, compatibility and advisory cleanup

- [x] Correct the MCP/CLI operation count and Motion IR gap statement.
- [x] Remove the duplicate governance finding/report schema and route all
      consumers through standards contracts.
- [x] Remove updater single-primary input/output compatibility fields while
      retaining active multi-platform OTA compatibility and tests.
- [x] Add reproducible Rust advisory validation and document only the exact
      upstream GTK/GLib exception.
- [x] Rescan shipping source for TODO/FIXME/WIP and obsolete compatibility names.

Validation: governance/headless tests, updater fixture/consumer tests, audits,
documentation/contract drift checks and `git diff --check`.

## 4. Full quality gate

- [x] Run lint, TypeScript build, complete Vitest, production bundle, Rust tests,
      `cargo check`/format, desktop/mobile Playwright, i18n, release contracts,
      audits and `pnpm agent:validate`.
- [ ] Run available macOS packaged checks and verify GitHub Linux/Windows/macOS
      jobs against the exact candidate commit.
- [ ] Review the final diff for secret exposure, weakened approvals, arbitrary
      paths, false capability claims and generated runtime drift.

## 5. Release and local update

- [ ] Synchronize the next patch version across package/Tauri/Cargo/Agent/plugin,
      add all-locale release notes and changelog, and rerun release validation.
- [ ] Commit directly on `main`, push to GitHub `main`, create the matching tag
      and monitor the complete release workflow.
- [ ] Verify notarization/stapling, updater signatures, all four platform entries,
      checksums, SBOM, provenance and attestations before publication.
- [ ] Install the verified macOS release, launch it, and confirm bundle/displayed
      version and updater health.

## Final gate

- [ ] Every PRD acceptance criterion has direct evidence.
- [ ] No incomplete real run, skipped required native matrix or unresolved
      actionable advisory is represented as complete.
- [ ] The public release and installed app resolve to the exact reviewed commit.
