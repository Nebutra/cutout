# Bug Analysis: run-045 false completion and invalid page canvases

## 1. Root Cause Category

- **Category**: B/D/E - Cross-layer contract, test coverage gap, and implicit
  assumption.
- **Specific cause**: the Provider response becoming available, a Vision review
  receipt becoming valid, and a page becoming deliverable were represented by
  the same artifact list length. Page dimensions were trusted after browser
  decode but were not checked against the Agent-authored viewport at generation,
  persistence recovery, or terminal suite validation.

## 2. Why Earlier Fixes Failed

1. Retry preserved successful pages, but it only repaired the current frontier;
   it did not make page readiness or canvas validity structural.
2. Vision QA could reject a rotated page, but probabilistic review was asked to
   detect a deterministic byte-level fact and could not provide stable coverage.
3. Packaged progress counted returned pages before overlapping reviews joined,
   producing `6/6 complete` immediately before a failed terminal state.
4. Transient pressure reduced shared concurrency permanently, so one upstream
   failure changed the rest of a long run from bounded parallelism to serial
   execution even after the route recovered.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Count pages only from valid passing hash-bound review receipts. | Done |
| P0 | Runtime contract | Validate intrinsic bytes, persisted dimensions, planned orientation, and bounded proportions before Vision QA. | Done |
| P0 | Persistence | Reuse the same viewport contract during recovery and ready-suite validation. | Done |
| P0 | Observability | Classify the exact failure as credential-free `prototype-viewport`. | Done |
| P1 | Scheduler | Recover one concurrency slot after two successful calls, bounded by the configured ceiling. | Done |
| P0 | Real E2E | Rebuild and rerun the full packaged asset journey from a pristine VM. | Pending |

## 4. Systematic Expansion

- **Similar issues**: Design System media, board sources, direct assets, slices,
  and resource-pack bindings must distinguish byte availability from accepted
  delivery evidence.
- **Design improvement**: deterministic validators own measurable facts; Vision
  owns semantic and aesthetic judgment; delivery projection joins both receipt
  classes against the exact plan and content hash.
- **Process improvement**: real E2E failures must yield a stable diagnostic,
  shared contract, persistence check, and regression before another run. A
  successful retry alone cannot close a QA finding.

## 5. Knowledge Capture

- [x] Updated the prototype-generation domain contract.
- [x] Added the generated-artifact QA checklist to the cross-layer guide.
- [x] Added generation, recovery, terminal candidate, diagnostic, progress, and
      scheduler regression coverage.
- [ ] Attach the first complete run-046 evidence bundle and final resource
      contact-sheet inspection after the packaged rerun.
