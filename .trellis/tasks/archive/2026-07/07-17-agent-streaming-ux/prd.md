# Agent streaming experience

## Goal

Make a running Cutout generation legible without exposing internal orchestration:
the user can read an Agent reply as it arrives, understand which materials are
pending or ready, and use rich output safely.

## Confirmed Facts

- The native AI proxy and `GenerationService.streamText()` support text delta
  streaming, but `IntentWorkspace` only writes that stream to
  `liveAgentOutput`; the active Agent dock does not render it.
- The active Agent dock renders message bodies as escaped plain text. It does
  not render Markdown, code blocks, tables, or links.
- Prototype pages are added to state after each complete image returns. Region
  cutout slices are appended after each region completes. Individual image
  generation has no user-visible pending card or partial-preview state.
- Run events are append-only and persisted. New live UX must not create
  duplicate conversational turns on retry or after reopening a project.
- Product constraints: do not claim unsupported providers/capabilities; do not
  weaken approval or paid-action policy; project data remains local.

## Requirements

1. The Agent dock shows one pending assistant bubble for a live response and
   updates it with text deltas without creating durable event spam.
2. Completed assistant messages render a constrained, local rich-text subset:
   paragraphs, headings, lists, emphasis, inline code, fenced code, and safe
   links. Raw HTML and executable content remain inert.
3. The material flow exposes queued, generating, ready, and failed states for
   design systems, prototype pages, and cutout regions. A completed artifact
   replaces its own placeholder without moving the user viewport.
4. Cancellation, retry, project reload, and a fallback from streaming to a
   buffered model response leave one coherent transcript and truthful material
   state.
5. The existing final Agent message and output artifacts remain compatible with
   old workspace snapshots.

## Proposed Scope

- Phase 1: visible Agent delta bubble plus safe rich text for final messages.
- Phase 2: material task cards and progressive canvas replacement using the
  existing region/page completion boundaries. Do not promise pixel-level image
  streaming that providers do not expose.
- Phase 3 only if required: provider-specific partial-image previews.

## Acceptance Criteria

- [x] During a streamed conversational response, the dock updates one Agent
  bubble in place and keeps it scrolled into view.
- [x] On completion, the same bubble becomes one durable `agent-message`; a
  retry or reload does not duplicate it.
- [x] Markdown is rendered from an allowlisted AST with no raw HTML execution
  and no unsafe URL schemes.
- [x] Generation stages visibly move from queued to generating to ready/failed
  for pages and region slices; completed results replace the correct card.
- [x] Canvas panning/zoom state is preserved as material placeholders resolve.
- [x] Unit and visual coverage cover normal completion, cancellation, buffered
  fallback, retry, and workspace restore.

## Verification Evidence

- `live-agent-output.test.ts` proves exact delta batching, buffered fallback,
  cancellation propagation, and rejection of unfinished legacy snapshot text.
- `agent-view-model.test.ts` proves a single pending turn before the first delta,
  one projected stream, durable reply replay, and retry intent de-duplication.
- `AgentRichText.test.tsx` proves the allowlisted Markdown and URL policy.
- `OutputCanvas.overlay.test.tsx` proves queued/generating/failed labels and
  stable-ID replacement with a ready artifact; `output-canvas-viewport.test.ts`
  proves later replacements do not request another fit.
- Focused Vitest: 75 tests passed. `tsc --noEmit`, `pnpm lint`, and
  `git diff --check` passed. Desktop Playwright directly relevant cases for
  conversation/canvas separation and retry de-duplication passed.

## Out Of Scope

- Token-by-token image pixels or a fake progress percentage where the provider
  exposes neither.
- External web fetching, live Figma synchronization, cloud collaboration, or
  headless providers.

## Product Decision

- Follow the established AI-product pattern: conversational prose streams in a
  single Agent bubble; generation and material state stay as compact,
  independently readable status cards on the canvas. Do not expose reasoning or
  turn the chat transcript into an execution log.
