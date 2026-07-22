# Coverage honors explicit model bindings

## Problem

In Settings → AI → Model routing, the coverage summary reports "已覆盖 4/6 个任务
维度" with "2 项能力缺口：图像生成、图像编辑" even though the user has explicitly
bound `gpt-image-2` to both the image-generation and image-edit dimensions.

Root cause: `modelRoutingCoverage(providers)`
(`src/components/settings/model-routing-summary.ts`) derives coverage **only**
from the static per-`kind` adapter capability tables in the provider registry.
For `openai-compatible` / gateway-family providers the adapter conservatively
declares `['text','vision','tools']` (no `image-generation` / `image-edit`),
because a generic OpenAI-compatible endpoint may or may not support image output.
The function never consults the user's explicit per-dimension bindings
(`CapabilityBindings.bindings[task]`), so a deliberately assigned image model is
still counted as an uncovered gap. This exactly produces 4/6 (text, vision,
webdev, image-to-webdev covered; image-generation, image-edit missing).

## Goal

An explicitly bound dimension is reported as covered, matching the user's mental
model and the UI's own note that "Model-level evidence is checked at selection
time." Static adapter capabilities remain the basis for auto-routing coverage.

## Requirements

- `modelRoutingCoverage` treats a dimension as covered when EITHER:
  - some configured provider's adapter declares all required capabilities
    (existing auto-routing path), OR
  - there is an explicit binding for that dimension whose model is non-empty and
    whose `providerId` refers to a configured **enabled** provider.
- Stale bindings (provider deleted or disabled, empty model) do not count.
- `AiSection` passes the current `CapabilityBindings` into the coverage call.
- No change to actual task routing/execution — this is a summary/reporting fix.

## Acceptance Criteria

- [ ] With an `openai-compatible`-family provider and an explicit binding of a
      model to image-generation and image-edit, coverage reports those two as
      covered (no "capability gap" badge for them).
- [ ] Without bindings, behavior is unchanged (existing tests still pass).
- [ ] A binding to a disabled/absent provider, or with an empty model, is
      ignored.
- [ ] `pnpm exec vitest run src/components/settings/model-routing-summary.test.ts`
      passes, including a new explicit-binding case.
- [ ] Lint + full vitest green.
