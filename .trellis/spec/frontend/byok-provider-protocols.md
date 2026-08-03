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
    app: AppHandle,
    cancellations: State<AiProxyCancellationState>,
    request_id: Option<String>,
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<ProxyResponse, ProxyError>

ai_proxy_stream(
    app: AppHandle,
    cancellations: State<AiProxyCancellationState>,
    request_id: Option<String>,
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    on_chunk: Channel<InvokeResponseBody>,
) -> Result<(), ProxyError>

ai_proxy_cancel(
    cancellations: State<AiProxyCancellationState>,
    request_id: String,
) -> Result<bool, ProxyError>
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

Before reading a credential, Rust reloads the persisted provider by
`provider_id` and verifies that it is enabled and that the supplied kind,
effective wire protocol, request origin, and request path prefix match that
record's configured or first-party default endpoint. A webview cannot combine
one provider's secret selector with another provider's destination.

Remote hostnames are resolved once immediately before client construction. All
resolved addresses must be public, IPv4-mapped IPv6 and reserved ranges are
normalized/rejected, and the validated socket addresses are installed into the
HTTP client resolver so connect cannot perform a second unvalidated DNS lookup.
Local model providers use the same pinning but require every resolved address
to be loopback.

Model catalog checks call authenticated `GET <protocol-base>/models`. Parsers
accept OpenAI/Anthropic `data[].id` and Google `models[].name`, removing a
leading `models/` prefix and deduplicating IDs.

Connection checks prove credential and catalog access only. They must never
issue a generation POST because there is no standardized cross-family no-cost
generation probe.

An authenticated catalog image id is a candidate route, not proof that image
generation is usable. The packaged journey records catalog routing separately
from the first completed image execution and never calls the former success.

Every renderer-owned generation `AbortSignal` propagates through the desktop
tool loop and `GenerationService` into an opaque UUID-bound native proxy
request. Cancellation calls `ai_proxy_cancel`, which drops the matching
`reqwest` future; discarding a late renderer result alone is not cancellation.
Buffered generation and native image-edit requests share the desktop 300-second
deadline. Catalog/health probes retain their shorter bound.

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
| Provider id, kind, protocol, origin, or base-path prefix does not match persisted configuration | Reject before reading the secret |
| DNS resolves a remote endpoint to any non-public address, or a local endpoint to any non-loopback address | Reject before connecting |

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
  provider id/kind/protocol/origin/path binding, protocol auth headers,
  stripped inbound auth headers, mapped/reserved address rejection,
  resolve-to-connect pinning, draft catalog checks, and buffered/stream proxy
  parity; UUID-only request registration, duplicate rejection, native
  cancellation, and the aligned generation deadline.
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

## Scenario: Discover A Reusable Local Provider Credential

### 1. Scope / Trigger

Use this contract when changing native provider discovery, candidate metadata,
provider-draft secret resolution, or support for credentials owned by Codex,
Claude Code, the process environment, or Cutout's OS credential vault.

Finder-launched desktop apps commonly do not inherit shell environment
variables. A provider being present in a local tool config therefore does not
prove that its `env_key` is reusable by Cutout.

### 2. Signatures

```rust
discover_provider_candidates(app: AppHandle) -> Result<Vec<ProviderCandidate>, DiscoveryError>

struct ProviderCandidate {
    id: String,
    source: String,
    source_label: String,
    config_location: Option<String>,
    kind: String,
    label: String,
    base_url: Option<String>,
    wire_protocol: Option<String>,
    model_hint: Option<String>,
    credential: CredentialPreview,
    warnings: Vec<String>,
}

struct CredentialPreview {
    source_type: String,
    reference: Option<String>,
    available: bool,
    importable: bool,
}
```

Provider drafts carry only `candidateId`; connection checks and imports resolve
the current secret again inside Rust.

### 3. Contracts

- Resolve Codex from `CODEX_HOME` when present, otherwise exactly
  `<home>/.codex`.
