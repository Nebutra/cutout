# Run 053 rejected-page frontier retrospective

Date: 2026-08-11

## Outcome

The signed packaged background run remained foreground-safe but failed at the
one-hour delivery deadline:

```text
harness.status: failed
harness.reason: outer-timeout
foreground activations: 0 / 3620 samples
suite 1: 4 / 7 accepted pages after Retry
suite 2: 2 / 7 accepted pages before failure
resource packs: 0
```

Evidence is retained under `/private/tmp/cutout-run-053-final-evidence`. Real
page objects extracted from the run are complete, readable, coherent production
screens. The failure therefore falsifies image-quality incapability as the
primary cause and identifies repeat work in the recovery architecture.

## Bug Analysis: Rejected pages lost their repair identity

### 1. Root Cause Category

- **Category: B - Cross-Layer Contract.** Page QA, page-set settlement, suite
  frontier persistence, explicit Retry, Provider references, and packaged
  evidence each owned only part of the recovery contract.
- **Category: D - Test Coverage Gap.** Local QA Retry and accepted-page resume
  were tested separately; no rendered regression exhausted local QA, crossed a
  new run boundary, and proved that the next request edited the rejected bytes.
- **Category: E - Implicit Assumption.** `pages` was treated as synonymous with
  reusable passing pages. A rejected artifact is not reusable delivery, but it
  is authoritative repair input and cannot be discarded.

### 2. Why earlier fixes failed

1. **Local QA feedback:** failures were appended to the prompt, but the repair
   request used Design System, optional material, and anchor references. It did
   not include the exact rejected page, so the model redrew instead of editing.
2. **Frontier preservation:** `onProgress` retained reviewed artifacts, but
   suite settlement replaced the frontier with `acceptedPages`. The latest
   rejected bytes and receipt disappeared immediately before explicit Retry.
3. **Resume filtering:** the next continuation correctly reused passing pages,
   but it had no separate rejected-page repair map. A single passing predicate
   accidentally governed both delivery reuse and repair continuity.
4. **Progress evidence:** accepted counts showed forward motion, but durable run
   events did not record review attempt, page identity, rejection lessons, or
   reviewer unavailability. The packaged failure could not explain redraws.

### 3. Prevention mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Keep passing pages as reusable delivery authority and latest rejected pages as separate repair authority in the same suite frontier. | Done |
| P0 | Context | Page repair references rejected bytes first, Design System second, optional material third; omit predecessor/anchor and remain within Qwen Image 3's three-reference limit. | Done |
| P0 | Context | Feed the prior receipt failures into the first paid attempt after explicit suite Retry. | Done |
| P0 | Evidence | Persist bounded, sanitized page-review started/passed/rejected events with suite, page, and attempt identity. | Done |
| P0 | Tests | Exhaust local QA, cross explicit Retry, prove byte-to-byte edit continuity, no accepted-page replay, exact reference count, lesson carry, and event redaction. | Done |
| P0 | E2E | Repeat the pristine signed packaged run and require complete pages plus resource packs inside the existing delivery budget. | Pending |

### 4. Systematic expansion

- **Similar issues:** rejected direct assets and board outputs also need distinct
  delivery-versus-repair authority. Their retry frontiers must never retain only
  successful publications if exact failed bytes are useful edit inputs.
- **Design improvement:** a DAG frontier is a typed continuation checkpoint, not
  a list of successes. It must retain the latest settled artifact and verdict
  for every incomplete logical node until that node passes or is abandoned.
- **Process improvement:** Retry tests must cross the same persistence/run
  boundary as the real action and inspect the next Provider request. Call counts
  alone cannot distinguish continuation from blind redraw.

### 5. Knowledge capture

- [x] Retain Run 053 failure evidence and representative page objects.
- [x] Add the rendered cross-run repair regression.
- [x] Update the prototype generation code-spec.
- [x] Update the cross-layer Retry checklist.
- [ ] Complete a fresh packaged falsification run before publication.

## Bayesian diagnosis

Before extracting real objects, plausible causes were poor image capability
(35%), orchestration/retry loss (40%), and Provider throughput (25%). Four
high-fidelity pages plus 41 content-addressed visual objects make general model
incapability unlikely. Source tracing then showed deterministic rejected-byte
loss at two frontier writes, raising retry/context ownership above 90% as the
primary amplification mechanism. Upstream latency remains material, so only a
fresh complete run can prove that removing blind redraws is sufficient.
