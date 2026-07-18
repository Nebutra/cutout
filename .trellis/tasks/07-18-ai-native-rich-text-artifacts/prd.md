# AI-native rich text plan artifacts

## Goal

Replace the fixed plan-review dashboard with a reusable AI-authored rich-text
artifact surface. The structured prototype plan remains the authoritative
execution contract; presentation is driven by persisted Markdown rather than a
hard-coded set of React sections.

## Background

- `PrototypePlanReview` currently hard-codes a review sidebar, outline, and a
  fixed document sequence in `src/components/workspace/IntentWorkspace.tsx`.
- `prototypePlanReviewMarkdown()` is currently used only by Copy and Download;
  the displayed review does not render that document.
- `PrototypePlan` is produced through a validated `generateObject` call in
  `src/prototype/planner.ts` and is consumed by generation code. That structured
  contract must remain authoritative for execution.
- The workspace already owns a real `AgentWorkspaceDock`. The review surface
  must not manufacture a second pseudo-chat or a fixed “Review context” rail.
- `AgentRichText` is an existing hand-written Markdown subset. It is suitable
  neither as a general artifact renderer nor for GFM tables and maintainable
  standards compliance.

## Requirements

### R1. AI-authored review document

- A model-produced prototype plan may include a persisted Markdown review
  document authored in the user's language.
- The document may choose its own headings and narrative structure; no fixed
  Overview / User flow / Prototype structure / Visual direction / Asset
  direction sequence is required by the UI.
- The structured fields in `PrototypePlan` remain the source of truth for page
  scope, generation, validation, and repair.

### R2. Generic artifact presentation

- Replace the fixed `PrototypePlanReview` body and context sidebar with a
  reusable rich-text artifact viewer.
- The viewer supports safe GFM-style headings, paragraphs, emphasis, links,
  lists, tables, blockquotes, thematic breaks, and fenced code blocks.
- Raw HTML and unsafe URL schemes must not execute.
- Copy, Download, and Request changes remain generic artifact actions.
- Existing Agent chat remains the conversation surface; the artifact viewer
  must not duplicate conversation content.

### R3. Scope and compatibility

- Primary-flow and full-plan scope selection must continue to work.
- New model output should provide scope-aware review documents without tying UI
  layout to plan fields.
- Each plan persists separate model-authored Markdown for `primaryFlow` and
  `fullPlan`; scope switching selects a document rather than parsing or slicing
  Markdown in the frontend.
- Persisted legacy plans that do not contain a review document must still open
  through a deterministic Markdown compatibility projection.
- Compatibility projection is a migration boundary, not a new UI template.

### R4. Maintainability

- Use one shared rich-text renderer for Agent messages and artifact documents,
  with presentation variants instead of separate Markdown parsers.
- Remove obsolete fixed-review helpers after migration.
- Keep Copy and Download byte-for-byte aligned with the Markdown being shown.

## Acceptance Criteria

- [x] A newly generated plan persists model-authored Markdown alongside the
      structured execution contract.
- [x] The plan-review viewport contains no hard-coded Review context, Outline,
      numbered review sections, palette grid, or page-row dashboard.
- [x] Arbitrary valid Markdown headings and ordering render without component
      changes.
- [x] GFM tables render in both Agent and artifact contexts; raw HTML and
      `javascript:` links remain inert.
- [x] Copy and Download use exactly the currently displayed Markdown.
- [x] Request changes focuses the existing Agent composer.
- [x] Primary-flow/full-plan switching updates the displayed artifact without
      changing execution authority.
- [x] Legacy persisted plans without Markdown still render a readable review.
- [x] Planner, schema, persistence, renderer, and workspace regression tests
      cover the new contract.

## Out of Scope

- A WYSIWYG editor, collaborative comments, live cloud documents, or external
  document synchronization.
- Allowing Markdown to execute arbitrary HTML, scripts, embeds, or commands.
- Replacing the structured prototype execution contract with free-form text.
