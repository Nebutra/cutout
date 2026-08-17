# Temporal game asset ingestion - technical design

## Boundary

Reuse the authorized temporal Host, but add a Game-owned retained evidence bundle.
The current hash-only `VideoFrameEvidence` is insufficient for replay; exact frame
bytes and the owning decode receipt must cross the trusted boundary.
This task depends on the temporal multimodal Host and feeds normal action clips
into the multi-action family task; it does not create a second delivery stack.

## Contracts

- `game-temporal.ingest-plan.v1`: source artifact/receipt, action role, decoder and
  bounded sampling policy.
- `game-temporal.decode-receipt.v1`: source identity, decoder/version, duration,
  ordered timestamps and exact decoded frame identities.
- `game-temporal.retained-bundle.v1`: source bytes, receipt, decoded selected frame
  bytes, processing evidence and semantic acceptance references.

## Data Flow

```text
authorized retained video
  -> native/owned deterministic decoder
  -> ordered timestamped frame bytes
  -> deterministic sampling
  -> Game cutout/anchor/scale QA
  -> attributed motion/identity review
  -> normal action clip/family bundle
```

Sampling uses observed duration/timestamps and a frozen policy. Decoder output is
byte-bounded, ordered and replayable. A different decoder/version produces a new
receipt and derived artifact revision.

## Compatibility

Do not weaken existing video executor contracts. Add retained-byte support through
an owning Host adapter or a versioned extension. Downstream Game delivery consumes
normal clips and remains unaware of video origin except through provenance.

## Rollback

Temporal ingestion can remain unavailable while sprite/map production ships. A
failed decode or review preserves the retained video and never emits accepted
frames or a family bundle.
