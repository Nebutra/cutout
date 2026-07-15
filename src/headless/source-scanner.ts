import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { basename, relative, resolve, sep } from 'node:path'
import type { SourceIngestOperation } from '@/control-protocol'
import type { EverythingInput, RepositoryInventoryEntry } from '@/ingestion/everything-inbox'

const MAX_FILE_BYTES = 100 * 1024 * 1024
const MAX_REPOSITORY_ENTRIES = 10_000
const IGNORED_DIRECTORY = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt'])
const SECRET_PATH = /(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i
const ALLOWLISTED_CONFIG = /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(?:\.[^/]+)?\.json|vite\.config\.[^/]+|next\.config\.[^/]+|nuxt\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|components\.json|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.prettierrc(?:\.[^/]+)?|README(?:\.[^/]+)?|DESIGN\.md)$/i
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|sass|less|html|mdx?|json|ya?ml)$/i

export interface ScannedSourceInput {
  readonly input: EverythingInput
  readonly artifacts: readonly { readonly bytes: Uint8Array; readonly mediaType: string }[]
}

/**
 * Resolve scan requests only below a canonical, caller-owned project root.
 * The protocol has already rejected absolute/traversal paths; these checks
 * defend against symlink pivots and time-of-check surprises at the host edge.
 */
export async function scanSourceInput(
  projectRoot: string,
  operation: Extract<SourceIngestOperation, { readonly type: 'source.ingest' }>,
): Promise<ScannedSourceInput> {
  const root = await realpath(projectRoot)
  const input = operation.input
  switch (input.type) {
    case 'inline-text': {
      const bytes = new TextEncoder().encode(input.text)
      return { input: { ...input }, artifacts: [{ bytes, mediaType: 'text/plain;charset=utf-8' }] }
    }
    case 'url-descriptor':
      return { input: { ...input }, artifacts: [] }
    case 'local-file-scan': {
      const target = await controlledPath(root, input.path)
      const stat = await lstat(target)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Only regular, non-symbolic-link files can be ingested.')
      if (stat.size > MAX_FILE_BYTES) throw new Error(`Local files over ${MAX_FILE_BYTES} bytes are not accepted.`)
      const bytes = new Uint8Array(await readFile(target))
      if (bytes.byteLength !== stat.size) throw new Error('Source file changed while it was being read.')
      return {
        input: {
          type: 'local-file', path: input.path, bytes, sourceKind: input.sourceKind,
          role: input.role, license: input.license,
          ...(input.title ? { title: input.title } : {}),
          ...(input.mediaType ? { mediaType: input.mediaType } : {}),
          ...(input.promptProvenance ? { promptProvenance: input.promptProvenance } : {}),
        },
        artifacts: [{ bytes, mediaType: input.mediaType ?? mediaTypeFor(input.path, input.sourceKind) }],
      }
    }
    case 'repository-scan': {
      const directory = await controlledPath(root, input.root)
      const stat = await lstat(directory)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Repository scans require a regular, non-symbolic-link directory.')
      const entries = await inventory(directory, root)
      return {
        input: {
          type: 'repository-snapshot', label: input.label ?? basename(input.root === '.' ? root : input.root), entries,
          role: input.role, license: input.license,
          ...(input.promptProvenance ? { promptProvenance: input.promptProvenance } : {}),
        },
        artifacts: [],
      }
    }
  }
}

async function inventory(directory: string, root: string): Promise<readonly RepositoryInventoryEntry[]> {
  const entries: RepositoryInventoryEntry[] = []
  const visit = async (current: string): Promise<void> => {
    const names = await readdir(current)
    for (const name of names.sort((left, right) => left.localeCompare(right))) {
      if (entries.length >= MAX_REPOSITORY_ENTRIES) throw new Error(`Repository inventories over ${MAX_REPOSITORY_ENTRIES} entries are not accepted.`)
      const target = resolve(current, name)
      const stat = await lstat(target)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        if (!IGNORED_DIRECTORY.has(name)) await visit(target)
        continue
      }
      if (!stat.isFile()) continue
      const path = relative(root, target).split(sep).join('/')
      if (!allowedRepositoryEntry(path)) continue
      entries.push({ path, bytes: stat.size, sha256: await digestFile(target, stat.size) })
    }
  }
  await visit(directory)
  return entries
}

function allowedRepositoryEntry(path: string): boolean {
  return !SECRET_PATH.test(path) && (ALLOWLISTED_CONFIG.test(path) || SOURCE_FILE.test(path))
}

async function digestFile(path: string, expectedBytes: number): Promise<string> {
  // Hashes make a repository snapshot auditable while never placing its source
  // contents in Design IR or a control response.
  const bytes = new Uint8Array(await readFile(path))
  if (bytes.byteLength !== expectedBytes) throw new Error('Repository file changed while it was being scanned.')
  return createHash('sha256').update(bytes).digest('hex')
}

async function controlledPath(root: string, relativePath: string): Promise<string> {
  const requested = relativePath === '.' ? root : resolve(root, relativePath)
  assertInside(root, requested)
  const canonical = await realpath(requested)
  assertInside(root, canonical)
  return canonical
}

function assertInside(root: string, candidate: string) {
  const path = relative(root, candidate)
  if (path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.includes(`..${sep}`))) return
  throw new Error('Source scan path escapes the controlled project root.')
}

function mediaTypeFor(path: string, kind: 'document' | 'code' | 'screenshot' | 'photo' | 'video'): string {
  const extension = path.split('.').at(-1)?.toLowerCase()
  const byExtension: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', md: 'text/markdown;charset=utf-8', txt: 'text/plain;charset=utf-8',
    ts: 'text/typescript;charset=utf-8', tsx: 'text/typescript;charset=utf-8', js: 'text/javascript;charset=utf-8', jsx: 'text/javascript;charset=utf-8',
  }
  return byExtension[extension ?? ''] ?? (kind === 'video' ? 'video/*' : kind === 'screenshot' || kind === 'photo' ? 'image/*' : 'application/octet-stream')
}
