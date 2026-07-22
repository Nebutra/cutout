# Settings Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session). Steps use checkbox (`- [ ]`) syntax. Honor @superpowers:test-driven-development for logic modules and @vercel:react-best-practices for `.tsx`.

**Goal:** Consolidate every settings affordance into one `⌘,` Settings dialog (General + AI sections), and add AI model-assignment by output modality backed by `/v1/models` discovery + plugin-store. Cutout algorithm configuration is product-owned and is not a Settings affordance.

**Architecture:** A controlled shadcn `Dialog` with a left sidebar (no router). Reuses all shipped BYOK code (hooks/service/Rust) and i18n; adds a thin model-assignment layer persisted via `@tauri-apps/plugin-store`. Spec: `docs/superpowers/specs/2026-07-02-settings-page-design.md`.

**Tech Stack:** React 19, shadcn/ui (Dialog), Zustand, TanStack Query v5, Lingui, `@tauri-apps/plugin-store`, existing Rust `ai_proxy_request`.

**Deferred (scope note):** "Remember export directory" — requires Rust `save_assets` to accept a directory and skip the folder picker; out of the fast consolidation path. Tracked, not built here.

---

## File structure

| File | Responsibility | New/Mod |
|---|---|---|
| `src/components/settings/SettingsDialog.tsx` | Dialog shell: sidebar + body + footer; `section` state | new |
| `src/components/settings/SettingsSidebar.tsx` | section nav (general \| ai) | new |
| `src/components/settings/sections/GeneralSection.tsx` | theme · language | new |
| `src/components/settings/sections/AiSection.tsx` | credentials (list+form) + models block | new |
| `src/components/settings/AboutFooter.tsx` | version/stack line | new |
| `src/components/settings/ModelSlot.tsx` | one modality → model picker | new (P3) |
| `src/components/topbar/SettingsMenu.tsx` | becomes the gear trigger that opens `SettingsDialog` | mod |
| `src/components/topbar/TopBar.tsx` | drop standalone LanguageSwitcher icon | mod |
| `src/hooks/useHotkeys.ts` | add `onOpenSettings` + `⌘,` (fires while editing) | mod |
| `src/components/AppShell.tsx` | own settings-open state; wire hotkey + dialog | mod |
| `src/components/settings/ProviderForm.tsx` | auto-test on save; `/v1/models` autofill | mod (P2/P3) |
| `src/services/ai/model-assignment-types.ts` | `ModelAssignment`/`ModelAssignments` + zod | new (P3) |
| `src/services/ai/model-assignment.local.ts` | get/set via plugin-store | new (P3) |
| `src/services/ai/list-models.ts` | `/v1/models` discovery over `ai_proxy_request` | new (P3) |
| `src/hooks/queries/ai-settings.ts` | `useModelAssignments`/`useSetModelAssignment`/`useEndpointModels` | new (P3) |

`ProviderSettingsDialog.tsx` is retired once `AiSection` renders its list/form.

---

## Phase 1 — Shell + General (shippable consolidation)

### Task 1: Settings dialog shell
**Files:** Create `SettingsDialog.tsx`, `SettingsSidebar.tsx`, `AboutFooter.tsx`

- [ ] Build `SettingsDialog({open,onOpenChange})`: `Dialog` → `DialogContent` (wide, e.g. `max-w-2xl`, min-height) with a two-column grid: `SettingsSidebar` (left, `w-44`) + active section body (right, scroll). `AboutFooter` pinned at the bottom. `section` state defaults `'general'`; resets to `'general'` on close.
- [ ] `SettingsSidebar({value,onChange})`: two `Button variant=ghost` rows (⚙ General, 🔑 AI) with active styling; all labels via `Trans`.
- [ ] `AboutFooter`: `Cutout v{version} · Tauri 2 · React 19` line; clicking shows the existing About toast.
- [ ] Manual check: dialog opens, sections switch, Esc closes.
- [ ] Commit: `feat(settings): dialog shell + sidebar + about footer`

### Task 2: General section (reuse existing controls)
**Files:** Create `sections/GeneralSection.tsx`

- [ ] Theme: segmented control (Light / Dark / System) via `useTheme().setTheme` + `theme` (not `resolvedTheme`, so System is selectable). Instant-apply.
- [ ] Language: a compact segmented/radio control reusing the `activateLocale` + `SUPPORTED`/`LABEL` logic (extract shared label map from `LanguageSwitcher` so it is not duplicated). Instant-apply, no reload.
- [ ] All strings via `Trans`/`t`.
- [ ] Commit: `feat(settings): General section (theme and language)`

### Task 3: Gear opens dialog; retire dropdown; ⌘,
**Files:** Modify `SettingsMenu.tsx`, `TopBar.tsx`, `useHotkeys.ts`, `AppShell.tsx`

