# PRD — Remove billing estimates and fix approval/failure notifications

## Background

The app is local-first BYOK: users bring their own provider keys, and the app must never
present billing/cost estimates as if it were metering usage. A screenshot from 2026-07-17
shows three notifications in the bell menu:

1. `Approval needed — Generate design system estimates 0 USD.` — spurious: the call was
   auto-approved (policy `auto-within-budget`, estimate 0), yet the user still saw an
   "approval" notification with a USD figure.
2. `Generate design system failed — request failed: error sending request for url
   (https://aigw.mox.ktvsky.com/v1/images/gene…)` — network-level failure reaching the
   user-configured BYOK gateway; the message is truncated and gives no diagnostic guidance.
3. `Result needs repair` — downstream consequence of the failed generation.

## Requirements

- R1. No user-visible billing/cost estimates anywhere in the UI or notifications.
  - `src/services/local/local-notifications.ts:84` must not render `estimates X USD`.
  - Remove the unrendered `costNotice` / `cost` fields from
    `src/components/agent-workspace/agent-view-model.ts` (no component consumes them).
  - Keep `estimatedCost` / budget guardrails in the event protocol and tool loop —
    internal machinery stays, it is just never surfaced as user copy.
- R2. "Approval needed" notification fires only when human approval is actually pending.
  - `tool-approval-requested` events emitted on the auto-approve path (reason
    "Eligible for automatic approval within budget.") must not produce a notification.
  - Detail copy names the tool/label and says approval is required — no amounts.
- R3. Provider-request failures are diagnosable.
  - Failure notification for a provider/network error should identify the provider or
    gateway host and hint at checking the BYOK provider configuration/network,
    within the existing 500-char detail budget.

## Acceptance Criteria

- [ ] A1. `notificationFromAgentEvent` on an auto-approved `tool-approval-requested` returns null.
- [ ] A2. An explicit-approval event yields an "Approval needed" notification with no currency
      or amount in title/detail.
- [ ] A3. No user-facing notification/dock copy contains `USD` / `estimates` billing wording.
- [ ] A4. Tests updated; `vitest` suite and `tsc --noEmit -p tsconfig.app.json` pass.

## Out of scope

- Fixing reachability of `aigw.mox.ktvsky.com` (environment/provider issue).
- Removing budget-ceiling enforcement from the paid-tool contract.
