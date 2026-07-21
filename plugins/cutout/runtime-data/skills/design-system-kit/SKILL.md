---
name: design-system-kit
description: Compile verified decisions into a portable Design System Kit with tokens, CSS variables, Tailwind v4, theme code, documentation, and provenance. Use when creating or updating a product design system.
---

# Design System Kit

## Outcome

Deliver the requested result while delegating routine implementation detail to Cutout.
Treat `.cutout` Design IR and provenance as authoritative; treat exports as generated evidence.

## Operating Contract

Status: `available`.
Operations: `export.design-kit`.
MCP tools: `cutout_plan_design_kit_export`, `cutout_export_design_kit`.
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

- Verified tokens or source evidence
- Current Design IR revision
- Approval id for export

If required input is absent, return a truthful preview or capability requirement.

## Deliverables

- DESIGN.md
- Token and CSS files
- Tailwind and theme files
- Manifest

Return revisions, hashes, receipts, and evidence where available.

## Approval Rules

Preview ingestion, patches, paid actions, and exports before apply.
Use only a host-issued, short-lived, single-use approval lease bound to the prepared operation, preview digest, and expected revision.
Invalidate approval when inputs, revision, scope, budget, or output changes.

## Completion Gate

Mark work complete only when every requested deliverable has authoritative evidence.
Treat a plan, prompt, compiler input, or narrow test as insufficient proof.
Keep unsupported deliverables blocked instead of manufacturing placeholders.

## Limitations

- No full-system inference from screenshots
- No undelivered component claims
- Exports remain derived from Design IR

## User Experience

Ask only strategic questions that materially change the outcome.
Delegate routine implementation choices to the Agent and harness.
Expose process only for a decision, cost, risk, failure, or result.
Summarize completed and missing user-visible materials.

## Failure Handling

Preserve the last valid revision and durable receipts.
Report the exact missing capability, stale revision, denial, or evidence gap.
Never weaken policy to make work appear complete.
