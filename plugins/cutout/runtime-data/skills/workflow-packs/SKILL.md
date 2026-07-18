---
name: workflow-packs
description: Discover and validate portable versioned Cutout Agent workflow packs without embedding or taking over an external Coding Agent runtime.
---

# Workflow Packs

Use `cutout_workflow_pack_list` to discover repo-native packs, then read the selected manifest with `cutout_workflow_pack_get`.

Before execution, call `cutout_workflow_pack_compatibility` with the current Cutout version and actual capability set. Missing capabilities or an incompatible major version are blocking. A workflow pack declares DAG steps, effects and approval requirements; it does not grant approvals or execute arbitrary commands.

Read the reference contract before interpreting eval cards or publishing a pack.

## Discovery

Call `cutout_workflow_pack_list` before selecting a workflow.

The catalog reads only `.cutout/workflows/*.json` below the controlled project.

It does not contact a marketplace or remote registry.

Treat returned summaries as declarations, not execution receipts.

Call `cutout_workflow_pack_get` for the exact selected pack.

Pin a version when reproducibility matters.

Do not silently replace a missing version with an unrelated workflow.

## Compatibility

Call `cutout_workflow_pack_compatibility` before planning execution.

Supply the current Cutout version explicitly.

Supply only capabilities actually returned by Cutout discovery.

Do not infer a capability from a step name.

A major-version mismatch is blocking.

A missing capability is blocking.

Compatibility does not grant policy permission or approval.

## DAG Review

Read every step, dependency, effect and approval declaration.

Dependencies must resolve to steps in the same pack.

Cycles are invalid.

An effect of `none` is read-only.

An effect of `project-state` may mutate Cutout-owned project state.

An effect of `managed-export` writes only through managed exporters.

An effect of `provider-required` needs an injected provider capability.

Never reinterpret a declared effect as arbitrary shell access.

## Approval

`none` means no extra approval beyond normal policy.

`policy` means the active Cutout policy must permit the operation.

`explicit` requires an opaque approval for the reviewed action.

Do not reuse an approval after the target revision changes.

Do not manufacture an approval from chat text or UI state.

## Skill References

Pack skill references are progressive-disclosure pointers.

Read the selected Skill before invoking its operations.

Honor the referenced Skill version.

Missing Skill versions are compatibility failures.

Skills describe product use; they are not hidden executable code.

## Eval Cards

Eval cards name a dataset, metrics, thresholds and weights.

Every metric requires explicit evidence identifiers.

Missing metrics fail evaluation.

Individual threshold failures cannot be hidden by a high average.

The weighted score must also meet the pack minimum.

Evaluation does not call a model by itself.

Persist eval results as evidence, not as unqualified quality claims.

## External Agents

Codex and Claude Code remain external controllers.

They may discover packs through CLI or MCP.

They retain ownership of their coding sandbox and tool runtime.

Cutout owns Design IR, policy checks and managed project state.

Workflow packs cannot expand filesystem scope.

Workflow packs cannot expose credentials.

Workflow packs cannot enable unavailable integrations.

## Completion

Report the selected pack id and version.

Report compatibility results and missing capabilities.

Report approval requirements before effects occur.

Report eval evidence and final status after execution.

Do not call a workflow complete while required steps remain blocked.
