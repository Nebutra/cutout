# Custom provider protocol families implementation

1. Generalize the TypeScript and Rust wire-protocol enums and default helpers,
   preserving the persisted JSON field and old string values.
2. Expand registry metadata and ProviderForm options; rename only the
   user-facing custom provider label.
3. Make base URL normalization, SDK adapter selection, and model parsing
   protocol-aware for the four supported families.
4. Carry the validated protocol through buffered and streaming Tauri proxy
   calls; derive auth headers in Rust from protocol while retaining kind-based
   host policy.
5. Update provider draft validation/import/check flows and reject unsupported
   kind/protocol combinations before network access.
6. Add exhaustive TypeScript and Rust tests for defaults, round trips, auth,
   URLs, adapters, model catalogs, and legacy configurations.
7. Update affected user-facing docs/specs and generated locale catalogs. Change
   `cutout.agent-capabilities.json` only if the existing boundary wording would
   otherwise be false, then run `pnpm agent:validate`.
8. Run focused tests, lint, TypeScript build, Rust tests, and provider visual
   tests; update only intended snapshots.

## Risk Points

- Never route custom Anthropic/Google protocols through the current Bearer-only
  `openai-compatible` auth branch.
- Do not change host allowlisting or permit arbitrary headers/query secrets.
- Keep old `openai-compatible` records without a wire value on Chat
  Completions.
- Ensure both streaming and buffered proxy commands receive the same protocol.
- Keep provider connection checks honest: model listing and generation adapter
  must use compatible auth/base rules.
