/**
 * Everything Inbox v1 is deliberately a local descriptor parser. It neither
 * reads the host filesystem nor fetches URLs: callers provide bytes or a safe
 * repository inventory, and receive an auditable Design IR source patch.
 */
import type {
  DesignDocument,
  DesignDocumentRevision,
  DesignSource,
  Provenance,
  SourceKind,
  SourceLicense,
  SourceRole,
} from '@/design-ir'
import { validateDesignDocument } from '@/design-ir'
import { err, ok, type Result } from '@/services/types'

const MAX_LOCAL_FILE_BYTES = 100 * 1024 * 1024
const MAX_INLINE_TEXT_BYTES = 1 * 1024 * 1024
const MAX_REPOSITORY_ENTRIES = 10_000
const CREDENTIAL_PATTERN = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i
const SECRET_PATH_PATTERN = /(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i
const SKIPPED_REPOSITORY_DIRECTORY = /^(?:node_modules|\.git|dist|build|coverage|\.next|\.nuxt)(?:\/|$)/i
const ALLOWLISTED_CONFIG = /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(?:\.[^/]+)?\.json|vite\.config\.[^/]+|next\.config\.[^/]+|nuxt\.config\.[^/]+|tailwind\.config\.[^/]+|postcss\.config\.[^/]+|components\.json|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.prettierrc(?:\.[^/]+)?|README(?:\.[^/]+)?|DESIGN\.md)$/i
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|sass|less|html|mdx?|json|ya?ml)$/i

export interface LocalFileInput {
  readonly type: 'local-file'
  /** Relative display path supplied by the host; never a path to read. */
  readonly path: string
  readonly bytes: Uint8Array
  readonly isSymbolicLink?: boolean
  readonly sourceKind: Extract<SourceKind, 'document' | 'code' | 'screenshot' | 'photo' | 'video'>
  readonly mediaType?: string
  readonly title?: string
  readonly role: SourceRole
  readonly license: SourceLicense
  readonly promptProvenance?: string
}

export interface InlineTextInput {
  readonly type: 'inline-text'
  readonly sourceKind: Extract<SourceKind, 'need' | 'story' | 'idea' | 'document' | 'code'>
  readonly title: string
  readonly text: string
  readonly role: SourceRole
  readonly license: SourceLicense
  readonly promptProvenance?: string
}

export interface UrlDescriptorInput {
  readonly type: 'url-descriptor'
  readonly url: string
  readonly title?: string
  /** User/host supplied metadata, never inferred from a network response. */
  readonly capturedMediaType?: string
  readonly role: SourceRole
  readonly license: SourceLicense
  readonly promptProvenance?: string
}

export interface RepositoryInventoryEntry {
  /** Relative path only. The parser cannot and does not read it. */
  readonly path: string
  readonly bytes: number
  readonly mediaType?: string
  /** Optional scanner-computed digest. It is safe metadata, never file bytes. */
  readonly sha256?: string
  readonly isSymbolicLink?: boolean
}

export interface RepositorySnapshotInput {
  readonly type: 'repository-snapshot'
  readonly label: string
  readonly entries: readonly RepositoryInventoryEntry[]
  readonly role: SourceRole
  readonly license: SourceLicense
  readonly promptProvenance?: string
}

export type EverythingInput = LocalFileInput | InlineTextInput | UrlDescriptorInput | RepositorySnapshotInput

export interface SourcePatch {
  readonly sources: readonly DesignSource[]
  readonly provenance: readonly Provenance[]
}

export interface IngestionSkip {
  readonly reason: 'duplicate-content' | 'repository-entry-excluded'
  readonly detail?: string
}

export interface IngestionResult {
  readonly patch: SourcePatch
  readonly skipped: readonly IngestionSkip[]
}

export interface IngestionOptions {
  readonly capturedAt?: string
  readonly actorId?: string
  readonly existingSources?: readonly DesignSource[]
}

export interface SourcePatchRevision {
  readonly id: string
  readonly createdAt: string
  readonly actor: DesignDocumentRevision['author']
}

/**
 * Build an additive Design IR patch. Duplicate detection is content-addressed
 * where bytes exist, and descriptor-addressed for URL/repository imports.
 */
