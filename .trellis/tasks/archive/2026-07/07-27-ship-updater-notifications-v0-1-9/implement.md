# Implementation plan

1. Implement and test a lifecycle-aware update-check scheduler plus six-hour
   orchestrator gating and single-flight behavior.
2. Extend local notifications for update source/action metadata, implement
   per-version dedupe, stale replacement, 24-hour deferral, and opt-in native
   system notification delivery with Tauri notification permissions.
3. Wire both modules to the AppShell-owned update controller and update the
   Settings/Home surfaces without duplicating updater ownership.
4. Cherry-pick the About footer product commit `6286537`, resolve against latest
   `github/main`, and add/retain focused coverage.
5. Extract and translate every new updater message in all shipped Lingui
   catalogs, then run `pnpm i18n:ci`.
6. Run focused tests, lint, full build, full unit tests, Rust fmt/check/tests,
   Agent/plugin validation, release contract tests, and targeted visual tests.
7. Update the executable release-pipeline spec with the new scheduling and
   notification contracts.
8. Commit feature work, push the feature branch, open/review/merge a PR, and
   update the clean integration worktree from `github/main`.
9. Create `release/v0.1.9`, synchronize version/changelog/README/plugin outputs,
   validate release gates, commit, push, open/review/merge the release PR, tag
   the reviewed main merge, and push the tag.
10. Verify the public asset inventory and updater metadata, install the verified
   Apple Silicon DMG with a recoverable previous-app backup, and validate
   version, signature, Gatekeeper, stapler, architecture, and launch path.

## Rollback Points

- Do not merge feature work if scheduler/notification tests or trust-boundary
  checks fail.
- Do not create a tag until the release PR is merged and source versions match.
- Do not replace the local app until the public DMG checksum and notarization
  evidence pass.
- Preserve the previous signed app until the installed `0.1.9` verifies.
