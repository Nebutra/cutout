# Fix regenerate activity bubble duplication

## Goal

Make Agent regeneration display one coherent transient activity bubble while
work is in progress, without leaving preparation bubbles in the durable chat
transcript after the regenerated response completes.

## Background

- Preparation lifecycle events are durable audit facts and use a unique
  `step:prepare:<run-id>` step for every run.
- The conversation projection currently retains the latest preparation event
  for every unique preparation step. Each regeneration therefore adds another
  permanent Agent activity bubble.
- During an active regeneration, the retained preparation rows can overlap the
  live Agent response bubble, producing three visible Agent bubbles. After
  completion, terminal preparation rows remain and appear to move around when
  the selected response branch changes.
- The existing regeneration E2E test correctly requires the terminal
  `step-succeeded` preparation event to remain persisted for audit.

## Requirements

- Keep all preparation lifecycle events in the authoritative run-event store;
  this change must affect only conversation projection.
- Project at most one preparation activity bubble, scoped to the current run
  and only while its preparation step is unresolved and running.
- Suppress the preparation activity bubble once live Agent text is available.
- Do not render succeeded, failed, or cancelled preparation steps as durable
  conversation bubbles.
- Preserve the single user turn, selected response replacement, response branch
  navigation, regeneration eligibility, execution timeline, and audit evidence.
- Do not add or change run-event schemas, Agent protocol contracts, CLI/MCP
  surfaces, approvals, or persistence formats.

## Acceptance Criteria

- [x] An initial run or regeneration with a running preparation step shows
      exactly one Agent activity bubble and no duplicate runtime activity row.
- [x] A live Agent response supersedes the preparation activity bubble.
- [x] A completed, failed, or cancelled preparation step leaves zero activity
      bubbles in the conversation transcript.
- [x] Repeated regeneration does not accumulate preparation bubbles.
- [x] Switching between `1 / 2` and `2 / 2` response branches does not reveal,
      reorder, or recreate preparation bubbles.
- [x] The regenerated conversation still contains one user bubble and one
      selected completed Agent response, with branch metadata intact.
- [x] Persisted events still include preparation `step-started` and terminal
      lifecycle evidence, including the existing `step-succeeded` assertion.
- [x] Focused projection and workspace E2E tests, lint, TypeScript, full tests,
      build, `pnpm agent:validate`, and `git diff --check` pass.

## Out Of Scope

- Changing how preparation events are persisted or displayed in the execution
  timeline and audit tools.
- Changing response branch semantics or adding new run terminal event kinds.
- Altering the visual style of Agent message bubbles.
