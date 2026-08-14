# Design OS project change management

## Goal

Give designers, Builders, humans and Agents one auditable way to propose,
compare, authorize, merge, review and restore changes over immutable Design OS
Project revisions without introducing a second source of truth.

## Requirements

- Use one versioned semantic-command dispatcher for UI and Agent edits. Commands
  bind exact target/base revisions, actor/proposal identity, typed payload,
  authorization, impact, provenance and inverse or compensating behavior.
- Make `ChangeSet` the collaboration unit: exact base, commands, candidates,
  semantic/visual/target diff, ImpactSet, evaluation, comments, approvals and
  merge/close state. Designer and Builder Lens are projections only.
- Rebase concurrent disjoint semantic/dependency write sets through a visible
  successor proposal with fresh evaluation and authorization. Overlapping nodes,
  shared locks, Library versions, Contracts or Delivery Manifests create typed
  conflicts; never resolve by arrival order.
- Bind Artifact acceptance, Outcome approval and Delivery approval to exact
  revision closures. Batch approval is atomic; successor or stale state inherits
  no authority.
- Resolve authority from Project-scoped capability grants. Role names are UI and
  policy presets; Agents cannot mint grants or satisfy human-only gates. Support
  personal Owner policy and optional maker-checker separation without claiming
  cloud collaboration.
- Keep comments as revision-bound `ReviewThread` evidence. Only an explicit typed
  `ChangeRequest` enters a ChangeSet; thread resolution needs disposition and
  linked result evidence.
- Bind mutation-bearing Agent Runs to one ChangeSet and Outcome/node scope.
  Project `ActionQueue` is derived from unresolved sources; Run/task completion
  never implies acceptance or approval.
- Keep history append-only. Milestones reference exact revisions and restore
  creates a previewed dependency-scoped RestoreChangeSet. External effects use
  compensating commands rather than receipt deletion.
- Evolve existing Global Library items, project references and CAS into exact,
  composable release closures with explicit precedence, update ChangeSets and
  lineage-preserving detach/fork. No parallel catalog or silent update path.
- Keep repositories as versioned evidence sources and reviewed code delivery
  targets; do not claim live or lossless bidirectional sync.
- Export/import a portable Project Bundle whose manifest binds exact Project and
  schema revisions, CAS objects, locked Library/Profile closure and receipts.
  Import is previewed, hash-verified and migrated before apply; partial or
  unsupported closure cannot become authoritative.
- Carry evidence license/usage, sensitivity, Provider-transmission and retention
  policy through commands, ChangeSets, delivery and Library publication.
  Deletion/redaction records an auditable tombstone and collects only
  unreferenced bytes; it cannot rewrite existing provenance silently.

## Acceptance Criteria

- [ ] C1: Equivalent UI and Agent commands at the same base produce identical
      revisions, ImpactSet, provenance, authorization and undo outcome.
- [ ] C2: Designer and Builder projections of a ChangeSet have identical source
      commands, gates, approvals, conflicts and merge result.
- [ ] C3: Concurrent disjoint changes yield a reviewable successor rebase; every
      defined overlap yields a deterministic typed conflict independent of order.
- [ ] C4: Approval levels cannot substitute or inherit, batch failure is atomic,
      and current revision closure is checked immediately before delivery.
- [ ] C5: Lens names and role presets grant nothing; self-grant, expired/stale
      grant and Agent-as-human attempts fail while valid personal and
      maker-checker policies behave as configured.
- [ ] C6: Comments cannot mutate, approve or spend; ChangeRequest implementation
      and thread closure point to exact ChangeSet and result revisions.
- [ ] C7: Parallel Runs remain scope-isolated and exactly-once; ActionQueue and
      both lenses trace to the same source dispositions without implicit approval.
- [ ] C8: Milestone restore preserves immutable history, unaffected hashes and
      old receipts while creating a normally reviewed successor revision.
- [ ] C9: Multiple Library releases restore offline from exact CAS closure;
      conflicts identify sources, and compatible updates remain no-ops before an
      approved ChangeSet.
- [ ] C10: Code delivery receipts bind accepted design revision to exact bytes
      and target revision; out-of-band changes require explicit ingestion.
- [ ] C11: Project Bundle round-trip verifies exact schemas, Project revision,
      CAS and dependency closure before apply and rejects missing/tampered bytes
      or unsupported migrations without partial authority.
- [ ] C12: Evidence rights and retention fixtures block ineligible Provider,
      delivery and Library actions; redaction/deletion preserves tombstone and
      provenance integrity while collecting only unreachable bytes.

## Out Of Scope

- Remote identity, realtime presence, cloud synchronization or hosted projects.
- A new Global Library protocol, mutable library heads or ambient auto-update.
- Full Git semantics for Design IR or automatic code/design round trips.
