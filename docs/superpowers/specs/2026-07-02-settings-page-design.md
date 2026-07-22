# Cutout — Settings Surface Design Spec

**Status:** historical design, updated by the product-owned automatic cutout contract on 2026-07-21. Cutout algorithm configuration is internal and must not appear in Settings. · **Depends on:** the shipped BYOK layer (`services/ai`, `hooks/queries/providers`, Rust `commands/ai/*`), i18n (`src/i18n`, Lingui), and `@tauri-apps/plugin-store` (already installed for i18n). · **Scope:** consolidate every settings-related affordance into one coherent Settings surface, and add the AI **model-assignment** layer (which model serves each output modality). **Not** in scope: building generative features, a prompt-management UI (prompts are built-in system assets — see §1), or any `models.dev` integration (see §9).

---

## 1. Goals & principles

Settings today is scattered: a `SettingsMenu` dropdown (reset params, providers, language, about), two standalone TopBar icons (`ThemeToggle`, `LanguageSwitcher` — the latter duplicated inside the dropdown), and a separate `ProviderSettingsDialog`. This spec unifies them into one surface and raises it to a SOTA desktop-app bar (Linear / Raycast / Vercel).

**Principles (each maps to a concrete decision below):**
1. **Restrained IA** — two sections that carry weight (`General`, `AI`), not a padded nav. About degrades to a footer line. No in-settings search (YAGNI for two sections).
2. **Instant-apply** — every change applies live with a toast; no Save/Cancel modal friction. Theme and language already behave this way.
3. **Security visible** — BYOK's "key only in the OS keychain, never in the webview" is a product strength; surface it inline (a lock affordance), don't bury it.
4. **One mental path for credentials** — a single "endpoint + key" form; the endpoint is **declared explicitly**, never guessed from the key prefix (relay/中转站 keys routinely masquerade as `sk-…`).
5. **Model choice by capability, not vendor** — assign a model per **output modality** (chat vs image), because flagship models are multimodal (text + reasoning + vision are one model; only image generation is a separate class).
6. **No external catalog dependency** — model lists come from the endpoint itself and existing in-repo defaults; offline-first is preserved.

**Hard rule (inherited from the prompt-management spec §1):** prompts are English-canonical, developer-authored, semver-versioned system assets. They are **not** exposed for user management here. There is no "Prompt Studio" section.

---

## 2. Surface & architecture

A controlled shadcn `Dialog` with a left sidebar (master-detail), opened from the TopBar gear **and** the `⌘,` accelerator. No router is introduced — the app remains a single workspace view; Settings is an overlay.

```
┌ Settings ─────────────────────────────────────── ⌘, ─ ✕ ┐
│ ⚙ General      │  〈active section body〉                  │
│ 🔑 AI          │                                          │
│────────────────┤                                          │
│ Cutout v0.1 · Tauri 2 · React 19            About ›       │
└──────────────────────────────────────────────────────────┘
```

- **Replaces** the current `SettingsMenu` dropdown. The gear now opens this dialog.
- **TopBar after this change:** keep the `ThemeToggle` quick icon (common, low-friction); **remove** the standalone `LanguageSwitcher` icon (language now lives in Settings → General); gear opens Settings.
- **Sidebar** is a simple controlled `activeSection` state (`'general' | 'ai'`), not a route. About is a footer row that opens an inline About view/toast.
- **Keyboard:** `⌘,` opens (registered in `useHotkeys`) — this needs a small carve-out so it fires **even while a text field is focused** (the existing `isEditingTarget` gate blocks chords except `Esc`); `Esc` closes; arrow/tab focus handled by Radix.

---

## 3. Section: General (⚙)

All thin preferences on one screen — each is instant-apply:

| Control | Backing | Notes |
|---|---|---|
| Theme | `next-themes` (existing) | Light / Dark / System segmented control |
| Language | Lingui `activate` + plugin-store (existing) | 简体中文 / English, live switch, no reload |
| Remember export directory | new pref (plugin-store) | toggle; when on, `useExportAll` reuses the last dir |

No new backend. "Remember export directory" is the only new preference; it is persisted via plugin-store alongside the AI model assignments (§5).

---

## 4. Section: AI (🔑)

Two layers: **Credentials** (BYOK connections) and **Models** (assignment by output modality).

