/**
 * i18n static config (spec §3.7).
 *
 * The single source of truth for which locales Cutout ships. Adding a locale is
 * one entry here + one entry in `lingui.config.ts` + one seeded `.po` file.
 */

/** Locales the app ships. Order is display order in the language switcher. */
export const SUPPORTED = ['en', 'zh-CN', 'ja', 'fr', 'es'] as const

/** Union of shipped locale tags — the typed currency passed through the i18n API. */
export type Locale = (typeof SUPPORTED)[number]

/**
 * Native display name (endonym) for each shipped locale — each language named in
 * its own script, so it reads the same in every UI language and is intentionally
 * NOT translated. Shared by the language switcher and Settings › General.
 */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
}

/** Right-to-left script roots. None ship today; RTL is one map entry away. */
const RTL_ROOTS = new Set(['ar', 'he', 'fa', 'ur'])

/**
 * Direction for a BCP-47 tag, keyed off the primary subtag.
 * Drives `<html dir>` so Tailwind v4 logical properties (`ms-`, `ps-`, …) flip.
 */
export function dirOf(locale: string): 'ltr' | 'rtl' {
  const primary = locale.split('-')[0]
  return RTL_ROOTS.has(primary) ? 'rtl' : 'ltr'
}
