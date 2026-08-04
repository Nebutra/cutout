# Simplify automatic AI setup

## Goal

Make the AI settings page answer one user question: whether Cutout is ready to
use the user's available AI, and what single action is needed when it is not.
Provider credentials, local coding Agent discovery, and model routing are
implementation details of that setup rather than three competing top-level
workflows.

## Background

- The current released UI renders configured providers, discovered provider
  credentials, a 39-Agent local inventory, model-routing coverage, advanced
  model bindings, and Vectorizer configuration in one continuous settings
  surface.
- `DiscoveredProviders` and `LocalAgentInventoryPanel` overlap: an installed
  Agent with a reviewed credential adapter can appear once as a reusable
  provider credential and again in the complete Agent inventory.
- The 39-Agent inventory is still useful evidence for diagnostics and future
  session delegation, but unsupported and not-installed Agents do not help the
  default task of getting AI ready.
- The native discovery boundary is intentionally closed and sanitized. This
  task must not broaden paths, expose secrets, invent session delegation, or
  change the authoritative Agent capability contract.

## Requirements

- Present one primary setup status derived from configured provider readiness
  and required capability coverage: ready, action required, scanning, or
  unavailable.
- When setup is ready, lead with the successful outcome and keep technical
  evidence secondary.
- When setup needs attention, show only actionable next steps, prioritizing a
  reviewed reusable local credential before the general provider directory.
- Do not show a second top-level "Local coding agents" workflow beside
  "Discovered on this device". Local Agent installation/configuration evidence
  must be folded into a subordinate details or diagnostics affordance.
- Deduplicate repeated provider/credential facts in the visible hierarchy. A
  reusable Agent credential may name its source Agent without also requiring
  the user to find that Agent in a separate default list.
- Collapse full provider metadata, the 39-Agent matrix, manual model bindings,
  source locations, and protocol details behind progressive disclosure.
- Preserve explicit provider add/edit/remove, reviewed credential import,
  rescan, capability-gap remediation, and advanced model binding controls.
- Preserve all native security and provenance guarantees. Secret values must
  remain native-only and the UI must consume sanitized discovery records.
- Keep English, Simplified Chinese, Spanish, French, and Japanese message
  catalogs synchronized.
- Validate any Agent-surface change with `pnpm agent:validate`.

## Acceptance Criteria

- [ ] The default AI settings viewport has one clear setup status and no
  separate full local-Agent section.
- [ ] A user with verified providers and full routing coverage sees a concise
  ready state rather than repeated success summaries.
- [ ] A user with an importable local credential sees an actionable setup
  option with its sanitized Agent/source label.
- [ ] A user with capability gaps sees the missing capabilities and a direct
  connect action.
- [ ] The complete 39-Agent inventory remains available only through the
  approved secondary placement, including rescan and permission/error states.
- [ ] Provider management and advanced model assignments remain reachable
  without dominating the default flow.
- [ ] Empty, loading, discovery failure, permission-required, partially
  configured, and fully ready states have focused component coverage.
- [ ] `pnpm agent:validate`, focused settings tests, lint, TypeScript, and the
  production build pass.

## Out Of Scope

- Adding new credential adapters or session-delegation executors.
- Changing the reviewed 39-Agent registry or native scan paths.
- Automatically importing a credential without an explicit user action.
- Changing provider verification or model-capability evidence policy.

## Open Question

- Should the complete 39-Agent inventory live in an expandable "Details" area
  inside AI settings, or move to a separate diagnostics/support surface?
