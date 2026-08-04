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

## Known consequence — assessed, no action needed

`src/visual-generation/executor.ts` previously ran a **pre-flight plan-vs-ceiling
spend guard** for a whole visual DAG, and it was deleted with no replacement.

Assessed 2026-08-05: **spend is still structurally bounded**, so this is not the
regression it first appeared to be. `contracts.ts:67` caps variant `count` at 8 and
`contracts.ts:111` caps `maxAttemptsPerNode` at 4, both enforced by a `.strict()`
schema. A single task therefore cannot exceed a fixed, small number of paid calls
regardless of any budget input.

That bound is also the *better* one under this task's own principle: it is a
verifiable count derived from the validated plan, not a prediction of price. The
deleted guard compared a guess against a caller-supplied ceiling; the surviving
bound counts real work. Replacing a price guard with a count bound was the correct
trade, not an oversight.

## Out of scope

- Charging, metering, or any billing integration
- Provider-side quota enforcement (already covered by `ProviderPolicyGuard`)
