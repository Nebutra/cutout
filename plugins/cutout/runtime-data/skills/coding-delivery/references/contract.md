# Coding Delivery Contract

## Status

- Capability status: `provider-required`
- Agent operations: `coding.execute`, `coding.review`, `coding.repair`
- MCP tools: `cutout_plan_coding_task`, `cutout_apply_coding_task`

## Requirements

- Injected coding backend and workspace
- Pinned snapshot and budgets
- Approval id for apply

## Produced Evidence

- Coding task
- Hash-guarded patch
- Check evidence
- Receipt

## Limitations

- Bundled host returns capability-required
- No arbitrary shell
- No unscoped reads

## Invariants

- Pin the current Design IR revision.
- Preview before approved apply.
- Keep credentials host-owned.
- Claim only authoritative evidence.
