# Implementation plan

## 1. Validate candidate

- Confirm clean status, ancestry from current `github/main`, absent tag/Release,
  synchronized version, and exact five-locale release notes.
- Run Agent/plugin, release-workflow/updater, lint/type/build, frontend/native,
  provider-free macOS release, diff, and secret gates required by the release
  checklist.
- Run an independent Trellis check on the exact candidate delta.

## 2. Merge and tag

- Push `release/v0.1.19-rc` to GitHub and create/update its PR to `main`.
- Wait for required PR checks and merge without rewriting candidate commits.
- Fetch remote `main`; validate source/tag version and ancestry at the resulting
  merge commit.
- Create annotated `v0.1.19` at that commit and push the tag exactly once.

## 3. Publish and verify

- Bind the release run to the exact tag SHA and approve only its pending
  protected-environment deployment when required.
- Wait for the aggregate workflow to complete successfully and the stable
  Release to become public.
- Validate asset inventory, `latest.json`, all four updater signatures and
  platform keys, checksums, SBOM/metadata/provenance, and release notes.
- Download and verify the Apple Silicon DMG and mounted app independently.

## 4. Replace local app

- Quit Cutout and move the old bundle to a unique recoverable Trash path.
- Install the verified app, detach the DMG, launch it, and verify version,
  architecture, Developer ID, Gatekeeper, stapler, and executable origin.
- Record exact public workflow, Release, artifact, and installation evidence.

## Hard stops

- Existing `v0.1.19` tag/Release, dirty or diverged candidate, version/catalog
  drift, failed required check, wrong deployment SHA, partial platform output,
  signature/checksum mismatch, Apple rejection, or failed public evidence.
