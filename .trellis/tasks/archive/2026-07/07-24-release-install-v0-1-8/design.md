# Design: Cutout v0.1.8 release and local replacement

## Release Boundary

The troubleshooting UX lands through a reviewed PR first. A separate release
commit owns synchronized version and changelog changes. CI validates the final
main-line tag, runs the reusable quality gate, builds four native targets,
signs updater artifacts, signs/notarizes macOS, verifies intentionally unsigned
Windows installers, and publishes only after the complete matrix is available.

## Version Flow

1. Merge the UX branch to `main` after required checks.
2. Rebase this release branch onto the reviewed merge commit.
3. Change human-authored version sources and README/changelog references.
4. Run `pnpm plugin:build` to regenerate plugin runtime data and fingerprints.
5. Validate `0.1.8` locally and commit the release preparation.
6. Merge the release PR to `main`, then create annotated tag `v0.1.8` on that
   merge commit and push it once.
7. Monitor `Build and Release Cutout` until the public Release and complete
   asset set exist.

## Installation Flow

1. Download `SHA256SUMS` and the Apple Silicon DMG from the public release into
   a fresh temporary directory.
2. Verify the DMG SHA-256 and notarization ticket before touching the installed
   application.
3. Quit any running Cutout process using CLI process control only.
4. Move `/Applications/Cutout.app` to a recoverable backup, mount the verified
   DMG, and copy the new app into `/Applications`.
5. Verify version/build, ARM64 architecture, Developer ID chain, Gatekeeper
   acceptance, and stapled ticket before treating installation as complete.

## Data Safety And Rollback

- Do not modify Application Support, IndexedDB, credentials, project
  repositories, or `.cutout` data.
- Retain the old application bundle until the new installation passes every
  verification command.
- If installation verification fails, remove only the failed new bundle and
  restore the old application bundle; never alter user data.

## Compatibility

- Windows NSIS/MSI remain intentionally unsigned with Authenticode; updater
  signatures and release provenance remain mandatory.
- No CLI, MCP, protocol, updater-policy, or release-workflow behavior changes
  are included. Only version surfaces, generated plugin receipts, and release
  notes change after the already reviewed UX fix.
