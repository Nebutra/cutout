# Technical Design

## Installation Safety

Use a temporary directory for release downloads and mount the verified DMG
through the normal macOS disk-image path. Validate the downloaded DMG against
the published `SHA256SUMS`, then validate the mounted app before copying it into
`/Applications`.

All removals are recoverable moves to `~/.Trash` with timestamped names. Exact
paths are discovered and validated before mutation; no broad recursive target
or unresolved glob is used for deletion.

## Duplicate Cleanup

Unregister each stale bundle from LaunchServices before moving it. Remove only
the generated `.app` bundle directories below the two known Tauri target bundle
paths, not their parent build trees. Register the final `/Applications` bundle
and ask Spotlight to refresh it.

## Updater Review Boundary

The review traces synchronized version surfaces and immutable tags; protected
signing/notarization; updater artifact and manifest generation; runtime host and
signature policy; rollout/rollback; user-visible check/download/install/relaunch;
and multi-remote push ordering and concurrency behavior.

The review is read-only and produces findings rather than source changes.

## Rollback

If installation verification fails, move the invalid new app to Trash and
restore the previous `/Applications` bundle from its timestamped Trash path.
