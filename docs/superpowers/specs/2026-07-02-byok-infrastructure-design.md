# Cutout — BYOK Infrastructure Design Spec

**Status:** design for review · **Depends on:** the shipped services/query seams (`src/services`, `hooks/queries`) · **Scope:** key management + provider abstraction + secure AI transport. **Not** in scope: the actual generative features (infill, cloud cutout) — this builds the plumbing they will call.

---

## 1. Goals & the core tension

Cutout's roadmap is AI-native (generative infill, cloud cutout, variant generation). Those need model access, and the product is **BYOK** — the user supplies their own provider keys. This spec builds that infrastructure, not the features on top.

Three locked decisions (from design Q&A):
1. **Provider = both** — direct BYOK *and* AI Gateway, with Gateway modeled as just another provider.
2. **Storage = OS-native keychain** (Rust `keyring` crate) — never localStorage, never plaintext, no master password.
3. **Transport = Rust-proxied** — the key never enters the webview.

**The tension & the resolution.** Decision 3 ("key never in webview") appears to fight the earlier ask ("use libraries, *especially for Provider*" → Vercel AI SDK, which is JS). They are reconcilable with a **custom-fetch auth proxy**:

> The **AI SDK (v6) runs in the webview** and does all provider-specific work — request shaping, model slugs, streaming parse, tool calling, structured output. Its provider factories are given a **dummy key** and a **custom `fetch`**. That `fetch` forwards the request to a **Rust command**, which looks up the real key in the OS keychain, injects the `Authorization`/`x-api-key` header, performs the request with `reqwest`, and streams the response back. **The key exists only in Rust; the webview never sees it.**

This keeps the wheel (AI SDK provider layer) *and* honors "key never in webview" — Rust is a thin auth-injecting proxy, not a reimplementation of provider logic. **This is the recommended design; confirm at review.** (Strict alternative — pure Rust provider clients with no AI SDK — is documented in §10 as the fallback if any request-building in JS is unacceptable.)

---

## 2. The wheels (libraries used)

