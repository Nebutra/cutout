# Custom provider protocol families: MVP research

Date: 2026-07-21

## Recommendation

Treat the API protocol as a separate persisted/runtime contract from the
provider kind. Using semantic family names, the smallest executable
custom-endpoint MVP is:

1. `openai-responses`
2. `openai-chat-completions`
3. `anthropic-messages`
4. `google-generate-content`

The first two are already executable. The latter two are the only useful
additions that can be implemented with packages already installed in this repo:
`@ai-sdk/anthropic@3.0.92` and `@ai-sdk/google@3.0.88`. Do not add menu entries
for other protocols until an adapter, auth policy, endpoint builder, streaming
path, and verification path all exist.

The existing internal provider kind `openai-compatible` can remain the custom
public-HTTPS trust profile for compatibility, but its UI definition should
offer all four executable protocols. Its name must no longer be used as the
runtime protocol decision.

Keep Ollama on an OpenAI-compatible protocol in this MVP. Ollama's official
compatibility API now implements both `/v1/chat/completions` and `/v1/responses`,
plus `/v1/models`. Its native `/api/chat` protocol would add a distinct NDJSON
stream and `/api/tags` catalog shape without unlocking a necessary MVP use
case.

## Protocol matrix

| Protocol family | AI SDK construction | Request path from normalized base | Default auth injected by Rust | Streaming | Model listing |
| --- | --- | --- | --- | --- | --- |
| OpenAI Responses | `createOpenAI(...).responses(model)` | `POST /responses` | `Authorization: Bearer` | SSE; request carries `stream: true` | `GET /models`, `{data:[{id}]}` |
| OpenAI Chat Completions | `createOpenAI(...).chat(model)` | `POST /chat/completions` | `Authorization: Bearer` | SSE; request carries `stream: true` | `GET /models`, `{data:[{id}]}` |
| Anthropic Messages | `createAnthropic(...)(model)` | `POST /messages` | `x-api-key` plus `anthropic-version: 2023-06-01` | SSE; request carries `stream: true` | `GET /models`, paged `{data:[{id}]}` where implemented |
| Google GenerateContent | `createGoogleGenerativeAI(...)(model)` | `POST /models/{model}:generateContent`; stream uses `:streamGenerateContent?alt=sse` | `x-goog-api-key` | SSE via `alt=sse` | `GET /models`, `{models:[{name:"models/..."}]}` |

Base URL normalization must be protocol-aware. A pathless OpenAI or Anthropic
endpoint may default to `/v1`; a pathless Gemini endpoint must default to
`/v1beta`. Any explicit non-root path must be preserved because gateways may
mount a protocol under a custom prefix.

## Evidence in the current runtime

- `src/services/ai/provider-types.ts` defines `wireProtocol` as an OpenAI-only
  enum. `openai-compatible` defaults to Chat Completions, preserving old
  records, but Anthropic and Google cannot be selected for a custom endpoint.
- `src/services/ai/provider-adapter-registry.ts` already executes native
  Anthropic and Google requests with the installed AI SDK factories. The custom
  adapter always constructs `@ai-sdk/openai`, so widening only the form enum
  would be false advertising.
- Installed package source confirms endpoint construction:
  `@ai-sdk/anthropic` appends `/messages`; `@ai-sdk/google` appends
  `/models/{model}:generateContent` and
  `/models/{model}:streamGenerateContent?alt=sse`; `@ai-sdk/openai` appends
  `/responses` or `/chat/completions`.
- `src/services/ai/tauri-fetch.ts` already recognizes `stream: true`,
  `alt=sse`, and `streamGenerateContent`, so all four MVP protocols can reuse the
  existing Tauri `Channel` to `ReadableStream` bridge.
- `src-tauri/src/commands/ai/auth_header.rs` already contains the three required
  official auth shapes, but chooses them only by provider kind. A custom
  endpoint therefore needs protocol-aware auth selection; continuing to pass
  only `kind=openai-compatible` would incorrectly inject Bearer auth for
  Anthropic or Gemini.
- `src-tauri/src/commands/ai/provider_discovery.rs::model_ids` already accepts
  both `data` and `models`, accepts `id` or `name`, and removes a `models/`
  prefix. The draft catalog parser therefore already fits OpenAI, Anthropic,
  and Gemini. The TypeScript `list-models.ts` and
  `provider-service.local.ts::validateModelsResponse` are still OpenAI-only and
  must be brought into parity.
- `src/services/ai/base-url.ts` currently appends `/v1` based on provider kind.
  That is correct for the existing OpenAI-compatible path but wrong for a
  pathless Gemini custom endpoint.
- Rust host policy is intentionally separate from protocol: vendor kinds pin
  official domains, `openai-compatible` permits a public custom HTTPS host, and
  local kinds remain loopback-only. Preserve this distinction.

## Official/primary-source checks

- Anthropic's official TypeScript SDK posts Messages to `/v1/messages` and its
  generated Models resource lists `/v1/models`:
  <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts>
  and
  <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/models.ts>.
- Google AI SDK package source installed in this repo uses the documented
  Gemini REST paths above and defaults its base URL to
  `https://generativelanguage.googleapis.com/v1beta`; API reference:
  <https://ai.google.dev/api/generate-content> and
  <https://ai.google.dev/api/models>.
- OpenAI provider package source installed in this repo uses `/responses` and
  `/chat/completions`; API references:
  <https://platform.openai.com/docs/api-reference/responses/create> and
  <https://platform.openai.com/docs/api-reference/chat/create>.
