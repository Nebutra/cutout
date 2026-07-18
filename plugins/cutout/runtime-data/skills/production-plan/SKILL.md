---
name: production-plan
description: Plan and validate an outcome-oriented Cutout production DAG from accepted needs, explicit materials, dependencies, policy and delivery targets. Use when an Agent must turn a requested result into reviewable local-first work without claiming that planning executed providers, integrations, exports or coding.
---

# Production Plan

## Outcome

Produce one reviewable production plan for the user's requested materials.
Keep the user focused on results, choices, cost, risk and blocked capabilities.
Delegate routine sequencing and implementation detail to the Agent runtime.

## Operating Contract

Status: `internal-only`.
Operation: `validate`.
MCP tool: `cutout_validate`.

Read [references/contract.md](references/contract.md) before claiming readiness.
Read [../shared/references/safety.md](../shared/references/safety.md) before side effects.

Planning is not execution.
Planning does not grant approval, policy permission or provider capability.

## Progressive Workflow

### 1. Read the accepted outcome

Read the current need, audience, acceptance criteria and Design IR revision.
Ask only strategic questions that materially change the requested result.
Do not ask the user to choose routine implementation details.

### 2. Inventory authoritative inputs

List explicit sources, materials, revisions, tokens and approved references.
Preserve provenance, license and content-addressed identities.
Treat missing evidence as a blocker instead of inventing an input.

### 3. Define deliverables

Translate the outcome into named user-visible deliverables.
Give every deliverable an acceptance criterion and evidence requirement.
Do not expose internal nodes as though they were requested results.

### 4. Build the dependency DAG

Create deterministic node identifiers.
Connect only explicit material and deliverable dependencies.
Reject cycles, missing dependencies and ambiguous output ownership.
Allow independent nodes to run in parallel when policy permits.

### 5. Classify effects

Mark read-only validation as `none`.
Mark Cutout-owned state changes as `project-state`.
Mark controlled exports as `managed-export`.
Mark paid or injected provider work as `provider-required`.
Never reinterpret a node as arbitrary shell or unrestricted filesystem access.

### 6. Preview decisions

Summarize deliverables, dependencies, cost ceilings and required approvals.
Surface only decisions that affect outcome, budget, rights, safety or scope.
Keep raw DAG payloads, adapter facts and provider errors in advanced evidence.

### 7. Validate readiness

Validate the plan against the current Design IR revision and policy.
Require explicit inputs for paid actions and external writes.
Return `capability-required` when an executor or authorized host is absent.
Invalidate the plan after relevant revision, scope or budget changes.

## Local-First Boundary

Prefer local Design IR, managed objects and deterministic compilers.
Keep generated writes under Cutout-managed export paths.
Keep credentials in host-owned opaque handles.
Do not fetch URLs, scan arbitrary paths or contact remote services implicitly.

## External Products

GitHub, Notion, Figma, Obsidian, Pencil, Paper, Framer and Canva require their
documented authorized hosts, APIs or SDKs.
Treat unavailable OAuth, cloud collaboration and live sync as roadmap only.
Never report a planned integration node as connected or executed.

## Approval Rules

Preview every mutation, export, coding task, paid action and external write.
Use only an opaque approval bound to the exact reviewed plan.
Do not reuse approval after dependency, destination or revision changes.
Do not infer approval from chat wording or UI selection.

## Completion Gate

Return the plan identifier and pinned revision.
Return deliverable readiness and unresolved blockers.
Return required approval and capability states.
Do not claim files, images, code, remote pages or receipts until they exist.
Keep unsupported branches blocked rather than replacing them with placeholders.

## Failure Handling

Preserve the last valid plan and authoritative material revisions.
Report the exact dependency, policy, evidence or capability failure.
Do not weaken validation to make the plan appear executable.
