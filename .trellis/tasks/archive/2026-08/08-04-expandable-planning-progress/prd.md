# Expandable planning progress timeline

## Goal

Replace the opaque planning wait card with a compact status summary that users
can expand into truthful stage progress while the planning runtime is working.

## Background

- The current Agent activity bubble projects one durable `step:prepare:*` event
  as “Preparing the run” for the entire local Codex turn. A real turn can spend
  minutes connecting, retrying upstream, receiving output, and validating the
  structured result, but none of those boundaries are visible.
- `CodexPlanningEvent` already reports `started`, `retrying`, terminal failure,
  and completion. General Agent run events already support step lifecycle
  evidence and remain the authoritative source for timeline UI.
- Network/model latency is not predictable. A numerical percentage or ETA
  would be invented rather than measured.

## Requirements

- Keep the default activity bubble compact and preserve its live elapsed time.
- Make the activity bubble expandable without navigating away or opening a
  separate inspector.
- Show planning stages derived from durable lifecycle events: prepare bounded
  context, connect the selected planning runtime, await the planning result,
  and validate the structured response.
- Each row must distinguish completed, active, and waiting states. Do not infer
  completion from elapsed time and do not display a fabricated percentage or
  ETA.
- Project Codex reconnect attempts into the active planning stage without
  duplicating or restarting completed rows.
- Preserve cancellation and terminal error behavior. The expandable progress
  must not create a second error card or claim success after failure.
- Keep existing Agent run event schemas and `.cutout` authority intact; use the
  existing step lifecycle contract rather than adding a private UI-only log.
- Keep controls stable and accessible: the disclosure must be keyboard
  operable, expose a useful accessible label, and must not shift unrelated
  composer/canvas controls.

## Acceptance Criteria

- [ ] A running Codex planning turn renders one compact Agent activity bubble
      with elapsed time and an expandable progress disclosure.
- [ ] Expanded progress shows the four expected stages with exactly one active
      stage and truthful completed/waiting predecessors and successors.
- [ ] A native `retrying` event updates the planning row with its bounded attempt
      number while completed rows remain complete.
- [ ] Structured response validation becomes visibly active only after the
      runtime result returns and before schema parsing completes.
- [ ] Completed, cancelled, and failed runs leave no stale running progress
      bubble and retain the existing response/error surfaces.
- [ ] View-model and component tests cover collapsed markup, expanded stage
      projection, reconnect progress, and terminal cleanup.
- [ ] Focused tests, TypeScript, lint, production build, and `git diff --check`
      pass.

## Out Of Scope

- Fake percentage completion, ETA prediction, token streaming visualization, or
  exposing raw Provider/runtime protocol payloads.
- Redesigning the complete execution timeline, canvas, or composer.
