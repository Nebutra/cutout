import type { ModelTaskKind } from '@/services/ai/model-capabilities'
import { modelTaskProfile } from '@/services/ai/model-capabilities'

export type ModelDimension = {
  readonly task: ModelTaskKind
  readonly label: string
  readonly description: string
}

export const MODEL_DIMENSIONS: readonly ModelDimension[] = [
  { task: 'text', label: 'Text understanding', description: 'Conversation, planning and document understanding.' },
  { task: 'vision', label: 'Vision', description: 'Understand screenshots, photos and visual references.' },
  { task: 'webdev', label: 'Web development', description: 'Plan and implement web interfaces.' },
  { task: 'image-to-webdev', label: 'Image to Web', description: 'Implement a web interface from visual evidence.' },
  { task: 'image-generation', label: 'Image generation', description: 'Generate new visual material.' },
  { task: 'image-edit', label: 'Image editing', description: 'Edit one or more supplied images.' },
] as const

export function requiresVerifiedVision(task: ModelTaskKind): boolean {
  return modelTaskProfile(task).required.includes('vision')
}
