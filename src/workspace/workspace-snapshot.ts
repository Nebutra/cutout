import type { PrototypePlan, PrototypePage } from '@/prototype/prototype-plan'
import {
  DEFAULT_PROTOTYPE_SUITE_SCOPE,
  type PrototypeSuiteScope,
} from '@/prototype/scope'
import type { OutcomeRuntimeState } from '@/agent-runtime/outcome-runtime'
import type { AgentRunEventStore } from '@/agent-runtime/run-events'
import type {
  ComposerModelPolicy,
  ComposerThinkingPolicy,
} from '@/agent-runtime/execution-policy'
import type { DesignDocument } from '@/design-ir'
import type { DesignOsAuthoringState } from '@/design-os-operations/authoring'
import type { CreativeBoardState } from '@/agent-runtime/creative-board-decisions'
import type { CompositeDeliveryReceipt, DeliveryPlan, DeliveryRequest } from '@/delivery-center'
import type { ApprovedDeliverableReceipt } from '@/global-library'
import type { BrandViRun } from '@/brand-kit'
import type { CanvasAnnotation } from '@/components/workspace/canvas-annotations'
import type { CandidateSet } from '@/candidate-selection/contracts'

export type WorkspaceWorkflowPhase =
  | 'idle'
  | 'planning'
  | 'review'
  | 'design-system'
  | 'design-system-selection'
  | 'generating-suite'

export type WorkspaceNamingStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'done'
  | 'skipped'
  | 'error'

export interface PersistedPrototypeImage {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly width: number
  readonly height: number
}

export interface PersistedPrototypeDesignSystem extends PersistedPrototypeImage {
  readonly name: string
  readonly designMarkdown: string
}

export interface PersistedPrototypeDesignSystemCandidateSet {
  readonly set: CandidateSet
  readonly artifacts: Readonly<Record<string, PersistedPrototypeDesignSystem>>
}

export interface PersistedPrototypePage extends PersistedPrototypeImage {
  readonly page: PrototypePage
}

export interface PersistedReferenceAttachment {
  readonly id: string
  readonly name: string
  readonly bytes: Uint8Array
  readonly mediaType: string
}

export interface WorkspaceSnapshot {
  readonly version: 'workspace.v1'
  readonly workflowPhase: WorkspaceWorkflowPhase
  readonly prototypePlan: PrototypePlan | null
  readonly prototypeScope: PrototypeSuiteScope
  readonly humanLoopChoiceId: string | null
  readonly humanLoopCustomAnswer: string
  readonly prototypeDesignSystem: PersistedPrototypeDesignSystem | null
  /** Additive multi-direction state; the singular field remains the selected projection. */
  readonly prototypeDesignSystemCandidates?: PersistedPrototypeDesignSystemCandidateSet | null
  readonly prototypePages: readonly PersistedPrototypePage[]
  readonly selectedPrototypePageId: string | null
  readonly runError: string | null
  readonly namingStatus: WorkspaceNamingStatus
  /** Regions whose extraction failed; drives durable targeted retry. */
  readonly liveAgentOutput: string
  readonly attachments: readonly PersistedReferenceAttachment[]
  readonly webSearchEnabled: boolean
  readonly composerModelPolicy?: ComposerModelPolicy
  readonly composerThinkingPolicy?: ComposerThinkingPolicy
  readonly outcome?: OutcomeRuntimeState | null
  /** Durable observable Agent activity. Older workspace.v1 records omit it. */
  readonly agentRunEvents?: AgentRunEventStore | null
  /** Canonical Design IR when a project has been compiled into Design OS. */
  readonly designDocument?: DesignDocument | null
  /** Explicit, revision-bound user declarations used by Design OS compilers. */
  readonly designOsAuthoring?: DesignOsAuthoringState | null
  readonly creativeBoard?: CreativeBoardState | null
  readonly deliveryRequest?: DeliveryRequest | null
  readonly deliveryPlan?: DeliveryPlan | null
  readonly deliveryReceipt?: CompositeDeliveryReceipt | null
  readonly approvedDeliverables?: readonly ApprovedDeliverableReceipt[]
  readonly brandViRun?: BrandViRun | null
  /** User-authored canvas guidance. It is Agent context, never raster output. */
  readonly canvasAnnotations?: readonly CanvasAnnotation[]
  /** Durable evidence for inputs that require a runtime capability not currently available. */
  readonly capabilityReceipts?: readonly WorkspaceCapabilityReceipt[]
}

export interface WorkspaceCapabilityReceipt {
  readonly protocol: 'cutout.workspace-capability-receipt.v1'
  readonly id: string
  readonly capability: 'video-understanding'
  readonly status: 'required' | 'available' | 'completed'
  readonly sourceName: string
  readonly mediaType: string
  readonly createdAt: string
  readonly message: string
}

