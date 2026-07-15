import type { LinguiConfig } from '@lingui/conf'
import { formatter } from '@lingui/format-po'

/**
 * Lingui v6 catalog config (spec §2).
 *
 * - `sourceLocale: 'en'` — source messages are authored in English; the inline
 *   `message` on each macro IS the English source string.
 * - Explicit dot-namespaced IDs (e.g. `topbar.export_button`) are the contract;
 *   see `src/i18n/README` / the design spec §3.2.
 * - `.po` format for translator tooling (Poedit/Weblate) + gettext parity diffs.
 *   In Lingui v6 formatters are separate packages passed via `format: formatter()`
 *   (the old `format: "po"` string was removed).
 *
 * `lingui extract` / `lingui compile` (the `i18n:*` package scripts) read this file.
 */
const config: LinguiConfig = {
  locales: ['en', 'zh-CN', 'ja', 'fr', 'es'],
  sourceLocale: 'en',
  fallbackLocales: { default: 'en' },
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
      exclude: ['**/node_modules/**', 'src/locales/**'],
    },
  ],
  format: formatter({ origins: true, lineNumbers: false }),
}

export default config
