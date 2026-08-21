/**
 * Every translation must use the same placeholder names as its source message.
 *
 * lingui names a placeholder after the expression it came from: a bare
 * identifier becomes `{catalogSize}`, while a complex expression degrades to
 * positional `{0}`, `{1}`. A translation that writes `{0}` where the source
 * says `{catalogSize}` compiles cleanly, passes `i18n:extract` with zero
 * missing entries, and then renders an empty string at runtime — the count
 * silently disappears and the sentence reads " 个模型".
 *
 * That is exactly what shipped in v0.1.25 on the provider row, and nothing in
 * lint, typecheck, unit tests or the visual suite could see it. This test can.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES_DIR = 'src/locales'
const SOURCE_LOCALE = 'en'

/** `msgid` → `msgstr`, for the single-line form lingui emits. */
function readCatalog(locale: string): Map<string, string> {
  const text = readFileSync(join(LOCALES_DIR, locale, 'messages.po'), 'utf8')
  const entries = new Map<string, string>()
  const pattern = /^msgid "([^"]+)"\nmsgstr "((?:[^"\\]|\\.)*)"$/gm
  for (const match of text.matchAll(pattern)) {
    entries.set(match[1]!, match[2]!)
  }
  return entries
}

/** Placeholder names in a message, e.g. `{catalogSize}` / `{0}`. */
function placeholders(message: string): Set<string> {
  return new Set([...message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]!))
}

const targetLocales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== SOURCE_LOCALE)
  .map((entry) => entry.name)

describe('translation placeholder parity', () => {
  const source = readCatalog(SOURCE_LOCALE)

  it.each(targetLocales)('%s uses the source placeholder names', (locale) => {
    const translations = readCatalog(locale)
    const mismatches: string[] = []

    for (const [id, sourceMessage] of source) {
      const expected = placeholders(sourceMessage)
      if (expected.size === 0) continue
      const translated = translations.get(id)
      // A missing or empty translation is `i18n:extract`'s job, not this test's.
      if (!translated) continue
      const actual = placeholders(translated)
      const missing = [...expected].filter((name) => !actual.has(name))
      if (missing.length > 0) {
        mismatches.push(
          `${id}: source uses {${missing.join('}, {')}}, translation uses ${
            actual.size ? `{${[...actual].join('}, {')}}` : 'no placeholders'
          }`,
        )
      }
    }

    expect(mismatches).toEqual([])
  })

  it('covers every shipped locale', () => {
    expect(targetLocales.sort()).toEqual(['es', 'fr', 'ja', 'zh-CN'])
  })
})
