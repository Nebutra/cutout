---
name: ingest-everything
description: Preview and ingest supported ideas, stories, documents, files, URL descriptors, screenshots, photos, code, and evidence with provenance. Use when adding heterogeneous sources.
---

# Ingest Everything

## Outcome

Deliver the requested result while delegating routine implementation detail to Cutout.
Treat `.cutout` Design IR and provenance as authoritative; treat exports as generated evidence.

## Operating Contract

Status: `available`.
Operations: `source.ingest`.
MCP tools: `cutout_plan_source_ingest`, `cutout_apply_source_ingest`.
Default to preview or read. Never invent approval, provider execution, or delivery.

Read [references/contract.md](references/contract.md) before invoking an operation or claiming an artifact.
Read [../shared/references/safety.md](../shared/references/safety.md) before mutation, export, paid work, or repository inspection.

## Workflow

### 1. Read current evidence

Perform this step from current evidence and preserve its revision boundary.

### 2. Define the user-visible outcome

Perform this step from current evidence and preserve its revision boundary.

### 3. Build a revision-guarded preview

Perform this step from current evidence and preserve its revision boundary.

### 4. Expose only material decisions

Perform this step from current evidence and preserve its revision boundary.

### 5. Execute only approved work

Perform this step from current evidence and preserve its revision boundary.

### 6. Verify authoritative evidence

Perform this step from current evidence and preserve its revision boundary.

## Required Inputs

- Current Design IR revision
- Role and license metadata
- Approval id for apply

If required input is absent, return a truthful preview or capability requirement.

## Deliverables

- Source preview
- Provenance records
- Apply receipt

Return revisions, hashes, receipts, and evidence where available.

## Approval Rules

Preview ingestion, patches, paid actions, and exports before apply.
Use only an explicit opaque approval id scoped to the prepared operation.
Invalidate approval when inputs, revision, scope, budget, or output changes.

## Completion Gate

Mark work complete only when every requested deliverable has authoritative evidence.
Treat a plan, prompt, compiler input, or narrow test as insufficient proof.
Keep unsupported deliverables blocked instead of manufacturing placeholders.

## Limitations

- URL inputs are not fetched
- Video is not processed
- Secrets and arbitrary paths are rejected

## User Experience

Ask only strategic questions that materially change the outcome.
Delegate routine implementation choices to the Agent and harness.
Expose process only for a decision, cost, risk, failure, or result.
Summarize completed and missing user-visible materials.

## Failure Handling

Preserve the last valid revision and durable receipts.
Report the exact missing capability, stale revision, denial, or evidence gap.
Never weaken policy to make work appear complete.
