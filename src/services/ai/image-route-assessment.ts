import { modelDescriptorSchema, type ModelDescriptor } from './model-capabilities'
import type { ModelAssignment } from './model-assignment-types'
import {
  effectiveProviderWireProtocol,
  supportsOpenAIImageEndpoints,
  type ProviderConfig,
} from './provider-types'

export type ImageAdapterStrategy =
  | 'openai-images-generations'
  | 'openai-images-edits'
  | 'google-multimodal-generate'

export type ImageRouteCapabilityAssessment =
  | { readonly supported: true; readonly strategy: ImageAdapterStrategy }
  | {
      readonly supported: false
      readonly reason: 'provider-disabled' | 'route-mismatch' | 'evidence-required' | 'adapter-required'
    }

export interface ImageRouteAssessment {
  readonly assignment: ModelAssignment
  readonly fidelity: 'recommended' | 'compatible'
  readonly generation: ImageRouteCapabilityAssessment
  readonly edit: ImageRouteCapabilityAssessment
}

export type ImageRoutePresentationStatus =
  | 'recommended'
  | 'supported'
  | 'adapter-required'
  | 'evidence-required'

const HIGH_FIDELITY_MODEL_IDS = new Set([
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-1.5-high-fidelity',
  'chatgpt-image-latest',
  'chatgpt-image-latest-high-fidelity',
  'muse-image',
  'mai-image-2.5',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'qwen-image-3.0',
  'seedream-5-pro',
  'seedream-5.0-pro',
  'reve-2.1',
  'reve-image-2.1',
  'grok-imagine-image',
  'grok-2-image-1212',
])

const HIGH_FIDELITY_MODEL_FAMILIES = [
  /^gpt-image-2(?:[-_.].+)?$/,
  /^gpt-image-1[-_.]5(?:[-_.].+)?$/,
  /^chatgpt-image-latest(?:[-_.].+)?$/,
  /^muse-image(?:[-_.].+)?$/,
  /^mai-image-2[-_.]5(?:[-_.].+)?$/,
  /^gemini-3-pro-image(?:[-_.].+)?$/,
  /^gemini-3[-_.]1-flash-image(?:[-_.].+)?$/,
  /^qwen-image-3[-_.]0(?:[-_.].+)?$/,
  /^seedream-5(?:[-_.]0)?[-_.]pro(?:[-_.].+)?$/,
  /^reve(?:-image)?-2[-_.]1(?:[-_.].+)?$/,
  /^grok-(?:imagine-image|2-image)(?:[-_.].+)?$/,
] as const

const IMAGE_MODEL_NOMINATION = /(?:^|[-_./])(?:gpt[-_.]?image|chatgpt[-_.]?image|qwen[-_.]?image|dall[-_.]?e|imagen|flux|sdxl?|stable[-_.]?diffusion|image[-_.]?(?:gen|edit)|muse[-_.]?image|mai[-_.]?image|gemini[^/]*[-_.]image|seedream|reve|grok[^/]*[-_.]image)/i

const REVIEWED_AUTOMATIC_IMAGE_CAPABILITIES: Readonly<Record<
  string,
  {
    readonly provider: 'openai-images' | 'google-generate-content'
    readonly capabilities: readonly ('image-generation' | 'image-edit')[]
    readonly sourceId: string
  }
>> = {
  'gpt-image-1': {
    provider: 'openai-images',
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:gpt-image-1',
  },
  'gpt-image-1.5': {
    provider: 'openai-images',
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:gpt-image-1.5',
  },
  'gpt-image-2': {
    provider: 'openai-images',
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:gpt-image-2',
  },
  'chatgpt-image-latest': {
    provider: 'openai-images',
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:chatgpt-image-latest',
  },
  'gemini-2.5-flash-image': {
    provider: 'google-generate-content',
    capabilities: ['image-generation'],
    sourceId: 'google-generate-content:gemini-2.5-flash-image',
  },
  'gemini-3.1-flash-image-preview': {
    provider: 'google-generate-content',
    capabilities: ['image-generation'],
    sourceId: 'google-generate-content:gemini-3.1-flash-image-preview',
  },
  'gemini-3-pro-image-preview': {
    provider: 'google-generate-content',
    capabilities: ['image-generation'],
    sourceId: 'google-generate-content:gemini-3-pro-image-preview',
  },
}

export function imageRouteFidelity(model: string): ImageRouteAssessment['fidelity'] {
  const normalized = model.toLocaleLowerCase('en-US')
  return HIGH_FIDELITY_MODEL_IDS.has(normalized)
    || HIGH_FIDELITY_MODEL_FAMILIES.some((family) => family.test(normalized))
    ? 'recommended'
    : 'compatible'
}

