# Bug Analysis: macOS suspends a Tauri-visible background WebView

## 1. Root Cause Category

- **Category**: E - Implicit Assumption, with D - Test Coverage Gap
- **Specific cause**: the packaged harness treated
  `WebviewWindow::is_visible()` as proof that macOS considered the application
  visible and would keep WKWebView scheduled. In `run-023`, Tauri still saw a
  normal window while System Events reported Cutout `visible=false`; after the
  native Provider socket closed, neither stream completion nor a renderer-owned
  120-second timer executed.
- **Bayesian update**: before `run-023`, priors were a missing stream terminal
  event (40%), another renderer cancellation defect (30%), and macOS process
  suspension (30%). The closed TCP connection plus two independent renderer
  continuations failing to execute reduced the first two hypotheses. The
  discriminating System Events result (`visible=false`) and low-priority
  process state raise application suspension above 90% confidence.

## 2. Why Fixes Failed

1. The stream iterator race fixed an unresolved iterator but still required the
   renderer event loop to run its timeout callback.
2. Treating native invoke completion as terminal closed the transport contract
   but could not deliver that completion into a suspended WebContent process.
3. `run-020` showed a non-focusable Tauri window and asserted
   `is_visible()`, but did not inspect macOS application visibility or retain a
   process activity. It fixed the window-layer symptom, not the scheduling
   boundary.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | In packaged-E2E mode, unhide the macOS application without activation and retain a user-initiated process activity. | DONE |
| P0 | Safety | Keep Accessory activation policy and a non-focusable window; reject focus. | DONE |
| P0 | Test coverage | Lock the lifecycle calls inside the dedicated E2E branch with a source regression. | DONE |
| P0 | VM evidence | Assert non-frontmost safety, unchanged foreground owner, normal process scheduling, and post-native-await renderer progress. | DONE |
| P1 | Documentation | Record that Tauri visibility is not macOS application liveness. | DONE |

## 4. Systematic Expansion

- **Similar issues**: updater polling, long-running imports, native dialogs,
  streamed Coding requests, and any hidden WKWebView workflow that depends on
  renderer timers after a native await.
- **Design improvement**: lifecycle readiness must be a closed cross-layer
  predicate: window state, application state, process activity, focus safety,
  and a later renderer heartbeat.
- **Process improvement**: packaged E2E evidence must interrogate the native OS
  state rather than accepting framework-level state as an equivalent proxy.
- **Knowledge gap**: `show()` and `is_visible()` describe the Tauri window;
  they do not guarantee that AppKit has unhidden the application or that WebKit
  will remain scheduled under App Nap.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/cutout-pipeline.md` with the packaged
  macOS liveness contract and VM validation matrix.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md` with an OS
  and renderer liveness checklist.
- [x] Added the sanitized `run-023-fresh` evidence and journey record.
- [x] Confirmed this repository has no `src/templates/markdown/spec` source
  tree; `.trellis/spec` is project-local, so no unrelated template copy was
  invented.
- [x] `run-024b-fresh` kept Finder frontmost, moved the app from low-priority
  `SN` to normal `S`, and advanced through Planner completion after native
  transport settled. System Events still projected the Accessory app as
  `visible=false`, proving that field is evidence but not a liveness predicate.

The task remains uncommitted until the complete artifact graph passes; the
generic break-loop commit step cannot override this E2E task's release gate.
