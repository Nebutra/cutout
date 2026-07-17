# Agent Streaming UX Design

## User Model

The conversation answers "what the Agent is saying". The material board answers
"what is being made". Neither surface should become an execution console.

## Architecture

```text
provider text deltas -> ephemeral live turn -> Agent dock pending bubble
provider completion  -> durable agent-message -> completed rich-text bubble

generation lifecycle -> material task projection -> canvas placeholders
artifact completed   -> existing artifact state  -> placeholder replacement
```

### Live Conversation Turn

Add one ephemeral `LiveAgentTurn` owned by `IntentWorkspace`, keyed by run and
turn ID. It carries `text`, `status` (`streaming`, `buffering`, `failed`), and
an optional fallback explanation. It is deliberately not one durable run event
per delta. `agent-view-model` receives it as an optional final pending message.

When the provider completes, append exactly one existing `agent-message` event
and clear the ephemeral turn. On cancel or error, clear it without adding a
duplicate final message. During project restoration, an unfinished ephemeral
turn is not replayed; persisted final run events remain the source of truth.

The conversational tool path currently returns only a buffered
`generateWithTools` result. Phase 1 must add a streaming-capable tool-call
adapter or use a distinct conversational text path before a visible delta bubble
is claimed for that path. DESIGN.md synthesis can use the live-turn primitive
only after its output is intended for the user; otherwise it remains internal.

### Rich Text

Create one `AgentRichText` renderer. Parse only an allowlisted Markdown subset
into React elements; never pass raw HTML through. Links allow only `https:` and
`http:` URLs, open with `rel="noreferrer"`, and code is plain text. Tool labels,
material names, and error payloads stay plain text.

### Material State Projection

Create a small pure projection from the existing run phase and artifact state:

| Material | queued | generating | ready | failed |
| --- | --- | --- | --- | --- |
| Design system | plan exists | `design-system` phase | artifact exists | run error before artifact |
| Prototype page | planned page absent | current generation slot | page artifact exists | task/run failure |
| Region slices | page/region planned | active region run | appended region slices | `failedRegionIds` |

`OutputCanvas` receives task cards with stable IDs. A ready `CanvasImageItem`
replaces the matching task card in place. Existing `consumeCanvasAutoFit` stays
the only viewport policy: first result fits; later replacements preserve view.

## Compatibility And Failure Rules

- Existing `agent-message` event schema remains backward compatible.
- No delta is persisted in `agentRunEvents`; snapshots contain final events and
  already-supported output artifacts only.
- Buffered providers show the same pending bubble in `buffering` state, then
  resolve atomically.
- Cancellation/repair clears only the active ephemeral turn and preserves prior
  completed conversation turns.
- Per-image partial pixel previews are excluded until an actual provider contract
  supplies them.
