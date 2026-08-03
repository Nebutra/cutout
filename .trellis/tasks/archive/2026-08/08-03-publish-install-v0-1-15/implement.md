# Implementation plan

## 1. Prepare release source

- Update every synchronized version surface and the two README release links.
- Add the `0.1.15` changelog entry describing only the reviewed convergence.
- Regenerate Codex plugin runtime metadata and inspect the exact diff.

## 2. Validate release candidate

- Run version, Agent/plugin, release-workflow, updater-artifact, lint,
  TypeScript/build, Rust, local packaged release, and diff gates.
- Confirm no secret, generated key, updater private key, or dirty-primary file
  entered the release branch.

## 3. Merge and tag

- Commit the release candidate and Trellis planning artifacts.
- Push `release/v0.1.15`, create a PR to `main`, and wait for every required
  check before normal merge.
- Fetch the merge commit, revalidate its versions, create annotated
  `v0.1.15`, and push the immutable tag.

## 4. Verify publication

- Monitor the tag-triggered release workflow through validate, quality, four
  platform builds, and publish.
- Confirm Release state and asset inventory; download `latest.json`,
  `SHA256SUMS`, provenance/metadata/SBOM, and the Apple Silicon DMG.
- Validate updater platform entries, URLs, signatures, checksums, and DMG
  notarization evidence.

## 5. Replace local app

- Quit all running Cutout processes.
- Move `/Applications/Cutout.app` to a unique version-qualified Trash path.
- Mount the verified DMG, copy `Cutout.app` to `/Applications`, unmount, and
  verify bundle version, architecture, codesign, Gatekeeper, and stapler.
- Launch the installed app and confirm its process originates from the new
  `/Applications` bundle.

## Hard stops

- A pre-existing `v0.1.15` tag or Release.
- Version drift, generated-runtime drift, protected-check failure, partial
  platform output, updater-signature failure, or Apple rejection.
- Any attempt to publish from or overwrite the dirty primary workspace.
- Any installation artifact whose public checksum or trust evidence fails.

## Candidate verification

- Version identity is synchronized at `0.1.15`; plugin regeneration has no
  unexplained drift and Agent validation reports 20 operations, 36 MCP tools,
  20 product Skills, and 168 bundled modules.
- Release/update/workflow coverage passes: 52 tests across eight files.
- Full Vitest passes: 1,935 tests passed and 15 skipped across 367 passing
  files, with six expected skipped files.
- `pnpm lint`, TypeScript/production build, and the frontend bundle gate pass;
  entry JavaScript is 406.9 KiB and total JavaScript is 2,950.0 KiB.
- Rust formatting/check pass; Rust tests report 185 passed and one expected
  platform-gated ignored test.
- The provider-free local release gate passes and truthfully makes no signing
  or notarization claim. Actual distribution evidence remains owned by the
  protected tag workflow.
