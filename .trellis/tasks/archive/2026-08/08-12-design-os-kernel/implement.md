# Design OS kernel and conformance - implementation plan

## Order

- [ ] Freeze canonical fixture, evaluator and cross-host normalization contracts.
- [ ] Add universal record, OutcomeGraph and registry schemas in Node-compatible
      modules with strict parsing and version identifiers.
- [ ] Add strict schema migrations, migration receipts, unknown-newer failure and
      terminal ReproductionEnvelope contracts.
- [ ] Implement fragment composition, dependency indexing and pure ImpactSet
      reduction with provenance and conflict diagnostics.
- [ ] Implement Contract/Plan proposal, authorization reference and freeze guards.
- [ ] Add generic production nodes, reducer, scheduler, budgets, cancellation,
      idempotency, checkpoint/recovery and targeted repair.
- [ ] Adapt prototype and asset-production inputs/outputs without migrating
      persisted records or changing current execution behavior.
- [ ] Add cross-host conformance and benchmark-promotion validation.
- [ ] Add structured reason-path observability, Host budget admission and
      generated scale baselines for indexed impact, replay and scheduling.

## Validation

- [ ] Run focused Kernel schema/migration/reproduction/reducer/scheduler/
      conformance and scale tests.
- [ ] Run existing asset-production, prototype, Design IR, recovery and export
      regression suites.
- [ ] Run type-check, lint, production build and `rtk git diff --check`.
- [ ] Run `pnpm agent:validate` only if an implemented public Agent surface is
      changed; do not update capability claims for internal contracts alone.

## Dependencies And Rollback

This is the first implementation child. Commerce and Temporal may design against
its frozen interfaces but integrate only after K1-K9 pass. Keep the legacy
prototype path selectable until the compatibility evidence is complete.
