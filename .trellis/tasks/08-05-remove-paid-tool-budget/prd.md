# Remove money and budget from the paid-tool authority model

> Written retroactively on 2026-08-05. The implementation already existed in the
> working tree with no task record; this PRD reconstructs its intent from the diff
> and the governing spec so the semantics change is reviewable.

## Problem

`docs/HEADLESS_AGENT_CONTROL.md:172-186` states the governing principle: a charged
amount may appear **only when the Provider returns verifiable billing evidence**, and
**Cutout never substitutes a price prediction for it**.

The paid-tool authority model violated that principle. `planPaidTool` gated execution
on a *predicted* `estimatedCost` compared against a caller-supplied `budgetCeiling`,
and the default approval policy was literally named `auto-within-budget`. That made a
guess load-bearing for an authorization decision — the exact substitution the spec
forbids. It also produced a `budget-exceeded` refusal that could not be trusted,
because the number it refused on was never authoritative.

## Goal

Make authorization depend only on facts the host can verify — capability
availability, host policy, and explicit approval — and let money appear solely as
recorded evidence after the fact.

## Requirements

- Remove `budgetCeiling` from `PaidToolRequest` and `PaidToolPlan`
- Remove `estimatedCost` from `PaidToolExecutorCapability` and `PaidToolPlan`
- Remove `maxCost` from `PaidToolPolicy`
- Rename `MoneyEstimate` → `MoneyAmount`: the type now models a *recorded* amount,
  not a *predicted* one. The rename is the point, not cosmetic.
- Collapse `approvalPolicy: 'explicit' | 'auto-within-budget'` → `'explicit' | 'auto'`
- Drop the `budget-exceeded` plan status
- `receipt.charged` becomes optional and is **never synthesized**
- Cascade through control-protocol → desktop-tool-executor → visual-generation →
  prototype → delivery-center → production-readiness → headless → notifications
- Update `.trellis/spec/frontend/paid-tool-prompt-contract.md` and
  `byok-user-copy.md` to match

## Acceptance criteria

- [x] `planPaidTool` returns only `ready` / `authorization-required` / `capability-required`
- [x] No caller can supply a budget that changes an authorization outcome
- [x] `MoneyAmount` appears only on receipts, never on requests or plans
- [x] Specs no longer describe a budget ceiling or an in-budget auto-approval
- [x] Full suite green (verified: 2038 vitest tests pass)

## Known consequence — needs a decision

`src/visual-generation/executor.ts:80` previously ran a **pre-flight plan-vs-ceiling
spend guard** for a whole visual DAG. It was deleted with no replacement. Total spend
for one DAG is now bounded only by `maxAttemptsPerNode` plus per-request explicit
approval — there is no longer any aggregate ceiling across a multi-node run.

This is a real behavioural regression in spend containment, even though removing the
*authorization* dependency on a guess was correct. A node-count or attempt-budget
ceiling should replace it. Tracked in
[08-05-converge-v0-1-19-rc](../08-05-converge-v0-1-19-rc/implement.md) step 5.3.

## Out of scope

- Charging, metering, or any billing integration
- Provider-side quota enforcement (already covered by `ProviderPolicyGuard`)
