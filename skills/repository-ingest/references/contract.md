# Repository Ingest Contract

## Status

- Capability status: `desktop-only`
- Agent operations: `source.ingest`
- MCP tools: `cutout_plan_source_ingest`, `cutout_apply_source_ingest`

## Requirements

- Desktop directory selection or controlled root
- Current Design IR revision
- Approval id for apply

## Produced Evidence

- Repository inventory
- Framework evidence
- Apply receipt

## Limitations

## GitHub P1

- Use `cutout.github` only for a selected GitHub App installation repository.
- Keep installation authentication in an opaque host-owned SecretHandle.
- Inventory and issue/PR feedback become provenance-bearing source evidence.
- Preview repository, base SHA, Cutout branch, files, diffs, PR and checks.
- Apply requires explicit approval and repository-head CAS.
- Never write the default branch, merge, or assume exactly-once webhooks.

- No arbitrary absolute paths
- No symlink traversal
- Framework detection may remain unknown

## Invariants

- Use the current Design IR revision as the concurrency boundary.
- Preview before approved apply.
- Keep credentials host-owned and out of artifacts.
- Do not claim results without authoritative evidence.
