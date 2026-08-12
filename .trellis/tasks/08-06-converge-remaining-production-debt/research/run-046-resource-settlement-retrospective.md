# Bug Analysis: run-046 resource settlement blocked by optional naming

## 1. Root Cause Category

- **Category**: B/D/E - Cross-layer contract, test coverage gap, and implicit
  assumption.
- **Specific cause**: required slice/task publication and optional AI-generated
  display names shared one Promise join. `runRegionBreakdown` published real
  artifacts, then awaited every naming job before returning. Structured-output
  naming used a streaming transport without a stage-owned overall deadline, so
  an absent terminal event could leave the suite `generating` indefinitely.

## 2. Bayesian Evidence

| Hypothesis | Prior | Live evidence | Posterior |
| --- | ---: | --- | ---: |
| Optional post-slice Promise did not settle | 45% | Five planned slice/blob records persisted; no result; WebContent idle; no Provider TCP; the only post-publication join was naming | 90% |
| Provider image generation was merely slow | 30% | Contradicted by no Provider socket and all five output projections already existing | 5% |
| CV/IndexedDB was still computing | 25% | Contradicted by idle renderer and persisted blobs; deterministic work precedes publication | 5% |

Confidence is high enough for the architecture fix, but the old build remains a
failed run rather than being reclassified as successful.

## 3. Why Earlier Fixes Failed

1. Scheduler concurrency and retry-frontier fixes improved paid image work but
   did not audit non-paid Promises after artifact publication.
2. The packaged watchdog observed page/resource counts, but `3/5` could not
   distinguish active required work from already-produced quality blockers plus
   a stuck optional tail.
3. Unit tests covered fast naming success and rejection only. None supplied a
   Promise that never settled, so the accidental critical-path join remained.

## 4. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Use authoritative manifest labels during production and remove AI naming from the resource-pack path. | Done |
| P0 | Runtime | Bound and cancel optional naming independently; observe late failure without awaiting it. | Done |
| P0 | Test | Prove a never-resolving naming Promise cannot delay required slice settlement. | Done |
| P0 | Contract | Record semantic-count and optional-enhancement ownership rules in prototype and cross-layer specs. | Done |
| P0 | Real E2E | Rebuild and rerun from a pristine VM through complete verified delivery. | Pending |

## 5. Systematic Expansion

- **Similar issues**: thumbnails, auto-descriptions, indexing, analytics, export
  decoration, and notification delivery can all accidentally become terminal
  joins after their authoritative artifact already exists.
- **Design improvement**: each DAG node declares whether it is required or
  optional. Required nodes own readiness; optional nodes own a deadline and may
  enrich only while the owning revision remains current.
- **Process improvement**: long-path QA must inspect persistent intermediate
  state and include a never-settling dependency test. A fast mocked rejection
  does not exercise liveness.

## 6. Knowledge Capture

- [x] Updated `prototype-generation.md`.
- [x] Updated the cross-layer thinking guide.
- [x] Added unit and source-wiring regressions.
- [ ] Attach complete run-047 evidence and contact-sheet inspection.
