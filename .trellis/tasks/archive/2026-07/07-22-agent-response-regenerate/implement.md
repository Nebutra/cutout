# Implementation plan

1. Add a pure durable-event selector for the latest regeneratable Agent
   response and its effective source user text, including revisions.
2. Extend `AgentWorkspaceDock` with an icon-only message Regenerate action,
   active-run suppression, tooltip/accessibility behavior, and focused tests.
3. Extend the conversational tool-gate path so a rerun can reuse an existing
   user turn and revise a target Agent event instead of appending duplicate
   conversation bubbles.
4. Move stale `runError` cleanup to the accepted-run boundary before the tool
   gate, retaining preflight errors and existing lease cancellation behavior.
5. Add projection and workspace regression coverage for revised Agent
   messages, edited source turns, callback separation, and early handled
   retry cleanup.
6. Run focused Vitest, lint, TypeScript, full tests, build, i18n, Rust checks,
   `pnpm agent:validate`, and `git diff --check`.
7. Update the Agent safety spec and changelog, synchronize versions to `0.1.4`,
   rerun release validation, commit only owned changes to `main`, and push.
8. Create and push immutable tag `v0.1.4`, monitor the release workflow until
   publication, verify assets/metadata, then reinstall the arm64 DMG and verify
   version, signature, Gatekeeper, notarization ticket, and process path.

## Risk And Rollback Points

- Do not change the paid-tool retry path or approval contracts.
- Do not emit revisions for a target that is not a durable Agent message.
- Do not clear errors before route/provider preflight has accepted the new
  attempt.
- Exclude unrelated notification, updater capability, release documentation,
  and existing Trellis changes from commits.
