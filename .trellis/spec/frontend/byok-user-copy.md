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

**Boundary**: Provider-tool requests, plans, visual DAGs, Agent run events, and
delivery previews carry no predicted cost or budget ceiling. Enabling a BYOK
Provider is sufficient authority for Provider calls, so desktop Provider requests
use `approvalPolicy: 'auto'` and never show a per-call confirmation.
Preview and run events exist for observation, cancellation and evidence, not for
approval. Requests, plans, receipts and UI projections do not carry Provider
prices, charges, credits or billing evidence.

```ts
// Wrong (predicted billing copy)
detail: safe(`${event.label} has an estimated provider charge of $0.08.`, 500)

// Correct
detail: safe(`${event.label} is running with your configured BYOK Provider.`, 500)
```

## Contract: Approval notifications gate on `pendingApproval`

- `tool-approval-requested` events require `pendingApproval: boolean`.
- Product-owned desktop calls always set `pendingApproval: false` and execute
  immediately when capability and host policy are available.
- Missing capability and disabled host policy settle as failures. They are never
  mislabeled as approval requests.
- `notificationFromAgentEvent` (`src/services/local/local-notifications.ts`) returns
  `null` unless `pendingApproval === true`. Host-authorized calls must not produce an
  "Approval needed" notification.

**Tests**: `src/services/local/local-notifications.test.ts` asserts direct BYOK
execution -> null, and legacy/external pending approval -> notification with no
`USD|estimates|$|¥` in title/detail.

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
