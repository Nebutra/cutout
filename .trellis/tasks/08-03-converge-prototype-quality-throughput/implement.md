# Implementation plan

1. Replace the partial hard allowlist with a shared model-evidence + adapter
   route assessment and independent fidelity recommendation tier.
2. Make automatic setup, desktop capability projection, Design System
   conditioning, page generation, and preflight consume that assessment; add
   truthful Provider-specific edit adapters only where the existing API path can
   be implemented and tested.
3. Add strict page/resource review evidence contracts with backward-compatible
   persistence decoding.
4. Make page review return the reviewed artifact, persist exact-byte review
   evidence, and update page-generation concurrency tests.
5. Project completed production QA into resource-pack bindings; replace the
   unconditional delivery review claim with truthful aggregation and digests.
6. Preserve synchronous human suite selection across background publishes,
   stop sibling progress from replacing the singular projection, reassert the
   selected resource authority, and add a generating-sibling regression.
7. Allow ready Design System selection after partial candidate failure while
   retaining targeted Retry for failed siblings.
8. Replace the direct-then-board barrier with one bounded mixed-work scheduler;
   prove overlap, total concurrency <= 3, exact outputs, and retry behavior.
9. Update the prototype-generation and BYOK Provider specs, packaged E2E
   evidence contract/tests, and any user-visible copy snapshots.
10. Run focused tests, `pnpm agent:validate`, lint, type-check, production build,
   full relevant Vitest, and `git diff --check`.
11. Dispatch an independent Trellis check agent, resolve every verified finding,
    then commit and integrate into `main` without overwriting the user's dirty
    worktree.

## Risk and rollback points

- Persistence schema changes must remain additive; reject any implementation
  that makes historical workspace recovery fail.
- Review overlap must join every review before returning; downstream production
  must never consume an unreviewed newly generated page.
- Mixed scheduling must use one limiter. Two independent pools are a rollback
  condition because they would double Provider concurrency.
- Complete suite parallelism is forbidden in this task because shared store
  revisions would make completion nondeterministic.

## Validation commands

```bash
pnpm vitest run src/services/ai/automatic-ai-setup.test.ts src/agent-runtime/composer-execution.test.ts src/prototype/page-generation.test.ts src/prototype/prototype-suite-candidates.test.ts src/prototype/delivery-evidence.test.ts src/prototype/resource-pack-production.test.ts src/components/workspace/prototype-all-routes.e2e.test.tsx src/packaged-e2e/runner.test.ts
pnpm agent:validate
pnpm lint
pnpm exec tsc -b --pretty false
pnpm build
git diff --check
```
