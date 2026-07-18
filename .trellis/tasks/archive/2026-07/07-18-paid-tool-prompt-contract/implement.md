# Implementation Plan

1. Add the optional execution prompt and shared effective-prompt projection to
   the paid-tool contract.
2. Update desktop invocation types and both visual caller paths to separate
   concise audit intent from full prompt.
3. Update the desktop executor to use the effective prompt for generate/edit.
4. Add protocol, executor, bridge, and long-prompt regressions, preserving old
   request fixtures.
5. Search CLI/MCP/protocol consumers for duplicate field assumptions and run
   `pnpm agent:validate`.
6. Run lint, focused tests, full relevant tests, and production build.

## Risky Files

- `src/control-protocol/paid-tool-contract.ts`
- `src/services/desktop-tool-executor.ts`
- `src/agent-runtime/use-desktop-tool-loop.ts`
- `src/visual-generation/desktop-tool-bridge.ts`
- `src/components/workspace/IntentWorkspace.tsx`

## Validation

```bash
pnpm lint
pnpm vitest run src/control-protocol src/services/desktop-tool-executor.test.ts src/visual-generation src/prototype/visual-task.test.ts
pnpm agent:validate
pnpm build
```

## Rollback

Remove the optional field and caller projection. Existing `intent` fallback
means no persisted-data migration or rollback transform is required.
