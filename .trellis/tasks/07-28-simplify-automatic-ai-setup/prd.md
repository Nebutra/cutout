# Simplify automatic AI setup

## Goal

Make AI settings answer one question: whether Cutout is ready to use the
user's available AI, and what action is needed when it is not. Provider
credentials, local coding Agent discovery, and model routing are implementation
details rather than competing user workflows.

## Background

- Released `github/main` renders configured providers, discovered credentials,
  a 39-Agent inventory, routing coverage, bindings, and Vectorizer in one long
  surface.
- A reusable Agent credential appears under "Discovered on this device" while
  the same Agent appears again in "Local coding agents".
- The native 39-Agent registry remains useful as a closed, sanitized backend
  capability. Its unsupported and not-installed rows do not help a user get AI
  ready.

## Requirements

- Show one outcome-led setup state: checking, ready, action required, or
  unavailable.
- Claim ready only when at least one enabled Provider has a persisted verified
  receipt and verified Providers cover every required model dimension.
- When no verified Provider exists, prioritize reviewed importable credentials;
  otherwise offer the Provider directory.
- When verified Providers have capability gaps, show only the missing
  capabilities and a direct connect action.
- Remove the 39-Agent inventory from AI settings. Do not invoke or render the
  inventory in the default page; keep its native service and safety contract.
- Hide configured Provider rows, add/edit/remove controls, protocol metadata,
  and manual model bindings behind one advanced management affordance.
- Hide successful routing coverage as a separate section. Keep manual bindings
  reachable in advanced management.
- Do not surface discovery failures when an already verified, fully covered
  setup is usable. Show a sanitized recovery state when discovery failure
  blocks first-time automatic setup.
- Preserve explicit user action before importing any credential.
- Keep secret values native-only and consume only sanitized discovery records.
- Synchronize all five locale catalogs and validate the Agent surface.

## Acceptance Criteria

- [x] The default AI settings viewport shows one setup outcome and no local
  Agent inventory or repeated routing-success block.
- [x] Verified, fully covered Providers produce a concise ready state.
- [x] Configured but unverified/failed Providers produce an actionable manage
  state rather than a false ready claim.
- [x] With no verified Provider, importable local credentials appear as
  explicit setup actions with sanitized source labels.
- [x] Verified Providers with capability gaps show missing dimensions and a
  connect action.
- [x] Provider management and manual model bindings remain reachable under one
  advanced disclosure.
- [x] Loading, unavailable, discovery failure, unverified, gap, importable, and
  ready projections have focused tests.
- [x] `pnpm agent:validate`, focused Vitest, lint, TypeScript, production build,
  and `git diff --check` pass.

## Out Of Scope

- New credential adapters, Agent execution, or session delegation.
- Changes to native scan paths, the reviewed registry, or credential import
  policy.
- Automatic credential import without a user action.
- Moving the full inventory to another user-facing page in this change.
