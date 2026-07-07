/**
 * i18n runtime instance + locale activation (spec §4.1).
 *
 * A single `@lingui/core` `i18n` instance backs the whole app. Activation is
 * split into a small, reusable pair — `loadLocaleMessages` (async, per-locale
 * code split — only the active locale sits in memory) and `applyLocale` (the
 * synchronous swap that re-renders every `Trans`/`useLingui` subscriber under
 * `<I18nProvider>` and syncs `<html lang/dir>`). Boot uses `activateLocale`; the
 * live switcher uses `switchLocale` (see `./switch`) to animate the swap.
 */
import { i18n } from '@lingui/core'
import type { Messages } from '@lingui/core'
import { dirOf, type Locale } from './config'
import { persistLocale } from './detect'

/**
 * Load a locale's compiled catalog. A template-literal specifier makes Vite emit
 * a per-locale chunk glob; the Lingui Vite plugin compiles the `.po` on the fly.
 */
export async function loadLocaleMessages(locale: Locale): Promise<Messages> {
  const { messages } = await import(`../locales/${locale}/messages.po`)
  return messages
}

/** Activate already-loaded messages + sync `<html lang/dir>`. Synchronous. */
export function applyLocale(locale: Locale, messages: Messages): void {
  i18n.loadAndActivate({ locale, messages })
  document.documentElement.lang = locale
  document.documentElement.dir = dirOf(locale)
}

/**
 * Load + activate a locale (used at boot; no transition).
 *
 * @param locale  supported locale tag
 * @param persist when `true`, also write the choice to the managed store so it
 *                survives restart (used by the language switcher, not by boot)
 */
export async function activateLocale(
  locale: Locale,
  persist = false,
): Promise<void> {
  applyLocale(locale, await loadLocaleMessages(locale))
  if (persist) await persistLocale(locale)
}

export { i18n }
