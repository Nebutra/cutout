# Design: Cutout v0.1.6 release and local replacement

## Release Boundary

The source commit owns the version and changelog. CI validates the tag against
the synchronized source, runs the reusable quality gate, builds four native
targets, signs updater artifacts, signs/notarizes macOS, verifies intentionally
unsigned Windows installers, and publishes only after the complete matrix is
available.

## Version Flow

1. Change the human-authored version sources and README/changelog references.
2. Run `pnpm plugin:build` to regenerate plugin runtime data and fingerprints.
3. Validate `0.1.6` locally and commit the reviewed release preparation.
4. Merge the release PR to `main` after required checks.
5. Create annotated tag `v0.1.6` on the merge commit and push it once.
6. Monitor `Build and Release Cutout` until the public Release and complete
   asset set exist.

## Installation Flow

1. Download `SHA256SUMS` and the Apple Silicon DMG into a fresh temporary
   directory.
2. Verify the DMG SHA-256 and notarization ticket before touching the installed
   app.
3. Quit any running Cutout process.
4. Move the old `/Applications/Cutout.app` bundle aside, mount the verified DMG,
   and copy the new app into `/Applications`.
5. Verify the installed version, signature chain, Gatekeeper acceptance, and
   stapled ticket. Remove the old bundle only after the new installation passes.

## Data Safety And Rollback

- Do not modify `~/Library/Application Support`, IndexedDB, Keychain, project
  repositories, or `.cutout` data.
- Keep the old app bundle recoverable until the new bundle passes verification.
- If installation verification fails, remove the failed new bundle and restore
  the old signed bundle; do not alter user data.
