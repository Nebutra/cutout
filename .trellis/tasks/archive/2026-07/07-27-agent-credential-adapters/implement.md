# Implementation plan

1. Add shared exact-reader, binding, internal candidate/selector, and adapter
   registry modules; wire the inventory registry to adapter kinds.
2. Refactor existing Claude/Codex logic without changing compatibility; retain
   Codex auth-only, config-env, auth fallback, OAuth-negative, and legacy tests.
3. Add OpenCode and Pi typed adapters with explicit tagged unions and closed
   provider mappings.
4. Add OMP Pi-compatible JSON and reviewed YAML adapters; keep SQLite payloads
   excluded from API-key resolution.
5. Add Gemini, Qwen, Kimi, and Vibe adapters for reviewed literal or allowlisted
   environment shapes.
6. Bind discovery, check, and import to the same source revision/provider
   contract and reject stale source or endpoint changes.
7. Mark only the nine passing inventory entries as credential supported and
   keep all session delegation unsupported.
8. Tighten TypeScript candidate validation for stable Agent/source/schema IDs,
   sanitized labels/references, credential classes, and unknown-field rejection.
9. Add shared and adapter-specific security/compatibility fixtures described in
   `research/tier-a-adapter-contract.md`.
10. Run `cargo fmt --check`, `cargo test commands::ai::`, focused Vitest,
    `pnpm exec tsc -b --pretty false`, `pnpm lint`, `pnpm agent:validate`,
    `pnpm build`, and `git diff --check`.

## Review gates

- No generic key/token field walker or parser-by-regex.
- No Agent/helper/shell/package-manager execution.
- No absolute path, secret, helper text, OAuth bytes, or SQLite payload in IPC.
- No session-delegation or settings/i18n behavior in this child.
- Leave unsupported any field/provider mapping lacking pinned evidence.
