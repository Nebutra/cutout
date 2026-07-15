import { z } from 'zod'
import type { OutcomeRuntimeState } from '@/agent-runtime/outcome-runtime'
import type { ContentReference, DesignDocument, Material } from '@/design-ir'
import { computeLibraryContentHash } from './store'
import type { GlobalLibraryItem, LibraryItemKind, LibraryLicense } from './contracts'

const sha = z.string().regex(/^[a-f0-9]{64}$/)
export const approvedDeliverableReceiptSchema = z.object({
  protocol: z.literal('cutout.approved-deliverable.v1'), approvalId: z.string().min(1).max(160), approvedAt: z.string().datetime(), projectId: z.string().min(1),
  outcome: z.object({ id: z.string().min(1), runId: z.string().min(1), status: z.literal('ready-to-deliver') }).strict(),
  designRevision: z.object({ documentId: z.string().min(1), revisionId: z.string().min(1), revisionNumber: z.number().int().positive() }).strict(),
  material: z.object({ id: z.string().min(1), kind: z.string().min(1), name: z.string().min(1), revisionId: z.string().min(1), contentSha256: sha, mediaType: z.string().min(1), size: z.number().int().nonnegative(), provenanceIds: z.array(z.string().min(1)) }).strict(),
  library: z.object({ itemId: z.string().min(1), version: z.string().min(1), kind: z.enum(['brand-kit', 'design-system-kit', 'component-library-item', 'visual-asset']), contentSha256: sha, manifestSha256: sha }).strict(),
  license: z.union([z.object({ kind: z.literal('spdx'), identifier: z.string().min(1) }).strict(), z.object({ kind: z.literal('proprietary'), holder: z.string().min(1), usage: z.string().min(1) }).strict(), z.object({ kind: z.literal('public-domain'), evidenceRef: z.string().optional() }).strict(), z.object({ kind: z.literal('unknown'), rationale: z.string().min(1) }).strict()]),
  quality: z.array(z.object({ gate: z.enum(['schema', 'provenance']), status: z.literal('passed'), evidence: z.array(z.string().min(1)) }).strict()).min(2),
}).strict()
export type ApprovedDeliverableReceipt = z.infer<typeof approvedDeliverableReceiptSchema>

export interface ApprovalContentSink { put(bytes:Uint8Array,mediaType:string):Promise<{readonly sha256:string;readonly size:number}> }
export interface ApprovalInput { readonly document:DesignDocument; readonly outcome:OutcomeRuntimeState; readonly approvalId:string; readonly approvedAt:string; readonly resolveContent?:(reference:ContentReference)=>Promise<Uint8Array|null>; readonly contentSink?:ApprovalContentSink }
export async function approveCurrentDeliverables(input: ApprovalInput): Promise<readonly ApprovedDeliverableReceipt[]> {
  if (input.outcome.status !== 'ready-to-deliver') throw new Error('Only a ready-to-deliver outcome can be approved.')
  const license = projectLicense(input.document)
  return Promise.all(input.document.materials.map(async (material) => buildReceipt(input, material, license)))
}

export async function libraryItemFromApproval(receipt: ApprovedDeliverableReceipt): Promise<GlobalLibraryItem> {
  const parsed = approvedDeliverableReceiptSchema.parse(receipt), at = parsed.approvedAt
  const content = { manifestPath: 'manifest.json', manifestSha256: parsed.library.manifestSha256, artifacts: [{ path: `materials/${safePath(parsed.material.id)}`, sha256: parsed.material.contentSha256, mediaType: parsed.material.mediaType, size: parsed.material.size }] }
  const contentSha256 = await computeLibraryContentHash(content)
  if (contentSha256 !== parsed.library.contentSha256) throw new Error('Approved receipt no longer matches its library content hash.')
  return { protocol: 'cutout.global-library.v1', id: parsed.library.itemId, version: parsed.library.version, kind: parsed.library.kind, name: parsed.material.name, description: `Approved ${parsed.material.kind} from ${parsed.projectId}.`, contentSha256, content, origin: { kind: 'generated', producer: 'cutout.approval', projectId: safeId(parsed.projectId), runId: safeId(parsed.outcome.runId), sourceRevision: safeId(parsed.designRevision.revisionId) }, license: parsed.license, tags: [safeId(parsed.material.kind)], collections: [], favorite: false, pinned: false, dependencies: [], compatibility: [], qualityReceipts: parsed.quality.map((quality) => ({ id: `quality.${quality.gate}`, gate: quality.gate, status: quality.status, checkedAt: at, tool: 'cutout.approval', evidence: quality.evidence.map((id) => ({ id: safeId(id), sha256: parsed.material.contentSha256 })) })), lineage: { root: { itemId: parsed.library.itemId, version: parsed.library.version, contentSha256 }, depth: 0 }, createdAt: at, updatedAt: at }
}

