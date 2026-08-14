# Design OS project change management - implementation plan

## Order

- [ ] Define Project revision, semantic command, dispatcher and ImpactSet hooks.
- [ ] Add ChangeSet, diff, rebase proposal and typed conflict contracts/reducers.
- [ ] Add revision-bound approval lattice and Project capability grants/policies.
- [ ] Add ReviewThread, ChangeRequest, scoped Run and ActionQueue projections.
- [ ] Add snapshots, Milestones, RestoreChangeSet and compensating commands.
- [ ] Extend current Global Library resolution/update/fork semantics and CAS
      closure without creating a second protocol.
- [ ] Add repository evidence/delivery bindings and result receipts.
- [ ] Add Project Bundle manifest/export/import preview, closure/hash verification
      and migration-before-apply.
- [ ] Add evidence license/sensitivity/transmission/retention enforcement plus
      tombstone and reference-aware CAS collection.
- [ ] Route existing UI and Agent mutations through compatibility adapters.

## Validation

- [ ] Cover C1-C12 with reducer, parity, concurrency, authority, history,
      Library and repository fixtures.
- [ ] Run existing approval, global-library, delivery-center, design-ir,
      agent-runtime and git-workspace regressions.
- [ ] Run type-check, lint, production build, `pnpm agent:validate` for exposed
      contract changes and `rtk git diff --check`.

## Dependency And Rollback

Depends on the frozen Kernel revision/command hooks. This child is not required
for the benchmark Host beyond the Kernel's bounded Host authorization. Keep old
workspace mutation paths behind adapters until command parity is proven.
