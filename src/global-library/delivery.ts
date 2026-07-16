import type { DesignDocument } from '@/design-ir'
import type { TargetExecutionReceipt } from '@/delivery-center'
import type { ApprovalContentSink } from './approval'
import type { GlobalLibraryItem, LibraryItemKind } from './contracts'
import { computeLibraryContentHash, type ApprovedDeliverable } from './store'

export interface DeliveryLibraryFile { readonly path: string; readonly content: string }

export async function buildDeliveryLibraryItem(input: {
  readonly document: DesignDocument
  readonly receipt: TargetExecutionReceipt
  readonly files: readonly DeliveryLibraryFile[]
  readonly contentSink: ApprovalContentSink
  readonly approvalId: string
  readonly createdAt: string
}): Promise<{ readonly item: GlobalLibraryItem; readonly approval: ApprovedDeliverable }> {
  if (input.receipt.status !== 'succeeded') throw new Error('Only a successful delivery can enter Library.')
  const kind = libraryKind(input.receipt.kind)
  const expected = new Map(input.receipt.artifacts.map((artifact) => [artifact.path, artifact.sha256]))
  if (expected.size !== input.files.length) throw new Error('Delivery files do not match the successful receipt.')
  const artifacts = await Promise.all(input.files.map(async (file) => {
    const expectedHash = expected.get(file.path)
    if (!expectedHash) throw new Error(`Delivery receipt is missing ${file.path}.`)
    const stored = await input.contentSink.put(new TextEncoder().encode(file.content), 'text/plain')
    if (stored.sha256 !== expectedHash) throw new Error(`Delivery content hash mismatch: ${file.path}.`)
    return { path: file.path, sha256: stored.sha256, mediaType: 'text/plain', size: stored.size }
  }))
  const manifestArtifact = input.receipt.kitManifests[0]
  const manifestPath = input.files.find((file) => /(?:^|\/)manifest(?:\.[a-z]+)?\.json$/i.test(file.path))?.path ?? input.files[0]?.path
  if (!manifestPath || artifacts.length === 0) throw new Error('Delivery has no Library artifacts.')
  const manifestSha256 = manifestArtifact?.sha256 ?? artifacts.find((artifact) => artifact.path === manifestPath)!.sha256
  const content = { manifestPath, manifestSha256, artifacts }
  const contentSha256 = await computeLibraryContentHash(content)
  const id = safeId(`${kind}.${input.document.meta.id}`)
  const version = `${input.document.revision.number}.0.0`
  const item: GlobalLibraryItem = {
    protocol: 'cutout.global-library.v1', id, version, kind,
    name: safeText(`${input.document.meta.title} ${label(input.receipt.kind)}`, 160),
    description: safeText(`Approved ${label(input.receipt.kind)} delivery from Design IR revision ${input.document.revision.id}.`, 2_000),
    contentSha256, content,
    origin: { kind: 'generated', producer: 'cutout.delivery-center', projectId: safeId(input.document.meta.id), runId: safeId(input.approvalId), sourceRevision: safeId(input.document.revision.id) },
    license: { kind: 'proprietary', holder: safeText(input.document.meta.title, 240) || 'Project owner', usage: 'Project-approved use only.' },
    tags: ['approved-delivery'], collections: [], favorite: false, pinned: false, dependencies: [], compatibility: [], qualityReceipts: [],
    lineage: { root: { itemId: id, version, contentSha256 }, depth: 0 }, createdAt: input.createdAt, updatedAt: input.createdAt,
  }
  return { item, approval: { status: 'succeeded', approvalId: input.approvalId, contentSha256 } }
}

function libraryKind(kind: TargetExecutionReceipt['kind']): LibraryItemKind {
  if (kind === 'brand-kit') return 'brand-kit'
  if (kind === 'design-system') return 'design-system-kit'
  if (kind === 'components') return 'component-library-item'
  if (kind === 'starter') return 'starter-kit'
  throw new Error(`${kind} delivery is not a reusable Kit Library item.`)
}
function label(kind: TargetExecutionReceipt['kind']): string { return kind.replaceAll('-', ' ') }
function safeId(value:string){return value.toLowerCase().replace(/[^a-z0-9._-]+/g,'.').replace(/^[^a-z0-9]+/,'').slice(0,160)||'unknown'}
function safeText(value:string,max:number){return value.trim().replace(/\s+/g,' ').slice(0,max)||'Unknown'}
