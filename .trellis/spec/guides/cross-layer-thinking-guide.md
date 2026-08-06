# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across layers before implementing.

---

## The Problem

**Most bugs happen at layer boundaries**, not within layers.

Common cross-layer bugs:

- API returns format A, frontend expects format B
- Database stores X, service transforms to Y, but loses data
- Multiple layers implement the same logic differently

---

## Before Implementing Cross-Layer Features

### Step 1: Map the Data Flow

Draw out how data moves:

```
Source → Transform → Store → Retrieve → Transform → Display
```

For each arrow, ask:

- What format is the data in?
- What could go wrong?
- Who is responsible for validation?

### Step 2: Identify Boundaries

| Boundary              | Common Issues                     |
| --------------------- | --------------------------------- |
| API ↔ Service         | Type mismatches, missing fields   |
| Service ↔ Database    | Format conversions, null handling |
| Backend ↔ Frontend    | Serialization, date formats       |
| Component ↔ Component | Props shape changes               |

### Step 3: Define Contracts

For each boundary:

- What is the exact input format?
- What is the exact output format?
- What errors can occur?

---

## Common Cross-Layer Mistakes

### Mistake 1: Implicit Format Assumptions

**Bad**: Assuming date format without checking

**Good**: Explicit format conversion at boundaries

### Mistake 2: Scattered Validation

**Bad**: Validating the same thing in multiple layers

**Good**: Validate once at the entry point

### Mistake 3: Leaky Abstractions

**Bad**: Component knows about database schema

**Good**: Each layer only knows its neighbors

### Mistake 4: Every Consumer Parses The Same Payload

**Bad**: A command reads JSONL events and casts fields inline:

```typescript
const thread = (ev as { thread?: string }).thread;
const labels = (ev as { labels?: string[] }).labels;
```

This looks local, but it means every consumer owns a private version of the
event contract. The next field change will update one command and miss another.

**Good**: Decode once at the event boundary, then export typed projections:

```typescript
if (!isThreadEvent(ev)) return false;
return ev.thread === filter.thread;
```

**Rule**: For append-only logs, JSON streams, RPC payloads, or config files,
create one owner for:

- event / payload type definitions
- type guards and normalization from `unknown`
- metadata projections used by UI commands
- reducers that replay state from the source of truth

Rendering code may format fields, but it must not redefine the payload contract.

---

## Checklist for Cross-Layer Features

Before implementation:

- [ ] Mapped the complete data flow
- [ ] Identified all layer boundaries
- [ ] Defined format at each boundary
- [ ] Decided where validation happens

After implementation:

- [ ] Tested with edge cases (null, empty, invalid)
- [ ] Verified error handling at each boundary
- [ ] Checked data survives round-trip
- [ ] Checked that consumers import shared decoders / projections instead of
      casting payload fields locally
- [ ] Checked that derived state points back to the source event identifier
      (`seq`, `id`, `version`) instead of inventing a second cursor

---

## Cross-Platform Template Consistency

In Trellis, command templates (e.g., `record-session.md`) exist in **multiple platforms** with identical or near-identical content. This is a cross-layer boundary.

### Checklist: After Modifying Any Command Template

