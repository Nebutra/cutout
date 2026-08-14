# Keep a visible sidebar restore after collapsing chrome

## Goal

Collapsing the workspace rail and hiding the Agent (or any other) drawer must
never leave the project canvas without a discoverable control that restores the
left workspace chrome.

## Context

The desktop workspace has two independent hide actions:

- Rail `Collapse sidebar` sets `sidebarCollapsed` and animates the icon rail to
  width 0.
- Drawer `Hide Agent` / `Hide Files` sets `activeWorkspacePanel` to `null`.

A restore control already exists (`Expand sidebar` at the workspace origin), but
it is a ghost icon with no chrome. When both surfaces are hidden it occupies the
same origin as the canvas top-left tools, so users cannot find a way back.

## Requirements

- Closing the rail, the drawer, or both must leave at least one visible,
  clickable restore control on desktop (`lg` and above).
- The restore control lives on the workspace shell, not inside a canvas surface
  that can be replaced by run-error, review, or empty-state views.
- The restore control must share the existing canvas top-left chrome language
  (circular, bordered, background, shadow) rather than a bare glyph on the
  dotted canvas.
- When the rail and drawer are both gone, reserve the canvas top-left origin so
  grid / minimap / background controls sit beside the restore instead of under
  it.
- Activating restore expands the rail. It does not force a drawer open; the
  rail remains the navigation back to Agent, Files, Git, Design, and Deliver.
- Keep the existing accessible names `Collapse sidebar` and `Expand sidebar`.
- Do not leave a dead gutter beside an open drawer (rail width stays 0 while
  collapsed).
- Mobile layout is unchanged: the rail is already hidden and this restore is
  desktop-only.

## Acceptance Criteria

- [x] A1: After `Collapse sidebar`, `Expand sidebar` is visible without hovering
      and is not a chrome-less glyph.
- [x] A2: After `Hide Agent` (or any drawer hide) and then `Collapse sidebar`,
      `Expand sidebar` remains visible on the workspace shell and clicking it
      restores the rail.
- [x] A3: After `Collapse sidebar` then `Hide Agent`, the same restore remains
      visible and clickable. There is no state where both hide actions leave
      only an invisible or overlapped control.
- [x] A4: With the rail collapsed and a drawer still open, expanding still
      works and the drawer stays flush to the workspace origin (no leftover
      rail gutter).
- [x] A5: Existing workspace-navigation, canvas-centered-overlay, and
      outcome-first tests that click `Expand sidebar` still pass; a source or
      unit contract forbids a collapsed rail with no restore surface.

## Notes

Lightweight UX repair. No new persistence, shortcuts, or title-bar chrome.
