# Remove per-action paid operation limit

## Goal

Remove the desktop preference that lets users auto-approve paid Agent actions up
to a configurable per-action USD amount. Paid desktop actions should instead
require explicit user approval, without presenting Cutout as a billing or cost
management surface.

## Background

- The AI settings screen currently exposes a "Paid actions" switch and a
  "Maximum per action (USD)" input.
- The preference is persisted under `cutout.paid-tool-preferences.v1` and is
  consumed by ordinary desktop tool calls and prototype visual-generation
  tasks.
- Cutout is local-first BYOK. Provider billing is the source of truth; the app
  should not ask users to configure a Cutout-specific USD allowance.
- Protocol-level estimates, budget ceilings, receipts, and capability-lease
  limits remain required security and governance contracts.

## Requirements

- Remove the paid-action controls from AI settings and remove all localized
  messages that exist only for those controls.
- Delete the paid-tool preference persistence module, its storage key, and its
  dedicated tests.
- Remove all runtime reads and projections of the deleted preference.
- Desktop paid-tool requests must use `approvalPolicy: 'explicit'`.
- Request budget ceilings must remain host-derived execution bounds based on
  the selected capability estimate; they must not come from local storage or a
  user-entered arbitrary USD amount.
- Desktop paid-tool policy may allow the paid capability to be offered, but it
  must not supply a user-configurable `maxCost` that enables automatic
  continuation.
- Prototype visual tasks must receive an explicit-only, host-derived budget
  contract without importing or exposing the removed preference type.
- Update affected tests and frontend specs so the removed setting and the new
  explicit-only desktop behavior are documented and enforced.

## Acceptance Criteria

- [ ] No AI settings UI, accessibility label, locale message, import, file, or
  test references `PaidActionsSection` or the removed paid-tool preference API.
- [ ] No production code reads or writes
  `cutout.paid-tool-preferences.v1`.
- [ ] Ordinary desktop image/edit/cutout requests carry explicit approval and
  a ceiling derived from the resolved host capability estimate.
- [ ] Prototype visual-generation tasks carry explicit approval and a
  host-derived estimate ceiling.
- [ ] The desktop tool loop still emits a pending approval and waits for user
  approval before invoking a paid executor.
- [ ] Control-protocol support for budgets, estimates, receipts,
  `auto-within-budget`, and external-controller policy remains intact.
- [ ] Focused tests, lint, TypeScript build, i18n extraction check,
  `pnpm agent:validate`, production build, and `git diff --check` pass.

## Out Of Scope

- Removing protocol-level money estimates, budget schemas, receipt validation,
  or capability-lease budget limits.
- Changing external CLI/MCP paid-tool contracts or claiming that the headless
  host has a paid provider executor.
- Changing provider billing, pricing discovery, or credential handling.
