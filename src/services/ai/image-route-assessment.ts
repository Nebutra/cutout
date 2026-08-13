import {
  modelDescriptorSchema,
  type CapabilityBindings,
  type ModelDescriptor,
} from './model-capabilities'
import { mergeModelDescriptors } from './model-catalog'
import type { ModelAssignment } from './model-assignment-types'
import {
  effectiveProviderWireProtocol,
  supportsOpenAIImageEndpoints,
  type ProviderConfig,
} from './provider-types'
import { z } from 'zod'

export const imageAdapterStrategySchema = z.enum([
  'openai-images-generations',
  'openai-images-edits',
  'xai-images-generations',
  'xai-images-edits',
  'google-multimodal-generate',
  'dashscope-native-image-generation',
  'dashscope-native-image-edit',
])
export type ImageAdapterStrategy = z.infer<typeof imageAdapterStrategySchema>

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

export type ImageRouteRecommendationObjective = 'configured' | 'refinement'

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

const REVIEWED_IMAGE_MODEL_CAPABILITIES: Readonly<Record<
  string,
  {
    readonly capabilities: readonly ('image-generation' | 'image-edit')[]
    readonly sourceId: string
  }
>> = {
  'gpt-image-1': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:gpt-image-1',
  },
  'gpt-image-1.5': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:gpt-image-1.5',
  },
  'gpt-image-2': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:gpt-image-2',
  },
  'chatgpt-image-latest': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'openai-images-api:chatgpt-image-latest',
  },
  'grok-imagine-image': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'xai-imagine-api:2026-08-10:grok-imagine-image',
  },
  'grok-imagine-image-quality': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'xai-imagine-api:2026-08-10:grok-imagine-image-quality',
  },
  'gemini-2.5-flash-image': {
    capabilities: ['image-generation'],
    sourceId: 'google-generate-content:gemini-2.5-flash-image',
  },
  'gemini-3.1-flash-image-preview': {
    capabilities: ['image-generation'],
    sourceId: 'google-generate-content:gemini-3.1-flash-image-preview',
  },
  'gemini-3-pro-image-preview': {
    capabilities: ['image-generation'],
    sourceId: 'google-generate-content:gemini-3-pro-image-preview',
  },
  'qwen-image-2.0': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-2.0',
  },
  'qwen-image-2.0-2026-03-03': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-2.0-2026-03-03',
  },
  'qwen-image-2.0-pro': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-2.0-pro',
  },
  'qwen-image-2.0-pro-2026-03-03': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-2.0-pro-2026-03-03',
  },
  'qwen-image-2.0-pro-2026-04-22': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-2.0-pro-2026-04-22',
  },
  'qwen-image-2.0-pro-2026-06-22': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-2.0-pro-2026-06-22',
  },
  'qwen-image-max': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-max',
  },
  'qwen-image-max-2025-12-30': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-max-2025-12-30',
  },
  'qwen-image-plus': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-plus',
  },
  'qwen-image-plus-2026-01-09': {
    capabilities: ['image-generation'],
    sourceId: 'dashscope-qwen-image-api:qwen-image-plus-2026-01-09',
  },
  'qwen-image-3.0': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'dashscope-qwen-image-3-api:2026-08-05:qwen-image-3.0',
  },
  'qwen-image-3.0-pro': {
    capabilities: ['image-generation', 'image-edit'],
    sourceId: 'dashscope-qwen-image-3-api:2026-08-05:qwen-image-3.0-pro',
  },
}

const XAI_IMAGE_MODEL_CAPABILITIES: Readonly<Record<
  string,
  readonly ('image-generation' | 'image-edit')[]
>> = {
  'grok-imagine-image': ['image-generation', 'image-edit'],
  'grok-imagine-image-quality': ['image-generation', 'image-edit'],
}

