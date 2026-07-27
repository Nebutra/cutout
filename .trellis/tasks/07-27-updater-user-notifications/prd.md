# Add deduplicated update notifications

## Goal

Notify users about verified releases through the existing bell and an optional
background system notification without disruptive launch prompts.

## Requirements

- Add update notifications to the local notification schema and render them as
  actionable rows that open update settings.
- Notify once per channel/version, replace stale update entries, and support a
  24-hour reminder deferral.
- Preserve the Home update action regardless of bell read/deferral state.
- Add explicit system-notification opt-in; request permission only from that
  user action and notify only while the app is backgrounded.
- Add the official Tauri notification plugin with least-privilege capability.
- Keep all release discovery and signature verification in the native updater.

## Acceptance Criteria

- [ ] Tests cover dedupe, replacement, deferral, permission grant/denial,
  background-only delivery, row navigation, and persistence migration.
- [ ] No modal, automatic download, automatic install, or unsigned release
  claim is introduced.

## Notes

- This bounded notification task is PRD-only.
