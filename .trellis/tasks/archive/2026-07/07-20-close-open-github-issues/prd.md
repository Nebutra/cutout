# Close all open GitHub issues

## Goal

Resolve and verify all open issues in Nebutra/cutout, ordered by security and runtime dependency.

## Requirements

- Resolve open issues #1-#11 without weakening approval, provenance, path, or capability policy.
- Order work by dependency: durable effects and leases; approval/control transactions; filesystem and Tauri boundaries; governance and CI; composite receipts and coding adapters; Creative Board.
- Preserve `.cutout` Design IR and provenance as the authoritative state and generate exports from approved state only.
- Keep CLI, MCP, protocol, capabilities, schemas, manifests, docs, and tests synchronized whenever a public Agent contract changes.
- Do not claim live integrations, web search, video, cloud collaboration, or a bundled headless provider.
- Close a GitHub issue only after its acceptance criteria are implemented and verified.

## Acceptance Criteria

- [x] A durable effect never executes without a successful live node claim, and expired owners cannot complete or fail nodes.
- [x] Apply approvals are host-issued, request-bound, expiring, single-use leases shared by CLI and MCP.
- [x] Control reservation, side effect, and ledger finalization are crash-recoverable and cross-process safe.
- [x] Controlled paths and Tauri permissions fail closed under symlink/path races and capability drift.
- [x] Governance evidence is attributed to measured scenarios and native/package CI gates regressions.
- [x] Composite delivery receipts and bounded coding adapters use one trusted execution spine.
- [x] Creative Board ships an outcome-first reference-to-delivery loop with explicit promotion and provenance.
- [x] Focused tests, full tests, lint, build, Rust tests, `pnpm agent:validate`, and applicable packaged smoke checks pass.

## Verification Evidence

- Full Vitest: 323 files passed, 1501 tests passed, 6 files/15 tests skipped.
- Focused control/security suite: 14 files passed, 84 tests passed, 1 skipped.
- Rust command suite: 92 tests passed; `cargo check --locked` passed.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`,
  `pnpm agent:validate`, and `pnpm plugin:validate` passed.
- The Codex plugin runtime was rebuilt from 82 source modules and validated
  against its source fingerprints.
- Packaged macOS launch is enforced in release CI for the host-native matrix
  artifact. It was not run locally because no release bundle was produced in
  this verification session; signing/notarization remains a separate claim.
- Distribution evidence is tracked by child task
  `07-20-packaged-release-smoke-evidence`; this task does not claim that
  signing, notarization, or a generated release bundle was verified locally.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
