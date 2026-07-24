# Simplify local recovery settings UX

## Goal

Reduce cognitive load in Settings > Updates & Support by progressively disclosing diagnostics and host recovery actions.

## Requirements

- Keep the common UI-reset action directly available in Settings > Updates & Support.
- Move diagnostic preview/export and host check/recovery behind one collapsed advanced disclosure.
- Do not render disabled host action buttons when no workspace is authorized; explain the prerequisite inside the disclosure instead.
- Keep all existing recovery capabilities, redaction behavior, and project-data safety guarantees unchanged.
- Preserve keyboard accessibility, status announcements, and localized copy.

## Acceptance Criteria

- [ ] The default recovery section presents one direct action and one advanced disclosure instead of five peer actions.
- [ ] Diagnostic preview and export remain available after expanding the disclosure.
- [ ] Authorized workspaces can still check and recover the host, with current progress/status feedback.
- [ ] Unauthorized workspaces see a concise prerequisite message and no disabled host action buttons.
- [ ] UI reset still clears only the existing interface preference keys and confirms success.
- [ ] Focused tests, localization extraction/compilation, lint, type checking, and the Agent contract validation pass.

## Notes

- This is a lightweight presentation and progressive-disclosure change; no recovery protocol or persistence contract changes are intended.