- Read only exact supported files with the shared no-symlink, regular-file,
  1 MiB-bounded reader.
- Codex `auth.json` is reusable only when top-level `OPENAI_API_KEY` is a
  non-empty string. OAuth/session tokens and other fields are not API keys.
- A valid Codex auth-file key produces an OpenAI Responses candidate even when
  `config.toml` has no explicit OpenAI provider table.
- If an explicit Codex OpenAI provider names an unavailable `env_key`, a valid
  auth-file API key is the native fallback. An available environment value
  remains authoritative for that candidate.
- Candidate and IPC serialization may expose the stable reference name
  `OPENAI_API_KEY`, but never its value.
- Imported secrets are persisted through Cutout's native OS credential vault;
  on macOS this is Keychain. The renderer receives only key status and may use
  platform-neutral visible copy such as `Cutout local credentials`.
- A reviewed CC Switch installation may contribute its current Codex upstream
  as a direct `cc-switch` + Responses candidate. `cc-switch` is an explicit
  OpenAI-shaped Provider kind: the persisted wire contract, renderer model
  descriptors, DAG/pipeline conditioning, and native image generation/editing
  endpoint selection must all include it through the shared
  `supportsOpenAIImageEndpoints` predicate. A native executor capability alone
  is not renderer routing evidence. Cutout reads only the
  exact `<home>/.cc-switch/cc-switch.db` path with SQLite read-only/no-create
  flags, a 256 MiB bound, before/after file-identity checks, and the expected
  `providers` schema. Exactly one `codex` row may have `is_current = 1`.
- The CC Switch row is importable only when `settings_config` has exactly the
  `auth` and `config` fields, `auth` has exactly one non-empty
  `OPENAI_API_KEY`, and the embedded Codex TOML has one unambiguous public HTTPS
  `base_url` with `wire_api = "responses"`. A pathless upstream is normalized
  to `/v1`; an explicit path is preserved. The database provider id and secret
  remain native and are never serialized.
- The CC Switch selected `model` is only a default-model hint. Readiness still
  requires the normal authenticated `GET <direct-upstream>/models` check and
  uses only model ids returned by that response. An empty CC Switch loopback
  catalog, the hint alone, pricing rows, or historical request logs are not
  catalog evidence, and no generation request may be used as a fallback.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing Codex config and auth | Return no Codex candidate |
| Valid auth-file `OPENAI_API_KEY` only | Return available/importable OpenAI candidate |
| Empty API key | Return no auth-file candidate |
| OAuth/session token only | Do not import or reinterpret it |
| Malformed supported config/auth file | Return sanitized `config-invalid` error |
| Symlinked parent/file | Return `config-rejected` before reading |
| File larger than 1 MiB | Return `config-rejected` before parsing |
| Missing CC Switch database or no current Codex row | Return no CC Switch upstream candidate |
| CC Switch database over 256 MiB, symlinked, replaced during read, schema-drifted, or writable-only | Reject before exposing a candidate |
| Multiple current CC Switch Codex rows, unknown settings/auth fields, ambiguous Codex provider tables, non-Responses wire API, or unsafe upstream URL | Reject the CC Switch source without weakening other valid discovery sources |
| Imported `cc-switch` route is absent from renderer text/image capability or OpenAI image-endpoint selection | Treat as a contract bug; keep the shared Provider-kind predicate, runtime descriptors, DAG/pipeline routing, and generation/editing transports aligned |
| Candidate disappears before draft check/import | Return `credential-missing` |
| Secret-store read/import fails | Return opaque `credential-unavailable` |

### 5. Good / Base / Bad Cases

- Good: Codex `auth.json` contains an API key; Settings shows an enabled OpenAI
  candidate and Rust resolves it only when checking/importing the draft.
- Base: a custom Codex provider has a live `env_key`; discovery keeps using the
  environment reference without reading a different credential.
