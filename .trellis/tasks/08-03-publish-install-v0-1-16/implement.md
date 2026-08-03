# Implementation plan

## 1. Prepare release candidate

- Branch `release/v0.1.16` from the reviewed release-notes worktree.
- Synchronize all product version surfaces and release links.
- Regenerate Codex plugin runtime metadata and add the `0.1.16` changelog.

## 2. Validate candidate

- Validate exact five-locale release notes and synchronized versions.
- Run Agent/plugin, updater/release-workflow, lint/type/build, full frontend,
  Rust, provider-free local release, and diff/secret gates.
- Dispatch an independent Trellis check worker for the final candidate diff.

## 3. Merge and tag

- Commit/push the feature and release branches and merge reviewed PRs to main.
- Revalidate the exact merge commit, create annotated `v0.1.16`, and push it.

## 4. Verify publication

- Poll aggregate workflow and public Release state without babysitting logs.
- Validate asset inventory, updater manifest content/platforms/signatures,
  checksums, provenance/SBOM/metadata, and Apple Silicon DMG trust evidence.

## 5. Replace local app

- Quit Cutout and move the old app to a version-qualified Trash location.
- Install from the verified public DMG and verify version, architecture,
  codesign, Gatekeeper, stapler, and process launch origin.

## Hard stops

- Existing `v0.1.16` tag or Release, version/catalog drift, failed protected
  checks, partial platform output, signature/checksum failure, or Apple rejection.
- Any attempt to publish from or include the dirty primary workspace.

