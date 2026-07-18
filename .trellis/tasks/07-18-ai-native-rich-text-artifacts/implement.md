# Implementation Plan

1. Add the optional prototype review-document schema and update planner prompt
   instructions, local fallback behavior, fixtures, and schema tests.
2. Add a domain-level review-document projection that selects scope-specific
   AI Markdown and supplies a legacy compatibility document.
3. Replace the custom Markdown parser with a shared safe GFM renderer and add
   message/artifact presentation variants.
4. Reduce `PrototypePlanReview` to a generic artifact toolbar and document
   viewer; remove fixed context/outline/section helpers.
5. Keep scope, Copy, Download, and Request changes wired to the selected
   Markdown source.
6. Add regression tests for arbitrary document structure, GFM tables, unsafe
   HTML/links, legacy plans, and scope switching.
7. Run lint, focused tests, TypeScript production build, Agent contract
   validation, and visual smoke checks.

## Risky Files

- `src/prototype/prototype-plan.ts`: persisted schema compatibility.
- `src/prototype/planner.ts`: model output prompt and fallback behavior.
- `src/components/agent-workspace/AgentRichText.tsx`: shared renderer security.
- `src/components/workspace/IntentWorkspace.tsx`: large shared workspace view.

## Validation

```bash
pnpm lint
pnpm vitest run src/prototype src/components/agent-workspace src/components/workspace
pnpm agent:validate
pnpm build
```

## Rollback Point

Keep the structured plan unchanged and revert only the optional review field,
projection, dependency, and artifact shell if the renderer or planner output
regresses.
