# Packaged E2E provider-failure evidence - 2026-08-06

## Observation

The signed isolated macOS bundle ran the real background product journey with
native credential discovery and the configured OpenAI-shaped image route. It
completed natural conversation, Agent planning, three Design System directions,
and selection without becoming frontmost.

The first prototype suite planned 7 routes and 7 reusable resources. The live
run then produced these terminal suite observations:

- suite 1 retained 4/7 completed pages and failed with the sanitized error
  `Provider deadline exceeded.`
- suite 2 planned 7 routes and 5 resources, then failed before its first page
  with `images/edits failed: HTTP 502`.
- suite 3 planned 8 routes and 8 resources and had started page production when
  the obsolete build was stopped to avoid further paid calls.
- page Vision review returned an unavailable structured-output verdict. The
  current packaged validator would have accepted the resulting
  `attention-required` suite as release success.

The stopped run remains partial evidence only. It is not a release proof.

## Bug Analysis: Provider failure amplification and false quality completion

### 1. Root Cause Category

- **Category B - Cross-layer contract**: the desktop paid-tool owner timed out
  after 180 seconds while the native image transport intentionally allowed 300
  seconds. The outer owner could therefore cancel a still-valid transport and
  turn provider latency into duplicate paid work on Retry.
- **Category E - Implicit assumption**: the suite orchestrator treated a
  route-wide timeout as candidate-local and continued claiming sibling work.
  The next sibling immediately received HTTP 502, matching provider stress
  rather than an independent candidate defect.
- **Category D - Test coverage gap**: unit and mocked E2E gates accepted
  `attention-required` as terminal packaged success, even though the release
  requirement says fidelity-rejected or unavailable output is not proof.

### 2. Bayesian Update

| Hypothesis | Prior | Live evidence | Posterior |
| --- | ---: | --- | ---: |
| Provider is simply slow but still valid | 35% | Failure occurred at the exact 180-second desktop deadline while native transport allows 300 seconds | 70% |
| One page/candidate is malformed | 30% | A different suite failed at its first call with HTTP 502 | 10% |
| Shared route is transiently unhealthy and fan-out amplifies it | 35% | Timeout followed by immediate sibling 502 under the same route | 20% |

The timeout mismatch is proven. Provider overload amplification is strongly
supported but still needs a successful rerun after containment.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | One exported paid-image deadline shared by desktop owner and packaged owner watchdog, aligned to the native 300-second failsafe | DONE |
| P0 | Runtime | Stop queued sibling image claims after a route-wide transient failure; settle already in-flight calls and preserve completed frontiers | DONE |
| P0 | Test coverage | Packaged outcome and external evidence validator accept only `qualityReviewStatus=passed` | DONE |
| P1 | E2E | Rebuild and repeat the complete signed background run from clean isolated state | TODO |
| P1 | Documentation | Record deadline ordering, route-wide containment, and release-only quality proof in active specs | DONE |

### 4. Systematic Expansion

- All renderer/native deadline pairs must have one ownership order. An outer
  deadline shorter than the transport is allowed only when cancellation is
  proven to stop billing and is explicitly tested; image requests do not meet
  that exception.
- Candidate-local integrity failures may remain isolated. Authentication,
  rate-limit, timeout, network, and 5xx failures are route-wide health signals
  and must prevent new queued work from amplifying the same route.
- Product delivery may retain observational QA warnings for user review. A
  release benchmark has a stricter purpose and cannot use those warnings as
  evidence that fidelity was verified.

### 5. Knowledge Capture

- Update `byok-provider-protocols.md` for one aligned 300-second image owner.
- Update `prototype-generation.md` and `cutout-pipeline.md` for route-wide
  containment and passed-only packaged quality proof.
- Keep the cross-layer cancellation checklist as the review authority; add
  focused regressions instead of another local timeout constant.

## Follow-up: Visual QA structured-output failure

A credential-safe real probe against the configured MOX `gpt-5.5` route proved
that the relay supports image input, JSON-object output, and forced tool calls.
The failure was inside Cutout's adapter contract:

- `qaVerdictSchema` gave `failures` a Zod default, so AI SDK emitted an optional
  JSON Schema property while requesting OpenAI strict schema mode. The relay
  correctly rejected that schema because every strict property must be listed
  in `required`.
- `GenerationService` then cached that call-local invalid schema as if the
  provider/model did not support native structured output. All later schemas
  on that route skipped the otherwise working native JSON path.
- Error classification matched `response_format` before `invalid schema`,
  turning the schema bug into false protocol-capability evidence.

The prevention contract is architectural: OpenAI-shaped structured calls use
non-strict provider schemas plus final local Zod validation; the QA verdict
requires both fields; only an explicit protocol-level unsupported response can
populate the negative capability cache; and regression tests prove that one
schema mismatch cannot alter the next call's route.
