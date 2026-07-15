/**
 * Node-only, read-only inventory adapter for the Everything Inbox.
 *
 * This intentionally does not produce a semantic code model and never copies
 * file contents into Design IR. It emits only reviewed repository metadata
 * (relative paths, byte lengths, media type, and SHA-256) for the existing
 * `repository-snapshot` ingestion contract.
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { RepositoryInventoryEntry, RepositorySnapshotInput } from './everything-inbox'
import type { SourceLicense, SourceRole } from '@/design-ir'

const DEFAULT_MAX_ENTRIES = 10_000
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 25 * 1024 * 1024

const IGNORED_DIRECTORIES = new Set([
  '.cutout', '.git', '.next', '.nuxt', '.output', '.turbo', '.vercel', 'build', 'coverage', 'dist', 'node_modules',
])
const SECRET_PATH = /(^|\/)(?:\.env[^/]*|[^/]*(?:secret|credential|(?:api|private|access|auth)[-_]?key|(?:access|auth)[-_]?token)[^/]*)(?:\/|$)/i
const SECRET_CONTENT = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+\u002f-]{8,}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b)/
const BINARY_EXTENSION = /\.(?:7z|avif|bin|bmp|class|dll|dmg|docx|exe|gif|gz|ico|icns|jar|jpeg|jpg|lockb|mov|mp3|mp4|o|otf|pdf|png|so|tar|ttf|wav|webm|webp|woff2?|zip)$/i
const CONFIG_FILE = /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(?:\.[^/]+)?\.json|vite\.config\.[^/]+|next\.config\.[^/]+|nuxt\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|components\.json|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.prettierrc(?:\.[^/]+)?|README(?:\.[^/]+)?|DESIGN\.md)$/i
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|sass|less|html|mdx|json|ya?ml)$/i

export type RepositoryFramework = 'next' | 'vite' | 'nuxt' | 'tanstack-start'

export interface FrameworkHint {
  readonly framework: RepositoryFramework
  /** Relative paths observed by this scanner. No package/source text is kept. */
  readonly evidence: readonly string[]
  readonly confidence: 'medium' | 'high'
}

export interface RepositoryExclusionSummary {
  readonly symbolicLink: number
  readonly secretPath: number
  readonly secretContent: number
  readonly ignoredDirectory: number
  readonly binary: number
  readonly oversized: number
  readonly unsupported: number
}

export interface RepositoryScanOptions {
  readonly label?: string
  readonly role: SourceRole
  readonly license: SourceLicense
  readonly promptProvenance?: string
  readonly maxEntries?: number
  readonly maxFileBytes?: number
  readonly maxTotalBytes?: number
}

export interface RepositoryScanResult {
  readonly snapshot: RepositorySnapshotInput
  readonly frameworkHints: readonly FrameworkHint[]
  readonly excluded: RepositoryExclusionSummary
}

/**
 * Inventory only files that Cutout can safely treat as configuration or source
 * evidence. The selected root itself cannot be a symlink; descendants that are
 * symlinks are excluded without resolving them.
 */
export async function scanLocalRepository(projectRoot: string, options: RepositoryScanOptions): Promise<RepositoryScanResult> {
  const limits = normalizeLimits(options)
  const label = normalizeLabel(options.label ?? basename(projectRoot))
  const root = await canonicalDirectory(projectRoot, 'project root')
  const entries: RepositoryInventoryEntry[] = []
  const excluded: MutableExclusionSummary = {
    symbolicLink: 0, secretPath: 0, secretContent: 0, ignoredDirectory: 0, binary: 0, oversized: 0, unsupported: 0,
  }
  let visitedEntries = 0
  let acceptedBytes = 0

  const walk = async (directory: string, directoryRelativePath = ''): Promise<void> => {
    const canonicalDirectoryPath = await canonicalDescendant(root, directory)
    const children = await readdir(canonicalDirectoryPath, { withFileTypes: true })
    children.sort((left, right) => comparePath(left.name, right.name))

    for (const child of children) {
      visitedEntries += 1
      if (visitedEntries > limits.maxEntries) throw new Error(`Repository entry limit (${limits.maxEntries}) exceeded.`)

      const relativePath = directoryRelativePath ? `${directoryRelativePath}/${child.name}` : child.name
      const target = resolve(canonicalDirectoryPath, child.name)
      assertContained(root, target)
      const stats = await lstat(target)
      if (stats.isSymbolicLink()) {
        excluded.symbolicLink += 1
        continue
      }
      if (stats.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(child.name)) {
          excluded.ignoredDirectory += 1
          continue
        }
        await walk(target, relativePath)
        continue
      }
      if (!stats.isFile()) {
        excluded.unsupported += 1
        continue
      }
      if (SECRET_PATH.test(relativePath)) {
        excluded.secretPath += 1
        continue
      }
      if (BINARY_EXTENSION.test(relativePath)) {
        excluded.binary += 1
        continue
      }
      if (!isEligibleTextPath(relativePath)) {
        excluded.unsupported += 1
        continue
      }
      if (stats.size > limits.maxFileBytes) {
        excluded.oversized += 1
        continue
      }
      if (acceptedBytes + stats.size > limits.maxTotalBytes) {
        throw new Error(`Repository total byte limit (${limits.maxTotalBytes}) exceeded.`)
      }

      const sampled = await readRegularFile(root, target)
      if (sampled.bytes.byteLength !== stats.size) {
        // A file changing during a scan may have crossed a safety limit; never
        // emit a descriptor unless the observed metadata and hashed bytes agree.
        if (sampled.bytes.byteLength > limits.maxFileBytes) {
          excluded.oversized += 1
          continue
        }
      }
      if (containsBinaryByte(sampled.bytes)) {
        excluded.binary += 1
        continue
      }
      if (looksLikeCredential(sampled.bytes)) {
        excluded.secretContent += 1
        continue
      }
      if (acceptedBytes + sampled.bytes.byteLength > limits.maxTotalBytes) {
        throw new Error(`Repository total byte limit (${limits.maxTotalBytes}) exceeded.`)
      }
      acceptedBytes += sampled.bytes.byteLength
      entries.push({
        path: relativePath,
        bytes: sampled.bytes.byteLength,
        mediaType: mediaTypeFor(relativePath),
        sha256: sha256(sampled.bytes),
      })
    }
  }

  await walk(root)
  entries.sort((left, right) => comparePath(left.path, right.path))
  return {
    snapshot: {
      type: 'repository-snapshot', label, entries, role: options.role, license: options.license,
      ...(options.promptProvenance ? { promptProvenance: options.promptProvenance } : {}),
    },
    frameworkHints: detectFrameworks(entries.map((entry) => entry.path)),
    excluded,
  }
}

