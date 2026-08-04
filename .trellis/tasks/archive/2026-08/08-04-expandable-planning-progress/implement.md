# Implementation plan

1. Add a closed preparation-stage projection to the Agent view model and cover
   observed, waiting, terminal, and legacy event shapes.
2. Split the Codex tool-gate preparation lifecycle into context, runtime,
   response, and validation events; keep reconnect detail bounded and close the
   active phase on error/cancellation.
3. Render an accessible expandable progress list inside the compact activity
   bubble using existing Lucide status icons.
4. Update focused orchestration, view-model, and Agent dock tests.
5. Run focused Vitest, TypeScript, lint, production build, Agent contract
   validation, and `git diff --check`.

## Risk and rollback

- Risk: duplicate terminal events can leave a later row falsely running. Keep
  one active phase variable and one close helper inside the orchestration call.
- Risk: historical single preparation steps could gain fake future rows. Only
  show the breakdown when a reviewed phase suffix is present.
- Rollback: restore the single preparation step emission; the view model then
  falls back to the existing compact bubble automatically.
