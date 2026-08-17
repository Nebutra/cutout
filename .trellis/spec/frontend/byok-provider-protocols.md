# BYOK Provider Protocol Contract

> Executable contract for provider wire protocols, custom endpoints, Rust-owned
> credentials, and read-only connection checks.

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
  wireProtocol: ProviderWireProtocol
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

The persisted field name is always `wireProtocol`. Every non-Gateway persisted
record must contain it explicitly. The product uses these defaults only while
creating a new draft or normalizing a reviewed discovery candidate:

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
issue a generation POST because there is no standardized cross-family read-only
generation probe.

An authenticated catalog image id is a candidate route, not proof that image
generation is usable. The packaged journey records catalog routing separately
from the first completed image execution and never calls the former success.

Composer image routing must consume the exact observed/verified model descriptor
from the same immutable run snapshot as the Provider and task binding. Provider
kind may supply text-adapter behavior, but it never grants a Provider image
capability. The Provider image route-lock API requires this catalog explicitly so a
call site cannot silently fall back to a kind-derived capability table.

A failed conversational tool-gate Provider call is terminal for that turn. It
must preserve the original classified failure and must not fall through into
planning or Provider image production, where a later preflight could overwrite the
owning diagnostic.

Every renderer-owned generation `AbortSignal` propagates through the desktop
tool loop and `GenerationService` into an opaque UUID-bound native proxy
request. Cancellation calls `ai_proxy_cancel`, which drops the matching
`reqwest` future; discarding a late renderer result alone is not cancellation.
Native buffered generation and image-edit requests own a 300-second transport
failsafe. The desktop owner for remote image tools settles 15 seconds later so
the native request can return its own terminal result before an outer abort;
ending the outer owner first can discard a valid slow result and cause a second
Provider call on Retry. Deterministic local cutout tools retain their 180-second
owner. The packaged candidate watchdog settles another 15 seconds after the
desktop image owner. Catalog/health probes retain their shorter bound.

OpenAI-shaped structured generation sends JSON Schema in non-strict provider
mode and always validates the returned value against the caller-owned Zod
schema locally. This preserves optional/default fields across compatible
relays without weakening Cutout's final acceptance contract. A native
structured route may be cached as unsupported only after an explicit
protocol-level unsupported error. Invalid JSON, a schema mismatch, missing
output, transport failure, or one malformed schema is call-local evidence and
must not disable native structured output for later schemas on the same
provider/model route. Forced-tool and plain-JSON fallbacks remain bounded and
receive the same local validation.

Each attempted structured route emits only its closed attempt/category pair.
Explicit HTTP 408/429/5xx status owns transient classification before arbitrary
Provider response prose, and the response body is neither retained nor used to
change that class. If a later structured fallback terminates with transport,
authentication, policy, or cancellation evidence, Planner wrapping must retain
that closed owner rather than replace it with a Planner schema diagnostic.

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
| One structured schema is invalid or mismatched | Fall back for that call; do not cache the provider/model as unsupported |
| Provider explicitly rejects structured response format as unsupported | Cache only that protocol capability and use the validated fallback on later calls |
| Missing protocol on a persisted non-Gateway record | Reject the record with an actionable wire-protocol-required error |
| Missing protocol on a new draft | Apply the current product default before persistence |
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
- Base: a new `openai-compatible` draft defaults to Chat Completions and stores
  that protocol explicitly before it becomes current provider state.
- Bad: `deepseek` + `anthropic-messages` is rejected by both TypeScript and
  Rust validation before network access.
- Bad: connection check sends a tiny `ping` generation to infer support. This
  may bill the user and does not provide a stable cross-family contract.

### 6. Tests Required

- TypeScript: schema enum/draft defaults, supported matrix, strict persisted records, base
  URL paths, exhaustive adapter routing, buffered/stream protocol propagation,
  model-catalog parsing, and refined-schema consumers using `safeExtend` or a
  shared refined draft schema.
- Rust: serde round trips, effective defaults, unsupported combinations,
  provider id/kind/protocol/origin/path binding, protocol auth headers,
  stripped inbound auth headers, mapped/reserved address rejection,
  resolve-to-connect pinning, draft catalog checks, and buffered/stream proxy
  parity; UUID-only request registration, duplicate rejection, native
  cancellation, and the ordered native/desktop/packaged generation deadlines.
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

On macOS, a generic-password item created by a broad Keyring convenience API
can ask on every read even when it belongs to Cutout. Provider credentials need
a Cutout-scoped access rule, not a weaker login-Keychain policy.

