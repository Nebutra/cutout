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
migrations + evidence references + evidence/Outcome-score adapters
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
- `EvidenceBenchmarkAdapterRegistry` asynchronously re-verifies a strict
  Profile-owned retained-evidence bundle before projecting it into the
  Profile-neutral Design OS evidence benchmark.
- `OutcomeScorecardAdapterRegistry` projects only a strict decoded domain quality
  report under an exact Profile-owned ruler.

Registrations declare canonical owner and an implementation digest over actual
function source, runtime schemas and behavior-defining constants. Version-label
hashes, empty compilers and self-declared digests are not trusted implementations.
Duplicate ids or owner/hash drift fail closed. Manifests cannot register
implementations.

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
- compile/evaluate/disable/remove deterministic contract-test behavior;
- shared authority, retry, impact and Project Bundle round-trip;
- comparison of protected Kernel and navigation catalog closures before/after
  Profile installation.

Source-path checks are guardrails, not the only proof. Deterministic contract
tests verify that equivalent graph/commands produce equivalent lifecycle results;
they do not prove Host capability, production maturity or acceptance.

Evidence benchmark and Outcome-score adapters are deliberately separate. The
first can advance only by re-verifying ordered Host receipts, retained bytes and
rehearsal closure through `verifyAndProject`; a synchronous decoder of a stored
report cannot register. Commerce binds its full rehearsal and native receipt/byte
verifiers into the trusted implementation digest and accepts no baseline report
from the caller. The current ruler's deterministic Contract and mocked-Host
Conformance sources remain blocked even after a real rehearsal verifies; changing
those source semantics requires a new reviewed ruler version. The bundle does not
prove unseen-input selection or independent acceptance, so Production Rehearsal
also remains blocked. Profiles without an equivalent verifier omit the adapter. The second
can change only by recomputing Profile-owned artifact evaluation under a frozen
ruler. The Platform rejects caller-authored totals and never converts one report
into the other's authority.

Promotion records are content-addressed packets with before/after evidence
references and proposed ownership. References remain explicitly unverified until
an owning verifier replays retained evidence and regression closure; packet
creation or decoding cannot authorize promotion. Protected-surface changes require
two distinct verified Profile proofs. A held-out contract Profile may prove
extension conformance but cannot substitute for retained production evidence.
Trusted native-async promotion verifiers emit strict proof records bound to the
packet, target hashes, retained evidence, passed regression closure and an
independent acceptance receipt. Their canonical envelope remains evidence-only
and must pass a stale-hash ChangeSet handoff; it never applies or approves the
protected-surface change. Until two real Profile bundles exist, shared-surface
tests exercise rejection only, while positive fixture round-trips stay confined
to Profile-owned contract conformance.

## Compatibility And Rollback

First wrap Commerce's current registrations and compare canonical graph/evaluation
outputs. Add Platform storage alongside existing Project records. No existing
Profile or prototype state is migrated until round-trip evidence passes.

The Platform can be disabled while existing Commerce/prototype paths remain. A
failed Profile upgrade retains the previous exact closure; CAS objects are not
deleted by lifecycle rollback.
