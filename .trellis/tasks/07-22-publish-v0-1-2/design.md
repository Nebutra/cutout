# Design - Publish Cutout v0.1.2

## Release Boundary

The release is built only from the reviewed commit referenced by annotated tag
`v0.1.2`. The tag-triggered workflow validates that `package.json`,
`src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` all equal `0.1.2` before
starting native builds.

Protected credentials remain in the GitHub `release` Environment. Build jobs
scope updater signing inputs only to exact commit-pinned Tauri actions on every
platform and Apple inputs only to macOS. Each matrix job verifies its generated
updater sidecar against the public key before upload. The publish job receives
repository write permission and public distribution configuration, but no
private signing material.

## Commit And Trigger Flow

1. Commit the reviewed signing/notarization workflow and contract documentation.
2. Commit the synchronized `0.1.2` version bump, changelog, and regenerated
   plugin runtime.
3. Push main and verify its remote SHA.
4. Create one annotated `v0.1.2` tag at that SHA and push it to `github`.
5. Monitor the tag-triggered workflow until the Release is public.

## Failure Policy

Before tagging, fix and recommit any local or main-branch validation failure.
After tagging, do not move the tag or overwrite Release assets. Credential or
runner failures may be rerun against the same immutable tag when source is
unchanged. Source fixes require `v0.1.3` or a later version.