The clean packaged macOS VM harness may project an existing host-owned Cutout
Provider credential into the ephemeral VM Keychain only through the audited
stdin-to-Keychain helper. The helper uses the stable `com.nebutra.cutout`
service and `provider:<id>` account, grants access only to the verified signed
E2E binary, never places the value in argv, a file, Provider metadata, WebView
state, or logs, and deletes the remote item after evidence collection. Its
partition list retains Apple's tool/application partitions plus the verified
Developer ID Team partition; a binary-only ACL without that partition list is
not sufficient for a signed packaged app to read the item through securityd.
The product still discovers and imports that credential through its normal
native candidate path; harness provisioning is not capability evidence.

The packaged journey does not alter text-route selection for a throughput
experiment. A text route and an image route are independently verified
capabilities: an image-only credential cannot be promoted to conversational or
planning work merely because its catalog contains a text-looking model name.

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

// Native-only: no secret is returned through IPC.
read_secret(provider_id: &str) -> Result<String, KeyError>
store_imported_key(provider_id: &str, secret: &str) -> Result<(), KeyError>
delete_imported_key(provider_id: &str) -> Result<(), KeyError>
```

Provider drafts carry only `candidateId`; connection checks and imports resolve
the current secret again inside Rust.

### 3. Contracts

- Resolve the selected Codex root from `CODEX_HOME` when present, otherwise
  exactly `<home>/.codex`. Discovery and draft secret re-resolution inspect
  only that root's exact `auth.json` through the shared bounded reader; there
  is no secondary Codex credential path.
- Reviewed process-environment relays are closed bindings, not arbitrary custom
  endpoints. `MOX_API_KEY` may bind only to
  `https://aigw.mox.ktvsky.com/v1`, and `TDS_API_KEY` only to
  `https://router.tds.cc.cd/v1`; a supplied `MOX_BASE_URL` or `TDS_BASE_URL`
  must normalize to that exact endpoint or the candidate is omitted. Both use
  Chat Completions, retain `gpt-5.5` only as a catalog-checked model hint, and
  still require authenticated `GET /models` before import or routing.
- The reviewed MOX macOS environment may install a split-DNS answer in a
  private range. Cutout never sends the credential to that private address.
  When and only when the exact reviewed MOX hostname resolves non-publicly,
  native networking pins the reviewed public A record while preserving TLS
  verification for `aigw.mox.ktvsky.com` and the no-redirect policy. Every
  other remote hostname with a non-public answer remains rejected.
- Read only exact supported files with the shared no-symlink, regular-file,
  1 MiB-bounded reader.
- Codex `auth.json` is reusable only when top-level `OPENAI_API_KEY` is a
  non-empty string. OAuth/session tokens and other fields are not API keys.
- A valid Codex auth-file key produces an OpenAI Responses candidate even when
  `config.toml` has no explicit OpenAI provider table.
- Codex auth-only, configured-provider, and root CC Switch candidates use the
  current `codex-auth-v1`, `codex-config-v1`, and
  `codex-root-cc-switch-v1` schemas respectively. Draft re-resolution remains
  bound to that current schema and the selected root's exact `auth.json`.
- If an explicit Codex OpenAI provider names an unavailable `env_key`, a valid
  auth-file API key is the native fallback. An available environment value
  remains authoritative for that candidate.
- Candidate and IPC serialization may expose the stable reference name
  `OPENAI_API_KEY`, but never its value.
- Imported secrets are persisted through Cutout's native OS credential vault;
  on macOS this is Keychain. The renderer receives only key status and may use
  platform-neutral visible copy such as `Cutout local credentials`.
- On macOS, each `com.nebutra.cutout` / `provider:<id>` generic-password item
  is first created through the native `SecItem` path so `securityd` retains its
  signed-app partition metadata, then receives a Security.framework ACL for
  the current signed Cutout process. Updating a credential applies that same
  ACL before changing the secret. A legacy item is migrated only after a
  successful normal read; a failed migration preserves the item and returns
  the opaque vault failure.
  The app must never grant arbitrary applications, the full login Keychain, or
  a caller-provided executable access. Secrets remain outside IPC, logs,
  environment variables, command arguments, and Provider metadata.
- A Codex root-level CC Switch profile is importable only when `base_url` is
  exactly `http://127.0.0.1:15721/v1`, `wire_api` is exactly `responses`, the
  auth file contains a non-empty top-level `OPENAI_API_KEY`, and neither
  `model_provider` nor `model_providers` is present. It projects a fixed
  `cc-switch` candidate and re-reads only the auth-file API key. Root-level
  experimental bearer/session material is never imported, and any other or
  ambiguous root-level Provider binding suppresses the public OpenAI fallback.
