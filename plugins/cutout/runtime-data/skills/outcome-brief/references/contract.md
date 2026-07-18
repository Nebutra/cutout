# Outcome Brief Contract

## Status

- Capability status: `available`
- Agent operations: `project.context`, `validate`
- MCP tools: `cutout_project_context`, `cutout_validate`

## Requirements

- Selected project context
- User-stated outcome

## Produced Evidence

- Outcome contract
- Acceptance criteria
- Evidence checklist

## Limitations

- Headless patches remain dry-run only
- Do not escalate routine implementation choices

## Invariants

- Use the current Design IR revision as the concurrency boundary.
- Preview before approved apply.
- Keep credentials host-owned and out of artifacts.
- Do not claim results without authoritative evidence.
