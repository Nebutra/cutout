# Temporal game asset ingestion - implementation plan

## Gate 1: Authority and retention

- [ ] Align with the temporal multimodal Host task and define retained-byte support
      without weakening existing receipts.
- [ ] Add ingest-plan, decode-receipt and retained-bundle schemas and limits.
- [ ] Reject unavailable, missing, stale, duplicate and altered evidence.

## Gate 2: Decode and sampling

- [ ] Add one bounded deterministic decoder path with version fingerprinting.
- [ ] Add ordered timestamp validation and deterministic 8/16/24/48/custom sampling.
- [ ] Retain exact selected frame bytes and reproduce their identities.

## Gate 3: Game processing and delivery

- [ ] Reuse Game raster processing/evaluation for selected frames.
- [ ] Add attributed identity/motion/loop semantic review and targeted resampling.
- [ ] Compile accepted output through normal clip/family/atlas contracts.

## Gate 4: Real rehearsal

- [ ] Retain and reverify one real authorized video, decoder receipt and frames.
- [ ] Obtain Game semantic acceptance and compile an accepted neutral bundle.

## Validation

- [ ] Decoder/sampler determinism, limits, receipt/byte/timestamp drift tests.
- [ ] Real evidence required for real-host/accepted-delivery status.
- [ ] Temporal Host and Game regressions, type-check, lint, builds and public Agent
      validation if the surface becomes executable.
