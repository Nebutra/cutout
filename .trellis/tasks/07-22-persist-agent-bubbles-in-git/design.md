# Design: Git-managed Agent conversation branches

## Authority And Boundaries

- `AgentRunEventStore` is the single conversation/lifecycle authority.
- `AgentWorkspaceDock` renders a projection of the event DAG; it does not own
  transient copies of durable bubbles.
- `workspace.v1.agentRunEvents` remains the backward-compatible desktop cache.
- Repository-backed projects persist the same validated store to controlled
  `.cutout/run-events.json`; callers never choose another path.

## Conversation DAG

- `intent-recorded` and `steer-recorded` gain optional `parentEventId`, pointing
  to the selected Agent response that preceded the new user turn.
- `agent-message` gains optional `responseToEventId`, pointing to the user turn
  it answers. Messages sharing that value are immutable sibling variants.
- A new `branch-selected` event records `sourceEventId` and
  `responseEventId`. Replay selects the latest valid sibling; older projects
  without links use their existing linear order as a compatibility projection.
- Regenerate emits a fresh `agent-message` sibling and `branch-selected`; it
  never emits `message-revised` against an Agent response. Existing revisions
  remain readable for old projects and user-message edits.

## UI Projection

- Only the selected sibling is rendered in the main transcript.
- A response with multiple siblings renders icon controls for previous/next
  plus a stable `index / count` label. Selection emits a durable event.
- New user turns attach to the currently selected response, so switching a
  branch changes the continuation head without deleting sibling history.
- Live provider text remains ephemeral while streaming, then resolves into one
  durable `agent-message` node.

## Lifecycle Bubbles

- `Preparing the run` becomes a real lifecycle step using existing
  `step-started` and `step-succeeded`/`step-failed` events.
- Lifecycle rows belong to their run/attempt branch and remain visible with a
  terminal state. They are not response alternatives and do not receive
  previous/next controls.
- Raw token deltas, elapsed timer frames, and decorative spinner state are not
  persisted.

## Repository Persistence

- Desktop persistence uses the authorized workspace handle to read/write only
  `.cutout/run-events.json` through a native command or shared controlled
  runtime adapter.
- Writes validate `agentRunEventStoreSchema`, use atomic replacement, reject
  symlinks/traversal, and never expose the filesystem path to the webview.
- IndexedDB recovery and `.cutout` synchronization use event IDs for merge and
  fail closed on incompatible divergent payloads for the same ID.

## Compatibility And Rollback

- New relationship fields are optional; existing `agent-run-events.v1` stores
  continue to parse.
- Legacy linear messages project as a single selected branch until a new
  branch is created.
- Rollback may ignore the optional links but must not delete events. Published
  releases remain immutable; source corrections use a newer patch version.
