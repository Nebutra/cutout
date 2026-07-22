# Implementation Plan

- [x] Independently review the release/notarization diff and resolve blockers.
- [x] Run focused release workflow and updater contract tests.
- [x] Commit-ready the existing reviewed release pipeline changes without unrelated
  worktree files.
- [x] Update all owned version surfaces and changelog to `0.1.2`.
- [x] Regenerate and validate the Codex plugin runtime.
- [x] Run Agent validation, lint, TypeScript, production build, Rust tests/check,
  release version validation, and `git diff --check`.
- [x] Commit the version release changes and push `main` to `github`.
- [x] Verify remote main SHA, create annotated tag `v0.1.2`, and push the tag.
- [x] Inspect the failed `v0.1.2` workflow and identify the missing post-build
  DMG notarization step plus stale Windows/Linux legacy updater suffixes.
- [x] Add explicit DMG notarization/stapling, synchronize `0.1.3`, and rerun the
  complete quality gate.
- [x] Commit and push the `v0.1.3` source fix, then create and push annotated tag
  `v0.1.3`.
- [x] Monitor the `v0.1.3` release workflow and inspect failed logs when
  necessary.
- [x] Verify the public Release state and required asset inventory.

## Rollback Points

- Before tag push: amend with ordinary follow-up commits and rerun validation.
- After tag push: rerun only external/credential failures against unchanged
  source; never force-move the tag or replace immutable assets.
