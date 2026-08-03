# Design: transient preparation activity projection

## Boundaries

- `run-events.ts` remains the authoritative append-only lifecycle model. No
  event type, reducer, persistence, or protocol changes are required.
- `agent-view-model.ts` owns the distinction between durable conversation
  messages and ephemeral activity presentation.
- `AgentWorkspaceDock.tsx` continues rendering the projected feed without new
  component state.
- `execution-timeline.ts` continues exposing preparation evidence for audit;
  terminal lifecycle events remain available there even when absent from chat.

## Projection Contract

1. Build the durable conversation solely from `projectActiveConversation()`
   and the existing repeated-intent collapse.
2. Inspect lifecycle events belonging to `runEvents.activeRunId` and identify
   the latest preparation step lifecycle.
3. Emit one preparation message only when:
   - the workspace reports `working`;
   - no live Agent message is present; and
   - the latest lifecycle event for that preparation step is `step-started`.
4. Terminal preparation events produce no chat item. They remain in the
   run-event store and execution timeline.
5. Runtime fallback activity remains available only when no durable execution
   activity exists, preserving current behavior for uninstrumented stages.

## Ordering And Branches

The transient preparation item is appended after the selected durable
conversation, so it represents current work rather than a historical turn.
Branch selection only changes the selected durable Agent response; it never
changes or resurrects preparation lifecycle rows.

## Compatibility And Rollback

- Existing projects require no migration because persisted events are
  unchanged.
- Old terminal preparation events simply stop projecting into chat.
- Rollback is limited to restoring the previous view-model projection and
  tests; no persisted state must be rewritten.
