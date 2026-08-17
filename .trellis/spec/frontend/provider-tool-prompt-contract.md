# Provider-Tool Intent And Prompt Contract

## 1. Scope / Trigger

Use this contract for every BYOK image generation or editing request. Audit and
observation text must remain bounded and human-readable even when the provider
needs a much larger generated prompt.

## 2. Signatures

```ts
interface ProviderToolRequest {
  capability: 'generate-image' | 'edit-image' | 'cutout'
  intent: string
  prompt: string
  inputArtifactIds: string[]
  approvalPolicy: 'explicit' | 'auto'
}

function providerToolExecutionPrompt(
  request: Pick<ProviderToolRequest, 'intent' | 'prompt'>,
): string
```

## 3. Contracts

- `intent` is required, credential-safe, and at most 20,000 characters. It is
  the human-readable observation and audit summary.
- `prompt` is required, credential-safe, and at most 200,000 characters. It is
  the complete provider execution payload.
- Provider adapters use `providerToolExecutionPrompt(request)`, which returns the
  complete `request.prompt` and rejects an absent value.
- Request digests and capability leases bind the entire request, including
  `prompt`.
- The shared `providerToolRequestSchema` owns parsing for desktop and control
  protocol paths. Consumers must not create a duplicate schema.
- Provider-tool requests, plans, visual DAGs, run events, and delivery previews must
  not carry a predicted cost or budget ceiling.
- Desktop product requests always use `approvalPolicy: 'auto'`. Configuring and
  enabling a BYOK Provider is the user's standing authorization for Provider
  execution; no per-call confirmation may be inserted by a caller bridge.
- Preview remains an observable, content-addressed request closure. It may expose
  route, prompt summary, roles, inputs, limits, status and receipts, but it must
  not become an approval gate.
- Host policy may still disable Provider execution globally. A missing capability
  or disabled policy fails immediately; neither condition may be projected as a
  pending approval that a user could never resolve.
- `approvalPolicy: 'explicit'` is accepted only for protocol compatibility with
  non-desktop hosts. Product-owned desktop bridges must not emit it.
- Receipts contain execution identity, terminal status, timestamps and artifact
  bindings. They do not contain prices, charges, credits or billing evidence.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `intent` is empty or exceeds 20,000 characters | Reject before execution |
| `prompt` is absent or empty | Reject before execution |
| `prompt` exceeds 200,000 characters | Reject before execution |
| Either field contains credential-shaped content | Reject before persistence or provider access |
| `prompt` is valid | Execute with `prompt`; retain `intent` for audit |
| Desktop bridge emits `approvalPolicy: 'explicit'` | Reject as product contract drift |
| Provider capability is absent or Provider execution is disabled | Fail immediately; do not wait for approval |
| Request, plan or receipt includes predicted cost, charges, credits or a budget ceiling | Reject as contract drift |

## 5. Good / Base / Bad Cases

- Good: a generated prototype request carries `intent: "Generate Checkout"`
  plus a 45,000-character `prompt`; the observable event shows the intent and
  the provider receives the prompt immediately.
- Base: a current composer request carries both a bounded `intent` and complete
  provider `prompt`.
- Bad: a caller places the full generated prompt in `intent`, causing local
  validation to stop a valid generation before provider access.
- Bad: turn a valid BYOK request preview into a per-call confirmation dialog.

## 6. Tests Required

- Contract: parse a short intent plus a prompt over 20,000 characters; reject
  prompts above the execution limit and credential-shaped values.
- Control protocol: `tool.invoke` requires the prompt through the
  shared schema.
- Caller bridges: assert full prompts are placed in `prompt`, not `intent`.
- Executor: assert generation and editing use `prompt` and reject its absence.
- Contract and caller fixtures: assert predicted cost and budget-ceiling fields
  are absent and every product-owned desktop request is `auto`.
- Desktop loop: assert a missing capability settles as `capability-required`
  without a pending approval or an approval notification.
- Receipts: assert cost, charge, credit and billing fields are rejected.
- Run `pnpm agent:validate` after changing this contract.

## 7. Wrong vs Correct

### Wrong

```ts
desktopTools.invoke({
  intent: generatedPrompt,
  approvalPolicy: 'explicit',
})
```

### Correct

```ts
desktopTools.invoke({
  intent: 'Generate the checkout page',
  prompt: generatedPrompt,
  approvalPolicy: 'auto',
})
```
