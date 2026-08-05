# Technical design

## Event flow

Keep `AgentRunEvent` as the source of truth. Replace the single Codex
preparation step with four ordered step IDs under the existing
`step:prepare:` namespace:

1. `context` - construct the bounded Cutout planning envelope.
2. `runtime` - start the native-owned planning runtime turn.
3. `response` - wait for the schema-bound model result; reconnect events update
   live detail without completing the stage.
4. `validation` - parse the returned object through the Cutout-owned schema.

Every started step receives exactly one succeeded, failed, or cancelled
terminal event. The orchestration function owns the active step identity so an
error closes only the boundary that was actually running.

## Projection

`agent-view-model.ts` recognizes the closed preparation phase IDs and projects
an ordered progress array on the existing activity message. Observed lifecycle
events determine completed/running state; later known phases remain waiting.
Legacy single preparation events continue to render the existing compact
activity without an invented breakdown.

The top-level activity label/detail comes from the current active preparation
step. The expanded rows are another projection of the same events, not a
parallel state store.

## Presentation

`AgentWorkspaceDock` keeps the current compact status row. When progress exists,
it renders a native `details/summary` disclosure below the current detail. Each
stage has a familiar status icon and short label. The overall elapsed timer
stays in the summary row; no percentage or ETA is shown.

## Failure and recovery

Cancellation/failure terminals remove the active preparation activity through
the existing selector. Existing error and Retry surfaces remain authoritative.
A reconnect changes only ephemeral live detail for the active response stage;
it does not append duplicate progress phases or reset elapsed time.

## Compatibility

No protocol, IPC, capability manifest, or persisted event schema change is
required. Existing historical run events remain readable and use the legacy
single-row presentation.