export async function ingestEverything(
  input: EverythingInput,
  options: IngestionOptions = {},
): Promise<Result<IngestionResult>> {
  const capturedAt = options.capturedAt ?? new Date().toISOString()
  if (!isIsoDate(capturedAt)) return err('capturedAt must be an ISO-8601 UTC timestamp.')
  const actorId = options.actorId ?? 'system:everything-inbox'
  if (!isSafeId(actorId)) return err('actorId must be a non-empty safe identifier.')

  const source = await sourceFromInput(input, capturedAt)
  if (!source.ok) return source
  if (isDuplicate(source.data, options.existingSources ?? [])) {
    return ok({ patch: { sources: [], provenance: [] }, skipped: [{ reason: 'duplicate-content' }] })
  }

  const record: Provenance = {
    id: `provenance:ingest:${stableSuffix(source.data.id)}`,
    operation: 'import',
    sourceIds: [source.data.id],
    actor: { kind: actorKindFor(actorId), id: actorId },
    recordedAt: capturedAt,
    tool: 'cutout.everything-inbox.v1',
  }
  return ok({ patch: { sources: [source.data], provenance: [record] }, skipped: [] })
}

/**
 * Apply a previously reviewed SourcePatch. The patch only appends sources and
 * matching provenance records; it does not mutate any other Design IR entity.
 */
export function applySourcePatch(
  document: DesignDocument,
  patch: SourcePatch,
  revision: SourcePatchRevision,
): Result<DesignDocument> {
  const existing = new Map(document.sources.map((source) => [source.id, source]))
  const appendedSources: DesignSource[] = []
  for (const source of patch.sources) {
    const previous = existing.get(source.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(source)) {
      return err(`Source patch conflicts with existing source id "${source.id}".`)
    }
    if (!previous && !isDuplicate(source, [...existing.values()])) {
      existing.set(source.id, source)
      appendedSources.push(source)
    }
  }
  const sourceIds = new Set(existing.keys())
  const provenance = [...document.provenance]
  const provenanceById = new Map(provenance.map((record) => [record.id, record]))
  for (const record of patch.provenance) {
    if (!record.sourceIds.every((sourceId) => sourceIds.has(sourceId))) {
      return err(`Provenance "${record.id}" references a source outside this patch/document.`)
    }
    const previous = provenanceById.get(record.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
      return err(`Source patch conflicts with existing provenance id "${record.id}".`)
    }
    if (!previous) {
      provenance.push(record)
      provenanceById.set(record.id, record)
    }
  }
  if (appendedSources.length === 0 && provenance.length === document.provenance.length) return ok(document)

  const next: DesignDocument = {
    ...document,
    meta: { ...document.meta, updatedAt: revision.createdAt },
    revision: {
      ...document.revision,
      id: revision.id,
      number: document.revision.number + 1,
      createdAt: revision.createdAt,
      author: revision.actor,
    },
    sources: [...document.sources, ...appendedSources],
    provenance,
  }
  const validation = validateDesignDocument(next)
  return validation.ok ? ok(validation.data.document) : validation
}

async function sourceFromInput(input: EverythingInput, capturedAt: string): Promise<Result<DesignSource>> {
  switch (input.type) {
    case 'local-file': return sourceFromLocalFile(input, capturedAt)
    case 'inline-text': return sourceFromInlineText(input, capturedAt)
    case 'url-descriptor': return sourceFromUrlDescriptor(input, capturedAt)
    case 'repository-snapshot': return sourceFromRepositorySnapshot(input, capturedAt)
  }
}

async function sourceFromLocalFile(input: LocalFileInput, capturedAt: string): Promise<Result<DesignSource>> {
  const path = safeRelativePath(input.path)
  if (!path.ok) return path
  if (input.isSymbolicLink) return err('symbolic links are not accepted for local-file ingestion.')
  if (SECRET_PATH_PATTERN.test(path.data)) return err('Credential-shaped local-file paths are not accepted for ingestion.')
  if (input.bytes.byteLength > MAX_LOCAL_FILE_BYTES) return err(`Local files over ${MAX_LOCAL_FILE_BYTES} bytes are not accepted.`)
  if (!safePrompt(input.promptProvenance)) return err('Prompt provenance contains a credential-shaped value or is too large.')
  if (input.sourceKind === 'document' || input.sourceKind === 'code') {
    const text = decodeUtf8(input.bytes)
    if (!text.ok) return text
    if (input.bytes.byteLength > MAX_INLINE_TEXT_BYTES) return err(`Text files over ${MAX_INLINE_TEXT_BYTES} bytes are not accepted.`)
  }
  const digest = await sha256(input.bytes)
  const mediaType = input.mediaType ?? mediaTypeFor(path.data, input.sourceKind)
  const id = `source:${input.sourceKind}:${digest}`
  const title = safeTitle(input.title ?? basename(path.data))
  if (!title) return err('Local file title is invalid.')
  return ok({
    id,
    kind: input.sourceKind,
    role: input.role,
    title,
    license: input.license,
    content: [{ id: `content:${digest}`, uri: `cutout://ingestion/sha256/${digest}`, mediaType, sha256: digest }],
    ingestion: {
      origin: 'local-file', capturedAt, relativePath: path.data, mediaType,
      bytes: input.bytes.byteLength, ...(input.promptProvenance ? { prompt: input.promptProvenance } : {}),
    },
  })
}

