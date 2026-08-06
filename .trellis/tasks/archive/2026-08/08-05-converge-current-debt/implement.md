# Converge current production debt - implementation plan

## 1. Establish evidence and remove dead surface

- [x] Map orchestration, generation boundary, progress projection and delivery
      readiness from current source/tests.
- [x] Remove `SessionService`, `useSession`, `sessionKeys`, local implementation
      and registry wiring; update focused tests/types.
- [x] Replace generic frontend spec placeholders with repository-backed rules.

Validation: focused service/context tests, `pnpm typecheck`, spec placeholder scan.
Rollback point: cleanup-only diff.

## 2. Bound and expose production work

- [x] Add stage/unit progress evidence and UI projection.
- [x] Add shared finite request deadline, semantic retry and cancellation rules.
- [x] Add terminal stalled diagnostics without persisting secrets or inventing
      completion.
- [x] Test progress monotonicity, retry classification, timeout and cancellation.

Validation: focused orchestration/view-model/component tests, lint, typecheck.
Rollback point: production-control diff independent of dependency updates.

## 3. Converge Provider behavior and complete delivery proof

- [x] Move edit eligibility/optional request fields to reviewed capability
      evidence and implement the `input_fidelity` conformance fallback.
- [x] Narrow Tool Gate blocking to requests that truly need clarification or
      approval.
- [x] Extend the deterministic pipeline E2E through real image decode,
      deconstruction/slicing and final package/provenance assertions.
- [x] Improve opt-in real-model diagnostics and update experiment documentation
      only with evidence actually executed.

Validation: Provider contract tests, complete pipeline E2E, `pnpm agent:validate`.
Rollback point: Provider changes isolated from core progress state.

## 4. Dependency and integration verification

- [x] Resolve `undici` and `postcss` alerts through compatible dependency
      resolution and record lockfile evidence.
- [x] Evaluate the Tauri/GTK `glib` chain against macOS/Linux/Windows matrices;
      upgrade safely or record the exact upstream-only exception.
- [x] Run full frontend, Rust, Playwright, agent, i18n, release and audit gates.
- [x] Review for stale TODO/WIP/legacy markers and verify the final worktree diff.

Validation: repository quality commands and CI-equivalent target matrices.

## Final review gate

- [x] Every PRD acceptance criterion has direct test or documented external
      evidence.
- [x] No live-provider, Figma sync, web fetching, video, cloud or headless
      capability is claimed without proof.
- [x] Commit on `main` only after all required local checks pass.