```
🔑 AI
  Credentials (BYOK)                         🔒 Keys are stored only in the OS keychain
    ● My Relay   openai-compatible   ✓ verified · 38ms      [Manage]
    ● Anthropic                      ✓ verified             [Manage]
    [ + Add endpoint ]

  Models
    Chat / Understanding (text · reasoning · vision)   [ claude-sonnet ▼ ]
    Image generation                                   [ gemini-image  ▼ ]
```

### 4a. Credentials — the unified "endpoint + key" form

One form, endpoint declared explicitly (never guessed). This is a small evolution of the existing `ProviderForm`, which already has the kind `Select` + conditional `baseURL` + `KeyField`.

- **Endpoint** (`Select`, = existing `ProviderKind`): `Anthropic` · `OpenAI` · `Google` · `AI Gateway` · `Custom endpoint`.
- **API protocol** (`Select`): OpenAI Responses · OpenAI Chat Completions · Anthropic Messages · Google GenerateContent. Vendor presets expose only supported values; `Custom endpoint` exposes all four executable protocols.
- **Base URL** (`Input`): shown **only** when endpoint is `Custom endpoint`; **required** there. A pathless URL defaults to `/v1` for OpenAI/Anthropic protocols and `/v1beta` for Google GenerateContent; explicit paths are preserved.
- **API Key** (`KeyField`, existing): write-only; on save the secret goes straight to `setKey()` → Rust and is wiped from JS. `🔒` affordance + tooltip states the keychain/Rust-proxy guarantee.
- **Save auto-tests:** after `upsert` + `setKey`, the form calls `useTestKey().mutateAsync(saved.id)` automatically and shows the credential/catalog result (`✓ verified` / error) — the user no longer clicks a separate Test.

Reused verbatim: `useUpsertProvider`, `useSetKey`, `useTestKey`, `useProviders`, `useProviderStatus`, `useRemoveProvider`, the local `ProviderService`, and all Rust `commands/ai/*`.

### 4b. Models — assignment by output modality

Two slots, bucketed by **output** modality (input/vision is a property of the chat model, not a separate slot):

- **Chat / Understanding** — text + reasoning + vision in one model (output: text).
- **Image generation** — output: image.

Each slot is a picker over models available from the **configured** endpoints. The user decides which model lands in which slot (no external catalog infers it).