- Bad: serialize `auth.json`, an API-key prefix, or a masked key into the
  candidate to make the frontend perform secret selection.
- Bad: import Codex access/refresh tokens as OpenAI API keys.

### 6. Tests Required

- Auth-only discovery yields OpenAI + Responses + importable metadata.
- A sentinel API key is absent from serialized candidate JSON but returned by
  the internal native resolver.
- Explicit OpenAI config with a missing environment variable falls back to the
  auth-file API key.
- OAuth-only and empty auth files yield no importable auth candidate.
- Symlinked and oversized auth files fail before parsing.
- CC Switch current-upstream discovery uses the exact read-only database,
  normalizes a pathless HTTPS endpoint to `/v1`, re-resolves the secret, and
  serializes no database credential or settings payload.
- Provider-kind tests require `cc-switch` to default to Responses, remain
  eligible for reviewed text and image assignments, and use the same native
  generation, edit, and reference-conditioning path as OpenAI-shaped routes.
- Missing database, schema drift, symlinks, multiple-current rows, unknown
  settings/auth fields, unsafe or ambiguous upstreams, and candidate binding
  drift fail closed. A model hint with an empty checked catalog remains an
  error.
- Existing custom-provider environment discovery remains covered.

### 7. Wrong vs Correct

#### Wrong

```rust
let available = env_key.and_then(std::env::var_os).is_some();
```

This treats a shell-only environment variable as the only possible Codex
credential and fails for normal desktop launches.

#### Correct

```rust
let use_auth_file = is_openai && auth_key_available && !env_available;
let (source_type, reference) = if use_auth_file {
    ("config-literal", Some("OPENAI_API_KEY".to_owned()))
} else {
    ("environment", env_key.map(str::to_owned))
};
let credential = CredentialPreview {
    source_type: source_type.into(),
    reference,
    available: env_available || use_auth_file,
    importable: env_available || use_auth_file,
};
```

The candidate remains sanitized; the actual auth-file value is re-read only by
the native draft resolver.

## Scenario: Import A Reviewed Local Agent API Key

### 1. Scope / Trigger

Use this contract for credential adapters owned by Claude Code, Codex,
OpenCode, Pi, OMP, Gemini CLI, Qwen Code, Kimi Code CLI, and Mistral Vibe.
This is API-key discovery/import only. OAuth, subscription, bearer, helper,
keyring, and session reuse require a separate controlled Agent runtime and are
not provider credentials.

### 2. Signatures

```rust
discover_provider_candidates(app: AppHandle) -> Result<Vec<ProviderCandidate>, DiscoveryError>
create_provider_draft(app: AppHandle, input: CreateDraftInput) -> Result<DraftSummary, DiscoveryError>
check_provider_draft(app: AppHandle, draft_id: String) -> Result<ProviderProbeResult, DiscoveryError>
import_provider_draft(app: AppHandle, input: ImportDraftInput) -> Result<ProviderConfig, DiscoveryError>
```

`ProviderCandidate` adds optional sanitized `agentId` and `schemaId` fields.
`CreateDraftInput` accepts exactly one of `candidateId`, `providerId`, or
`secret`, except that local no-key providers accept none.

### 3. Contracts

- Every adapter reads only registry-owned roots and exact filenames through the
  shared no-symlink, regular-file, 1 MiB-bounded reader. Every path component
  is inspected before opening, and opened-file identity is checked before and
  after the bounded read.
- Windows identity checks use the opened handle's volume serial and file index,
  and reopen the exact path with reparse-point traversal disabled before and
  after the read. Length, timestamps, attributes, or file type alone are not a
  stable identity.
- JSON, JSONC, TOML, YAML, and dotenv are parsed natively. JSONC uses a real
  parser. OMP YAML rejects tags, anchors, aliases, merge keys, duplicate keys,
  and command-backed values. No parser executes helpers or expands variables.
