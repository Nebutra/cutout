# Simplify settings and localize general

## Goal

Make Settings easier to scan in Simplified Chinese by keeping routine preferences in
General and moving advanced, paid-action, update, and recovery controls to clearly
named settings sections. All visible strings on the changed settings surfaces must
be localized for Simplified Chinese; other shipped locales retain Lingui fallback
copy until separately translated.

## Confirmed facts

- `GeneralSection.tsx` currently combines theme, language, developer mode, paid
  action approval, updates, slicing reset, local recovery, and export-folder
  preference in one uninterrupted list.
- Developer mode exposes read-only design audit tools. Host recovery is local,
  requires an authorized workspace, and does not delete project data.
- The Settings sidebar already supports local-section routing without a URL, and
  the app supports English, Simplified Chinese, Japanese, French, and Spanish.

## Requirements

1. Keep only theme, language, and export-folder preference in General.
2. Group paid-action approval and the per-action budget with AI settings.
3. Add an Advanced section for developer mode and slicing-parameter reset.
4. Add an Updates & Support section for desktop updates and local recovery,
   including diagnostics and authorized-host status/recovery actions.
5. Preserve the current behaviors, safety restrictions, accessibility labels, and
   focus-target support; this is a navigation and presentation change, not a
   change to approval, update, recovery, or data-deletion policy.
6. Replace hard-coded visible settings copy with Lingui messages and provide
   Simplified Chinese catalogue entries.

## Acceptance criteria

- [x] In Simplified Chinese, General contains no English visible text and shows
  only theme, language, and export-folder settings.
- [x] AI contains paid-action approval and the maximum per-action USD amount.
- [x] Advanced contains developer mode and slicing-parameter reset.
- [x] Updates & Support contains updates plus local diagnostics and host recovery.
- [x] Existing recovery and update safety assertions remain true.
- [x] Settings navigation, section tests, relevant unit tests, typecheck, and
  locale compilation pass.

## Out of scope

- Changes to agent policy, billing behavior, update transport, host authorization,
  recovery semantics, or the set of supported locales.
