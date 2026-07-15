---
name: design-governance
description: Preview, validate, report, and repair Cutout Design Governance evidence for Brand VI Kits, Design System Kits, components, starters, Figma snapshots, and delivery. Use when an external Coding Agent must inspect token usage across modes and interaction states, verify WCAG/DTCG/browser evidence, understand promotion blockers, or request a scoped repair.
---

# Design Governance

1. Read project context and the authoritative `.cutout` Design IR revision.
2. Call governance preview before validation. Supply explicit token usage bindings and selectors; never infer foreground/background pairs from screenshots.
3. Validate desktop and mobile evidence for light, dark, and high-contrast modes and relevant interaction states.
4. Read the report by receipt ID. Treat hard findings as promotion blockers and advisories as non-blocking review items. Never invent or summarize them as a total score.
5. Request repair using only receipt ID and failed finding IDs. Preserve revision, path, command, byte, and time scopes.
6. Stop for explicit human approval when the repair touches a brand-locked token.
7. Rerun the same harness and retain both repair and governance receipts.

The browser harness records computed facts and optional axe output. It does not expose model reasoning or claim live Figma sync.

## Preview input

- Pin the Design IR revision.
- Declare foreground and background token IDs.
- Declare a stable fixture selector.
- Declare applicable modes and states.
- Declare brand-locked token IDs.
- Keep desktop and mobile fixtures deterministic.

## Evidence rules

- Use computed foreground and ancestor background layers.
- Preserve alpha values until compositing is complete.
- Record computed font size and weight.
- Record boundary and focus indicator colors.
- Record focus indicator width.
- Record non-color cues for semantic states.
- Attach axe rule IDs and impact, not prose guesses.
- Keep viewport identity with every measurement.

## Promotion rules

- Block on missing required browser evidence.
- Block on failed text contrast.
- Block on failed UI boundary contrast.
- Block on an insufficient focus indicator.
- Block when meaning relies on color alone.
- Block on serious or critical axe violations.
- Keep moderate and minor axe findings advisory.
- Never average findings into a score.

## Repair rules

- Pass failed finding IDs to `coding.repair`.
- Include the expected revision.
- Restrict allowed paths and commands.
- Set time and changed-byte budgets.
- Preserve evidence instead of replacing it with assertions.
- Require human approval for brand-lock changes.
- Rerun all affected modes, states, and viewports.
- Save the repair receipt and replacement governance receipt.

## Reporting

- Lead with hard blockers and advisories.
- Include mode and interaction state.
- Include the measured value and threshold.
- Include the Design IR or DOM location.
- Include the applicable standard version.
- Include evidence hashes or artifact references.
- Put verbose evidence behind progressive disclosure.
- Do not expose chain-of-thought.

## Integrity

- Treat `.cutout` Design IR and provenance as authoritative.
- Preview before any approved apply.
- Do not weaken policy to make validation pass.
- Do not invent approval IDs.
- Do not expose credentials.
- Do not read arbitrary paths.
- Do not claim live Figma sync.
- Do not claim web fetching or cloud collaboration.
