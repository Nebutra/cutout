# Retry interrupted Agent runs

## Goal

Let users recover from an Agent run interrupted by a temporary network or
upstream-provider failure without retyping the original request.

## Background

- `AgentWorkspaceDock` already renders a retry action below the latest error
  row when an `onRetry` callback is supplied.
- `IntentWorkspace` currently supplies `onRetry` only when a material repair
  plan exists, so a fresh run stopped by a network outage shows no action.
- The existing generation error normalization already distinguishes common
  timeout, request, network, and fetch failures from credential errors.

## Requirements

- Show a compact `Retry` action directly below the latest stopped-run error
  row for retryable transport and temporary upstream failures.
- Retry the original submitted brief through the normal `createAssets`
  pipeline after the connection recovers; do not duplicate or mutate the
  failed run in place.
- Keep the existing material repair action and its `Continue` label unchanged.
- Do not offer the network retry action for cancellation, invalid credentials,
  missing material, validation/configuration failures, or policy denial.
- Disable retry while another run is active and preserve existing completed
  artifacts through the pipeline's current repair/recovery behavior.
- Keep the existing error detail visible and retain accessible button naming.

## Acceptance Criteria

- [ ] A stopped run with a normalized timeout/network/fetch/temporary-service
      error renders one `Retry` button below the error row.
- [ ] Clicking `Retry` starts a new run with the same brief and current route
      settings when no run is active.
- [ ] Non-retryable stopped errors do not render the network retry action.
- [ ] Existing repair-plan retries still render `Continue` and use repair mode.
- [ ] Unit coverage proves visibility, callback wiring, and exclusion cases.
- [ ] Lint and TypeScript checks pass.

## Out Of Scope

- Automatic background retry or reconnect loops.
- Resuming an in-flight provider stream from a partial token offset.
- Retrying paid tool calls without the existing request/receipt safeguards.
