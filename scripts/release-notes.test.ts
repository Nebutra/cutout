import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RELEASE_NOTES_CATALOG_PROTOCOL,
  RELEASE_NOTES_LOCALES,
  RELEASE_NOTES_PROTOCOL,
  findReleaseNotesEntry,
  loadReleaseNotesCatalog,
  projectReleaseNotesEntry,
  renderGitHubReleaseMarkdown,
  renderUpdaterPlainTextNotes,
  renderUpdaterReleaseNotes,
  requireReleaseNotesEntry,
  selectReleaseNotesLocale,
  validateReleaseNotesCatalog,
  validateReleaseNotesExtension,
} from './lib/release-notes.mjs'

const en = {
  headline: 'A clear update summary',
  highlights: [
    { id: 'review-first', title: 'Review first', body: 'Read the details before installing.' },
    { id: 'reopen-later', title: 'Reopen later', body: 'The same notes remain available offline.' },
  ],
}

function entry(version = '0.1.16') {
  return { version, releasedOn: '2026-08-03', locales: { en: structuredClone(en) } }
}

function catalog(entries: unknown[] = [entry()]) {
  return { protocol: RELEASE_NOTES_CATALOG_PROTOCOL, entries }
}

describe('release-note catalog', () => {
  it('loads the reviewed v0.1.19 entry with all five shipped locales and no historical backfill', async () => {
    const loaded = await loadReleaseNotesCatalog(undefined, { requireAllLocales: true })
    expect(loaded.entries.map((value) => value.version)).toEqual(['0.1.19'])
    expect(Object.keys(requireReleaseNotesEntry(loaded, '0.1.19').locales)).toEqual(RELEASE_NOTES_LOCALES)
    expect(findReleaseNotesEntry(loaded, '0.1.16')).toBeUndefined()
  })

  it('validates normalized catalogs idempotently and falls back by whole locale to English', () => {
    const normalized = validateReleaseNotesCatalog(catalog())
    expect(validateReleaseNotesCatalog(normalized)).toEqual(normalized)
    const selected = selectReleaseNotesLocale(requireReleaseNotesEntry(normalized, '0.1.16'), 'fr')
    expect(selected).toEqual(en)
  })

  it('rejects duplicate or invalid semantic versions and invalid calendar dates', () => {
    expect(() => validateReleaseNotesCatalog(catalog([entry(), entry()]))).toThrow('Duplicate')
    expect(() => validateReleaseNotesCatalog(catalog([entry('v0.1.16')]))).toThrow('without a v prefix')
    expect(() => validateReleaseNotesCatalog(catalog([entry('0.1.16-01')]))).toThrow('leading zeroes')
    const invalidDate = entry() as ReturnType<typeof entry>; invalidDate.releasedOn = '2026-02-30'
    expect(() => validateReleaseNotesCatalog(catalog([invalidDate]))).toThrow('real calendar date')
  })

  it('requires English, rejects unknown locales and fields, and can require all shipped locales', () => {
    const noEnglish = entry(); noEnglish.locales = { fr: en } as typeof noEnglish.locales
    expect(() => validateReleaseNotesCatalog(catalog([noEnglish]))).toThrow('reviewed English')
    const unknownLocale = entry(); (unknownLocale.locales as Record<string, unknown>).de = en
    expect(() => validateReleaseNotesCatalog(catalog([unknownLocale]))).toThrow('Unsupported')
    expect(() => validateReleaseNotesCatalog(catalog(), { requireAllLocales: true })).toThrow('all shipped locales')
    expect(() => validateReleaseNotesCatalog({ ...catalog(), remoteUrl: 'https://example.test/notes' })).toThrow('unknown field')
  })

  it('enforces highlight parity, count, stable ids, bounded safe text, and closed media ids', () => {
    const mismatch = entry(); mismatch.locales = { en, fr: { ...en, highlights: [en.highlights[1], en.highlights[0]] } }
    expect(() => validateReleaseNotesCatalog(catalog([mismatch]))).toThrow('ids, order')
    const none = entry(); none.locales.en.highlights = []
    expect(() => validateReleaseNotesCatalog(catalog([none]))).toThrow('one to 6')
    const badId = entry(); badId.locales.en.highlights[0].id = 'Not Stable'
    expect(() => validateReleaseNotesCatalog(catalog([badId]))).toThrow('stable lowercase')
    const control = entry(); control.locales.en.highlights[0].body = 'unsafe\ntext'
    expect(() => validateReleaseNotesCatalog(catalog([control]))).toThrow('unsafe control')
    const markup = entry(); markup.locales.en.highlights[0].body = '<strong>unsafe</strong>'
    expect(() => validateReleaseNotesCatalog(catalog([markup]))).toThrow('markup')
    const url = entry(); url.locales.en.highlights[0].body = 'Open https://example.test/notes'
    expect(() => validateReleaseNotesCatalog(catalog([url]))).toThrow('arbitrary URL')
    const oversized = entry(); oversized.locales.en.highlights[0].body = 'x'.repeat(601)
    expect(() => validateReleaseNotesCatalog(catalog([oversized]))).toThrow('at most 600')
    const remoteMedia = entry(); Object.assign(remoteMedia.locales.en.highlights[0], { mediaId: 'release-screenshot', alt: 'Preview' })
    expect(() => validateReleaseNotesCatalog(catalog([remoteMedia]))).toThrow('known bundled')
  })

  it('renders deterministic readable updater text, a strict extension, and escaped Markdown', () => {
    const unsafeMarkdown = entry()
    unsafeMarkdown.locales.en.headline = 'Details *without* markup'
    const rendered = renderUpdaterReleaseNotes(unsafeMarkdown)
    expect(rendered.notes).toContain('Details *without* markup')
    expect(rendered.notes).not.toContain(RELEASE_NOTES_PROTOCOL)
    expect(rendered.cutoutReleaseNotes).toMatchObject({ protocol: RELEASE_NOTES_PROTOCOL, version: '0.1.16' })
    expect(renderUpdaterPlainTextNotes(unsafeMarkdown)).toBe(rendered.notes)
    expect(renderGitHubReleaseMarkdown(unsafeMarkdown)).toContain('Details \\*without\\* markup')
    expect(renderGitHubReleaseMarkdown(unsafeMarkdown)).toBe(renderGitHubReleaseMarkdown(projectReleaseNotesEntry(unsafeMarkdown)))
  })

  it('rejects mismatched, malformed, and unknown-field updater extensions', () => {
    const extension = projectReleaseNotesEntry(entry())
    expect(() => validateReleaseNotesExtension(extension, { expectedVersion: '0.1.19' })).toThrow('does not match')
    expect(() => validateReleaseNotesExtension({ ...extension, protocol: 'unknown' })).toThrow('protocol')
    expect(() => validateReleaseNotesExtension({ ...extension, html: '<script>' })).toThrow('unknown field')
  })

  it('renders all release inputs through the CLI from one exact entry', async () => {
    const output = await mkdtemp(join(tmpdir(), 'cutout-release-notes-'))
    const result = spawnSync(process.execPath, ['scripts/release-notes.mjs', 'render', '--version', '0.1.19', '--output', output, '--require-all-locales'], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const [plainText, updater, bundled, github] = await Promise.all([
      readFile(join(output, 'updater-notes.txt'), 'utf8'),
      readFile(join(output, 'updater-extension.json'), 'utf8'),
      readFile(join(output, 'bundled-note.json'), 'utf8'),
      readFile(join(output, 'github-release.md'), 'utf8'),
    ])
    expect(JSON.parse(updater)).toEqual(JSON.parse(bundled))
    expect(plainText).toContain('See what Agent preparation is doing')
    expect(plainText).toContain('A more tolerant Codex runtime')
    expect(github).toContain('Cutout v0\\.1\\.19')
  })
})
