# Converge post-v0.1.19 backlog and legacy paths

## Goal

Make the current Cutout contract the only active implementation surface after
`v0.1.19`: remove stale Trellis planning records and runtime compatibility
paths that have no current producer or consumer, without weakening truthful
capability boundaries or standard updater compatibility.

## Confirmed Facts

- GitHub has no open Cutout issues and shipping source has no `TODO`, `FIXME`,
  `HACK`, or `WIP` marker.
- `07-20-authenticated-github-pr-host` and
  `07-20-configurable-chroma-key-boards` are unstarted planning drafts. The
  former is already represented by the OAuth/real-host Roadmap boundary; the
  latter is an uncommitted experiment, not an advertised capability.
- `08-03-publish-install-v0-1-16` is an empty directory left after its stale
  task record was removed.
- Kimi credential discovery still accepts the retired `.kimi/config.json`
  shape even though current TOML and `KIMI_API_KEY` routes are implemented.
- `WorkspaceSnapshot.liveAgentOutput` is persisted and fingerprinted while
  `restoreLiveAgentOutput` deliberately returns an empty string for every
  snapshot. It creates writes but can never restore user value.
- Release tooling still accepts unreviewed manual `--notes` and calls the
  standard updater plain-text projection `legacy-notes`, although production
  release policy requires exact catalog-backed notes in five locales.

## Requirements

- Remove the two unstarted planning task directories and the empty obsolete
  release directory without marking their acceptance criteria completed.
- Keep real future capability boundaries in `docs/ROADMAP.md` and the
  Integration capability matrix; do not claim OAuth hosts, chroma keying,
  speech, video, cloud collaboration, or Windows Job Objects are implemented.
- Discover and resolve Kimi credentials only from current `config.toml` or the
  reviewed `KIMI_API_KEY` environment source. Retain closed endpoint/provider
  mapping, env precedence, candidate drift checks, and secret redaction.
- Remove `liveAgentOutput` from the current persisted Workspace contract and
  repository validator. Live provider deltas remain component-local and
  ephemeral; completed Agent events and artifacts remain durable.
- Require reviewed catalog-backed release notes when generating updater
  metadata. Preserve the standard Tauri `latest.json.notes` plain-text field
  and localized `cutoutReleaseNotes`; remove the manual notes fallback and
  legacy naming from source, tests, generated filenames, docs, and specs.
- Keep CLI, Agent manifest, Codex plugin, protocol docs, and generated plugin
  runtime synchronized wherever their owned source changes.

## Acceptance Criteria

- [x] Trellis reports only genuinely active work and never falls back to the
      archived credential-adapter task after this task is active/archived.
- [x] No shipping Kimi path or test references `.kimi/config.json`,
      `kimi-config-json-v1`, or `Kimi legacy config`.
- [x] Current Kimi TOML/environment discovery, redaction, check/import re-read,
      and precedence tests pass.
- [x] `WorkspaceSnapshot` and the project repository contain no persisted
      `liveAgentOutput`; current snapshots, autosave fingerprints, run events,
      retry, and streaming tests pass.
- [x] Updater generation rejects missing reviewed release notes, exposes no
      manual `--notes` path, renders `updater-notes.txt`, and still emits the
      standard readable `latest.json.notes` plus the exact localized extension.
- [x] Stale-identifier searches, Rust AI tests/check, focused Vitest, full
      lint/type-check/test/build, i18n, Agent validation, and `git diff --check`
      pass.

## Out Of Scope

- Implementing Roadmap capabilities or adding a new provider/model.
- Removing standard Tauri updater fields needed by current clients.
- Deleting user projects, Keychain entries, Provider records, or Design IR.
- Publishing a desktop release; this task prepares the next reviewed patch.
