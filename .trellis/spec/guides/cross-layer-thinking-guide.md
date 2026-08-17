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

### Mistake 5: A Verified Fact Is Reconstructed Downstream

**Bad**: Native discovery verifies one exact Provider/model capability, the
persistence layer stores that evidence, and a later router reconstructs support
from `provider.kind` because the descriptor was not passed to one call site.

**Good**: Lock an immutable runtime snapshot and carry its Provider, binding,
verification receipt, and exact capability descriptor together through every
preflight and execution boundary.

For Provider or externally effective operations:

- make authoritative evidence a required function parameter;
- do not use kind/name heuristics as an omitted-argument fallback;
- test one full projection from persistence through route selection;
- preserve the first owning failure instead of silently continuing into a later
  stage whose error can overwrite the diagnostic.

**Rule**: A downstream layer may narrow an authoritative capability, but it may
not recreate or broaden it from identity metadata.

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
- [ ] Checked that Provider-operation route locks require the same immutable
      Provider/binding/evidence snapshot and have no kind-derived fallback
- [ ] Checked that a failed upstream Provider turn cannot fall through and be
      misreported as a later stage failure

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
      starting downstream Provider work?
- [ ] On concurrent failure, does the orchestrator stop claiming new work and
      settle already in-flight callbacks before returning an error?
- [ ] For Retry/Resume, does the product acknowledge ownership synchronously
      before asynchronous preflight, and does E2E observe that product-owned
      acknowledgement rather than treating `element.click()` as execution?

## Generated Artifact QA Authority Checklist

Use this checklist when remote generation produces media that later becomes a
ready page, asset, slice, or export.

- [ ] Are byte-decidable facts such as media format, intrinsic dimensions,
      orientation, aspect ratio, Alpha edges, hashes, and manifest cardinality
      checked deterministically before probabilistic model review?
- [ ] Does persisted metadata bind to intrinsic bytes, or could changing width,
      height, status, or filename alone make a rejected artifact appear valid?
- [ ] Does visible completed work count only artifacts with schema-valid,
      hash-bound passing receipts rather than returned Provider responses?
- [ ] Does each failure identify the smallest resumable graph frontier while
      independent siblings continue under the shared scheduler?
- [ ] Does E2E expose a stable credential-free diagnostic for the violated
      contract, rather than collapsing model output, transport, orchestration,
      and quality failures into one retryable bucket?
- [ ] After a real failure, is the prevention contract enforced at generation,
      persistence recovery, terminal candidate validation, and delivery proof?

Vision QA owns semantic completeness, composition, fidelity, and visual
coherence. It must not be the only authority for facts that local code can
calculate exactly. Retry is a bounded recovery action after a failed frontier;
it is not evidence that the original architecture was correct.

## Staged Probabilistic Graph Validation Checklist

Use this when several model-authored stages are merged into one authoritative
plan or DAG after expensive independent work has already completed.

- [ ] What is the earliest boundary that can validate each node's identity,
      local references, cross-node targets, and authored cardinality?
- [ ] Does the next model stage receive a closed inventory of valid ids, or can
      it invent references that were never authored upstream?
- [ ] Is repair owned by the smallest faulty authority (one page or closure),
      while valid siblings remain immutable and reusable?
- [ ] Is every repair budget explicit and finite, with the complete final
      validator still fail-closed after staged checks?
- [ ] Are transport, auth, policy, cancellation, timeout, and malformed-schema
      failures excluded from semantic repair so a second Provider request cannot
      disguise the real failure class?
- [ ] Does terminal UI state suppress all ephemeral pending projections even if
      a progress producer forgot to clear its label?
- [ ] Does packaged evidence retain a bounded reason code and stage/frontier,
      while raw model ids, prompts, internal graph ids, credentials, and paths
      remain only in controlled local diagnostics?

**Real-world example**: a real Qwen packaged run completed a five-page outline,
Design System foundation/exploration, every page expansion, and closure in about
three minutes. Closure then referenced an interaction id that the landing page
had never authored, so the final validator discarded all completed planning and
the UI showed both a pending Thinking bubble and Run stopped. Cutout now
validates page nodes before closure, gives only the faulty page or closure one
bounded repair, retains final validation as authority, and clears/suppresses
ephemeral activity at terminal failure.

## Canonical Fingerprint And Byte Evidence Checklist

Use this when a graph or generated artifact crosses renderer, native
persistence, a result bundle, and an external validator.

- [ ] Is there one canonical semantic projection for the fingerprint, reused by
      planning, persistence, Retry matching, and delivery instead of parallel
      `JSON.stringify` definitions?