const EXACT_REVIEWED_MODEL_IDS = new Set([
  ...Object.keys(XAI_IMAGE_MODEL_CAPABILITIES),
  'qwen-image-3.0',
  'qwen-image-3.0-pro',
])

// Exact model ids observed on the Image Edit Arena dated 2026-07-25. Arena
// evidence proves that the model can edit an image; it does not prove that a
// configured endpoint exposes the model or implements the required transport.
// Those two facts are intersected later by catalog presence and adapterStrategy.
const REVIEWED_IMAGE_EDIT_MODEL_IDS = new Set([
  'gpt-image-2',
  'muse-image',
  'mai-image-2.5',
  'grok-imagine-image-quality',
  'grok-imagine-image-quality-20260519',
  'gemini-3-pro-image-2k',
  'chatgpt-image-latest-high-fidelity',
  'gemini-3-pro-image-preview',
  'seedream-5.0-pro',
  'reve-2.1',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-web-search',
  'gpt-image-1.5-high-fidelity',
  'grok-imagine-image',
  'reve-2.0',
  'uni-1.1-max',
  'gemini-3.1-flash-lite-image',
  'uni-1.1',
  'qwen-image-2.0-pro-2026-06-22',
  'wan2.7-image-pro',
  'hunyuan-image-3.0-instruct',
  'wan2.7-image',
  'seedream-4.5',
  'gemini-2.5-flash-image-preview',
  'seedream-5.0-lite',
  'seedream-4-2k',
  'flux-2-max',
  'reve-v1.1',
  'kling-image-o1',
  'flux-2-pro',
  'qwen-image-edit',
  'qwen-image-edit-2511',
  'reve-v1',
  'wan2.6-image',
  'flux-2-flex',
  'flux-2-klein-9b',
  'flux-2-dev',
  'seedream-4-high-res-fal',
  'p-image-edit',
  'seedream-4-fal',
  'reve-v1.1-fast',
  'reve-edit-fast',
  'flux-2-klein-4b',
  'flux-1-kontext-max',
  'wan2.5-i2i-preview',
  'flux-1-kontext-pro',
  'flux-1-kontext-dev',
  'seededit-3.0',
  'gpt-image-1',
  'gpt-image-1-mini',
  'gemini-2.0-flash-preview-image-generation',
  'bagel',
  'step1x-edit',
])

export function imageRouteFidelity(model: string): ImageRouteAssessment['fidelity'] {
  const normalized = model.toLocaleLowerCase('en-US')
  return HIGH_FIDELITY_MODEL_IDS.has(normalized)
    || HIGH_FIDELITY_MODEL_FAMILIES.some((family) => family.test(normalized))
    ? 'recommended'
    : 'compatible'
}

/** Orders already-supported routes only; it never participates in capability assessment. */
export function imageRouteRecommendationRank(
  model: string,
  objective: ImageRouteRecommendationObjective = 'refinement',
): number {
  if (imageRouteFidelity(model) !== 'recommended') return 0
  if (objective === 'configured') return 1
  const normalized = model.toLocaleLowerCase('en-US')
  const gptImage2 = normalized === 'gpt-image-2' || normalized.startsWith('gpt-image-2-')
  if (normalized === 'qwen-image-3.0-pro') return 4
  if (gptImage2) return 3
  return normalized === 'qwen-image-3.0' ? 2 : 1
}

/** Stable objective ordering for routes whose executable capability is already proven. */
export function sortImageRouteRecommendations<T extends { readonly model: string }>(
  routes: readonly T[],
  objective: ImageRouteRecommendationObjective = 'configured',
): T[] {
  if (objective === 'configured') return [...routes]
  return routes
    .map((route, index) => ({ route, index }))
    .sort((left, right) =>
      imageRouteRecommendationRank(right.route.model, objective)
      - imageRouteRecommendationRank(left.route.model, objective)
      || left.index - right.index,
    )
    .map(({ route }) => route)
}

