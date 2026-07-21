# Custom provider protocol families design

## Boundary

Keep the persisted provider `kind` and the selected `wireProtocol` as separate
contracts:

- `kind` owns provider identity, host/network policy, local-loopback policy,
  registry metadata, and default capabilities.
- `wireProtocol` owns request payload/path selection, SDK adapter selection,
  authentication-header shape, streaming recognition, base URL defaults, and
  model-catalog parsing.

The existing internal kind `openai-compatible` remains the backward-compatible
custom public-HTTPS host profile. Its user-facing label becomes `Custom
endpoint`; existing stored kind values are unchanged.

## Persisted Contract

Generalize `OpenAIWireProtocol` to `ProviderWireProtocol` while preserving the
JSON field name `wireProtocol` and existing serialized values:

| Value | UI label | Runtime adapter |
| --- | --- | --- |
| `responses` | OpenAI Responses | `createOpenAI().responses()` |
| `chat-completions` | OpenAI Chat Completions | `createOpenAI().chat()` |
| `anthropic-messages` | Anthropic Messages | `createAnthropic()` |
| `google-generate-content` | Google GenerateContent | `createGoogleGenerativeAI()` |

Defaults for records that omit the field remain deterministic:

- `openai` -> `responses`
- OpenAI-compatible cloud/local profiles -> `chat-completions`
- `anthropic` -> `anthropic-messages`
- `google` -> `google-generate-content`
- `gateway` -> no selectable provider wire protocol

Existing custom records without `wireProtocol` continue using Chat
Completions. No persisted migration rewrite is required.

## Data Flow

```text
ProviderForm
  -> ProviderDraft/ProviderConfig.wireProtocol
  -> Rust draft validation and providers.json
  -> GenerationAdapterRegistry selects SDK factory by effective protocol
  -> tauriFetch sends validated protocol discriminator
  -> Rust proxy combines kind host policy + protocol auth policy
  -> upstream endpoint
```

The webview never supplies raw auth headers. Rust accepts only the closed
protocol enum and derives Bearer, Anthropic, or Google headers from the stored
secret.

## Endpoint Rules

- Preserve an explicitly supplied non-root path because relays may mount a
  protocol below a prefix.
- For a pathless custom endpoint, default OpenAI and Anthropic protocols to
  `/v1`, and Google GenerateContent to `/v1beta`.
- SDK adapters append their protocol-specific generation paths.
- Model discovery uses `<normalized-base>/models` and accepts both
  `data[].id` and `models[].name`, stripping the `models/` prefix.

## UI

- Show the protocol selector for first-party OpenAI/Anthropic/Google and the
  custom endpoint profile, constrained to each definition's supported values.
- The custom endpoint offers all four protocols.
- Provider presets keep their current constrained protocol/default behavior.
- Labels describe protocol families explicitly; no Anthropic or Google option
  is called OpenAI compatible.

## Compatibility And Failure Behavior

- Unknown protocol strings fail schema parsing in TypeScript and Rust.
- Unsupported kind/protocol combinations fail during draft creation before a
  secret is used or a request is sent.
- Existing Responses/Chat configurations round-trip unchanged.
- Redirect blocking, DNS/private-address rejection, local loopback policy,
  response-header redaction, and keychain-only secrets remain unchanged.

## Verification

- TypeScript schema/default/registry/form/adapter/base-URL/model-parser tests.
- Rust serialization, combination validation, auth-header, draft probe, and
  proxy request tests.
- Focused provider form and connection-flow tests.
- `pnpm lint`, `pnpm exec tsc -b --pretty false`, relevant Vitest and Rust
  tests, `pnpm agent:validate`, and visual tests when selectable UI changes
  affect snapshots.

## Rollback

The new protocol enum values and adapter branches are additive. Rollback may
remove the two new selectable values only before users persist them; after a
release, retain parsing with a capability-required error rather than making
existing provider files unreadable.