- Ollama officially documents OpenAI-compatible Chat Completions, Responses,
  streaming, and `/v1/models`:
  <https://docs.ollama.com/api/openai-compatibility>. Its native chat API is
  `/api/chat` with `application/x-ndjson`, and its native catalog is `/api/tags`:
  <https://docs.ollama.com/api/chat> and
  <https://docs.ollama.com/api/tags>.

## Executable design

### Persisted contract and migration

- Generalize the existing serialized `wireProtocol` field rather than adding a
  second competing field. Rename code symbols from `OpenAIWireProtocol` to
  `ProviderWireProtocol`, while keeping the JSON key `wireProtocol` and the two
  existing string values stable.
- Add `anthropic-messages` and `google-generate-content` as the only new values.
- Effective defaults for records with no field:
  - `openai` -> `responses`
  - existing OpenAI-compatible/cloud/local profiles ->
    `chat-completions`
  - `anthropic` -> `anthropic-messages`
  - `google` -> `google-generate-content`
  - `gateway` remains its dedicated Gateway adapter and does not expose this
    selector.
- Existing `responses` and `chat-completions` serialized values should remain
  accepted to avoid a destructive migration. The least disruptive option is to
  retain these exact strings and use the longer names only as UI labels/code
  documentation.
- Existing `openai-compatible` configs without `wireProtocol` must continue to
  run as Chat Completions. Do not silently switch them to Responses.

### Adapter and security boundary

- Select the AI SDK factory by effective protocol, not provider kind. Provider
  kind continues to own host policy and catalog branding/capabilities.
- The Rust proxy must derive auth from a validated effective protocol. Passing
  only the kind is insufficient. Prefer a shared Rust protocol enum used by
  provider persistence, draft verification, buffered requests, and streamed
  requests; do not permit arbitrary auth headers from the webview.
- Protocol defaults are enough for this MVP. Relays that expose Anthropic or
  Gemini payloads but require nonstandard Bearer/query/OAuth auth need a future
  explicit auth-profile contract; do not guess from host or model name.
- Preserve redirect blocking, DNS/private-address rejection, response-header
  redaction, loopback-only local profiles, and the keychain-only secret path.

### Verification and model catalog

- Build the catalog URL from the normalized protocol base and use the shared
  parser for `data[].id` and `models[].name`.
- A 404/405 catalog result should continue to allow manual model entry after an
  authenticated protocol-specific generation probe, or the draft cannot prove
  the selected protocol works. Today `CatalogUnsupported` marks the draft as
  checked but returns an error; the form exposes manual entry. Implementation
  should preserve that behavior and add a minimal protocol request if the
  product wants connection verification rather than catalog-only verification.
- Model listing is not a substitute for protocol verification: a gateway can
  expose `/models` while rejecting the selected generation payload.

### Review decision: no remote generation probe

`GET /models` is not sufficient to prove that a selected generation payload
will succeed. However, the four MVP families do not share a standardized,
reliable no-cost `OPTIONS` or `HEAD` generation probe, and even a deliberately
small generation request can incur provider cost. The shipped connection check
therefore stays limited to authenticated model-catalog access and must not be
described as generation verification. Protocol viability is enforced locally
through the closed kind/protocol matrix, protocol-aware base URL and auth
construction, exhaustive SDK adapter selection, and focused request-shape tests.

## Synchronized repo surfaces

Core schema and UI:

- `src/services/ai/provider-types.ts` and tests
- `src/services/ai/provider-registry.ts` and tests
- `src/services/ai/provider-discovery.ts`
- `src/components/settings/ProviderForm.tsx` and tests
- Lingui source catalogs and compiled `src/locales/*/messages.js`

Execution and URL/model behavior:

- `src/services/ai/provider-adapter-registry.ts` and tests
- `src/services/ai/base-url.ts` and tests
- `src/services/ai/tauri-fetch.ts` and streaming tests
- `src/services/ai/list-models.ts` and tests
- `src/services/ai/provider-service.local.ts` and tests
- `src/services/ai/generation-service.local.test.ts` for all four adapter paths

Rust persistence, discovery, auth, and network policy:

- `src-tauri/src/commands/ai/providers.rs`
- `src-tauri/src/commands/ai/provider_discovery.rs`
- `src-tauri/src/commands/ai/auth_header.rs`
- `src-tauri/src/commands/ai/ai_proxy.rs`

Claims/documentation that describe the old kind-only contract:

- `docs/superpowers/specs/2026-07-02-byok-infrastructure-design.md`
- `docs/superpowers/specs/2026-07-02-settings-page-design.md`
- `docs/AI_NATIVE.md` if CLI examples or accepted config values change
- `cutout.agent-capabilities.json` only if its provider network/auth boundary
  wording becomes inaccurate; validate any change with `pnpm agent:validate`

## Out of scope for this MVP

- Ollama native `/api/chat`, `/api/generate`, and `/api/tags`
- AWS Bedrock Converse/InvokeModel (SigV4 and regional service endpoints)
- Google Vertex AI (OAuth/service-account auth plus project/location paths)
- Azure OpenAI deployment paths, `api-version`, and Azure-specific auth
- Cohere Chat v2, Mistral native Agents, legacy text Completions, and other
  provider-specific APIs without installed adapters
- User-defined header templates, arbitrary query-string secrets, OAuth flows,
  automatic protocol probing, or model-name-based protocol inference

These are separate auth/endpoint/runtime contracts, not additional labels for
the same transport.
