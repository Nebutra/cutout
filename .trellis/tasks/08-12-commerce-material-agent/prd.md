# Build portable commerce material agent

## Goal

Evolve Cutout from a prototype-shaped asset Agent into a general **Design OS**:
one evidence-backed production system for UI/UX, brand, marketing, commerce,
packaging and temporal outcomes. Prove the architecture with a portable Qianwen
cross-border material Agent, then expose the same Kernel through a general
Desktop workbench without creating a benchmark-only product fork.

## User Value

- Designers work in briefs, references, Boards, Timelines, visual comparisons,
  review annotations, identity locks and deliverables.
- Builders work in exact revisions, semantic diffs, plans, checks, ChangeSets,
  capability grants and target receipts.
- These are two presentation lenses over the same Project, OutcomeGraph,
  commands, approvals and history, so users can move between visual authorship
  and implementation rigor without translation drift.
- One Project can produce several related Outcomes, such as a UI prototype,
  launch sequence, commerce campaign and channel package, while sharing evidence
  and brand rules and retaining independent revision, review and delivery state.

## Confirmed Evidence

- The competition requires one unattended run to produce three localized
  descriptions (English, Korean and Portuguese), one main image, five detail
  images, one playable product video and one strategy document.
- Its machine evaluation weights compliance 25%, physical/output completeness
  20%, category/attribute accuracy 18%, localization 15%, fact consistency 10%,
  image usability 7% and video usability 5%. Expert review then weighs strategy
  35%, image quality 30%, video quality 20% and experience 15%.
- The package runs on Debian 12 x86_64 within 30 minutes and 4 GB, is at most
  100 MB, contains root `agent.js` and `agent.json`, uses only supplied input,
  output and DashScope environment bindings, and has no web search, MCP, memory,
  retrieval, local-file model upload or Responses API during evaluation.
- Public input is a nested source-product response plus independent AliExpress
  clothing category/attribute catalogs, not a normalized Product record.
- Cutout already has durable Run events, exact Provider/model route assessment,
  DashScope image transport, candidate selection, CAS, provenance, image QA,
  production state and managed export. Current production contracts remain
  image/prototype-shaped; public headless has no Provider executor and the
  manifest truthfully says there is no video-processing pipeline.
- Existing Global Library contracts already support approved content-addressed
  versions, dependencies, compatibility, quality, lineage, project locks,
  update notification and CAS (`src/global-library/contracts.ts:76`,
  `src/global-library/contracts.ts:130`, `src/global-library/store.ts:15`,
  `src/global-library/store.test.ts:13`, `src/global-library/blob-store.ts:10`).
  This program evolves that system rather than replacing it.
- `motion-ir.v1` covers UI/vector interaction motion. Cutout does not yet have
  an authoritative audiovisual Timeline, edit ranges, continuity/audio locks,
  shot versions or final assembly contract.
- Official Figma, Builder.io, Canva, Lovable, v0 and Replit material supports a
  common management model: durable Project authority, isolated visual/code
  proposals, review/diff, versioned reusable libraries and several conversations
  contributing to one Project. None supplies the complete cross-domain model.
- MiniMax H3 and Seedance 2.5 advertise valuable multimodal reference/edit
  behavior, but marketing or aggregator metadata does not grant executable
  capability. Exact wire contracts and live probes remain required.

## Product Invariants

### Design OS Boundary

- Cutout is a Design OS, not a general-purpose coding, office, web/computer
  automation or business-process Agent. A domain belongs when its primary
  outcome is a designed artifact/system that can be reviewed and delivered.
- The stable Agent loop is:
  `understand -> contract -> plan -> authorize -> execute -> evaluate -> repair/deliver`.
  Models interpret evidence, propose and review; deterministic code owns schema,
  policy, budget, authority, state transitions, identity and readiness.
- The runtime is closed-world per Run and open-world through reviewed versioned
  extensions. No prompt or Profile can invent tools, origins, paths or approval.
- Generality must be proven by UI prototype and commerce Profiles sharing the
  same runtime. A generic abstraction without both regression and new-domain
  evidence is not accepted.

### Canonical Records And Outcome Composition

- Kernel authority is expressed through `EvidenceGraph`, `OutcomeContract`,
  `CapabilityCatalog`, `ExecutionPlan`, `RunLedger`, `ArtifactGraph`,
  `EvaluationReport` and typed `OutcomeGraph` records.
