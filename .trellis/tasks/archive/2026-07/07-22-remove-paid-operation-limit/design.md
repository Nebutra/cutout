# Technical Design

## Boundary

This change removes one desktop product preference, not the shared paid-tool
protocol. `PaidToolRequest`, capability estimates, budget ceilings, receipts,
and approval-policy variants remain available to external controllers and
other protocol consumers.

## Desktop Request Flow

The desktop hook will resolve the host capability list for the selected tool
and model, then construct a request with:

- `approvalPolicy: 'explicit'`
- `budgetCeiling` equal to the matching host capability estimate
- no storage read and no policy-level `maxCost`

The existing desktop tool loop remains the approval authority. Because the
request is explicit-only, planning produces `authorization-required` until the
user approves. The existing receipt check continues to reject charges above the
approved ceiling.

If a matching capability is unavailable, the request uses a zero USD bound and
the existing planner returns `capability-required`; this preserves fail-closed
behavior without inventing a cost.

## Prototype Visual Tasks

`useDesktopToolLoop` will expose a host-derived visual budget contract whose
task ceiling covers the routed generation and edit estimates. A missing
capability or currency mismatch produces a zero ceiling so planning fails
closed. `IntentWorkspace` passes that contract into
`createPrototypePageVisualTask`. The task builder no longer imports
`PaidToolPreferences` and hardcodes explicit approval.

The desktop visual bridge also hardcodes explicit approval and replaces the
task-level aggregate ceiling with the matching capability estimate for each
individual paid request. A caller-provided visual task policy cannot re-enable
desktop automatic continuation.

The visual-generation contract itself remains unchanged because it is shared
and still supports external or test-controlled `auto-within-budget` tasks.

## Removal And Migration

- Delete `PaidActionsSection.tsx`.
- Delete `paid-tool-preferences.ts` and its unit test.
- Remove the settings import/render and the E2E mock of `visualPreferences`.
- Regenerate Lingui catalogs with clean extraction so orphaned messages are
  removed from every locale.
- Do not add a local-storage migration. The obsolete key is ignored after the
  reader is removed and has no behavioral effect.

## Compatibility And Safety

- Persisted Agent run events remain parseable because their approval and budget
  fields are unchanged.
- External control requests using `auto-within-budget` remain schema-valid.
- Explicit approval, host authorization, revision binding, provider routing,
  cancellation, and receipt validation continue through the existing loop.

## Rollback

The change is code-only. Reverting the task restores the UI and preference
reader; the obsolete local-storage value remains harmless while this version is
installed.