- A reviewed CC Switch installation may contribute its current Codex upstream
  plus its enabled Codex failover queue as direct `openai-compatible` +
  Responses candidates. The unique current row is first, followed by queue
  members in `COALESCE(sort_index, 999999), id` order; a current row that is
  also queued appears once, and discovery is bounded to 32 candidates.
  `cc-switch` remains the explicit loopback Provider kind: the persisted wire
  contract, renderer model descriptors, DAG/pipeline conditioning, and native
  image generation/editing endpoint selection must all include it through the shared
  `supportsOpenAIImageEndpoints` predicate. A native executor capability alone
  is not renderer routing evidence. Cutout reads only the
  exact `<home>/.cc-switch/cc-switch.db` path with SQLite read-only/no-create
  flags, a 256 MiB bound, before/after file-identity checks, and the expected
  `providers` schema, including `is_current`, `in_failover_queue`, and
  `sort_index`. At most one `codex` row may have `is_current = 1`.
- Each selected CC Switch row is importable only when `settings_config` has exactly the
  `auth` and `config` fields, `auth` has exactly one non-empty
  `OPENAI_API_KEY`, and the embedded Codex TOML has one unambiguous public HTTPS
  `base_url` with `wire_api = "responses"`. A pathless upstream is normalized
  to `/v1`; an explicit path is preserved. The database provider id and secret
  remain native and are never serialized. Draft check and import re-open the
  exact database and require the same opaque row identity, current/queue
  eligibility, endpoint, protocol, metadata fingerprint, and secret revision.
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
| Missing CC Switch database or no current/queued Codex row | Return no CC Switch upstream candidate |
| CC Switch database over 256 MiB, symlinked, replaced during read, schema-drifted, or writable-only | Reject before exposing a candidate |
| Multiple current CC Switch Codex rows, unknown settings/auth fields, ambiguous Codex provider tables, non-Responses wire API, or unsafe upstream URL | Reject the CC Switch source without weakening other valid discovery sources |
| Imported `cc-switch` route is absent from renderer text/image capability or OpenAI image-endpoint selection | Treat as a contract bug; keep the shared Provider-kind predicate, runtime descriptors, DAG/pipeline routing, and generation/editing transports aligned |
| Candidate disappears before draft check/import | Return `credential-missing` |
| Secret-store read/import fails | Return opaque `credential-unavailable` |
| New macOS Provider credential | Create only the stable service/account item with the current signed Cutout ACL |
| Legacy item readable after one OS confirmation | Best-effort migrate its ACL; preserve successful read even if the migration is refused |
| ACL creation/update fails | Keep the prior secret unchanged; delete a newly created incomplete item; return opaque vault failure |

### 5. Good / Base / Bad Cases

- Good: Codex `auth.json` contains an API key; Settings shows an enabled OpenAI
  candidate and Rust resolves it only when checking/importing the draft.
- Base: a custom Codex provider has a live `env_key`; discovery keeps using the
  environment reference without reading a different credential.
- Bad: serialize `auth.json`, an API-key prefix, or a masked key into the
  candidate to make the frontend perform secret selection.
- Bad: import Codex access/refresh tokens as OpenAI API keys.
- Good: a signed Cutout restart reads its own migrated Provider credential
  without presenting a Keychain confirmation dialog.
- Bad: implement “always allow” by weakening the login Keychain or granting
  every local executable access to Cutout's Provider items.

### 6. Tests Required

- Auth-only discovery yields OpenAI + Responses + importable metadata.
- A sentinel API key is absent from serialized candidate JSON but returned by
  the internal native resolver.
- Explicit OpenAI config with a missing environment variable falls back to the
  auth-file API key.
- OAuth-only and empty auth files yield no importable auth candidate.
- Symlinked and oversized auth files fail before parsing.
- CC Switch discovery uses the exact read-only database, returns the current
  route before its ordered failover queue, normalizes pathless HTTPS endpoints
  to `/v1`, re-resolves each selected row's secret, and serializes no database
  identity, credential, or settings payload. Membership or endpoint-binding
  drift makes an earlier candidate unusable.
- Provider-kind tests require `cc-switch` to default to Responses, remain
  eligible for reviewed text and image assignments, and use the same native
  generation, edit, and reference-conditioning path as OpenAI-shaped routes.
- Missing database, schema drift, symlinks, multiple-current rows, unknown
  settings/auth fields, unsafe or ambiguous upstreams, and candidate binding
  drift fail closed. A model hint with an empty checked catalog remains an
  error.
- Existing custom-provider environment discovery remains covered.
- Root-level Codex CC Switch discovery accepts only the exact loopback Responses
  profile, stays bound to the auth-file API key, ignores experimental bearer
  material, rejects ambiguous Provider tables, and never rebinds another
  root-level upstream credential to public OpenAI.
- macOS-only unit coverage validates stable service/account scoping and opaque
  errors; a signed packaged VM run verifies normal discovery, native secret
  read, catalog check, persistence, and absence of `SecurityAgent`. The test
  must use a dedicated VM Keychain item and may not modify the host Keychain.

### 7. Wrong vs Correct

#### Wrong

```rust
let available = env_key.and_then(std::env::var_os).is_some();
```

This treats a shell-only environment variable as the only possible Codex
credential and fails for normal desktop launches.

