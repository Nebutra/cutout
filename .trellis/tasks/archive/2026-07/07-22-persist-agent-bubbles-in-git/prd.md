# Persist Agent bubbles in project history

## Goal

Make visible Agent conversation and meaningful run-status bubbles durable,
recoverable project history instead of transient React-only projections, with
an explicit path to repository-managed `.cutout` event state.

## Background

- The highlighted `Preparing the run / Checking your request...` bubble is
  constructed in `agent-view-model.ts` only while `working` is true. It has a
  `runtime:activity:*` ID and `provenance: runtime`, so it disappears when the
  run settles.
- User and Agent text bubbles are projected from durable `intent-recorded`,
  `steer-recorded`, and `agent-message` events. Regenerate emits a
  `message-revised` event targeting the original Agent message, so the same
  bubble remains after regeneration.
- `IntentWorkspace` stores `agentRunEvents` in `workspace.v1`, which the local
  project repository persists in IndexedDB.
- The repository-native Headless Runtime owns `.cutout/run-events.json`, but
  the desktop React activity bubble is not currently written there. IndexedDB
  durability and Git-managed `.cutout` history are therefore not equivalent.

## Requirements

- Every visible user/Agent text bubble must have a durable event identity or be
  an in-progress projection that deterministically resolves into a durable
  event-backed row.
- A run-status bubble must not disappear without a durable successor that
  records the completed, failed, cancelled, or replaced state.
- Regenerate and Retry must revise or append events through one shared event
  model rather than maintaining separate UI-only bubble behavior.
- Regenerate must never overwrite the original Agent response. It creates an
  immutable sibling response from the same effective user turn, and the
  response bubble exposes `previous / next` branch navigation with a stable
  position indicator such as `1 / 2`.
- The selected response branch becomes the active conversation head. New user
  turns attach only to that branch while sibling branches remain recoverable,
  switchable, and Git-auditable.
- Desktop project recovery and repository-native `.cutout/run-events.json`
  must have an explicit authority/synchronization contract before claiming
  bubbles are Git-managed.
- Preserve append-only auditability, event IDs, run IDs, revisions, approval
  receipts, and compatibility with existing `workspace.v1` projects.
- Do not persist raw provider stream deltas, secrets, arbitrary paths, or every
  animation frame as repository history.

## Acceptance Criteria

- [x] The preparing bubble cannot vanish at run completion; it either remains
  as a completed event-backed lifecycle row or is replaced in place by a
  durable event-backed successor according to the approved product behavior.
- [x] User messages, Agent replies, Regenerate revisions, Retry lineage, and
  terminal run states restore after app restart with stable identities.
- [x] Regenerating a response preserves the original response, creates one
  sibling branch, renders `previous / next` branch controls, and resumes future
  conversation from the selected branch.
- [x] Repository-backed projects expose the approved durable bubble/event
  history through controlled `.cutout` state that Git can inspect.
- [x] Existing projects migrate without duplicate bubbles or lost revisions.
- [x] Unit, workspace persistence, restart recovery, Git projection, and UI
  integration tests cover create, regenerate, retry, failure, cancellation,
  and successful completion.

## Product Decision

- Conversation history is an immutable DAG, not a mutable linear transcript.
- Regenerate creates sibling response branches and uses `previous / next`
  controls to select the active branch; it does not revise, collapse, or delete
  the original response.
- Run progress belongs to the owning attempt branch. Terminal lifecycle facts
  remain auditable in Git without being confused with response alternatives.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
