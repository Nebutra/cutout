# Technical Design

## Architecture

Introduce a presentation contract owned by the prototype domain:

```ts
interface PrototypeReviewDocument {
  format: 'markdown'
  fullPlan: string
  primaryFlow: string
}
```

`PrototypePlan` keeps all existing structured fields and gains an optional
`reviewDocument` for backward compatibility. The planner prompt requests both
structured execution data and the review document in the same validated model
result. The model therefore authors the narrative without adding a second
provider call or a second failure boundary.

## Data Flow

1. The planner receives the user brief and generates one schema-valid plan.
2. Structured fields are validated exactly as today and drive all execution.
3. `reviewDocument` is persisted with the workspace plan.
4. A domain projection selects `primaryFlow` or `fullPlan` Markdown.
5. Missing legacy Markdown falls back to a deterministic compatibility
   serializer located outside the React component.
6. `RichText` renders the selected Markdown; toolbar actions consume the same
   string.

## Rendering Boundary

Replace the hand-written `AgentRichText` parser with a standards-based safe
Markdown renderer using `react-markdown` and `remark-gfm`. Expose a shared
component with `message` and `artifact` presentation variants. Do not enable raw
HTML parsing. Restrict links to HTTP(S), and render rejected links as text.

The artifact variant owns document typography, responsive tables, code blocks,
and a constrained readable measure. It does not know about `PrototypePlan`.

## Workspace UX

`PrototypePlanReview` becomes a thin artifact shell:

- compact toolbar: document title/status, optional scope control, generic
  actions;
- one scrollable rich-text document;
- no context sidebar or plan-specific document sections;
- Request changes delegates to the existing Agent composer focus callback.

The existing workspace Agent dock remains the conversation surface and can sit
beside the artifact. No new chat implementation is introduced.

## Compatibility

- `reviewDocument` remains optional in `prototype-plan.v0` so persisted plans
  and tests continue to parse.
- Local semantic fallback plans receive a deterministic review projection at
  display time.
- The fallback serializer is tested but intentionally not exposed as UI
  structure.

## Risks And Mitigations

- Model omits Markdown: optional schema plus deterministic fallback.
- Markdown duplicates or contradicts execution data: structured plan remains
  authoritative and review copy is explicitly presentation-only.
- Unsafe content: no raw HTML plugin; protocol allowlist for links.
- Dependency size: keep syntax highlighting and MDX out of scope.
- Scope drift: persist separately authored `primaryFlow` and `fullPlan`
  documents; fall back to structured projection when a legacy document is
  absent.

## Rollback

The change can roll back at the artifact shell while retaining the optional
schema field. Existing structured generation remains unaffected.
