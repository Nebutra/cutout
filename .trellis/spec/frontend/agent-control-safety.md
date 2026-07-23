# Agent Control Safety

## Scenario: Execute an approved durable effect

### 1. Scope / Trigger

Use this contract when changing durable Agent nodes, approval-bearing CLI/MCP
operations, controlled paths, coding adapters, governance evidence, or delivery
receipts. `.cutout` state and provenance remain authoritative.

### 2. Signatures

- External apply surfaces accept `approvalLeaseId`, never a caller-authored
  approval object.
- Registry install apply accepts the reviewed `planId` together with
  `approvalLeaseId`; it must not infer authority from a legacy `--approval`
  value or silently fall back to preview.
- `createHeadlessRuntime(store).execute(request, authorization)` receives the
  trusted authorization separately from the untrusted request.
- `runDurableHostEffect(...)` executes only after `nodeClaim(...)` returns a
  live claim.
- Composite delivery receipts use `cutout.delivery-receipt.v1`.
- `classifyGenerationError(message)` returns a closed failure kind,
  user-facing message, and `retryable` flag. `createAgentRunRetryControl(...)`
  may expose a run-level callback only from that classification or an existing
  material repair plan.
- `selectLatestAgentMessageRegenerationTarget(events)` returns the selected
  durable Agent response, its effective text, and the user turn it answers.
  `AgentWorkspaceDock` exposes Regenerate only while no run is active and uses
  durable `branch-selected` events for sibling response navigation.
- The supported external controller surface is `cutout.control.v1` through the
  CLI/MCP adapters. The desktop invoke registry exposes no legacy GUI Queue or
  WebView automation command family.

### 3. Contracts

- A host-issued `cutout.approval-lease.v1` lease binds its project, subject,
  operation digest, expected revision, approval id, issue time, and expiry.
- The durable headless lease catalog authenticates every authority-bearing
  field and state transition with HMAC-SHA256 using a host key outside the
  workspace. `issued`, `reserved`, and `consumed` records are re-signed on
  transition; workspace edits cannot mint or replay a lease.
- Desktop registry installs and workspace exports do not accept a webview
  approval token as authority. The native host presents an OS-level warning
  confirmation after preview and emits the receipt approval id only after the
  user approves it.
- Desktop paid-tool requests always require explicit approval. Their budget
  ceilings come from the matching host capability estimate, never a persisted
  user allowance, and the desktop host policy does not project a `maxCost`.
- Lease reservation and the complete control request run under the same
  project-scoped external-control lock. Reserved leases are single-use even
  when the operation returns a denied or invalid response.
- Registry install re-plans under that lock, rejects a changed `planId`, binds
  the lease to `registry.install` and the current project revision, and checks
  the plan again at the write boundary.
- Durable completion, failure, and heartbeat require the current owner,
  attempt, and an unexpired lease. A missing claim prevents the effect and its
  heartbeat from starting.
- Every durable-host mutation reloads state and commits under the store's
  cross-instance exclusive transaction. Starting a second host preserves live
  leases; recovery requeues only leases expired at the shared clock boundary.
- Controlled reads reject absolute paths, traversal, symlink roots/components,
  non-regular files, identity changes, and size/count limit violations.
- External controllers never fall back to a hidden desktop/WebView queue when
  `cutout.control.v1` lacks a provider or effect. They return the explicit
  `capability-required` or unsupported result instead.
- Runtime diagnostics used by desktop recovery are an internal observation
  mechanism. They do not accept commands, paths, credentials, or approval data
  and do not form a second Agent control surface.
- Both TypeScript and native repository scanners reject trees deeper than 64
  directory levels before continuing traversal.
- The stdio MCP entry never derives project authority from the launch
  process's current directory. Without `CUTOUT_PROJECT_ROOT`, only static
  discovery remains available and every project-bound tool fails closed.
- Native Git commands ignore system/global configuration and executable
  environment overrides, disable hooks/helpers/external diff/file transport,
  and reject executable repo-local config keys before running against a repo.
- The Node command host exposes a fixed command enum, `shell: false`, an
  allowlisted environment, bounded duration/output, and POSIX process-group
  cancellation. Unsupported Windows process-tree control fails as
  `capability-required`; this is not a general-purpose shell or kernel sandbox.
- Governance facts attach axe nodes only to the scenario element that contains
  their target. Non-color cues require explicit state-bound evidence.
- A successful composite receipt has unique targets and an artifact index that
  exactly equals the artifacts in its target receipts.