async function buildReceipt(input: ApprovalInput, material: Material, license: LibraryLicense): Promise<ApprovedDeliverableReceipt> {
  const revision = material.revisions.find(({ id }) => id === material.currentRevisionId)
  if (!revision?.content.sha256 || !revision.content.mediaType) throw new Error(`Material ${material.id} lacks hashed content evidence.`)
  let size=0
  if(input.resolveContent&&input.contentSink){const bytes=await input.resolveContent(revision.content);if(bytes){const stored=await input.contentSink.put(bytes,revision.content.mediaType);if(stored.sha256!==revision.content.sha256)throw new Error(`Resolved bytes for ${material.id} do not match Design IR content hash.`);size=stored.size}}
  const kind = libraryKind(material), itemId = safeId(material.id), version = `${input.document.revision.number}.${revision.ordinal}.0`, manifestSha256 = await digest(JSON.stringify({ materialId: material.id, revisionId: revision.id, contentSha256: revision.content.sha256, designRevisionId: input.document.revision.id }))
  const content = { manifestPath: 'manifest.json', manifestSha256, artifacts: [{ path: `materials/${safePath(material.id)}`, sha256: revision.content.sha256, mediaType: revision.content.mediaType, size }] }
  return approvedDeliverableReceiptSchema.parse({ protocol: 'cutout.approved-deliverable.v1', approvalId: input.approvalId, approvedAt: input.approvedAt, projectId: input.document.meta.id, outcome: { id: input.outcome.contract.id, runId: input.outcome.runId, status: input.outcome.status }, designRevision: { documentId: input.document.meta.id, revisionId: input.document.revision.id, revisionNumber: input.document.revision.number }, material: { id: material.id, kind: material.kind, name: material.name, revisionId: revision.id, contentSha256: revision.content.sha256, mediaType: revision.content.mediaType, size, provenanceIds: revision.provenanceId ? [revision.provenanceId] : [] }, library: { itemId, version, kind, contentSha256: await computeLibraryContentHash(content), manifestSha256 }, license, quality: [{ gate: 'schema', status: 'passed', evidence: [input.document.revision.id] }, { gate: 'provenance', status: 'passed', evidence: revision.provenanceId ? [revision.provenanceId] : [revision.id] }] })
}
function libraryKind(material: Material): LibraryItemKind { if (material.id.startsWith('material:brand')) return 'brand-kit'; if (material.kind === 'design-system' || material.kind === 'design-markdown') return 'design-system-kit'; if (material.kind === 'code') return 'component-library-item'; return 'visual-asset' }
function projectLicense(document: DesignDocument): LibraryLicense { const values = document.sources.map(({ license }) => JSON.stringify(license)); if (!values.length || new Set(values).size !== 1) return { kind: 'unknown', rationale: values.length ? 'Project sources have mixed licenses.' : 'No source license evidence was recorded.' }; const license = document.sources[0]!.license; return license.kind === 'proprietary' ? { ...license, usage: 'Project-approved use only.' } : license.kind === 'public-domain' ? { kind: 'public-domain' } : license }
function safeId(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^[^a-z0-9]+/, '').slice(0, 160) || 'unknown' }
function safePath(value: string) { return `${safeId(value)}.bin` }
async function digest(value: string) { const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
