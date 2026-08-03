#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadReleaseNotesCatalog, projectReleaseNotesEntry, requireReleaseNotesEntry, renderGitHubReleaseMarkdown, renderLegacyEnglishNotes } from './lib/release-notes.mjs'

const [command, ...argv] = process.argv.slice(2)
const args = Object.fromEntries(argv.map((value, index) => value.startsWith('--') ? [value.slice(2), argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true'] : null).filter(Boolean))
const catalog = await loadReleaseNotesCatalog(args.catalog ? resolve(required('catalog')) : undefined, { requireAllLocales: args['require-all-locales'] === 'true' })

if (command === 'validate') {
  if (args.version) requireReleaseNotesEntry(catalog, required('version'), { requireAllLocales: args['require-all-locales'] === 'true' })
  process.stdout.write(`Validated ${catalog.entries.length} release-note catalog entr${catalog.entries.length === 1 ? 'y' : 'ies'}.\n`)
} else if (command === 'render') {
  const version = required('version')
  const entry = requireReleaseNotesEntry(catalog, version, { requireAllLocales: args['require-all-locales'] === 'true' })
  const extension = projectReleaseNotesEntry(entry)
  const output = resolve(args.output ?? join('dist', 'release-notes', version))
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(join(output, 'legacy-notes.txt'), `${renderLegacyEnglishNotes(entry)}\n`),
    writeFile(join(output, 'updater-extension.json'), `${JSON.stringify(extension, null, 2)}\n`),
    writeFile(join(output, 'bundled-note.json'), `${JSON.stringify(extension, null, 2)}\n`),
    writeFile(join(output, 'github-release.md'), renderGitHubReleaseMarkdown(entry)),
  ])
  process.stdout.write(`Rendered reviewed release notes for ${version} in ${output}.\n`)
} else {
  throw new Error('Usage: release-notes.mjs validate|render [--catalog <path>] [--version <semver>] [--output <directory>] [--require-all-locales]')
}

function required(name) {
  const value = args[name]
  if (!value || value === 'true') throw new Error(`--${name} is required.`)
  return value
}
