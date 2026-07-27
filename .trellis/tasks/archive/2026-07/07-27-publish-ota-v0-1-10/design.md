# Design - Cutout OTA v0.1.10

## Release Boundary

The release candidate is prepared in `/tmp/cutout-ota-v010.KCeiKP` on
`release/v0.1.10`, based on the current `github/main` merge commit `5da7b70`.
The user's dirty local `main` is not staged, rebased, reset, or updated.

## Version Contract

Advance every repository-owned version surface changed by the previous release
from `0.1.9` to `0.1.10`. Regenerate the Codex plugin runtime with the existing
repository command so generated capability/runtime files remain derived from
the authoritative manifest. Protocol versions remain unchanged.

## Publication Flow

1. Validate the release candidate locally.
2. Merge the release metadata through a protected pull request.
3. Revalidate version identity at the merge commit.
4. Create annotated `v0.1.10` at that immutable merge commit.
5. Let the tag-triggered workflow run its complete quality gate, four native
   builds, updater metadata generation, checksums, attestations, draft upload,
   and final stable publication.
6. Verify public assets and updater metadata without mutating the Release.

## Failure And Rollback

Before tagging, failures are fixed on a new release-branch commit and reviewed
again. After the tag is pushed, the tag is never moved or reused. If the
release workflow fails after tagging, diagnose the immutable failure and use a
new patch version rather than replacing artifacts or retagging.
