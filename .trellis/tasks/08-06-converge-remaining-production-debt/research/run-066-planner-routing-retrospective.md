# Run 066 planner-routing retrospective

## Bug Analysis: Natural intent selected the monolithic Planner

### 1. Root Cause Category

- **Category: E - Implicit Assumption.** `planPrototypeWithinDeadline` treated
  the absence of a page-count mention as evidence that a request was small. In
  the product, natural business intent normally omits page quotas and expects the
  Agent to derive topology, so the common path requested one oversized complete
  plan before progressive planning was even considered.
- **Secondary category: D - Test Coverage Gap.** Many monolithic Planner tests
  used terse briefs without explicit scope, accidentally encoding the same
  assumption. No regression asserted that a realistic uncounted restaurant or
  product brief reached the outline stream before `generateObject`.

### 2. Why Earlier Fixes Failed

1. Provider routing and Keychain fixes proved Qwen catalog and exact image
   bindings, but Run 066 failed before image execution. Those fixes were correct
   for their layers and could not improve Planner latency.
2. Adding progressive planning only for explicit four-plus-page briefs optimized
   benchmark-shaped inputs, not normal user intent. It left the common no-count
   path on the largest structured request.
3. DOM progress exposed Planner stages, but an unclassified timeout collapsed to
   `unknown`; without persisted stage checkpoints, the external observer could
   not distinguish a frozen Planner from Provider or orchestration failure.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Architecture | Use outline-first progressive planning whenever page count is absent or broad; reserve monolithic planning for explicit one-to-three-page scope. | DONE |
| P0 | Test coverage | Assert a natural business brief streams the outline before any structured expansion and never sends a complete-plan request first. | DONE |
| P0 | Cross-layer contract | Add `planner-timeout` to renderer classification, native enum, retained evidence validator, and parity tests. | DONE |
| P0 | Runtime evidence | Persist cumulative pipeline and Planner-stage checkpoints through the native packaged-E2E sink while waiting. | DONE |
| P1 | Input parsing | Require Chinese numerals to directly modify page units or use a page counter; reject name-internal numeral matches. | DONE |

### 4. Systematic Expansion

- **Similar issues:** candidate, page, resource, and QA work must select an
  execution shape from actual dependency structure, not from the absence of a
  user quota.
- **Design improvement:** use small bounded authority stages followed by
  parallel independent expansion and one validating join. Do not race duplicate
  paid Planners; that doubles cost, context, cancellation, and provenance.
- **Process improvement:** packaged E2E regressions must start with a natural
  business intent and assert the first paid/Agent operation, not only terminal
  output or benchmark-shaped counts.

### 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/prototype-generation.md`.
- [x] Updated the active task design and implementation plan.
- [x] Added focused Planner routing, numeral parsing, timeout classification,
      and renderer/native/evidence vocabulary parity tests.

## Evidence and confidence

Before Run 066, plausible causes were Planner/context shape (45%), remote image
Provider/network (35%), and renderer state/orchestration (20%). The signed app
read the native credential, catalogued DashScope, and persisted exact
`qwen-image-3.0` generation/edit bindings, but timed out at `planner-complete`
before any image call after 253.8 seconds. This raises Planner architecture above
95% confidence as the observed blocker; Qwen image throughput remains unmeasured
until the corrected packaged run reaches its first image execution.
