# Implementation plan

1. Add generic candidate-exploration and candidate-selection schemas, pure
   validators, revision guards, selection preview/apply helpers, and Design IR
   `candidateSets` support. Cover unsupported counts, malformed counts,
   mismatched direction lists, missing materials, stale selection, and legacy
   documents.
2. Extend the prototype Agent proposal contract and prompt with `auto`/`fixed`
   exploration requests, resolved counts, exact direction theses,
   runtime/provider bounds, and rationale. Preserve old prototype plans by
   migrating to a one-direction fallback.
3. Add deterministic projection from validated selected `DESIGN.md` controls to
   provenance-bound Design IR tokens. Add promotion previews that protect
   manual tokens and report downstream prototype/production invalidation.
4. Extend Design Kit compilation/export so a verified selected
   design-markdown material is emitted as authoritative `DESIGN.md`, while
   token JSON/CSS/Tailwind/theme outputs derive from promoted Design IR tokens.
   Retain the deterministic documentation fallback for documents without a
   selected Design System source.
5. Replace the singular prototype Design System runtime boundary with candidate
   generation and recovery helpers. Generate one visual + image-grounded
   `DESIGN.md` per planned direction, retain partial successes, preserve
   cancellation/idempotency, and auto-promote only single-candidate plans.
6. Introduce a resumable `design-system-selection` workflow phase. Persist the
   pending candidate set and generation context, then continue page generation
   in a new run only after revision-bound promotion succeeds.
7. Build the comparison UX with Auto/Fixed exploration controls, numeric
   stepper, bounds/cost preview, horizontally comparable candidates,
   status/error states,
   detailed visual and DESIGN.md inspection, and a clear selection command.
   Reuse creative-board favorite/reject/lock/more-like-this decisions without
   treating them as promotion.
8. Refactor downstream selectors so page prompts, image references, Asset
   Production, outcome reporting, save/reload, and repair/regeneration consume
   only the promoted candidate. Add explicit invalidation flow when selection
   changes after dependent pages exist.
9. Migrate historical singular workspace records into one selected candidate;
   update legacy Design IR projection/content resolution and repository
   round-trip tests without duplicating authoritative binary storage.
10. Synchronize Design IR schemas, capability manifest format declarations,
    Agent documentation, and active frontend specs. Do not add a CLI/MCP image
    generation claim.
11. Add focused unit, rendered E2E, persistence, compiler, and Agent contract
    tests. Run type-check, lint, relevant Vitest suites, production build,
    `pnpm agent:validate`, and diff/legacy compatibility checks.

## Review Gates

- Contract gate: an executable proposal always has a resolved bounded count
  and the same number of meaningful directions.
- Authority gate: only the promoted candidate is consumed downstream and its
  selection is revision-bound.
- Design Kit gate: the selected DESIGN.md and promoted tokens produce coherent
  deterministic exports from one source lineage.
- UX gate: multiple candidates remain comparable on desktop and mobile without
  layout overlap, and no page generation starts before selection.
- Compatibility gate: old projects recover as one selected candidate and retain
  existing pages, slices, and exports.
- Safety gate: cost/approval, cancellation, provider capability, content-addressed
  storage, and preview-before-apply contracts remain intact.

## Rollback Points

- Candidate schema and Design IR defaults are additive and can remain even if
  the desktop UX is disabled.
- Keep promotion/token projection behind a pure preview/apply boundary so it
  can be removed without rewriting material content.
- Do not delete the historical workspace reader until migration fixtures prove
  round-trip compatibility.
- Do not expose candidate generation through external control surfaces until a
  provider-capable headless executor actually exists.

## Verification Result

- Generic candidate and revision-bound selection contracts implemented and
  validated in Design IR.
- Prototype runtime generates deliberate candidates with bounded concurrency,
  persists partial/cancelled results, pauses on multi-direction proposals, and
  resumes with only the human-selected artifact.
- Selected `DESIGN.md` tokens project into Design IR and exact selected content
  feeds Design Kit, specimen, starter, and unified delivery compilation.
- Legacy singular workspaces recover as one selected candidate; candidate
  materials and selection survive workspace -> Design IR -> workspace.
- `pnpm lint`, `pnpm exec tsc -b`, full `pnpm test`, `pnpm build`,
  `pnpm agent:validate`, `git diff --check`, and the focused desktop/mobile
  candidate Playwright flow pass.
- The repository-wide screenshot suite still reports pre-existing stale
  baselines for unrelated Home/empty-workspace UI. Those snapshots were not
  rewritten as part of this task.
