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

- [ ] Source version validators accept `0.1.1` and the release-focused test suite passes.
- [ ] Version bump commit is present on both `origin/main` and `github/main`.
- [ ] Annotated tag `v0.1.1` points to the verified version bump commit.
- [ ] The release workflow completes successfully for all configured platform targets.
- [ ] GitHub Release `v0.1.1` is published, non-draft, stable, and contains `latest.json`, updater signatures, checksums, and installable platform assets.
- [ ] The published updater manifest validates against the allowed GitHub host and references downloadable release assets.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
