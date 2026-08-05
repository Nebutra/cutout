# Implementation plan

## 1. Prepare release candidate

- Synchronize all product version surfaces and release links to `0.1.17`.
- Add the exact five-locale `0.1.17` release-note entry and changelog summary.
- Regenerate Codex plugin runtime metadata.

## 2. Validate candidate

- Validate exact five-locale release notes and synchronized versions.
- Run Agent/plugin, updater/release-workflow, lint/type/build, full frontend,
  Rust, provider-free local release, diff, and secret gates.
- Run an independent Trellis check against the final candidate diff.

## 3. Merge and tag

- Commit and push `release/v0.1.17`; merge its reviewed PR to protected `main`.
- Revalidate the exact merge commit, create annotated `v0.1.17`, and push it.

## 4. Approve and verify publication

- Confirm the release run is bound to `v0.1.17` and the reviewed main SHA.
- Approve the protected `release` environment deployment for that run only.
- Poll aggregate workflow and public Release state through completion.
- Validate assets, updater platforms/signatures, localized notes, checksums,
  provenance/SBOM/metadata, and Apple Silicon DMG trust evidence.

## 5. Replace local app

- Quit Cutout and move the old app to a version-qualified Trash location.
- Install from the verified public DMG and verify version, architecture,
  codesign, Gatekeeper, stapler, and process launch origin.

## Hard stops

- Existing `v0.1.17` tag or Release, version/catalog drift, failed protected
  checks, wrong pending-deployment SHA, partial platform output,
  signature/checksum failure, or Apple rejection.
- Any attempt to publish from or include the dirty primary workspace.