- [ ] Find all platforms with the same command: `find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] Update all platform copies (Markdown `.md` and TOML `.toml`)
- [ ] For Gemini TOML: adapt line continuations (`\\` vs `\`) and triple-quoted strings
- [ ] Run `/trellis:check-cross-layer` to verify nothing was missed

**Real-world example**: Updated `record-session.md` in Claude to use `--mode record`, but forgot iFlow, Kilo, OpenCode, and Gemini — caught by cross-layer check.

---

## Generated Runtime Template Upgrade Consistency

Some generated files are both documentation and runtime input. In Trellis,
`.trellis/workflow.md` is parsed by `get_context.py`, `workflow_phase.py`,
SessionStart filters, and per-turn hooks. Template changes must be validated
against both fresh init and upgrade paths.

### Checklist: After Modifying A Runtime-Parsed Template

- [ ] Identify every runtime parser that reads the template, not just the file
      writer that installs it
- [ ] Check whether relevant syntax lives outside obvious managed regions
      such as tag blocks
- [ ] Verify fresh `init` output and a versioned `update` scenario that writes
      the older `.trellis/.version`
- [ ] Add an upgrade regression using an older pristine template fixture, then
      assert the installed file reaches the current packaged shape
- [ ] Update the backend spec that owns the runtime contract

---

## Versioned Documentation Boundary

Versioned documentation is a cross-layer boundary: source paths, `docs.json`
version routing, and the rendered version selector must all describe the same
release line.

### Checklist: Before Editing Versioned Docs

- [ ] Identify the target release line: stable, beta, or RC
- [ ] Verify the edited MDX path matches that line:
  - stable: `docs-site/{start,advanced,...}` and `docs-site/zh/{start,advanced,...}`
  - beta: `docs-site/beta/**` and `docs-site/zh/beta/**`
  - RC: `docs-site/rc/**` and `docs-site/zh/rc/**`
- [ ] Verify `docs.json` navigation points the version label to the same paths
- [ ] Grep the opposite tree for release-line-specific terms before committing
- [ ] Treat beta content appearing under root release paths as a source-path bug,
      not a rendering bug

**Real-world example**: A beta-only task workflow change documented
`prd.md` + `design.md` + `implement.md`, task-creation consent, and Codex
mode banners under root `start/` and `advanced/` paths. The docs site then
served 0.6 beta behavior under the Release selector. The fix was to restore root
release docs, move the 0.6 content to `beta/` and `zh/beta/`, and add a grep
audit for beta markers against the root release tree.

**Real-world example**: Codex inline mode changed workflow platform markers from
`[Codex]` / `[Kilo, Antigravity, Windsurf]` to `[codex-sub-agent]` /
`[codex-inline, Kilo, Antigravity, Windsurf]`. Fresh init was correct, but
`trellis update` only merged `[workflow-state:*]` blocks and preserved stale
markers outside those blocks. Result: upgraded projects got new hook scripts
but old workflow routing, so `get_context.py --mode phase --platform codex`
could return empty Phase 2.1 detail.

---

## Mode-Detection Probe Checklist

When a CLI auto-detects a mode by probing a remote resource (e.g., checking if `index.json` exists to decide marketplace vs direct download):

### Before implementing:

- [ ] Probe runs in **ALL** code paths that use the result (interactive, `-y`, `--flag` combos)
- [ ] 404 vs transient error are distinguished — don't treat both as "not found"
- [ ] Transient errors **abort or retry**, never silently switch modes
- [ ] Shared state (caches, prefetched data) is **reset** when context changes (e.g., user switches source)
- [ ] **Shortcut paths** (e.g., `--template` skipping picker) must have the same error-handling quality as the probed path — check that downstream functions don't call catch-all wrappers

### After implementing:

- [ ] Trace every path from probe result to the mode-decision branch — no fallthrough
- [ ] External format contracts (giget URI, raw URLs) are tested or at least documented as comments
- [ ] Metadata reads consume a complete response or use a streaming parser — never parse a fixed-size prefix as full JSON
- [ ] When reconstructing a composite identifier from parsed parts, verify **all** fields are included and in the **correct position** (e.g., `provider:repo/path#ref` not `provider:repo#ref/path`)
- [ ] Verify that **action functions** called after a shortcut don't internally use the old catch-all fetch — they must use the probe-quality variant when error distinction matters

**Real-world example**: Custom registry flow had 8 bugs across 3 review rounds: (1) probe only ran in interactive mode, (2) transient errors fell through to wrong mode, (3) giget URI had `#ref` in wrong position, (4) prefetched templates leaked across source switches, (5) `--template` shortcut bypassed probe but `downloadTemplateById` internally used catch-all `fetchTemplateIndex`, turning timeouts into "Template not found".

**Real-world example**: Agent-session update hints fetched npm `latest` metadata with `response.read(4096)` and then parsed it as complete JSON. The `@mindfoldhq/trellis` package metadata exceeded 4 KB, so the JSON was truncated, parse failed silently, and the first session injection showed no update hint. Fix: read the complete response before parsing, and add a regression where `version` is followed by an 8 KB metadata tail.

---

## Cross-Platform Template Consistency

In Trellis, command templates (e.g., `record-session.md`) exist in **multiple platforms** with identical or near-identical content. This is a cross-layer boundary.

### Checklist: After Modifying Any Command Template

- [ ] Find all platforms with the same command: `find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] Update all platform copies (Markdown `.md` and TOML `.toml`)
- [ ] For Gemini TOML: adapt line continuations (`\\` vs `\`) and triple-quoted strings
- [ ] Run `/trellis:check-cross-layer` to verify nothing was missed

**Real-world example**: Updated `record-session.md` in Claude to use `--mode record`, but forgot iFlow, Kilo, OpenCode, and Gemini — caught by cross-layer check.

---

## Generated Runtime Template Upgrade Consistency

Some generated files are both documentation and runtime input. In Trellis,
`.trellis/workflow.md` is parsed by `get_context.py`, `workflow_phase.py`,
SessionStart filters, and per-turn hooks. Template changes must be validated
against both fresh init and upgrade paths.

### Checklist: After Modifying A Runtime-Parsed Template

- [ ] Identify every runtime parser that reads the template, not just the file
  writer that installs it
- [ ] Check whether relevant syntax lives outside obvious managed regions
  such as tag blocks
- [ ] Verify fresh `init` output and a versioned `update` scenario that writes
  the older `.trellis/.version`
- [ ] Add an upgrade regression using an older pristine template fixture, then
  assert the installed file reaches the current packaged shape
- [ ] Update the backend spec that owns the runtime contract

**Real-world example**: Codex inline mode changed workflow platform markers from
`[Codex]` / `[Kilo, Antigravity, Windsurf]` to `[codex-sub-agent]` /
`[codex-inline, Kilo, Antigravity, Windsurf]`. Fresh init was correct, but
`trellis update` only merged `[workflow-state:*]` blocks and preserved stale
markers outside those blocks. Result: upgraded projects got new hook scripts
but old workflow routing, so `get_context.py --mode phase --platform codex`
could return empty Phase 2.1 detail.

---

## Mode-Detection Probe Checklist

When a CLI auto-detects a mode by probing a remote resource (e.g., checking if `index.json` exists to decide marketplace vs direct download):

### Before implementing:
- [ ] Probe runs in **ALL** code paths that use the result (interactive, `-y`, `--flag` combos)
- [ ] 404 vs transient error are distinguished — don't treat both as "not found"
- [ ] Transient errors **abort or retry**, never silently switch modes
- [ ] Shared state (caches, prefetched data) is **reset** when context changes (e.g., user switches source)
- [ ] **Shortcut paths** (e.g., `--template` skipping picker) must have the same error-handling quality as the probed path — check that downstream functions don't call catch-all wrappers

### After implementing:
- [ ] Trace every path from probe result to the mode-decision branch — no fallthrough
- [ ] External format contracts (giget URI, raw URLs) are tested or at least documented as comments
- [ ] Metadata reads consume a complete response or use a streaming parser — never parse a fixed-size prefix as full JSON
- [ ] When reconstructing a composite identifier from parsed parts, verify **all** fields are included and in the **correct position** (e.g., `provider:repo/path#ref` not `provider:repo#ref/path`)
- [ ] Verify that **action functions** called after a shortcut don't internally use the old catch-all fetch — they must use the probe-quality variant when error distinction matters

**Real-world example**: Custom registry flow had 8 bugs across 3 review rounds: (1) probe only ran in interactive mode, (2) transient errors fell through to wrong mode, (3) giget URI had `#ref` in wrong position, (4) prefetched templates leaked across source switches, (5) `--template` shortcut bypassed probe but `downloadTemplateById` internally used catch-all `fetchTemplateIndex`, turning timeouts into "Template not found".

**Real-world example**: Agent-session update hints fetched npm `latest` metadata with `response.read(4096)` and then parsed it as complete JSON. The `@mindfoldhq/trellis` package metadata exceeded 4 KB, so the JSON was truncated, parse failed silently, and the first session injection showed no update hint. Fix: read the complete response before parsing, and add a regression where `version` is followed by an 8 KB metadata tail.

---

## When to Create Flow Documentation

Create detailed flow docs when:

- Feature spans 3+ layers
- Multiple teams are involved
- Data format is complex
- Feature has caused bugs before

---

## UI Projection And E2E Completion Checklist

Use this checklist when a persisted/runtime authority is projected through a
client store into React and then exercised by an integration benchmark.

- [ ] Does every `useSyncExternalStore` / Zustand selector return a cached
      reference, use shallow equality, or project the primitive actually needed?
- [ ] After changing a collection selector, mount the real consuming hook or
      App shell; reducer-only tests cannot detect React snapshot loops.
- [ ] Does the E2E environment provide every browser-owned dependency introduced
      by production code (IndexedDB, Storage, canvas, worker, verification state)?
- [ ] Does test provider preflight behave like production verification instead
      of bypassing a newly added receipt or eligibility gate?
- [ ] Is success defined by the complete declared plan/manifest rather than
      `results.length > 0`, first callback, filename, or a single ready artifact?
- [ ] Do tests assert explicit user scope such as requested page count before
      starting paid downstream work?
- [ ] On concurrent failure, does the orchestrator stop claiming new work and
      settle already in-flight callbacks before returning an error?
- [ ] For Retry/Resume, does the product acknowledge ownership synchronously
      before asynchronous preflight, and does E2E observe that product-owned
      acknowledgement rather than treating `element.click()` as execution?

## Cancellation Ownership Checklist

Use this checklist when browser or renderer code starts a native or remote side
effect, especially a paid Provider request.

- [ ] Does one opaque request id bind the UI owner, IPC command, native future,
      receipt, and sanitized E2E checkpoint?
- [ ] Does abort reach the innermost side effect, or does it only reject an
      outer promise and discard late output?
- [ ] Are renderer, desktop policy, IPC, HTTP client, and approval-lease
      deadlines ordered and documented instead of independently chosen?
- [ ] Can a cancelled or timed-out request continue billing, hold a socket, or
      publish a late artifact after the owner run has settled?
- [ ] Is discovery/catalog evidence named separately from the first successful
      execution of an advertised capability?
- [ ] After a route-wide authentication, configuration, rate-limit, transport,
      or timeout failure, does concurrency stop claiming unstarted sibling work?

## macOS Renderer Liveness Checklist

Use this checklist when a packaged macOS WebView must continue asynchronous work
without activating or focusing the application.

- [ ] Are Tauri window state and macOS application projection both recorded
      without treating either one as a complete liveness proof? Accessory apps
      may project `visible=false` through System Events while remaining live.
- [ ] Does the dedicated background-test process unhide the application with
      `unhideWithoutActivation()` while retaining an Accessory activation
      policy and a non-focusable window?
- [ ] Does the process retain an appropriate `NSProcessInfo` activity token for
      the complete WebView workload instead of relying on window visibility to
      prevent App Nap or timer suspension?
- [ ] Does evidence assert `frontmost=false`, the unchanged foreground
      application, normal process priority/activity, and continued renderer
      progress after the native Provider connection closes?
- [ ] Are these lifecycle changes compiled behind the dedicated packaged-E2E
      mode so ordinary production startup and focus behavior remain unchanged?

**Real-world example**: Asset production changed `selectSlices` from returning
the store array to allocating a filtered projection. One legacy hook subscribed
without shallow equality, so React 19 entered a maximum-depth loop even though
all reducer tests passed. The real pipeline benchmark also stopped when the
first page appeared, allowing a one-page plan to satisfy an explicit two-page
brief. The prevention is a primitive count selector, a mounted-hook regression,
explicit-scope planner validation, and full-plan E2E completion.

### Intermediate Evidence Is Not A Terminal Evaluation

When a long-running workflow projects partial evidence into a completion
contract, keep progress facts separate from terminal status:

- [ ] Record material/evidence events while work is active, but do not publish
      `satisfied` / `needs-repair` until the lifecycle has settled.
- [ ] Treat a partial contract during production as `running`, not as a failed
      final result.
- [ ] Make state-like notifications use a stable semantic identity for the
      concern across lifecycle runs, so create -> repair -> ready replaces stale
      status instead of appending.
- [ ] Add regressions for both transition directions: partial -> complete and
      partial -> terminal failure.
- [ ] Verify notification history contains one current outcome for the active
      concern across create and repair runs, while the append-only event ledger
      retains each run's evidence facts.

**Real-world example**: Cutout recomputed its prototype outcome after every
design-system, DESIGN.md, page, and reusable-material update. The projection was
correct, but each intermediate `needs-repair` evaluation was published as a
user notification with a unique event ID. Normal progress appeared as repeated
failure, and eventual success could not replace the stale alerts. The fix was
to emit terminal evaluation only after work settled and key outcome
notifications by semantic concern rather than event or run. The canonical
Agent outcome notification uses `agent:outcome`; load and append normalization
collapse legacy per-event and per-run IDs so Retry cannot leave stale status.

### Retry Budgets Must Match Workflow Topology

For long DAGs, a single process-wide retry counter is rarely the correct
authority. It couples independent nodes and makes an early transient failure
consume recovery for every later stage.

- [ ] Key retry history by a stable logical node or monotonic completion
      frontier, not merely by the process or top-level run id.
- [ ] Wait for the product to acknowledge Retry ownership before another click.
- [ ] Preserve completed outputs and resume only the failed/missing frontier.
- [ ] Enforce both a per-frontier ceiling and a total journey ceiling so
      topology-aware recovery cannot become an unbounded paid loop.
- [ ] Count every repeated paid attempt in both planned and actual execution
      evidence.

**Real-world example**: A packaged three-suite journey allowed only one Retry
for the entire process. Suite 2 recovered without replay, but a later transient
failure in Suite 3 terminated the benchmark even though the visible product
offered a valid resumable Retry. The driver now budgets acknowledged retries by
candidate page/resource frontier under a separate journey-wide ceiling.

---

## Event Log / Projection Boundary

Append-only logs are cross-layer contracts. A single event travels through:

```
CLI input → event writer → events.jsonl → reader → filter → reducer → display
```

### Checklist: After Adding A New Event Kind Or Field

- [ ] Add the event kind to the central event taxonomy
- [ ] Add a typed event variant or type guard at the event layer
- [ ] Add normalization helpers for array/object fields that come from
      user input or JSON
- [ ] Keep `seq` / `id` assignment in the event writer only
- [ ] Make filters and reducers consume the typed event guard, not local casts
- [ ] Make display code consume reducer output or typed events, not raw JSON
- [ ] Add at least one regression that proves history replay and live filtering
      use the same filter model

**Real-world example**: Thread channels added `kind: "thread"`, `description`,
`context`, labels, and `lastSeq`. The first implementation replayed thread
state correctly, but several commands still re-parsed event payload fields with
local casts. The fix was to make the core event layer own `ThreadChannelEvent`
and `isThreadEvent`, make `reduceChannelMetadata` the only channel metadata
projection, and make `reduceThreads` the only thread replay reducer.

## Provider Optional-Field Checklist

Use this before defaulting any vendor-specific request option on a compatible
Provider route.

- [ ] Which fields are required by the implemented transport, and which are
      optional extensions of the first-party API?
- [ ] Does capability evidence prove the operation, the optional field, or only
      the model's abstract ability?
- [ ] Can one narrowly classified conformance response retry without the field,
      without retrying auth, quota, server or cancellation failures?
- [ ] Does the native serializer truly omit an absent option, or restore a
      hidden default?
- [ ] If reference conditioning is unavailable, does the workflow fail clearly
      instead of silently producing an unconditioned substitute?
- [ ] Do attempt-level events close before retry so UI progress cannot look hung?
