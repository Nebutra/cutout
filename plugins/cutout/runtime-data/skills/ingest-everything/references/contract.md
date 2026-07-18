# Ingest Everything Contract

## Status

- Capability status: `available`
- Agent operations: `source.ingest`
- MCP tools: `cutout_plan_source_ingest`, `cutout_apply_source_ingest`

## Requirements

- Current Design IR revision
- Role and license metadata
- Approval id for apply

## Produced Evidence

- Source preview
- Provenance records
- Apply receipt

## Limitations

- URL inputs are not fetched
- Video is not processed
- Secrets and arbitrary paths are rejected

## Invariants

- Use the current Design IR revision as the concurrency boundary.
- Preview before approved apply.
- Keep credentials host-owned and out of artifacts.
- Do not claim results without authoritative evidence.
