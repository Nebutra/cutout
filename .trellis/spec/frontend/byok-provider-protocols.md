# BYOK Provider Protocol Contract

> Executable contract for provider wire protocols, custom endpoints, Rust-owned
> credentials, and non-billable connection checks.

## Scenario: Add Or Change A Provider Wire Protocol

### 1. Scope / Trigger

Use this contract whenever changing `ProviderConfig.wireProtocol`, provider
defaults, SDK adapter selection, base URL normalization, Rust proxy auth, model
catalog parsing, or the Settings provider form.

`kind` and `wireProtocol` are separate authorities:

- `kind` owns provider identity, host/network policy, and local-loopback policy.
- `wireProtocol` owns the SDK adapter, protocol base path, auth-header shape,
  streaming behavior, and model-catalog shape.

The persisted custom-provider kind remains `openai-compatible`; its visible
label is `Custom endpoint`.

### 2. Signatures

```ts
type ProviderWireProtocol =
  | 'responses'
  | 'chat-completions'
  | 'anthropic-messages'
  | 'google-generate-content'

interface ProviderConfig {
  id: string
  kind: string
  label: string
  baseUrl?: string
  wireProtocol?: ProviderWireProtocol
  defaultModel: string
  enabled: boolean
}

apiBaseUrl(
  kind: ProviderKind,
  baseUrl: string | undefined,
  wireProtocol?: ProviderWireProtocol,
): string | undefined

tauriFetch(
  providerId: string,
  kind: ProviderKind,
  wireProtocol?: ProviderWireProtocol,
): typeof fetch
```

Both Rust proxy commands receive the same protocol discriminator:

```rust
ai_proxy_request(
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<ProxyResponse, ProxyError>

ai_proxy_stream(
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    on_chunk: Channel<InvokeResponseBody>,
) -> Result<(), ProxyError>
```

### 3. Contracts

The persisted field name is always `wireProtocol`. Existing serialized values
must not be renamed. Records that omit the field use these effective defaults:

| Provider kind | Effective protocol |
| --- | --- |
| `openai` | `responses` |
| `anthropic` | `anthropic-messages` |
| `google` | `google-generate-content` |
| `openai-compatible` and OpenAI-shaped presets | `chat-completions` |
| `gateway` | none |

The supported combination matrix is closed:

| Provider kind | Allowed protocols |
| --- | --- |
| `openai` | Responses, Chat Completions |
| `anthropic` | Anthropic Messages |
| `google` | Google GenerateContent |
| `openai-compatible` | all four protocols |
| Other OpenAI-shaped cloud/local presets | Chat Completions only |
| `gateway` | no provider wire protocol |

For pathless custom endpoints, `apiBaseUrl` adds `/v1` for OpenAI and
Anthropic protocols and `/v1beta` for Google. An explicit non-root path is
preserved because relays may mount APIs under their own prefix.

Rust strips caller-provided `authorization`, `x-api-key`, and `x-goog-api-key`
headers, then derives credentials from the validated effective protocol:

| Protocol | Rust-injected auth |
| --- | --- |
| OpenAI Responses / Chat Completions | `Authorization: Bearer <secret>` |
| Anthropic Messages | `x-api-key` plus `anthropic-version: 2023-06-01` |
| Google GenerateContent | `x-goog-api-key` |

Model catalog checks call authenticated `GET <protocol-base>/models`. Parsers
accept OpenAI/Anthropic `data[].id` and Google `models[].name`, removing a
leading `models/` prefix and deduplicating IDs.

Connection checks prove credential and catalog access only. They must never
issue a generation POST because there is no standardized cross-family no-cost
generation probe.

The application entry must not statically load provider catalog definitions or
provider SDK runtime solely to support connection testing. When a configured
provider has no explicit `baseUrl`, `ProviderService.test()` dynamically loads
the catalog to resolve the first-party default endpoint. Configured/custom
endpoints use their supplied URL without loading that catalog. `pnpm build`
enforces this boundary by rejecting first-party provider endpoint markers in
the frontend entry chunk; do not weaken that gate to accommodate an eager
import.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown protocol string | TypeScript/Rust decoding fails closed |
| Known protocol unsupported by `kind` | Reject before reading a secret or sending a request |
| Missing protocol on a legacy record | Resolve the deterministic default above |
| Missing protocol for a kind with no default | Return an actionable wire-protocol-required error |
| `/models` returns HTML or malformed JSON | Report endpoint/catalog misconfiguration |
| `/models` returns 401/403 | Report credential failure |
| `/models` returns 404/405 | Report catalog unsupported; do not fall back to generation |
| Adapter switch receives a new unhandled protocol | Compile-time `never` branch and runtime capability error |

### 5. Good / Base / Bad Cases

- Good: `openai-compatible` + `anthropic-messages` + a custom HTTPS base URL
  selects the Anthropic SDK, adds `/v1` only when pathless, and injects
  Anthropic headers in Rust.
- Base: a legacy `openai-compatible` record without `wireProtocol` continues as
  Chat Completions without rewriting persisted JSON.
- Bad: `deepseek` + `anthropic-messages` is rejected by both TypeScript and
  Rust validation before network access.
- Bad: connection check sends a tiny `ping` generation to infer support. This
  may bill the user and does not provide a stable cross-family contract.

### 6. Tests Required

- TypeScript: schema enum/defaults, supported matrix, legacy defaulting, base
  URL paths, exhaustive adapter routing, buffered/stream protocol propagation,
  model-catalog parsing, and refined-schema consumers using `safeExtend` or a
  shared refined draft schema.
- Rust: serde round trips, effective defaults, unsupported combinations,
  protocol auth headers, stripped inbound auth headers, draft catalog checks,
  and buffered/stream proxy parity.
- UI: protocol options and explicit labels for each supported kind; visible
  action copy must say credential/catalog check rather than generation proof.
- Visual: desktop/mobile provider directory and custom endpoint form coverage.
- Gates: `pnpm lint`, `pnpm exec tsc -b --pretty false`, focused Vitest,
  `cargo test commands::ai::`, `cargo fmt --check`, `pnpm agent:validate`,
  `pnpm build` including the frontend bundle gate, and `git diff --check`.

### 7. Wrong vs Correct

#### Wrong

```ts
// New protocols silently fall through to the last provider implementation.
if (protocol === 'responses') return openai.responses(model)
if (protocol === 'chat-completions') return openai.chat(model)
return google(model)
```

#### Correct

```ts
switch (protocol) {
  case 'responses':
    return openai.responses(model)
  case 'chat-completions':
    return openai.chat(model)
  case 'anthropic-messages':
    return anthropic(model)
  case 'google-generate-content':
    return google(model)
  default: {
    const unsupported: never = protocol
    throw new Error(`capability-required: ${unsupported}`)
  }
}
```

Do not derive a new schema with `.extend()` from a Zod schema that contains
refinements. Use the shared refined draft schema or `.safeExtend()` so the app
does not fail during module initialization.
