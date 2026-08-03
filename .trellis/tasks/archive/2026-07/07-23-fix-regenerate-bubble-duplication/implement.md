# Implementation plan

1. Separate durable conversation selection from preparation lifecycle
   selection in `agent-view-model.ts`.
2. Add a focused helper that returns at most one unresolved preparation event
   from the active run, and apply live-message precedence in `buildFeed()`.
3. Replace the test that codifies terminal preparation bubbles with lifecycle
   regressions for running, live, succeeded, failed, cancelled, repeated-run,
   and response-branch states.
4. Strengthen the regeneration workspace E2E test to assert one activity bubble
   during preparation and zero after completion while retaining durable
   `step-succeeded` evidence and branch navigation assertions.
5. Run focused tests, lint, TypeScript, full tests, build,
   `pnpm agent:validate`, and `git diff --check`.
6. Perform a repeated-bug retrospective, update the owning frontend spec with
   the durable-event versus ephemeral-projection invariant, commit, push, and
   open the fix for integration.

## Risk And Rollback Points

- Do not filter preparation events out of persistence or the execution
  timeline; only the conversation feed projection changes.
- Do not infer run completion from `activeRunId`, which remains populated for
  terminal projections. Gate ephemeral display with current `working` state and
  unresolved lifecycle state.
- Do not change response selection or regeneration target resolution.