- [ ] Does the projection include the behaviorally meaningful fields, such as
      regions, interactions, and flows, rather than only route labels?
- [ ] Does terminal evidence retain the exact source bytes in a controlled
      content-addressed store, or only repeat a producer-supplied hash?
- [ ] Does the native sink recompute byte length, SHA-256, media format, and
      intrinsic dimensions before writing `objects/<sha256>`?
- [ ] Does an independent validator re-read every retained object and repeat
      those checks without renderer state or the original application store?
- [ ] Are result JSON, logs, and diagnostics free of embedded media, secrets,
      Provider ids, prompts, and unreviewed host paths even though the controlled
      evidence object store retains the required bytes?

**Real-world example**: a packaged result once treated route-string arrays as
graph identity and accepted hashes of labels as delivery evidence. Valid suites
with the same paths but different interactions could be rejected, while fake
media could pass. Cutout now fingerprints the canonical semantic route graph
and requires native plus external recomputation from retained object bytes.

## Cancellation Ownership Checklist

Use this checklist when browser or renderer code starts a native or remote side
effect, especially a remote Provider request.

- [ ] Does one opaque request id bind the UI owner, IPC command, native future,
      receipt, and sanitized E2E checkpoint?
- [ ] Does abort reach the innermost side effect, or does it only reject an
      outer promise and discard late output?
- [ ] Are renderer, desktop policy, IPC, HTTP client, and approval-lease
      deadlines ordered and documented instead of independently chosen?
- [ ] Can a cancelled or timed-out request continue executing, hold a socket, or
      publish a late artifact after the owner run has settled?
- [ ] Is discovery/catalog evidence named separately from the first successful
      execution of an advertised capability?
- [ ] After a route-wide authentication, configuration, rate-limit, transport,
      or timeout failure, does concurrency stop claiming unstarted sibling work?

**Deadline ordering rule**: an outer owner must not expire before an inner
transport unless the outer cancellation is proven to stop execution. Keep each
boundary's deadline in one reviewed contract and add a
cross-source regression when languages cannot share the same constant.

**Single-tenant runtime rule**: acquire a scarce process/session before starting
the deadline that measures its actual work. A caller queued behind another run
must not consume a stage or complete-work budget while it has no execution
custody. Runtime capability also constrains upstream fan-out before per-item
deadlines start. Renderer arbitration improves UX, while the native owner still
rejects every overlapping request without killing or replacing another
workspace. Persisted conversation reuse requires exact revision and context
digest equality; a fresh run should use a fresh opaque conversation identity.

**Real-world example**: Cutout's native image bridge allowed 300 seconds, while
the desktop Provider-tool owner aborted after 180 seconds. A real image edit hit the
outer deadline after four completed pages; sibling fan-out then received HTTP
502. The fix was to let native transport settle first, place the desktop owner
after it, place the packaged watchdog after both, and close queued image work on
route-wide failures without cancelling already in-flight Provider calls.

## Error Ownership Across Wrapper Layers

Use this checklist when a Provider/native error crosses a service, fallback,
Planner, orchestrator, UI, or retained-evidence boundary.

- [ ] Which layer owns the terminal fact: transport, credential, policy,
      cancellation, output/schema, or orchestration?
- [ ] Does an explicit reviewed status or closed native category outrank every
      arbitrary response-body or message phrase?
- [ ] Can an SDK retry wrapper move status into `lastError` or `errors[]`, and is
      traversal bounded to reviewed fields and depth?
- [ ] Does sanitization govern both output and control flow, so response prose
      cannot silently change retry or classification decisions?
- [ ] When a fallback fails terminally, does the wrapper retain that later owner
      instead of restoring an earlier parse error?
- [ ] Can Planner context be added only for Planner-owned contract failures,
      leaving transport/auth/policy/cancellation signals unwrapped?
- [ ] Does one composed regression pass the failure through every consumer and
      assert the final UI/evidence diagnostic plus absence of Provider body?

**Real-world example**: Run 081 streamed a malformed outline, then the
structured fallback ended under HTTP 502/503/504 pressure. Structured generation
first reduced 5xx to generic Provider rejection; Planner then restored the
earlier malformed-text error or prefixed it as a Planner structured failure, so
packaged evidence lost `provider-transport`. The fix uses one closed
attempt/category grammar, reads bounded SDK status metadata without Provider
body prose, and permits Planner wrapping only for Planner-owned configuration
failures.

## Required Work / Optional Enhancement Boundary

