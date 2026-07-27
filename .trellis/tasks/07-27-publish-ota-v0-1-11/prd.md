# Publish Cutout OTA v0.1.11

## Goal

Publish the reviewed local Agent inventory, API-key credential adapters, and
native Agent Host hardening as the next immutable stable Cutout OTA release.

## Background

- `v0.1.10` is the current public Latest release.
- PR #43 carries the reviewed release scope and is waiting on protected checks.
- Codex and Claude subscription/session execution remains intentionally blocked;
  this release must not claim that capability.
- The tag-triggered release workflow is the sole release authority.

## Requirements

- Prepare `0.1.11` from the reviewed feature commit and rebase the release
  branch onto the eventual PR #43 merge commit before publication.
- Synchronize package, Tauri, Cargo, Agent capability, Codex plugin, generated
  runtime, README, lockfile, and changelog version surfaces.
- Describe only the 39-Agent inventory, nine reviewed API-key adapters, and
  Agent Host security hardening in release notes.
- Surface all 39 reviewed Agents in Settings with localized installation,
  configuration, permission, and API-key-adapter status.
- Keep Windows credential reads bound to stable handle-backed file identity;
  mutable length and timestamp metadata is not sufficient.
- Keep OAuth/session/bearer material non-importable and keep local Agent session
  execution capability-blocked.
- Validate Agent contract, version identity, release workflow contracts, lint,
  TypeScript, production build, Rust checks/tests, and diff hygiene.
- Merge through a protected release PR, tag the reviewed merge commit, and let
  `.github/workflows/release-update.yml` publish the signed four-platform assets.
- Verify the public Release and updater manifest before replacing the local app.

## Acceptance Criteria

- [ ] All repository version surfaces validate as `0.1.11`.
- [ ] Local release checks and native/frontend quality gates pass.
- [ ] Settings displays the complete 39-Agent inventory and keeps every new
      status and permission message localized across all shipped languages.
- [ ] PR #43 and the release PR merge through required protected checks.
- [ ] Annotated tag `v0.1.11` is reachable from `github/main` and matches the
      synchronized source version.
- [ ] The protected release workflow publishes a stable, non-draft Release with
      all four updater platforms, signatures, checksums, provenance, and macOS
      notarization evidence.
- [ ] The old local Cutout installation is removed and the published Apple
      Silicon `v0.1.11` package is installed and reports version `0.1.11`.

## Out Of Scope

- Codex or Claude subscription/session execution.
- Importing OAuth, bearer, helper, keyring, or session credentials.
- Weakening release checks, signing, notarization, updater, or provenance gates.
