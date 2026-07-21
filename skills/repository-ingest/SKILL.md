---
name: repository-ingest
description: Safely inventory a local repository and ingest allowlisted implementation evidence without exposing secrets, symlinks, or arbitrary paths. Use when a repository should inform delivery.
---

# Repository Ingest

## Outcome

Deliver the requested result while delegating routine implementation detail to Cutout.
Treat `.cutout` Design IR and provenance as authoritative; treat exports as generated evidence.

## Operating Contract

Status: `desktop-only`.
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

- Desktop directory selection or controlled root
- Current Design IR revision
- Approval id for apply

If required input is absent, return a truthful preview or capability requirement.

## Deliverables

- Repository inventory
- Framework evidence
- Apply receipt

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

When a GitHub App installation is available, the `cutout.github` P1 adapter
may inventory the selected repository and import issue/PR feedback. Publishing
must remain preview-first, use a Cutout-owned branch, require explicit
approval, and never merge or write the default branch.

- No arbitrary absolute paths
- No symlink traversal
- Framework detection may remain unknown

## User Experience

Ask only strategic questions that materially change the outcome.
Delegate routine implementation choices to the Agent and harness.
Expose process only for a decision, cost, risk, failure, or result.
Summarize completed and missing user-visible materials.

## Failure Handling

Preserve the last valid revision and durable receipts.
Report the exact missing capability, stale revision, denial, or evidence gap.
Never weaken policy to make work appear complete.
