# Shared Safety Contract

## Authority

- Treat `.cutout` Design IR and provenance as authoritative.
- Treat exports as reproducible derivatives.
- Pin the expected revision through preview and apply.

## Approval

- Preview ingestion, export, coding, and paid actions.
- Require a host-issued, short-lived, single-use approval lease bound to the exact operation, preview digest, and expected revision for apply.
- Invalidate approval when revision, scope, budget, or output changes.

## Filesystem

- Stay below the controlled project root.
- Use managed export locations only.
- Reject traversal, arbitrary destinations, symlinks, and secrets.

## Capability Truth

- Do not claim live Figma sync, web fetching/search, video processing, cloud collaboration, or a bundled provider.
- Return capability-required when a host dependency is absent.
- Distinguish planning, execution, and verified delivery.

## Evidence

- Record provenance, hashes, revisions, events, checks, and receipts.
- Promote only artifacts whose bytes or repository state passed required gates.
