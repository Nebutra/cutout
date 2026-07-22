# GitHub Hardening Evidence

## Before

- Private vulnerability reporting: disabled.
- `release` environment: no protection rules, no deployment branch policy,
  `can_admins_bypass=true`.
- Repository rulesets: none; `main` unprotected; release tags movable/deletable.
- Dependabot security updates, secret scanning, and push protection: disabled.
- Code scanning default setup: not configured.
- Repository has no second direct collaborator or release-review team.

## Applied

- Enabled private vulnerability reporting and posted a public acknowledgement on
  issue #12 directing detailed disclosure to the Security tab.
- Enabled Dependabot vulnerability alerts and automated security fixes.
- Enabled secret scanning and push protection. Non-provider pattern scanning and
  validity checks remained unavailable/disabled after the repository update.
- Enabled CodeQL default setup for GitHub Actions and JavaScript/TypeScript.
  GitHub default setup does not support Rust, so Cargo tests/checks remain the
  Rust gate.
- Updated the `release` environment:
  - `can_admins_bypass=false`
  - required reviewer: `TsekaLuk` (`id=79151285`)
  - `prevent_self_review=false`
  - custom deployment policies: `main`, `v*`
- Created active tag ruleset `Protect release tags` (`id=19530200`) for
  `refs/tags/v*` with deletion and non-fast-forward updates blocked and no
  bypass actors.
- Created active main ruleset `Protect main` (`id=19535513`) for
  `refs/heads/main`. It requires pull requests, dismissal of stale approvals,
  resolved review threads, strict `Quality gate` status, and blocks deletion
  and non-fast-forward updates with no bypass actors.
- Restricted Actions to GitHub-owned actions plus the exact approved commit
  SHAs for `pnpm/action-setup`, `dtolnay/rust-toolchain`, and
  `Swatinem/rust-cache`; repository SHA-pinning enforcement is enabled.
- Merged the hardening through PR #14 after all 14 required checks passed.

## Remaining Personnel Prerequisite

The organization has no second direct collaborator or release-review team.
Current releases therefore require explicit single-maintainer approval but do
not provide independent review. After a second trusted reviewer is added,
replace the reviewer and set `prevent_self_review=true`.

## Dependency Alert Disposition

- `fast-uri` is overridden to patched version `3.1.4` at the pnpm workspace
  authority and verified absent from the production audit.
- `@hono/node-server` remains transitively owned by the Model Context Protocol
  SDK through `shadcn`; its fix requires the incompatible 2.x major line.
  Do not force the major override without upstream compatibility evidence.
- Rust alerts for `glib 0.18.5` (Tauri/GTK Linux stack) and `atty 0.2.14`
  (`vtracer` through clap 2) have no narrow application-level upgrade path;
  retain alerts for upstream tracking rather than dismissing them.