| Layer | Library | Version | Role |
|---|---|---|---|
| Provider abstraction | `ai` (Vercel AI SDK v6) | `^6.0.0` | unified `generateText`/`streamText`/`Output.object`/tools across providers |
| Direct providers | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` | `^3.x` | `createAnthropic({ apiKey, baseURL, fetch })` etc. — the custom-fetch hook lives here |
| Gateway provider | `@ai-sdk/gateway` | `^3.x` | one entry → many models via Vercel AI Gateway |
| Secure storage | `keyring` (Rust crate) | `3` | macOS Keychain / Win Credential Manager / Linux secret-service |
| HTTP + streaming (Rust) | `reqwest` | `0.12` (features `json`, `stream`) | the actual authenticated request |
| IPC streaming | `@tauri-apps/api/core` `Channel` | (installed) | stream response bytes Rust → JS for the custom fetch |
| Validation | `zod` | (installed) | provider-config + settings-form schemas |

No new UI library — reuse shadcn (Dialog/Input/Select/Badge/Sonner) already vendored.

---

## 3. Architecture

```
┌───────────────────────────── REACT WEBVIEW (no key ever) ─────────────────────────────┐
│                                                                                        │
│  Settings UI (shadcn)            services/ai/**                    hooks/queries/       │
│  ProviderSettingsDialog   →  ProviderService (interface)      • useProviders()          │
│   · add / test / remove      GenerationService (interface)    • useProviderStatus(id)   │
│   · shows STATUS only,       ────────────┬───────────────     • useSetKey / useTestKey  │
│     never the key                        │                       (mutations)            │
│                                          ▼                                              │
│                              AI SDK v6 (the wheel)                                      │
│                        createAnthropic({ apiKey:'__managed__', fetch: tauriFetch(id) }) │
│                        createOpenAI / createGoogle / gateway(...)                       │
│                                          │  generateText / streamText / Output.object   │
│                                          ▼                                              │
│                          tauriFetch(providerId): custom fetch                           │
│                          → invoke('ai_proxy_stream', { providerId, url, method,         │
│                                     headers(NO auth), body }) + Channel<Uint8Array>     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │  Tauri IPC (body only, never a key)
┌────────────────────────────────────────────┴───────────────────────────────────────────┐
│                           RUST (src-tauri) — the key lives here                          │
│  commands/ai_proxy.rs                          commands/keys.rs                          │
│   ai_proxy_stream(providerId,url,method,        set_key(providerId, secret)  → keychain  │
│     headers,body, channel):                     key_status(providerId) → bool (never val)│
│     1. secret = keyring.get(providerId)         delete_key(providerId)                   │
│     2. inject auth header per provider kind     list_provider_status() → [{id, hasKey}]  │
│        (anthropic: x-api-key + version;          test_key(providerId) → ok|error         │
│         openai/gateway: Bearer)                                                          │
│     3. reqwest stream → channel.send(bytes)     keyring crate → OS keychain              │
│  (key is read, used, dropped; never serialized back to JS)                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why the webview never holds the key:** the custom `fetch` sends the AI SDK's request *without* an auth header. Rust injects it from the keychain. Responses stream back as bytes. The only key-adjacent JS is the *provider id* string.

---

## 4. Provider model (data)

A provider is a user-configured connection. Modeled uniformly so Gateway is "just a provider".

```ts
// services/ai/provider-types.ts
type ProviderKind = 'anthropic' | 'openai' | 'google' | 'gateway' | 'openai-compatible'
type ProviderWireProtocol =
  | 'responses'
  | 'chat-completions'
  | 'anthropic-messages'
  | 'google-generate-content'

interface ProviderConfig {
  id: string                 // stable uuid; also the keychain entry name
  kind: ProviderKind
  label: string              // user-facing ("My Anthropic", "Team Gateway")
  baseURL?: string           // required for 'openai-compatible'; optional override otherwise
  wireProtocol?: ProviderWireProtocol // omitted only by legacy records; defaults by kind
  defaultModel: string       // e.g. 'anthropic/claude-sonnet-4.6' (gateway) or 'claude-sonnet-4.6'
  enabled: boolean
  // NO key field — the secret lives in the OS keychain, referenced by `id`
}
```

- **Provider list** (the non-secret config) is stored as JSON in the app config dir (Tauri path API), *not* in the keychain — only the secret is in the keychain.
- **Keychain entry:** service = `com.nebutra.cutout`, account = `provider:{id}`. One secret per provider.
- Host policy remains keyed by `kind`, while auth-header shaping follows the validated effective `wireProtocol`: OpenAI protocols use Bearer auth, Anthropic Messages uses `x-api-key` + `anthropic-version`, and Google GenerateContent uses `x-goog-api-key`. Gateway and local profiles retain their dedicated kind policies. The webview cannot supply raw auth headers.
- Connection checks use authenticated model-catalog reads only. They do not issue generation requests or claim end-to-end generation success; protocol viability is enforced by the closed kind/protocol matrix and exhaustive local adapter, URL, and auth construction.

---

## 5. TypeScript surface (fits the existing services layer)

Extends the shipped `ServiceRegistry` (spec of the app §5) with two interfaces:

```ts
// services/ai/types.ts
interface ProviderService {
  list(): Promise<ProviderConfig[]>
  upsert(cfg: Omit<ProviderConfig,'id'> & { id?: string }): Promise<ProviderConfig>
  remove(id: string): Promise<void>
  setKey(id: string, secret: string): Promise<void>          // secret → Rust → keychain, never stored in JS state
  status(id: string): Promise<{ hasKey: boolean }>           // status only; secret never returned
  test(id: string): Promise<Result<{ model: string }>>       // cheap round-trip via the proxy
}

interface GenerationService {                                 // what future features call — proves the seam
  generateText(i: { providerId: string; model?: string; prompt: string; signal?: AbortSignal }): Promise<Result<string>>
  streamText(i: { providerId: string; model?: string; prompt: string }): AsyncIterable<string>
  // later: generateImage / infill — same provider plumbing
}
```

- `createLocalRegistry` gains `providers` + `generation`, wired to the Tauri bridge. Components consume via `useServices()` — unchanged pattern.
- **`GenerationService` is implemented with the AI SDK** (`generateText`/`streamText`) using provider factories built with the custom `tauriFetch(providerId)`. This is where the wheel does its work.
- TanStack Query keys: `providerKeys.list`, `providerKeys.status(id)`; mutations `useSetKey`, `useTestKey`, `useUpsertProvider`, `useRemoveProvider` (invalidate `providerKeys.all`).

---

## 6. Rust surface (src-tauri)

New module `commands/ai/`:
- `keys.rs` — `set_key`, `key_status`, `delete_key`, `list_provider_status` via `keyring::Entry::new("com.nebutra.cutout", &format!("provider:{id}"))`. `set_password` / `get_password` / `delete_password`. **`get` is used only internally by the proxy — never exposed to JS.**
- `ai_proxy.rs` — `ai_proxy_stream(provider_id, kind, wire_protocol, url, method, headers, body, on_chunk)`: validate the kind/protocol pair, read the secret from the keychain, inject protocol-specific auth, stream response bytes through the `Channel`, and send a terminal marker. `ai_proxy_request` carries the same validated protocol for buffered calls.
- `providers.rs` (optional) — persist/load the non-secret `ProviderConfig[]` JSON via `tauri::path` app-config dir (or keep in JS + Tauri fs; decision at review).
- Register in `lib.rs` `generate_handler!`. Add `keyring = "3"`, `reqwest = { version = "0.12", features = ["json","stream"] }`, `futures-util` to `Cargo.toml`.
- **Capabilities:** these are custom commands (not the fs/dialog plugins), so they're allowed via the app's command ACL; no broad network permission is granted to the webview. The webview cannot make arbitrary authed calls — only through these typed commands.

---

## 7. Settings UI (shadcn, reuse only)

`components/settings/ProviderSettingsDialog.tsx` (opened from `SettingsMenu`):
- List of providers (Badge: `kind`, status dot = has-key/tested/failed).
- Add/edit form: `label`, `kind` (Select), `baseURL` (shown for `openai-compatible`), `defaultModel`, and a **key field** (password input) — on save, the secret goes straight to `setKey()` → Rust; it is **never** put in Zustand/Query state, never echoed back, cleared from the form on submit.
- **Test** button → `test()` round-trip → toast.
- Remove → AlertDialog confirm → `remove()` + `delete_key`.
- The key is **write-only from the UI's perspective**: you can set or replace it, never read it back. Status is shown as "已配置 / 未配置 / 校验通过 / 校验失败".

---

## 8. Data flow — "user adds an Anthropic key, then a feature generates text"

```
1. SET KEY
   ProviderSettingsDialog save → useSetKey.mutate({id, secret})
     → providerService.setKey(id, secret) → invoke('set_key', {providerId:id, secret})
       → Rust keyring.set_password(...)   [secret leaves JS immediately, lands in OS keychain]
     form field cleared; Query invalidates providerKeys.status(id) → status dot = 已配置

2. TEST
   useTestKey → test() → generation via a 1-token request through the proxy → ok/fail toast

3. FEATURE GENERATES (future infill/cutout calls this)
   generationService.streamText({providerId, prompt})
     → AI SDK streamText({ model: createAnthropic({apiKey:'__managed__', fetch: tauriFetch(id)})('claude-…') , prompt })
       → AI SDK builds the Anthropic request (url, body, headers minus auth)
       → tauriFetch(id): invoke('ai_proxy_stream', {providerId:id, url, method, headers, body}, Channel)
         → Rust: secret = keyring.get(id); headers += x-api-key:secret, anthropic-version:…
                 reqwest stream → Channel chunks → JS ReadableStream → AI SDK parses SSE
       → AI SDK yields text deltas to the UI
   Key path: keychain → Rust memory (request scope) → provider. Never JS. Never disk (except keychain). Never logs.
```

---

## 9. Security checklist (this is the point of the design)

- ✅ Key never in webview JS, never in Zustand/Query cache, never in a React prop, never in `localStorage`.
- ✅ Key at rest only in the OS keychain (`keyring`), namespaced by app id + `provider:{id}`.
- ✅ `get_password` is internal to Rust; no command returns a secret to JS. UI shows status only.
- ✅ Redaction: Rust never logs the secret or the injected header; the `tauri-plugin-log` calls scrub auth.
- ✅ The webview has no blanket network capability — only the typed `ai_proxy_*` commands, so a compromised page can't exfiltrate to arbitrary hosts with the key (Rust controls the target URL host allowlist per provider kind).
- ✅ `test()` uses a minimal request; failures return sanitized errors (no key echo).
- ✅ Provider config JSON (non-secret) is the only thing on disk in app-config; contains no secrets.
- ⚠️ Follow-up: optional per-provider host allowlist in Rust (anthropic.com / openai.com / gateway.ai.vercel / user baseURL) to harden SSRF via `openai-compatible` baseURL.

---

## 10. File-tree additions

```
src-tauri/src/commands/ai/
  mod.rs · keys.rs · ai_proxy.rs · providers.rs · auth_header.rs (per-kind header map)
src/services/ai/
  types.ts · provider-types.ts
  provider-service.local.ts      # ProviderService via invoke(set_key/status/…)
  generation-service.local.ts    # GenerationService via AI SDK + tauriFetch
  tauri-fetch.ts                 # the custom fetch → ai_proxy_stream + Channel→ReadableStream
  models.ts                      # per-kind default model lists (slugs)
src/hooks/queries/providers.ts   # keys + useProviders/useProviderStatus/useSetKey/useTestKey/…
src/components/settings/
  ProviderSettingsDialog.tsx · ProviderForm.tsx · ProviderRow.tsx · KeyField.tsx
```

**Strict fallback (only if any JS request-building is unacceptable):** drop AI SDK; implement providers with Rust crates (`async-openai`, a hand-rolled Anthropic client) behind `GenerationService`. Loses the wheel, the unified tool/structured-output API, and future provider coverage — not recommended, documented for completeness.

---

## 11. Phased plan

- **Phase 1 — Keychain core:** `keys.rs` + `ProviderService.setKey/status/remove` + provider-config persistence + Settings UI (add/remove/status, no generation yet). Rust unit tests for the keychain round-trip (mock/feature-gated).
- **Phase 2 — Proxy + one provider:** `ai_proxy_request` (non-stream) + `tauriFetch` + `GenerationService.generateText` via `@ai-sdk/anthropic`. `test()` works end-to-end. This proves the whole chain on the simplest path.
- **Phase 3 — Streaming:** `ai_proxy_stream` + `Channel`→`ReadableStream` + `streamText`. This is the riskiest bit (§13).
- **Phase 4 — Multi-provider + Gateway:** add `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/gateway`, `openai-compatible` baseURL; per-kind auth map + host allowlist.
- **Phase 5 — Hardening:** redaction audit, SSRF allowlist, error sanitization, docs.

Phase 1–2 are a shippable, useful vertical slice (configure a key, test it works) before the streaming complexity.

---

## 12. Testing

- **Rust:** keychain set/get/delete round-trip (feature-gated / mock keyring in CI); auth-header map per kind; host-allowlist guard; proxy injects header and never logs it.
- **TS:** `ProviderService` against a fake bridge (setKey never lands in returned state); `tauriFetch` builds a correct `Request`/`Response` from mocked Channel chunks; provider-config zod schema.
- **Integration (manual, needs app):** real key → test() → live provider round-trip; stream a completion; confirm via a memory inspector that no key string is in JS heap/Query cache.

---

## 13. Open assumptions to verify against docs (knowledge may be stale)

| # | Assumption | Check |
|---|---|---|
| 1 | AI SDK v6 provider factories (`createAnthropic`/`createOpenAI`/`createGoogleGenerativeAI`) accept a `fetch` option and honor it for all requests | ai-sdk.dev provider docs |
| 2 | A custom `fetch` returning a streaming `Response` (SSE `ReadableStream`) is consumed correctly by `streamText` | ai-sdk.dev + spike in Phase 3 |
| 3 | `@ai-sdk/gateway` v3 auth via a user-supplied gateway key (not only Vercel OIDC) works through the same custom-fetch path | gateway docs |
| 4 | Tauri `Channel<Vec<u8>>` streams binary chunks efficiently to a JS `ReadableStream` | Tauri v2 IPC/Channel docs |
| 5 | `keyring` crate `3.x` works headlessly on macOS (Keychain) and the entry survives app restarts / codesign identity | crate docs + device test |
| 6 | Model slugs: gateway uses `provider/model` (dots), direct providers use bare model ids | ai-sdk model docs |

---

## 14. Risks & mitigations

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| 1 | Streaming custom-fetch (Channel→ReadableStream→SSE) is fiddly | HIGH | Phase 2 ships non-stream first; Phase 3 spikes streaming in isolation; fallback to non-stream generate if needed |
| 2 | `keyring` on macOS prompts / behaves oddly for ad-hoc-signed app | MED | Device-test early (Phase 1); document Keychain access prompt; proper signing later removes friction |
| 3 | SSRF via user `openai-compatible` baseURL | MED | Rust host allowlist; warn in UI; only the proxy can reach network |
| 4 | AI SDK v6 API drift (custom fetch / gateway auth) | MED | §13 verify before Phase 2; isolate in `tauri-fetch.ts` + `generation-service.local.ts` |
| 5 | Key leaking into logs/telemetry | HIGH | central redaction in Rust proxy; never `format!` the header; test asserts no secret in logs |
| 6 | "Two constraints in tension" turns out to need pure-Rust clients | LOW | §10 fallback documented; interface (`GenerationService`) is identical either way, so a swap doesn't touch callers |
```
