# Add Agent response regeneration and clear stale retry errors

## Goal

Give the Agent conversation the expected message-level Regenerate action while
ensuring a new attempt immediately supersedes stale stopped-run UI, then ship
the behavior in the next signed stable desktop release.

## Background

- Completed Agent messages currently expose Copy and optional explicit actions,
  but no Regenerate control.
- Run-level Retry is a separate recovery mechanism for retryable terminal
  failures and must not be reused as a message action.
- `createAssets()` clears `runError` only after the tool gate. A conversational
  result can return from the handled branch before that cleanup, leaving the
  old red `Run stopped` item, Retry action, and `No result yet` state visible.
- The public stable release and installed app are both `0.1.3`; the target
  release for this fix is `0.1.4`.

## Requirements

- Show an icon-only Regenerate action with an accessible label and tooltip for
  the latest completed durable Agent text response.
- Keep Regenerate hidden for user messages, pending/activity messages, older
  Agent replies, errors, tool rows, and while another run is active.
- Resolve the effective source user turn for the response, including any
  `message-revised` edit, and reuse the current model, thinking, attachment,
  and web-search configuration.
- Regeneration must replace the target Agent response through durable message
  revision semantics without inserting a duplicate user bubble.
- Keep message Regenerate separate from run-level Retry/Continue and paid-tool
  Retry callbacks.
- Once a new retry or regeneration run is accepted after route/provider
  preflight, clear the stale canonical run error before the tool gate so early
  handled responses cannot preserve the old stopped state.
- Preserve current cancellation, supersession, provider preflight, and run
  lease behavior.
- Synchronize source versions to `0.1.4`, record the user-visible change, and
  publish through the existing protected signed/notarized release workflow.
- Do not overwrite unrelated worktree changes or weaken any Agent/release
  policy.

## Acceptance Criteria

- [ ] The latest completed Agent response shows one Regenerate icon with
      keyboard-accessible `Regenerate response` labeling and tooltip.
- [ ] Clicking Regenerate reruns the effective preceding user turn and updates
      the same Agent response without duplicating the user message.
- [ ] Edited user turns regenerate from their latest revision.
- [ ] Older Agent messages and all non-message feed rows have no message-level
      Regenerate control.
- [ ] Starting Retry or Regenerate removes the stale stopped summary/error row
      before tool-gate streaming; an early conversational return does not bring
      the old red card or right-pane `No result yet` state back.
- [ ] Run Retry/Continue and paid-tool Retry behavior remains unchanged.
- [ ] Focused component, projection, retry lifecycle, lint, TypeScript, full
      test, build, Rust, Agent-contract, i18n, and release validation pass.
- [ ] `v0.1.4` is published with all required platform assets and updater
      metadata, and the installed macOS app verifies as signed/notarized
      version `0.1.4`.

## Out Of Scope

- Regenerating an arbitrary older conversation turn or introducing response
  branches/variant navigation.
- Automatic background retry or resuming an interrupted provider stream.
- Changing paid-tool approval, receipt, or retry contracts.