#### Wrong

```rust
// Gives every process access, or relies on a password prompt for every read.
keyring_entry.set_password(secret)?;
```

#### Correct

```rust
// macOS only: bind this one stable Provider item to the calling signed Cutout
// process through Security.framework, while keeping the secret native-owned.
store_imported_key(provider_id, secret)?;
```

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
- The retired broad local-Agent inventory is not a readiness or diagnostics
  surface. Default Settings projects configured Providers, persisted
  verification receipts, capability coverage, the supported system runtime,
  and only reviewed importable provider candidates into one outcome-led setup
  state.
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
- Generic route support is not full-prototype task fitness. Settings and
  ordinary edit-image may expose any exact executable route above, including
  GPT Image 1/1.5. Complete UI/UX Design System, page and resource production
  applies a second closed product-fit gate and currently admits only exact
  `gpt-image-2`, `qwen-image-3.0`, and `qwen-image-3.0-pro` ids. Health fallback
  may choose only within that task-fit set; absence fails before Provider prototype
  work instead of silently degrading visual fidelity.
- Planning chat and semantic Vision QA are separate task bindings. The resolved
  workspace route carries an exact verified `vision` assignment, and page,
  direct-asset, and board review consume only that assignment. They never fall
  back to `chat` or a planning-only system runtime. A missing, stale, or
  capability-ineligible Vision binding fails QA preflight before review; using
  a different Provider from the route that actually produced the bytes permits
  a bounded independent overlap lane. Same-Provider review may still overlap
  logically, but consumes `providerLane()` under the shared production ceiling.
  Vision settlement never contributes image-route recovery or pressure evidence.
- Reviewed image-model evidence is Provider-neutral. It records only the exact
  model id, capability, source, and capture/version identity; it must not carry
  an adapter family or Provider classification. An authenticated endpoint model
  list proves only that the configured Provider exposes that exact id. Cutout
  intersects these independent facts with the Provider adapter at route
  assessment time. The reviewed 2026-07-25 Image Edit Arena roster may establish
  `image-edit` evidence for an exact listed id, but its rank never establishes
  transport support, generation capability, or a high-fidelity recommendation.
- Manual Provider verification and automatic credential setup must project the
  same reviewed exact-model evidence. A user who verifies and selects a listed
  edit model must not remain permanently `evidence-required`; an unlisted
  `/models` row remains capability-unknown until separate observed/verified
  evidence exists.
- `image-generation` and `image-edit` are independent task routes. Automatic
  setup, desktop Provider-tool capability projection, and prototype execution must
  honor separate bindings when different exact models own those capabilities.
  The derived primary image projection is only a convenience view; it must not cause an
  available edit route to be ignored or a generation-only route to be advertised
  for editing.
- Automatic nomination may recognize image-family ids such as `seedream-*` and
  `reve-*`, while exact observed/verified descriptors may nominate models whose
  ids contain no image keyword. Nomination is discovery only: exact route
  evidence and an implemented adapter still decide support.
- OpenAI-shaped image routes have implemented generation and edit adapters.
  Google/Gemini routes use `google-multimodal-generate` for both generation and
  reference-conditioned editing; edit dispatch supplies the complete edit
  instruction, one text framing part and every locked reference image to the
  existing GenerateContent image-output path. A missing image output is
  terminal and never falls back to prompt-only generation.
- DashScope compatible-mode remains text-only. A `dashscope` Provider bound to
  the reviewed first-party
  `https://dashscope.aliyuncs.com/compatible-mode/v1` connection may separately
  use `dashscope-native-image-generation` or `dashscope-native-image-edit` when
  the exact model has observed or verified evidence and appears in the closed
  native model/operation contract. Static Provider adapter capability metadata
  describes the available adapter only; it never substitutes for exact-model
  evidence or authenticated catalog presence.
- The first-party `xai` Provider keeps Chat Completions as its text wire
  protocol and separately exposes the documented JSON
  `/v1/images/generations` and `/v1/images/edits` contracts through
  `xai-images-generations` and `xai-images-edits`. Generation requests ask for
  `b64_json`; edit requests preserve one reference in `image` or two-to-three
  ordered references in `images`, encode only bounded PNG/JPEG/WebP data URIs,
  and also require inline output. The OpenAI multipart edit command is never
  used for xAI.
- Only authenticated catalog presence for the currently documented exact
  `grok-imagine-image` and `grok-imagine-image-quality` ids contributes reviewed
  xAI generation/edit evidence. Imagine Image 2.0's August 7 quality evidence
  makes it a future high-fidelity candidate, but the announcement says API
  access is still coming and the public API catalog does not expose a 2.0 model
  id. Cutout must not invent one or advertise 2.0 execution before that changes.
  Arena-only labels, including version strings that differ from the public xAI
  API catalog, remain recommendation evidence only and cannot select an xAI
  transport even if a caller supplies an observed descriptor. The generation
  service repeats this exact-model check before network admission. Base64 xAI
  output is media-sniffed because the documented response may omit a MIME field;
  a URL-only response cannot fall through to renderer-side fetching after Cutout
  requested inline output.
