# Implementation plan

1. Add the pinned 39-Agent Rust registry and invariant tests.
2. Add bounded executable/app/root probes with installer-safe classification.
3. Add sanitized inventory DTOs and a Tauri command/permission entry.
4. Add TypeScript schema/service wrappers that reject unknown secret fields.
5. Adapt Codex/Claude installation metadata without changing import behavior.
6. Add Rust and frontend fixtures for all inventory/capability states.
7. Run focused tests, type-check, lint, `pnpm agent:validate`, build boundary,
   and `git diff --check`.

Do not add API-key parsing for new Agents or any CLI execution adapter in this
child; those belong to later children.
