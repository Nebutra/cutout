# BYOK User-Facing Copy & Notification Contract

> Cutout is local-first BYOK. The app never meters usage, so it must never show
> billing/cost-estimate copy to users. Established 2026-07-17
> (task `07-17-byok-notifications-cleanup`).

---

## Convention: No user-visible billing estimates

**What**: No notification, dock, view-model, or component copy may contain cost
estimates (`estimates X USD`, amounts, currencies presented as charges).

**Why**: Users bring their own provider keys; showing USD estimates implies the app
is billing them. Provider billing is the only source of truth.

**Boundary**: Budget guardrails stay *internal*. `estimatedCost` / `budgetCeiling`
remain in the `tool-approval-requested` event schema (`src/agent-runtime/run-events.ts`)
and the paid-tool contract (`src/control-protocol/paid-tool-contract.ts`). The
desktop app does not expose a billing or cost-management preference: desktop
paid requests require explicit approval and use host-derived capability estimates
as execution ceilings. External controllers may still use the shared protocol's
bounded auto-approval policy.

```ts
// Wrong (old copy)
detail: safe(`${event.label} estimates ${event.estimatedCost.amount} ${event.estimatedCost.currency}.`, 500)

// Correct
detail: safe(`${event.label} requires your approval before it can run.`, 500)
```

## Contract: Approval notifications gate on `pendingApproval`

- `tool-approval-requested` events carry optional `pendingApproval?: boolean`
  (optional so persisted event logs still parse).
- `src/agent-runtime/desktop-tool-loop.ts` sets
  `pendingApproval: !(plan.executable && Boolean(capability))` — true only when the
  auto-approve path will NOT immediately approve.
- `notificationFromAgentEvent` (`src/services/local/local-notifications.ts`) returns
  `null` unless `pendingApproval === true`. Auto-approved calls must not produce an
  "Approval needed" notification.

**Tests**: `src/services/local/local-notifications.test.ts` asserts auto-approved →
null, and pending → notification with no `USD|estimates|$|¥` in title/detail.

## Contract: Transport failures name the gateway origin

Provider transport errors ("error sending request for url …", fetch/DNS failures)
are rewritten in `src/services/ai/generation-service.local.ts` (`transportErrorText`)
to:

```
Could not reach <origin>. Check your BYOK provider base URL and network connectivity in AI settings.
```

- Parse the URL down to its origin — never surface a raw truncated request URL.
- Keep ≤500 chars (notification detail budget in `local-notifications.ts`).

**Test**: `src/services/ai/generation-service.local.test.ts` covers the rewrite.
