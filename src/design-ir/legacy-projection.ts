import type { Box } from '@/algorithm/types'
import type {
  ContentReference,
  DesignDocument,
  Material,
  MaterialProductionEvidence,
} from './schema'
import { validateDesignDocument } from './validate'
import { err, isOk, ok, type Result } from '@/services/types'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeSuiteCandidate,
  PersistedPrototypeSuiteCandidateSet,
  WorkspaceSnapshot,
} from '@/workspace/workspace-snapshot'
import type { LocalProjectRecord } from '@/services/local/project-repository.local'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import { parseEditableDesignMarkdown } from '@/prototype/design-md'
import { projectDesignMarkdownTokens } from '@/prototype/design-md-export'
import { migratePersistedPrototypeDesignSystemCandidateSet } from '@/prototype/design-system-candidate-persistence'
import { validatePrototypeSuiteCandidateSet } from '@/prototype/prototype-suite-candidates'
import { codingReceiptSchema, type CodingReceipt } from '@/coding-runtime/contracts'
import { prototypePlanSchema } from '@/prototype/prototype-plan'
import {
  prototypePageReviewRecordSchema,
  prototypeResourceReviewRecordSchema,
} from '@/prototype/review-evidence'
import { z } from 'zod'

const LEGACY_ACTOR_ID = 'cutout-legacy-workspace'
const PROTOTYPE_SUITE_MATERIAL_VERSION = 'cutout.prototype-suite-material.v1' as const
const RESOURCE_PACK_MATERIAL_VERSION = 'cutout.resource-pack-material.v1' as const
const RESOURCE_ASSET_MATERIAL_VERSION = 'cutout.resource-asset-material.v1' as const

const prototypeSuiteMaterialSchema = z.object({
  version: z.literal(PROTOTYPE_SUITE_MATERIAL_VERSION),
  candidateId: z.string().min(1),
  designSystem: z.object({
    candidateSetId: z.string().min(1),
    candidateId: z.string().min(1),
    directionId: z.string().min(1),
    baseRevisionId: z.string().min(1),
    provenanceIds: z.array(z.string().min(1)).min(1),
    visualMaterialId: z.string().min(1),
    markdownMaterialId: z.string().min(1),
  }).strict(),
  plan: prototypePlanSchema,
  pages: z.array(z.object({
    pageId: z.string().min(1),
    materialId: z.string().min(1),
    review: prototypePageReviewRecordSchema.optional(),
  }).strict()),
  resourcePackMaterialId: z.string().min(1),
  provenanceIds: z.array(z.string().min(1)).min(1),
  codingReceiptMaterialId: z.string().min(1).optional(),
}).strict()

const resourcePackMaterialSchema = z.object({
  version: z.literal(RESOURCE_PACK_MATERIAL_VERSION),
  id: z.string().min(1),
  manifest: z.unknown(),
  manifestProvenanceId: z.string().min(1),
  assets: z.array(z.object({
    manifestItemId: z.string().min(1),
    materialId: z.string().min(1),
  }).strict()),
}).strict()

const resourceAssetMaterialSchema = z.object({
  version: z.literal(RESOURCE_ASSET_MATERIAL_VERSION),
  manifestItemId: z.string().min(1),
  artifactId: z.string().min(1),
  provenanceIds: z.array(z.string().min(1)).min(1),
  review: prototypeResourceReviewRecordSchema.optional(),
}).strict()

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
  readonly production?: {
    readonly provenanceId: string
    readonly evidence: MaterialProductionEvidence
  }
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
  const prototypeDesignSystem = input.prototypeDesignSystem
    ? normalizeDesignSystemBytes(input.prototypeDesignSystem)
    : null
  const prototypeDesignSystemCandidates = input.prototypeDesignSystemCandidates
    ? migratePersistedPrototypeDesignSystemCandidateSet({
        ...input.prototypeDesignSystemCandidates,
        artifacts: Object.fromEntries(
          Object.entries(input.prototypeDesignSystemCandidates.artifacts).map(([id, artifact]) => [
            id,
            normalizeDesignSystemBytes(artifact),
          ]),
        ),
      })
    : null
  const prototypeSuiteCandidates = input.prototypeSuiteCandidates
    ? {
        ...input.prototypeSuiteCandidates,
        artifacts: Object.fromEntries(
          Object.entries(input.prototypeSuiteCandidates.artifacts).map(([id, artifact]) => [id, {
            ...artifact,
            designSystem: {
              ...artifact.designSystem,
              artifact: normalizeDesignSystemBytes(artifact.designSystem.artifact),
            },
            pages: artifact.pages.map(normalizePrototypePageBytes),
          }]),
        ),
      }
    : null
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
    ...('codingReceipts' in input && input.codingReceipts !== undefined
      ? { codingReceipts: input.codingReceipts }
      : {}),
  }

  return {
    version: 'workspace.v1',
    workflowPhase: input.workflowPhase ?? 'idle',
    prototypePlan: input.prototypePlan ?? null,
    prototypeScope: input.prototypeScope ?? 'primary-flow',
    humanLoopChoiceId: input.humanLoopChoiceId ?? null,
    humanLoopCustomAnswer: input.humanLoopCustomAnswer ?? '',
    prototypeDesignSystem,
    prototypeDesignSystemCandidates,
    prototypeSuiteCandidates,
    prototypePages: (input.prototypePages ?? []).map(normalizePrototypePageBytes),
    selectedPrototypePageId: input.selectedPrototypePageId ?? null,
    runError: input.runError ?? null,
    namingStatus: input.namingStatus ?? 'idle',
    liveAgentOutput: input.liveAgentOutput ?? '',
    attachments: (input.attachments ?? []).map((attachment) => ({
      ...attachment,
      bytes: localBytes(attachment.bytes),
    })),
    webSearchEnabled: input.webSearchEnabled ?? false,
    ...optional,
  }
}

