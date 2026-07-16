import { projectRecordToDesignDocument } from '@/design-ir'
import type { LocalProjectRecord } from '@/services/local/project-repository.local'
import {
  createEmptyWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from './workspace-snapshot'

export interface HomeDraftVideoSource {
  readonly name: string
  readonly mediaType: string
}

export async function bootstrapHomeDraftProject(input: {
  readonly project: LocalProjectRecord
  readonly brief: string
  readonly videos?: readonly HomeDraftVideoSource[]
  readonly now?: Date
  readonly createId?: () => string
}): Promise<WorkspaceSnapshot> {
  const brief = input.brief.trim()
  const designDocument = await projectRecordToDesignDocument({
    ...input.project,
    brief,
  })
  const createdAt = (input.now ?? new Date()).toISOString()
  const createId = input.createId ?? (() => crypto.randomUUID())
  const capabilityReceipts = (input.videos ?? []).map((video) => ({
    protocol: 'cutout.workspace-capability-receipt.v1' as const,
    id: `capability:${createId()}`,
    capability: 'video-understanding' as const,
    status: 'required' as const,
    sourceName: video.name,
    mediaType: video.mediaType || 'video/*',
    createdAt,
    message:
      'Configure a verified video-understanding provider to process this source.',
  }))
  return createEmptyWorkspaceSnapshot({ designDocument, capabilityReceipts })
}
