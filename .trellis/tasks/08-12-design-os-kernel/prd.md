# Design OS kernel and conformance

## Goal

Build the smallest portable Design OS kernel that transforms trusted evidence
into typed, evaluated design Outcomes through one host-neutral runtime, while
preserving the existing UI prototype workflow byte-for-byte where promised.

## Requirements

- Own the canonical `EvidenceGraph`, `OutcomeContract`, `CapabilityCatalog`,
  `ExecutionPlan`, `RunLedger`, `ArtifactGraph`, `EvaluationReport` and typed
  `OutcomeGraph` envelopes. Domain meaning remains in versioned schemas and
  recipes rather than an expanding core union.
- Add a strict schema/version registry and pure idempotent migration pipeline.
  Unsupported newer required schemas fail without mutation; migrations preserve
  original evidence ids, revisions, provenance and migration receipts.
- Implement one deterministic lifecycle:
  `understand -> contract -> plan -> authorize -> execute -> evaluate -> repair/deliver`.
  Models can propose and review; reducers enforce identity, state, budgets,
  permissions and readiness.
- Compose graph/profile fragments with provenance and explicit precedence.
  Shared evidence, lock and policy changes produce a dependency-derived
  `ImpactSet`; propagation marks only affected nodes stale and performs no work.
- Freeze approved Contract and Plan revisions by content hash. Executors receive
  one bounded node contract and cannot expand scope, weaken constraints, exceed
  budgets, choose arbitrary paths or publish authoritative state directly.
- Generalize the material-production DAG for text, image, video, document and
  structured outputs, with typed dependencies, attempts, receipts, lineage,
  deadlines, cancellation, idempotent transient retry and targeted repair.
- Keep Host ports explicit for authorization, capability execution, CAS and
  targets. Competition and Desktop normalize to identical graph, plan,
  lifecycle and evaluation semantics after declared Host bindings are removed.
- Adapt the current prototype/asset-production path incrementally. Persisted
  `.cutout` Design IR and provenance remain authoritative; no migration may
  silently change existing project, approval, recovery or export behavior.
- Establish a benchmark-promotion gate that classifies each finding as Kernel,
  Profile or Host and requires cross-profile proof before changing the Kernel.
- Produce a `ReproductionEnvelope` for every terminal Run containing exact
  source/dependency/Contract/Plan identities, route and parameter evidence,
  attempts, receipts and output hashes. Do not equate replayable provenance with
  deterministic model bytes.
- Keep Run events structured and explainable through reason codes, dependency
  paths, route decisions, budgets, retries, degradations and blockers. Use
  incremental indexes/reducers and enforce Host-declared graph/artifact/byte/time
  budgets before execution.

## Acceptance Criteria

- [ ] K1: One canonical fixture compiles through Desktop and Competition Hosts
      to equivalent normalized EvidenceGraph, OutcomeGraph, Plan and evaluation
      gates, with only declared authorization/route/target bindings different.
- [ ] K2: Existing prototype golden fixtures retain lifecycle, accepted bytes,
      CAS hashes, provenance, recovery and export results through the adapter.
- [ ] K3: Adding a synthetic non-prototype Outcome schema and recipe requires no
      branch in the kernel reducer, lifecycle or generic DAG scheduler.
- [ ] K4: Shared evidence/lock/policy revisions mark exactly their dependent
      nodes stale; unrelated accepted artifacts and hashes remain unchanged and
      no Provider effect starts during impact propagation.
- [ ] K5: Out-of-contract scope, constraint, capability, budget and target
      changes create a successor proposal and cannot execute under old authority;
      bounded in-contract repair can resume only its failed frontier.
- [ ] K6: Simulated retry, cancellation, timeout, crash/recovery and late-result
      cases settle each logical node once without duplicate spend or stale
      publication.
- [ ] K7: Host-local copies of canonical schemas, recipes, reducers or evaluator
      rules fail conformance checks, and every promoted benchmark change carries
      its ownership classification and evidence.
- [ ] K8: Migration fixtures are idempotent and provenance-preserving; unknown
      newer schemas fail non-mutating, and every terminal Run has a complete
      ReproductionEnvelope without false identical-output claims.
- [ ] K9: Structured reason-path and budget evidence explains every blocked,
      degraded and repaired node; synthetic scale fixtures prove impact and
      replay operate on affected/indexed closures within declared Host budgets.

## Out Of Scope

- ChangeSet collaboration, review threads and user-facing version history.
- Commerce-specific facts/policies, Provider wire adapters and Desktop redesign.
- Advertising arbitrary tools, web access, video or headless execution as
  available before the corresponding Host capability has real proof.