export function createEmptyWorkspaceSnapshot(
  patch: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
  return {
    version: 'workspace.v1',
    workflowPhase: 'idle',
    prototypePlan: null,
    prototypeScope: DEFAULT_PROTOTYPE_SUITE_SCOPE,
    humanLoopChoiceId: null,
    humanLoopCustomAnswer: '',
    prototypeDesignSystem: null,
    prototypeDesignSystemCandidates: null,
    prototypePages: [],
    selectedPrototypePageId: null,
    runError: null,
    namingStatus: 'idle',
    liveAgentOutput: '',
    attachments: [],
    webSearchEnabled: false,
    ...patch,
  }
}

export function isWorkspaceSnapshotEmpty(
  snapshot: WorkspaceSnapshot | null | undefined,
): boolean {
  if (!snapshot) return true
  return (
    !snapshot.prototypePlan &&
    !snapshot.prototypeDesignSystem &&
    !snapshot.prototypeDesignSystemCandidates &&
    snapshot.prototypePages.length === 0 &&
    !snapshot.selectedPrototypePageId &&
    !snapshot.runError &&
    !snapshot.humanLoopChoiceId &&
    snapshot.humanLoopCustomAnswer.trim().length === 0 &&
    snapshot.namingStatus === 'idle' &&
    snapshot.liveAgentOutput.trim().length === 0 &&
    (snapshot.attachments?.length ?? 0) === 0 &&
    !snapshot.webSearchEnabled &&
    !snapshot.composerModelPolicy &&
    !snapshot.composerThinkingPolicy &&
    !snapshot.outcome &&
    !snapshot.agentRunEvents &&
    !snapshot.designOsAuthoring &&
    !snapshot.deliveryRequest &&
    !snapshot.deliveryPlan &&
    !snapshot.deliveryReceipt &&
    !(snapshot.approvedDeliverables?.length) &&
    !snapshot.brandViRun &&
    !(snapshot.canvasAnnotations?.length) &&
    !(snapshot.capabilityReceipts?.length) &&
    !snapshot.designDocument &&
    !hasCreativeBoardContent(snapshot.creativeBoard)
  )
}

export function workspaceSnapshotFingerprint(
  snapshot: WorkspaceSnapshot | null | undefined,
): string {
  if (!snapshot || isWorkspaceSnapshotEmpty(snapshot)) return ''
  const design = snapshot.prototypeDesignSystem
    ? [
        snapshot.prototypeDesignSystem.name,
        snapshot.prototypeDesignSystem.width,
        snapshot.prototypeDesignSystem.height,
        snapshot.prototypeDesignSystem.bytes.byteLength,
        textFingerprint(snapshot.prototypeDesignSystem.designMarkdown),
      ].join(':')
    : ''
  const pages = snapshot.prototypePages
    .map((artifact) =>
      [
        artifact.page.id,
        textFingerprint(JSON.stringify(artifact.page)),
        artifact.width,
        artifact.height,
        artifact.bytes.byteLength,
      ].join(':'),
    )
    .join(',')
  const designCandidates = snapshot.prototypeDesignSystemCandidates
    ? textFingerprint(JSON.stringify({
        set: snapshot.prototypeDesignSystemCandidates.set,
        artifacts: Object.fromEntries(
          Object.entries(snapshot.prototypeDesignSystemCandidates.artifacts).map(([id, artifact]) => [id, {
            name: artifact.name,
            mediaType: artifact.mediaType,
            width: artifact.width,
            height: artifact.height,
            bytes: artifact.bytes.byteLength,
            designMarkdown: textFingerprint(artifact.designMarkdown),
          }]),
        ),
      }))
    : ''
  const attachments = (snapshot.attachments ?? [])
    .map((attachment) =>
      [
        attachment.id,
        attachment.name,
        attachment.mediaType,
        attachment.bytes.byteLength,
      ].join(':'),
    )
    .join(',')

  return [
    snapshot.version,
    snapshot.workflowPhase,
    snapshot.prototypePlan ? textFingerprint(JSON.stringify(snapshot.prototypePlan)) : '',
    snapshot.prototypeScope,
    snapshot.humanLoopChoiceId ?? '',
    snapshot.humanLoopCustomAnswer,
    design,
    designCandidates,
    pages,
    snapshot.selectedPrototypePageId ?? '',
    snapshot.runError ?? '',
    snapshot.namingStatus,
    snapshot.liveAgentOutput.length,
    attachments,
    snapshot.webSearchEnabled ? 'web' : '',
    composerModelPolicyFingerprint(snapshot.composerModelPolicy),
    snapshot.composerThinkingPolicy ?? '',
    outcomeFingerprint(snapshot.outcome),
    agentRunEventsFingerprint(snapshot.agentRunEvents),
    snapshot.designOsAuthoring ? textFingerprint(JSON.stringify(snapshot.designOsAuthoring)) : '',
    snapshot.deliveryRequest ? textFingerprint(JSON.stringify(snapshot.deliveryRequest)) : '',
    snapshot.deliveryPlan ? textFingerprint(JSON.stringify(snapshot.deliveryPlan)) : '',
    snapshot.deliveryReceipt ? textFingerprint(JSON.stringify(snapshot.deliveryReceipt)) : '',
    snapshot.approvedDeliverables?.length ? textFingerprint(JSON.stringify(snapshot.approvedDeliverables)) : '',
    snapshot.brandViRun ? textFingerprint(JSON.stringify(snapshot.brandViRun)) : '',
    snapshot.canvasAnnotations?.length
      ? textFingerprint(JSON.stringify(snapshot.canvasAnnotations))
      : '',
    snapshot.capabilityReceipts?.length
      ? textFingerprint(JSON.stringify(snapshot.capabilityReceipts))
      : '',
    hasCreativeBoardContent(snapshot.creativeBoard) ? textFingerprint(JSON.stringify(snapshot.creativeBoard)) : '',
    // DesignDocument is normally derived from the fields above. Including it
    // here would make an otherwise unchanged snapshot look dirty when the
    // projector publishes a new object. It is meaningful only for legacy IR-
    // only records that have no workspace fields to project.
    hasWorkspaceProjectionInput(snapshot)
      ? ''
      : designDocumentFingerprint(snapshot.designDocument),
  ].join('|')
}

