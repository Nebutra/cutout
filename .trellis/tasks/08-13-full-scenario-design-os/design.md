# Full-scenario Design OS - technical design

## System Shape

Use a layered architecture whose dependency direction always points inward:

```text
Experience:  Brief | Sources | Board | Timeline | Review | Deliver
                  presentation and semantic-action registries
Profiles:    UI | Commerce | Brand | Game Asset | Temporal | future domains
                  typed IR, recipes, policies, evaluators, delivery descriptions
Platform:    Profile closure | universal brief compiler | admission/conformance
Kernel:      graphs | frozen plan | runtime | impact | authority | replay
Project:     Design IR | revisions | ChangeSets | Library locks | CAS | receipts
Hosts:       providers | deterministic processors | connectors | target adapters
```

The Kernel does not import a Profile. A Profile references Kernel protocols and
registered platform extension points. The Workbench consumes projections from
the Platform/Project, not domain services directly. Hosts can narrow declared
capability but never broaden a Profile's authority.

## Universal Project Model

The durable Project is a composition of exact revisions:

- `UniversalBrief`: goal, audience, evidence, unknowns, constraints, rights,
  desired experiences/deliverables, budgets and risk posture;
- `EvidenceGraph`: normalized facts and sources with rights/transmission policy;
- `OutcomeGraph`: typed desired results and cross-domain dependencies;
- `ArtifactGraph`: candidate, accepted, derived and delivery artifacts;
- `ChangeSetGraph`: proposed semantic mutations, impact, review and disposition;
- `DeliveryGraph`: immutable manifests, targets, approval closure and receipts;
- `ProfileClosure`: exact Profile manifests, schemas, policies and registered
  implementation bindings required to interpret the Project.

"Scene" is not stored in the Kernel. Profiles compile the brief into typed
Outcomes. A mixed Project is therefore ordinary graph composition rather than a
special multi-mode workspace.

## Profile Platform

Each `design-profile.manifest.v1` is declarative and content-addressed. It names:

- Profile identity/version, compatible Kernel range and dependency closure;
- contributed schema references and graph-fragment compilers;
- recipe, policy and evaluator identifiers;
- semantic capability requirements and supported degradations;
- presentation renderer/inspector identifiers and semantic action identifiers;
- delivery formats and target-adapter identifiers;
- Library dependencies, migration identifiers and benchmark fixtures.

The manifest cannot contain executable code, origins, commands, secrets or paths.
Executable implementations are Cutout-owned or explicitly trusted registrations
whose ids and hashes are resolved by the Host/app. Unresolved required bindings
make the Profile diagnostic/read-only or blocked; they never fall through to an
ambient tool.

Profile compilation is deterministic for a fixed brief/evidence/Profile closure:

```text
UniversalBrief + EvidenceGraph + locked ProfileClosure
  -> proposed graph fragments
  -> explicit precedence/conflict resolution
  -> typed OutcomeGraph
  -> compatible recipes/capabilities/targets
  -> frozen Contract and ExecutionPlan proposal
```

Automatic Profile recognition may rank proposals, but it cannot install a
Profile, authorize spend or silently alter the requested Outcome closure.

## Outcome Closure And Observed Truth

Each typed Outcome Contract contributes a `RequiredRoleClosure`: stable semantic
role ids, cardinality, required/optional state, constraints and dependency ids.
The Kernel treats these as opaque typed obligations and derives completeness from
accepted artifacts plus blocking evaluations. Profiles own role vocabulary such
as Commerce detail images, UI routes or Game Asset actions and maps.

Execution requests retain intended parameters. Settled receipts bind the exact
Host route and effective parameters to retained CAS bytes. Artifact inspection
records decoded media type, dimensions, duration and other measurable properties.
Evaluation and delivery consume observed properties; they never copy requested
values into evidence. A successful Run with an incomplete role closure remains
not ready.

Identity and continuity locks are revisioned graph inputs. Every derivative
declares the exact lock/source revision consumed, and Profile evaluators return a
typed fidelity finding in the shared EvaluationReport envelope. Byte validity,
semantic identity and policy are separate hard gates. A repair command targets
the failed node and its affected closure, retaining accepted unrelated siblings.

## Scene Extension Law Enforcement

The conformance harness validates a new Profile against an allowlisted extension
surface. Admission fails when a Profile requires:

- Kernel source imports from the domain;
- new domain discriminants in Kernel lifecycle records;
- a global route or navigation mode;
- a new approval, history or authority meaning;
- direct store mutation outside semantic commands;
- executable logic embedded in a manifest;
- unregistered Host tools, origins, paths or target effects.

A synthetic held-out Profile proves the mechanism independently of product
domains. Commerce and Game Asset then prove real structured/multimodal and
spatiotemporal workloads. Findings may move into the Kernel only through the
existing cross-profile Promotion Gate.

