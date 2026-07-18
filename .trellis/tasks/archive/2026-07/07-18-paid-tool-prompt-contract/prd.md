# Separate paid-tool intent from execution prompt

## Goal

Prevent generated visual prompts larger than 20,000 characters from being
rejected as paid-tool `intent`. Keep a bounded, human-readable intent for audit
and approval while carrying the complete model prompt in a separate field.

## Background

- `PaidToolRequest.intent` is limited to 20,000 characters in
  `src/control-protocol/paid-tool-contract.ts`.
- Both direct desktop image calls and the visual generation runtime currently
  place the full provider prompt in `intent`.
- `src/services/desktop-tool-executor.ts` then sends `request.intent` to the
  image provider.
- Prototype prompts can legitimately exceed the audit-field limit after plan,
  design-system, page, QA, and reference context are composed.
- The resulting local Zod error stops generation before any provider call.

## Requirements

### R1. Separate semantics

- `intent` remains required, human-readable, credential-safe, and bounded to
  20,000 characters for audit, approval, logs, and durable replay.
- `PaidToolRequest` gains an optional complete execution `prompt` with its own
  bounded validation contract.
- Provider execution uses `prompt` when present and otherwise uses `intent`.

### R2. Compatibility

- Existing callers and persisted requests containing only `intent` continue to
  parse and execute unchanged.
- The control protocol inherits the optional field through the shared paid-tool
  schema; no duplicate payload parser is introduced.
- Request digests and capability leases continue to bind the full request,
  including the execution prompt when present.

### R3. Generation callers

- Prototype page, design-system, region-board, and visual-runtime calls must
  pass concise audit intent separately from the complete prompt.
- Do not truncate the model prompt to fit the audit field.
- Do not simply increase the existing `intent` limit.

### R4. User-facing failure behavior

- A valid generated prompt over 20,000 characters must reach the provider
  boundary rather than surface a raw Zod error.
- Truly oversized execution payloads must still fail at the shared contract
  boundary with a deterministic validation error.

## Acceptance Criteria

- [x] A `PaidToolRequest` with short `intent` and a prompt above 20,000
      characters parses successfully.
- [x] Legacy requests without `prompt` execute with `intent` as before.
- [x] Image generation and image editing prefer `prompt` when supplied.
- [x] Direct desktop image calls and visual-runtime calls no longer place the
      full generated prompt in `intent`.
- [x] Control-protocol parsing accepts the new optional field.
- [x] Regression tests reproduce and prevent the screenshot failure.
- [x] Agent capability validation, lint, focused tests, and production build
      pass.

## Out of Scope

- Removing bounds from all protocol strings.
- Changing provider context limits or model selection.
- Persisting full execution prompts in user-visible chat or notification copy.
- Changing paid-tool approval or budget policy.
