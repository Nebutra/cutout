# Design - Cutout v0.1.12 release and local replacement

## Release Boundary

Prepare `release/v0.1.12` from the current protected `github/main`. Keep the
user's dirty local `main` worktree untouched and perform all source changes,
checks, and release bookkeeping in isolated worktrees.

## Version Contract

Advance the product version from `0.1.11` to `0.1.12` in every surface consumed
by `scripts/validate-release-version.mjs`, then rebuild the generated Codex
plugin runtime. Protocol identifiers remain unchanged. Release notes describe
the outcome-led AI setup UX and do not reintroduce the removed 39-Agent default
inventory as a user-facing feature.

## Publication Flow

1. Update version surfaces, changelog, and README badges/text.
2. Run the local release, Agent, frontend, native, and diff gates.
3. Merge the release PR through protected checks.
4. Create and push annotated tag `v0.1.12` at the release merge commit.
5. Let the tag workflow run the exact reusable quality gate, four native builds,
   Apple signing/notarization, Tauri updater signing, attestation, and atomic
   Release publication.
6. Download and verify public release metadata plus the Apple Silicon DMG.
7. Quit Cutout, move the old bundle to a versioned Trash path, mount the verified
   DMG, copy the new bundle to `/Applications`, and validate/launch it.

## Failure And Rollback Boundary

- Before tagging, fix failures on the release branch and repeat protected checks.
- After tagging, never move or reuse `v0.1.12`; if the immutable release fails,
  stop and prepare a new patch version.
- Do not alter the local installation until the public Release and downloaded
  artifact evidence pass.
- If installation or launch validation fails, restore the preserved `0.1.11`
  application bundle from Trash and report the failed evidence.
- User data under Application Support, IndexedDB, project workspaces, settings,
  and Keychain are outside the replacement boundary and remain untouched.
