# Implementation plan

1. Add a crate-private shared exact-file/root guard and adapter registry without
   changing the public Tauri command names.
2. Refactor existing Claude/Codex discovery into adapters and restore Codex
   `auth.json.OPENAI_API_KEY` compatibility with OAuth/helper negative tests.
3. Add fixture-backed OpenCode and Pi adapters with explicit `api` / `api_key`
   discriminants and closed provider mappings.
4. Add OMP exact JSON/YAML readers and metadata-only SQLite classification;
   never select or import opaque credential payloads.
5. Add Gemini, Qwen, Kimi, and Mistral Vibe adapters for their reviewed literal
   or allowlisted environment API-key shapes.
6. Bind candidate discovery and secret resolution to the same adapter/source
   descriptor so check/import re-read and reject stale or changed sources.
7. Mark the nine reviewed inventory entries as credential-adapter supported;
   keep the other 30 and all session delegation unsupported.
8. Tighten the TypeScript candidate schema for stable Agent source IDs,
   sanitized locations/references, closed credential types, and unknown-field
   rejection without changing the existing settings workflow.
9. Add positive, absent, malformed, oversized, symlink, unknown-schema,
   helper-command, OAuth/session, secret-redaction, stale-candidate, and
   persistence-rollback tests for every enabled adapter.
10. Run `cargo fmt --check`, `cargo test commands::ai::`, focused Vitest,
    `pnpm exec tsc -b --pretty false`, `pnpm lint`, `pnpm agent:validate`,
    `pnpm build`, and `git diff --check`.

## Review gates

- Do not accept a generic map walker that imports fields named `key`, `token`,
  or `secret` without the adapter's schema discriminator.
- Do not execute helpers, CLIs, shells, package managers, or dotenv expansion.
- Do not serialize an absolute root, secret value, token fragment, helper text,
  or SQLite credential payload.
- Do not modify session-delegation or settings/i18n behavior in this child.
- If official evidence does not support an exact field/provider mapping, leave
  that source non-importable and document the gap rather than guessing.

## Rollback points

- Commit/refactor the shared adapter boundary before enabling new adapters.
- Adapters are individually removable through registry registration and
  capability flags; existing persisted providers remain usable.
- Preserve the current provider-draft and atomic persistence contracts so the
  entire adapter batch can be reverted without a data migration.
