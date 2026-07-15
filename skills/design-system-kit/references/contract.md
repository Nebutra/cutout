# Design System Kit Contract

## Status

- Capability status: `available`
- Agent operations: `export.design-kit`
- MCP tools: `cutout_plan_design_kit_export`, `cutout_export_design_kit`

## Requirements

- Verified tokens or source evidence
- Current Design IR revision
- Approval id for export

## Produced Evidence

- DESIGN.md
- Token and CSS files
- Tailwind and theme files
- Manifest
- Optional Astryx consumer binding:
  - `astryx/cutout.theme.ts` using the official `defineTheme` API
  - `astryx/component-mapping.json` with explicit IR-to-Astryx mappings
  - `astryx/cli-plan.json` for reviewed `astryx theme build` execution

## Astryx Target

- Astryx is a consumer target, never a token or component fact source.
- Map every Astryx CSS variable and component name explicitly; do not infer
  semantic Astryx keys from Cutout token names or screenshots.
- Detect `@astryxdesign/core`, `@astryxdesign/theme-neutral`, and
  `@astryxdesign/cli` from the consumer package manifest without installing.
- Missing packages produce `adapter-required`; they do not trigger network or
  package-manager work.
- The compiler emits a dry-run command plan only. An external Coding Agent may
  execute the reviewed command in its own sandbox.
- Official interface references:
  `https://astryx.atmeta.com/docs/getting-started`,
  `https://astryx.atmeta.com/docs/theme`, and
  `https://astryx.atmeta.com/docs/cli`.

## Limitations

- No full-system inference from screenshots
- No undelivered component claims
- Exports remain derived from Design IR

## Invariants

- Use the current Design IR revision as the concurrency boundary.
- Preview before approved apply.
- Keep credentials host-owned and out of artifacts.
- Do not claim results without authoritative evidence.
