# Provider Discovery Evidence

## Existing Cutout Architecture

- `src/components/settings/ProviderForm.tsx` currently renders `defaultModel` before `KeyField` and uses a native `<datalist>`. Native option colors are platform-controlled and reproduce the unreadable dark-on-dark dropdown.
- `src/services/ai/list-models.ts` already calls the Rust `ai_proxy_request` boundary so stored keys do not enter the WebView, but it only handles OpenAI-compatible `{ data: [{ id }] }` catalogs and collapses every failure to `[]`.
- `src/hooks/queries/ai-settings.ts` only enables endpoint discovery for a persisted Provider with a stored key and explicit Base URL. A create-time preview needs a backend draft/session contract rather than temporarily persisting an incomplete Provider.
- `src-tauri/src/commands/ai/keys.rs` owns write-only Keychain storage. Existing IPC exposes set/status/delete/list-status, never secret readback.
- `src/services/ai/provider-service.local.ts` currently saves metadata and Keychain secret before testing; the requested UX requires a staged backend-held credential so connection/catalog validation can happen before final Provider persistence.

## Official Configuration Evidence

### Codex

The current Codex manual documents `~/.codex/config.toml` custom providers with `model_provider`, `model`, `[model_providers.<id>]`, `name`, `base_url`, `env_key`, `wire_api`, optional environment-backed headers, and command-backed auth. These are explicit LLM Provider declarations and safe discovery metadata. Command-backed auth must not be executed by Cutout during discovery.

Source: https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers

### Claude Code

Anthropic documents Provider/gateway configuration through `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, model environment variables, and optional `apiKeyHelper`. Settings can contain an `env` object. Helper commands and OAuth credentials must not be executed or extracted during discovery.

Source: https://docs.anthropic.com/en/docs/claude-code/llm-gateway

Anthropic documents that Claude Code stores credentials in encrypted macOS Keychain,
but does not publish a stable external service/account import contract on that page.
That supports Keychain as a secure storage backend, not heuristic third-party secret
extraction. Claude OAuth/session credentials are also not interchangeable with a
Provider API key.

Source: https://code.claude.com/docs/en/iam

### OpenAI and AI SDK transport selection

OpenAI calls Responses the new API primitive, continues to support Chat Completions,
and recommends Responses for new projects. The installed AI SDK's OpenAI provider
defaults to Responses since v5 and exposes explicit `provider.responses(modelId)` and
`provider.chat(modelId)` factories. Therefore protocol is a Provider capability and
persisted configuration choice, not a model-name heuristic.

Sources:

- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://ai-sdk.dev/providers/ai-sdk-providers/openai

### Cursor (removed from MVP)

Cursor documents `CURSOR_API_KEY` for Cursor CLI authentication and UI-managed BYOK keys for OpenAI, Anthropic, Google, Azure OpenAI, and Bedrock. It does not document a stable plaintext schema for those UI-managed model-provider secrets. `~/.cursor/mcp.json` contains MCP server credentials, not model Provider configuration, and must not be imported into Cutout AI Providers.

Sources:

- https://docs.cursor.com/en/cli/reference/authentication
- https://docs.cursor.com/settings/api-keys
- https://docs.cursor.com/context/model-context-protocol

## Local Shape Check

- The observed Codex config contains top-level model/Base URL fields and provider-related tables; values were not printed during research.
- The observed Claude settings expose an `env` object and model field; only JSON key paths were inspected.
- Cursor's documented config files on this host do not expose a documented LLM Provider credential schema.
- Claude project transcripts and tool caches are numerous and are explicitly excluded from discovery.

## Security Consequences

- Use an exact source/file allowlist, bounded file sizes, no recursion, no symlink following, and schema-specific parsers.
- Return only sanitized candidate metadata and credential availability/reference type.
- Resolve environment variables and literal configured secrets only inside Rust.
- Never execute `apiKeyHelper`, Codex auth commands, shell profiles, or arbitrary commands.
- Never inspect OAuth stores, browser sessions, Cursor databases, Claude transcripts, Codex logs, shell history, `.env` files, or generic MCP credentials.
- Never enumerate the full macOS Keychain. Each external Keychain source requires a reviewed adapter with exact service/account identifiers and must return availability metadata before an explicitly approved import.
- A staged opaque discovery/import session is needed if users must test a credential before committing it to the existing Provider id and Keychain entry.
- The guaranteed Keychain adapter set initially covers Cutout's exact current and
  legacy service/account schemes already implemented in `keys.rs`. Claude/Codex
  private Keychain import remains unsupported until exact identifiers and credential
  semantics are documented and fixture-tested.
- Existing OpenAI-compatible records need a deterministic Chat Completions migration
  to preserve behavior, while official OpenAI records can normalize to Responses.