- A transient run-level retry starts a new `createAssets("create",
  { briefOverride })` invocation with the original submitted brief. It does not
  resume an in-flight stream, reuse a paid-tool request id, or bypass the
  existing tool receipt/retry machinery.
- The Agent view and retry controller consume one canonical current error:
  persisted `runError` first, otherwise the normalized generation error. When
  reopening a project, a retryable persisted error plus the current non-empty
  project brief may reconstruct the run-level Retry callback; no second brief
  copy is added to `WorkspaceSnapshot`.
- The dock attaches the single run-level `Retry`/`Continue` action to the latest
  error item, even when newer informational messages follow it. Repair-plan
  `Continue` takes precedence over transient `Retry`, and both are hidden while
  another run is active.
- Message-level Regenerate is distinct from run-level and paid-tool Retry. Only
  the selected response at the active conversation head is eligible. It reuses
  the effective source user turn, ignores selected-material repair context,
  emits no duplicate `intent-recorded` event, appends an immutable sibling
  `agent-message`, and selects it through a durable `branch-selected` event.
- User turns may link to the selected Agent response with `parentEventId`, and
  Agent responses may link to their source turn with `responseToEventId`.
  Legacy unlinked transcripts replay linearly. Branch selection remains
  appendable after a run reaches a terminal or cancelled state.
- Desktop repository history binds only through the current opaque authorized
  workspace handle. It reconciles `workspace.v1` and `.cutout/run-events.json`
  by event ID while preserving both source orders, rejects divergent payloads
  for the same ID, and writes the validated union with the native CAS digest.
  Read, credential-policy, or CAS failure preserves local history and shows
  generic Git-sync copy without exposing the native payload or secret-shaped
  content.
- A retry or regeneration attempt supersedes the prior stopped UI only after
  route/provider preflight and lease acceptance. At that boundary it clears
  both persisted `runError` and the canonical generation error before awaiting
  the tool gate, so an early conversational return cannot restore stale
  `Run stopped` or `No result yet` state.
- Message regeneration is fail-closed against asset generation. Tool-gate
  failure becomes a new classified run error; no-call and non-conversational
  tool results remain on the conversational revision path and never fall
  through to the paid prototype pipeline.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Forged, expired, replayed, stale, or mismatched lease | Reject before dispatching the effect |
| Workspace lease file changes state, reservation, or response without the host key | Reject the catalog signature before reservation or completion |
| Desktop apply receives a caller-authored approval string | It has no authority; require native confirmation after preview |
| Project-bound MCP tool runs without `CUTOUT_PROJECT_ROOT` | Return `project-binding-required` without reading or writing project state |
| Caller attempts the retired desktop GUI Queue compatibility surface | No script, bridge, invoke handler, or permission exists; use `cutout.control.v1` |
| Registry apply omits either `planId` or `approvalLeaseId` | Reject; never downgrade to a dry-run response |
| Registry content or workspace state changes after preview | Reject the stale `planId` before writing |
| Claim missing, terminal, delayed, cancelled, or held by another owner | Do not start heartbeat or effect |
| Two host instances claim the same live node | Exactly one claim is persisted and may execute |
| Owner lease expires or is taken over | Reject late completion/failure |
| Concurrent request at the same revision | Exactly one reservation succeeds; the other conflicts or deduplicates |
| Transaction journal remains after interruption | Recover deterministically before accepting another mutation |
| Path/root is a symlink or changes identity | Reject without returning controlled file contents or launching a command |
| Repository exceeds the depth budget or declares executable Git config | Reject before deeper scanning or Git execution |
| Platform cannot enforce required process-tree semantics | Return `capability-required` |
| Axe violation target is outside a scenario | Do not attach it to that scenario |
| Receipt claims success with failed target or mismatched artifacts | Schema validation fails |
| No coding backend/workspace is injected | Return `capability-required`, never simulated success |
| Timeout, fetch/network failure, temporary upstream failure, or HTTP 408/429/500/502/503/504 | May expose run-level `Retry` with the original brief |
| Reopened project with retryable persisted `runError` and non-empty project brief | Reconstruct one run-level `Retry` callback |
| Reopened project with missing brief or a non-retryable persisted error | Do not expose run-level `Retry` |
| Cancellation, credential/auth failure, missing material, policy/moderation denial, invalid model/configuration, or HTTP 400/401/403/404/422 | Do not expose transient run-level `Retry` |
| Selected Agent response at the active head has an effective source user turn and no run is active | Expose one icon-only `Regenerate response` action |
| Agent reply is older, pending, non-durable, lacks a source turn, or another run is active | Do not expose message Regenerate |
| Regenerate tool gate returns no call or selects a non-conversational tool | Revise through the conversational path; never enter asset generation |
| Regenerate tool gate fails | Publish the new classified run failure; never resume or fall through to the asset pipeline |

