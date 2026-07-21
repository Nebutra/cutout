# Merge advanced settings into general

## Goal

Remove the underfilled Advanced settings tab and place its only control,
Developer mode, in the General section so settings navigation reflects actual
content density.

## Requirements

- Remove Advanced from the settings sidebar and section type unions.
- Move Developer mode to the bottom of General while preserving its current
  persisted behavior, accessible label, hint, and instant application.
- Delete the standalone `AdvancedSection` component and render branch.
- Remove the obsolete `settings.section_advanced` localization message through
  clean extraction; keep Developer mode messages.
- Update settings grouping tests to encode the new information architecture.
- Preserve all unrelated connector-icon and native permission changes.

## Acceptance Criteria

- [x] Settings navigation contains no Advanced tab.
- [x] General contains Theme, Language, export-folder preference, and Developer
      mode in that order.
- [x] Toggling Developer mode still calls the existing workspace navigation
      persistence API.
- [x] No `AdvancedSection`, `SettingsSection = ... advanced`, or
      `settings.section_advanced` live source reference remains.
- [x] Focused tests, lint, TypeScript, and i18n validation pass.

## Out of Scope

- Redesigning other settings categories.
- Changing what Developer mode reveals inside a project.
