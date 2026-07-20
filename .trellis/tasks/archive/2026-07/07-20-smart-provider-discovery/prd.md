# Smart Provider Discovery and Model Catalog

## Goal

Make Provider setup fast, secure, and deterministic. Cutout should reuse supported
local Provider metadata and credentials without exposing secrets, validate the
connection before persistence, discover reachable models, and make model selection
the final step.

## Background

The current editor asks for a model before the connection is established, uses a
native `datalist` whose options are unreadable in dark mode, and persists an
incomplete Provider before testing it. Generation also silently routes every
`openai-compatible` Provider through Chat Completions, even though OpenAI and the
installed AI SDK support a distinct Responses transport.

Relevant code:

- `src/components/settings/ProviderForm.tsx`
- `src/services/ai/list-models.ts`
- `src/services/ai/provider-adapter-registry.ts`
- `src/services/ai/provider-types.ts`
- `src-tauri/src/commands/ai/keys.rs`
- `src-tauri/src/commands/ai/providers.rs`

## Product Requirements

### R1. Supported discovery sources

- Discover Provider metadata from the exact supported Codex and Claude Code config
  files and from an allowlist of Provider-specific process environment variables.
- Cursor discovery is not part of this release.
- Recognize stable OS credential stores through explicit adapters only. An adapter
  must specify an exact, reviewed service/account schema owned by Cutout or publicly
  documented by the source application.
- The initial guaranteed Keychain adapters are Cutout's current
  `com.nebutra.cutout / provider:{id}` records and its existing read-only legacy
  migration source `com.leishi.cutout / provider:{id}`.
- Do not claim automatic import from Claude Code's or Codex's private Keychain
  records unless their exact identifiers and credential semantics are documented
  and covered by fixtures. Their documented use of Keychain alone is insufficient.
- Never enumerate the user's Keychain, recursively scan the home directory, parse
  shell history, execute credential helpers, or inspect OAuth/browser sessions.

### R2. Secret-safe discovery and import

- Rust owns file parsing, environment lookup, Keychain access, connection testing,
  model discovery, and final Keychain persistence.
- Discovery returns sanitized metadata and an opaque candidate id. It never returns
  a credential-shaped value to JavaScript.
- The preview identifies source application, sanitized config location, Provider,
  Base URL, wire protocol, model hint, credential source type, environment-variable
  name when applicable, and availability state.
- Import is explicit, never silently overwrites an existing Provider, and copies an
  imported secret into Cutout's own Keychain namespace only after approval.
- Literal secrets found in an allowlisted config may be held only in a short-lived,
  process-local Rust discovery session; they must not be logged, serialized, or
  persisted before import.
- OAuth/session credentials are not imported as API keys.

### R3. Provider-first configuration flow

The editor order is:

1. Provider identity and kind.
2. Base URL and Provider-specific transport options.
3. Credential source or manual API key.
4. Explicit connection/catalog check.
5. Reachable model selection.
6. Save.

- Creating a Provider must not persist metadata or a secret merely to test it.
- Changing kind, Base URL, wire protocol, or credential invalidates the prior test
  result and model catalog.
- Model selection remains disabled until the current draft has been checked.
- Catalog-unsupported Providers expose a deliberate manual-model fallback. Network,
  authentication, unsupported-catalog, and malformed-response errors remain distinct.

### R4. Explicit OpenAI wire protocol

- Persist a generation transport independent of Provider kind and model id.
- Supported OpenAI-shaped values are `responses` and `chat-completions`.
- Official OpenAI defaults to `responses`, matching OpenAI's recommendation for new
  projects and AI SDK 5+ behavior.
- Known compatible Provider definitions declare a reviewed default based on their
  documented support. Custom `openai-compatible` connections require the user to
  confirm the protocol; the UI may recommend `chat-completions` for broad ecosystem
  compatibility but may not silently infer it from the model name.