/** Rebuilds content bytes for structured suite/Coding references stored inside workspace.v1. */
export function legacyWorkspaceSupplementalContent(
  projectId: string,
  input: WorkspaceSnapshot | LegacyWorkspaceV1Input,
): ReadonlyMap<string, Uint8Array> {
  const workspace = migrateWorkspaceV1(input)
  const designCandidates = workspace.prototypeDesignSystemCandidates
  const suiteState = validatedPrototypeSuiteState(
    workspace.prototypeSuiteCandidates,
    designCandidates,
  )
  const codingReceipts = validatedCodingReceipts(workspace.codingReceipts, suiteState)
  const content = new Map<string, Uint8Array>()
  const add = (path: string, bytes: Uint8Array) => {
    content.set(legacyUri(projectId, path), bytes)
  }
  for (const page of workspace.prototypePages) {
    if (page.review) add(pageReviewLegacyPath(page.page.id), jsonBytes(page.review))
  }
  for (const candidate of suiteState?.set.candidates ?? []) {
    const artifact = suiteState?.artifacts[candidate.id]
    if (!artifact || candidate.status !== 'ready') continue
    const resourcePackMaterialId = candidate.outputs.find(
      (output) => output.role === 'resource-pack',
    )?.materialId
    const designCandidate = designCandidates?.set.candidates.find(
      (item) => item.id === artifact.designSystem.candidateId,
    )
    const visualMaterialId = designCandidate?.outputs.find(
      (output) => output.role === 'design-system',
    )?.materialId
    const markdownMaterialId = designCandidate?.outputs.find(
      (output) => output.role === 'design-markdown',
    )?.materialId
    if (!resourcePackMaterialId || !visualMaterialId || !markdownMaterialId) {
      throw new Error(`Prototype suite candidate "${candidate.id}" has incomplete material outputs.`)
    }
    const projection = prototypeSuiteContentProjection({
      candidateId: candidate.id,
      artifact,
      resourcePackMaterialId,
      visualMaterialId,
      markdownMaterialId,
    })
    artifact.pages.forEach((page, index) => {
      add(suiteLegacyPath(candidate.id, `pages/${index + 1}`), page.bytes)
    })
    projection.assets.forEach((asset, index) => {
      add(
        suiteLegacyPath(candidate.id, `resource-pack/assets/${index + 1}.json`),
        jsonBytes(asset),
      )
    })
    add(
      suiteLegacyPath(candidate.id, 'resource-pack/manifest.json'),
      jsonBytes(projection.resourcePack),
    )
    add(
      suiteLegacyPath(candidate.id, 'suite.json'),
      jsonBytes(projection.suite),
    )
  }
  for (const receipt of codingReceipts) {
    add(codingReceiptLegacyPath(receipt.receiptId), jsonBytes(receipt))
  }
  return content
}

function normalizeDesignSystemBytes(
  artifact: PersistedPrototypeDesignSystem,
): PersistedPrototypeDesignSystem {
  const bytes = localBytes(artifact.bytes)
  return bytes === artifact.bytes ? artifact : { ...artifact, bytes }
}

function normalizePrototypePageBytes(
  artifact: WorkspaceSnapshot['prototypePages'][number],
): WorkspaceSnapshot['prototypePages'][number] {
  const bytes = localBytes(artifact.bytes)
  return bytes === artifact.bytes ? artifact : { ...artifact, bytes }
}