Use this checklist whenever a DAG adds naming, descriptions, thumbnails,
telemetry, indexing, or another best-effort stage after the primary artifact is
already available.

- [ ] Which exact artifacts and receipts define terminal delivery, and which
      later work only improves presentation?
- [ ] Can optional work delay task publication, run finalization, Retry
      availability, or release evidence? If yes, the ownership graph is wrong.
- [ ] Does optional remote work have its own short deadline, cancellation path,
      observed rejection, and late-result guard?
- [ ] Can authoritative manifest metadata supply a deterministic fallback
      without another model call?
- [ ] Does the regression use a promise that never settles, rather than only a
      fast rejection, and still prove the required workflow terminates?

**Real-world example**: a packaged prototype run had all five planned slice
blobs in persistent storage, with three consumable and two correctly blocked by
quality evidence, but remained `generating` with no Provider socket. Region
deconstruction awaited best-effort AI naming after publishing its slices, and
the structured stream could remain unresolved. Production now assigns manifest
labels synchronously; optional naming is bounded and detached, and a
never-resolving naming regression proves resource settlement is independent.

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
- [ ] Does the frontier distinguish a passing artifact's delivery authority
      from a rejected artifact's repair authority, or does one `filter(pass)`
      silently delete the next edit base and its lessons?
- [ ] Does the first request after a run-boundary Retry consume the latest
      rejected bytes and receipt, rather than only recreating the old prompt?
- [ ] Does a run-boundary Retry reuse the original conversation source event so
      a fresh execution attempt cannot render a duplicate user submission?
- [ ] Does a transient node retry keep one stable logical identity, use a fresh
      Provider attempt identity, and re-enter the shared fairness queue only after
      the limiter has observed and classified the failure?
- [ ] Does one user Retry claim all currently failed independent frontiers, or
      does a parallel DAG degrade into one click and one settlement cycle per
      sibling?
- [ ] Enforce both a per-frontier ceiling and a total journey ceiling so
      topology-aware recovery cannot become an unbounded Provider loop.
- [ ] Count every repeated Provider attempt in both planned and actual execution
      evidence.
- [ ] Re-resolve mutable health/routing decisions inside each attempt; do not
      capture an exact Provider/model before entering the retry owner.
- [ ] Separate generic adapter capability from product-task fitness so recovery
      cannot trade a timeout for an invisible quality downgrade.
- [ ] If QA shares a Provider with production, does it consume the same capacity
      lane without contributing image-route success/failure evidence?

**Real-world example**: A packaged three-suite journey allowed only one Retry
for the entire process. Suite 2 recovered without replay, but a later transient
failure in Suite 3 terminated the benchmark even though the visible product
offered a valid resumable Retry. The driver now budgets acknowledged retries by
candidate page/resource frontier under a separate journey-wide ceiling.

**Real-world example**: Packaged run 047 reached three Agent-authored six-page
suites, then an `images/edits` HTTP 502 failed one page. The shared limiter
correctly reduced future concurrency and preserved settled pages, but page work
had no local transient retry and the UI resumed only the first failed suite per
click. Recovery took more than 34 minutes and still ended `provider-transport`.
The prevention contract is one bounded fresh-identity retry at the logical page
node plus one user Retry that schedules all failed suite frontiers together;
ready siblings and Provider calls already in flight remain untouched.

**Real-world example**: Packaged run 053 produced high-fidelity pages but spent
the hour redrawing rejected pages. Page-local repair omitted the rejected bytes,
then suite settlement replaced the continuation frontier with passing pages
only. The fix separates delivery reuse from repair authority, edits the latest
rejected page with its sanitized QA lessons, and tests the actual next Provider
references across an explicit Retry run boundary.

**Real-world example**: A direct planning turn recorded the user intent before
MOX returned HTTP 429. The first Retry implementation correctly started a fresh
run and selected a cold authenticated Qwen route, but `tryToolGate` also recorded
the same intent again because execution identity and conversation identity were
coupled. The fix keeps one stable user event ID across attempts while every
Retry receives a fresh run and remote request identity.

**Real-world example**: Packaged runs 075 and 076 both completed every page and
then failed because closure generation referenced interactions no settled page
owned. Run 076's bounded closure repair repeated the same error with a different
invented id. The prompt already contained the valid inventory, so another
instruction was not an integrity boundary. Closure repair now compiles that
inventory into the runtime structured-output schema: the Agent still owns flow
semantics, but invalid page/interaction pairs are unrepresentable, review text
is not regenerated, and the whole-plan validator still fails closed.

