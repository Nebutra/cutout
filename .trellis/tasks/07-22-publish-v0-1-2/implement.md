# Implementation Plan

- [x] Independently review the release/notarization diff and resolve blockers.
- [x] Run focused release workflow and updater contract tests.
- [x] Commit-ready the existing reviewed release pipeline changes without unrelated
  worktree files.
- [x] Update all owned version surfaces and changelog to `0.1.2`.
- [x] Regenerate and validate the Codex plugin runtime.
- [x] Run Agent validation, lint, TypeScript, production build, Rust tests/check,
  release version validation, and `git diff --check`.
- [ ] Commit the version release changes and push `main` to `github`.
- [ ] Verify remote main SHA, create annotated tag `v0.1.2`, and push the tag.
- [ ] Monitor the release workflow and inspect failed logs when necessary.
- [ ] Verify the public Release state and required asset inventory.

## Rollback Points

- Before tag push: amend with ordinary follow-up commits and rerun validation.
- After tag push: rerun only external/credential failures against unchanged
  source; never force-move the tag or replace immutable assets.
