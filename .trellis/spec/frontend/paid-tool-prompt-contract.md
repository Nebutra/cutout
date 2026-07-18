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
  prompt?: string
  inputArtifactIds: string[]
  budgetCeiling: MoneyEstimate
  approvalPolicy: 'explicit' | 'auto-within-budget'
}

function paidToolExecutionPrompt(
  request: Pick<PaidToolRequest, 'intent' | 'prompt'>,
): string
```

## 3. Contracts

- `intent` is required, credential-safe, and at most 20,000 characters. It is
  the human-readable approval and audit summary.
- `prompt` is optional, credential-safe, and at most 200,000 characters. It is
  the complete provider execution payload.
- Provider adapters use `paidToolExecutionPrompt(request)`, which returns
  `request.prompt ?? request.intent`.
- Old requests without `prompt` remain valid and execute unchanged.
- Request digests and capability leases bind the entire request, including
  `prompt` when present.
- The shared `paidToolRequestSchema` owns parsing for desktop and control
  protocol paths. Consumers must not create a duplicate schema.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `intent` is empty or exceeds 20,000 characters | Reject before approval |
| `prompt` is present but empty | Reject before approval |
| `prompt` exceeds 200,000 characters | Reject before approval |
| Either field contains credential-shaped content | Reject before persistence or provider access |
| `prompt` is absent | Execute with `intent` |
| `prompt` is present | Execute with `prompt`; retain `intent` for audit |

## 5. Good / Base / Bad Cases

- Good: a generated prototype request carries `intent: "Generate Checkout"`
  plus a 45,000-character `prompt`; approval shows the intent and the provider
  receives the prompt.
- Base: a legacy composer request carries only `intent`; provider execution is
  unchanged.
- Bad: a caller places the full generated prompt in `intent`, causing local
  validation to stop a valid generation before provider access.

## 6. Tests Required

- Contract: parse a short intent plus a prompt over 20,000 characters; reject
  prompts above the execution limit and credential-shaped values.
- Control protocol: `tool.invoke` accepts the optional prompt through the
  shared schema.
- Caller bridges: assert full prompts are placed in `prompt`, not `intent`.
- Executor: assert generation and editing prefer `prompt`, while a legacy
  request falls back to `intent`.
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
