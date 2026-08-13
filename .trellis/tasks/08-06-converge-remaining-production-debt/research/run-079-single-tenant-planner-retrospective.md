# Run 079 single-tenant Planner retrospective

## Bug Analysis: Planner scheduling exceeded native runtime ownership

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract.
- **Specific Cause**: the formal Planner treated native Codex like a concurrent
  Provider. It started three page-stage deadlines before an adapter-local queue,
  while Rust owned exactly one active turn for the whole process. Separate
  adapter instances and windows were outside that queue, and native contention
  could terminate another workspace's active process.

### 2. Why Earlier Fixes Failed

1. Serializing inside one adapter fixed simultaneous turns only after Planner
   deadlines had already started.
2. Limiting alternative-suite concurrency did not limit page expansion inside
   one Plan.
3. Fresh per-stage conversations reduced context coupling, but a stable prefix
   plus swallowed reset failures could still resume a stale binding.
4. Reducing the removed planning-seed ceiling to 2,000 tokens applied to the
   whole multi-tool loop and unintentionally constrained richer tools.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Acquire one renderer-wide native planning session before Plan deadlines | DONE |
| P0 | Scheduling | Set Codex page expansion parallelism to one before stage deadlines start | DONE |
| P0 | Native custody | Reject all overlapping turns as busy; never replace another workspace | DONE |
| P0 | Context isolation | Use run-unique conversation ids and validate saved revision plus digest | DONE |
| P0 | Tool contract | Apply 2k only to a classification-only offered tool set | DONE |
| P0 | Tests | Cover cross-adapter sessions, queued cancellation, native contention, stale binding, and page parallelism | DONE |
| P0 | E2E | Rebuild and repeat the complete signed packaged run | PENDING |

### 4. Systematic Expansion

- **Similar issues**: any single-tenant local runtime, GPU, browser, or native
  process needs admission control above item deadlines and fan-out.
- **Design improvement**: concurrency is a runtime capability, not an internal
  Planner constant. The native layer is the final ownership authority even when
  renderer queues provide fairness.
- **Process improvement**: concurrency tests must use independent adapter or
  window instances; one fast mock instance cannot prove process-wide custody.

### 5. Knowledge Capture

- [x] Updated the prototype-generation contract.
- [x] Updated the cross-layer cancellation/deadline guide.
- [x] Added renderer and Rust regressions.
- [ ] Pass the fresh signed packaged Run 079 before publication or install.

## Bug Analysis: Native authority was read in a non-native renderer

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract.
- **Specific Cause**: run preflight correctly introduced a fresh read of the
  desktop capability-binding authority, but called the Tauri plugin store in
  every renderer. The browser host has no native store, so an expected missing
  Provider state became an internal `invoke` failure.

### 2. Why Earlier Checks Missed It

1. Component E2E mocks replaced the complete persistence module and therefore
   did not exercise the real host capability boundary.
2. The first full visual run was concurrent with locale extraction, which
   rewrote Vite-watched files and added unrelated mobile navigation failures.
3. The Deliver test asserted an obsolete empty-result label instead of the
   actual honest unconfigured state it intended to preserve.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Centralize callable native-host detection and branch authority loading by host | DONE |
| P0 | Runtime | Keep desktop execution bound to a fresh native read; use query projection only without native host | DONE |
| P0 | Tests | Cover native-vs-browser authority and preserve the unconfigured state through Deliver navigation | DONE |
| P1 | Process | Never run source-rewriting i18n extraction beside a live Playwright/Vite server | DONE |

### 4. Systematic Expansion

- **Similar issues**: updater, speech, repository, registry and credential
  adapters that render in both Tauri and browser environments.
- **Design improvement**: a persistence authority includes its host capability;
  importing its adapter does not prove the host exists.
- **Process improvement**: parallel quality gates must be read-only with respect
  to files watched by another running gate.

### 5. Knowledge Capture

- [x] Added the host-authority checklist to the cross-layer guide.
- [x] Added unit, component E2E and browser navigation regressions.
- [ ] Pass the fresh signed packaged Run 079 before publication or install.

## Bug Analysis: Native Planner settlement did not wake the hidden WebView

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract.
- **Specific Cause**: Planner deadlines and Codex process custody had moved to
  Rust, but workflow continuation still depended on WKWebView draining the
  completed invoke replies. In the headless background session the Codex child
  exited and native clocks elapsed, while the renderer remained suspended at
  `planner-stage-outline-attempt-1` for more than five minutes.

### 2. Why Earlier Fixes Failed

1. A native monotonic sleep fixed renderer timer drift, but not delivery of its
   completion back into the throttled renderer.
2. `NSProcessInfo` activity and a visible non-focusable background window kept
   the process alive, but did not guarantee WebKit task-queue drainage.
3. A native process timeout correctly terminated Codex, yet its Tauri command
   result was subject to the same renderer observation gap.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Add one fixed packaged-only no-op renderer pulse | DONE |
| P0 | Liveness | Pulse from the background watchdog and terminal native boundaries | DONE |
| P0 | Foreground safety | Reject activation/focus/front-ordering APIs and retain external sampling | DONE |
| P0 | Tests | Cover fixed-script scope plus native deadline/Codex settle hooks | DONE |
| P0 | E2E | Rebuild and repeat the complete signed packaged run | PENDING |

### 4. Systematic Expansion

- **Similar issues**: native Provider responses, screenshots, file pickers and
  any long-running host operation whose next DAG node is renderer-owned.
- **Design improvement**: native completion, renderer observation and durable
  workflow checkpoint are separate states; release evidence must observe all
  three.
- **Process improvement**: when progress stalls, inspect both the native child
  set and checkpoint mtime before increasing an outer timeout.

### 5. Knowledge Capture

- [x] Updated the prototype-generation contract.
- [x] Updated the cross-layer settlement checklist.
- [x] Added source and Rust regressions.
- [ ] Pass a fresh signed packaged Run 079 before publication or install.
