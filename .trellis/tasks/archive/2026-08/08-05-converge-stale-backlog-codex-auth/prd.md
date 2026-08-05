# Converge remaining stale backlog and Codex auth fallback

## Goal

Remove one superseded release-task record and the Codex credential fallback
outside the current reviewed `CODEX_HOME` / `~/.codex` root.

## Requirements

- Remove the active `v0.1.16` publication task without claiming its acceptance
  criteria passed. Its immutable tag produced no Release and the archived
  `v0.1.17` task records the superseding outcome.
- Discover and resolve Codex API keys only from the selected Codex root's exact
  `auth.json`; do not inspect `~/.config/codex/auth.json`.
- Preserve current Codex auth-only, configured-provider, root CC Switch, and
  CC Switch database discovery behavior.
- Keep candidate metadata sanitized and bind draft re-resolution to the same
  current schema/path.
- Synchronize the provider-discovery spec and focused Rust tests.

## Acceptance Criteria

- [x] Trellis no longer reports `publish-install-v0-1-16` as active WIP.
- [x] No shipping source, current spec, or focused test references the removed
      Codex legacy auth path or legacy schema ids.
- [x] Current `CODEX_HOME` / `~/.codex/auth.json` discovery and secret
      re-resolution remain covered and passing.
- [x] CC Switch current-root and database routes remain covered and passing.
- [x] Rust AI tests, formatting, lint, TypeScript, Agent validation, build, and
      diff checks pass.

## Out Of Scope

- Implementing the still-open GitHub host or configurable chroma-key features.
- Publishing `v0.1.19`, changing Provider protocols, or removing general
  persisted workspace migration support.
