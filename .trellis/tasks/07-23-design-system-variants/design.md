# Design: candidate exploration and Design System promotion

## First-Principles Model

Candidate count is a creative and operational decision. Commercial packaging is
deliberately deferred. The system needs three separate concepts:

1. **Exploration request**: the user may choose `auto`, request one direction,
   or request an explicit positive count.
2. **Execution proposal**: the Agent resolves an executable count and authors
   that many meaningfully different directions, with rationale, cost, latency,
   and concurrency estimates.
3. **Candidate set and promotion**: generation produces immutable candidates;
   an explicit, revision-bound selection promotes exactly one candidate into
   downstream authority.

The precedence rule is:

```text
provider/runtime policy
  -> explicit user count, when within bounds
  -> Agent recommendation for auto mode
  -> conservative single-direction fallback
```

Runtime bounds are ceilings, not creative recommendations. The runtime may
allow eight candidates while the Agent recommends two because only two
meaningfully distinct directions exist. A requested count above the supported
bound is rejected with a corrective choice; it is never silently clamped.

Subscription tiers, quotas, packaging, and upgrade UX are outside this
milestone. A later commercialization layer may narrow the same runtime bounds
without changing the candidate or selection contracts.

## Current Consumption Map

```text
prototype brief / imported DESIGN.md
  -> PrototypePlan.designSystem
  -> one generated visual Design System
  -> image-grounded DESIGN.md
  -> workspace.v1 persistence
  -> Design IR materials:
       material:design-system
       material:design-markdown
  -> prototype page prompts consume validated DESIGN.md
  -> prototype image calls consume visual reference bytes
  -> Asset Production binds designSystemArtifactId

prototype DESIGN.md
  -> inspector-only deterministic views:
       CSS Variables
       Tailwind v4 @theme
       W3C-style token JSON
  -X-> Design IR tokens (currently projected as [])
  -X-> automatic Design Kit compilation

explicit Design OS token authoring
  -> Design IR tokens
  -> Design Kit compiler
  -> DESIGN.md, tokens.json, tokens.css, tailwind.css, theme.ts,
     design-system.html, demo.html, manifest.json
```

The two marked edges are the authority gap this task closes.

## Generic Candidate Contract

Add an additive `candidateSets` collection to `design-ir.v1`. This is the
authoritative persisted contract for Design System candidates and later
prototype-plan/prototype-suite candidates.

```ts
type CandidateSetKind =
  | 'design-system'
  | 'prototype-plan'
  | 'prototype-suite'

interface CandidateExplorationDecision {
  mode: 'auto' | 'fixed'
  decidedBy: 'user' | 'agent' | 'fallback'
  count: number
  rationale: string
  directions: readonly {
    id: string
    label: string
    thesis: string
    vary: readonly string[]
    preserve: readonly string[]
  }[]
  bounds: {
    maxCandidates: number
    maxParallelism: number
  }
  estimate?: MoneyEstimate
}

interface CandidateSet {
  id: string
  kind: CandidateSetKind
  baseRevisionId: string
  proposal: CandidateExplorationDecision
  candidates: readonly {
    id: string
    directionId: string
    status: 'planned' | 'generating' | 'ready' | 'failed' | 'cancelled'
    outputs: readonly {
      role: string
      materialId: string
    }[]
    provenanceIds: readonly string[]
    error?: string
  }[]
  selection?: {
    candidateId: string
    selectedAt: string
    actor: { kind: 'human' | 'agent'; id: string }
    baseRevisionId: string
    provenanceId: string
  }
}
```

Validation requires `directions.length === count`, stable unique ids, count
within runtime/provider bounds, output materials to exist, and selection to
reference a ready candidate from the same set and base revision.

Candidate outputs use ordinary Design IR materials and content-addressed
references. The candidate set owns grouping and selection; it does not embed
binary bytes or create a second artifact store.

## Prototype Planning Contract

Extend the prototype execution proposal with a Design System exploration
section. The Agent must resolve `auto` to a concrete count and exact direction
list before generation becomes executable. This execution proposal is not the
user's subscription plan.

Each direction shares the product brief, source references, non-negotiable
constraints, provider policy, and platform contract. Directions vary only the
declared axes, such as visual tone, typography personality, density, shape
language, motion character, illustration treatment, or game-world art
direction.

If a user changes the count after planning, the plan is regenerated or amended
by the Agent so every candidate has a deliberate thesis. The executor must not
fill missing directions by duplicating a prompt or relying on random seeds.

## Generation Boundary

Design System generation becomes a two-phase workflow:

```text
resolve runtime and provider bounds
  -> propose candidate exploration
  -> preview count, directions, estimate, and governing bounds
  -> execute candidate generation with existing paid-tool approvals
  -> synthesize and validate one image-grounded DESIGN.md per candidate
  -> publish immutable ready candidates
  -> pause when more than one candidate is ready
  -> user compares and selects
  -> preview promotion against current Design IR revision
  -> apply selection and token projection
  -> generate one prototype suite from the selected candidate
```

The React call stack does not remain suspended while waiting for selection.
Candidate generation finishes and persists a resumable pending stage. The
selection command starts a new bounded continuation that re-resolves provider
assignments and verifies the candidate set/revision before page generation.

