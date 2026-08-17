# Agent Sprite Forge coverage ledger - technical design

## Contracts

- `game-asset.coverage-inventory.v1`: pinned upstream identity and stable required
  outcome definitions with local owners.
- `game-asset.coverage-proof.v1`: one outcome, claimed state, owning verifier
  fingerprint and exact evidence references.
- `game-asset.coverage-ledger.v1`: canonical inventory hash, verified proofs,
  blockers and derived replacement result.

The inventory is curated from a reviewed upstream commit. Proof state is computed
by owner adapters; the ledger parser does not trust the proof's claimed state.
The ledger consumes verifier outputs from every sibling task and may not infer
their state from task completion metadata.

## State Rules

```text
unsupported       no executable owning route
contract          strict executable contracts/rejection tests only
real-host         retained real receipts + source/result bytes reverify
accepted-delivery real-host + exact semantic acceptance + verified delivery
```

State is monotonic only while all cited identities remain valid. Verifier drift or
missing evidence blocks re-verification rather than grandfathering old status.

## Owners

- Atomic/family Sprite owners verify generation, cutout, repair, acceptance and
  neutral delivery.
- Map owner verifies visual/runtime/compositor acceptance.
- Engine adapters verify owning engine load/import receipts.
- Temporal owner verifies video/decode/frame evidence.
- Coding Profile owns optional project integration; its proof is displayed
  separately from Game outcome replacement.

## Projection

The System inspector shows a dense list grouped by Sprite, Map, Adapter and
Temporal. Each row displays state and the nearest blocker. It is diagnostic, not
an onboarding choice or promotional scorecard.

## Upstream Refresh

A refresh command reads a separately reviewed upstream commit/inventory and emits
an added/removed/changed diff. Applying it creates a new inventory revision; it
never mutates a signed prior claim.
