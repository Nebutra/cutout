# Show Retry for service unavailable Agent runs

## Goal

Display the Agent run `Retry` action for transient provider messages such as
`Service temporarily unavailable`, including after reopening a persisted
project.

## Background

- `classifyGenerationError("Service temporarily unavailable")` already returns
  `{ kind: "transient", retryable: true }`.
- `AgentWorkspaceDock` already renders one Retry button below the latest error
  when an `onRetry` callback is supplied.
- `IntentWorkspace` persists and restores `runError`, but
  `retryableRunBrief` is ephemeral React state initialized to `null`.
- A reopened failed project therefore shows the stopped error but supplies no
  Retry callback, matching the reported screenshot.

## Requirements

- Derive a retryable run brief from the current restored error and current
  project brief when no explicit in-session retry brief is available.
- Keep explicit in-session retry state authoritative when present.
- Start Retry as a new normal create run with the original/current project
  brief; do not mutate or resume the stopped run.
- Keep repair-plan `Continue` precedence and active-run suppression unchanged.
- Do not expose Retry for cancellation, credentials, material, policy,
  configuration, unknown failures, or tool-level paid-action retries.
- Keep the action attached to the latest error row and retain its accessible
  `Retry` label.

## Acceptance Criteria

- [ ] A restored `Service temporarily unavailable` run with a non-empty brief
      produces one run-level Retry callback.
- [ ] Clicking Retry starts `createAssets("create", { briefOverride })` with
      the preserved brief.
- [ ] Non-retryable restored errors do not produce a run-level Retry callback.
- [ ] Repair `Continue`, active-run suppression, and existing transient
      in-session retry behavior remain unchanged.
- [ ] Unit regression coverage, focused workspace tests, lint, TypeScript, and
      diff checks pass.

## Out Of Scope

- Automatic background retry or stream resumption.
- Persisting a second copy of the brief inside `WorkspaceSnapshot`.
- Changing paid-tool request/receipt retry behavior.