/**
 * Product-fit gate for full UI/UX prototype production. Generic image-edit
 * compatibility is intentionally broader and must not become a silent
 * quality fallback for page, design-system, or resource-pack generation.
 */
export function isPrototypeProductionImageModel(model: string): boolean {
  const normalized = model.toLocaleLowerCase('en-US')
  return normalized === 'gpt-image-2'
    || normalized.startsWith('gpt-image-2-')
    || normalized === 'qwen-image-3.0'
    || normalized === 'qwen-image-3.0-pro'
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
    const strategy = adapterStrategy(provider!, assignment.model, capability)
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
 * Project reviewed model capability evidence only for exact ids present in an
 * authenticated provider catalog. Model evidence stays Provider-neutral; the
 * executable transport is intersected separately by `assessImageRoute`.
 * Arbitrary observed/verified descriptors remain eligible, while an unlisted
 * model name receives no inferred capability.
 */
export function reviewedCatalogImageDescriptors(
  provider: ProviderConfig,
  catalogModels: readonly string[],
): ModelDescriptor[] {
  return catalogModels.flatMap((model) => {
    const normalized = normalizeModelId(model)
    const exactCaseMismatch = EXACT_REVIEWED_MODEL_IDS.has(normalized) && model !== normalized
    const reviewed = exactCaseMismatch
      ? undefined
      : REVIEWED_IMAGE_MODEL_CAPABILITIES[normalized]
    // Arena labels are quality/capability evidence, not first-party xAI API
    // identifiers. The xAI transport accepts only the closed documented ids.
    const arenaEdit = provider.kind !== 'xai'
      && !exactCaseMismatch
      && REVIEWED_IMAGE_EDIT_MODEL_IDS.has(normalized)
    if (!reviewed && !arenaEdit) return []
    const capabilities = [
      ...(reviewed?.capabilities ?? []),
      ...(arenaEdit ? ['image-edit' as const] : []),
    ].filter((capability, index, values) => values.indexOf(capability) === index)
    return [modelDescriptorSchema.parse({
      providerId: provider.id,
      model,
      capabilities,
      source: 'verified-catalog',
      evidence: capabilities.map((capability) => ({
        capability,
        kind: capability === 'image-edit' && arenaEdit
          ? 'observed' as const
          : 'verified' as const,
        sourceId: capability === 'image-edit' && arenaEdit
          ? 'arena-image-edit:2026-07-25'
          : reviewed!.sourceId,
      })),
    })]
  })
}

/**
 * Resolve the exact descriptor used by execution. Persisted observed evidence
 * wins, while a verified endpoint model may add only reviewed image capability
 * evidence. Endpoint presence by itself still contributes no capability.
 */
export function verifiedImageRouteDescriptor(input: {
  readonly provider: ProviderConfig
  readonly assignment: ModelAssignment
  readonly descriptors: readonly ModelDescriptor[]
  readonly verifiedCatalogModels?: readonly string[]
}): ModelDescriptor | undefined {
  const exact = exactImageRouteDescriptor(input.descriptors, input.assignment)
  const reviewed = exactImageRouteDescriptor(
    reviewedCatalogImageDescriptors(input.provider, input.verifiedCatalogModels ?? []),
    input.assignment,
  )
  if (!exact) return reviewed
  if (!reviewed) return exact
  return exactImageRouteDescriptor(
    mergeModelDescriptors([exact, reviewed]),
    input.assignment,
  )
}

/** Adds reviewed exact-model evidence without mutating persisted user bindings. */
export function projectVerifiedImageCapabilityBindings(input: {
  readonly bindings: CapabilityBindings | undefined
  readonly providers: readonly ProviderConfig[]
  readonly catalogModelsByProvider: Readonly<Record<string, readonly string[]>>
}): CapabilityBindings | undefined {
  if (!input.bindings) return undefined
  const reviewed = input.providers.flatMap((provider) =>
    reviewedCatalogImageDescriptors(
      provider,
      input.catalogModelsByProvider[provider.id] ?? [],
    ))
  if (reviewed.length === 0) return input.bindings
  return {
    ...input.bindings,
    descriptors: mergeModelDescriptors([
      ...input.bindings.descriptors,
      ...reviewed,
    ]),
  }
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

function normalizeModelId(model: string): string {
  return model
    .toLocaleLowerCase('en-US')
    .replace(/\s*\[[^\]]+\]\s*$/, '')
    .replace(/[()]/g, '')
    .replace(/[\s/]+/g, '-')
}

function adapterStrategy(
  provider: ProviderConfig,
  model: string,
  capability: 'image-generation' | 'image-edit',
): ImageAdapterStrategy | undefined {
  if (supportsOpenAIImageEndpoints(provider)) {
    return capability === 'image-edit'
      ? 'openai-images-edits'
      : 'openai-images-generations'
  }
  if (
    provider.kind === 'xai'
    && effectiveProviderWireProtocol(provider) === 'chat-completions'
    && supportsXaiImageModel(model, capability)
  ) {
    return capability === 'image-edit'
      ? 'xai-images-edits'
      : 'xai-images-generations'
  }
  if (
    provider.kind === 'google'
    && effectiveProviderWireProtocol(provider) === 'google-generate-content'
  ) {
    return 'google-multimodal-generate'
  }
  if (
    provider.kind === 'dashscope'
    && effectiveProviderWireProtocol(provider) === 'chat-completions'
    && supportsNativeDashScopeImageTransport(provider)
    && supportsNativeDashScopeImageModel(model, capability)
  ) {
    return capability === 'image-edit'
      ? 'dashscope-native-image-edit'
      : 'dashscope-native-image-generation'
  }
  return undefined
}

/** Exact first-party xAI Imagine API model/operation contract. */
export function supportsXaiImageModel(
  model: string,
  capability: 'image-generation' | 'image-edit',
): boolean {
  return XAI_IMAGE_MODEL_CAPABILITIES[model]?.includes(capability) === true
}

const DASHSCOPE_NATIVE_IMAGE_CAPABILITIES: Readonly<Record<
  string,
  readonly ('image-generation' | 'image-edit')[]
>> = {
  'qwen-image-2.0': ['image-generation'],
  'qwen-image-2.0-2026-03-03': ['image-generation'],
  'qwen-image-2.0-pro': ['image-generation'],
  'qwen-image-2.0-pro-2026-03-03': ['image-generation'],
  'qwen-image-2.0-pro-2026-04-22': ['image-generation'],
  'qwen-image-2.0-pro-2026-06-22': ['image-generation', 'image-edit'],
  'qwen-image-max': ['image-generation'],
  'qwen-image-max-2025-12-30': ['image-generation'],
  'qwen-image-plus': ['image-generation'],
  'qwen-image-plus-2026-01-09': ['image-generation'],
  'qwen-image-edit': ['image-edit'],
  'qwen-image-edit-2511': ['image-edit'],
  'qwen-image-3.0': ['image-generation', 'image-edit'],
  'qwen-image-3.0-pro': ['image-generation', 'image-edit'],
}

function supportsNativeDashScopeImageModel(
  model: string,
  capability: 'image-generation' | 'image-edit',
): boolean {
  return DASHSCOPE_NATIVE_IMAGE_CAPABILITIES[model]?.includes(capability) === true
}

const DASHSCOPE_COMPATIBLE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** Native image calls are bound to the reviewed first-party DashScope origin. */
export function supportsNativeDashScopeImageTransport(
  provider: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'wireProtocol'>,
): boolean {
  if (provider.kind !== 'dashscope') return false
  if (effectiveProviderWireProtocol(provider) !== 'chat-completions') return false
  if (!provider.baseUrl) return true
  return provider.baseUrl.trim().replace(/\/+$/, '') === DASHSCOPE_COMPATIBLE_BASE_URL
}
