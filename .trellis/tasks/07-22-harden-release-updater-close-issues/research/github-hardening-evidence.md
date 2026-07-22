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

## Remaining Personnel Prerequisite

The organization has no second direct collaborator or release-review team.
Current releases therefore require explicit single-maintainer approval but do
not provide independent review. After a second trusted reviewer is added,
replace the reviewer and set `prevent_self_review=true`.

## Deferred Until Workflow Merge

- Require the new aggregate CI quality check on `main` and require pull requests.
- Switch Actions to selected-only and enable SHA pin enforcement after every
  workflow reference on `main` is commit-pinned.
