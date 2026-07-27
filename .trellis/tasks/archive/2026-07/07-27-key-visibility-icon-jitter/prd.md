# Stabilize API key visibility toggle

## Goal

Prevent the show/hide icon inside secret inputs from jumping vertically while
the pointer is pressed.

## Requirements

- Keep the visibility toggle centered for idle, hover, focus, active, and
  disabled states.
- Preserve the shared Button press treatment for normal buttons.
- Apply the fix to both provider API keys and Vectorizer API secrets.
- Preserve the write-only credential boundary and existing accessible labels.

## Acceptance Criteria

- [x] Pressing the visibility toggle does not change its vertical transform.
- [x] The icon button remains a stable 24x24 pixel target with a stable icon box.
- [x] Provider and Vectorizer secret inputs share the same stable positioning.
- [x] Focused component tests, lint, type-check, and build pass.
