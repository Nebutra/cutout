# Remove project developer mode

## Goal

Remove the project-level developer mode setting and read-only DAG, Design IR, and receipt audit UI while retaining underlying authoritative IR/provenance capabilities.

## Background

- General settings currently exposes `settings.developer_mode.title` and persists an `advanced` workspace-navigation flag.
- The flag reveals an `Advanced` workspace-rail action that opens `DeveloperAuditDialog`, including Design IR, receipt, host-diagnostic, and redacted-report export views.
- Legacy persisted navigation may still contain `advanced: true` or the removed `dag`, `ir`, and `receipts` inspector values.

## Requirements

- Remove the Developer mode preference, translations, persistence API, and UI-specific state.
- Remove the project workspace `Advanced` action and the read-only developer audit dialog, including report export and host diagnostics.
- Remove developer-only routing projections and inspector visibility behavior from workspace navigation.
- Migrate previously persisted developer navigation to a valid normal Canvas state without exposing the removed surface.
- Update unit and visual coverage so tests assert the simplified settings and workspace surfaces.
- Keep canonical `.cutout` Design IR, provenance, governance/delivery receipts, and Agent/CLI/MCP contracts unchanged.

## Acceptance Criteria

- [x] General settings contains only Theme and Language rows and has no Developer mode copy or switch.
- [x] No project workspace control can open the removed developer audit surface.
- [x] `DeveloperAuditDialog`, redacted audit export, and Axe host status UI are absent from production source.
- [x] Workspace navigation no longer persists or exposes an `advanced` capability or developer action.
- [x] Old persisted `advanced` flags are dropped, retired `dag`, `ir`, and `receipts` inspectors load safely into Canvas, and the next save uses the current schema.
- [x] Relevant unit tests, lint, type-check, full test suite, and production build pass.
- [x] Searches find no remaining developer-mode translation keys or project developer-audit UI references.

## Out Of Scope

- Removing or weakening canonical Design IR/provenance storage, receipt generation, governance evidence, or delivery auditing.
- Removing unrelated advanced controls inside AI, speech, delivery, component, or design-system workflows.
- Changing Cutout's Agent capability contract, CLI, MCP, protocol, manifest, or public documentation claims.
