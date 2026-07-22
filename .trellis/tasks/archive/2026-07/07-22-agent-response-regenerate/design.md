# Design: Agent response regeneration

## Boundaries

- `AgentWorkspaceDock` owns presentation of message actions and exposes a
  message-specific regeneration callback.
- `agent-view-model` continues projecting durable run events into feed items;
  a small selector resolves the latest regeneratable Agent event and its
  effective source user message.
- `IntentWorkspace` owns rerun execution, route/provider preflight, leases,
  streaming, durable event emission, and stale-error cleanup.
- Existing run-level and paid-tool retry controllers remain unchanged except
  for sharing the corrected new-attempt error lifecycle.

## Data Flow

1. Projection marks only the latest completed durable `agent-message` as
   regeneratable and resolves the nearest preceding effective user turn.
2. The dock renders a `RefreshCw` icon in that message's action bar and calls
   `onRegenerateMessage(eventId)`.
3. `IntentWorkspace` resolves the target and source from durable events, runs
   normal provider/route preflight, accepts a fresh lease, and clears stale
   run error state before any tool-gate await.
4. The request reuses the existing conversation turn, so no new
   `intent-recorded` event is emitted.
5. A successful conversational answer emits `message-revised` targeting the
   original Agent event. Projection applies revisions to both user and Agent
   messages, replacing the rendered response durably.

## Compatibility

- No new run-event kind or persisted schema field is required;
  `message-revised` already has a generic target event id and message payload.
- Existing persisted projects remain readable. Agent-message revisions become
  visible where older code only applied revisions to user messages.
- If the target/source event cannot be resolved, the action fails closed and
  does not start a run.

## Error Lifecycle

- Preflight failures remain visible and do not clear the prior recoverable
  state prematurely.
- After route and provider preflight succeeds and a lease is accepted, the new
  attempt owns the UI. Clear `runError` before the tool gate so both handled
  and generation paths supersede the previous failure.
- A new failure publishes its own classified error and retryable brief.

## Release And Rollback

- Bump the synchronized desktop version to `0.1.4` only after code and focused
  checks pass.
- Tag `v0.1.4` on reviewed `main`; the existing GitHub workflow builds,
  signs, notarizes, validates, and atomically publishes all platforms.
- Rollback is code rollback plus a newer patch release; published tags and
  assets are immutable.