/** Orders already-supported routes only; it never participates in capability assessment. */
export function imageRouteRecommendationRank(model: string): number {
  if (imageRouteFidelity(model) !== 'recommended') return 0
  const normalized = model.toLocaleLowerCase('en-US')
  return normalized === 'gpt-image-2' || normalized.startsWith('gpt-image-2-') ? 2 : 1
}

export function isImageModelNominationCandidate(model: string): boolean {
  return IMAGE_MODEL_NOMINATION.test(model)
}

export function assessImageRoute(input: {
  readonly assignment: ModelAssignment
  readonly provider: ProviderConfig | undefined
  readonly descriptor: ModelDescriptor | undefined
}): ImageRouteAssessment {
  const { assignment, provider, descriptor } = input
  const routeReason = !provider?.enabled
    ? 'provider-disabled' as const
    : provider.id !== assignment.providerId
      || (descriptor !== undefined && (
        descriptor.providerId !== assignment.providerId || descriptor.model !== assignment.model
      ))
      ? 'route-mismatch' as const
      : undefined

  const assess = (
    capability: 'image-generation' | 'image-edit',
  ): ImageRouteCapabilityAssessment => {
    if (routeReason) return { supported: false, reason: routeReason }
    if (!hasExecutableEvidence(input, capability)) {
      return { supported: false, reason: 'evidence-required' }
    }
    const strategy = adapterStrategy(provider!, capability)
    return strategy
      ? { supported: true, strategy }
      : { supported: false, reason: 'adapter-required' }
  }

  return {
    assignment,
    fidelity: imageRouteFidelity(assignment.model),
    generation: assess('image-generation'),
    edit: assess('image-edit'),
  }
}

export function exactImageRouteDescriptor(
  descriptors: readonly ModelDescriptor[],
  assignment: ModelAssignment,
): ModelDescriptor | undefined {
  return descriptors.find((descriptor) =>
    descriptor.providerId === assignment.providerId && descriptor.model === assignment.model)
}

export function imageRoutePresentationStatus(
  assessment: ImageRouteAssessment,
  capability: 'image-generation' | 'image-edit',
): ImageRoutePresentationStatus {
  const result = capability === 'image-edit' ? assessment.edit : assessment.generation
  if (result.supported) {
    return assessment.fidelity === 'recommended' ? 'recommended' : 'supported'
  }
  return result.reason === 'adapter-required' ? 'adapter-required' : 'evidence-required'
}

/**
 * Bootstrap evidence for exact, reviewed first-party image routes that are
 * present in an authenticated provider catalog. This is not the support gate:
 * arbitrary observed/verified descriptors remain eligible through
 * `assessImageRoute`, while an unlisted model name receives no capability.
 */
export function reviewedAutomaticImageDescriptors(
  provider: ProviderConfig,
  catalogModels: readonly string[],
): ModelDescriptor[] {
  return catalogModels.flatMap((model) => {
    const reviewed = REVIEWED_AUTOMATIC_IMAGE_CAPABILITIES[model]
    if (!reviewed || !reviewedProviderMatches(provider, reviewed.provider)) return []
    return [modelDescriptorSchema.parse({
      providerId: provider.id,
      model,
      capabilities: reviewed.capabilities,
      source: 'verified-catalog',
      evidence: reviewed.capabilities.map((capability) => ({
        capability,
        kind: 'verified' as const,
        sourceId: reviewed.sourceId,
      })),
    })]
  })
}

function hasExecutableEvidence(
  input: {
    readonly assignment: ModelAssignment
    readonly descriptor: ModelDescriptor | undefined
  },
  capability: 'image-generation' | 'image-edit',
): boolean {
  const descriptorEvidence = input.descriptor?.capabilities.includes(capability)
    && input.descriptor.evidence.some((item) =>
      item.capability === capability && (item.kind === 'observed' || item.kind === 'verified'))
  return descriptorEvidence === true
}

function reviewedProviderMatches(
  provider: ProviderConfig,
  reviewed: 'openai-images' | 'google-generate-content',
): boolean {
  return reviewed === 'openai-images'
    ? supportsOpenAIImageEndpoints(provider)
    : provider.kind === 'google'
      && effectiveProviderWireProtocol(provider) === 'google-generate-content'
}

function adapterStrategy(
  provider: ProviderConfig,
  capability: 'image-generation' | 'image-edit',
): ImageAdapterStrategy | undefined {
  if (supportsOpenAIImageEndpoints(provider)) {
    return capability === 'image-edit'
      ? 'openai-images-edits'
      : 'openai-images-generations'
  }
  if (
    capability === 'image-generation'
    && provider.kind === 'google'
    && effectiveProviderWireProtocol(provider) === 'google-generate-content'
  ) {
    return 'google-multimodal-generate'
  }
  return undefined
}
