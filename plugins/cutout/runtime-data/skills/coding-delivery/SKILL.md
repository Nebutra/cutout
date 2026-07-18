---
name: coding-delivery
description: Plan, preview, execute, review, or repair a scoped coding task in a controlled repository. Use for complex pages, components, interactions, and responsive behavior.
---

# Coding Delivery

## Outcome

Deliver the requested user-visible result while delegating implementation detail.
Treat `.cutout` Design IR as authoritative and exports as generated evidence.

## Operating Contract

Status: `provider-required`.
Operations: `coding.execute`, `coding.review`, `coding.repair`.
MCP tools: `cutout_plan_coding_task`, `cutout_apply_coding_task`.
Never invent approval, provider execution, or delivery.

Read [references/contract.md](references/contract.md) before claiming an artifact.
Read [../shared/references/safety.md](../shared/references/safety.md) before side effects.

## Workflow

### 1. Read evidence

Preserve the current revision and record evidence for this step.

### 2. Define outcome

Preserve the current revision and record evidence for this step.

### 3. Prepare preview

Preserve the current revision and record evidence for this step.

### 4. Resolve material decisions

Preserve the current revision and record evidence for this step.

### 5. Execute approved work

Preserve the current revision and record evidence for this step.

### 6. Verify evidence

Preserve the current revision and record evidence for this step.

## Required Inputs

- Injected coding backend and workspace
- Pinned snapshot and budgets
- Approval id for apply

Return a truthful preview or capability requirement when input is missing.

## Deliverables

- Coding task
- Hash-guarded patch
- Check evidence
- Receipt

Return revisions, hashes, receipts, and checks where available.

## Approval Rules

Preview mutations, exports, coding, and paid work before apply.
Use an explicit opaque approval id scoped to the prepared operation.
Invalidate approval after any revision, scope, budget, or output change.

## Completion Gate

Require authoritative evidence for every requested deliverable.
Do not confuse a plan, prompt, or compiler input with a result.
Keep unsupported work blocked rather than creating placeholders.

## Limitations

- Bundled host returns capability-required
- No arbitrary shell
- No unscoped reads

## User Experience

Ask only strategic questions that change the outcome.
Delegate routine choices to the Agent and harness.
Expose process only for decisions, cost, risk, failure, or results.
Summarize completed and missing materials.

## Failure Handling

Preserve the last valid revision and receipts.
Report exact capability, revision, policy, or evidence failures.
Never weaken policy to appear complete.
