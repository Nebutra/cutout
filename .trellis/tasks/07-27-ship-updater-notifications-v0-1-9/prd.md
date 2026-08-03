# Ship updater notification best practices v0.1.9

## Goal

Make signed Cutout desktop builds reliably discover updates during long-running
sessions, notify users without disruptive prompts, integrate the pending About
footer polish, and publish the complete change as signed/notarized `v0.1.9`.

## Background

- `v0.1.8` checks once about eight seconds after startup and suppresses another
  automatic check for 24 hours.
- A long-running process does not currently schedule another check or react to
  foreground/network recovery.
- An available release creates a compact Home `Updates` action but does not
  enter the notification bell or produce an optional system notification.
- The About footer polish exists locally as commit `6286537` and is not on
  `github/main`.

## Requirements

- Preserve the signed native updater, HTTPS/allowlist, channel, downgrade,
  recovery snapshot, durable-host shutdown, and active-Agent-run boundaries.
- Keep the startup check delayed by roughly eight seconds, then retry eligible
  automatic checks while the app remains open, on foreground/visibility
  recovery, and after the network returns.
- Rate-limit successful automatic checks to no more than one every six hours
  and prevent concurrent duplicate checks. Add bounded jitter to periodic
  scheduling so clients do not synchronize requests.
- Continue to default automatic checking on, while honoring the existing user
  preference and keeping manual `Check now` available.
- Project a newly discovered release into the existing notification bell once
  per channel/version, replacing stale update notifications rather than
  accumulating them.
- Let the user defer the notification for 24 hours without hiding the persistent
  Home update action or disabling manual update controls.
- Offer system update notifications as an explicit opt-in. Request OS
  permission only from that user action and notify only while the app is not
  visible/focused.
- Do not show a launch modal, silently download, silently install, or restart
  without the user's existing explicit actions.
- Make update notification rows open `Settings -> Updates & Support`.
- Localize every new updater notification, setting, action, status, and
  accessibility string in all shipped Lingui catalogs.
- Integrate the About footer polish from `6286537` on top of latest
  `github/main`.
- Publish synchronized version `0.1.9` through the protected release workflow,
  preserving signing, notarization, updater-signature, checksum, SBOM, and
  provenance gates.
- Install the verified public Apple Silicon release locally and record signed
  installation evidence.

## Acceptance Criteria

- [ ] Focused scheduler tests cover startup delay, periodic jitter, focus,
  visibility, online recovery, cleanup, six-hour gating, and concurrency.
- [ ] Notification tests cover channel/version dedupe, stale replacement,
  24-hour deferral, permission opt-in/denial, background-only system delivery,
  and navigation to update controls.
- [ ] Existing Home update action, manual checking, download/install/restart,
  Agent-run blocking, and recovery tests remain green.
- [ ] The visible Settings About footer uses the polished layout from
  `6286537`.
- [ ] `pnpm i18n:ci` passes and all new updater message IDs have non-empty
  translations for English, Simplified Chinese, Japanese, French, and Spanish.
- [ ] Lint, TypeScript/build, full unit tests, Rust tests/checks, Agent/plugin
  validation, release contract tests, and relevant visual tests pass.
- [ ] A reviewed PR merges the feature to `github/main`.
- [ ] Tag and public GitHub Release `v0.1.9` point to the reviewed main merge and
  publish the complete required asset inventory.
- [ ] The installed Apple Silicon app reports `0.1.9`, passes Developer ID,
  Gatekeeper, and stapler validation, and launches from `/Applications`.

## Out Of Scope

- Forced/minimum-version updates.
- Silent or mandatory download/install.
- A background daemon that checks while Cutout is not running.
- Rollout/rollback metadata unsupported by the current updater consumer.
