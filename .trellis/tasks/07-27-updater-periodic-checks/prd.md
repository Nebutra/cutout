# Add resilient periodic update checks

## Goal

Ensure a running Cutout desktop app continues to discover releases without
excessive network checks or duplicate concurrent work.

## Requirements

- Add an isolated lifecycle scheduler for startup, periodic, focus, visibility,
  and online triggers.
- Preserve the eight-second startup delay.
- Use a six-hour successful-check gate and bounded periodic jitter.
- Make automatic checks single-flight and honor the existing auto-check and
  capability/channel preferences.
- Remove all timers and event listeners on cleanup.

## Acceptance Criteria

- [ ] Unit tests cover every trigger, jitter bounds, gating, concurrency, and
  cleanup with deterministic fake timers.
- [ ] Manual check/download/install behavior remains unchanged.

## Notes

- This bounded scheduler task is PRD-only.
