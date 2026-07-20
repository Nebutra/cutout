# PRD — Configurable chroma-key production boards

## Goal

Support an explicit board key color (initially `#00FF00`) end to end without
breaking existing white boards or treating foreground colors near the key as
background accidentally.

## Acceptance criteria

- One typed key-color contract drives board prompts, background detection,
  flood fill, alpha removal, diagnostics, worker inputs, and user-visible
  parameters.
- Existing white boards retain their current behavior and persisted projects
  migrate additively.
- Generated boards forbid colors near the configured key; non-compliance is
  reported as review evidence instead of silently producing damaged assets.
- Deterministic fixtures cover white and green-key boards, pale foregrounds,
  near-key foregrounds, soft edges, and dark-background composition.

## Non-goal

Do not advertise or enable chroma-key boards until all consumers use the same
contract.