- The exact lowercase `qwen-image-3.0` and `qwen-image-3.0-pro` ids receive
  reviewed generation and edit evidence only when present in the authenticated
  catalog. Case variants, `image-3`,
  `image-3-pro`, and other marketing aliases have neither evidence nor a native
  strategy. Image 3 requests use the documented synchronous response contract
  and never send `X-DashScope-Async`; an async task-shaped response is invalid.
  Only closed older model/operation contracts retain async submission, bounded
  polling, and best-effort remote cancellation.
- Rust fixes the legacy Beijing native request/task origins, reads the same
  Provider's keychain secret, and preserves every edit reference as a bounded
  data image. Image 3 editing requires 1-3 ordered references of at most 10 MB
  each. Cutout deliberately accepts only PNG, JPEG, and WebP reference bytes;
  BMP, TIFF, GIF, unknown media, and over-limit input fail before a Provider
  request. An explicit Image 3 `size` must have pixel area from `512*512`
  through `2048*2048` and aspect ratio from 1:8 through 8:1.
- The reviewed native binding remains the legacy Beijing
  `https://dashscope.aliyuncs.com` origin. Singapore and workspace-specific
  origins are not accepted until regional key, endpoint, entitlement, and
  result-origin binding evidence is closed. Result downloads accept only HTTPS
  `dashscope-result-*.oss-cn-*.aliyuncs.com` origins after DNS validation, use
  no Provider authorization header, and enforce content-type, image-magic and
  byte limits. A renderer cannot supply a native endpoint, task URL or result
  origin.
- Provider kind, catalog presence, compatible-mode support and model-name
  heuristics alone never authorize an image call. The desktop capability carries
  the closed assessed transport strategy into execution; an absent or mismatched
  strategy fails before a Provider image request.
- Automatic setup first imports reviewed candidates until the configured
  results cover every required task dimension. After coverage becomes complete,
  it may attempt exactly one additional available/importable candidate so the
  verified descriptor set can retain an independently routed image fallback.
  That bounded probe uses the same native re-read, authenticated catalog, exact
  capability-evidence, and typed-transport checks as the primary route. Its
  failure does not invalidate already-complete coverage, and setup never scans
  a third post-coverage candidate.
- Among equally available/importable candidates, Cutout-owned Keychain metadata
  is attempted before Agent-derived metadata because it carries the exact
  persisted Provider kind, base URL, wire protocol and model hint for that
  credential. This authority order does not change model ranking and does not
  make any Provider family a global default. When no Cutout-owned candidate is
  available, reviewed Coding Agent candidates remain reusable as before.
- Importable candidates that match an existing Provider's kind, effective wire
  protocol, and normalized base URL are omitted from setup suggestions. Repair
  the existing connection instead of adding a duplicate Provider.
- Suggestion deduplication does not remove a reviewed available/importable
  candidate from automatic repair while setup is incomplete. Rust revalidates
  exactly one matching existing Provider in place by kind, effective protocol,
  and normalized base URL, using that Provider ID's current Keychain secret. It
  neither derives a second Provider ID nor imports/replaces candidate credential
  material. Multiple matching persisted Providers are an ambiguous conflict.
- Discovery isolates malformed Agent-owned configs by reviewed adapter. One bad
  Agent source contributes no candidates, but it does not discard valid
  candidates from another Agent source; if every source is empty or invalid,
  the first bounded error remains visible.
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
| Required coverage is complete and another importable candidate exists | Attempt only the next candidate; retain it only through normal verification and stop before any later candidate |
| The one post-coverage candidate fails verification | Preserve the complete setup, record no fallback Provider, and stop probing |
| Candidate resolves to an already configured connection | Omit the duplicate import action and expose Provider management |
| Automatic repair resolves to exactly one configured connection | Recheck its catalog with its existing Keychain secret and preserve its Provider ID and credential |
| Automatic repair resolves to multiple configured connections | Reject the ambiguous binding; do not derive or import another Provider |
| One Agent credential config is malformed while another is valid | Reject the malformed source and retain the other reviewed candidate |
| Discovery fails after a verified full-coverage setup is ready | Keep the ready outcome; discovery is not required for continued use |

### 5. Good / Base / Bad Cases

- Good: a reviewed Kimi config binds `KIMI_API_KEY` to
  `https://api.kimi.com/coding/v1`; check succeeds, then import re-reads the
  same candidate and secret revision before atomic persistence.
- Base: an unsupported Agent has no inventory row and produces no parse attempt;
  only a reviewed credential adapter or supported runtime can contribute setup
  evidence.