**Model options per slot come from (union, deduped):**
1. In-repo `SUGGESTED_MODELS[kind]` / `DEFAULT_MODEL[kind]` (existing `services/ai/models.ts`) — for vendor endpoints.
2. **Auto-fetched `/v1/models`** — for any endpoint with an **explicit base URL** (`openai-compatible`/relays, or a provider carrying a `baseUrl` override). Fetched through the existing Rust proxy so the key never enters the webview (§5b). Vendor endpoints with **no** base URL (Anthropic / OpenAI / Google / Gateway using the SDK's built-in host) are **not** auto-discovered — they fall back to the suggested list + free-text. (`ProviderConfig.baseUrl` is only populated for `openai-compatible` today; discovery keys off its presence, so there is no per-kind URL map to invent.)
3. Free-text entry — fallback for anything not listed.

A slot with no configured endpoint is disabled with an inline "add an endpoint first" hint.

---

## 5. Data model & persistence (new)

### 5a. Model assignments

```ts
// src/services/ai/model-assignment-types.ts
interface ModelAssignment { readonly providerId: string; readonly model: string }
interface ModelAssignments {
  readonly chat?: ModelAssignment
  readonly image?: ModelAssignment
}
```

- Persisted (non-secret) via `@tauri-apps/plugin-store` (`settings.json` store), **not** in `providers.json` (which stays a pure provider list) and **not** in the keychain.
- This is the concrete landing table for prompt-management's `modality → (providerId, model)` resolution: `text`/`vision` prompts resolve to `chat`; `image-generation` prompts resolve to `image`. `GenerationService` / prompt resolution reads it.
- TanStack Query owns it: `aiSettingsKeys.assignments`; a `useSetModelAssignment` mutation writes the store and invalidates.

### 5b. Endpoint model discovery (`/v1/models`)

A small function that lists an endpoint's models through the existing buffered proxy — no key in JS, same host-allowlist guard as generation:

```ts
// src/services/ai/list-models.ts
async function listEndpointModels(cfg: ProviderConfig): Promise<string[]>
// runs ONLY when cfg.baseUrl is set (openai-compatible/relays, or a baseUrl override):
//   → ai_proxy_request(GET {protocolBase}/models, wireProtocol)
//   → parse { data:[{id}] } or { models:[{name}] } → string[]
// no baseUrl → returns [] (caller falls back to SUGGESTED_MODELS + free-text)
```

The remote check is deliberately limited to authenticated `GET /models`. It
verifies host policy, protocol-specific authentication, base URL normalization,
and supported catalog parsing, but it does not claim that generation succeeded.
There is no standardized no-cost `OPTIONS`/`HEAD` generation probe shared by all
four protocol families, and Settings must never trigger a billable model call.
Generation viability is enforced locally by the closed kind/protocol matrix,
exhaustive adapter selection, protocol-aware paths/auth, and request-shape tests.

- Reuses the Rust `ai_proxy_request` command as-is (buffered GET). **Discovery is gated on `cfg.baseUrl` being present.** The GET host must pass the existing `enforce_host` guard for the endpoint `kind` (`openai-compatible` already permits the user's host; a `baseUrl` override on a vendor kind must still resolve to that vendor's allowed host).
- Exposed to the UI as `useEndpointModels(providerId)` (TanStack Query, `enabled` only when the provider has a key **and** a `baseUrl`). Empty/failed discovery degrades to the suggested list + free-text; it never blocks the form.

---

## 6. Reuse vs new

| Area | Status |
|---|---|
| Provider CRUD · keychain · `test()` · 6 hooks · `ProviderService` · Rust `commands/ai/*` | ✅ reuse |
| `ProviderForm` (endpoint + key) | 🔧 small change: auto-test on save; `/v1/models` autofill for the model field |
| `ThemeToggle` · `LanguageSwitcher` | ✅ reuse, relocated into General |
| `models.ts` (`DEFAULT_MODEL` / `SUGGESTED_MODELS`) | ✅ reuse as suggestion source |
| Settings shell (Dialog + sidebar, `⌘,`) | 🆕 replaces `SettingsMenu` dropdown |
| Model-assignment layer (`chat` / `image`) + plugin-store persistence | 🆕 |
| `/v1/models` discovery (`list-models.ts` + `useEndpointModels`) | 🆕 (thin, over existing proxy) |
| `models.dev` catalog / snapshot / enrichment | ❌ explicitly out (§9) |

---

## 7. Data-flow walkthroughs

**Add a relay endpoint**
```
Settings → AI → Add endpoint → Endpoint: Custom endpoint
  → Base URL https://relay/v1 + Key ····
  → Save: upsert(config) → setKey(id, secret) [secret → Rust → keychain, wiped from JS]
         → credential/catalog test (useTestKey().mutateAsync(id)) → ✓ verified
  → useEndpointModels(id): ai_proxy_request GET /v1/models → model list ready for the slots
```

**Assign models**
```
Chat slot ▼ (options = SUGGESTED_MODELS ∪ /v1/models ∪ free-text) → pick
  → useSetModelAssignment({ slot:'chat', providerId, model }) → plugin-store write + invalidate
```

**A future feature generates**
```
prompt.modality = 'image-generation'
  → resolve assignments.image → { providerId, model }
  → GenerationService.generate({ providerId, model, … }) → existing Rust auth-proxy → provider
(key path unchanged: keychain → Rust → provider; never JS)
```

---

## 8. File-tree additions

```
src/components/settings/
  SettingsDialog.tsx           # shell: Dialog + sidebar + footer; ⌘, wiring lives in useHotkeys
  SettingsSidebar.tsx          # section nav (general | ai)
  sections/
    GeneralSection.tsx         # theme · language · reset params · remember export dir
    AiSection.tsx              # credentials list + models block (composes existing ProviderRow/Form)
    AboutFooter.tsx            # version/stack line → inline About
  ModelSlot.tsx                # one modality → model picker (options from §5b)
src/services/ai/
  model-assignment-types.ts    # ModelAssignment / ModelAssignments (+ zod)
  model-assignment.local.ts    # get/set via plugin-store
  list-models.ts               # /v1/models discovery over ai_proxy_request
src/hooks/queries/
  ai-settings.ts               # useModelAssignments / useSetModelAssignment / useEndpointModels
```

`ProviderSettingsDialog` is retired; its list/form internals (`ProviderRow`, `ProviderForm`, `KeyField`) move under `AiSection`. `SettingsMenu` dropdown is removed; the gear opens `SettingsDialog`.

---

## 9. Why no `models.dev`

`models.dev` was considered only as a **conceptual reference** for organizing models by modality/capability — that idea is captured by the two output-modality slots (§4b). It is **not** a dependency: no bundled `api.json` snapshot, no name-matching, no capability/price enrichment, no offline catalog sync. Model lists come from the endpoint's own `/v1/models` plus in-repo defaults. This keeps the surface offline-first and avoids a catalog subsystem the product does not need. (Capability badges from an external catalog are a possible future polish, explicitly deferred.)

---

## 10. i18n

All user-facing strings go through Lingui (`Trans` / `t` macros), matching the just-shipped catalogs. Brand/product and protocol names (Anthropic, OpenAI, Google GenerateContent, …) stay verbatim; `Custom endpoint` and generic labels are translated. Model slugs and base URLs are never translated.

---

## 11. Testing

- **Settings shell:** `⌘,` opens; section switch; Esc closes; About footer renders version.
- **General:** theme/language/reset are instant (no save); "remember export dir" persists and is read by `useExportAll`.
- **Credentials form:** `Custom` reveals+requires Base URL; save runs auto-test; secret is wiped from JS after `setKey` (reuse existing assertions); no secret in Query/Zustand.
- **Protocol model discovery:** calls `<normalized-base>/models`, parses both `{ data:[{id}] }` and `{ models:[{name}] }` (stripping `models/`), and carries the selected protocol to Rust for auth. Failure degrades to suggestions + free-text; no key enters JS.
- **Model assignment:** set persists via plugin-store; a slot with no keyed endpoint is disabled; modality→slot resolution (`text`/`vision`→chat, `image-generation`→image).

---

## 12. Phased plan

- **P1 — Shell + General:** `SettingsDialog` + sidebar + `⌘,`; relocate theme/language/reset; "remember export dir"; retire `SettingsMenu`/standalone language icon. Ships a coherent surface with existing functionality.
- **P2 — AI credentials:** fold provider list/form into `AiSection`; add auto-test-on-save; retire `ProviderSettingsDialog`.
- **P3 — Models:** `/v1/models` discovery + two-slot assignment + plugin-store persistence + `ai-settings` hooks. This is the layer prompt-management/generation will consume.

P1 is independently shippable; P3 is the piece the AI roadmap depends on.

---

## 13. Open assumptions to verify

| # | Assumption | Check |
|---|---|---|
| 1 | `@tauri-apps/plugin-store` JS API for get/set/save is available and its capability (`store:default`) is granted | installed plugin-store; `capabilities/default.json` (already lists `store:default`) |
| 2 | `ai_proxy_request` accepts a GET with no body and returns the `/v1/models` JSON unchanged | Rust `ai_proxy.rs` (method defaults handled; GET path) |
| 3 | Relay/中转站 `/v1/models` follows the OpenAI shape `{ data: [{ id }] }` | spot-check a common relay; degrade gracefully if not |
| 4 | `⌘,` does not collide with an existing hotkey | `useHotkeys` map |
| 5 | Vendor endpoints without a base URL are not auto-discovered and fall back cleanly to `SUGGESTED_MODELS` + free-text | `useEndpointModels` gating on `baseUrl` |

---

## 14. Risks & mitigations

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| 1 | `/v1/models` shape varies across relays | MED | tolerant parse (`data[].id` only); on miss → suggestions + free-text; never block save |
| 2 | Vendor endpoints (no explicit base URL) aren't auto-discovered | LOW | discovery gates on `baseUrl`; vendors use `SUGGESTED_MODELS` + free-text (some vendors, e.g. Anthropic, do expose `/v1/models`, but only reachable once a base URL is configured) |
| 3 | Model assignment references a model no longer offered by its endpoint | LOW | validate on read; show a "reselect" hint in the slot; generation surfaces a clear error |
| 4 | Instant-apply surprises the user (no explicit save) | LOW | per-change toast + reversible controls; destructive ops (remove endpoint) keep the existing AlertDialog confirm |
| 5 | Scope creep back into a catalog subsystem | LOW | §9 documents the boundary; `/v1/models` + in-repo defaults are the only sources |
