# Design: resilient updater notifications and v0.1.9 release

## Ownership

- `createUpdateOrchestrator` remains the single update state owner and enforces
  automatic-check eligibility plus single-flight checking.
- A browser lifecycle scheduler owns timers and foreground/network triggers. It
  calls only `controller.autoCheck(true)` and never fetches GitHub.
- The native updater remains the only release discovery/download/install path.
- The existing local notification store owns in-app notification history.
- A dedicated update-notification projection owns version dedupe, stale update
  replacement, 24-hour deferral, and optional native notification delivery.
- AppShell wires the shared controller to the scheduler and notification
  projection. Home and Settings remain consumers of the same controller.

## Scheduling Contract

After initialization, schedule the existing eight-second startup attempt. A
periodic timer runs at six hours plus bounded per-schedule jitter. Window focus,
document visibility recovery, and browser `online` events also trigger an
attempt. The orchestrator rejects attempts when auto-check is off, capability
is unavailable, a successful check is less than six hours old, or another
check is already active.

Failures do not advance `lastCheckedAt`; later lifecycle/network events may
retry. Cleanup removes every timer and listener.

## Notification Contract

The release identity is `<channel>:<version>`. The first eligible discovery:

1. replaces older `source=update` bell entries with one unread item;
2. preserves the persistent Home update action;
3. sends one OS notification only when system notifications are enabled,
   permission is granted, and the document is not visible/focused; and
4. records notification state separately from updater trust state.

Opening the update notification routes to
`{ section: 'updates-support', anchor: 'updates' }`. Deferring removes the bell
item and sets a 24-hour reminder timestamp; the next eligible updater check may
publish it again. A newer version supersedes prior dedupe/deferral state.

System notification permission is requested only when the user enables the
setting. Denial leaves the setting off and does not affect in-app alerts.

## Release And Rollback

Feature work merges to `github/main` before release preparation. `v0.1.9`
version files and generated plugin outputs are synchronized on a release branch,
reviewed, merged, tagged once, and published by the protected workflow.

No release secrets enter local feature/test commands. If feature integration
fails, revert the feature commits. If local installation verification fails,
retain/restore the existing signed app and do not claim the release installed.
