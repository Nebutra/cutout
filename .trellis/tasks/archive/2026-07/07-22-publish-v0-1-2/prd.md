# Publish Cutout v0.1.3 After v0.1.2 Gate Failure

## Goal

Publish Cutout `v0.1.3` through the protected four-platform GitHub workflow,
including Developer ID signing, Apple notarization, updater signatures, and a
public stable Release. Preserve failed tag `v0.1.2` unchanged and unpublished.

## Requirements

- Review and commit the existing macOS signing/notarization workflow changes
  without including unrelated active-task files.
- Synchronize every product and Agent-facing version surface to `0.1.3`,
  including package/Tauri/Cargo metadata, capability metadata, CLI/MCP version
  reporting, desktop About/diagnostic copy, plugin runtime artifacts, READMEs,
  and changelog.
- Run release contract tests, Agent validation, updater tests, lint, TypeScript,
  production build, Rust checks, and version synchronization before tagging.
- Push reviewed commits to `github/main` before creating the release tag.
- Create and push one annotated `v0.1.3` tag. The normal tag-triggered stable
  path uses `100%` rollout.
- Monitor the protected workflow through all macOS, Windows, Linux, collection,
  metadata, and publication stages.
- Never expose protected credential values or commit generated private material.
- Never force-move the tag or replace immutable Release assets. A source defect
  found after tag creation requires a newer patch version.

## Acceptance Criteria

- [x] `0.1.3` is synchronized across validated version surfaces and release
  notes describe the user-visible changes since `v0.1.1`.
- [x] Release workflow, updater, Agent, frontend, and Rust quality gates pass.
- [x] Reviewed release commits are present on `github/main`.
- [x] Annotated tag `v0.1.3` points to the reviewed main commit locally and on
  GitHub.
- [x] The tag-triggered `Build and Release Cutout` workflow completes
  successfully for all four target artifacts.
- [x] GitHub Release `v0.1.3` is public, non-draft, marked latest, and contains
  signed updater artifacts, manifests, checksums, and native installers.
- [x] macOS workflow evidence confirms Developer ID verification, Gatekeeper
  acceptance, and stapled notarization tickets for app and DMG.

## Out of Scope

- Windows Authenticode signing.
- Changing production updater keys or Apple credentials.
- Replacing the existing `v0.1.2` tag or publishing assets against it.

## Notes

- `v0.1.2` passed source validation and updater signing, but both macOS jobs
  rejected their signed DMGs as `Unnotarized Developer ID`; the app bundles
  themselves were notarized and stapled correctly.
- Windows and Linux also failed closed because the release contract expected
  legacy updater archives while Tauri v2 emitted signed native `.exe` and
  `.AppImage` updater artifacts.
- The immutable `v0.1.2` tag remains as failure evidence and has no Release.
- Release workflow `29893926338` completed successfully from commit `672dd63`.
  Public Release: https://github.com/Nebutra/cutout/releases/tag/v0.1.3
