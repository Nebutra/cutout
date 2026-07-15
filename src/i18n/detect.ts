/**
 * Locale detection + persistence (spec §3.5).
 *
 * Resolution order (first hit wins):
 *   1. Saved user choice   — `@tauri-apps/plugin-store` `locale` key (explicit override)
 *   2. OS locale           — `@tauri-apps/plugin-os` `locale()` (e.g. "zh-Hans-CN")
 *   3. `navigator.language`— webview fallback
 *   4. `'en'`              — source / fallback locale
 *
 * Tauri plugin calls are guarded: outside a Tauri runtime (plain `vite preview`,
 * Vitest, browser) they reject, and we fall through instead of blocking first paint.
 */
import { locale as osLocale } from '@tauri-apps/plugin-os'
import { LazyStore } from '@tauri-apps/plugin-store'
import { SUPPORTED, type Locale } from './config'

/** Key under which the explicit user choice lives inside the managed store. */
const LOCALE_KEY = 'locale'

/**
 * Managed JSON store shared with other app settings. `LazyStore` defers the
 * disk load until the first `get`/`set`, so importing this module is cheap.
 */
const store = new LazyStore('settings.json')

/** Narrow an arbitrary BCP-47 tag to a supported `Locale`, or `undefined`. */
function normalize(tag?: string | null): Locale | undefined {
  if (!tag) return undefined
  const lower = tag.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en'
  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('fr')) return 'fr'
  if (lower.startsWith('es')) return 'es'
  return undefined
}

/**
 * Resolve the locale to activate on boot. Never throws — every external source
 * is guarded so a missing Tauri runtime degrades gracefully to `navigator`/`en`.
 */
export async function detectInitialLocale(): Promise<Locale> {
  try {
    const saved = await store.get<Locale>(LOCALE_KEY)
    if (saved && SUPPORTED.includes(saved)) return saved
  } catch {
    // Store unavailable (non-Tauri context) — fall through to OS/browser.
  }

  let osTag: string | null = null
  try {
    osTag = await osLocale()
  } catch {
    // plugin-os unavailable (non-Tauri context) — fall through to navigator.
  }

  const browserTag =
    typeof navigator !== 'undefined' ? navigator.language : undefined

  return normalize(osTag) ?? normalize(browserTag) ?? 'en'
}

/** Persist the user's explicit language choice to the managed store. */
export async function persistLocale(locale: Locale): Promise<void> {
  await store.set(LOCALE_KEY, locale)
  await store.save()
}