**Real-world example**: Packaged run 077 made every closure foreign key valid
yet still ended `planner-progressive-graph` after repeated full-run retries.
Closed references could not repair a disconnected navigation graph because the
independent page calls had already decided incompatible cross-page edges. The
topology authority now appears in the outline as page nodes plus Agent-authored
navigation edges. Duplicate or unreachable outlines fail before expansion; page
calls own only page-local interactions; and the orchestrator compiles the exact
outline edges before closure. The benchmark also stops automatically replaying
deterministic graph failures, because a fresh model sample is not an architectural
repair strategy.

### Closed Reference-Repair Checklist

- [ ] Which fields are semantic choices, and which are foreign-key references
      into an already settled authoritative set?
- [ ] Can every authoritative id pair be compiled into the repair schema rather
      than merely repeated in prompt prose?
- [ ] Does repair preserve identities, cardinality, and unaffected authored
      content instead of regenerating the whole document?
- [ ] Does the final domain validator run after the constrained repair?
- [ ] If the constrained repair cannot be represented or parsed, does the run
      fail closed with a safe UI diagnostic while retaining technical detail
      only in local diagnostics?
- [ ] Does a global graph declare nodes and semantic edges before independent
      node expansion, so late closure is not forced to invent connectivity?
- [ ] Can independent node generation modify only node-local semantics while
      the orchestrator compiles approved cross-node edges deterministically?
- [ ] Are deterministic graph failures excluded from whole-run automatic retry?

### Host Authority Must Follow Capability

Use this checklist when one renderer can run in both a native desktop host and
a plain browser/test host:

- [ ] Is native-host detection centralized and based on the callable bridge,
      rather than the mere presence of a global object?
- [ ] Does the desktop path reread its native persisted authority at the start
      of an execution attempt, so stale query state cannot own Provider work?
- [ ] Does the browser path consume an already validated read-only projection
      instead of importing or invoking an unavailable native store?
- [ ] Does absence of the native host project a truthful capability/configuration
      state, rather than surfacing an internal `invoke` or plugin-store error?
- [ ] Do tests cover both halves: native ignores the browser projection, while
      browser never touches the native store?
- [ ] If tests replace the complete persistence module, did a repository-wide
      scan update every mock with the same public exports as the real module?
- [ ] Are commands that rewrite watched source or locale files run before or
      after browser E2E, never concurrently with its development server?

**Real-world example**: Cutout changed run preflight to reread model capability
bindings before route selection. That was correct for the packaged desktop, but
the same component also rendered in browser visual tests where the Tauri store
does not exist. The unconditional reread converted an expected “configure a
model” state into an internal `invoke` failure. A shared host-capability branch
now makes desktop state authoritative for desktop execution and uses the query
projection only in a non-native renderer. The visual test preserves the honest
unconfigured state across Deliver navigation. Locale extraction is also kept
out of parallel browser runs because it rewrites watched files and can trigger
unrelated navigation or screenshot failures.

### Native Settlement Must Reach A Background Renderer

Use this checklist when native work owns a clock, process, or remote request but
the workflow continuation still lives in a hidden/background WebView:

- [ ] Distinguish native settlement from renderer observation. A completed
      native future does not prove a throttled WebView drained the invoke reply.
- [ ] Does the isolated packaged host provide a fixed, side-effect-free native
      pulse so invoke completions continue without activating, focusing, or
      ordering the window to the front?
- [ ] Is the pulse compiled or enabled only for the packaged harness, and does
      it reject caller-authored JavaScript or arbitrary window labels?
- [ ] Do both periodic liveness and terminal native boundaries pulse, so one
      missed scheduler turn cannot strand a completed deadline or Agent turn?
- [ ] Does the foreground-ownership monitor remain authoritative while pulses
      run, with consecutive changed samples still failing the journey?
- [ ] Does a stalled checkpoint with no live native child become a release
      failure rather than permission to wait for the outer hour budget?

**Real-world example**: a native monotonic Planner deadline and a Codex child
both settled in Rust, but the hidden WKWebView never drained either invoke
completion. The App and smoke owner stayed alive while progress remained at the
outline checkpoint and no Codex process existed. Moving the clock into Rust was
necessary but insufficient: the packaged owner now performs a fixed no-op
renderer pulse from its background watchdog and once at each terminal native
boundary, without exposing a generic script or activating the app.

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
- [ ] For probabilistic QA, do durable events bind logical node, attempt, and a
      bounded sanitized verdict while remaining distinct from terminal outcome
      or user-notification state?

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
