# Implementation plan

1. Delete the two unstarted planning task records and empty obsolete release
   directory; verify active-task resolution points only to this task.
2. Remove Kimi JSON discovery/resolution and its fixtures; keep current TOML,
   env precedence, redaction, and security tests.
3. Remove `liveAgentOutput` from WorkspaceSnapshot, project repository current
   schema, fingerprinting, IntentWorkspace persistence, and obsolete restore
   tests.
4. Rename updater plain-text release-note helpers/files, remove manual notes
   input from updater generation, and require an exact catalog projection.
5. Synchronize provider, state-management, and release-pipeline specs/docs.
6. Run focused Rust/Vitest tests, stale searches, formatting, lint, TypeScript,
   full tests/build/i18n/Agent validation, and diff checks.

## Hard stops

- A current producer still emits a removed field or schema.
- Release workflow does not provide the exact catalog input.
- Any secret/path crosses IPC after the Kimi change.
- Current workspace records fail round-trip or completed Agent evidence is lost.