- [ ] `SettingsMenu.tsx`: replace the DropdownMenu with a single gear `Button` that toggles a `SettingsDialog` (lift `open` state here or to AppShell). Remove the reset/providers/language/about items (now inside the dialog).
- [ ] `TopBar.tsx`: remove the standalone `LanguageSwitcher variant="icon"` (language now lives in Settings). Keep `ThemeToggle` quick icon + the gear.
- [ ] `useHotkeys.ts`: add `onOpenSettings?`. Handle `mod && key === ','` **before** the `if (editing) return` gate (carve-out) so `⌘,` works while a field is focused; `preventDefault`.
- [ ] `AppShell.tsx`: own `settingsOpen` state; pass `onOpenSettings: () => setSettingsOpen(true)` into `useHotkeys`; render `<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />`. (If SettingsMenu keeps the state, wire the hotkey to the same setter.)
- [ ] Test (`src/hooks/useHotkeys.test.ts` if present, else add): `⌘,` calls `onOpenSettings` even when the event target is an `<input>`.
- [ ] Manual: gear opens dialog; `⌘,` opens; language/theme still work; no duplicate language icon.
- [ ] Commit: `feat(settings): open via gear + ⌘,, retire settings dropdown`

---

## Phase 2 — AI credentials (fold BYOK in)

### Task 4: AiSection with provider list + form
**Files:** Create `sections/AiSection.tsx`; Modify `ProviderForm.tsx`; retire `ProviderSettingsDialog.tsx`

- [ ] `AiSection`: render the credentials block by composing the existing `ProviderRow` (list) + `ProviderForm` (add/edit) with the same `view` state machine currently in `ProviderSettingsDialog` (list | add | edit), minus the `Dialog` wrapper (it now lives inside `SettingsDialog`). Reuse `useProviders`, `useRemoveProvider`, etc. unchanged.
- [ ] Add the `🔒` trust line ("Keys are stored only in the OS keychain, never in the web page") near the list header via `Trans`.
- [ ] `ProviderForm`: after a successful `upsert` + `setKey`, auto-run `useTestKey().mutateAsync(saved.id)` and toast the verified/failed result (do not block the form on failure).
- [ ] Point `SettingsDialog`'s AI section at `AiSection`; delete `ProviderSettingsDialog.tsx` and its import in `SettingsMenu`.
- [ ] Manual: add a provider → auto-tests; edit/remove work; secret never rendered.
- [ ] Commit: `feat(settings): AI credentials section, auto-test on save`

---

## Phase 3 — Model assignment by modality

### Task 5: model-assignment types + store
**Files:** Create `model-assignment-types.ts`, `model-assignment.local.ts`; Test `model-assignment.local.test.ts`

- [ ] Types: `ModelAssignment {providerId; model}`, `ModelAssignments {chat?; image?}` + zod schema.
- [ ] `model-assignment.local.ts`: `loadAssignments()` / `setAssignment(slot, a)` / `clearAssignment(slot)` via `@tauri-apps/plugin-store` (`Store.load('settings.json')`, key `ai.modelAssignments`), zod-validated on read (bad/absent → `{}`).
- [ ] TDD: test read-empty → `{}`; set then read round-trips; invalid persisted blob → `{}` (mock the store module).
- [ ] Commit: `feat(settings): model-assignment store (plugin-store)`

### Task 6: /v1/models discovery
**Files:** Create `list-models.ts`; Test `list-models.test.ts`

- [ ] `listEndpointModels(cfg)`: if no `cfg.baseUrl` → `[]`. Else `invoke('ai_proxy_request', {providerId:cfg.id, kind:cfg.kind, url:`${baseUrl.replace(/\/$/,'')}/models` (baseUrl already ends `/v1`), method:'GET', headers:{}, body:null})`, parse `{data:[{id}]}` → `string[]`. Tolerant: non-array/parse error → `[]`.
- [ ] TDD (mock `@tauri-apps/api/core` invoke): parses `{data:[{id:'a'},{id:'b'}]}` → `['a','b']`; malformed → `[]`; no baseUrl → no invoke, `[]`.
- [ ] Commit: `feat(settings): /v1/models discovery via proxy`

### Task 7: ai-settings hooks + ModelSlot + wire into AiSection
**Files:** Create `hooks/queries/ai-settings.ts`, `ModelSlot.tsx`; Modify `AiSection.tsx`

- [ ] Hooks: `useModelAssignments` (query), `useSetModelAssignment` (mutation → invalidate), `useEndpointModels(providerId)` (query, `enabled` only when the provider has a key and a `baseUrl`).
- [ ] `ModelSlot({slot,label,hint})`: a labeled picker whose options = union of `SUGGESTED_MODELS` for configured kinds ∪ discovered `/v1/models` ∪ current value; free-text entry fallback; disabled with an "add an endpoint first" hint when no keyed provider exists. On change → `useSetModelAssignment`. Records `{providerId, model}` (provider inferred from which endpoint offers the model, or a small provider select alongside).
- [ ] `AiSection`: add the Models block with two `ModelSlot`s — `chat` ("Chat / Understanding") and `image` ("Image generation").
- [ ] Manual: assign models, reopen dialog → persists; relay `/v1/models` populates options.
- [ ] Commit: `feat(settings): model assignment slots (chat/image)`

---

## Testing summary
- Logic (TDD): `list-models` parse/degrade; `model-assignment.local` round-trip/validation.
- Hook: `useHotkeys` `⌘,` fires while editing.
- Manual: shell open/switch/Esc; theme+language instant; provider add auto-test; slot persist + `/v1/models` populate; no secret in Query/Zustand.
- After each phase: `pnpm lint` + `pnpm test` green before commit.

## i18n
Every visible string via Lingui `Trans`/`t`. Run `pnpm lingui extract` (or the project's extract script) once at the end and fill zh-CN. Brand names + model slugs + URLs are not translated.
