# Design - Publish Cutout v0.1.3 After v0.1.2 Gate Failure

## Release Boundary

The release is built only from the reviewed commit referenced by annotated tag
`v0.1.3`. The tag-triggered workflow validates that `package.json`,
`src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` all equal `0.1.3` before
starting native builds.

Protected credentials remain in the GitHub `release` Environment. Build jobs
scope updater signing inputs only to exact commit-pinned Tauri actions on every
platform and Apple inputs only to macOS. Each matrix job verifies its generated
updater sidecar against the public key before upload. The publish job receives
repository write permission and public distribution configuration, but no
private signing material.

Tauri notarizes and staples the app before it creates the signed DMG. Release
CI therefore submits the completed DMG separately with `notarytool --wait`,
staples the accepted ticket, and only then runs Gatekeeper and stapler
validation over both artifacts.

With `bundle.createUpdaterArtifacts: true`, Tauri v2 signs the native NSIS
`.exe` and Linux `.AppImage`; legacy `.nsis.zip` and `.AppImage.tar.gz` outputs
require the intentionally unused `"v1Compatible"` mode. Verification,
collection, and manifest generation therefore share the native v2 suffixes.

## Commit And Trigger Flow

1. Commit the reviewed signing/notarization workflow and contract documentation.
2. Commit the synchronized `0.1.3` version bump, changelog, and regenerated
   plugin runtime.
3. Push main and verify its remote SHA.
4. Create one annotated `v0.1.3` tag at that SHA and push it to `github`.
5. Monitor the tag-triggered workflow until the Release is public.

## Failure Policy

Before tagging, fix and recommit any local or main-branch validation failure.
After tagging, do not move the tag or overwrite Release assets. Credential or
runner failures may be rerun against the same immutable tag when source is
unchanged. The `v0.1.2` DMG notarization defect is a source failure, so recovery
uses `v0.1.3`; neither the failed tag nor any assets are replaced.

## Release Evidence

- Source commit: `672dd63d0133b60021ad62572ce77ed58cb1734e`
- Annotated tag: `v0.1.3`
- Workflow run: `29893926338`
- Result: all four native builds and the GitHub Release job succeeded
- Public Release: https://github.com/Nebutra/cutout/releases/tag/v0.1.3
- Published inventory includes macOS arm64/x86_64 DMGs and signed updater
  archives, Windows NSIS/MSI installers, Linux AppImage/deb installers,
  `latest.json`, checksums, provenance, SBOM, rollout, and rollback metadata.
