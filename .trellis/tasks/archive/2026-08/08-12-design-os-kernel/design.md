# Design OS kernel and conformance - technical design

## Boundaries

Create a Node-compatible canonical contracts package and pure reducers/compiler
around the seven records and `OutcomeGraph`. The Kernel consumes domain schema,
recipe, evaluator and presentation metadata through registries, but never imports
commerce, prototype UI or a concrete Provider. Hosts implement authorization,
capability execution, object storage and target projection ports.

The graph compiler resolves the universal brief and evidence into proposed
Outcome nodes, composes declarative fragments with source precedence, validates
the dependency graph and freezes a content-addressed Contract and Plan. The
scheduler emits append-only Run events; successful Host receipts become typed
result commands rather than direct state writes. Evaluation is a pure reduction
over exact artifact/evidence revisions.

All documents use strict protocol envelopes and registry-selected migrations.
Migration output includes predecessor and migration hashes; original CAS bytes
remain immutable. The runner emits one ReproductionEnvelope and structured
reason-path events, while indexes over ids and typed relations keep impact,
replay and scheduling incremental.

## Compatibility

Keep current persisted `asset-production.v1` and prototype projections behind
an adapter until an explicit migration exists. The adapter must preserve current
ids, hashes and terminal states. New generic records may be stored alongside the
old projection, but old projects must remain loadable by the current path during
rollout.

Cross-host conformance canonicalizes away only declared Host data. Any semantic
difference in graph scope, dependency, repair boundary or evaluation is a test
failure. Benchmark promotion records prevent package-specific filenames,
pre-authorization or scoring heuristics from entering the Kernel.

Host limits form an input to plan validation rather than ambient configuration.
Scale tests use generated graph/relation/artifact closures and compare checked
reference baselines so algorithmic or memory regressions are visible without
pretending one CI timing is a universal product SLA.

## Rollback

The generic runtime remains behind the prototype compatibility adapter. It can
be disabled without migrating existing projects or removing the competition
fixtures. No public capability declaration changes in this task.
