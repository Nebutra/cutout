# Publish and reinstall Cutout patch release

## Goal

Publish the current reviewed Cutout changes as a new immutable public patch
release, replace the existing local installation with the verified Apple Silicon
build from that release, and launch the installed application.

## Background

- Public release `v0.1.4` already exists and points to
  `cd8fcd191c293161d1b51422fdee44a9deac8fa9`; it must not be replaced or
  retagged.
- `github/main` contains the `v0.1.4` release and subsequent release-pipeline
  hardening. The local `main` is divergent and has unrelated uncommitted work.
- Commit `3043e2706f5466cad48307e53c7aa7226c88b606` is the reviewed product change
  that is not yet present on `github/main`; it persists Agent conversation
  branches in Git-managed `.cutout/run-events.json` state.
- The protected `release` environment currently exposes the required Apple and
  Tauri updater secret names, but GitHub reports neither
  `WINDOWS_CERTIFICATE` nor `WINDOWS_CERTIFICATE_PASSWORD` at environment or
  repository scope. The current release workflow hard-fails without them.
- `/Applications/Cutout.app` is currently version `0.1.4`.

## Requirements

- Use the fresh immutable version and tag `0.1.5` / `v0.1.5`.
- Prepare the release from `github/main`, preserving its Windows quality-gate
  fixes, and include the reviewed Agent conversation branch persistence change.
- Keep package, Tauri, Cargo, Agent capability, Codex plugin, runtime, CLI,
  display text, documentation, lockfile, and changelog version surfaces
  synchronized.
- Read `cutout.agent-capabilities.json` before changing Agent package metadata
  and validate the synchronized contract with `pnpm agent:validate`.
- Do not stage, revert, or publish the unrelated dirty changes in the user's
  current worktree.
- Publish only through the repository's atomic four-platform workflow. Do not
  weaken Apple notarization, Windows Authenticode, updater signature,
  attestation, checksum, or complete-manifest gates.
- Before creating or pushing `v0.1.5`, confirm all protected credential names,
  including `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD`.
- Do not create a partial public release, overwrite a release, or move an
  existing tag.
- After publication, verify the public Release, complete asset set,
  `SHA256SUMS`, `latest.json`, updater sidecars, provenance, and stable release
  status.
- Quit the old Cutout process and move old application bundles to uniquely
  named Trash paths so uninstall remains recoverable.
- Download the public Apple Silicon DMG, verify its SHA-256 digest, Developer ID
  signature, Gatekeeper assessment, and stapled notarization ticket before
  installing it.
- Leave exactly one `/Applications/Cutout.app`, launch it, and verify that its
  version, bundle identifier, signature, process path, and visible UI belong to
  the new release.

## Acceptance Criteria

- [ ] A release branch based on current `github/main` contains the reviewed
  conversation branch persistence change and synchronized `0.1.5` metadata.
- [ ] Local release validation, production build, focused release tests, and
  `pnpm agent:validate` pass from the isolated release worktree.
- [ ] The release change reaches `github/main` through the repository's required
  pull-request and `Quality gate` policy.
- [ ] Both Windows certificate secret names are visible in the protected
  `release` environment before `v0.1.5` is pushed.
- [ ] The protected workflow completes all four platform builds and publishes a
  non-draft, non-prerelease `v0.1.5` Release without replacing another release.
- [ ] Public assets, checksums, updater manifest/platform entries, updater
  signatures, provenance, and macOS notarization evidence validate.
- [ ] The old `0.1.4` application is no longer installed at `/Applications` and
  remains recoverable from a timestamped Trash path.
- [ ] `/Applications/Cutout.app` is the verified public `0.1.5` Apple Silicon
  build and launches successfully from that exact path.

## Out of Scope

- Issuing or purchasing a Windows code-signing certificate.
- Weakening the release workflow to allow unsigned Windows installers.
- Publishing from the user's private `origin` mirror.
- Permanently deleting application bundles or user project data.
