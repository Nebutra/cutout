---
name: delivery-center
description: Coordinate one reviewed delivery across kits, visual assets, starters, registry installation, GitHub and Notion while preserving target receipts and quality evidence.
---

# Unified Delivery Center

Use this skill when the user asks to deliver results to one or more targets.

The user selects outcomes and destinations, not internal executor steps.

Read the deeper contract only after selecting this skill.

## Supported targets

- Brand VI Kit managed export.
- Design System Kit managed export.
- Verified visual assets.
- Next or Vite starter delivery.
- Open-code registry install.
- GitHub branch or pull request publication through an authorized host.
- Notion guideline publication through an authorized host.

Target availability depends on installed executors and authorization.

## Preview

Bind the request to the current outcome revision.

Bind it to the current Design IR document and revision number.

Select explicit destinations for every target.

Preview managed exports, project file effects and external writes.

Preview provider cost in USD where applicable.

Preview exact known files and warnings.

Do not execute any target during preview.

Do not hide capability-required targets.

## Dependency graph

Order Design and Brand Kits before consumers that require them.

Order registry or starter delivery before repository publication.

Order generated guideline content before Notion publication.

Reject cycles and references to missing targets.

If a dependency fails, skip its downstream target.

Do not claim the downstream target succeeded.

## Approval

Present the combined effects, destinations and estimated cost.

Obtain one opaque approval for the exact plan.

The approval ID is not a credential.

Pass the same approval context to existing target executors.

Do not invent or reuse an approval for another plan.

Reject execution when the Design IR revision became stale.

## Execution

Reuse existing Brand, Design, visual, Starter, Registry and Integration
executors. The Delivery Center does not reimplement them.

Preserve every target's start/completion time and status.

Preserve artifact file hashes and media types.

Preserve Kit manifest IDs and hashes.

Preserve registry item ID, version and content hash.

Preserve repository target and base/result revisions.

Preserve optional GitHub or Notion remote publication IDs.

Never store OAuth tokens, API keys or authorization headers.

## Quality gates

Required gates must have explicit passed evidence.

Build evidence does not imply accessibility evidence.

Accessibility evidence does not imply visual regression evidence.

Missing, failed or skipped required evidence fails that target.

Do not infer a pass from generated files or a remote URL.

## Composite receipt

Composite success requires every selected target to succeed.

Any failed, cancelled, capability-required or skipped target prevents success.

The receipt binds outcome revision, Design IR revision, target receipts,
artifact hashes, approval and completion time.

Use `completed-with-failures` for mixed outcomes.

Use `cancelled` when cancellation prevents completion.

Never rewrite a failed target as successful for presentation.

## Current availability

This skill describes the internal coordination contract.

Do not claim a public CLI or MCP Delivery Center operation until its durable
host and process-level tests are exposed in the capability manifest.
