# Paid-Tool Intent And Prompt Contract

## 1. Scope / Trigger

Use this contract for every paid image generation or editing request. Audit and
approval text must remain bounded and human-readable even when the provider
needs a much larger generated prompt.

## 2. Signatures

```ts
interface PaidToolRequest {
  capability: 'generate-image' | 'edit-image' | 'cutout'
  intent: string
  prompt: string
  inputArtifactIds: string[]
  approvalPolicy: 'explicit' | 'auto'
}

interface PaidToolReceipt {
  charged?: MoneyAmount
}

function paidToolExecutionPrompt(
  request: Pick<PaidToolRequest, 'intent' | 'prompt'>,
): string
```

## 3. Contracts

- `intent` is required, credential-safe, and at most 20,000 characters. It is
  the human-readable approval and audit summary.
- `prompt` is required, credential-safe, and at most 200,000 characters. It is
  the complete provider execution payload.
- Provider adapters use `paidToolExecutionPrompt(request)`, which returns the
  complete `request.prompt` and rejects an absent value.
- Request digests and capability leases bind the entire request, including
  `prompt`.
- The shared `paidToolRequestSchema` owns parsing for desktop and control
  protocol paths. Consumers must not create a duplicate schema.
- Paid-tool requests, plans, visual DAGs, run events, and delivery previews must
  not carry a predicted cost or budget ceiling.
- Desktop product requests always use `approvalPolicy: 'explicit'`. No desktop
  preference or local-storage value may enable automatic continuation.
- The desktop visual bridge enforces explicit approval at its boundary even if
  an upstream shared visual task carries `approvalPolicy: 'auto'`.
- `approvalPolicy: 'auto'` remains available to an authorized shared host
  policy. It authorizes by host policy, never by a predicted-cost threshold.
- `receipt.charged` is optional post-execution evidence. It may be present only
  when the executor can bind it to verifiable Provider billing evidence; it
  must never be copied or derived from a request, plan, model, or capability.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `intent` is empty or exceeds 20,000 characters | Reject before approval |
| `prompt` is absent or empty | Reject before approval |
| `prompt` exceeds 200,000 characters | Reject before approval |
| Either field contains credential-shaped content | Reject before persistence or provider access |
| `prompt` is valid | Execute with `prompt`; retain `intent` for audit |
| Request or plan includes predicted cost or a budget ceiling | Reject as contract drift |
| `receipt.charged` lacks verifiable Provider billing evidence | Omit `charged`; never infer a value |

## 5. Good / Base / Bad Cases

- Good: a generated prototype request carries `intent: "Generate Checkout"`
  plus a 45,000-character `prompt`; approval shows the intent and the provider
  receives the prompt.
- Base: a current composer request carries both a bounded `intent` and complete
  provider `prompt`.
- Good: a Provider returns verifiable billing evidence after execution and the
  receipt records the actual `charged` amount.
- Bad: a caller places the full generated prompt in `intent`, causing local
  validation to stop a valid generation before provider access.
- Bad: derive `receipt.charged` from model metadata or a preflight estimate.

## 6. Tests Required

- Contract: parse a short intent plus a prompt over 20,000 characters; reject
  prompts above the execution limit and credential-shaped values.
- Control protocol: `tool.invoke` requires the prompt through the
  shared schema.
- Caller bridges: assert full prompts are placed in `prompt`, not `intent`.
- Executor: assert generation and editing use `prompt` and reject its absence.
- Contract and caller fixtures: assert predicted cost and budget-ceiling fields
  are absent, desktop requests are explicit, and shared host policy may use
  `auto`.
- Receipts: assert `charged` is absent without verifiable Provider billing
  evidence and preserves the actual amount when such evidence exists.
- Run `pnpm agent:validate` after changing this contract.

## 7. Wrong vs Correct

### Wrong

```ts
desktopTools.invoke({
  intent: generatedPrompt,
})
```

### Correct

```ts
desktopTools.invoke({
  intent: 'Generate the approved checkout page',
  prompt: generatedPrompt,
})
```
