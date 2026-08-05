# Agent source settings and localization

## Goal

Present the common Agent inventory and its distinct authorization actions in a
clear settings experience across all supported Cutout languages.

## Requirements

- Group all 39 registry entries by installed/available state while keeping
  search/filter usable on desktop and mobile.
- Show Agent, provider/source, sanitized location, API-key/session type,
  installation state, permission state, and supported actions without secret
  fragments.
- Keep `Import API key`, `Use Agent session`, and `Grant access` as separate
  commands with separate previews and confirmations.
- Automatic refresh never triggers an OS permission dialog. Permission prompts
  follow an explicit user action and target only the exact registered root.
- Denied, missing, unsupported, malformed, loading, retry, and zero-source states
  are complete and non-destructive.
- Localize all new copy in English, Simplified Chinese, Japanese, French, and
  Spanish.

## Acceptance Criteria

- [ ] All 39 Agents are searchable and display truthful capability states.
- [ ] API-key import, session delegation, and root permission cannot be confused
  or triggered through the wrong action.
- [ ] No secret-shaped value renders or appears in snapshots/logged errors.
- [ ] Keyboard, screen-reader, desktop, and mobile interactions are covered.
- [ ] `pnpm i18n:ci`, focused component tests, and visual checks pass in all five
  languages.

## Dependency

The final UI consumes the inventory DTO first and progressively enables actions
as the credential and delegation children land.
