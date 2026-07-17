# Implementation Plan

1. Define the live-turn type and its pure projection into `agent-view-model`.
   Add reducer and retry/restore tests before wiring a provider.
2. Extend the conversational generation boundary with a streaming-capable path,
   preserving the existing tool-call path for structured decisions.
3. Render a pending bubble in `AgentWorkspaceDock`, then finalize it through one
   durable `agent-message` event.
4. Add `AgentRichText` with parser and security tests; switch completed Agent
   messages to it.
5. Add a material task projection and canvas placeholder nodes. Wire page and
   region completion callbacks to replace only their matching placeholder.
6. Verify visual behavior at desktop/mobile plus cancellation, buffered fallback,
   retry, and restored workspace cases.

## Risky Boundaries

- `GenerationService` / Tauri streaming transport
- `AgentRunEvent` persistence and replay
- Agent dock message projection
- React Flow node identity and viewport preservation

## Validation

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm agent:validate`
- focused Vitest coverage for the event/view-model/material projection
- focused Playwright coverage for Agent streaming and canvas replacement