- Good: a verified full-coverage Provider produces one `AI is ready` outcome;
  one additional verified Provider may contribute fallback descriptors without
  repeating the local Agent inventory or changing the outcome surface.
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
  precedence, Qwen unknown providers, Kimi TOML/environment precedence, and
  Vibe dotenv export/duplicate/interpolation/command rejection.
- Settings setup projection: loading, configuration failure, discovery failure,
  complete and incomplete verification evidence, disabled Providers, verified
  capability gaps, ready state, importable candidate actions, existing-
  connection deduplication, source-label ownership, advanced-management
  disclosure, and five-locale catalog parity.
- Automatic setup: continue until required coverage, attempt at most one
  post-coverage candidate, persist both verified descriptor sets when that
  candidate succeeds, and stop before a third candidate whether the bounded
  fallback probe succeeds or fails.
- Projection/native repair: keep setup suggestions deduplicated while forwarding
  matching reviewed candidates to automatic repair; cover normalized unique
  matching, ambiguous matches, stable Provider IDs, and existing-credential use.
- Agent discovery: a malformed source does not erase a valid candidate from a
  different reviewed Agent adapter, while all-invalid discovery still fails.

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

## Scenario: Run The System Planning Runtime

### 1. Scope / Trigger

Use this contract when changing desktop system-Agent discovery, sanitized
authentication evidence, planning-runtime selection, readiness projection, or
public capability claims. A system runtime is a planning adapter, never a
`ProviderConfig` or a source of direct Provider credentials.

### 2. Signatures

```ts
type PlanningRuntimeEvidence = {
  runtimeId: 'codex-system'
  installed: boolean
  authenticated: boolean
  authClass: 'chatgpt' | 'api-key' | 'access-token' | 'unauthenticated' | 'unknown'
  capability: 'proven' | 'unsupported' | 'unknown'
  execution: 'unproven' | 'succeeded' | 'failed' | 'stale'
  lastFailure?: 'upstream-unavailable' | 'model-output-invalid' | 'runtime-failed'
  version?: string
  reason?: StableRuntimeReason
}

probeCodexSystemRuntime(): Promise<PlanningRuntimeEvidence>
runCodexSystemTurn(input: CodexTurnStartInput): Promise<CodexTurnResult>
steerCodexSystemTurn(requestId: string, text: string): Promise<boolean>
interruptCodexSystemTurn(requestId: string): Promise<boolean>
resetCodexSystemConversation(workspaceHandle: string, conversationId: string): Promise<boolean>
```

Renderer commands accept only opaque workspace/conversation/request identities,
typed planning content, and the Cutout-owned output schema. They have no binary,
path, argv, environment, working-directory, account, credential, dynamic-tool,
or sandbox parameter.

### 3. Contracts

- Native code owns executable discovery, platform identity validation, fixed
  read-only probe commands, environment filtering, bounded output, timeout,
  and process-group termination. Raw command output is discarded natively.
- Cutout code never opens, copies, serializes, logs, imports, or reinterprets
  Codex OAuth/session payloads as direct Provider keys. The isolated runtime
  home may reference the exact Codex-owned auth file so the owning signed
  runtime can authenticate itself.
- Evidence advances in order: installed, authenticated, capability-proven,
  then execution-proven. Capability evidence cannot be proven without an
  installed authenticated runtime, and terminal execution evidence cannot
  exist without capability evidence.
- Background discovery and Settings refresh may inspect sanitized auth and
  protocol capability without starting a model turn. Only a completed
  user-started turn can establish successful execution evidence.
- Runtime selection considers both capability and latest execution health. A
  failed or stale system runtime is not silently preferred over a healthy
  verified direct-text fallback before the next turn starts.
- Packaged journey completion counts schema-valid planning turns independently
  of whether `codex-system` or the verified direct Provider route executed
  them. Sanitized evidence records the total plus per-runtime counts and rejects
  any provenance sum mismatch. A direct fallback can prove the product planning
  journey, but it never establishes Codex execution evidence or changes the
  public `conversationBinding` / `turnExecution` release gate.
- A turn uses a native-written strict configuration, empty environments and
  dynamic tools, disabled MCP/skills/apps/plugins/web/image/Agent surfaces,
  staged context under a native-owned root, read-only sandboxing, `never`
  approval, schema-bound output, bounded protocol parsing, and fail-closed tool
  event detection. Generated method names alone are insufficient; the complete
  reviewed zero-tool field set must be present before capability is proven.
- Opaque thread bindings are persisted only after a schema-valid completed
  turn. A stale resume invalidates only the matching binding. Terminal failures
  expose and persist only a closed `lastFailure` reason.
- Terminal failure classification is turn-scoped, not event-local. Preserve
  only reviewed structured retry evidence for the active thread and turn until
  `turn/completed`; if Codex later collapses the terminal `codexErrorInfo` to
  `other` or null, that evidence may recover the closed failure reason. An
  explicit terminal reason always takes precedence.