function localBytes(bytes: Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
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
      production: productionEvidenceForSlice(record, slice),
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

function productionEvidenceForSlice(
  record: LocalProjectRecord,
  slice: LocalProjectRecord['slices'][number],
): LegacySliceArtifact['production'] {
  const snapshot = record.assetProduction
  if (!snapshot) return undefined
  const runs = Object.values(snapshot.runs).sort(
    (left, right) => right.startedAt - left.startedAt || right.runId.localeCompare(left.runId),
  )
  for (const run of runs) {
    if (slice.productionRunId && run.runId !== slice.productionRunId) continue
    const plan = snapshot.plans[run.planId]
    if (!plan) continue
    const task = plan.tasks.find((candidate) => {
      if (slice.productionTaskId) return candidate.taskId === slice.productionTaskId
      const manifestItemId = slice.assetManifestItemId ?? `legacy:${slice.id}`
      return candidate.manifestItemId === manifestItemId
    })
    if (!task) continue
    const state = run.tasks[task.taskId]
    const artifact = state?.output ?? state?.candidate
    if (!state || !artifact) continue
    if (slice.outputArtifactId && artifact.artifactId !== slice.outputArtifactId) continue
    const pageArtifact = plan.sourceRevision.pageArtifacts.find(
      (candidate) => candidate.pageId === task.pageId,
    )
    return {
      provenanceId: `provenance:asset-task:${task.taskId}:${artifact.sha256.slice(0, 12)}`,
      evidence: {
        planId: plan.planId,
        runId: run.runId,
        taskId: task.taskId,
        manifestItemId: task.manifestItemId,
        pageId: task.pageId,
        regionId: task.regionId,
        artifactId: artifact.artifactId,
        artifactSha256: artifact.sha256,
        readiness: slice.readiness ?? state.status,
        included: slice.included ?? true,
        bounds: slice.box,
        sourceRevision: {
          projectRevisionId: plan.sourceRevision.projectRevisionId,
          designSystemArtifactId: plan.sourceRevision.designSystemArtifactId,
          pageArtifactId: pageArtifact?.artifactId,
          pageArtifactSha256: pageArtifact?.sha256,
        },
        cutoutParams: state.evidence?.cutoutParams,
        boardDiagnostics: state.evidence?.boardDiagnostics,
        qaVerdict: state.evidence?.qaVerdict,
        maskArtifactId: state.evidence?.maskArtifactId,
        providerRoute: state.evidence?.providerRoute,
        lineage: state.evidence?.lineage,
        issues: state.issues,
        decision: state.decision
          ? {
              receiptId: state.decision.receiptId,
              decision: state.decision.decision,
              issueCodes: state.decision.issueCodes,
              actor: state.decision.actor,
              decidedAt: state.decision.decidedAt,
            }
          : undefined,
      },
    }
  }
  return undefined
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

  const candidateState = workspace.prototypeDesignSystemCandidates
  const suiteState = validatedPrototypeSuiteState(
    workspace.prototypeSuiteCandidates,
    candidateState,
  )
  const codingReceipts = validatedCodingReceipts(workspace.codingReceipts, suiteState)
  const materials = await legacyMaterials({
    projectId: project.id,
    workspace,
    suiteState,
    codingReceipts,
    slices: input.slices ?? [],
    designMarkdown: input.designMarkdown,
    provenanceId,
    createdAt: toIso(project.updatedAt),
  })
  const productionProvenance = [...new Map(
    (input.slices ?? [])
      .filter((slice) => slice.production)
      .map((slice) => [slice.production!.provenanceId, {
        id: slice.production!.provenanceId,
        operation: 'derive' as const,
        sourceIds: [projectSourceId],
        actor: { kind: 'system' as const, id: 'asset-production-runtime' },
        recordedAt: toIso(project.updatedAt),
        tool: `asset-production.v1:${slice.production!.evidence.runId}:${slice.production!.evidence.taskId}`,
      }]),
  ).values()]
  const candidateProvenance = candidateState
    ? candidateState.set.candidates.flatMap((candidate) => candidate.provenanceIds.map((id) => ({
        id,
        operation: 'derive' as const,
        sourceIds: [projectSourceId],
        actor: { kind: 'agent' as const, id: 'cutout.prototype-orchestrator' },
        recordedAt: toIso(project.updatedAt),
        tool: 'cutout.design-system-candidates.v1',
      })))
    : []
  const selectionProvenance = candidateState?.set.selection
    ? [{
        id: candidateState.set.selection.provenanceId,
        operation: candidateState.set.selection.actor.kind === 'human' ? 'manual' as const : 'derive' as const,
        sourceIds: [projectSourceId],
        actor: candidateState.set.selection.actor,
        recordedAt: candidateState.set.selection.selectedAt,
        tool: 'cutout.candidate-selection.v1',
      }]
    : []
  const suiteProvenance = suiteState
    ? suiteState.set.candidates.flatMap((candidate) => {
        const artifact = suiteState.artifacts[candidate.id]
        if (!artifact) return []
        return [
          ...artifact.provenanceIds.map((id) => derivationProvenance(
            id,
            projectSourceId,
            project.updatedAt,
            'cutout.prototype-suite-candidates.v1',
            'cutout.prototype-orchestrator',
          )),
          derivationProvenance(
            artifact.resourcePack.manifestProvenanceId,
            projectSourceId,
            project.updatedAt,
            'cutout.resource-pack.v1',
            'asset-production-runtime',
          ),
          ...artifact.resourcePack.assets.flatMap((asset) => asset.provenanceIds.map((id) =>
            derivationProvenance(
              id,
              projectSourceId,
              project.updatedAt,
              'cutout.resource-asset-binding.v1',
              'asset-production-runtime',
            ),
          )),
        ]
      })
    : []
  const suiteSelectionProvenance = suiteState?.set.selection
    ? [{
        id: suiteState.set.selection.provenanceId,
        operation: suiteState.set.selection.actor.kind === 'human' ? 'manual' as const : 'derive' as const,
        sourceIds: [projectSourceId],
        actor: suiteState.set.selection.actor,
        recordedAt: suiteState.set.selection.selectedAt,
        tool: 'cutout.candidate-selection.v1',
      }]
    : []
  const codingProvenance = codingReceipts.map((receipt) => ({
    id: codingReceiptProvenanceId(receipt.receiptId),
    operation: 'generate' as const,
    sourceIds: [projectSourceId],
    actor: { kind: 'agent' as const, id: receipt.provenance.backend },
    recordedAt: toIso(receipt.completedAt),
    tool: `cutout.controlled-coding.v1:${receipt.taskId}`,
  }))
  const projectedTokens = selectedCandidateTokens(candidateState)
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
    candidateSets: [candidateState?.set, suiteState?.set].filter(
      (set): set is NonNullable<typeof set> => Boolean(set),
    ),
    provenance: uniqueById([
      provenance,
      ...productionProvenance,
      ...candidateProvenance,
      ...selectionProvenance,
      ...suiteProvenance,
      ...suiteSelectionProvenance,
      ...codingProvenance,
    ]),
    brands: [],
    tokens: projectedTokens,
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
  const designImageSize = designSystem && designImage
    ? currentContent(designSystem).pixelSize ?? readRasterDimensions(designImage)
    : null
  if (designSystem && designImage && !designImageSize) {
    return err(`Missing intrinsic dimensions for material "${designSystem.id}".`)
  }

  const pageArtifacts = []
  for (const material of pages) {
    const pageId = material.id.slice('material:prototype-page:'.length)
    const page = valid.prototype?.plan.pages.find((item) => item.id === pageId)
    if (!page) return err(`Material "${material.id}" has no matching prototype page.`)
    const bytes = await resolveBytes(material, resolver)
    if (!bytes) return err(`Missing or invalid content for material "${material.id}".`)
    const reviewMaterial = valid.materials.find(
      (candidate) => candidate.id === pageReviewMaterialId(pageId),
    )
    const reviewContent = reviewMaterial
      ? await resolveJson(reviewMaterial, resolver)
      : null
    if (reviewContent && !reviewContent.ok) return reviewContent
    const review = reviewContent
      ? prototypePageReviewRecordSchema.safeParse(reviewContent.data)
      : null
    if (review && !review.success) {
      return err(`Invalid page review material "${reviewMaterial!.id}".`)
    }
    if (review?.success && review.data.artifactSha256 !== await sha256(bytes)) {
      return err(`Stale page review material "${reviewMaterial!.id}".`)
    }
    pageArtifacts.push({
      page,
      bytes,
      mediaType: currentContent(material).mediaType ?? 'application/octet-stream',
      width: page.viewport.width,
      height: page.viewport.height,
      ...(review?.success ? { review: review.data } : {}),
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

  const candidateSet = valid.candidateSets.find((candidate) => candidate.kind === 'design-system')
  const candidateArtifacts: Record<string, PersistedPrototypeDesignSystem> = {}
  if (candidateSet) {
    for (const candidate of candidateSet.candidates) {
      if (candidate.status !== 'ready') continue
      const visualId = candidate.outputs.find((output) => output.role === 'design-system')?.materialId
      const markdownId = candidate.outputs.find((output) => output.role === 'design-markdown')?.materialId
      const visual = visualId ? valid.materials.find((material) => material.id === visualId) : null
      const markdown = markdownId ? valid.materials.find((material) => material.id === markdownId) : null
      if (!visual || !markdown) continue
      const [bytes, content] = await Promise.all([
        resolveBytes(visual, resolver),
        resolveText(markdown, resolver),
      ])
      if (!bytes || content === null) continue
      const size = currentContent(visual).pixelSize ?? readRasterDimensions(bytes)
      if (!size) continue
      candidateArtifacts[candidate.id] = {
        name: visual.name,
        designMarkdown: content,
        bytes,
        mediaType: currentContent(visual).mediaType ?? 'application/octet-stream',
        width: size.width,
        height: size.height,
      }
    }
  }
  const persistedCandidateState = candidateSet
    ? migratePersistedPrototypeDesignSystemCandidateSet({
        set: candidateSet,
        artifacts: candidateArtifacts,
      })
    : null
  const codingReceipts = await recoverCodingReceipts(valid.materials, resolver)
  if (!codingReceipts.ok) return codingReceipts
  const suiteCandidateSet = valid.candidateSets.find(
    (candidate) => candidate.kind === 'prototype-suite',
  )
  const suiteState = suiteCandidateSet
    ? await recoverPrototypeSuiteState({
        candidateSet: suiteCandidateSet,
        designSystemCandidates: persistedCandidateState,
        materials: valid.materials,
        codingReceipts: codingReceipts.data,
        resolver,
      })
    : ok(null)
  if (!suiteState.ok) return suiteState

  const snapshot: WorkspaceSnapshot = {
    ...emptyWorkspace(),
    prototypePlan: valid.prototype?.plan ?? null,
    prototypeDesignSystem: designSystem && designImage
      ? {
          name: designSystem.name,
          designMarkdown: markdownContent ?? '',
          bytes: designImage,
          mediaType: currentContent(designSystem).mediaType ?? 'application/octet-stream',
          width: designImageSize?.width ?? 1,
          height: designImageSize?.height ?? 1,
        }
      : null,
    prototypeDesignSystemCandidates: persistedCandidateState,
    prototypeSuiteCandidates: suiteState.data,
    prototypePages: pageArtifacts,
    attachments,
    ...(codingReceipts.data.length > 0 ? { codingReceipts: codingReceipts.data } : {}),
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
    prototypeDesignSystemCandidates: null,
    prototypeSuiteCandidates: null,
    prototypePages: [],
    selectedPrototypePageId: null,
    runError: null,
    namingStatus: 'idle',
    liveAgentOutput: '',
    attachments: [],
    webSearchEnabled: false,
  }
}

async function recoverCodingReceipts(
  materials: readonly Material[],
  resolver: ContentResolver,
): Promise<Result<readonly CodingReceipt[]>> {
  const receipts: CodingReceipt[] = []
  const ids = new Set<string>()
  for (const material of materials.filter((item) =>
    item.id.startsWith('material:coding-receipt:'),
  )) {
    const content = await resolveJson(material, resolver)
    if (!content.ok) return err(content.error)
    const parsed = codingReceiptSchema.safeParse(content.data)
    if (!parsed.success) {
      return err(
        `Invalid Coding receipt material "${material.id}": ${parsed.error.issues[0]?.message ?? 'Invalid receipt.'}`,
      )
    }
    if (codingReceiptMaterialId(parsed.data.receiptId) !== material.id) {
      return err(`Coding receipt material "${material.id}" does not match its receipt id.`)
    }
    if (ids.has(parsed.data.receiptId)) {
      return err(`Duplicate Coding receipt id "${parsed.data.receiptId}".`)
    }
    ids.add(parsed.data.receiptId)
    receipts.push(parsed.data)
  }
  return ok(receipts)
}

async function recoverPrototypeSuiteState(input: {
  readonly candidateSet: NonNullable<DesignDocument['candidateSets']>[number]
  readonly designSystemCandidates: WorkspaceSnapshot['prototypeDesignSystemCandidates']
  readonly materials: readonly Material[]
  readonly codingReceipts: readonly CodingReceipt[]
  readonly resolver: ContentResolver
}): Promise<Result<PersistedPrototypeSuiteCandidateSet | null>> {
  if (!input.designSystemCandidates) {
    return err('Prototype suite candidates require their Design System candidate set.')
  }
  const materials = new Map(input.materials.map((material) => [material.id, material]))
  const artifacts: Record<string, PersistedPrototypeSuiteCandidate> = {}
  for (const candidate of input.candidateSet.candidates) {
    if (candidate.status !== 'ready') continue
    const suiteMaterialId = candidate.outputs.find(
      (output) => output.role === 'prototype-suite',
    )?.materialId
    const resourcePackMaterialId = candidate.outputs.find(
      (output) => output.role === 'resource-pack',
    )?.materialId
    if (!suiteMaterialId || !resourcePackMaterialId) {
      return err(`Ready prototype suite candidate "${candidate.id}" has incomplete outputs.`)
    }
    const suiteMaterial = materials.get(suiteMaterialId)
    if (!suiteMaterial) {
      return err(`Missing prototype suite material "${suiteMaterialId}".`)
    }
    const suiteContent = await resolveJson(suiteMaterial, input.resolver)
    if (!suiteContent.ok) return suiteContent
    const descriptor = prototypeSuiteMaterialSchema.safeParse(suiteContent.data)
    if (!descriptor.success) {
      return err(
        `Invalid prototype suite material "${suiteMaterialId}": ${descriptor.error.issues[0]?.message ?? 'Invalid descriptor.'}`,
      )
    }
    if (
      descriptor.data.candidateId !== candidate.id
      || descriptor.data.resourcePackMaterialId !== resourcePackMaterialId
    ) {
      return err(`Prototype suite material "${suiteMaterialId}" does not match its candidate outputs.`)
    }
    const boundDesignCandidate = input.designSystemCandidates.set.candidates.find(
      (item) => item.id === descriptor.data.designSystem.candidateId,
    )
    const expectedVisualId = boundDesignCandidate?.outputs.find(
      (output) => output.role === 'design-system',
    )?.materialId
    const expectedMarkdownId = boundDesignCandidate?.outputs.find(
      (output) => output.role === 'design-markdown',
    )?.materialId
    if (
      !boundDesignCandidate
      || descriptor.data.designSystem.visualMaterialId !== expectedVisualId
      || descriptor.data.designSystem.markdownMaterialId !== expectedMarkdownId
    ) {
      return err(`Prototype suite candidate "${candidate.id}" has mismatched Design System outputs.`)
    }

    const designVisual = materials.get(descriptor.data.designSystem.visualMaterialId)
    const designMarkdown = materials.get(descriptor.data.designSystem.markdownMaterialId)
    if (!designVisual || !designMarkdown) {
      return err(`Prototype suite candidate "${candidate.id}" is missing Design System materials.`)
    }
    const [designBytes, markdown] = await Promise.all([
      resolveBytes(designVisual, input.resolver),
      resolveText(designMarkdown, input.resolver),
    ])
    if (!designBytes || markdown === null) {
      return err(`Prototype suite candidate "${candidate.id}" has invalid Design System content.`)
    }
    const designSize = currentContent(designVisual).pixelSize ?? readRasterDimensions(designBytes)
    if (!designSize) {
      return err(`Prototype suite candidate "${candidate.id}" has no Design System dimensions.`)
    }

    const pages = []
    for (const pageReference of descriptor.data.pages) {
      const page = descriptor.data.plan.pages.find((item) => item.id === pageReference.pageId)
      const pageMaterial = materials.get(pageReference.materialId)
      if (!page || !pageMaterial) {
        return err(
          `Prototype suite candidate "${candidate.id}" is missing page material "${pageReference.materialId}".`,
        )
      }
      const bytes = await resolveBytes(pageMaterial, input.resolver)
      if (!bytes) {
        return err(`Missing or invalid content for material "${pageReference.materialId}".`)
      }
      const size = currentContent(pageMaterial).pixelSize ?? readRasterDimensions(bytes)
      if (!size) {
        return err(`Missing intrinsic dimensions for material "${pageReference.materialId}".`)
      }
      pages.push({
        page,
        bytes,
        mediaType: currentContent(pageMaterial).mediaType ?? 'application/octet-stream',
        width: size.width,
        height: size.height,
        ...(pageReference.review ? { review: pageReference.review } : {}),
      })
      if (pageReference.review && pageReference.review.artifactSha256 !== await sha256(bytes)) {
        return err(`Prototype suite page review for "${pageReference.pageId}" is stale.`)
      }
    }

    const resourceMaterial = materials.get(resourcePackMaterialId)
    if (!resourceMaterial) return err(`Missing resource pack material "${resourcePackMaterialId}".`)
    const resourceContent = await resolveJson(resourceMaterial, input.resolver)
    if (!resourceContent.ok) return resourceContent
    const resourceDescriptor = resourcePackMaterialSchema.safeParse(resourceContent.data)
    if (!resourceDescriptor.success) {
      return err(
        `Invalid resource pack material "${resourcePackMaterialId}": ${resourceDescriptor.error.issues[0]?.message ?? 'Invalid descriptor.'}`,
      )
    }
    const resourceAssets = []
    for (const assetReference of resourceDescriptor.data.assets) {
      const assetMaterial = materials.get(assetReference.materialId)
      if (!assetMaterial) return err(`Missing resource asset material "${assetReference.materialId}".`)
      const assetContent = await resolveJson(assetMaterial, input.resolver)
      if (!assetContent.ok) return assetContent
      const asset = resourceAssetMaterialSchema.safeParse(assetContent.data)
      if (!asset.success) {
        return err(
          `Invalid resource asset material "${assetReference.materialId}": ${asset.error.issues[0]?.message ?? 'Invalid binding.'}`,
        )
      }
      if (asset.data.manifestItemId !== assetReference.manifestItemId) {
        return err(`Resource asset material "${assetReference.materialId}" does not match its manifest item.`)
      }
      resourceAssets.push({
        manifestItemId: asset.data.manifestItemId,
        artifactId: asset.data.artifactId,
        provenanceIds: asset.data.provenanceIds,
        ...(asset.data.review ? { review: asset.data.review } : {}),
      })
      if (asset.data.review && asset.data.review.artifactId !== asset.data.artifactId) {
        return err(`Resource asset review for "${asset.data.manifestItemId}" is stale.`)
      }
    }

    const codingReceipt = descriptor.data.codingReceiptMaterialId
      ? input.codingReceipts.find(
          (receipt) => codingReceiptMaterialId(receipt.receiptId) === descriptor.data.codingReceiptMaterialId,
        )
      : undefined
    if (descriptor.data.codingReceiptMaterialId && !codingReceipt) {
      return err(
        `Prototype suite candidate "${candidate.id}" is missing Coding receipt material `
        + `"${descriptor.data.codingReceiptMaterialId}".`,
      )
    }
    artifacts[candidate.id] = {
      designSystem: {
        candidateSetId: descriptor.data.designSystem.candidateSetId,
        candidateId: descriptor.data.designSystem.candidateId,
        directionId: descriptor.data.designSystem.directionId,
        baseRevisionId: descriptor.data.designSystem.baseRevisionId,
        provenanceIds: descriptor.data.designSystem.provenanceIds,
        artifact: {
          name: designVisual.name,
          designMarkdown: markdown,
          bytes: designBytes,
          mediaType: currentContent(designVisual).mediaType ?? 'application/octet-stream',
          width: designSize.width,
          height: designSize.height,
        },
      },
      plan: descriptor.data.plan,
      pages,
      resourcePack: {
        id: resourceDescriptor.data.id,
        manifest: resourceDescriptor.data.manifest as PersistedPrototypeSuiteCandidate['resourcePack']['manifest'],
        manifestProvenanceId: resourceDescriptor.data.manifestProvenanceId,
        assets: resourceAssets,
      },
      provenanceIds: descriptor.data.provenanceIds,
      ...(codingReceipt ? { codingReceipt } : {}),
    }
  }
  const state = { set: input.candidateSet, artifacts }
  const validation = validatePrototypeSuiteCandidateSet(state, input.designSystemCandidates)
  if (!validation.ok) return err(`Invalid prototype suite candidate state: ${validation.error}`)
  return ok(validation.data)
}

async function legacyMaterials(input: {
  readonly projectId: string
  readonly workspace: WorkspaceSnapshot
  readonly suiteState: PersistedPrototypeSuiteCandidateSet | null
  readonly codingReceipts: readonly CodingReceipt[]
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
      pixelSize: intrinsicSize(system.width, system.height, system.bytes),
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
  const candidateState = input.workspace.prototypeDesignSystemCandidates
  if (candidateState) {
    const directions = new Map(
      candidateState.set.proposal.directions.map((direction) => [direction.id, direction]),
    )
    for (const candidate of candidateState.set.candidates) {
      const artifact = candidateState.artifacts[candidate.id]
      if (!artifact || candidate.status !== 'ready') continue
      const direction = directions.get(candidate.directionId)
      const visualId = candidate.outputs.find((output) => output.role === 'design-system')?.materialId
      const markdownId = candidate.outputs.find((output) => output.role === 'design-markdown')?.materialId
      if (!visualId || !markdownId) continue
      materials.push(await material({
        id: visualId,
        kind: 'design-system',
        name: direction?.label ?? artifact.name,
        referenceId: `content:${visualId}:image`,
        uri: legacyUri(input.projectId, `workspace/design-system-candidates/${candidate.id}/image`),
        mediaType: artifact.mediaType,
        bytes: artifact.bytes,
        pixelSize: intrinsicSize(artifact.width, artifact.height, artifact.bytes),
        provenanceId: candidate.provenanceIds[0] ?? input.provenanceId,
        createdAt: input.createdAt,
      }))
      materials.push(await material({
        id: markdownId,
        kind: 'design-markdown',
        name: `${direction?.label ?? artifact.name} DESIGN.md`,
        referenceId: `content:${markdownId}`,
        uri: legacyUri(input.projectId, `workspace/design-system-candidates/${candidate.id}/DESIGN.md`),
        mediaType: 'text/markdown',
        bytes: textBytes(artifact.designMarkdown),
        provenanceId: candidate.provenanceIds[0] ?? input.provenanceId,
        createdAt: input.createdAt,
      }))
    }
  }
  if (input.suiteState) {
    for (const candidate of input.suiteState.set.candidates) {
      const artifact = input.suiteState.artifacts[candidate.id]
      if (!artifact || candidate.status !== 'ready') continue
      const suiteOutputId = candidate.outputs.find(
        (output) => output.role === 'prototype-suite',
      )?.materialId
      const resourcePackOutputId = candidate.outputs.find(
        (output) => output.role === 'resource-pack',
      )?.materialId
      if (!suiteOutputId || !resourcePackOutputId) {
        throw new Error(`Ready prototype suite candidate "${candidate.id}" has incomplete outputs.`)
      }
      const designCandidate = candidateState?.set.candidates.find(
        (item) => item.id === artifact.designSystem.candidateId,
      )
      const visualMaterialId = designCandidate?.outputs.find(
        (output) => output.role === 'design-system',
      )?.materialId
      const markdownMaterialId = designCandidate?.outputs.find(
        (output) => output.role === 'design-markdown',
      )?.materialId
      if (!visualMaterialId || !markdownMaterialId) {
        throw new Error(
          `Prototype suite candidate "${candidate.id}" has no complete Design System material binding.`,
        )
      }
      const projection = prototypeSuiteContentProjection({
        candidateId: candidate.id,
        artifact,
        resourcePackMaterialId: resourcePackOutputId,
        visualMaterialId,
        markdownMaterialId,
      })
      const pageMaterials = projection.suite.pages
      for (const [index, page] of artifact.pages.entries()) {
        const pageMaterial = pageMaterials[index]!
        materials.push(await material({
          id: pageMaterial.materialId,
          kind: 'prototype-page',
          name: `${page.page.name} (${candidate.id})`,
          referenceId: suiteContentReferenceId(candidate.id, `page:${index + 1}`),
          uri: legacyUri(
            input.projectId,
            suiteLegacyPath(candidate.id, `pages/${index + 1}`),
          ),
          mediaType: page.mediaType,
          bytes: page.bytes,
          pixelSize: intrinsicSize(page.width, page.height, page.bytes),
          provenanceId: artifact.provenanceIds[0]!,
          createdAt: input.createdAt,
        }))
      }
      const assetMaterials = projection.resourcePack.assets
      for (const [index, asset] of artifact.resourcePack.assets.entries()) {
        const binding = assetMaterials[index]!
        materials.push(await jsonMaterial({
          id: binding.materialId,
          name: `Resource asset binding ${index + 1} (${candidate.id})`,
          value: projection.assets[index],
          uri: legacyUri(
            input.projectId,
            suiteLegacyPath(candidate.id, `resource-pack/assets/${index + 1}.json`),
          ),
          provenanceId: asset.provenanceIds[0]!,
          createdAt: input.createdAt,
        }))
      }
      materials.push(await jsonMaterial({
        id: resourcePackOutputId,
        name: `Resource pack (${candidate.id})`,
        value: projection.resourcePack,
        uri: legacyUri(
          input.projectId,
          suiteLegacyPath(candidate.id, 'resource-pack/manifest.json'),
        ),
        provenanceId: artifact.resourcePack.manifestProvenanceId,
        createdAt: input.createdAt,
      }))
      materials.push(await jsonMaterial({
        id: suiteOutputId,
        name: `Prototype suite (${candidate.id})`,
        value: projection.suite,
        uri: legacyUri(
          input.projectId,
          suiteLegacyPath(candidate.id, 'suite.json'),
        ),
        provenanceId: artifact.provenanceIds[0]!,
        createdAt: input.createdAt,
      }))
    }
  }
  for (const receipt of input.codingReceipts) {
    materials.push(await jsonMaterial({
      id: codingReceiptMaterialId(receipt.receiptId),
      kind: 'code',
      name: `Coding receipt ${receipt.receiptId}`,
      value: receipt,
      uri: legacyUri(
        input.projectId,
        codingReceiptLegacyPath(receipt.receiptId),
      ),
      provenanceId: codingReceiptProvenanceId(receipt.receiptId),
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
      pixelSize: intrinsicSize(artifact.width, artifact.height, artifact.bytes),
      provenanceId: input.provenanceId,
      createdAt: input.createdAt,
    }))
    if (artifact.review) {
      materials.push(await jsonMaterial({
        id: pageReviewMaterialId(artifact.page.id),
        name: `${artifact.page.name} review`,
        value: artifact.review,
        uri: legacyUri(input.projectId, pageReviewLegacyPath(artifact.page.id)),
        provenanceId: input.provenanceId,
        createdAt: input.createdAt,
      }))
    }
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
      pixelSize: intrinsicSize(slice.width, slice.height, slice.bytes),
      provenanceId: slice.production?.provenanceId ?? input.provenanceId,
      production: slice.production?.evidence,
      createdAt: input.createdAt,
    }))
  }
  return materials
}

function selectedCandidateTokens(
  candidateState: WorkspaceSnapshot['prototypeDesignSystemCandidates'],
): DesignDocument['tokens'] {
  const selected = candidateState?.set.selection
  const artifact = selected ? candidateState?.artifacts[selected.candidateId] : null
  if (!selected || !artifact) return []
  try {
    return [...projectDesignMarkdownTokens(
      parseEditableDesignMarkdown(artifact.designMarkdown),
      { provenanceId: selected.provenanceId },
    )]
  } catch {
    return []
  }
}

function validatedPrototypeSuiteState(
  suiteState: WorkspaceSnapshot['prototypeSuiteCandidates'],
  designSystemState: WorkspaceSnapshot['prototypeDesignSystemCandidates'],
): PersistedPrototypeSuiteCandidateSet | null {
  if (!suiteState) return null
  const validation = validatePrototypeSuiteCandidateSet(
    suiteState,
    designSystemState ?? undefined,
  )
  if (!validation.ok) {
    throw new Error(`Prototype suite Design IR projection failed: ${validation.error}`)
  }
  return validation.data
}

function prototypeSuiteContentProjection(input: {
  readonly candidateId: string
  readonly artifact: PersistedPrototypeSuiteCandidate
  readonly resourcePackMaterialId: string
  readonly visualMaterialId: string
  readonly markdownMaterialId: string
}) {
  const pages = input.artifact.pages.map((page, index) => ({
    pageId: page.page.id,
    materialId: suiteSupportMaterialId(input.candidateId, `page:${index + 1}`),
    ...(page.review ? { review: page.review } : {}),
  }))
  const assets = input.artifact.resourcePack.assets.map((asset, index) => ({
    manifestItemId: asset.manifestItemId,
    materialId: suiteSupportMaterialId(input.candidateId, `resource-asset:${index + 1}`),
  }))
  return {
    suite: {
      version: PROTOTYPE_SUITE_MATERIAL_VERSION,
      candidateId: input.candidateId,
      designSystem: {
        candidateSetId: input.artifact.designSystem.candidateSetId,
        candidateId: input.artifact.designSystem.candidateId,
        directionId: input.artifact.designSystem.directionId,
        baseRevisionId: input.artifact.designSystem.baseRevisionId,
        provenanceIds: input.artifact.designSystem.provenanceIds,
        visualMaterialId: input.visualMaterialId,
        markdownMaterialId: input.markdownMaterialId,
      },
      plan: input.artifact.plan,
      pages,
      resourcePackMaterialId: input.resourcePackMaterialId,
      provenanceIds: input.artifact.provenanceIds,
      ...(input.artifact.codingReceipt
        ? { codingReceiptMaterialId: codingReceiptMaterialId(input.artifact.codingReceipt.receiptId) }
        : {}),
    },
    resourcePack: {
      version: RESOURCE_PACK_MATERIAL_VERSION,
      id: input.artifact.resourcePack.id,
      manifest: input.artifact.resourcePack.manifest,
      manifestProvenanceId: input.artifact.resourcePack.manifestProvenanceId,
      assets,
    },
    assets: input.artifact.resourcePack.assets.map((asset) => ({
      version: RESOURCE_ASSET_MATERIAL_VERSION,
      manifestItemId: asset.manifestItemId,
      artifactId: asset.artifactId,
      provenanceIds: asset.provenanceIds,
      ...(asset.review ? { review: asset.review } : {}),
    })),
  }
}

function validatedCodingReceipts(
  receipts: readonly CodingReceipt[] | undefined,
  suiteState: PersistedPrototypeSuiteCandidateSet | null,
): readonly CodingReceipt[] {
  const byId = new Map<string, CodingReceipt>()
  const add = (input: unknown) => {
    const parsed = codingReceiptSchema.safeParse(input)
    if (!parsed.success) {
      throw new Error(
        `Coding receipt Design IR projection failed: ${parsed.error.issues[0]?.message ?? 'Invalid receipt.'}`,
      )
    }
    const prior = byId.get(parsed.data.receiptId)
    if (prior && JSON.stringify(prior) !== JSON.stringify(parsed.data)) {
      throw new Error(`Conflicting Coding receipts share id "${parsed.data.receiptId}".`)
    }
    byId.set(parsed.data.receiptId, parsed.data)
  }
  for (const receipt of receipts ?? []) add(receipt)
  for (const artifact of Object.values(suiteState?.artifacts ?? {})) {
    if (artifact.codingReceipt) add(artifact.codingReceipt)
  }
  return [...byId.values()]
}

function derivationProvenance(
  id: string,
  sourceId: string,
  recordedAt: number,
  tool: string,
  actorId: string,
): DesignDocument['provenance'][number] {
  return {
    id,
    operation: 'derive',
    sourceIds: [sourceId],
    actor: { kind: 'agent', id: actorId },
    recordedAt: toIso(recordedAt),
    tool,
  }
}

function uniqueById<T extends { readonly id: string }>(values: readonly T[]): T[] {
  const unique = new Map<string, T>()
  for (const value of values) {
    const prior = unique.get(value.id)
    if (prior && JSON.stringify(prior) !== JSON.stringify(value)) {
      throw new Error(`Conflicting Design IR records share id "${value.id}".`)
    }
    unique.set(value.id, value)
  }
  return [...unique.values()]
}

async function jsonMaterial(input: {
  readonly id: string
  readonly kind?: Material['kind']
  readonly name: string
  readonly value: unknown
  readonly uri: string
  readonly provenanceId: string
  readonly createdAt: string
}): Promise<Material> {
  return material({
    id: input.id,
    kind: input.kind ?? 'other',
    name: input.name,
    referenceId: relatedDesignIrId('content:', input.id),
    uri: input.uri,
    mediaType: 'application/json',
    bytes: jsonBytes(input.value),
    provenanceId: input.provenanceId,
    createdAt: input.createdAt,
  })
}

function suiteSupportMaterialId(candidateId: string, role: string): string {
  return relatedDesignIrId('material:prototype-suite-support:', `${candidateId}:${role}`)
}

function suiteContentReferenceId(candidateId: string, role: string): string {
  return relatedDesignIrId('content:prototype-suite:', `${candidateId}:${role}`)
}

function codingReceiptMaterialId(receiptId: string): string {
  return relatedDesignIrId('material:coding-receipt:', receiptId)
}

function pageReviewMaterialId(pageId: string): string {
  return relatedDesignIrId('material:prototype-page-review:', pageId)
}

function pageReviewLegacyPath(pageId: string): string {
  return `workspace/pages/${pageId}/review.json`
}

function codingReceiptProvenanceId(receiptId: string): string {
  return relatedDesignIrId('provenance:coding-receipt:', receiptId)
}

function relatedDesignIrId(prefix: string, value: string): string {
  const direct = `${prefix}${value}`
  if (direct.length <= 160) return direct
  const suffix = stableTextId(direct)
  return `${direct.slice(0, 160 - suffix.length - 1)}:${suffix}`
}

function stableTextId(value: string): string {
  let hash = 2166136261
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function jsonBytes(value: unknown): Uint8Array {
  return textBytes(JSON.stringify(value))
}

function suiteLegacyPath(candidateId: string, suffix: string): string {
  return `workspace/prototype-suite-candidates/${encodeURIComponent(candidateId)}/${suffix}`
}

function codingReceiptLegacyPath(receiptId: string): string {
  return `workspace/coding-receipts/${encodeURIComponent(receiptId)}.json`
}

async function material(input: {
  readonly id: string
  readonly kind: Material['kind']
  readonly name: string
  readonly referenceId: string
  readonly uri: string
  readonly mediaType: string
  readonly bytes: Uint8Array
  readonly pixelSize?: { readonly width: number; readonly height: number }
  readonly provenanceId: string
  readonly production?: MaterialProductionEvidence
  readonly createdAt: string
}): Promise<Material> {
  const content = await contentReference(
    input.referenceId,
    input.uri,
    input.mediaType,
    input.bytes,
    input.pixelSize,
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
      production: input.production,
    }],
    currentRevisionId: revisionId,
  }
}

async function contentReference(
  id: string,
  uri: string,
  mediaType: string,
  bytes: Uint8Array,
  pixelSize?: { readonly width: number; readonly height: number },
): Promise<ContentReference> {
  return { id, uri, mediaType, sha256: await sha256(bytes), pixelSize }
}

function currentContent(material: Material): ContentReference {
  const revision = material.revisions.find((item) => item.id === material.currentRevisionId)
  if (!revision) throw new Error(`Material "${material.id}" has no current revision.`)
  return revision.content
}

function intrinsicSize(
  width: number,
  height: number,
  bytes: Uint8Array,
): { readonly width: number; readonly height: number } | undefined {
  if (
    Number.isInteger(width)
    && Number.isInteger(height)
    && width > 0
    && height > 0
  ) {
    return { width, height }
  }
  return readRasterDimensions(bytes) ?? undefined
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

async function resolveJson(
  material: Material,
  resolver: ContentResolver,
): Promise<Result<unknown>> {
  const text = await resolveText(material, resolver)
  if (text === null) return err(`Missing or invalid content for material "${material.id}".`)
  try {
    return ok(JSON.parse(text) as unknown)
  } catch {
    return err(`Invalid JSON content for material "${material.id}".`)
  }
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
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
