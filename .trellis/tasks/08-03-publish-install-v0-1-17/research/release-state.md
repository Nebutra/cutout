# Release state before v0.1.17

- Canonical source: `github/main@79b0b453fd1cf3432b16507c229da91c29b7f6d9`.
- Required behavior commit: `7d2cf80cbbbc69986dc27255044537b07e543f13`.
- Current synchronized source version: `0.1.16`.
- Latest public stable Release at task start: `v0.1.15`.
- Existing annotated `v0.1.16` tag targets `02ecac7` and must remain immutable.
- Release workflow `30786815994` passed validation and quality, then waited for
  protected environment approval before platform builds. It was cancelled as
  obsolete after PR #55 reached `main`; it created no public Release.
- `v0.1.17` tag and Release were absent when the task began.
- The primary workspace is dirty. The isolated `release/v0.1.17` worktree is
  the only authorized release source.

Executable publication and installation checks remain in
`docs/RELEASE_CHECKLIST.md`; the code-spec contract remains in
`.trellis/spec/frontend/release-pipeline.md`.
