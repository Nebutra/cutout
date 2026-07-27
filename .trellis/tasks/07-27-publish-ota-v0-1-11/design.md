# Design - Cutout OTA v0.1.11

## Release Boundary

Prepare `release/v0.1.11` from the reviewed feature branch, then rebase it onto
the protected PR #43 merge commit. The original dirty workspace remains
untouched.

## Version Contract

Advance every repository-owned release version from `0.1.10` to `0.1.11` and
regenerate the Codex plugin runtime from the authoritative manifest. Protocol
versions do not change.

## Publication Flow

1. Validate the release candidate locally.
2. Merge PR #43 through required checks.
3. Rebase and merge the release metadata through a protected PR.
4. Tag the immutable release merge commit as `v0.1.11`.
5. Let the tag-triggered workflow build, sign, notarize, attest, and publish.
6. Verify public assets and install the published Apple Silicon DMG locally.

## Failure Boundary

Do not bypass protected checks. Before tagging, fix failures on the release
branch. After tagging, never move or reuse the tag; use a new patch version if
the immutable release fails.