- OutcomeGraph, not Workflow Profile, defines what the user is making. Profiles
  are composable, versioned recipe/schema/policy/evaluator/presentation bundles
  that contribute graph fragments and defaults; they are not product modes.
- A universal brief records goals, audience, evidence, unknowns, invariants,
  desired deliverables and constraints. The system proposes observable Outcomes
  and compatible recipes rather than asking users to choose internal taxonomy.
- Shared evidence, identity-lock and policy changes propagate through explicit
  dependencies. Only affected nodes become stale; ImpactSet and repair effects
  are previewed, and valid siblings never regenerate silently.
- Approved Contract and Plan revisions are immutable execution boundaries.
  Scope, constraint, budget, delivery or accepted-artifact changes create a
  successor proposal and require fresh authorization. Bounded in-contract repair
  may retain and reuse valid siblings.
- Every persisted contract uses a versioned envelope and explicit migration
  registry. Migrations are pure, idempotent and evidence-preserving; unknown
  newer required schemas fail into a non-mutating diagnostic/read-only path
  rather than being coerced or weakened for compatibility.
- Reproducibility means the exact inputs, schemas, locked dependencies, Plan,
  Provider/model route, supported parameters/seeds, receipts and output hashes
  can be audited and replayed. Probabilistic replay is not claimed to reproduce
  identical pixels unless the route explicitly guarantees it.
- RunLedger events expose stable reason codes, dependency paths, budget/spend,
  route decisions, retries, degradations and terminal blockers. Observability is
  structured evidence for users and evaluators, not hidden debug prose.

### Commands, ChangeSets And Collaboration

- UI and Agent mutations use one versioned semantic-command dispatcher with
  exact base/target revisions, validation, authorization, impact, provenance and
  inverse or compensating behavior. Executors emit typed result commands and
  never edit authoritative state directly.
- A ChangeSet is the common proposal/review unit: exact base, commands,
  candidates, semantic/visual/target diff, ImpactSet, evaluation, comments,
  approvals and merge/close state. Designer and Builder views cannot own private
  histories or merge semantics.
- Concurrent disjoint changes may create a visible successor rebase proposal
  with recomputed impact, checks and authorization. Same-node, shared-lock,
  Library-version, Contract or Delivery-Manifest overlap creates one typed
  conflict and explicit resolution. Arrival order never decides authority.
- ReviewThread comments bind exact spatial, structural, temporal or target
  revisions and are evidence only. An explicit typed ChangeRequest enters a
  ChangeSet. Thread closure requires disposition plus linked result revisions.
- Agent Runs, conversations and tasks are activity records. Mutation-bearing
  Runs bind one ChangeSet and Outcome/node scope; ActionQueue is a projection of
  unresolved requests, blockers, approvals, conflicts and deliveries. Completing
  a Run/task does not accept or approve its output.

### Authority, Approval And History

- Artifact acceptance, Outcome approval and Delivery approval bind distinct
  exact revision closures. Batch approval is atomic and no newer/stale state
  inherits authority.
- Authority is Project-scoped capability grants over a principal, semantic
  capability, object/revision scope, policy and expiry. Owner, Contributor,
  Reviewer and Delivery Manager are configurable presets, not protocol authority;
  Designer/Builder lenses never affect permission.
- Agents cannot mint grants or satisfy human-only gates. Personal Projects may
  let one Owner author and approve; stricter policies may require maker-checker.
  Competition authority is issued by the Host for one exact Contract, Plan,
  capability/budget closure and target, never by the Agent itself.
- Project history is append-only semantic revisions with verified snapshots as
  load accelerators. Milestones are exact revision labels. Restore previews
  semantic/visual/dependency/delivery impact and creates a new RestoreChangeSet;
  it cannot rewrite history or revive old approvals.
- Provider spend, authorization and delivery receipts remain immutable.
  Reversal uses compensating commands or replacement delivery.
- Multi-principal records are collaboration-ready data, not a claim of cloud
  synchronization, remote identity, presence or realtime co-editing.
- A portable Project Bundle carries a manifest of exact schema versions,
  Project revision, CAS objects, locked Library/Profile closure and receipts.
  Import verifies every hash and migration before apply; preview precedes any
  Project mutation. Missing bytes or unsupported schemas never yield a partial
  authoritative Project.