- Candidate IDs bind the Agent, schema, original source entry, provider kind,
  exact endpoint, wire protocol, credential class, and sanitized reference.
  Provider aliases are never normalized into a selector for a different entry.
- Draft creation accepts exactly one credential authority: `candidateId`, an
  existing Cutout `providerId`, or a transient manual `secret`. Local no-key
  providers are the only zero-source exception. Candidate drafts never carry
  Agent-source secret bytes or caller-selected paths.
- Check re-discovers the candidate, revalidates its binding, resolves the
  secret natively, and records the secret revision only after the authenticated
  catalog check succeeds. Import re-discovers and re-reads again; candidate,
  binding, or secret drift invalidates the draft before persistence.
- Config-derived labels, model hints, references, locations, warnings, and
  endpoints are sanitized before IPC. Absolute host paths, controls,
  credential-shaped text, URL userinfo/query/fragment, and disallowed hosts
  fail closed.
- The fixed 39-Agent inventory is a native diagnostic/provenance capability,
  not a second AI setup workflow. Default Settings must not invoke or render
  all 39 rows. It projects configured Providers, persisted verification
  receipts, capability coverage, and only reviewed importable provider
  candidates into one outcome-led setup state.
- Settings claims routing is configured only when at least one enabled Provider has a complete
  verified receipt (`status`, `model`, and `checkedAt`) and verified Providers
  cover every required task dimension. Config existence alone is never a ready
  claim. Catalog evidence may nominate an image route, but visible copy and E2E
  evidence must not call image generation usable until a real image completes.
- Automatic setup prefers each authenticated Provider's checked default model
  for text/Coding instead of taking the first alphabetically sorted catalog
  id. Image routing intersects exact observed/verified model evidence with an
  implemented Provider adapter. A task binding selects the exact route but is
  not capability evidence. Automatic setup prefers a supported
  high-fidelity-recommended route, including reviewed GPT Image / ChatGPT Image,
  Muse Image, MAI Image 2.5, Gemini 3 Pro Image, Qwen Image 3.0, Seedream 5 Pro,
  Reve 2.1, GPT Image 1.5 aliases, Gemini 3.1 Flash Image aliases, and strong
  Grok Image families, then falls back to another supported
  compatible route without changing its exact model id. Recommendation never
  establishes support.
- Automatic nomination may recognize image-family ids such as `seedream-*` and
  `reve-*`, while exact observed/verified descriptors may nominate models whose
  ids contain no image keyword. Nomination is discovery only: exact route
  evidence and an implemented adapter still decide support.
- OpenAI-shaped image routes have implemented generation and edit adapters.
  Google/Gemini routes have an implemented generation adapter but remain
  `adapter-required` for generic image editing. DashScope/Qwen compatible-mode
  routes remain `adapter-required` for both generation and editing until their
  native request, response, authentication, and cancellation contracts are
  implemented and tested. Provider kind, catalog presence, and model-name
  heuristics alone never authorize an image call.
- Automatic setup stops importing candidates as soon as the configured results
  cover every required task dimension. It must continue after a failed or
  partial candidate, but it must not probe unrelated credentials after a
  complete route exists.
- Importable candidates that match an existing Provider's kind, effective wire
  protocol, and normalized base URL are omitted from setup suggestions. Repair
  the existing connection instead of adding a duplicate Provider.
- Discovered provider source labels preserve the sanitized Agent-owned label.
  Only the process environment and Cutout-owned OS credential vault use
  translated category labels; Agent configs must never be mislabeled as
  Cutout-owned credentials.
- The official Kimi for Coding binding is exactly
  `https://api.kimi.com/coding/v1`, Chat Completions, under the closed Moonshot
  family host policy. `KIMI_API_KEY` overrides a config literal. Other Kimi or
  custom origins remain non-importable.
