/// <reference types="node" />
/**
 * Catalog parity (spec §8).
 *
 * Guarantees the shipped locales stay in lock-step:
 *   1. Every non-source locale exposes an identical set of message IDs to `en`
 *      → no locale can silently miss a translation a peer locale has.
 *   2. Every non-source locale entry has a non-empty translation → no
 *      user-visible string falls back to the English source unintentionally.
 *
 * The catalogs are read as raw gettext `.po` text (no Lingui compile step), so
 * this test is deterministic and independent of the Vite/Babel macro pipeline.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SUPPORTED } from '../config'

/** One parsed gettext entry. Header (empty msgid) is excluded by the parser. */
interface Entry {
  readonly id: string
  readonly value: string
}

const decode = (raw: string): string =>
  raw
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

/**
 * Minimal `.po` parser: collects `msgid`/`msgstr` pairs, supporting the
 * standard multi-line continuation form. The header entry (`msgid ""`) is
 * dropped so only real messages are compared.
 */
function parsePo(text: string): readonly Entry[] {
  const entries: Entry[] = []
  const lines = text.split('\n')
  let field: 'id' | 'str' | null = null
  let id = ''
  let str = ''

  const flush = () => {
    if (id !== '') entries.push({ id: decode(id), value: decode(str) })
    id = ''
    str = ''
    field = null
  }

  for (const line of lines) {
    const msgid = line.match(/^msgid "((?:[^"\\]|\\.)*)"\s*$/)
    const msgstr = line.match(/^msgstr "((?:[^"\\]|\\.)*)"\s*$/)
    const cont = line.match(/^"((?:[^"\\]|\\.)*)"\s*$/)

    if (msgid) {
      flush()
      id = msgid[1]
      field = 'id'
    } else if (msgstr) {
      str = msgstr[1]
      field = 'str'
    } else if (cont && field) {
      if (field === 'id') id += cont[1]
      else str += cont[1]
    } else if (line.trim() === '') {
      flush()
    }
  }
  flush()
  return entries
}

const read = (locale: string): readonly Entry[] =>
  parsePo(
    readFileSync(
      join(process.cwd(), 'src', 'locales', locale, 'messages.po'),
      'utf8',
    ),
  )

const SOURCE_LOCALE = 'en'
const TARGET_LOCALES = SUPPORTED.filter((locale) => locale !== SOURCE_LOCALE)

const en = read(SOURCE_LOCALE)
const catalogs = new Map(
  SUPPORTED.map((locale) => [locale, read(locale)] as const),
)

describe('i18n catalog parity', () => {
  it.each(TARGET_LOCALES)(
    '%s exposes an identical message-ID set to en',
    (locale) => {
      const enIds = en.map((e) => e.id).sort()
      const localeIds = catalogs.get(locale)!.map((e) => e.id).sort()
      expect(localeIds).toEqual(enIds)
    },
  )

  it.each(SUPPORTED)('every message ID is unique within %s', (locale) => {
    const ids = catalogs.get(locale)!.map((e) => e.id)
    expect(new Set(ids).size, `duplicate IDs in ${locale}`).toBe(ids.length)
  })

  it('no en source string is empty', () => {
    for (const { id, value } of en)
      expect(value.length, `empty en source: ${id}`).toBeGreaterThan(0)
  })

  it.each(TARGET_LOCALES)('no %s translation is empty', (locale) => {
    for (const { id, value } of catalogs.get(locale)!)
      expect(value.length, `empty ${locale} translation: ${id}`).toBeGreaterThan(0)
  })
})