- Imported Codex `wire_api` is preserved when supported. Unsupported values fail
  closed instead of being coerced.
- Generation adapters call `provider.responses(modelId)` or
  `provider.chat(modelId)` according to the persisted value.
- Model listing remains a separate capability; `/models` success does not prove that
  either generation protocol works.

### R5. Model catalog and readable UI

- After credential validation, query the Provider-specific model-list adapter and
  normalize ids into the existing model catalog/provenance layer.
- Replace the native `datalist` with the repository's themed Radix Select/command
  pattern so option, hover, selected, focus, and disabled states are readable in
  dark mode.
- Preserve an explicit searchable/manual escape hatch when a Provider legitimately
  cannot list models.

### R6. Compatibility and contract consistency

- Existing Provider records without a wire protocol migrate deterministically:
  official OpenAI to `responses`; existing OpenAI-compatible records to
  `chat-completions`, preserving current behavior.
- Keep TypeScript schemas, Rust serde structs, persistence, generation adapters,
  Agent actions, tests, and user-facing documentation synchronized.
- If the Agent surface contract changes, update the corresponding CLI/MCP/protocol
  documentation and validate with `pnpm agent:validate` as required by `AGENTS.md`.

## Security Constraints

- Exact source/file allowlist, bounded file size, schema-specific parser, no symlink
  following, no parent traversal, and no caller-supplied paths.
- Prefer environment-variable references over copying literal credentials.
- No raw secret in React state beyond the existing transient manual-entry field; no
  raw secret in Query/Zustand state, IPC responses, logs, diagnostics, analytics,
  project state, or error messages.
- Backend drafts have opaque random ids, short TTLs, bounded capacity, single-use
  import semantics, and explicit cancellation/cleanup.
- Network checks continue through the existing Rust proxy and its host policy.

## Acceptance Criteria

The implementation slice below is complete with the automated and code-inspection
evidence recorded in `implement.md`.

- [x] Codex and Claude fixtures produce deterministic sanitized candidates without
      returning credential values.
- [x] Cutout current and legacy Keychain records are detected through exact lookup;
      no generic Keychain enumeration exists.
- [x] Unsupported private Keychain formats are reported honestly and are not guessed.
- [x] Malformed configs, oversized files, symlinks, unknown paths, unsupported auth
      helpers, and unsupported wire protocols fail closed.
- [x] A new Provider can be tested and its models listed before Provider metadata or
      a secret is persisted.
- [x] Changing any connection-defining field invalidates verification and models.
- [x] Official OpenAI uses Responses; migrated compatible Providers preserve Chat
      Completions; custom compatible Providers expose an explicit protocol choice.
- [x] Generation adapter tests prove both `/responses` and `/chat/completions` paths.
- [x] Model list errors distinguish missing credential, unauthorized, unreachable,
      unsupported catalog, and malformed response without echoing secrets.
- [x] The model control is last, populated from the tested draft, readable in dark
      mode, and offers manual entry only when explicitly selected/required.
- [x] Existing Provider CRUD, Keychain migration, model routing, and Agent action
      tests remain green.
- [x] `pnpm agent:validate` passes when Agent-facing contracts are touched.

## Deferred Follow-up

`07-20-provider-distribution-validation` owns real current/legacy OS Keychain
fixtures, packaged desktop discover-to-generate evidence with secret inspection, and
the final repository-wide plugin rebuild/validation after concurrent source owners
settle. None of those environment/distribution gates are claimed as passed by this
parent task.

## Out of Scope

- Cursor Provider discovery.
- Importing Claude/Codex OAuth sessions, browser cookies, subscription tokens, or
  proprietary credential databases.
- Executing `apiKeyHelper`, Codex auth commands, shell profiles, or arbitrary commands.
- Recursive filesystem, `.env`, transcript, cache, MCP credential, or shell-history
  discovery.
- Automatically testing every discovered credential or importing without review.
- Cloud synchronization of Provider settings.
