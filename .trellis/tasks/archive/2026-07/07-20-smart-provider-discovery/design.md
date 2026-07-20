# Technical Design

## Architecture

Provider discovery is a Rust-owned capability with a small typed frontend client.
The WebView receives only sanitized candidates, verification state, normalized model
ids, and opaque draft ids. Existing persisted Provider configuration and Cutout
Keychain storage remain the final source of truth after import.

```text
allowlisted config/env/exact Keychain adapter
                 |
          Rust source parsers
                 |
       opaque draft session (TTL)
          /             \
 sanitized preview     Rust proxy check + model adapter
          \             /
          explicit import
                 |
 providers.json + Cutout Keychain
                 |
 generation adapter selected by persisted wire protocol
```

## Data Contracts

### Provider configuration

Add a persisted optional-at-read, required-after-normalization field:

```ts
type OpenAIWireProtocol = 'responses' | 'chat-completions'

interface ProviderConfig {
  // existing fields
  wireProtocol?: OpenAIWireProtocol
}
```

The normalized in-memory config always resolves a protocol for OpenAI-shaped
Providers. Rust migration rules mirror TypeScript rules so either boundary produces
the same result. Non-OpenAI protocols remain expressed by Provider kind/adapter and
do not receive this field in the first change.

Provider definitions gain reviewed protocol metadata, rather than deriving protocol
from model ids:

```ts
openAIWireProtocols?: readonly OpenAIWireProtocol[]
defaultOpenAIWireProtocol?: OpenAIWireProtocol
```

### Sanitized discovery candidate

```ts
interface ProviderDiscoveryCandidate {
  id: string                 // opaque, process-local
  source: 'codex' | 'claude' | 'environment' | 'cutout-keychain'
  sourceLabel: string
  configLocation?: string    // sanitized, known location label
  kind: ProviderKind
  label: string
  baseUrl?: string
  wireProtocol?: OpenAIWireProtocol
  modelHint?: string
  credential: {
    type: 'environment' | 'keychain' | 'config-literal' | 'none'
    reference?: string       // env name or reviewed adapter label, never value
    available: boolean
    importable: boolean
  }
  warnings: readonly DiscoveryWarning[]
}
```

### Draft lifecycle

Rust exposes commands equivalent to:

- `discover_provider_candidates()` -> sanitized candidates.
- `create_provider_draft(candidateId | manual metadata)` -> opaque draft id and
  sanitized draft summary.
- `update_provider_draft(draftId, nonSecretPatch, optional manual secret)` -> updated
  summary; secret accepted as an input only and retained backend-side.
- `check_provider_draft(draftId)` -> structured connection/catalog result.
- `import_provider_draft(draftId, selectedModel, overwritePolicy)` -> persisted
  non-secret Provider plus Keychain copy; consumes draft.
- `cancel_provider_draft(draftId)` -> cleanup.

To minimize secret lifetime, config/env/Keychain candidates need not eagerly read the
secret. The candidate stores a reviewed resolver descriptor; the check/import command
resolves it server-side. Literal allowlisted config secrets may be copied into the
bounded draft store only when unavoidable.

## Discovery Adapters

### Codex

Parse only the supported `CODEX_HOME/config.toml` or default `~/.codex/config.toml`.
Read model provider metadata including `name`, `base_url`, `env_key`, `wire_api`, and
model hint. Accept only supported wire values. Record command-backed auth as
unsupported; never execute it. Resolve `env_key` from the current process only.

Codex CLI login credentials are not Provider API keys by assumption. Even when Codex
stores auth in a keyring, Cutout does not import it without a documented exact record
contract and compatible credential semantics.

### Claude Code

Parse only the supported user settings file and allowlisted `env` keys such as
`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_AUTH_TOKEN`. Treat bearer
token and API-key header semantics distinctly in the backend credential descriptor.
Never execute `apiKeyHelper`. Claude Code OAuth credentials in macOS Keychain are out
of scope because the public documentation states the storage backend but not a stable
service/account import contract, and OAuth is not interchangeable with a Provider API
key.

