# Bug Analysis: Prototype DAG amplifies every page into 4-7 image calls

## 1. Root Cause Category

- **Category**: B - Cross-Layer Contract, with E - Implicit Assumption
- **Specific cause**: the product counted one page and one board as two visual
  outputs, but execution expanded each page into mandatory generate + refine,
  an outer QA re-roll, a text-free page prepass, a board generation, and a
  second board QA re-roll. Board pages were also processed serially and each
  board uploaded every sibling page as context.
- **Evidence update**: priors were Provider latency 45%, insufficient
  concurrency 30%, and orchestration amplification 25%. `run-024b-fresh`
  needed 34:23 to commit one of six pages while two Provider connections stayed
  active. Source tracing showed 4-7 image invocations per page and serial board
  production, raising orchestration amplification above 95% confidence. The
  Provider is slow, but the DAG multiplied that latency.

## 2. Why Earlier Fixes Were Insufficient

1. Grouping eight assets into one board removed 48 direct asset calls per
   suite, but `textFreeSource` silently added another paid page edit before each
   board.
2. Page concurrency 2 hid the fact that each logical page always performed a
   generate and refine pair before the outer QA gate could settle.
3. QA was treated as a default repair loop rather than evidence. A single
   rejection doubled the already doubled page transaction.
4. Region concurrency did not help the compact closure because each page had
   exactly one board region and the outer page loop remained serial.
5. The visual bridge attached all reference ids, but `edit-image` consumed only
   the first artifact. Extra context cost storage and bookkeeping without
   reaching the Provider.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Use one reference-conditioned paid invocation per page attempt. | DONE |
| P0 | Context | Pass every bounded ordered edit reference and fail if one is missing. | DONE |
| P0 | Orchestration | Default paid QA re-rolls to zero; retain verdicts for explicit regeneration. | DONE |
| P0 | Orchestration | Remove the text-free paid prepass and generate page boards concurrently. | DONE |
| P0 | Context | Bound board references to Design System plus the stable anchor page. | DONE |
| P0 | Test coverage | Lock page call count, reference cardinality, board concurrency, and no-prepass wiring. | DONE |
| P0 | VM evidence | Measure the complete artifact graph from a new pristine VM. | TODO |

## 4. Systematic Expansion

- **Similar issues**: Design System variants, direct assets, repair flows, and
  any nested DAG whose node already owns retry/refinement while a caller adds
  another retry loop.
- **Design improvement**: product-level output counts must compile into an
  explicit paid-request budget before execution. Hidden refinement and prepass
  nodes are contract violations, not implementation details.
- **Process improvement**: E2E progress needs logical output counts and paid
  request counts so latency can be attributed without reading source after a
  30-minute stall.
- **Knowledge gap**: concurrency cannot repair an inflated graph. Remove
  redundant nodes and context first, then tune parallelism against measured
  Provider capacity.

## 5. Knowledge Capture

- [x] Added the bounded critical-path contract to the pipeline spec.
- [x] Preserved sanitized `run-024b-fresh` progress/process/window/connection
  evidence.
- [x] Added focused executor, component, and source regressions.
- [ ] Replace the VM-evidence TODO with the fresh optimized run and measured
  total duration before completion.
