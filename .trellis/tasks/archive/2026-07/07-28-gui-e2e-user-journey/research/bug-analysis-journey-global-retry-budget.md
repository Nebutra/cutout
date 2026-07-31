# Bug Analysis: journey-global Retry budget

## 1. Root Cause Category

- **Category**: E - Implicit Assumption
- **Specific Cause**: The packaged GUI driver stored one module-global retry
  count and rejected every Retry after the first. That model assumed a complete
  multi-suite DAG could encounter at most one transient Provider failure. The
  product continuation itself retained completed pages and resource work, but
  the driver stopped exercising the visible Retry control when a different
  suite later failed.

### Bayesian audit

| Hypothesis | Prior | Evidence update | Posterior |
| --- | ---: | --- | ---: |
| Provider was permanently unavailable | 35% | Suite 2 completed 6 pages and 8 resources after Retry; later requests also completed | 5% |
| Resume replayed or corrupted prior state | 35% | Suite 2 resumed from 4/6 to 6/6, then reached 8/8 without replay | 5% |
| Driver recovery budget was scoped incorrectly | 30% | `runRetryCount >= 1` was the sole guard preventing a second visible Retry | 90% |

Confidence is above 90% because the terminal diagnostic was
`provider-transport`, the product still exposed a resumable failed Suite 3 at
3/6, and source inspection found a deterministic driver-only rejection.

## 2. Why Earlier Fixes Failed

1. Missing-page resume fixed replay and stale-state ownership, but retained the
   driver's unrelated single-retry assumption.
2. Synchronous Retry acknowledgement prevented a premature stale read, but it
   only made the first Retry reliable; it did not model later independent
   failures in the same long journey.
3. Component E2E injected one transient error, so it never exercised failure in
   two different candidate frontiers.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Track retries by failed candidate plus page/resource completion frontier | DONE |
| P0 | Runtime | Require product-owned acknowledgement before another click | DONE |
| P0 | Cost safety | Enforce per-frontier and complete-journey ceilings | DONE |
| P0 | Test coverage | Recover Suite 2, then independently recover Suite 3 | DONE |
| P1 | Documentation | Add topology-aware Retry contract to prototype and cross-layer specs | DONE |
| P1 | Real proof | Rerun the complete packaged journey from a fresh VM | TODO |

## 4. Systematic Expansion

- **Similar issues**: Design candidate generation, material production, Coding
  repair, and any multi-stage benchmark can be falsely terminated by a
  process-wide retry allowance.
- **Design improvement**: Recovery authority should follow stable logical node
  identity or a monotonic completion frontier, while a separate global ceiling
  controls aggregate paid amplification.
- **Process improvement**: Long-path E2E tests must inject transient failures in
  at least two independent stages or siblings, not only one happy recovery.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/prototype-generation.md`.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- [x] Added focused packaged-driver regressions.
- [ ] Attach a terminal fresh-VM result proving all three suites, packs, and
      Coding apply after the repair.