- A schema-valid `turn/completed` event whose status is `failed` is a runtime
  turn failure, not protocol drift. Keep malformed/missing protocol fields on
  the non-retryable protocol path; expose the valid terminal failure as a
  retryable closed reason so an already verified direct Provider can own the
  next bounded attempt.
- Never infer a failure kind from `message`, `additionalDetails`, app-server
  stderr, or the Codex log database. Those surfaces may contain Provider or
  credential-shaped text and are not stable protocol authority.
- Public `conversationBinding` and `turnExecution` remain false until a signed
  packaged app completes a real turn against a healthy upstream. This release
  gate does not turn an internal desktop execution path into a headless claim.
- The desktop runtime is distinct from the CLI/MCP headless host. Public
  manifest and documentation claims must preserve `headlessAvailable: false`
  and must not imply a bundled headless system-Agent executor.
- Claude session execution remains `policy-review-required`; technical CLI
  availability alone is not product authorization.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Executable absent | Return sanitized `not-installed` evidence |
| Unsupported platform or rejected executable identity | Return a closed unsupported reason without running further probes |
| Raw auth output contains account or secret-shaped text | Project only the closed auth class; expose none of the raw text |
| Generated protocol schema omits a required method or zero-tool control | Return `protocol-unsupported` before starting a turn |
| Latest system execution is failed or stale and a verified direct route exists | Select the direct route before starting a new turn |
| Renderer supplies a path, argv, environment, working directory, or generic app-server request | No such IPC command or field exists |
| Runtime emits a tool request/event, oversized/malformed protocol data, or schema-invalid output | Terminate the owned process group and fail with sanitized evidence |
| Retry events carry a reviewed upstream status but the terminal event reports generic `other`/null | Use the same-turn structured retry evidence; expose only `upstream-unavailable` |
| Terminal event reports an explicit auth, policy, or other non-upstream reason after retries | Preserve the explicit terminal classification; never overwrite it from earlier retry evidence |
| Signed packaged turn proof has not succeeded | Keep public conversation/turn capability false without disabling truthful internal diagnostics |

### 5. Tests Required

- Frontend schema rejects unknown fields, contradictory auth state, skipped
  progressive evidence, failure reasons without failed execution, and execution
  evidence without capability proof.
- Planning selection prefers healthy capability-proven Codex, uses the direct
  fallback for unsupported/failed/stale Codex evidence, and returns no route
  when neither adapter is eligible.
- Packaged evidence accepts a successful direct fallback as a planning turn,
  requires total planning turns to equal the sum of closed runtime counters,
  and reports a typed planning-evidence mismatch instead of an unknown failure.
- Native tests cover platform identity, command timeout/output overflow,
  sanitized auth projection, required protocol methods and zero-tool fields,
  cancellation during handshake/turn execution, stale binding isolation,
  output-schema validation, multi-event retry exhaustion, explicit-terminal
  precedence, closed terminal failures, and absence of renderer-controlled
  process/path authority.
- Tauri permission tests keep the allowlist to the fixed probe, turn, steer,
  interrupt, and conversation-reset commands and reject generic process or
  app-server authority.
- Run `pnpm agent:validate`, `pnpm lint`, TypeScript, focused Vitest and Rust
  tests, `cargo fmt --check`, production build, and `git diff --check`.

## Scenario: Optional OpenAI Image Edit Fields

### 1. Scope / Trigger

Apply whenever the OpenAI-shaped `/images/edits` request, its native multipart
builder, edit-route execution or reference-conditioned prototype generation
changes.

### 2. Signatures

```ts
interface EditImageInput {
  readonly images: readonly Uint8Array[]
  readonly inputFidelity?: 'high' | 'low'
  readonly signal?: AbortSignal
}

ai_image_edit(
  provider_id: String,
  model: String,
  images: Vec<Vec<u8>>,
  input_fidelity: Option<String>,
) -> Result<ImageEditResult, ProxyError>
```

### 3. Contracts

- Model capability evidence and an OpenAI-shaped Provider adapter authorize the
  edit route; they do not prove support for every optional OpenAI field.
- The normal high-fidelity attempt sends `input_fidelity=high`.
- Only an HTTP 400 from that high-fidelity attempt may retry once with the field
  omitted. Explicit low fidelity, authentication, rate limits, server failures,
  timeouts, transport failures and cancellation do not use this downgrade.
- Native multipart construction omits `input_fidelity` when its value is absent;
  it must not restore a hidden default.
- A workflow with reference images and no executable edit route fails before an
  unconditioned generation. Dropping references changes the requested outcome.
- The outer desktop attempt remains one receipted operation with a finite
  deadline and one owning AbortSignal.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| High fidelity succeeds | Return its images; one native call |
