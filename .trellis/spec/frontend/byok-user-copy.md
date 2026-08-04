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

**Boundary**: Paid-tool requests, plans, visual DAGs, Agent run events, and
delivery previews carry no predicted cost or budget ceiling. The desktop app
does not expose a billing or cost-management preference: every desktop paid
request requires explicit approval. A shared host policy may use
`approvalPolicy: 'auto'`, but automatic authorization is a host policy decision,
not a cost-threshold decision. An optional `receipt.charged` value may be
recorded only after execution and only when it is backed by verifiable Provider
billing evidence; Cutout must never infer it from a model, capability, plan, or
request.

```ts
// Wrong (predicted billing copy)
detail: safe(`${event.label} has an estimated provider charge of $0.08.`, 500)

// Correct
detail: safe(`${event.label} requires your approval before it can run.`, 500)
```

## Contract: Approval notifications gate on `pendingApproval`

- `tool-approval-requested` events require `pendingApproval: boolean`.
- `src/agent-runtime/desktop-tool-loop.ts` sets
  `pendingApproval: !(plan.executable && Boolean(capability))` - true only when the
  active approval policy will not immediately authorize execution.
- `notificationFromAgentEvent` (`src/services/local/local-notifications.ts`) returns
  `null` unless `pendingApproval === true`. Host-authorized calls must not produce an
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
