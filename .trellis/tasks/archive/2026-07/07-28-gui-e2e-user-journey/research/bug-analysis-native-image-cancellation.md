# Bug Analysis: Native image requests outlive their Agent run

## 1. Root Cause Category

- **Category**: B - Cross-Layer Contract
- **Specific cause**: the Agent run owned cancellation in React, the desktop
  tool loop owned a 300-second timer, Tauri IPC exposed no cancellation
  identity, and Rust independently retained the HTTP future for 600 seconds.
  The direct Design System image call also omitted the owning lease signal.
- **Evidence update**: initial priors were provider latency 40%, image endpoint
  incompatibility 30%, and orchestration lifetime drift 30%. `run-012` stayed
  at `planner-stage-complete` for more than nineteen minutes while the declared
  desktop deadline was 300 seconds. Source tracing then showed the missing
  signal and uncancellable IPC, raising lifetime drift above 90%. Provider
  usability remains unproven and is tested separately in `run-013`.

## 2. Why Fixes Failed

1. JavaScript cooperative cancellation discarded late bytes but did not stop
   the native paid request.
2. A 300-second desktop deadline rejected one promise while Rust retained the
   underlying request for up to 600 seconds.
3. Authenticated model-catalog presence was projected as route readiness, so
   evidence could not distinguish configuration from a proven image result.
4. Candidate concurrency allowed a third request to start after the same route
   had already produced a route-wide failure.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Bind renderer, IPC, and Rust HTTP work with one opaque request id and owner signal. | DONE |
| P0 | Runtime | Drop the matching `reqwest` future on abort and align the native generation deadline to 300 seconds. | DONE |
| P0 | Evidence | Separate `image-route-catalogued`, `image-execution-started`, and `image-execution-proven`. | DONE |
| P1 | Orchestration | Stop claiming unstarted sibling candidates after a route-wide failure. | DONE |
| P1 | Test coverage | Cover native registration/cancel, renderer cancellation, closed checkpoints, and route-wide failure classification. | DONE |
| P0 | Packaged E2E | Rebuild, sign, and prove the fix from fresh `run-013`. | TODO |

## 4. Systematic Expansion

- **Similar issues**: streamed text, multipart image edit, buffered image
  generation, and any future Tauri command that wraps a paid remote future.
- **Design improvement**: request lifetime is a cross-layer contract; an outer
  promise race is insufficient unless the innermost side effect is cancelled.
- **Process improvement**: packaged E2E must checkpoint the earliest useful
  closed boundary and record terminal candidate states.
- **Knowledge gap**: catalog evidence proves discoverability and authentication,
  not successful execution of every advertised model or modality.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/byok-provider-protocols.md` with command
  signatures, cancellation behavior, deadlines, validation, and tests.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md` with a
  cancellation ownership checklist.
- [x] Added task-local VM evidence and the `run-012` journey record.
- [ ] Replace this TODO with fresh packaged `run-013` evidence before claiming
  real image-provider or downstream artifact success.
