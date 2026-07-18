# Technical Design

## Contract

Extend the shared request schema:

```ts
interface PaidToolRequest {
  intent: string       // required audit summary, <= 20,000 chars
  prompt?: string      // complete execution payload, <= 200,000 chars
  // existing routing, artifact, budget, and approval fields remain unchanged
}
```

The execution projection is centralized:

```ts
effectivePaidToolPrompt(request) => request.prompt ?? request.intent
```

The optional-field fallback preserves every old request and persisted record.

## Data Flow

```text
Generated prototype prompt
  -> concise audit intent + complete prompt
  -> PaidToolRequest schema/digest/approval
  -> DesktopToolExecutor
  -> effectivePaidToolPrompt(request)
  -> image provider
```

The complete prompt remains bound into the existing request digest and
capability lease. Audit UI and policy continue to consume the short intent.

## Caller Migration

- `useDesktopToolLoop.invoke` accepts an optional `prompt`; composer callers
  without it remain unchanged.
- `invokeDesktopImageTool` sends its human-readable label as `intent` and the
  generated payload as `prompt`.
- `createDesktopVisualToolInvoker` constructs a concise task/node audit intent
  and sends `invocation.prompt` through the new field.
- The executor uses the shared effective-prompt helper for both generation and
  editing.

## Validation

- Keep `intent` at 20,000 characters.
- Bound `prompt` at 200,000 characters to prevent unbounded protocol payloads
  while allowing an order of magnitude more generated context.
- Apply the existing credential-shaped-content guard to both fields.
- Reject empty prompt strings when the optional field is present.

## Compatibility And Rollback

- Old request JSON remains valid because `prompt` is optional.
- New code can roll back by omitting `prompt`; executor fallback remains
  identical to current behavior.
- No storage migration is required.

## Risks

- A caller may accidentally keep sending the full prompt as intent. Regression
  tests must inspect the request shape at both caller paths.
- A consumer may continue reading `request.intent`. A repository-wide search
  and executor regression test guard the shared projection.
- Full prompts are larger digest inputs, but they are already held in memory
  and hashing is linear and bounded.
