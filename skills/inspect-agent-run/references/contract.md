# Inspect Agent Run Contract

## Status

- Capability status: `available`
- Agent operations: `run.get`, `run.events`, `run.cancel`
- MCP tools: `cutout_run_get`, `cutout_run_events`, `cutout_run_cancel`

## Requirements

- Cutout project root
- Run id for history

## Produced Evidence

- Current run status
- Event timeline
- Pending decision
- Receipts

## Limitations

- Events do not prove provider work
- Cancellation is cooperative
- Never expose credentials

## Invariants

- Pin the current Design IR revision.
- Preview before approved apply.
- Keep credentials host-owned.
- Claim only authoritative evidence.

