import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const RELEASE_NOTES_CATALOG_PROTOCOL = 'cutout.release-notes.catalog.v1'
export const RELEASE_NOTES_PROTOCOL = 'cutout.release-notes.v1'
export const RELEASE_NOTES_LOCALES = Object.freeze(['en', 'zh-CN', 'ja', 'fr', 'es'])
export const RELEASE_NOTES_LIMITS = Object.freeze({
  entries: 100,
  extensionBytes: 48 * 1024,
  headline: 120,
  highlights: 6,
  id: 64,
  title: 100,
  body: 600,
  alt: 200,
})

const catalogPath = resolve(process.cwd(), 'src/release-notes/catalog.json')
const localeSet = new Set(RELEASE_NOTES_LOCALES)
const allowedMediaIds = new Set()
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/
const highlightIdPattern = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/
const unsafeMarkupPattern = /[<>]|\b[a-z][a-z0-9+.-]*:\/\//iu
const markdownCharacters = new Set('\\`*_{}[]()<>#+.!|~-')
const keys = (value) => Object.keys(value).sort()

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
}

function assertKeys(value, expected, label) {
  const actual = keys(value)
  const allowed = new Set(expected)
  const unknown = actual.filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`${label} contains unknown field: ${unknown[0]}.`)
  const missing = expected.filter((key) => !Object.hasOwn(value, key))
  if (missing.length) throw new Error(`${label} is missing required field: ${missing[0]}.`)
}

function length(value) {
  return Array.from(value).length
}

function plainText(value, maximum, label) {
  if (typeof value !== 'string' || value !== value.trim() || !value || length(value) > maximum) {
    throw new Error(`${label} must be non-empty trimmed text of at most ${maximum} characters.`)
  }
  if (Array.from(value).some((character) => {
    const code = character.codePointAt(0)
    return code !== undefined && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))
  })) throw new Error(`${label} contains unsafe control characters.`)
  if (unsafeMarkupPattern.test(value)) throw new Error(`${label} contains markup or an arbitrary URL.`)
  return value
}

function semanticVersion(value, label = 'Release notes version') {
  if (typeof value !== 'string' || !semverPattern.test(value)) throw new Error(`${label} must be an exact semantic version without a v prefix.`)
  const prerelease = value.split('-', 2)[1]
  if (prerelease?.split('.').some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    throw new Error(`${label} must not use leading zeroes in numeric prerelease identifiers.`)
  }
  return value
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Release notes date must use YYYY-MM-DD.')
  const [year, month, day] = value.split('-').map(Number)
  const normalized = new Date(Date.UTC(year, month - 1, day))
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    throw new Error('Release notes date must be a real calendar date.')
  }
  return value
}

function normalizeHighlight(value, label) {
  assertRecord(value, label)
  const required = ['id', 'title', 'body']
  assertKeys(value, Object.hasOwn(value, 'mediaId') || Object.hasOwn(value, 'alt') ? [...required, 'mediaId', 'alt'] : required, label)
  const id = plainText(value.id, RELEASE_NOTES_LIMITS.id, `${label}.id`)
  if (!highlightIdPattern.test(id)) throw new Error(`${label}.id must be a stable lowercase identifier.`)
  const highlight = {
    id,
    title: plainText(value.title, RELEASE_NOTES_LIMITS.title, `${label}.title`),
    body: plainText(value.body, RELEASE_NOTES_LIMITS.body, `${label}.body`),
  }
  if (Object.hasOwn(value, 'mediaId') || Object.hasOwn(value, 'alt')) {
    const mediaId = plainText(value.mediaId, RELEASE_NOTES_LIMITS.id, `${label}.mediaId`)
    if (!allowedMediaIds.has(mediaId)) throw new Error(`${label}.mediaId is not a known bundled release-note asset.`)
    return { ...highlight, mediaId, alt: plainText(value.alt, RELEASE_NOTES_LIMITS.alt, `${label}.alt`) }
  }
  return highlight
}

function normalizeLocale(value, locale) {
  const label = `Release notes locale ${locale}`
  assertRecord(value, label)
  assertKeys(value, ['headline', 'highlights'], label)
  if (!Array.isArray(value.highlights) || !value.highlights.length || value.highlights.length > RELEASE_NOTES_LIMITS.highlights) {
    throw new Error(`${label}.highlights must contain one to ${RELEASE_NOTES_LIMITS.highlights} items.`)
  }
  return {
    headline: plainText(value.headline, RELEASE_NOTES_LIMITS.headline, `${label}.headline`),
    highlights: value.highlights.map((highlight, index) => normalizeHighlight(highlight, `${label}.highlights[${index}]`)),
  }
}

