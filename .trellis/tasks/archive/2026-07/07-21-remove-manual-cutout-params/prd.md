# Remove manual cutout parameter controls

## Goal

Make cutout behavior product-owned and automatic. Users and Agents must not be
asked to understand or tune threshold, minimum area, merge gap, or padding.

## Background

The current product exposes the four algorithm parameters through source-panel
sliders, Advanced settings, empty-state quick fixes, Zustand mutation actions,
and AI-native actions. This contradicts the product expectation that cutout is
intelligent and creates multiple partially hidden ways to change the result.

The algorithm and worker still require a `CutoutParams` value. Those parameters
remain an internal implementation detail with one product-owned default set.

## Requirements

- Remove every user-facing control, label, hint, reset action, and numeric quick
  fix for cutout parameters.
- Remove AI-native `set-param`, `set-params`, and `reset-params` actions and their
  validation helpers. Removed actions must fail schema parsing.
- Remove Zustand `setParam` and `resetParams` actions and all UI-oriented range
  metadata that exists only to support manual tuning.
- Keep the internal default parameter set and the algorithm/worker
  `CutoutParams` contract so source import and explicit reruns continue to work.
- Keep persisted project decoding backward compatible with records that contain
  `params`, but normalize restored state to the current internal defaults so
  historical manual tuning no longer affects new analysis.
- Do not expose internal cutout parameters in the AI-native state snapshot.
- Simplify automatic analysis to react to a newly loaded auto-analyze source,
  without parameter-change debounce behavior.
- Remove obsolete localization messages through the repository's normal i18n
  extraction workflow.
- Preserve unrelated uncommitted connector-icon and native permission changes.

## Acceptance Criteria

- [x] Advanced settings contains no cutout parameter row or reset command.
- [x] The source panel contains no parameter sliders or reset command.
- [x] The empty slice state contains no threshold/min-area tuning commands or
      copy that instructs the user to tune parameters.
- [x] AI-native action parsing rejects `set-param`, `set-params`, and
      `reset-params`; no execution branch or helper remains for them.
- [x] The store exposes immutable internal params and no parameter mutation API.
- [x] Loading a source with `autoAnalyze: true` still starts cutout once, while
      Agent-managed `autoAnalyze: false` sources do not start a duplicate run.
- [x] Restoring a legacy project containing custom params succeeds and uses the
      current internal defaults.
- [x] Internal cutout params are absent from the AI-native state snapshot.
- [x] Type checking, lint, focused tests, i18n validation, and
      `pnpm agent:validate` pass.

## Out of Scope

- Implementing image-specific parameter estimation or a new AI/ML cutout model.
- Changing the current algorithm defaults or worker pipeline contract.
- Removing the legacy `params` field from persisted project schemas, which
  would make existing local projects unreadable.
