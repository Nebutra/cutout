# Design Profile Platform - implementation plan

## Gate 1: Contracts And Closure

- [x] Add strict manifest, binding reference and Profile closure schemas.
- [x] Implement canonical closure hashing, dependency resolution, cycle/conflict,
      Kernel compatibility and required-registration validation.
- [x] Add invalid/tampered/unknown-newer/missing-binding fixtures.
- [x] Add required-role closure and identity/continuity binding schemas with
      missing, duplicate, stale-lock and observed-output mismatch fixtures.

## Gate 2: Registries And Universal Brief

- [x] Add compiler, evaluator, presentation, semantic-action, delivery and
      separate evidence-benchmark/Outcome-score registries with canonical
      owner/digest enforcement.
- [x] Add universal brief schema and deterministic multi-Profile proposal/
      composition with provenance and explicit conflicts.
- [x] Add safe unknown-schema and optional/required binding projections.

## Gate 3: Lifecycle And Conformance

- [x] Add install/upgrade/disable/remove previews and Project closure records,
      delegating mutation/authorization to Project ChangeSets.
- [x] Add Project Bundle closure round-trip and fail-before-mutation checks.
- [x] Add structural protected-surface audit plus behavioral synthetic Profile
      conformance fixtures.
- [x] Add promotion-packet validation and canonical cross-Host parity fixtures.

## Gate 4: Reference Adapters

- [x] Wrap Commerce as the first real manifest and prove canonical parity.
- [x] Add the held-out synthetic Profile without protected-surface changes.
- [x] Admit Game Asset only after Gates 1-3 pass; record extension audit evidence.
- [x] Prove node-scoped repair, sibling-hash retention and exact identity-lock
      impact in Commerce plus Game Asset/held-out fixtures.
- Deferred: connect Workbench registry consumption in the General Design OS
  Workbench task after its domain-neutral controller is available.

## Validation

- [x] Run Profile schema/closure/registry/composition/lifecycle/conformance and
      Project Bundle suites.
- [x] Run Kernel, Commerce benchmark, prototype compatibility, Workbench and
      ChangeSet suites as their adapters land.
- [x] Run type-check, lint, build and `rtk git diff --check`.
- [x] Confirm `pnpm agent:validate` remains unchanged because implemented public Agent surfaces are
      synchronized; internal Profile contracts alone do not change claims.

## Rollback

Keep existing Commerce and prototype installation paths until parity passes.
Platform records are additive and removable; failed admission or upgrade cannot
rewrite Project authority, delete prior closure bytes or mutate Host capability.
