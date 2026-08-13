# Design Profile Platform

## Goal

Create the constrained extension platform that lets Cutout add new design
scenarios without changing the Design OS Kernel, global workbench information
architecture, authority model or history semantics.

## Requirements

### Profile closure

- Define a strict `design-profile.manifest.v1` with id/version/hash, compatible
  Kernel range, dependencies, schemas, recipes, policies, evaluators,
  presentation/action bindings, capability requirements, delivery descriptions,
  required-role closure descriptions, identity/continuity lock bindings,
  migrations and benchmark/Outcome-score fixtures.
- Resolve an immutable `ProfileClosure` with exact manifests, dependencies,
  registered implementation hashes and Library locks. Installation order must not
  determine meaning.
- Keep manifests declarative. They may reference trusted registered ids but cannot
  embed code, commands, origins, paths, credentials or approval.

### Universal brief and composition

- Define a domain-neutral brief for goals, audience, evidence, unknowns,
  invariants, rights, desired experience/deliverables, budgets and risk.
- Let installed Profiles propose typed Outcome graph fragments and compatible
  recipes from that brief without requiring the user to choose a Profile first.
- Keep proposal/ranking separate from installation, authorization and execution.
- Compose fragments with explicit provenance and precedence; equal-precedence
  semantic conflict blocks affected Outcomes.

### Registries and fallback behavior

- Extend the existing schema registry with typed registries for graph compilers,
  evaluators, presentation renderers/inspectors, semantic actions, delivery
  descriptions and benchmark adapters.
- Registry implementations are Cutout-owned or explicitly trusted application/
  Host code. Profiles reference ids and hashes only.
- Missing optional bindings degrade visibly. Missing required schema/evaluator/
  action/capability bindings block exact nodes or make content diagnostic/read-only.
- Unknown artifacts retain identity, provenance, raw metadata and safe inspection;
  they are never dropped or coerced into a known material kind.

### Lifecycle and security

- Preview install, dependency closure, permissions, compatibility and migrations
  before apply. Pin exact content hashes in the Project.
- Upgrade through an ordinary ChangeSet with impact/evaluation; failed upgrades
  preserve the prior closure and CAS bytes.
- Disable/remove without corrupting Project history or other Profiles. Historical
  content remains inspectable, and reinstallation of the exact closure restores
  supported editing.
- Profiles cannot broaden Host capabilities, access the network/filesystem,
  weaken policy or manufacture authority.

### Scene Extension Law and evidence

- Add a conformance audit that rejects domain branches in Kernel lifecycle,
  authority, approval/history and global navigation.
- Prove the platform first with Commerce, a synthetic held-out Profile and Game
  Asset. Kernel promotion still requires distinct cross-profile evidence.
- Expose Profile maturity through the versioned Design OS evidence benchmark and
  domain result quality through a separate frozen Outcome scorecard. Profile-owned
  metrics cannot rewrite previous rulers or mint system readiness.
- Require promotion packets with reproducible evidence, ownership and regression
  closure before a Host/Profile finding can move into Platform or Kernel.

## Acceptance Criteria

- [x] P1: A strict manifest/closure decoder rejects duplicate ids, missing hashes,
      cycles, incompatible Kernel ranges, unknown required bindings and embedded
      executable/authority/path/origin data.
- [x] P2: The same universal brief deterministically produces provenance-bound
      proposals from two compatible Profiles and an explicit conflict from
      incompatible equal-precedence fragments.
- [x] P3: A synthetic Profile adds a new Outcome schema, evaluator, renderer,
      semantic action and delivery description through registered bindings with
      no Kernel or global-navigation branch.
- [x] P4: Commerce installs through the Profile Platform and retains exact graph,
      plan, evaluation and benchmark semantics.
- [x] P5: Game Asset installs/removes through the same mechanism; removal leaves
      content inspectable/read-only and does not affect Commerce or prototype
      accepted hashes.
- [x] P6: Missing optional and required Host/presentation bindings produce exact
      degraded/blocked diagnostics and never route to ambient tools.
- [x] P7: Install, upgrade, disable and removal preview their semantic/capability/
      migration impact and apply only through authorized ChangeSets.
- [x] P8: Exact Profile closure round-trips in a Project Bundle; tampered/missing
      closure or unsupported migration fails before partial Project mutation.
- [x] P9: The extension audit detects fixture domain branches in protected Kernel,
      authority, navigation and history surfaces while allowing declared registry
      installation and domain-owned files.
- [x] P10: Profile benchmark adapters strictly decode owning evidence and cannot
      mint readiness, hide blockers or change an existing ruler silently.
- [x] P11: Profile-required semantic role closures reject missing/duplicated
      outputs, while node-scoped repair preserves accepted sibling hashes.
- [x] P12: Evidence maturity and Outcome-score adapters remain independently
      versioned and derived; changing a domain score cannot alter readiness, and
      changing Host evidence cannot manufacture domain quality.
- [x] P13: A promotion packet without reproducible evidence and cross-profile or
      held-out conformance proof cannot change protected Platform/Kernel surfaces.

## Out Of Scope

- An open marketplace or arbitrary third-party executable plugins.
- Provider execution, cloud distribution, remote collaboration or a new
  capability security model.
- Replacing domain-specific IR/evaluation with one generic JSON schema.
- Migrating every existing workspace branch in the first Platform slice.