function hasCreativeBoardContent(state: CreativeBoardState | null | undefined): boolean {
  return Boolean(state && (state.decisions.length > 0 || state.branches.length > 0))
}

function hasWorkspaceProjectionInput(snapshot: WorkspaceSnapshot): boolean {
  return Boolean(
    snapshot.prototypePlan ||
      snapshot.prototypeDesignSystem ||
      snapshot.prototypeDesignSystemCandidates ||
      snapshot.prototypePages.length > 0 ||
      snapshot.selectedPrototypePageId ||
      snapshot.runError ||
      snapshot.humanLoopChoiceId ||
      snapshot.humanLoopCustomAnswer.trim() ||
      snapshot.namingStatus !== 'idle' ||
      snapshot.liveAgentOutput.trim() ||
      (snapshot.attachments?.length ?? 0) > 0 ||
      snapshot.webSearchEnabled ||
      snapshot.composerModelPolicy ||
      snapshot.composerThinkingPolicy ||
      snapshot.outcome ||
      snapshot.agentRunEvents ||
      snapshot.designOsAuthoring ||
      snapshot.deliveryRequest ||
      snapshot.deliveryPlan ||
      snapshot.deliveryReceipt ||
      snapshot.brandViRun ||
      (snapshot.canvasAnnotations?.length ?? 0) > 0 ||
      (snapshot.capabilityReceipts?.length ?? 0) > 0
  )
}

function composerModelPolicyFingerprint(
  policy: ComposerModelPolicy | undefined,
): string {
  if (!policy || policy.mode === 'auto') return policy?.mode ?? ''
  return [
    policy.mode,
    policy.slot,
    policy.assignment.providerId,
    policy.assignment.model,
  ].join(':')
}

function outcomeFingerprint(outcome: OutcomeRuntimeState | null | undefined): string {
  if (!outcome) return ''
  return [
    outcome.version,
    outcome.contract.id,
    outcome.runId,
    outcome.status,
    outcome.materials.map((material) => `${material.kind}:${material.id}`).join(','),
    outcome.evaluation.missing
      .map((requirement) => `${requirement.kind}:${requirement.count}`)
      .join(','),
  ].join(':')
}

function agentRunEventsFingerprint(
  store: AgentRunEventStore | null | undefined,
): string {
  if (!store) return ''
  const last = store.events.at(-1)
  return [
    store.version,
    store.activeRunId ?? '',
    store.events.length,
    last?.eventId ?? '',
    last?.type ?? '',
    store.activeRun?.status ?? '',
  ].join(':')
}

/**
 * The DesignDocument is a derived projection of this snapshot. Keep enough
 * identity in autosave for imported/legacy IR-only records, but never hash its
 * complete graph here: doing so would feed the projection back into its own
 * write trigger.
 */
function designDocumentFingerprint(document: DesignDocument | null | undefined): string {
  if (!document) return ''
  return [
    document.version,
    document.meta.id,
    document.revision.id,
    document.revision.number,
    document.sources.length,
    document.materials.length,
    document.tokens.length,
    document.components.length,
  ].join(':')
}

export function textFingerprint(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`
}
