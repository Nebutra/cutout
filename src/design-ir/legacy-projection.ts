import type { Box } from '@/algorithm/types'
import { fingerprint } from './fingerprint'
import type { ContentReference, DesignDocument, Material } from './schema'
import { validateDesignDocument } from './validate'
import { err, isOk, ok, type Result } from '@/services/types'
import type { WorkspaceSnapshot } from '@/workspace/workspace-snapshot'
import type { LocalProjectRecord } from '@/services/local/project-repository.local'

const LEGACY_ACTOR_ID = 'cutout-legacy-workspace'

export interface LegacyProjectIdentity {
  readonly id: string
  readonly name: string
  readonly brief: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** Binary values remain in the legacy persistence store; Design IR carries refs. */
export interface LegacySliceArtifact {
  readonly id: string
  readonly index: number
  readonly name: string
  readonly box: Box
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly width: number
  readonly height: number
}

export interface LegacySourceArtifact {
  readonly id: string
  readonly kind: 'photo' | 'document'
  readonly role: 'reference' | 'implementation' | 'evidence'
  readonly title: string
  readonly bytes: Uint8Array
  readonly mediaType: string
}

export interface WorkspaceToDesignDocumentInput {
  readonly project: LegacyProjectIdentity
  readonly workspace: WorkspaceSnapshot | LegacyWorkspaceV1Input | null | undefined
  readonly slices?: readonly LegacySliceArtifact[]
  readonly sources?: readonly LegacySourceArtifact[]
  readonly designMarkdown?: { readonly name: string; readonly content: string } | null
}

/**
 * Shape accepted from IndexedDB records written before optional workspace.v1
 * preferences and durable runtime fields existed.
 */
export type LegacyWorkspaceV1Input =
  & Partial<WorkspaceSnapshot>
  & { readonly version: 'workspace.v1' }

export interface ContentResolver {
  readonly resolveContent: (reference: ContentReference) => Uint8Array | null | undefined
}

export interface DesignDocumentToWorkspaceProjection {
  readonly snapshot: WorkspaceSnapshot
  /** DESIGN.md can survive without a generated system-board image. */
  readonly designMarkdown: { readonly name: string; readonly content: string } | null
}

/**
 * Normalize old workspace.v1 payloads without changing their schema version or
 * manufacturing runtime activity. Calling this twice produces the same value.
 */
export function migrateWorkspaceV1(input: LegacyWorkspaceV1Input): WorkspaceSnapshot {
  const optional = {
    ...('composerModelPolicy' in input && input.composerModelPolicy !== undefined
      ? { composerModelPolicy: input.composerModelPolicy }
      : {}),
    ...('composerThinkingPolicy' in input && input.composerThinkingPolicy !== undefined
      ? { composerThinkingPolicy: input.composerThinkingPolicy }
      : {}),
    ...('outcome' in input && input.outcome !== undefined ? { outcome: input.outcome } : {}),
    ...('agentRunEvents' in input && input.agentRunEvents !== undefined
      ? { agentRunEvents: input.agentRunEvents }
      : {}),
    ...('designDocument' in input && input.designDocument !== undefined
      ? { designDocument: input.designDocument }
      : {}),
    ...('designOsAuthoring' in input && input.designOsAuthoring !== undefined ? { designOsAuthoring: input.designOsAuthoring } : {}),
    ...('creativeBoard' in input && input.creativeBoard !== undefined ? { creativeBoard: input.creativeBoard } : {}),
    ...('deliveryRequest' in input && input.deliveryRequest !== undefined ? { deliveryRequest: input.deliveryRequest } : {}),
    ...('deliveryPlan' in input && input.deliveryPlan !== undefined ? { deliveryPlan: input.deliveryPlan } : {}),
    ...('deliveryReceipt' in input && input.deliveryReceipt !== undefined ? { deliveryReceipt: input.deliveryReceipt } : {}),
  }

  return {
    version: 'workspace.v1',
    workflowPhase: input.workflowPhase ?? 'idle',
    prototypePlan: input.prototypePlan ?? null,
    prototypeScope: input.prototypeScope ?? 'primary-flow',
    humanLoopChoiceId: input.humanLoopChoiceId ?? null,
    humanLoopCustomAnswer: input.humanLoopCustomAnswer ?? '',
    prototypeDesignSystem: input.prototypeDesignSystem ?? null,
    prototypePages: input.prototypePages ?? [],
    selectedPrototypePageId: input.selectedPrototypePageId ?? null,
    runError: input.runError ?? null,
    namingStatus: input.namingStatus ?? 'idle',
    liveAgentOutput: input.liveAgentOutput ?? '',
    attachments: input.attachments ?? [],
    webSearchEnabled: input.webSearchEnabled ?? false,
    ...optional,
  }
}

/**
 * Project-record adapter for IndexedDB callers. It reads blobs into transient
 * byte arrays solely to hash them; the resulting Design IR never embeds those
 * bytes and remains portable to a content-addressed backend later.
 */
export async function projectRecordToDesignDocument(
  record: LocalProjectRecord,
): Promise<DesignDocument> {
  const [slices, source, mockup] = await Promise.all([
    Promise.all(record.slices.map(async (slice) => ({
      id: slice.id,
      index: slice.index,
      name: slice.name,
      box: slice.box,
      bytes: new Uint8Array(await slice.blob.arrayBuffer()),
      mediaType: slice.blob.type || 'application/octet-stream',
      width: slice.width,
      height: slice.height,
    }))),
    record.source
      ? record.source.blob.arrayBuffer().then((buffer): LegacySourceArtifact => ({
          id: 'project-source',
          kind: 'photo' as const,
          role: 'reference' as const,
          title: record.source!.name,
          bytes: new Uint8Array(buffer),
          mediaType: record.source!.blob.type || 'application/octet-stream',
        }))
      : Promise.resolve(null),
    record.mockup
      ? record.mockup.blob.arrayBuffer().then((buffer): LegacySourceArtifact => ({
          id: 'project-mockup',
          kind: 'photo' as const,
          role: 'evidence' as const,
          title: record.mockup!.name,
          bytes: new Uint8Array(buffer),
          mediaType: record.mockup!.blob.type || 'application/octet-stream',
        }))
      : Promise.resolve(null),
  ])
  return projectWorkspaceSnapshotToDesignDocument({
    project: {
      id: record.id,
      name: record.name,
      brief: record.brief,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    workspace: record.workspace,
    slices,
    sources: [source, mockup].filter((item): item is LegacySourceArtifact => item !== null),
    designMarkdown: record.designMarkdown,
  })
}

/**
 * Pure-in-effect legacy adapter: it reads caller-provided values only and emits
 * no binary payloads. All binary/text content is represented by a stable URI
 * and SHA-256 reference that the legacy store can resolve later.
 */
export async function projectWorkspaceSnapshotToDesignDocument(
  input: WorkspaceToDesignDocumentInput,
): Promise<DesignDocument> {
  const workspace = input.workspace
    ? migrateWorkspaceV1(input.workspace)
    : emptyWorkspace()
  const project = input.project
  const projectSourceId = `source:${project.id}`
  const provenanceId = `provenance:legacy:${project.id}`
  const projectUri = legacyUri(project.id, 'brief')
  const projectSource = {
    id: projectSourceId,
    kind: 'idea' as const,
    role: 'requirement' as const,
    title: project.brief.trim() || project.name,
    license: { kind: 'proprietary' as const, holder: 'Project owner' },
    content: [
      await contentReference(
        `content:${project.id}:brief`,
        projectUri,
        'text/plain',
        textBytes(project.brief),
      ),
    ],
  }
  const provenance = {
    id: provenanceId,
    operation: 'import' as const,
    sourceIds: [projectSourceId],
    actor: { kind: 'system' as const, id: LEGACY_ACTOR_ID },
    recordedAt: toIso(project.updatedAt),
    tool: 'workspace.v1-projection',
  }

  const attachmentSources = await Promise.all(
    workspace.attachments.map(async (attachment) => ({
      id: `source:attachment:${attachment.id}`,
      kind: 'photo' as const,
      role: 'reference' as const,
      title: attachment.name,
      license: { kind: 'proprietary' as const, holder: 'Project owner' },
      content: [
        await contentReference(
          `content:attachment:${attachment.id}`,
          legacyUri(project.id, `attachments/${attachment.id}`),
          attachment.mediaType,
          attachment.bytes,
        ),
      ],
    })),
  )
  const recordSources = await Promise.all(
    (input.sources ?? []).map(async (source) => ({
      id: `source:legacy:${source.id}`,
      kind: source.kind,
      role: source.role,
      title: source.title,
      license: { kind: 'proprietary' as const, holder: 'Project owner' },
      content: [
        await contentReference(
          `content:legacy:${source.id}`,
          legacyUri(project.id, `sources/${source.id}`),
          source.mediaType,
          source.bytes,
        ),
      ],
    })),
  )

  const materials = await legacyMaterials({
    projectId: project.id,
    workspace,
    slices: input.slices ?? [],
    designMarkdown: input.designMarkdown,
    provenanceId,
    createdAt: toIso(project.updatedAt),
  })
  const document: DesignDocument = {
    version: 'design-ir.v1',
    meta: {
      id: `design-document:${project.id}`,
      title: project.name,
      createdAt: toIso(project.createdAt),
      updatedAt: toIso(project.updatedAt),
    },
    revision: {
      id: `design-revision:${project.id}:1`,
      number: 1,
      createdAt: toIso(project.updatedAt),
      author: { kind: 'import', id: LEGACY_ACTOR_ID },
    },
    needs: project.brief.trim()
      ? [{
          id: `need:${project.id}:brief`,
          title: project.name,
          statement: project.brief.trim(),
          priority: 'high',
          status: 'accepted',
          acceptanceCriteria: [],
        }]
      : [],
    sources: [projectSource, ...attachmentSources, ...recordSources],
    prototype: workspace.prototypePlan
      ? {
          id: `prototype:${project.id}`,
          plan: workspace.prototypePlan,
          provenanceId,
        }
      : undefined,
    materials,
    provenance: [provenance],
    brands: [],
    tokens: [],
    components: [],
    relations: [],
  }
  const validation = validateDesignDocument(document)
  if (!isOk(validation)) throw new Error(`Legacy Design IR projection failed: ${validation.error}`)
  return validation.data.document
}

/**
 * Rebuild the safely representable workspace fields. The caller owns content
 * resolution, keeping this adapter deterministic and free of storage I/O.
 */
export async function designDocumentToWorkspaceSnapshot(
  document: DesignDocument,
  resolver: ContentResolver,
): Promise<Result<DesignDocumentToWorkspaceProjection>> {
  const validation = validateDesignDocument(document)
  if (!isOk(validation)) return err(validation.error)
  const valid = validation.data.document
  const designSystem = valid.materials.find((material) => material.id === 'material:design-system')
  const designMarkdown = valid.materials.find((material) => material.id === 'material:design-markdown')
  const pages = valid.materials.filter((material) => material.id.startsWith('material:prototype-page:'))

  const markdownContent = designMarkdown
    ? await resolveText(designMarkdown, resolver)
    : null
  if (designMarkdown && markdownContent === null) {
    return err(`Missing or invalid content for material "${designMarkdown.id}".`)
  }
  const designImage = designSystem
    ? await resolveBytes(designSystem, resolver)
    : null
  if (designSystem && !designImage) {
    return err(`Missing or invalid content for material "${designSystem.id}".`)
  }

  const pageArtifacts = []
  for (const material of pages) {
    const pageId = material.id.slice('material:prototype-page:'.length)
    const page = valid.prototype?.plan.pages.find((item) => item.id === pageId)
    if (!page) return err(`Material "${material.id}" has no matching prototype page.`)
    const bytes = await resolveBytes(material, resolver)
    if (!bytes) return err(`Missing or invalid content for material "${material.id}".`)
    pageArtifacts.push({
      page,
      bytes,
      mediaType: currentContent(material).mediaType ?? 'application/octet-stream',
      width: page.viewport.width,
      height: page.viewport.height,
    })
  }

  const attachments = []
  for (const source of valid.sources.filter((item) => item.id.startsWith('source:attachment:'))) {
    const reference = source.content[0]
    if (!reference) return err(`Attachment source "${source.id}" has no content.`)
    const bytes = await resolveReference(reference, resolver)
    if (!bytes) return err(`Missing or invalid content for source "${source.id}".`)
    attachments.push({
      id: source.id.slice('source:attachment:'.length),
      name: source.title,
      bytes,
      mediaType: reference.mediaType ?? 'application/octet-stream',
    })
  }

  const snapshot: WorkspaceSnapshot = {
    ...emptyWorkspace(),
    prototypePlan: valid.prototype?.plan ?? null,
    prototypeDesignSystem: designSystem && designImage
      ? {
          name: designSystem.name,
          designMarkdown: markdownContent ?? '',
          bytes: designImage,
          mediaType: currentContent(designSystem).mediaType ?? 'application/octet-stream',
          width: 0,
          height: 0,
        }
      : null,
    prototypePages: pageArtifacts,
    attachments,
  }
  return ok({
    snapshot,
    designMarkdown: markdownContent === null || !designMarkdown
      ? null
      : { name: designMarkdown.name, content: markdownContent },
  })
}

function emptyWorkspace(): WorkspaceSnapshot {
  return {
    version: 'workspace.v1',
    workflowPhase: 'idle',
    prototypePlan: null,
    prototypeScope: 'primary-flow',
    humanLoopChoiceId: null,
    humanLoopCustomAnswer: '',
    prototypeDesignSystem: null,
    prototypePages: [],
    selectedPrototypePageId: null,
    runError: null,
    namingStatus: 'idle',
    liveAgentOutput: '',
    attachments: [],
    webSearchEnabled: false,
  }
}

async function legacyMaterials(input: {
  readonly projectId: string
  readonly workspace: WorkspaceSnapshot
  readonly slices: readonly LegacySliceArtifact[]
  readonly designMarkdown?: { readonly name: string; readonly content: string } | null
  readonly provenanceId: string
  readonly createdAt: string
}): Promise<Material[]> {
  const materials: Material[] = []
  const system = input.workspace.prototypeDesignSystem
  if (system) {
    materials.push(await material({
      id: 'material:design-system',
      kind: 'design-system',
      name: system.name,
      referenceId: 'content:design-system:image',
      uri: legacyUri(input.projectId, 'workspace/design-system/image'),
      mediaType: system.mediaType,
      bytes: system.bytes,
      provenanceId: input.provenanceId,
      createdAt: input.createdAt,
    }))
  }
  const designMarkdown = input.designMarkdown ?? (system
    ? { name: 'DESIGN.md', content: system.designMarkdown }
    : null)
  if (designMarkdown) {
    materials.push(await material({
      id: 'material:design-markdown',
      kind: 'design-markdown',
      name: designMarkdown.name,
      referenceId: 'content:design-markdown',
      uri: legacyUri(input.projectId, 'workspace/DESIGN.md'),
      mediaType: 'text/markdown',
      bytes: textBytes(designMarkdown.content),
      provenanceId: input.provenanceId,
      createdAt: input.createdAt,
    }))
  }
  for (const artifact of input.workspace.prototypePages) {
    materials.push(await material({
      id: `material:prototype-page:${artifact.page.id}`,
      kind: 'prototype-page',
      name: artifact.page.name,
      referenceId: `content:prototype-page:${artifact.page.id}`,
      uri: legacyUri(input.projectId, `workspace/pages/${artifact.page.id}`),
      mediaType: artifact.mediaType,
      bytes: artifact.bytes,
      provenanceId: input.provenanceId,
      createdAt: input.createdAt,
    }))
  }
  for (const slice of input.slices) {
    materials.push(await material({
      id: `material:cutout-slice:${slice.id}`,
      kind: 'cutout-slice',
      name: slice.name,
      referenceId: `content:cutout-slice:${slice.id}`,
      uri: legacyUri(input.projectId, `slices/${slice.id}`),
      mediaType: slice.mediaType,
      bytes: slice.bytes,
      provenanceId: input.provenanceId,
      createdAt: input.createdAt,
    }))
  }
  return materials
}

async function material(input: {
  readonly id: string
  readonly kind: Material['kind']
  readonly name: string
  readonly referenceId: string
  readonly uri: string
  readonly mediaType: string
  readonly bytes: Uint8Array
  readonly provenanceId: string
  readonly createdAt: string
}): Promise<Material> {
  const content = await contentReference(
    input.referenceId,
    input.uri,
    input.mediaType,
    input.bytes,
  )
  const revisionId = `${input.id}:revision:${content.sha256}`
  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    revisions: [{
      id: revisionId,
      ordinal: 1,
      createdAt: input.createdAt,
      content,
      provenanceId: input.provenanceId,
    }],
    currentRevisionId: revisionId,
  }
}

async function contentReference(
  id: string,
  uri: string,
  mediaType: string,
  bytes: Uint8Array,
): Promise<ContentReference> {
  return { id, uri, mediaType, sha256: await sha256(bytes) }
}

function currentContent(material: Material): ContentReference {
  const revision = material.revisions.find((item) => item.id === material.currentRevisionId)
  if (!revision) throw new Error(`Material "${material.id}" has no current revision.`)
  return revision.content
}

async function resolveBytes(
  material: Material,
  resolver: ContentResolver,
): Promise<Uint8Array | null> {
  return resolveReference(currentContent(material), resolver)
}

async function resolveText(material: Material, resolver: ContentResolver): Promise<string | null> {
  const bytes = await resolveBytes(material, resolver)
  return bytes ? new TextDecoder().decode(bytes) : null
}

async function resolveReference(
  reference: ContentReference,
  resolver: ContentResolver,
): Promise<Uint8Array | null> {
  const bytes = resolver.resolveContent(reference)
  if (!bytes) return null
  if (reference.sha256 && await sha256(bytes) !== reference.sha256) return null
  return bytes
}

function legacyUri(projectId: string, path: string): string {
  return `cutout://legacy/${encodeURIComponent(projectId)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

async function sha256(bytes: Uint8Array): Promise<string> {
  // Hashing an array through the shared canonical hasher avoids platform-specific
  // Buffer behavior while still producing a real SHA-256 digest.
  return fingerprint([...bytes])
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
