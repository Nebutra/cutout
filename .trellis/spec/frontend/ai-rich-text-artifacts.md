# AI Rich-Text Artifacts

## 1. Scope / Trigger

Use this contract whenever AI-generated structured data also needs a readable
review surface. Structured data remains authoritative for execution; Markdown
is a persisted presentation artifact. React components must not reconstruct a
domain-specific review dashboard from structured fields.

## 2. Signatures

```ts
interface PrototypeReviewDocument {
  format: 'markdown'
  primaryFlow: string
  fullPlan: string
}

function prototypeReviewMarkdown(
  plan: PrototypePlan,
  scope: 'primary-flow' | 'full-plan',
): string

function RichText(props: {
  markdown: string
  variant?: 'message' | 'artifact'
  className?: string
}): JSX.Element
```

## 3. Contracts

- New planner results use `generatedPrototypePlanSchema`, which requires both
  non-empty Markdown documents and limits each to 40,000 characters.
- Persisted records use `prototypePlanSchema`, where `reviewDocument` remains
  optional so legacy workspaces still parse.
- Scope switching selects an authored document. It never parses or slices
  Markdown in the frontend.
- Copy and Download consume the exact string passed to the artifact renderer.
- `RichText` supports GFM without raw HTML. Only absolute HTTP(S) links become
  anchors; rejected links render as inert text. Images are not embedded.
- The structured plan remains the source of truth for page generation,
  validation, repair, and scope calculation.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| New planner omits either scope document | Schema validation fails |
| Persisted legacy plan has no document | Render deterministic Markdown projection |
| Authored document is whitespace-only | Use legacy projection |
| Markdown contains raw HTML | Omit the HTML node; never execute it |
| Link uses `javascript:`, `data:`, or a relative URL | Render label without a link |
| User switches scope | Render the matching persisted document |

## 5. Good / Base / Bad Cases

- Good: the model authors a table-led Chinese review for a Chinese brief and
  the artifact surface renders it unchanged.
- Base: an older plan opens through the compatibility projection and remains
  readable without migrating storage.
- Bad: a component renders fixed Overview, Flow, Palette, and Asset cards from
  `PrototypePlan`; this couples presentation to schema fields and blocks AI
  authored document structure.

## 6. Tests Required

- Schema: legacy plans parse; generated plans without both documents fail.
- Projection: each scope returns its exact authored string; legacy scope still
  filters pages through `pagesForScope`.
- Renderer: headings, GFM tables, lists, and code render in message and artifact
  variants; raw HTML and unsafe URLs stay inert.
- Artifact shell: arbitrary heading order renders without Review context or
  Outline UI.
- Workspace: Copy, Download, scope switching, and Request changes remain wired
  to the existing composer and selected Markdown.

## 7. Wrong vs Correct

### Wrong

```tsx
<aside>Review context</aside>
<PlanFlow plan={plan} />
<PaletteGrid tokens={plan.designSystem.palette} />
```

### Correct

```tsx
const markdown = prototypeReviewMarkdown(plan, scope)

<RichTextArtifact
  label="Plan review"
  title={plan.product.name}
  markdown={markdown}
  actions={actions}
/>
```