async function sourceFromInlineText(input: InlineTextInput, capturedAt: string): Promise<Result<DesignSource>> {
  if (!safeTitle(input.title)) return err('Inline text title is invalid.')
  if (!safePrompt(input.text) || !safePrompt(input.promptProvenance)) return err('Inline text or prompt provenance contains a credential-shaped value or is too large.')
  const bytes = new TextEncoder().encode(input.text)
  if (bytes.byteLength > MAX_INLINE_TEXT_BYTES) return err(`Inline text over ${MAX_INLINE_TEXT_BYTES} bytes is not accepted.`)
  const digest = await sha256(bytes)
  return ok({
    id: `source:${input.sourceKind}:${digest}`,
    kind: input.sourceKind,
    role: input.role,
    title: input.title.trim(), license: input.license,
    content: [{ id: `content:${digest}`, uri: `cutout://ingestion/sha256/${digest}`, mediaType: 'text/plain;charset=utf-8', sha256: digest }],
    ingestion: { origin: 'inline-text', capturedAt, mediaType: 'text/plain;charset=utf-8', bytes: bytes.byteLength, ...(input.promptProvenance ? { prompt: input.promptProvenance } : {}) },
  })
}

async function sourceFromUrlDescriptor(input: UrlDescriptorInput, capturedAt: string): Promise<Result<DesignSource>> {
  const parsed = safeHttpUrl(input.url)
  if (!parsed.ok) return parsed
  if (!safePrompt(input.promptProvenance)) return err('Prompt provenance contains a credential-shaped value or is too large.')
  const title = input.title ? safeTitle(input.title) : parsed.data.hostname
  if (!title) return err('URL descriptor title is invalid.')
  const digest = await sha256(new TextEncoder().encode(parsed.data.toString()))
  return ok({
    id: `source:url:${digest}`, kind: 'url', role: input.role, title, license: input.license,
    content: [{ id: `content:${digest}`, uri: parsed.data.toString(), mediaType: input.capturedMediaType, sha256: digest }],
    ingestion: {
      origin: 'url-descriptor', capturedAt, url: parsed.data.toString(), mediaType: input.capturedMediaType,
      descriptor: { kind: 'url', url: parsed.data.toString(), ...(input.title ? { title } : {}), ...(input.capturedMediaType ? { capturedMediaType: input.capturedMediaType } : {}) },
      ...(input.promptProvenance ? { prompt: input.promptProvenance } : {}),
    },
  })
}

