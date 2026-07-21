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

### 3. Contracts

- A host-issued `cutout.approval-lease.v1` lease binds its project, subject,
  operation digest, expected revision, approval id, issue time, and expiry.
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
- The Node command host exposes a fixed command enum, `shell: false`, an
  allowlisted environment, bounded duration/output, and POSIX process-group
  cancellation. Unsupported Windows process-tree control fails as
  `capability-required`; this is not a general-purpose shell or kernel sandbox.
- Governance facts attach axe nodes only to the scenario element that contains
  their target. Non-color cues require explicit state-bound evidence.
- A successful composite receipt has unique targets and an artifact index that
  exactly equals the artifacts in its target receipts.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Forged, expired, replayed, stale, or mismatched lease | Reject before dispatching the effect |
| Registry apply omits either `planId` or `approvalLeaseId` | Reject; never downgrade to a dry-run response |
| Registry content or workspace state changes after preview | Reject the stale `planId` before writing |
| Claim missing, terminal, delayed, cancelled, or held by another owner | Do not start heartbeat or effect |
| Two host instances claim the same live node | Exactly one claim is persisted and may execute |
| Owner lease expires or is taken over | Reject late completion/failure |
| Concurrent request at the same revision | Exactly one reservation succeeds; the other conflicts or deduplicates |
| Transaction journal remains after interruption | Recover deterministically before accepting another mutation |
| Path/root is a symlink or changes identity | Reject without returning controlled file contents or launching a command |
| Platform cannot enforce required process-tree semantics | Return `capability-required` |
| Axe violation target is outside a scenario | Do not attach it to that scenario |
| Receipt claims success with failed target or mismatched artifacts | Schema validation fails |
| No coding backend/workspace is injected | Return `capability-required`, never simulated success |

### 5. Good / Base / Bad Cases

- Good: preview an exact operation, obtain a short-lived host lease, reserve it,
  execute once under the project transaction, and read an integrity-checked
  receipt.
- Base: discovery and dry-run operations execute without an approval lease and
  perform no external or managed-export effect.
- Bad: reconstruct `{ id, grantedAt }` from a CLI flag, execute after a failed
  claim, follow a workspace symlink, attach page-wide axe output to every
  scenario, or report delivery success without exact artifact hashes.

### 6. Tests Required

- Durable host/effect: competing live store instances, terminal/cancelled
  nodes, expiry boundary, live-host startup, takeover, and idempotent re-entry.
- CLI/MCP adapters: forged, expired, replayed, revision-mismatched, and
  operation-mismatched leases plus real concurrent processes.
- Registry adapters: required plan/lease pair, legacy approval rejection,
  changed-plan rejection before reservation, and single-use lease replay.
- Node filesystem store: run events and ledger in one transaction, recovery
  from an interrupted journal, and stale revision conflict.
- Source scanner/tool host/Tauri: traversal, symlink root/component,
  replacement/identity drift, least-privilege capability drift, and unsupported
  platform behavior.
- Governance: Document roots, multiple scenarios, unrelated axe targets, and
  explicit ambiguous/non-color evidence.
- Delivery/coding: exact artifact index, unique target ids, failed/cancelled
  state, missing executor, bounded commands/paths/budgets, and receipt readback.
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
