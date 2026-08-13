import { access, readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = resolve(websiteRoot, 'index.html')
const html = await readFile(indexPath, 'utf8')
const dom = new JSDOM(html)
const { document } = dom.window
const failures = []

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

function resolveLocalPath(pathname) {
  const normalizedPath = pathname.replace(/^\//, '')
  const candidate = resolve(websiteRoot, normalizedPath)
  requireCondition(
    candidate === websiteRoot || candidate.startsWith(`${websiteRoot}${sep}`),
    `Local reference escapes website root: ${pathname}`,
  )
  return candidate
}

requireCondition(document.documentElement.lang === 'en', 'Document language must be explicit.')
requireCondition(document.querySelector('main#main'), 'Missing the main landmark.')
requireCondition(document.querySelector('h1')?.textContent.trim() === 'Cutout', 'H1 must name the product.')
requireCondition(document.querySelectorAll('h1').length === 1, 'The page must contain exactly one H1.')
requireCondition(document.querySelector('a.skip-link')?.getAttribute('href') === '#main', 'Missing a valid skip link.')
requireCondition(document.title === 'Cutout — Agent-native Design OS', 'Unexpected document title.')

const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
requireCondition(canonical === 'https://cutout.nebutra.com/', 'Canonical URL is missing or incorrect.')
requireCondition(
  document.querySelector('meta[property="og:url"]')?.getAttribute('content') === canonical,
  'Open Graph URL must match the canonical URL.',
)
requireCondition(
  document.querySelector('meta[name="description"]')?.getAttribute('content')?.length >= 100,
  'Meta description is missing or too short.',
)

const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
requireCondition(new Set(ids).size === ids.length, 'Document IDs must be unique.')

const localReferences = new Set()
for (const element of document.querySelectorAll('[src], link[href]')) {
  const reference = element.getAttribute('src') || element.getAttribute('href')
  if (!reference || reference.startsWith('http') || reference.startsWith('#') || reference.startsWith('data:')) continue
  localReferences.add(reference.split('?')[0])
}

for (const reference of localReferences) {
  try {
    await access(resolveLocalPath(reference))
  } catch {
    failures.push(`Missing local resource: ${reference}`)
  }
}

for (const image of document.querySelectorAll('img')) {
  requireCondition(Boolean(image.getAttribute('width')), `Image is missing intrinsic width: ${image.getAttribute('src')}`)
  requireCondition(Boolean(image.getAttribute('height')), `Image is missing intrinsic height: ${image.getAttribute('src')}`)
  requireCondition(image.hasAttribute('alt'), `Image is missing alt text: ${image.getAttribute('src')}`)
}

for (const anchor of document.querySelectorAll('a[href^="#"]')) {
  const target = anchor.getAttribute('href')
  requireCondition(target === '#top' || Boolean(document.querySelector(target)), `Broken internal link: ${target}`)
}

const downloadLinks = [...document.querySelectorAll('[data-download-link]')]
requireCondition(downloadLinks.length >= 4, 'Expected download actions across desktop and mobile surfaces.')
for (const link of downloadLinks) {
  requireCondition(
    link.getAttribute('href') === 'https://github.com/Nebutra/cutout/releases/latest',
    `Download action bypasses the latest verified release authority: ${link.getAttribute('href')}`,
  )
}

const structuredData = document.querySelector('script[type="application/ld+json"]')?.textContent
try {
  const parsed = JSON.parse(structuredData || '')
  requireCondition(parsed['@type'] === 'SoftwareApplication', 'Structured data must describe a software application.')
  requireCondition(parsed.downloadUrl === 'https://github.com/Nebutra/cutout/releases/latest', 'Structured download URL is incorrect.')
} catch (error) {
  failures.push(`Structured data is invalid JSON: ${error.message}`)
}

const visibleCopy = document.body.textContent.toLowerCase()
for (const prohibitedClaim of [
  'live figma sync',
  'cloud collaboration',
  'web search',
  'video processing',
  'headless provider',
  'unlimited generations',
]) {
  requireCondition(!visibleCopy.includes(prohibitedClaim), `Unsupported capability claim found: ${prohibitedClaim}`)
}

requireCondition(
  visibleCopy.includes('no hardcoded route or material count'),
  'Intent-driven dynamic scope must be explicit.',
)
requireCondition(
  visibleCopy.includes('keys never enter the website or web ui'),
  'Local credential custody must be explicit.',
)
requireCondition(
  document.querySelector('[data-build-revision]')?.getAttribute('data-build-revision') === '__CUTOUT_BUILD_REVISION__',
  'Build revision placeholder is missing.',
)

if (failures.length > 0) {
  console.error(`Website validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Website validation passed: ${localReferences.size} local resources, ${ids.length} unique IDs, ${downloadLinks.length} verified release links.`)
}
