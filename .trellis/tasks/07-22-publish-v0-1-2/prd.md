# Publish Cutout v0.1.2

## Goal

Publish Cutout `v0.1.2` through the protected four-platform GitHub workflow,
including Developer ID signing, Apple notarization, updater signatures, and a
public stable Release.

## Requirements

- Review and commit the existing macOS signing/notarization workflow changes
  without including unrelated active-task files.
- Synchronize every product and Agent-facing version surface to `0.1.2`,
  including package/Tauri/Cargo metadata, capability metadata, CLI/MCP version
  reporting, desktop About/diagnostic copy, plugin runtime artifacts, READMEs,
  and changelog.
- Run release contract tests, Agent validation, updater tests, lint, TypeScript,
  production build, Rust checks, and version synchronization before tagging.
- Push reviewed commits to `github/main` before creating the release tag.
- Create and push one annotated `v0.1.2` tag. The normal tag-triggered stable
  path uses `100%` rollout.
- Monitor the protected workflow through all macOS, Windows, Linux, collection,
  metadata, and publication stages.
- Never expose protected credential values or commit generated private material.
- Never force-move the tag or replace immutable Release assets. A source defect
  found after tag creation requires a newer patch version.

## Acceptance Criteria

- [ ] `0.1.2` is synchronized across validated version surfaces and release
  notes describe the user-visible changes since `v0.1.1`.
- [ ] Release workflow, updater, Agent, frontend, and Rust quality gates pass.
- [ ] Reviewed release commits are present on `github/main`.
- [ ] Annotated tag `v0.1.2` points to the reviewed main commit locally and on
  GitHub.
- [ ] The tag-triggered `Build and Release Cutout` workflow completes
  successfully for all four target artifacts.
- [ ] GitHub Release `v0.1.2` is public, non-draft, marked latest, and contains
  signed updater artifacts, manifests, checksums, and native installers.
- [ ] macOS workflow evidence confirms Developer ID verification, Gatekeeper
  acceptance, and stapled notarization tickets for app and DMG.

## Out of Scope

- Windows Authenticode signing.
- Changing production updater keys or Apple credentials.
- Replacing an existing `v0.1.2` tag or Release.

## Notes

- `v0.1.1` is the current latest public release.
- Local `main` is 36 commits ahead of `github/main` before this release work.