### Libraries, Extensions And External Authority

- `LibraryRelease` is product language for an approved immutable
  `GlobalLibraryItem` plus exact dependency closure, not a second protocol.
  Projects compose exact version/hash locks whose bytes are verified in CAS.
- Precedence is explicit and source-attributed. Conflicts block affected nodes;
  insertion order cannot decide. Every update, including `auto-compatible`, is
  a no-op until an approved ChangeSet; detach/fork preserves lineage.
- Profiles/recipes are declarative only: schemas, Outcome/policy/evaluator
  fragments, presentation metadata, Library/material dependencies and semantic
  capability ids. They cannot embed arbitrary code, shell, origins or paths.
- Executable capability/Provider/target adapters live only behind Cutout-owned
  or explicitly trusted, signed and reviewed Host boundaries.
- Extension install/update previews source/publisher, version/hash, permissions,
  dependency closure, compatibility, migration and evaluation evidence. Projects
  lock exact bytes and retain the previous CAS closure after failed upgrades.
  Initial distribution is built-in or explicit trusted import, not an open
  executable marketplace.
- `.cutout` Design IR, OutcomeGraph and provenance remain authoritative for
  Cutout design state. Repositories are versioned evidence sources and reviewed
  code-delivery targets with exact byte/branch/commit/PR receipts; later code
  changes require explicit ingestion, not claimed live bidirectional sync.
- Evidence records include source identity, license/usage rights, sensitivity,
  allowed Provider transmission and retention class. Planning excludes evidence
  from routes that cannot satisfy those policies. Redaction or deletion leaves
  an auditable tombstone/reference break and collects only unreferenced bytes;
  it never silently rewrites derived provenance.

### Scale And Responsiveness

- Graph composition, dependency impact, ChangeSet diff and ActionQueue derive
  from indexed revisions and affected closures, not full-project model prompts
  or unconditional regeneration. Large artifacts remain CAS references and are
  decoded/rendered on demand.
- Each Host declares graph, artifact, byte, concurrency and time budgets. The
  Kernel rejects plans beyond them before spend; Desktop virtualizes large
  Boards/Timelines and preserves stable selection/controls while content loads.
- Synthetic scale fixtures and reference-hardware benchmarks establish checked
  baselines for load, command, impact, replay and projection. Regressions require
  explicit review rather than silently expanding latency or memory.

### Temporal And Multimodal Design

- Time is a horizontal Design OS dimension for product demos, launch assets,
  brand/campaign motion, UI walkthroughs, social variants, presentations and
  director-led media, not a short-drama vertical.
- Keep `motion-ir.v1` for deterministic interaction/vector motion and add
  `media-timeline.v1` for sequences, scenes, shots, takes, source/edit ranges,
  tracks, audio/captions, variants, continuity locks, review and delivery.
- Video capability is granular by reference modalities and exact operations,
  including generate, extend, range edit/replace, transfer, sync, native audio,
  multi-shot and control modes. Provider/model names or generic `video-edit`
  cannot grant an operation.
- Temporal edits are non-destructive; replacing one range creates a new take
  while unaffected hashes/lineage remain exact. QA binds duration, decode,
  sync, cuts, continuity, identity, brand/text, safe area, captions, loudness
  and delivery findings to exact timecodes and revisions.
- The product is a semantic Board/Timeline, not a full NLE, DAW or unrestricted
  codec/compositing/plugin host.

### Commerce And Competition Proof

- Normalize bounded untrusted inputs into `product-facts.v1` with typed values,
  JSON-pointer/source lineage and explicit unknowns. HTML and URLs are data, not
  trusted instructions or implicit fetched media.
- Resolve category and attributes only from supplied exact catalog leaf/enums.
  Every localized claim and visual overlay cites fact ids; unsupported material,
  dimensions, certification, composition or performance cannot be invented.
- Versioned offline AliExpress/en-US/ko-KR/pt-BR policy packs compile language,
  units/sizes, prohibited claims, sensitive visuals and channel constraints into
  both generation instructions and executable validators.
- One shared creative direction and product identity locks govern localized
  copy, main/detail images and video. Deterministic and model review block invalid
  delivery; repair targets only failed nodes and at least 80% of images must be
  usable.
- Competition and Desktop import the same Kernel/Profile contracts, compilers,
  reducers, evaluators and recipes. Only Host authorization, route availability,
  source/target and packaging bindings differ and are declared as Host data.
