import type { PrototypePlan, PrototypePage } from '@/prototype/prototype-plan'
import type { PrototypeSuiteScope } from '@/prototype/generate-suite'

export type WorkspaceWorkflowPhase =
  | 'idle'
  | 'planning'
  | 'review'
  | 'design-system'
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
  readonly prototypePages: readonly PersistedPrototypePage[]
  readonly selectedPrototypePageId: string | null
  readonly runError: string | null
  readonly namingStatus: WorkspaceNamingStatus
  readonly liveAgentOutput: string
  readonly attachments: readonly PersistedReferenceAttachment[]
  readonly webSearchEnabled: boolean
}

export function isWorkspaceSnapshotEmpty(
  snapshot: WorkspaceSnapshot | null | undefined,
): boolean {
  if (!snapshot) return true
  return (
    !snapshot.prototypePlan &&
    !snapshot.prototypeDesignSystem &&
    snapshot.prototypePages.length === 0 &&
    !snapshot.selectedPrototypePageId &&
    !snapshot.runError &&
    !snapshot.humanLoopChoiceId &&
    snapshot.humanLoopCustomAnswer.trim().length === 0 &&
    snapshot.namingStatus === 'idle' &&
    snapshot.liveAgentOutput.trim().length === 0 &&
    snapshot.attachments.length === 0 &&
    !snapshot.webSearchEnabled
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
        snapshot.prototypeDesignSystem.designMarkdown.length,
      ].join(':')
    : ''
  const pages = snapshot.prototypePages
    .map((artifact) =>
      [
        artifact.page.id,
        artifact.page.name,
        artifact.width,
        artifact.height,
        artifact.bytes.byteLength,
      ].join(':'),
    )
    .join(',')
  const attachments = snapshot.attachments
    .map((attachment) =>
      [attachment.id, attachment.name, attachment.bytes.byteLength].join(':'),
    )
    .join(',')

  return [
    snapshot.version,
    snapshot.workflowPhase,
    snapshot.prototypePlan?.version ?? '',
    snapshot.prototypePlan?.product.name ?? '',
    snapshot.prototypePlan?.humanLoop.mode ?? '',
    snapshot.prototypePlan?.pages.map((page) => page.id).join(',') ?? '',
    snapshot.prototypeScope,
    snapshot.humanLoopChoiceId ?? '',
    snapshot.humanLoopCustomAnswer,
    design,
    pages,
    snapshot.selectedPrototypePageId ?? '',
    snapshot.runError ?? '',
    snapshot.namingStatus,
    snapshot.liveAgentOutput.length,
    attachments,
    snapshot.webSearchEnabled ? 'web' : '',
  ].join('|')
}
