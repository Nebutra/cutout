# PRD — DESIGN.md hard-gate policy

## Decision required

The current recovery contract separates visual media health from documentation
health: invalid generated DESIGN.md is `repair-required`, valid visual media is
retained, and a valid imported DESIGN.md may satisfy Outcome. The original G5
proposal instead requires invalid generated documentation to remain an Outcome
gap even when imported documentation exists.

Choose the product authority before implementation:

1. Generated-authoritative: only the design-system artifact's validated
   DESIGN.md can satisfy Outcome.
2. Portable-evidence: any validated current DESIGN.md may satisfy Outcome while
   generated documentation remains a visible repair item.

## Acceptance criteria

- The chosen authority is explicit in artifact projection, Outcome, repair
  planning, run events, persistence/restore, and UI status.
- Validation errors remain inspectable and repairable; no silent fallback.
- Tests cover invalid generated docs with and without valid imported docs,
  restored workspaces, and successful repair.