A single-candidate plan may auto-promote that candidate to preserve the current
low-friction path. Multiple ready candidates always require human selection.

Partial generation is retained for review, but comparison requires at least
one ready candidate. Failed siblings remain visible with truthful status and
retry does not overwrite ready candidates.

## Promotion and Token Projection

Selection is an explicit Design IR preview/apply operation:

1. Verify candidate-set id, base revision, ready status, output material ids,
   and content hashes.
2. Resolve and validate the candidate's `DESIGN.md` material.
3. Deterministically project supported token controls into Design IR tokens.
4. Preview added/replaced generated tokens and downstream invalidation.
5. On apply, create a new Design IR revision and provenance record, record the
   selection receipt, and replace only tokens previously owned by the generated
   Design System projection.

Generated token ids use a stable namespace derived from semantic token names,
not candidate ids, so re-selection does not create unbounded token duplication.
Manual Design IR tokens are never deleted or overwritten by name collision;
collisions block promotion and require review.

If prototype pages or production outputs already depend on the selected Design
System, promoting another candidate must produce an explicit invalidation and
regeneration preview. It cannot silently mix old pages with a new token system.

## One DESIGN.md Authority

The selected image-grounded `DESIGN.md` remains the portable textual authority.
The formal Design Kit compiler receives it as a verified source material and
emits that document as the bundle's `DESIGN.md`. `tokens.json`, `tokens.css`,
`tailwind.css`, and `theme.ts` derive from the corresponding promoted Design IR
tokens.

For Design IR documents without a selected Design System document, the compiler
may retain its current deterministic token-table `DESIGN.md` fallback. The
manifest records which path was used and binds the source material/content
hash when present.

This avoids maintaining one model-authored DESIGN.md in the prototype and a
different compiler-authored DESIGN.md in the formal export.

## Workspace Compatibility

`workspace.v1` remains readable. Recovery wraps a historical singular
`prototypeDesignSystem` in a one-candidate set and marks it selected using a
legacy migration receipt. New runtime consumers read the selected candidate
through one selector rather than directly reading the legacy singular field.

New persistence stores candidate metadata in Design IR and candidate bytes in
ordinary content-addressed materials. A temporary workspace projection may be
retained only as a compatibility cache; it must be derived from the selected
candidate and excluded from authority decisions.

## UX

- The exploration surface offers `Auto` and `Fixed` modes. `Fixed`
  uses a numeric stepper bounded by policy; it does not offer hard-coded 3/5
  presets.
- Before execution, show the resolved count, direction names, concise rationale,
  estimated cost, and expected latency/concurrency.
- Ready candidates appear in one horizontally comparable lane with stable image
  dimensions, selection state, generation status, token swatches, and access
  to their full `DESIGN.md`.
- The selected candidate has one clear promotion command. Favorite, reject,
  lock-reference, and more-like-this reuse the existing creative-board
  decisions without substituting for authoritative selection.
- Mobile uses horizontal scrolling/snap and a detail sheet; desktop keeps enough
  adjacent candidates visible for real comparison.
- Page generation progress is unavailable until multiple candidates have a
  valid selection. The UI explains state through controls/status, not feature
  tutorial copy.

## External Agent Surface

This milestone does not add an externally invokable candidate-generation
operation to `cutout.control.v1`, CLI, or MCP. It changes Design IR and the
desktop Agent workflow, so schemas, manifest format declarations, repository
documentation, and capability limitations must remain truthful and synchronized.

The headless host may read candidate sets and export the already-selected
Design Kit, but it must not claim it can invoke image providers or perform the
desktop comparison workflow.

## Failure Matrix

| Condition | Required behavior |
| --- | --- |
| Agent returns zero or mismatched directions | Proposal validation fails before paid work |
| Requested count exceeds runtime/provider bound | Preview reports the supported bound; no calls start |
| User changes fixed count | Replan directions and estimate before execution |
| One candidate fails | Preserve ready siblings and expose targeted retry |
| All candidates fail | Keep prior selected system unchanged and fail visibly |
| Candidate DESIGN.md is invalid | Candidate is not ready; do not promote it |
| Selection references another set/revision | Reject as stale |
| Selection changes after pages exist | Require regeneration/invalidation preview |
| Token collides with manual Design IR token | Block promotion; do not overwrite |
| Run is cancelled | Preserve previously ready immutable candidates; publish no late result |
| Historical singular workspace | Recover as one selected legacy candidate |
| Headless environment lacks provider | Read/export selected state only; report capability-required for generation |

## Rollback

The feature is additive to Design IR. Older readers ignore/default the new
candidate-set collection. Rolling back the desktop comparison UI leaves the
selected candidate represented as ordinary design-system/design-markdown
materials and promoted Design IR tokens, so formal Design Kit export remains
usable. No rollback deletes candidate materials or token provenance.

## Deferred Commercialization

A future subscription layer may provide lower per-run counts, quotas, included
credits, priority concurrency, or access flags. It should adapt the existing
runtime bounds and must not alter candidate identity, selection receipts,
Design IR authority, or downstream consumption semantics.
