# Release Cutout v0.1.1

## Goal

Publish the signed cross-platform v0.1.1 updater release from main.

## Requirements

- Release from the current clean `main` branch as stable version `0.1.1`.
- Keep package, Tauri, Cargo, and updater version metadata synchronized.
- Run the repository release-contract and updater-artifact checks before tagging.
- Commit and push the version bump to both configured remotes.
- Create and push the annotated `v0.1.1` tag to GitHub to trigger `release-update.yml`.
- Do not report success until the workflow publishes a non-draft GitHub Release with signed updater metadata and platform assets.
- Keep signing secrets in the protected GitHub `release` environment; never print or copy them into repository files.

## Acceptance Criteria

- [x] Source version validators accept `0.1.1` and the release-focused test suite passes.
- [x] Version bump and release fixes are present on both `origin/main` and `github/main`.
- [x] Annotated tag `v0.1.1` points to verified release commit `67f0ceb`.
- [x] Release workflow `29799677919` completes successfully for all configured platform targets.
- [x] GitHub Release `v0.1.1` is published, non-draft, stable, and contains `latest.json`, updater signatures, checksums, and installable platform assets.
- [x] The published updater manifest validates against the allowed GitHub host and references the downloadable Apple Silicon updater asset.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
- Published at https://github.com/Nebutra/cutout/releases/tag/v0.1.1 on 2026-07-21.
- Installers are available for macOS Apple Silicon/Intel, Windows x64, and Linux x64. The stable updater manifest currently targets `darwin-aarch64`.
