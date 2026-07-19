# Prototype Route-Suite Generation

## 1. Scope / Trigger

Apply this contract whenever the prototype Planner, suite scope, page image
generation, workspace recovery, or downstream slicing source changes. It
prevents a valid multi-route application plan from collapsing to one primary
flow or a set of visually unrelated screenshots.

## 2. Signatures

```ts
type PrototypeSuiteScope = 'primary-flow' | 'full-plan'

const DEFAULT_PROTOTYPE_SUITE_SCOPE: PrototypeSuiteScope = 'full-plan'

function pagesForScope(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
): PrototypePage[]

function validatePrototypePlan(
  plan: PrototypePlan,
): Result<{ readonly reachablePageIds: readonly string[] }>

function generatePrototypePageSet<Page, Artifact>(input: {
  readonly pages: readonly Page[]
  readonly existingArtifacts?: readonly Artifact[]
  readonly mode: 'serial' | 'anchor-parallel'
  readonly concurrency: number
  readonly generate: (page: Page, anchor?: Artifact) => Promise<Artifact>
  readonly onProgress?: (artifacts: readonly Artifact[]) => void
}): Promise<Artifact[]>

function prototypePagePrompt(
  plan: PrototypePlan,
  page: PrototypePage,
  finalDesignMarkdown?: string | null,
): string
```

## 3. Contracts

- The Planner Agent owns information architecture: route count, hierarchy,
  naming, grouping, and navigation model are derived from product intent,
  content, platform conventions, and user workflows. Production code must not
  prescribe a Home/Pricing/About or other fixed route tree.
- Each `PrototypePage.route` is a unique stable logical destination. Web plans
  normally use URL/path identities; other platforms may use appropriate named
  screen or destination identities.
- New workspaces use `full-plan`. `primary-flow` remains an explicit user scope,
  not a hidden default.
- Every planned page must be reachable from at least one declared flow start.
- `anchor-parallel` generates or reuses the first planned page before bounded
  parallel generation. Every later page receives the same design-system
  reference and the same first-page visual anchor.
- Each page prompt contains the complete Agent-authored route and flow contract.
- Page generation consumes the completed design-system artifact through two
  coordinated channels: `designSystem.bytes` is the immutable visual identity
  reference, and the validated `designSystem.designMarkdown` is the final text
  contract. The pre-synthesis imported/correction context is only an input to
  design-system creation and must not bypass the resulting document.
- If the artifact's `designMarkdown` is invalid, page generation may fall back
  to the earlier text context, while retaining the design-system image
  reference. Invalid companion documentation must not erase valid visual media.
- Downstream asset production and slicing may start only after the exact scoped
  page set has been produced. A partial suite is not success.
- Keep the default scope in `src/prototype/scope.ts`. Persistence code must not
  import `generate-suite.ts`, because that pulls DESIGN.md/YAML machinery into
  the frontend entry chunk.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Duplicate page id | `validatePrototypePlan` returns an error |
| Duplicate route identity | `validatePrototypePlan` returns `Duplicate page route` |
| Missing interaction target | validation returns an unknown-page error |
| Planned page unreachable from all flows | validation returns an unreachable-pages error |
| Generator returns another page identity | generation throws before publication |
| Any scoped page is missing | generation throws `Prototype generation is incomplete` |
| Empty page list | generation throws; no downstream production starts |
| Existing explicit `primary-flow` workspace | preserve its selected scope |
| Valid image-grounded `designSystem.designMarkdown` | include it in every page prompt as `Final DESIGN.md` |
| Invalid final `designSystem.designMarkdown` | fall back to pre-synthesis text context; keep the image identity reference |

## 5. Good / Base / Bad Cases

- Good: the Agent derives four routes across two workflows; all four images are
  generated, share one visual anchor, consume the image-grounded final
  `DESIGN.md`, and then become slicing sources.
- Base: a genuinely single-screen product yields one Agent-planned route and one
  image; no synthetic second screen is invented.
- Bad: the Agent plans account and settings in a secondary flow, but the
  workspace silently defaults to the first flow and publishes only the home and
  catalog images.
- Bad: the design-system image and final `DESIGN.md` are created, but page
  generation receives only the imported text that existed before image
  grounding, so the screens ignore refinements discovered from the visual.

## 6. Tests Required

- Planner prompt test: asserts dynamic IA ownership, platform-native route meta
  rules, complete route coverage, and no fixed template instruction.
- Plan validation test: duplicate route identities fail while arbitrary Agent
  route names remain valid.
- Page-set unit test: all pages are generated, progress stays in plan order,
  concurrency is bounded, and every follower uses one stable anchor.
- Rendered component E2E: submit a product intent to the real
  `IntentWorkspace`, mock only external model/desktop boundaries, then assert
  every Agent-planned route is persisted and every visual task carries the full
  route contract, common series identity, shared design-system image reference,
  and a rule unique to the synthesized final `DESIGN.md`.
- Real-provider benchmark remains gated by credentials and reports transport
  failures separately from deterministic product regressions.

## 7. Wrong vs Correct

### Wrong

```ts
// Hidden product template and hidden route loss.
const pages = [homePage, pricingPage, aboutPage]
const scope: PrototypeSuiteScope = 'primary-flow'
await Promise.all(pages.map((page) => generate(page, designSystemOnly)))

// Bypasses the image-grounded contract that was just synthesized.
const pageDesignContext = preSynthesisContext
```

### Correct

```ts
// The Agent authors `plan.pages`; the executor consumes the complete graph.
const pages = pagesForScope(plan, DEFAULT_PROTOTYPE_SUITE_SCOPE)
await generatePrototypePageSet({
  pages,
  mode: 'anchor-parallel',
  concurrency: 2,
  generate: (page, anchor) => generatePage(page, designSystem, anchor),
})

const pageDesignContext = isValidDesignMarkdown(designSystem.designMarkdown)
  ? designSystem.designMarkdown
  : preSynthesisContext
```
