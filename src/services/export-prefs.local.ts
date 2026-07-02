/**
 * Export preferences — "remember the last export folder".
 *
 * Non-secret, persisted via `@tauri-apps/plugin-store` under `export.prefs` in
 * the shared `settings.json`. When `rememberDir` is on, the last folder written
 * to is stored and reused (skipping the native folder picker); the Rust
 * `save_assets` command falls back to the picker if the remembered path no
 * longer exists. Guarded so a non-Tauri context (Vitest) degrades to defaults.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import { z } from 'zod'

const STORE_FILE = 'settings.json'
const KEY = 'export.prefs'

const store = new LazyStore(STORE_FILE)

const exportPrefsSchema = z.object({
  rememberDir: z.boolean(),
  lastDir: z.string().optional(),
})

export type ExportPrefs = z.infer<typeof exportPrefsSchema>

const DEFAULT_PREFS: ExportPrefs = { rememberDir: false }

/** Load export prefs. Missing/invalid/unavailable → defaults (off). */
export async function loadExportPrefs(): Promise<ExportPrefs> {
  try {
    const raw = await store.get<unknown>(KEY)
    if (raw == null) return DEFAULT_PREFS
    const parsed = exportPrefsSchema.safeParse(raw)
    return parsed.success ? parsed.data : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/** Toggle "remember export folder"; persists and returns the updated prefs. */
export async function setRememberDir(on: boolean): Promise<ExportPrefs> {
  const current = await loadExportPrefs()
  const next: ExportPrefs = { ...current, rememberDir: on }
  await store.set(KEY, next)
  await store.save()
  return next
}

/** Persist the last output dir — a no-op unless remembering is enabled. */
export async function rememberLastDir(dir: string): Promise<void> {
  const current = await loadExportPrefs()
  if (!current.rememberDir) return
  const next: ExportPrefs = { ...current, lastDir: dir }
  await store.set(KEY, next)
  await store.save()
}

/** The dir to reuse for the next export, or `undefined` when off/unset. */
export async function rememberedDir(): Promise<string | undefined> {
  const prefs = await loadExportPrefs()
  return prefs.rememberDir ? prefs.lastDir : undefined
}