- Gemini imports `GEMINI_API_KEY` before `GOOGLE_API_KEY`; OAuth/Vertex/ADC
  presence is display-only. Claude helpers and credential-session files are
  presence-only. Pi/OMP model credentials require reviewed provider, API,
  endpoint, and environment/literal semantics.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing, malformed, non-file, oversized, symlinked, or identity-changing source | Fail with sanitized config error before parsing or importing |
| Unknown schema, provider, API, endpoint, or credential variant | Omit or display as non-importable; never guess an OpenAI-compatible binding |
| OAuth, bearer, helper, keyring, session, or subscription material | Display-only or unsupported; never enter the API-key proxy |
| Candidate kind, protocol, endpoint, source entry, or secret changes after check | Invalidate the draft before provider/key persistence |
| Draft supplies multiple credential authorities | Reject as `draft-invalid` |
| Existing `providerId` metadata differs from persisted provider metadata | Reject before reading the stored key |
| Candidate IPC contains a host path, secret-shaped text, unsafe URL, controls, or unknown field | Reject at native and TypeScript boundaries |
| Provider save fails after key storage | Restore the prior key or remove the newly written key |
| Provider exists without complete verification evidence | Show action required; do not count it toward ready coverage |
| Candidate resolves to an already configured connection | Omit the duplicate import action and expose Provider management |
| Discovery fails after a verified full-coverage setup is ready | Keep the ready outcome; discovery is not required for continued use |

### 5. Good / Base / Bad Cases

- Good: a reviewed Kimi config binds `KIMI_API_KEY` to
  `https://api.kimi.com/coding/v1`; check succeeds, then import re-reads the
  same candidate and secret revision before atomic persistence.
- Base: an unsupported Agent remains truthful in the native 39-Agent inventory,
  produces no parse attempt, and adds no noise to default AI setup.
- Good: a verified full-coverage Provider produces one `AI is ready` outcome;
  successful routing coverage and the local Agent inventory are not repeated.
- Bad: show both a configured MOX Provider and its Cutout-owned credential as a
  new reusable connection, or claim ready from an unverified Provider.
- Bad: a webview supplies `candidateId` plus a different `secret`, edits the
  endpoint after checking, or asks Rust to scan a caller-selected path.

### 6. Tests Required

- Shared reader: missing, permission failure, non-file, oversized file,
  symlinked root/component/file, malformed UTF-8, and identity drift.
- Windows shared reader: two same-length files with the same mutable timestamp
  still have distinct handle identities; reparse-point opens fail closed.
- Every adapter family: absent, malformed/unknown schema, positive import,
  serialized redaction, native re-read, and closed provider binding.
- Cross-source negatives: OAuth/session/helper exclusion, original alias
  selector binding, candidate/binding revision changes, post-check secret
  changes, ambiguous draft sources, conflict, and provider-save key rollback.
- Format-specific negatives: OpenCode JSONC, OMP YAML hazards, Gemini/Kimi env
  precedence, Qwen unknown providers, Kimi current-over-legacy precedence, and
  Vibe dotenv export/duplicate/interpolation/command rejection.
- Settings setup projection: loading, configuration failure, discovery failure,
  complete and incomplete verification evidence, disabled Providers, verified
  capability gaps, ready state, importable candidate actions, existing-
  connection deduplication, source-label ownership, advanced-management
  disclosure, and five-locale catalog parity.

### 7. Wrong vs Correct

#### Wrong

```rust
let secret = request.secret.or_else(|| read_path(request.path, request.field));
save_provider(request.kind, request.base_url, secret);
```

This lets the webview choose the filesystem authority, field selector, secret,
and destination independently.

#### Correct

```rust
let candidate = rediscover_registered_candidate(&draft.candidate_id)?;
verify_candidate_binding(&candidate, &draft)?;
let secret = resolve_registered_source(&candidate)?;
verify_checked_secret_revision(&secret, &draft)?;
persist_provider_and_key_with_rollback(provider, secret)?;
```

The native registry owns the path, schema, selector, provider binding, and
secret re-read. The webview receives only sanitized metadata and an opaque
draft ID.
