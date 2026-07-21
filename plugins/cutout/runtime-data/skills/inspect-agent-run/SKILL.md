---
name: inspect-agent-run
description: Inspect durable Agent run status, events, cancellation state, approvals, receipts, and evidence. Use when asking what the Agent is doing, why it stopped, or what was delivered.
---

# Inspect Agent Run

## Outcome

Deliver the requested user-visible result while delegating implementation detail.
Treat `.cutout` Design IR as authoritative and exports as generated evidence.

## Operating Contract

Status: `available`.
Operations: `run.get`, `run.events`, `run.cancel`.
MCP tools: `cutout_run_get`, `cutout_run_events`, `cutout_run_cancel`.
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

- Cutout project root
- Run id for history

Return a truthful preview or capability requirement when input is missing.

## Deliverables

- Current run status
- Event timeline
- Pending decision
- Receipts

Return revisions, hashes, receipts, and checks where available.

## Approval Rules

Preview mutations, exports, coding, and paid work before apply.
Use a host-issued, short-lived, single-use approval lease bound to the prepared operation, preview digest, and expected revision.
Invalidate approval after any revision, scope, budget, or output change.

## Completion Gate

Require authoritative evidence for every requested deliverable.
Do not confuse a plan, prompt, or compiler input with a result.
Keep unsupported work blocked rather than creating placeholders.

## Limitations

- Events do not prove provider work
- Cancellation is cooperative
- Never expose credentials

## User Experience

Ask only strategic questions that change the outcome.
Delegate routine choices to the Agent and harness.
Expose process only for decisions, cost, risk, failure, or results.
Summarize completed and missing materials.

## Failure Handling

Preserve the last valid revision and receipts.
Report exact capability, revision, policy, or evidence failures.
Never weaken policy to appear complete.
