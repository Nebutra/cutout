# Design Profile Platform - technical design

## Boundaries

Add `src/design-profile-platform/` around the existing Kernel registry and graph
composition APIs. The Platform owns Profile packaging, closure resolution, brief
proposal/composition, registered binding lookup, lifecycle and conformance. It
does not own domain schemas, Provider execution, Project mutation or rendering
implementations.

Domain packages such as `src/commerce-profile/` and
`src/game-asset-profile/` export manifests and trusted registration functions.
The Workbench and Hosts install their trusted binding catalogs separately.

## Manifest And Closure

`design-profile.manifest.v1` contains serializable references only:

```text
identity + compatibility + dependencies
schemas + compilers + recipes + policies + evaluators
presentation renderers/inspectors + semantic actions
capability requirements + delivery descriptions
required-role and identity-lock descriptions
migrations + fixtures + evidence/Outcome-score adapters
```

Closure resolution canonicalizes dependencies by id/version/hash, verifies every
required registration and detects cycles/conflicts before Project mutation. A
frozen closure hash participates in Contract/Plan and Project Bundle authority.

## Registration Model

Use small typed catalogs rather than one universal callback bag:

- Kernel `SchemaRegistry` remains schema/migration authority.
- `ProfileCompilerRegistry` maps a trusted compiler id to a pure brief/evidence
  fragment compiler.
- `EvaluatorRegistry` maps typed artifact/outcome schemas to pure evaluators.
- `PresentationRegistry` maps schemas to renderer/inspector descriptors and safe
  fallback priority.
- `SemanticActionRegistry` maps action ids to command compilers, never direct
  mutations.
- `DeliveryRegistry` describes neutral format and required target adapter ids.
- `EvidenceBenchmarkAdapterRegistry` projects only a strict decoded maturity
  report into the Profile-neutral Design OS evidence benchmark.
- `OutcomeScorecardAdapterRegistry` projects only a strict decoded domain quality
  report under an exact Profile-owned ruler.

Registrations declare canonical owner and implementation digest. Duplicate ids or
owner/hash drift fail closed. Manifests cannot register implementations.

## Brief Proposal

The universal brief remains user-facing and domain-neutral. Each active Profile
compiler receives the same frozen brief/evidence closure and may return zero or
more proposals containing score explanations, required unknowns, graph fragments,
capability needs and expected deliverables. The Platform merges compatible
proposals; the user approves the proposed Outcome closure before a Contract/Plan
is authorized.

Ranking is advisory and reproducible for deterministic compilers. Model-assisted
interpretation is stored as evidence with route/receipt, not allowed to mutate the
closure directly.

## Outcome Closure And Identity

Profile compilers emit typed required-role closures with stable role ids,
cardinality and constraints. The Platform validates structural completeness and
passes domain payloads to the owning evaluator; it does not know that one closure
means Commerce images or another means sprite actions. Candidate and accepted
artifacts remain distinct, so local repair can replace a failed role without
rewriting valid siblings.

Identity/continuity binding descriptors resolve to exact Project evidence,
artifact or Library revisions. They are graph inputs, not ambient prompt text.
Profile evaluators own the fidelity rubric while the Platform enforces that every
required derivative declares and evaluates its consumed lock.

## Workbench Binding

Presentation registrations return descriptors consumed by the general Workbench.
They do not import stores or domain services. Renderers receive parsed typed
projections plus shared callbacks that compile semantic actions. Unknown schemas
use a generic metadata/artifact fallback; required unavailable renderer state is
visible but cannot damage authoritative content.

## Conformance

The admission harness combines structural and behavioral checks:

- protected import/dependency checks for Kernel and global shell;
- manifest/registration/schema exactness;
- compile/evaluate/disable/remove fixture behavior;
- shared authority, retry, impact and Project Bundle round-trip;
- comparison of protected Kernel and navigation catalog closures before/after
  Profile installation.

Source-path checks are guardrails, not the only proof. Behavioral fixtures verify
that equivalent graph/commands produce equivalent lifecycle results.

Evidence benchmark and Outcome-score adapters are deliberately separate. The
first can advance only from ordered Host/rehearsal evidence; the second can change
only from Profile-owned artifact evaluation under a frozen ruler. The Platform
rejects caller-authored totals and never converts one report into the other's
authority.

Promotion records are content-addressed fixtures with before/after evidence,
proposed ownership and regression closure. Protected-surface changes require two
distinct Profile proofs or one Profile plus the held-out synthetic fixture.

## Compatibility And Rollback

First wrap Commerce's current registrations and compare canonical graph/evaluation
outputs. Add Platform storage alongside existing Project records. No existing
Profile or prototype state is migrated until round-trip evidence passes.

The Platform can be disabled while existing Commerce/prototype paths remain. A
failed Profile upgrade retains the previous exact closure; CAS objects are not
deleted by lifecycle rollback.
