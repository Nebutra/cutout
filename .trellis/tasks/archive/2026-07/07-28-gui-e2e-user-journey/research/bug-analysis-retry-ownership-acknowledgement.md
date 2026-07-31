## Bug Analysis: Retry click did not prove product-owned recovery

### 1. Root Cause Category

- **Category**: B/D - Cross-Layer Contract and Test Coverage Gap
- **Specific Cause**: the packaged driver treated a successful DOM `click()` as
  proof that React had accepted a retry. The workspace left the settled failure
  visible while asynchronous Provider and route preflight ran, so the driver
  could observe the old terminal state before the product owned a new run.

### 2. Why Fixes Failed

1. Clearing failure inside `createAssets`: this happened after the UI event
   crossed another callback boundary and did not provide an explicit product
   acknowledgement to the packaged driver.
2. Waiting after the click: a time window reduced the race but still inferred
   ownership from incidental `working` or failure state instead of a dedicated
   product event.
3. Unit-only retry checks: they proved the helper selected and clicked the
   reviewed control, but not that the rendered workspace synchronously disabled
   duplicate retries and began a bounded continuation.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Architecture | Clear stale failure and enter busy state synchronously in the Retry action owner. | DONE |
| P0 | Runtime evidence | Expose a credential-free packaged-E2E retry-start counter owned by the workspace. | DONE |
| P0 | Test coverage | Require the driver to observe product acknowledgement before evaluating the old failed snapshot. | DONE |
| P0 | Rendered regression | Inject one transient suite failure, click the visible Retry control, assert immediate working state, and require missing-work-only recovery. | DONE |
| P1 | Documentation | Add Retry/Resume ownership to prototype and cross-layer specifications. | DONE |

### 4. Systematic Expansion

- **Similar Issues**: approval, cancel, resume, apply, and regeneration actions
  can all cross UI, store, IPC, and remote execution boundaries where a click is
  weaker evidence than product-owned state.
- **Design Improvement**: every long-running action needs one explicit ownership
  acknowledgement distinct from both the initiating DOM event and terminal
  success/failure.
- **Process Improvement**: packaged tests must assert rendered action ownership
  before using persisted terminal state as the next decision input.

### 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/prototype-generation.md`.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- [x] Added packaged-driver and rendered-workspace regressions.
- [x] Preserved fresh VM run 031 evidence.