export function validateReleaseNotesExtension(value, options = {}) {
  assertRecord(value, 'Release notes extension')
  assertKeys(value, ['protocol', 'version', 'releasedOn', 'locales'], 'Release notes extension')
  if (value.protocol !== RELEASE_NOTES_PROTOCOL) throw new Error(`Release notes extension protocol must be ${RELEASE_NOTES_PROTOCOL}.`)
  const version = semanticVersion(value.version)
  if (options.expectedVersion !== undefined && version !== options.expectedVersion) throw new Error(`Release notes version ${version} does not match ${options.expectedVersion}.`)
  assertRecord(value.locales, 'Release notes locales')
  const localeNames = Object.keys(value.locales)
  if (!localeNames.includes('en')) throw new Error('Release notes require reviewed English content.')
  for (const locale of localeNames) if (!localeSet.has(locale)) throw new Error(`Unsupported release notes locale: ${locale}.`)
  if (options.requireAllLocales && RELEASE_NOTES_LOCALES.some((locale) => !localeNames.includes(locale))) {
    throw new Error('Release notes must contain all shipped locales for this release.')
  }
  const locales = Object.fromEntries(localeNames.map((locale) => [locale, normalizeLocale(value.locales[locale], locale)]))
  const englishShape = locales.en.highlights.map(({ id, mediaId }) => ({ id, mediaId }))
  for (const [locale, record] of Object.entries(locales)) {
    const shape = record.highlights.map(({ id, mediaId }) => ({ id, mediaId }))
    if (JSON.stringify(shape) !== JSON.stringify(englishShape)) throw new Error(`Release notes locale ${locale} must preserve English highlight ids, order, and media ids.`)
  }
  const normalized = { protocol: RELEASE_NOTES_PROTOCOL, version, releasedOn: calendarDate(value.releasedOn), locales }
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > RELEASE_NOTES_LIMITS.extensionBytes) throw new Error('Release notes extension exceeds its serialized size limit.')
  return normalized
}

function normalizeCatalogEntry(value, options = {}) {
  assertRecord(value, 'Release notes catalog entry')
  assertKeys(value, ['version', 'releasedOn', 'locales'], 'Release notes catalog entry')
  const { protocol: _protocol, ...entry } = validateReleaseNotesExtension({ protocol: RELEASE_NOTES_PROTOCOL, ...value }, options)
  return entry
}

export function validateReleaseNotesCatalog(value, options = {}) {
  assertRecord(value, 'Release notes catalog')
  assertKeys(value, ['protocol', 'entries'], 'Release notes catalog')
  if (value.protocol !== RELEASE_NOTES_CATALOG_PROTOCOL) throw new Error(`Release notes catalog protocol must be ${RELEASE_NOTES_CATALOG_PROTOCOL}.`)
  if (!Array.isArray(value.entries) || value.entries.length > RELEASE_NOTES_LIMITS.entries) throw new Error(`Release notes catalog may contain at most ${RELEASE_NOTES_LIMITS.entries} entries.`)
  const entries = value.entries.map((entry) => normalizeCatalogEntry(entry, options))
  const versions = new Set()
  for (const entry of entries) {
    if (versions.has(entry.version)) throw new Error(`Duplicate release notes version: ${entry.version}.`)
    versions.add(entry.version)
  }
  return { protocol: RELEASE_NOTES_CATALOG_PROTOCOL, entries }
}

export async function loadReleaseNotesCatalog(path = catalogPath, options = {}) {
  return validateReleaseNotesCatalog(JSON.parse(await readFile(path, 'utf8')), options)
}

export function findReleaseNotesEntry(catalog, version, options = {}) {
  semanticVersion(version, 'Selected release version')
  const normalized = validateReleaseNotesCatalog(catalog, options)
  return normalized.entries.find((entry) => entry.version === version)
}

export function requireReleaseNotesEntry(catalog, version, options = {}) {
  const entry = findReleaseNotesEntry(catalog, version, options)
  if (!entry) throw new Error(`No reviewed release notes exist for version ${version}.`)
  return entry
}

export function selectReleaseNotesLocale(entry, locale) {
  const normalized = projectReleaseNotesEntry(entry)
  return normalized.locales[locale] ?? normalized.locales.en
}

export function renderUpdaterPlainTextNotes(entry) {
  const normalized = projectReleaseNotesEntry(entry)
  const english = normalized.locales.en
  return [english.headline, '', ...english.highlights.map((highlight) => `${highlight.title}: ${highlight.body}`)].join('\n')
}

function escapeMarkdown(value) {
  return Array.from(value, (character) => markdownCharacters.has(character) ? `\\${character}` : character).join('')
}

export function renderGitHubReleaseMarkdown(entry) {
  const normalized = projectReleaseNotesEntry(entry)
  const english = normalized.locales.en
  const sections = english.highlights.flatMap((highlight) => [`### ${escapeMarkdown(highlight.title)}`, escapeMarkdown(highlight.body)])
  return [`# Cutout v${escapeMarkdown(normalized.version)}`, '', `## ${escapeMarkdown(english.headline)}`, '', ...sections.flatMap((section) => [section, ''])].join('\n').trimEnd() + '\n'
}

export function renderUpdaterReleaseNotes(entry) {
  const extension = projectReleaseNotesEntry(entry)
  return { notes: renderUpdaterPlainTextNotes(extension), cutoutReleaseNotes: extension }
}

export function projectReleaseNotesEntry(entry) {
  return validateReleaseNotesExtension(Object.hasOwn(entry, 'protocol') ? entry : { protocol: RELEASE_NOTES_PROTOCOL, ...entry })
}