type MutableExclusionSummary = { -readonly [Key in keyof RepositoryExclusionSummary]: number }

function normalizeLimits(options: RepositoryScanOptions) {
  return {
    maxEntries: positiveInteger(options.maxEntries ?? DEFAULT_MAX_ENTRIES, 'maxEntries'),
    maxFileBytes: positiveInteger(options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, 'maxFileBytes'),
    maxTotalBytes: positiveInteger(options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES, 'maxTotalBytes'),
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`)
  return value
}

function normalizeLabel(value: string): string {
  const label = value.trim()
  if (!label || label.length > 200 || label.includes('\0') || label.includes('/') || label.includes('\\') || label === '.' || label === '..') {
    throw new Error('Repository label must be a safe display name.')
  }
  return label
}

async function canonicalDirectory(path: string, description: string): Promise<string> {
  const stats = await lstat(path)
  if (stats.isSymbolicLink()) throw new Error(`${description} cannot be a symbolic link.`)
  if (!stats.isDirectory()) throw new Error(`${description} must be a directory.`)
  return realpath(path)
}

async function canonicalDescendant(root: string, candidate: string): Promise<string> {
  assertContained(root, candidate)
  const stats = await lstat(candidate)
  if (stats.isSymbolicLink()) throw new Error('Repository descendants cannot be symbolic links.')
  if (!stats.isDirectory()) throw new Error('Expected a repository directory.')
  const canonical = await realpath(candidate)
  assertContained(root, canonical)
  return canonical
}

function assertContained(root: string, candidate: string): void {
  const pathRelativeToRoot = relative(root, candidate)
  if (isAbsolute(pathRelativeToRoot) || pathRelativeToRoot === '..' || pathRelativeToRoot.startsWith(`..${sep}`)) {
    throw new Error('Repository path escapes the selected root.')
  }
}

async function readRegularFile(root: string, path: string): Promise<{ readonly bytes: Uint8Array }> {
  assertContained(root, path)
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error('Repository entry changed to a non-file during scan.')
    return { bytes: new Uint8Array(await handle.readFile()) }
  } finally {
    await handle.close()
  }
}

function isEligibleTextPath(path: string): boolean {
  return CONFIG_FILE.test(path) || SOURCE_FILE.test(path)
}

function containsBinaryByte(bytes: Uint8Array): boolean {
  return bytes.includes(0)
}

function looksLikeCredential(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return false
  return SECRET_CONTENT.test(new TextDecoder('utf-8', { fatal: false }).decode(bytes))
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function mediaTypeFor(path: string): string {
  const extension = extname(path).toLowerCase()
  const mediaTypes: Record<string, string> = {
    '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.jsx': 'text/javascript',
    '.json': 'application/json', '.md': 'text/markdown', '.mdx': 'text/markdown', '.ts': 'text/typescript',
    '.tsx': 'text/typescript', '.vue': 'text/x-vue', '.yaml': 'application/yaml', '.yml': 'application/yaml',
  }
  return mediaTypes[extension] ?? 'text/plain;charset=utf-8'
}

function detectFrameworks(paths: readonly string[]): readonly FrameworkHint[] {
  const hints: FrameworkHint[] = []
  const evidenceFor = (predicate: (path: string) => boolean) => paths.filter(predicate).sort(comparePath)
  const add = (framework: RepositoryFramework, evidence: string[]) => {
    if (evidence.length > 0) hints.push({ framework, evidence, confidence: evidence.length > 1 ? 'high' : 'medium' })
  }

  add('next', evidenceFor((path) => /^next\.config\./.test(path) || /^(?:app|pages)\/.+\.(?:[cm]?[jt]sx?)$/.test(path)))
  add('vite', evidenceFor((path) => /^vite\.config\./.test(path) || /^src\/main\.(?:[cm]?[jt]sx?)$/.test(path)))
  add('nuxt', evidenceFor((path) => /^nuxt\.config\./.test(path) || /^(?:app\.vue|pages\/.*\.vue)$/.test(path)))
  add('tanstack-start', evidenceFor((path) => /^(?:src\/routes\/__root\.|src\/router\.)[cm]?[jt]sx?$/.test(path)))
  return hints
}

function comparePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
