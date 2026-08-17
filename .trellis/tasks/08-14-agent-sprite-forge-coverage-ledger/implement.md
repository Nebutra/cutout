# Agent Sprite Forge coverage ledger - implementation plan

## Gate 1: Inventory and schemas

- [ ] Curate stable outcome IDs from pinned upstream commit `64fd0b57...`.
- [ ] Add inventory, proof and ledger schemas with canonical hashes.
- [ ] Add exhaustive duplicate/missing/unknown outcome tests.

## Gate 2: Owning verifier adapters

- [ ] Add Sprite, Map, Engine and Temporal proof adapters over their native evidence.
- [ ] Enforce fixture=`contract`, retained real=`real-host`, and exact accepted
      delivery=`accepted-delivery` without caller status/readiness trust.
- [ ] Bind complete verifier fingerprints and reject implementation drift.

## Gate 3: Replacement and projection

- [ ] Derive replacement only from complete accepted-delivery conjunction.
- [ ] Add compact inspector projection with evidence links and nearest blockers.
- [ ] Add reviewed upstream inventory diff/refresh without web-fetch claims in the
      default product Host.

## Validation

- [ ] State-transition, downgrade, tamper, stale verifier and cross-plane authority
      tests.
- [ ] Real proof adapters cite retained evidence; fixture proof remains contract-only.
- [ ] Parent Design OS benchmark/profile tests, type-check, lint, build and Agent
      validation if any public surface is shipped.