### 5. Good / Base / Bad Cases

- Good: preview an exact operation, obtain a short-lived host lease, reserve it,
  execute once under the project transaction, and read an integrity-checked
  receipt.
- Base: discovery and dry-run operations execute without an approval lease and
  perform no external or managed-export effect.
- Good run recovery: a network-interrupted run shows one `Retry` below the
  latest error, and the click creates a new run with the preserved brief.
- Good message regeneration: the selected Agent reply shows a circular-arrow
  icon, reuses the source user turn, appends a sibling response, selects it,
  and exposes stable previous/next navigation without a second user bubble or
  paid asset execution.
- Base: sibling Agent replies remain recoverable through branch navigation;
  only the selected response at the active head is eligible for regeneration.
- Bad: reconstruct `{ id, grantedAt }` from a CLI flag, execute after a failed
  claim, follow a workspace symlink, attach page-wide axe output to every
  scenario, report delivery success without exact artifact hashes, or route a
  run-level retry through a prior paid-tool request id.
- Bad: implement message Regenerate by calling the normal create path with a
  new intent event or by letting a no-call classifier result fall into asset
  generation.

### 6. Tests Required

- Durable host/effect: competing live store instances, terminal/cancelled
  nodes, expiry boundary, live-host startup, takeover, and idempotent re-entry.
- CLI/MCP adapters: forged, expired, replayed, revision-mismatched, and
  operation-mismatched leases, authenticated state-transition tampering, a
  missing MCP root binding, plus real concurrent processes.
- Registry adapters: required plan/lease pair, legacy approval rejection,
  changed-plan rejection before reservation, and single-use lease replay.
- Node filesystem store: run events and ledger in one transaction, recovery
  from an interrupted journal, and stale revision conflict.
- Source scanner/tool host/Tauri: traversal, symlink root/component,
  replacement/identity drift, over-depth trees, executable Git configuration,
  least-privilege capability drift, absence of legacy GUI Queue handlers and
  permissions, and unsupported platform behavior.
- Governance: Document roots, multiple scenarios, unrelated axe targets, and
  explicit ambiguous/non-color evidence.
- Delivery/coding: exact artifact index, unique target ids, failed/cancelled
  state, missing executor, bounded commands/paths/budgets, and receipt readback.
- Run recovery: classification precedence, canonical display/retry error
  source, restored-project fallback, original-brief preservation, latest
  error-row placement, active-run suppression, repair-plan precedence, and
  separation from tool-level retry callbacks.
- Message regeneration: active-head eligibility, icon accessibility, source
  resolution, immutable sibling projection, durable previous/next selection,
  no duplicate user turns, selected-material isolation, restart/legacy
  recovery, no-call/non-conversational fail-closed behavior, and stale-error
  clearing before the awaited tool-gate boundary.
- Repository history: authorization after mount, opaque-handle read/write,
  deterministic ordered union, identical legacy deduplication, branch
  selection restoration, divergent-ID rejection, CAS conflict, credential
  rejection, local-state preservation, and sanitized in-product failure copy.
- Run `pnpm agent:validate` after every CLI, MCP, protocol, capability, Skill,
  manifest, or plugin-runtime change.

### 7. Wrong vs Correct

#### Wrong

```ts
await runtime.execute({ ...request, approval: { id: cliValue, grantedAt: Date.now() } })
```

#### Correct

```ts
const reservation = await reserveApprovalLease(root, leaseId, operation, revision)
await runtime.execute(request, { approval: reservation.approval })
```

The first form lets the caller mint authority. The second keeps authorization
host-issued, request-bound, expiring, and single-use.

#### Wrong

```ts
createAssets('create', { briefOverride: priorPrompt })
```

#### Correct

```ts
createAssets('create', {
  briefOverride: target.sourceMessage,
  ignoreSelectedMaterial: true,
  regenerateTargetEventId: target.targetEventId,
  regenerateSourceEventId: target.sourceEventId,
  regenerateFallbackReply: target.targetMessage,
})
```

The first form appends another user turn and may fall into material or asset
generation. The second reuses the durable turn, isolates message regeneration
from canvas repair, and appends a selected sibling Agent reply.