- Benchmark findings pass a Promotion Gate:
  `reproducible evidence -> Kernel/Profile/Host ownership -> cross-profile or isolation proof -> promotion`.
  Fixed filenames, sample shapes, scoring heuristics and pre-authorization stay
  in Competition Profile/Host data.
- The competition may ship before Project Change Management and Desktop UI, but
  depends on the canonical Kernel, Commerce Profile and minimum verified
  multimodal Host. Full Media Timeline and H3/Seedance routes cannot block it.

## Program Map

| Child task | Owns | Dependency |
| --- | --- | --- |
| `08-12-design-os-kernel` | Seven records, OutcomeGraph, lifecycle, generic DAG, impact/repair, prototype adapter, cross-host conformance | First foundation |
| `08-12-design-os-project-changes` | Commands, ChangeSets, review, authority, history, Library/repository management | Kernel; not competition-blocking |
| `08-12-commerce-production-profile` | Product facts, catalogs, offline policy, commerce recipes/evaluation | Kernel interfaces |
| `08-12-temporal-multimodal-host` | Gate A verified commerce media Host; Gate B Timeline and broader video/edit routes | Kernel; only Gate A blocks competition |
| `08-12-qianwen-competition-host` | Evaluator, sandbox Host, package, real rehearsal and promotion evidence | Kernel + Commerce + Temporal Gate A |
| `08-12-design-os-desktop-workbench` | Stable IA, heterogeneous Board/Timeline, Designer/Builder projections and Desktop commerce | Kernel + Project Changes; renderer-specific children as needed |

## Cross-Program Acceptance Criteria

- [ ] A1: Prototype and Commerce compile through one Kernel lifecycle/DAG, and
      prototype outputs, approvals, CAS/provenance and restore remain stable.
- [ ] A2: A mixed UI, product-demo and channel-delivery Project shares evidence
      and locks while retaining independent revision, review and delivery state.
- [ ] A3: Equivalent UI/Agent commands and Designer/Builder projections yield
      identical state, impact, conflict, approval, restore and merge semantics.
- [ ] A4: Dependencies invalidate only affected nodes; contract expansion,
      replacement, spend and delivery never occur silently or under stale authority.
- [ ] A5: Declarative Profiles add/remove domains without Kernel/navigation
      branches or executable authority; exact locked packages remain reproducible.
- [ ] A6: Competition/Desktop canonical fixtures have equivalent semantic graph,
      plan, repair and evaluation after declared Host bindings are removed.
- [ ] A7: A fixture and held-out competition run produce exactly three localized
      descriptions, one main image, five detail images, one playable video and
      one evidence-derived strategy document with all fact/catalog/policy gates.
- [ ] A8: The final ZIP passes clean Debian 12/Node 22, no-install, <=100 MB,
      <=4 GB, <=30-minute, path/network/redaction and terminal completeness checks.
- [ ] A9: A real unseen-data rehearsal produces sanitized hash-verified evidence,
      and benchmark promotion checks prevent sample/Host logic entering Kernel.
- [ ] A10: Timeline fixtures across UI/product, brand/campaign and directed media
      prove granular route truth, non-destructive range edits and timecode QA.
- [ ] A11: `pnpm agent:validate`, affected lint/type/test/build/package checks and
      `git diff --check` pass without advertising unimplemented Figma, web,
      video, cloud collaboration or headless Provider capabilities.
- [ ] A12: Version migrations, Project Bundle import and probabilistic replay
      preserve exact source/plan/route/receipt/hash evidence, fail closed on
      unsupported or missing closure, and never claim identical generated bytes
      without a Provider guarantee.
- [ ] A13: License/sensitivity/transmission/retention policy blocks ineligible
      routes and unsafe delivery, while structured Run evidence and scale
      baselines keep decisions explainable and incremental under declared budgets.

## Out Of Scope

- General-purpose coding/office/business automation, arbitrary web/computer use,
  shell execution, external search or unbounded paths/network.
- Live Figma sync, workspace-wide Notion sync, remote Project service, cloud
  collaboration or lossless bidirectional code/design synchronization.
- Seller-account/listing publication, full NLE/DAW, unrestricted compositing,
  grading, mixing, plugin hosting or arbitrary codec conversion.
- An open executable plugin marketplace or sample-specific benchmark answers.
