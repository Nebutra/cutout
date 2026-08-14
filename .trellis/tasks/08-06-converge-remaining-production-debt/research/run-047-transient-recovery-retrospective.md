# Bug Analysis: run-047 serialized recovery after transient page transport failure

## 1. Root Cause Category

- **Category**: B/D/E - Cross-layer contract, test coverage gap, and implicit
  topology assumption.
- **Specific cause**: the shared image limiter correctly classified HTTP 502 as
  transient and reduced future concurrency, but the failed page left its suite
  immediately. Recovery existed only at the top-level user Retry boundary, and
  that action selected the first failed suite instead of all independent failed
  frontiers. A parallel three-suite DAG therefore recovered serially.

## 2. Bayesian Evidence

| Hypothesis | Prior | Live evidence | Posterior |
| --- | ---: | --- | ---: |
| Provider transport pressure is the owning failure | 45% | Sanitized terminal diagnostic was `provider-transport`; offline product notification recorded `images/edits failed: HTTP 502` | 95% |
| Credential/configuration failure | 25% | Native candidate, secret resolution, catalog verification, Provider response, and three Design Systems all passed | 2% |
| Page viewport or visual QA rejection | 30% | Terminal diagnostic was not `prototype-viewport` or quality; valid pages continued landing across suites | 3% |

Confidence is high. The failed bundle remains failed evidence and is not
reclassified after the source fix.

## 3. Why Earlier Fixes Failed

1. Aligning the desktop timeout behind the native 300-second failsafe removed
   premature cancellation, but did not add a bounded retry at the logical page
   node after an explicit transient response.
2. Adaptive shared concurrency reduced pressure for future claims, but the
   failed work item was rejected rather than re-entering its fair suite lane.
3. Frontier preservation avoided replaying settled pages, but one Retry claimed
   only the first failed suite. Three failed siblings required three full UI
   settlement cycles and pushed recovery beyond an acceptable journey budget.
4. Mocked E2E covered sequential frontier recovery as intended behavior, so it
   encoded the performance defect instead of challenging the DAG topology.

## 4. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Retry a classified transient page transport once with a fresh paid attempt id and stable logical node id. | Done |
| P0 | Scheduling | Re-enter the suite lane after the limiter observes the failure, preserving round-robin fairness and reduced concurrency. | Done |
| P0 | Recovery | One user Retry claims every currently failed suite frontier and resumes them under the shared ceiling. | Done |
| P0 | Evidence | Count every repeated page call in actual, planned-plus-retry, and logical-node retry evidence. | Done |
| P0 | Tests | Exhaust one suite's transient page budget, fail another with a non-transient output error, then prove one Retry recovers both without replaying ready siblings. | Done |
| P0 | Real E2E | Rebuild and rerun from a new pristine VM until terminal evidence passes. | Pending |

## 5. Systematic Expansion

- **Similar issues**: direct assets and board regions already preserve task
  frontiers, but every remote node must be checked for the same distinction
  between attempt-local transport recovery and user-owned semantic Retry.
- **Design improvement**: retry identity belongs to the smallest paid logical
  node; user Retry owns all failed independent frontiers visible at one DAG
  settlement boundary. Neither authority should be process-global.
- **Process improvement**: performance E2E must inject failures into multiple
  concurrent siblings. A single failing fixture cannot reveal serialized
  recovery or hidden N-times user interaction.

## 6. Knowledge Capture

- [x] Updated `cutout-pipeline.md` with transient page attempt and batch-suite
  frontier contracts.
- [x] Updated the cross-layer Retry topology checklist.
- [x] Replaced the sequential multi-suite recovery regression.
- [x] Added fresh `attempt-N` identity assertions and exact retry accounting.
- [ ] Attach a passing fresh-VM evidence bundle after rebuilding the candidate.
