# Design OS Kernel

> Canonical contracts, authority, scheduling, conformance, and replay rules for
> host-neutral design production.

## Scenario: Execute A Frozen Design OS Plan

### 1. Scope / Trigger

Apply when compiling, authorizing, scheduling, replaying, repairing, or adapting
a `design-os.protocol.v1` OutcomeGraph production run. The generic Kernel is an
internal contract; it does not make a Host capability publicly available.

### 2. Signatures

```ts
issueAuthorization({ contract, plan, catalog, hostLimits, ... }): Promise<AuthorizationReference>
assertNodeAuthority({ node, authorization, contract, plan, now }): Promise<void>
createRunRuntime({ contractHash, planHash, authorization, plan, ... }): RunRuntimeSnapshot
reduceRunRuntime(snapshot, event): RunRuntimeSnapshot
scheduleReadyNodes({ snapshot, plan, authorization, now, maximumCommands }): readonly CapabilityCommand[]
```

### 3. Contracts

- Contract and Plan are separately canonical-hashed frozen documents. The Plan's
  embedded Contract id, revision, and content hash must exactly match the supplied
  frozen Contract before authorization is issued or a node is executed.
- Authorization binds the exact Contract hash, Plan hash, approved node ids,
  Host issuer, and expiry. Executors receive one exact frozen Plan node; a changed
  target, capability, constraint, scope, budget, or node body is not executable.
- Runtime nodes retain their frozen `maxAttempts` and node budget. Admission and
  result settlement enforce both the Run-wide budget and the node-local budget.
  Transient retry codes and output schemas come from the authorized Capability
  Catalog and are copied into each frozen Plan node; result events cannot declare
  their own retryability or publish another schema.
- Every scheduled command carries a derived result-usage limit equal to the
  minimum remaining Run/node artifact, byte, time, and spend budget. Its deadline
  is clamped to that limit and authorization expiry so the Host can reject excess
  work before execution; reducer checks remain the settlement backstop.
- Run events settle only the currently owned attempt. Duplicate events and late
  results after timeout, cancellation, retry, authorization expiry, or terminal
  delivery do not spend again or publish stale artifacts. Duplicate event ids
  with divergent payloads fail closed, while stale earlier-attempt events remain
  ignored even when their clocks precede newer accepted history.
- Targeted repair may reopen only failed, timed-out, or retryable nodes already in
  the frozen Plan with remaining node and Run budgets. `run-evaluated` owns the
  exact repair transition; direct phase events cannot bypass evaluation or
  delivery reducers. Authority expansion creates a non-executable successor
  proposal.
- Recovered runtime snapshots validate exact node/artifact/receipt keys, event
  hashes, attempt ownership, terminal state and authorization windows before
  replay or scheduling. Recovery at or beyond a deadline settles timeout, not a
  fresh transient interruption.
- A terminal ReproductionEnvelope replays the exact accepted event history from
  its empty origin snapshot and derives source/dependency identities from the
  Contract-bound EvidenceGraph and OutcomeGraph. Caller-authored source lists,
  ignored late events, mutated Plans and false identical-output claims are invalid.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Plan embeds another Contract id, revision, or hash | reject authorization and execution |
| Frozen document content no longer matches its hash | reject before Host work |
| Authorization expired or hashes differ | emit no command / reject node execution |
| Plan or node budget exceeds Contract or Host limits | reject authorization |
| Attempt or result exceeds Run or node budget | block with structured reason and exact node path |
| Result does not own the active attempt | ignore without publication or duplicate spend |
| Repair targets a successful, cancelled, unknown, or out-of-Plan node | reject repair |
| Result arrives at/after node deadline or authorization expiry | ignore; timeout/recovery closes ownership |
| Duplicate event id carries different content | reject as divergent durable history |
| Reproduction input does not replay the exact terminal snapshot | reject without emitting an envelope |

### 5. Good / Base / Bad Cases

- Good: an exact frozen node runs under a current Host authorization, records one
  attempt, and publishes provenance-bound artifacts within both budget scopes.
- Base: a transient failure records usage, retries with a fresh attempt identity,
  and ignores the first attempt's late result.
- Bad: a caller reuses a valid Plan hash with a different Contract object, or the
  scheduler checks only aggregate budget while one node overspends its own limit.

### 6. Tests Required

- Frozen authority: exact success, embedded Contract mismatch, mutated node,
  expired authorization, and each scope/capability/constraint/target/budget expansion.
- Runtime: global and node-local attempt/result budget blockers with reason paths.
- Settlement: transient retry, cancellation, timeout, crash recovery, duplicate
  event replay/divergence, forged attempt identity, deadline/authorization late
  success, and stale earlier-attempt results after ownership closed.
- Repair: only the failed frontier reopens; accepted unrelated artifacts and hashes
  remain unchanged, and exhausted authority cannot reopen work.
- Cross-Host: normalize only declared authorization, route, and target bindings;
  graph, dependency, repair, and evaluation differences remain failures.
- Reproduction: exact event replay, derived source/dependency identities, mutated
  Plan rejection, cancellation settlement and no ignored extra terminal events.

### 7. Wrong vs Correct

```ts
// Wrong: matching only the outer authorization hashes can authorize a Plan
// that embeds a different Contract, and one aggregate check hides node overspend.
if (authorization.planHash === planHash && budgetWithin(runUsed, runLimit)) execute(node)

// Correct: verify the complete frozen authority chain and both budget scopes.
await assertNodeAuthority({ node, authorization, contract, plan, now })
if (!budgetWithin(runUsed, runLimit) || !budgetWithin(nodeUsed, nodeLimit)) block()
```