A promotion packet contains the reproducing fixture or run, before/after evidence
delta, proposed owner (`Kernel`, `Platform`, `Profile` or `Host`) and regression
closure. Kernel ownership requires evidence from two distinct real Profiles or
one real Profile plus the held-out synthetic Profile. Competition score changes
without a portable failure invariant cannot cross the Host/Profile boundary.

## Workbench Projection

Replace closed material-kind unions with schema-driven projections:

- a generic artifact tile owns identity, state, provenance, evaluation and
  ChangeSet affordances;
- registered renderers own only media/domain visualization;
- registered inspectors expose typed semantic properties;
- registered actions compile to the shared semantic dispatcher;
- fallbacks render text/structured metadata, thumbnails or an unsupported-schema
  diagnostic without mutating content.

Profiles can add contextual Board sections, Timeline tracks, Review evidence and
Delivery descriptions through registration metadata, but cannot add top-level
application modes. The same selected artifact/revision feeds Designer and Builder
lenses.

## Native Editing Boundary

Native Cutout editing is selected by leverage, not by media completeness:

1. operations shared by several Profiles, such as compare, crop/reframe, arrange,
   retime, variant, replace, lock, annotate and approve;
2. semantic operations needed to preserve dependency impact and provenance;
3. lightweight corrections whose round trip through another tool would destroy
   authority or cost more than the edit.

Deep path editing, 3D modeling, frame compositing, audio mixing, CAD and engine
scene authoring remain specialist capabilities/targets until a concrete Profile
shows that a bounded native operation is cross-scenario and evidence-backed.

## Host And Delivery Boundary

Profiles request semantic capabilities; Hosts resolve verified Provider,
processor, connector and target adapters. Resolution binds exact schemas,
parameters, limits, origins, secrets policy and receipts. Profile code cannot
select a Provider by name heuristic or invoke an arbitrary process.

Accepted neutral domain artifacts are authoritative. Delivery adapters compile
them into target-specific packages below managed roots after preview and exact
approval. Repository/engine/application destinations remain external authorities;
their returned revision/commit/receipt becomes Project evidence.

Cross-Host parity is semantic rather than byte-identical. Desktop and benchmark
fixtures may bind different authorization, route, budget and target records. A
canonicalizer erases only those declared Host bindings and then compares Outcome
roles, dependencies, locks, lifecycle, evaluator gates and repair boundaries. A
Host that lacks a capability emits an unsupported/blocked diagnostic and cannot
delete, replace or weaken the owning Outcome.

## Cross-Profile Identity And Impact

Identity, creative direction, token/library, evidence and policy locks are normal
graph dependencies that can span Profiles. Each dependent Outcome declares the
exact revision it consumes. A successor lock revision derives one indexed
ImpactSet; no Profile performs an independent global scan or regenerates work.

Profile-specific evaluators return a common EvaluationReport envelope while
retaining typed findings. Cross-Profile delivery readiness composes reports and
approval closures; it does not average away a hard failure in one Profile.

## Dual Evidence And Quality Reports

The Profile-neutral evidence benchmark derives trustworthy maturity through the
ordered `contract`, `conformance`, `real-host` and `production-rehearsal` stages.
A separate Profile-owned Outcome scorecard measures domain result quality under a
frozen ruler and exact fixture closure. Both consume decoded retained evidence;
callers cannot supply totals, maturity or readiness.

The two reports can be displayed together but are never averaged into authority.
Evidence maturity gates support claims and release eligibility. Outcome scores
guide candidate comparison and domain optimization. Cross-Profile aggregation
shows a matrix of stage and blocker states rather than pretending unlike quality
rubrics share one scalar.

## Rollout And Compatibility

1. Freeze current Kernel and prototype compatibility evidence.
2. Add the Profile Platform around existing Commerce registrations.
3. Introduce schema-driven Workbench registries behind current adapters.
4. Admit Game Asset as the first new Profile through the extension harness.
5. Move Temporal presentation through the same registry when its IR is stable.
6. Retire closed material unions and monolithic workspace branches only after
   parity and mixed-Project journeys pass.

Existing persisted records are not widened in place. Adapters project them into
generic records until explicit, pure, evidence-preserving migrations exist.
Disabling the Platform returns Profile content to safe inspection and leaves
existing prototype behavior selectable.

## Trade-offs

- A control-plane product gives up the fiction of native mastery over every
  medium, but reaches more domains with stronger consistency and safer delivery.
- Typed plural IRs require more adapters than a JSON-anything canvas, but preserve
  domain meaning and make evaluation/repair trustworthy.
- Declarative Profiles restrict third-party freedom, but keep authority and Host
  security reviewable. Trusted executable extension can be added later without
  weakening the manifest boundary.
- Registry-driven UI requires migration work before visible feature velocity
  improves; it is still necessary because adding more branches to the current
  10,000-line workspace would make "full-scenario" structurally false.
