# Implementation plan

1. Remove public Queue entry points, documentation, AppShell wiring, and the
   Queue action/dispatcher implementation.
2. Remove native Queue commands, invoke registration, permissions, and stale
   visual-test mocks.
3. Remove the now-orphaned semantic-slices experiment and production adapter,
   retaining unrelated current semantic naming behavior.
4. Move current diagnostics to a neutral module and update all live consumers.
5. Remove `@types/uuid`, regenerate `pnpm-lock.yaml`, and search for residual
   Queue/semantic experiment identifiers.
6. Update Agent safety specs and active docs to state the supported external
   control surface without a legacy fallback.
7. Run focused TypeScript/Rust tests for affected boundaries, then full lint,
   TypeScript, Vitest, Rust, build, i18n, Agent validation, release validation,
   bundle-size gate, and `git diff --check`.
8. Review the final deletion inventory, confirm required migration paths remain,
   commit owned changes, merge directly to `main`, and archive the task.

## Risk And Rollback Points

- Do not delete persisted-data migrations merely because their names contain
  `legacy`.
- Do not remove or rename current diagnostic bundle fields.
- Do not leave Tauri commands registered without permissions or permissions for
  deleted handlers.
- Do not edit generated plugin runtime unless Agent contract validation proves
  a source contract changed.
- The semantic naming fallback in `IntentWorkspace` is current UI behavior and
  is not part of the semantic-slices experiment deletion.
