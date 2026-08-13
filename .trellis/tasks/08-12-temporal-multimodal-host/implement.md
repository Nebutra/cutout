# Temporal media and multimodal host - implementation plan

## Order

### Gate A: competition-critical multimodal Host

- [ ] Add exact granular video capability descriptors and route receipts.
- [ ] Extract shared DashScope request/poll/download contracts without moving
      native secret/origin authority into the Kernel.
- [ ] Add structured text, VL/OCR, exact image and Wan asynchronous video routes
      required by Commerce, including verified artifact download.
- [ ] Pass TA1-TA3 and release the frozen Host interfaces to Competition.

### Gate B: Temporal Design foundation

- [ ] Define `media-timeline.v1`, semantic edit commands, locks and evaluations.
- [ ] Implement timeline compilation, immutable take/range replacement and
      delivery-version assembly contracts against mocked adapters.
- [ ] Probe and add H3/Seedance adapters only for officially documented and
      observed wire operations.
- [ ] Add timecode QA and three cross-profile temporal fixtures.

## Validation

- [ ] Run schema, non-destructive edit, continuity and capability-matrix tests.
- [ ] Run mock-server retry/cancel/origin/size/redaction and playable-media tests.
- [ ] Run sanitized live probes separately from deterministic CI.
- [ ] Run existing motion-ir, video-reference, Provider policy, type-check, lint
      and `rtk git diff --check` suites.

## Dependency And Rollback

Depends on Kernel ArtifactGraph/capability/receipt interfaces. Competition
depends only on completed Gate A. H3, Seedance and Gate B are product capabilities
and cannot delay the benchmark package. No capability manifest is updated until
the corresponding public Host path is actually executable.
