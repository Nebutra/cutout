# General Design OS desktop workbench

## Goal

Replace the prototype-shaped workspace and domain-tab inspector with one quiet,
efficient Design OS workbench. Designers and Builders must be able to move from
intent and evidence to production, review and verified delivery without leaving
the Project or learning a different shell for Product UI/UX, Brand, Commerce,
Game Asset or Motion work.

## Background

- `PipelineCanvas` is the current Project surface, while Design OS capabilities
  are split between a `System inspector` dialog and an inline Deliver surface.
- `DesignOsWorkbench` exposes Commerce and Game Asset as global tabs and
  `AppShell` special-cases Game Asset launch. This makes each new domain grow as
  another mini-application.
- Product UI/UX is currently implicit across prototype Canvas, Specimen, Figma,
  Components and Starter surfaces rather than represented as the core Product
  Design capability.
- The Design OS Kernel and Design Profile Platform already establish that one
  Project may compose multiple Profiles and that a Profile is not an app mode.
- Commerce has a normal desktop Project path and a separately isolated
  Benchmark authority. Game Asset production is being extended in parallel and
  must retain its existing domain contracts and files.

## Product Model

- **Profile** defines domain roles, constraints, QA and delivery semantics.
  First-class Profiles are Product UI/UX, Brand, Commerce, Game Asset and Motion.
- **Recipe** composes Profiles and graph fragments for a user outcome, such as
  Rapid Prototype, Product Redesign, Commerce Localization, Sprite Family or
  Launch Day. Recipes are not global navigation.
- **View** projects the same Project records for a task: Canvas, Flow, Board,
  Timeline, Matrix, Graph or Inspect. Switching views does not change authority.
- **Delivery** applies an accepted closure to a target and retains the exact
  receipt. Generated or reviewed artifacts are not delivered merely because
  Provider execution completed.

## Requirements

### R1. Stable product lifecycle

- Use one primary lifecycle everywhere: Brief, Sources, Create, Review, Deliver
  and Inspect.
- Domain Profiles may contribute production lanes, views and semantic actions;
  they may not add a global navigation branch or own Project history.
- Opening a legacy Commerce, Game Asset, Specimen, Figma, Kit, Component or
  Starter destination must resolve into the correct lifecycle section without
  breaking existing callers.

### R2. Product UI/UX as the core Profile

- Treat existing prototype generation as a Product UI/UX Recipe, not a separate
  Profile or the definition of the whole product.
- Product UI/UX covers Brief, IA/Flow, responsive screens and states, design
  system, prototype, accessibility/visual review and code/design handoff.
- The existing Canvas remains the spatial editor. Specimen, Figma, Components
  and Starter remain projections or deliveries of the same Product records.

### R3. Composable production lanes

- Create presents Product UI/UX, Brand, Commerce, Game Asset and Motion as
  production lanes inside one Project shell. A mixed Project may use several.
- Commerce and Game Asset retain their current production components and domain
  state; the shared shell must not duplicate or reinterpret their receipts.
- Motion stays visibly unavailable until an authorized temporal Host exists.
- Benchmark/evaluator controls remain under Inspect/Labs and never appear as a
  normal production lane or delivery state.

### R4. Designer and Builder parity

- Designer and Builder are contextual lenses over the same Project records and
  semantic commands, not separate modes with duplicated state.
- Designer prioritizes composition, comparison, annotation and readiness.
  Builder reveals graphs, schemas, target bindings, provenance and receipts.
- Equivalent actions in either lens must resolve to the same command, revision,
  ImpactSet, approval and delivery result.

### R5. Review as a real gate

- Review aggregates only existing governance findings, readiness blockers,
  accepted artifacts, stale state and receipt evidence.
- Empty or missing review evidence is explicit. The UI may not invent review
  threads, approvals, quality scores or completion.
- Failed nodes retain valid siblings and offer targeted repair through existing
  domain actions where those actions are implemented.

### R6. Delivery closure

- Deliver projects only accepted, revision-bound artifacts and existing target
  adapters. Preview remains distinct from approved apply.
- Product UI/UX handoff, Brand kits, Commerce bundles and Game bundles use the
  same delivery lifecycle while retaining domain-specific manifests.
- No arbitrary destination writer, web fetch, cloud collaboration, live Figma
  sync or unsupported engine/video adapter may be implied by the shell.

### R7. Responsive operational UI

- Use stable controls and an unframed work surface. Do not nest page sections in
  decorative cards or force every artifact type into one universal canvas.
- Desktop uses lifecycle navigation plus a contextual production/view rail.
  Narrow layouts preserve all commands through horizontal or stacked navigation
  without overlap, clipped labels or layout shifts.
- Loading, unavailable, stale, partial and failed states remain visually and
  semantically distinct from empty success.

### R8. Incremental migration

- Introduce a shared navigation/projection contract and adapt current surfaces
  before changing domain internals.
- Do not edit `GameAssetProductionPanel` or Game Asset Profile files owned by the
  parallel task in the first migration stage.
- Keep CLI/MCP and public Agent operations unchanged; this is a desktop Project
  workbench refactor until a new executable external surface exists.

### R9. Converged Project state

- The workspace rail may expose quick Agent, Files, Git, Assets and Design
  drawers, but it must not duplicate the Workbench lifecycle or Deliver state.
- Product UI/UX Create opens Canvas by default; exact legacy Specimen/Figma
  requests remain compatible.
- Commerce production survives lifecycle navigation and restart as a validated,
  current-revision record. Review acceptance is explicit, and Deliver is blocked
  until that acceptance exists.
- Commerce browser downloads must be named for their actual multi-file behavior
  and may record only a request, never an invented filesystem receipt.

## Acceptance Criteria

- [x] W1: Inspector and Deliver render the same six-stage lifecycle navigation
      and keep one selected Project/revision while moving between sections.
- [x] W2: No global top-level Commerce or Game Asset tab remains. Legacy routes
      open the matching Create production lane with their launch input intact.
- [x] W3: Product UI/UX is the default Create lane; Prototype is represented as
      a Recipe/view of Product UI/UX rather than a peer Profile.
- [x] W4: Product UI/UX, Commerce and Game Asset use the same shell; Brand and
      Motion report only their truthful current readiness.
- [x] W5: Review derives counts and blockers from real governance, readiness and
      receipt data and renders an explicit no-evidence state when absent.
- [x] W6: Deliver preserves preview/apply separation, back navigation and exact
      revision bindings across Delivery Center, Kits, Components and Starter.
- [x] W7: Designer/Builder lens changes presentation only; selected destination,
      callbacks and command authority remain stable.
- [x] W8: Existing Commerce and Game production tests remain green without
      weakening domain schemas, receipts, QA, cancellation or partial recovery.
- [x] W9: Component and isolated headless-browser visual checks cover lifecycle
      navigation, legacy route mapping, long labels, desktop and mobile geometry.
- [x] W10: Lint, strict TypeScript, focused/full relevant tests, production build,
      bundle gate and `git diff --check` pass. Agent validation runs only if the
      public surface changes.

## Out Of Scope

- Rebuilding Figma, Premiere, a DAW or a game engine.
- New Provider routes, automatic background campaigns, cloud presence or
  realtime co-editing.
- Implementing the unavailable Motion Host, engine adapters or arbitrary target
  writers as part of the shell migration.
- Rewriting the concurrently owned Game Asset production implementation.
