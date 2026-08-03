# Design system variants and downstream consumption

## Goal

Make the prototype Design System a real, selectable product artifact rather
than a transient single-path image. A generated system must have an explicit
portable specification, machine-readable token projections, traceable
downstream consumers, and a human selection boundary when alternatives are
requested.

## Problem Statement

The current prototype workflow generates one visual Design System and one
image-grounded `DESIGN.md`, then immediately uses that artifact to generate the
prototype suite. This prevents comparison before the visual direction becomes
authoritative.

The repository also contains a deterministic Design Kit compiler, but the
prototype workflow and the compiler are not currently one continuous contract:

- Prototype page generation consumes the selected visual reference bytes and
  validated `DESIGN.md`.
- The workspace persists the prototype Design System image and `DESIGN.md` and
  projects both into `.cutout` Design IR materials.
- CSS Variables, Tailwind v4 source, and design-token JSON can be derived in
  the prototype inspector for preview/copy.
- The legacy workspace-to-Design-IR projection currently emits an empty token
  collection, so Design Kit compilation does not automatically consume the
  prototype `DESIGN.md` tokens.
- Formal Design Kit export is a separate explicit operation that requires
  Design IR tokens and emits `DESIGN.md`, `tokens.json`, `tokens.css`,
  `tailwind.css`, `theme.ts`, specimen/demo HTML, and a manifest.

The product therefore has two partial Design System paths without one explicit
promotion contract between them.

## Requirements

### Consumption and authority

- The generated prototype Design System must continue to include both an
  immutable visual reference and a validated image-grounded `DESIGN.md`.
- The selected Design System, and only the selected Design System, becomes the
  authoritative input for prototype page generation and later asset
  production.
- Generated `DESIGN.md` tokens must have an explicit, deterministic path into
  Design IR tokens so formal Design Kit compilation can consume them.
- CSS Variables, Tailwind v4 variables, and design-token JSON must be generated
  deterministically from the same selected source rather than maintained as
  independent facts.
- `.cutout` Design IR and provenance remain authoritative. Generated exports
  remain projections and must not become a second source of truth.
- Existing projects with one persisted Design System must restore without data
  loss and behave as a one-candidate set with that candidate selected.

### Design System alternatives

- Candidate count is not limited to hard-coded `3` or `5` presets. The
  capability accepts a bounded positive count for the current run.
- An explicit user count takes precedence. When the user does not specify a
  count, the Agent recommends a
  count based on requirement ambiguity, meaningful direction diversity,
  available source evidence, expected cost, and latency.
- The resolved count, rationale, estimated cost, expected comparison value, and
  operational bounds are previewed before paid generation. The user may
  approve, reduce, increase within runtime limits, or choose a single-direction
  run.
- Provider/runtime policy may restrict concurrency, budget, or capability.
  These safety bounds must remain distinct from the Agent's creative
  recommendation.
- Candidate generation must preserve the same product brief, source
  references, constraints, provider policy, budget controls, and cancellation
  semantics while deliberately varying visual direction.
- Every candidate includes its own visual reference, image-grounded
  `DESIGN.md`, stable identity, provenance, and generation status.
- The UI provides a comparison view that supports quick visual scanning,
  opening a candidate for detailed inspection, and explicit selection.
- The workflow must pause before prototype page generation when multiple
  candidates exist and no valid selection has been made.
- Selection is durable, revision-bound, auditable, and idempotent. Stale
  selections cannot silently authorize candidates from another run or source
  revision.
- Non-selected candidates remain inspectable and may be rejected, favorited,
  or used as the source for a later variation; they are not silently deleted.
- Regenerating candidates must not overwrite the currently selected system
  until the user promotes a replacement.
- Paid generation cost and candidate count must be visible before approval;
  the feature must not multiply provider calls without an explicit approved
  plan.

### Generalization

- The candidate/selection contract must be reusable for later prototype route
  or full-suite alternatives without making route topology a Design
  System-specific concept.
- The first release must not imply that multiple complete prototype suites are
  available unless that execution path and comparison UI are actually shipped.

### Agent surface

- Any changed Agent capability must remain synchronized across the applicable
  CLI, MCP, control protocol, manifest, schemas, and documentation.
- Preview remains mandatory before any approved apply or promotion.
- No new capability may claim live Figma sync, web fetching/search, video
  processing, cloud collaboration, or a headless provider.

## Acceptance Criteria

- [x] An evidence-backed consumption map documents each Design System output,
      its authoritative source, its automatic consumers, and any explicit-only
      export path.
- [x] A generated candidate contains a valid visual artifact and validated
      image-grounded `DESIGN.md` with exportable token values.
- [x] The selected candidate's token projection is represented in Design IR
      with provenance and can compile into `DESIGN.md`, `tokens.json`,
      `tokens.css`, `tailwind.css`, and `theme.ts`.
- [x] Explicit and Agent-recommended candidate counts are validated against
      runtime policy, previewed, approved when required, and persisted with
      their rationale and bounds.
- [x] Multiple candidates are displayed in a comparison surface and downstream
      generation cannot start until one is explicitly selected.
- [x] Page prompts and visual references use only the selected candidate.
- [x] Changing selection before page generation changes downstream context;
      changing selection after generated pages exist requires an explicit
      regeneration decision rather than silently mixing systems.
- [x] Candidate selection and promotion survive save/reload and reject stale
      run/revision bindings.
- [x] Existing single-system workspaces migrate without losing their image,
      `DESIGN.md`, pages, or current downstream behavior.
- [x] Focused unit and rendered workflow tests cover generation, comparison,
      selection, migration, persistence, cancellation, stale selection, and
      selected-only downstream consumption.
- [x] `pnpm agent:validate` passes, together with relevant lint, type-check, and
      test suites.

## Scope Decision

- This release executes alternatives only at the Design System stage. The
  generic candidate contract supports later prototype-plan/prototype-suite
  alternatives without claiming those execution paths today.

## Constraints

- Work is isolated on branch `feat/design-system-variants` in
  `/tmp/cutout-design-system-variants`; unrelated changes in the original
  workspace must not be modified.
- Candidate artifacts are immutable inputs. Selection promotes authority; it
  does not mutate candidate bytes or fabricate approval.
- The implementation must preserve current provider, budget, approval,
  cancellation, recovery, and asset-production boundaries.
- Subscription tiers, monetization, quota packaging, upgrade UX, and commercial
  entitlement enforcement are explicitly out of scope for this milestone.