| High fidelity returns HTTP 400 | Retry once with no `input_fidelity` |
| Explicit low fidelity returns HTTP 400 | Return failure; no downgrade |
| HTTP 401/403/429/5xx or transport failure | Preserve classified failure; no optional-field retry |
| Owner signal aborts before or between calls | Stop; never publish a late result |
| References exist but edit route is unavailable | Fail capability preflight; never generate without them |

### 5. Good / Base / Bad Cases

- Good: a compatible relay rejects `input_fidelity`, accepts the same multipart
  request without it, and the reference-conditioned result keeps one receipt.
- Base: OpenAI accepts high fidelity on the first attempt.
- Bad: catch every edit error and call image generation with no references, or
  retry a 401/429 as though an optional field caused it.

### 6. Tests Required

- TypeScript service tests assert high-first/null-second arguments for HTTP 400,
  one call for 401, and no downgrade for explicit low fidelity.
- Rust tests build multipart forms both with and without the optional field.
- Component E2E asserts every Design System candidate attempt has a start and
  terminal run event and complete suites retain all planned resource bindings.
- Desktop tool-loop tests cover deadline and external cancellation.

### 7. Wrong vs Correct

```ts
// Wrong: compatibility failure silently erases the user's reference.
const edited = await editImage(input).catch(() => null)
return edited ?? generateImages({ prompt: input.prompt })

// Correct: downgrade only the optional field; otherwise preserve failure.
try {
  return await invokeEdit('high')
} catch (error) {
  if (!isHttp400EditFailure(error)) throw error
  return invokeEdit(null)
}
```

## Scenario: Select A Direct Text Route From Execution Health

### 1. Scope / Trigger

Apply when automatic setup, direct planning, Provider verification, text-route
selection, generation error classification, or GUI Retry behavior changes.

### 2. Signatures

```ts
verifiedTextRouteCandidates(input): readonly ModelAssignment[]
TextRouteHealthRegistry.run(route, operation): Promise<T>
TextRouteHealthRegistry.prefer(routes): readonly ModelAssignment[]
```

### 3. Contracts

- An enabled Provider plus an authenticated exact-model catalog row creates a
  cold candidate. It proves credential/catalog access, not text execution.
- Only a real tool-gate turn records execution health. Retain the exact route,
  closed outcome and bounded latency; never retain prompts, errors, credentials
  or local paths in health state.
- A successful route ranks before cold candidates. A transiently failed route
  ranks behind successful and cold candidates; terminal and cancelled routes
  do not authorize automatic failover.
- Explicit HTTP status outranks overlapping response prose: 429 is transient,
  401 is credential failure, and 403 is policy failure. Cancellation remains
  highest priority.
- Failover is a user-owned GUI Retry. Retry reloads Provider configs, capability
  bindings and verification receipts, freezes one immutable run snapshot, and
  starts a new run/remote request. It does not silently replay a tool loop whose
  clarification or tool side effects may already have executed.
- Qwen-first ordering is permitted only in the packaged throughput experiment.
  Normal product routing preserves the configured exact binding until runtime
  health demotes it.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `/models` lists an exact text model | Admit one cold candidate; do not mark it healthy |
| Direct turn succeeds | Record anonymous success and prefer the route |
| Direct turn returns HTTP 429 with API-key/quota prose | Record transient failure and expose Retry |
| Direct turn returns HTTP 401 or 403 | Preserve terminal class; do not fail over automatically |
| Retry begins after a transient failure | Re-read authority, choose the best eligible route, freeze a new run snapshot |
| Retry succeeds through a sibling route | Keep one user turn, append the response, and retain two distinct run attempts |

### 5. Good / Base / Bad Cases

- Good: MOX returns 429; Retry starts a new run through authenticated
  `dashscope/qwen-plus`, while the transcript still contains one submitted user
  message.
- Base: the configured route succeeds and remains preferred.
- Bad: treat `/models` success as execution readiness, retry MOX silently inside
  the same tool loop, or persist its response body in route health.

### 6. Tests Required

- Unit tests distinguish cold, successful, transient, terminal and cancelled
  health without retaining error text.
- Error-classification tests cover 429 bodies that mention API keys plus 401/403
  precedence.
- Component integration starts on one direct Provider, observes a real 429
  result, clicks GUI Retry, proves the exact sibling Provider/model receives the
  next tool-gate turn, and asserts one user bubble plus distinct run IDs.
- Type-check, lint, `pnpm agent:validate`, and `git diff --check` must pass.

### 7. Wrong vs Correct

```ts
// Wrong: catalog discovery is treated as a successful generation probe.
if (verification.models.includes(model)) route.health = 'ready'

// Correct: catalog evidence admits a cold candidate; a real turn owns health.
const candidates = verifiedTextRouteCandidates(input)
const selected = health.prefer(candidates)[0]
await health.run(selected, () => executeToolGate(selected))
```