### Environment

Provider definitions own an allowlist of environment variable names and header
semantics. Discovery checks presence in Rust and returns only the variable name and
availability. It does not forward the value.

### Keychain

Implement an adapter registry whose entries declare exact service, account mapping,
credential semantics, ownership, and migration policy. The first guaranteed adapters
cover Cutout's current and legacy namespaces. Lookup queries attributes/presence only
during discovery. Secret data is read only for an explicit check/import and never
returned over IPC.

This deliberately avoids `security find-generic-password -a ...` enumeration and
does not guess records by labels such as OpenAI, Claude, or Codex.

## Wire Protocol Routing

`createOpenAICompatibleAdapter` must take the normalized Provider config rather than
a registry-wide hard-coded mode:

- `responses` -> `provider.responses(modelId)`
- `chat-completions` -> `provider.chat(modelId)`

Official OpenAI definitions allow both and default to Responses. Custom compatible
Providers require a choice. Known providers expose only protocols supported by their
reviewed definition. Existing records migrate to preserve behavior.

Catalog checks and generation checks are separate:

- `/models` establishes credential/base-URL reachability and provides model ids.
- It does not establish Responses/Chat support.
- The draft check should perform a non-generative catalog request where supported.
  The UI labels this accurately; it must not claim full generation verification.
- A later optional protocol smoke test would be potentially billable and is not part
  of automatic discovery.

## UI State Machine

The form becomes a draft editor with explicit states:

```text
editing connection -> checking -> catalog ready -> model selected -> saving
         ^                |              |
         +-- check error -+              +-- connection field changed -> editing
```

Connection identity is the tuple of kind, normalized Base URL, wire protocol, and
credential revision. Any change clears verification, catalog, and selected model if
it is no longer present.

Use the existing themed Radix primitives for all selectable controls. For a long
model list, compose a searchable popover/command list using repository primitives;
do not use native `datalist`. Manual entry is an explicit alternate mode, not a
simultaneously visible competing field.

## Error Model

Return stable codes plus sanitized messages:

- `credential-missing`
- `credential-unsupported`
- `unauthorized`
- `endpoint-unreachable`
- `catalog-unsupported`
- `catalog-malformed`
- `wire-protocol-unsupported`
- `draft-expired`
- `conflict`

No upstream response body or URL user-info is echoed without redaction.

## Compatibility and Rollback

- Read old records without `wireProtocol`; normalize and write the explicit field on
  the next successful edit/import.
- Official OpenAI old records normalize to Responses, matching their previous AI SDK
  default. All other existing compatible records normalize to Chat Completions,
  matching current Cutout behavior.
- Keep existing manual Provider creation available throughout the migration.
- New commands are additive. If discovery is unavailable, the editor remains usable
  with manual credentials and the same backend draft/check flow.
- Do not delete legacy Keychain records; retain the existing lazy-copy behavior.

## Evidence and Trade-offs

- OpenAI recommends Responses for new projects while continuing Chat Completions:
  https://developers.openai.com/api/docs/guides/migrate-to-responses
- AI SDK 5+ defaults OpenAI to Responses and exposes explicit `.responses` and `.chat`
  factories: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- Codex custom providers publish base URL, environment key, and wire API metadata:
  https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers
- Anthropic documents environment/gateway configuration and macOS Keychain storage,
  but not a stable external import identifier:
  https://docs.anthropic.com/en/docs/claude-code/llm-gateway and
  https://code.claude.com/docs/en/iam

The principal trade-off is narrower automatic import in exchange for a defensible
security boundary. Exact adapters are maintainable and testable; heuristic Keychain
search would be broader but could misidentify secrets, trigger access prompts, or
silently consume OAuth credentials with incompatible semantics.
