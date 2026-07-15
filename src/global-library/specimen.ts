/**
 * Saves a compiled design-kit specimen (design-system.html + demo.html) into
 * the Global Library so it survives beyond the transient in-memory state the
 * Specimen tab compiles into. This does not go through the
 * approve-deliverables receipt pipeline in approval.ts — that pipeline is
 * keyed to Design IR `materials`, and a compiled specimen isn't one; it's the
 * design-kit compiler's direct output. Content is stored as `text/plain`
 * (not `text/html`) because IndexedDbLibraryBlobStore's SAFE_MEDIA allowlist
 * deliberately excludes text/html — these are portable HTML source files
 * kept as text, never treated as directly renderable Library content.
 */
import type { DesignDocument } from '@/design-ir'
import type { ApprovalContentSink } from './approval'
import type { GlobalLibraryItem } from './contracts'
import type { ApprovedDeliverable } from './store'
import { computeLibraryContentHash } from './store'

export interface SpecimenFile {
  readonly path: string
  readonly content: string
}

export interface BuildSpecimenLibraryItemInput {
  readonly document: DesignDocument
  readonly files: readonly SpecimenFile[]
  readonly contentSink: ApprovalContentSink
  readonly approvalId: string
  readonly createdAt: string
}

const SPECIMEN_ARTIFACT_PATHS = ['design-system.html', 'demo.html'] as const

export async function buildSpecimenLibraryItem(
  input: BuildSpecimenLibraryItemInput,
): Promise<{ readonly item: GlobalLibraryItem; readonly approval: ApprovedDeliverable }> {
  const selected = input.files.filter((file) => (SPECIMEN_ARTIFACT_PATHS as readonly string[]).includes(file.path))
  if (selected.length === 0) throw new Error('No design-system.html or demo.html file was provided.')

  const stored = await Promise.all(selected.map(async (file) => {
    const bytes = new TextEncoder().encode(file.content)
    const put = await input.contentSink.put(bytes, 'text/plain')
    return { path: file.path, sha256: put.sha256, mediaType: 'text/plain', size: put.size }
  }))

  const manifestSha256 = await digestJson({
    documentId: input.document.meta.id,
    revisionId: input.document.revision.id,
    artifacts: stored,
  })
  const content = {
    manifestPath: 'manifest.json',
    manifestSha256,
    artifacts: stored,
  }
  const contentSha256 = await computeLibraryContentHash(content)
  const id = safeId(`design-specimen.${input.document.meta.id}`)
  const version = `${input.document.revision.number}.0.0`

  const item: GlobalLibraryItem = {
    protocol: 'cutout.global-library.v1',
    id,
    version,
    kind: 'design-system-kit',
    name: safeText(`${input.document.meta.title} — Design specimen`, 160),
    description: safeText(
      `Design system specimen (design-system.html) and product demo (demo.html) compiled from revision ${input.document.revision.id}.`,
      2_000,
    ),
    contentSha256,
    content,
    origin: {
      kind: 'generated',
      producer: 'cutout.design-kit',
      projectId: safeId(input.document.meta.id),
      runId: safeId(input.approvalId),
      sourceRevision: safeId(input.document.revision.id),
    },
    license: {
      kind: 'proprietary',
      holder: safeText(input.document.meta.title, 240) || 'Project owner',
      usage: 'Project-approved use only.',
    },
    tags: ['design-specimen'],
    collections: [],
    favorite: false,
    pinned: false,
    dependencies: [],
    compatibility: [],
    qualityReceipts: [],
    lineage: { root: { itemId: id, version, contentSha256 }, depth: 0 },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }

  return {
    item,
    approval: { status: 'succeeded', approvalId: input.approvalId, contentSha256 },
  }
}

function safeId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '.')
      .replace(/^[^a-z0-9]+/, '')
      .slice(0, 160) || 'unknown'
  )
}

function safeText(value: string, max: number): string {
  return value.trim().slice(0, max)
}

async function digestJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
