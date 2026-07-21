# Implementation plan

1. Remove parameter UI components, settings row, empty-state actions, and their
   imports/render sites.
2. Remove store mutation actions, UI range metadata, parameter-only auto-run
   hook, and parameter-dependent debounce logic.
3. Normalize legacy restore input to internal defaults and update tests.
4. Remove AI-native parameter action schema, execution branches, snapshot field,
   and validation helpers; add rejection tests.
5. Run Lingui extraction and remove obsolete catalog entries.
6. Run focused tests, TypeScript, lint, i18n checks, `pnpm agent:validate`, and
   broader tests appropriate to affected frontend behavior.
7. Review the final diff against the PRD and verify unrelated dirty files were
   not modified.

## Focused validation

```bash
pnpm vitest run src/hooks/useAutoRun.test.tsx src/services/ai-native/actions.test.ts src/store
pnpm lint
pnpm typecheck
pnpm agent:validate
```

Use the exact package scripts available in `package.json` if script names differ.
