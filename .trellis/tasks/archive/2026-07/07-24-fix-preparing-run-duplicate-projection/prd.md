# Eliminate duplicate preparing-run projections

## Goal

Render one coherent preparation state instead of simultaneous compact chat
activity and expanded execution timeline cards for the same active run.

## Background

- The durable `step:prepare:<run-id>` event is correctly projected as one
  transient Agent activity bubble while request classification is active.
- The same durable step is also included in `projectExecutionTimeline()` and
  rendered by `AgentWorkspaceDock`, producing the duplicate shown in the
  reported screenshot.
- Preparation evidence must remain in the append-only run-event store for Git,
  audit, and timeline reconstruction. This task changes presentation lifetime,
  not persistence.

## Requirements

- During a pure preparation phase, render exactly one compact Agent activity
  bubble and no execution timeline card for the same preparation step.
- Keep the preparation lifecycle in the authoritative event store and full
  execution projection; suppress only the redundant active-dock presentation.
- Show the execution timeline when the active run contains substantive work:
  a non-preparation step, a non-chat-surface tool, or an explicit approval.
- Preserve the first non-empty live Agent text replacing the preparation
  bubble, and preserve terminal preparation suppression from chat.
- Keep approval controls, elapsed state, run cancellation, response branches,
  retry/regenerate behavior, and audit evidence unchanged.
- Do not add component-local mirror state or change run-event schemas,
  persistence, CLI/MCP, approvals, or Agent capability contracts.

## Acceptance Criteria

- [ ] One unresolved preparation step produces exactly one
      `agent-activity-bubble` and zero `execution-timeline` elements.
- [ ] A preparation step plus a substantive running step/tool shows one chat
      activity bubble and one execution timeline containing only actionable or
      substantive work, without repeating the preparation step.
- [ ] A waiting explicit approval remains visible and actionable in the
      execution timeline.
- [ ] Live Agent text replaces the compact preparation bubble without exposing
      a preparation timeline card.
- [ ] Terminal preparation events remain persisted and available to the full
      audit projection but render no preparation bubble or active timeline card.
- [ ] Focused view-model, execution-timeline, dock DOM, and workspace regression
      tests pass together with lint, TypeScript, full tests, build,
      `pnpm agent:validate`, and `git diff --check`.

## Out Of Scope

- Redesigning the visual style of chat bubbles or execution cards.
- Removing preparation evidence from Git-managed run events or audit tools.
- Collapsing genuinely distinct tool, approval, and execution-step states into
  the chat bubble.
