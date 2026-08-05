# Design: post-v0.1.19 convergence

## Boundaries

This is a breaking cleanup of Cutout-owned persistence and tooling inputs, not
a broad capability implementation. Current typed contracts remain; retired
inputs fail closed or start from the normal empty/current state.

## Trellis backlog

Planning drafts are not product truth and must not remain in the active task
queue indefinitely. Delete unstarted drafts whose intent is already captured
by Roadmap/capability documents. Do not archive them as completed because none
of their acceptance evidence exists.

## Workspace state

Streaming text has one owner: the mounted Agent conversation. Durable history
is represented by completed run events and material/artifact receipts. Remove
the write-only `liveAgentOutput` field across snapshot construction,
fingerprinting, persistence validation, and UI snapshot projection. Startup
always initializes visible streaming text to empty without a compatibility
function.

## Kimi credential source

The reviewed current source order is:

```text
~/.kimi/config.toml -> KIMI_API_KEY fallback
```

Only TOML provider entries with the exact official coding endpoint are
importable. `KIMI_API_KEY` overrides a matching TOML literal. JSON is no longer
parsed or resolved. Candidate handles and native re-read rules are unchanged.

## Release notes

The catalog is the sole authoring authority. `renderUpdaterPlainTextNotes`
produces the standard `latest.json.notes` string for Tauri/old clients, while
`cutoutReleaseNotes` carries the localized typed extension. Removing the manual
input does not remove the standard manifest field.

`update-artifacts generate` must receive `--release-notes-catalog`; the release
workflow already does. Rendered review files use `updater-notes.txt`,
`updater-extension.json`, `bundled-note.json`, and `github-release.md`.

## Rollback

Rollback is source-level. No destructive user-data migration runs. Reverting
the task restores the retired readers without modifying stored data.