async function sourceFromRepositorySnapshot(input: RepositorySnapshotInput, capturedAt: string): Promise<Result<DesignSource>> {
  if (!safeTitle(input.label)) return err('Repository snapshot label is invalid.')
  if (!safePrompt(input.promptProvenance)) return err('Prompt provenance contains a credential-shaped value or is too large.')
  if (input.entries.length > MAX_REPOSITORY_ENTRIES) return err(`Repository inventories over ${MAX_REPOSITORY_ENTRIES} entries are not accepted.`)
  const included: string[] = []
  const safeEntries: Array<{ path: string; bytes: number; mediaType?: string; sha256?: string }> = []
  let excludedCount = 0
  for (const entry of input.entries) {
    const path = safeRelativePath(entry.path)
    if (!path.ok || entry.isSymbolicLink || entry.bytes < 0 || !Number.isSafeInteger(entry.bytes)) {
      excludedCount += 1
      continue
    }
    if (SECRET_PATH_PATTERN.test(path.data) || SKIPPED_REPOSITORY_DIRECTORY.test(path.data) || !isRepositoryEntryAllowed(path.data, entry.mediaType) || (entry.sha256 !== undefined && !isSha256(entry.sha256))) {
      excludedCount += 1
      continue
    }
    included.push(path.data)
    safeEntries.push({ path: path.data, bytes: entry.bytes, ...(entry.mediaType ? { mediaType: entry.mediaType } : {}), ...(entry.sha256 ? { sha256: entry.sha256.toLowerCase() } : {}) })
  }
  included.sort()
  safeEntries.sort((left, right) => left.path.localeCompare(right.path))
  const descriptor = JSON.stringify({ label: input.label.trim(), entries: safeEntries, excludedCount })
  const digest = await sha256(new TextEncoder().encode(descriptor))
  return ok({
    id: `source:repository:${digest}`, kind: 'repository', role: input.role,
    title: `Repository snapshot: ${input.label.trim()}`, license: input.license,
    content: [{ id: `content:${digest}`, uri: `cutout://repository-snapshot/${digest}`, mediaType: 'application/vnd.cutout.repository-inventory+json', sha256: digest }],
    ingestion: {
      origin: 'repository-snapshot', capturedAt,
      descriptor: {
        kind: 'repository', label: input.label.trim(), includedPaths: included, excludedCount,
        ...(safeEntries.some((entry) => entry.sha256) ? { entries: safeEntries } : {}),
      },
      ...(input.promptProvenance ? { prompt: input.promptProvenance } : {}),
    },
  })
}

function isDuplicate(candidate: DesignSource, existing: readonly DesignSource[]): boolean {
  const candidateRefs = new Set(candidate.content.map((ref) => ref.sha256 ?? ref.uri))
  return existing.some((source) => source.content.some((ref) => candidateRefs.has(ref.sha256 ?? ref.uri)))
}

function safeRelativePath(value: string): Result<string> {
  if (!value || value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) {
    return err('Only non-empty relative paths are accepted.')
  }
  const parts = value.replaceAll('\\', '/').split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) return err('Path traversal is not accepted.')
  return ok(parts.join('/'))
}

function safeHttpUrl(value: string): Result<URL> {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return err('Only HTTP(S) URL descriptors are accepted.')
    if (url.username || url.password) return err('URL descriptors cannot contain credentials.')
    return ok(url)
  } catch { return err('Invalid URL descriptor.') }
}

function decodeUtf8(bytes: Uint8Array): Result<string> {
  try { return ok(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { return err('Document/code input must be valid UTF-8.') }
}

function safePrompt(value: string | undefined): boolean {
  return value === undefined || (value.length > 0 && value.length <= 20_000 && !value.includes('\0') && !CREDENTIAL_PATTERN.test(value))
}

function safeTitle(value: string): string | null {
  const title = value.trim()
  return title.length > 0 && title.length <= 200 && !title.includes('\0') ? title : null
}

function basename(path: string): string { return path.split('/').at(-1) ?? path }
function stableSuffix(id: string): string { return id.replace(/^source:/, '').slice(0, 130) }
function isSafeId(id: string): boolean { return id.length > 0 && id.length <= 160 && !id.includes('\0') }
function isSha256(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value) }
function actorKindFor(id: string): Provenance['actor']['kind'] {
  if (id.startsWith('system:')) return 'system'
  if (id.startsWith('agent:')) return 'agent'
  return 'human'
}
function isIsoDate(value: string): boolean { return Number.isFinite(Date.parse(value)) && /Z$/.test(value) }
function isRepositoryEntryAllowed(path: string, mediaType: string | undefined): boolean {
  return !mediaType?.startsWith('image/') && !mediaType?.startsWith('video/') && (ALLOWLISTED_CONFIG.test(path) || SOURCE_FILE.test(path))
}
function mediaTypeFor(path: string, kind: LocalFileInput['sourceKind']): string {
  const extension = path.split('.').at(-1)?.toLowerCase()
  const byExtension: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', md: 'text/markdown;charset=utf-8', txt: 'text/plain;charset=utf-8',
    ts: 'text/typescript;charset=utf-8', tsx: 'text/typescript;charset=utf-8', js: 'text/javascript;charset=utf-8', jsx: 'text/javascript;charset=utf-8',
  }
  return byExtension[extension ?? ''] ?? (kind === 'video' ? 'video/*' : kind === 'screenshot' || kind === 'photo' ? 'image/*' : 'application/octet-stream')
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
