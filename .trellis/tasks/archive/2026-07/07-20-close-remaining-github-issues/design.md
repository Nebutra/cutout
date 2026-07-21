# Technical Design

## Audit boundary

Map each issue acceptance criterion to concrete code, tests, and CI evidence. Security-sensitive criteria require adversarial regression tests; product milestones require an end-to-end user path rather than isolated schemas.

## Work streams

1. Trusted execution: approval leases, atomic request/effect ledger, durable ownership, Tauri permissions, and filesystem race resistance.
2. Verification and release: accessibility evidence attribution, native Tauri/Rust CI, capability drift, and packaged smoke evidence.
3. Delivery/product milestones: composite receipt spine, bounded external coding adapters, and outcome-first Creative Board.

Sub-agents audit independently and may implement only a bounded gap that is necessary for their assigned issue. The main agent integrates shared contracts, runs cross-layer gates, and owns GitHub state changes.

## Closure policy

An issue closes only when every listed acceptance criterion is represented by executable evidence. Partial milestones remain open and receive a blocker comment. GitHub comments reference behavior and tests without overstating unsupported cloud, live integration, provider, or sync capabilities.

## Validation

Run focused tests first, then lint, production build, `pnpm agent:validate`, Rust formatting/tests, capability tests, and packaged smoke checks applicable to the local environment.
