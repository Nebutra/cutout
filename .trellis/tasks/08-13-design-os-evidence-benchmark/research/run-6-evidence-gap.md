# Run 6 product-evidence gap

## Preserved external evidence

The held-out competition Host run at
`/private/tmp/cutout-qwen-heldout-6.GxT8ry` retains exactly eleven deliverables,
their SHA-256 values and physical media metadata. Its offline evidence records
the exact-output digest
`e3ccaf41326ead168c732b3455c7768f8816f135fc61c10184921bbac47761b9`,
A1-A7 as passed, and a `944276ms` run from `2026-08-13T07:58:50.087Z` through
`2026-08-13T08:14:34.361Z`.

This proves the reviewed competition package produced the retained output. It
does not prove the Cutout product's real-Host or production-rehearsal stages.

## Non-recoverable gaps

- No Cutout-native pre-run commitment binds a challenge id, evaluator-selected
  input inventory, canonical input hash, run id and issue time before the first
  Provider request.
- No independent evaluator signature proves that the challenge selection was
  held outside the implementation and was released only for this run.
- No signed `.cutout` source-ingest receipts bind the selected URLs and source
  bytes to ProductFacts.
- No Cutout-native Provider, semantic-QA or playback receipts bind the eleven
  artifact bytes to the frozen graph, Contract, Plan, locks and semantic roles.
- The offline A1-A7 report is package-owned output validation. It cannot replace
  native receipt authentication or an internally recomputed Commerce evaluation.

These facts cannot be added after the run without changing the meaning of the
evidence. Run 6 must remain competition evidence and must not be imported into
the product benchmark.

## Next admissible rehearsal

1. An independent evaluator selects the unseen input and signs the exact
   versioned challenge payload with a build-pinned evaluator key.
2. Before any source fetch or Provider request, Cutout verifies that signature
   and issues a Keychain-backed commitment for the exact challenge/input/run.
3. The same run produces the canonical `.cutout` source-ingest, Provider,
   semantic-QA and playback receipts plus retained bytes and frozen
   EvidenceGraph, OutcomeGraph, Contract and Plan.
4. Offline verification recomputes every hash and Commerce evaluation, verifies
   the commitment predates all run receipts, verifies the evaluator signature,
   and rejects any run/input/bundle drift.
5. Only this verified closure may pass the Design OS production-rehearsal
   metric. Fixtures, package logs and caller-authored booleans contribute zero
   benchmark evidence.
