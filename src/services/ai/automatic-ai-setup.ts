import {
  autoConfigureProviderCandidate,
  type AutoConfiguredProvider,
  type ProviderDiscoveryCandidate,
} from './provider-discovery'
import {
  setCapabilityBinding,
  setCapabilityDescriptors,
} from './model-assignment.local'
import type { ModelTaskKind } from './model-capabilities'
import type { ModelAssignment } from './model-assignment-types'
import { setProviderVerification } from './provider-verification'
import {
  assessImageRoute,
  exactImageRouteDescriptor,
  imageRouteRecommendationRank,
  isImageModelNominationCandidate,
  isPrototypeProductionImageModel,
  reviewedCatalogImageDescriptors,
  sortImageRouteRecommendations,
} from './image-route-assessment'
import { mergeModelDescriptors } from './model-catalog'
import { aiDisplayErrorMessage } from './display-error-message'
import type { ProviderKind } from './provider-types'

const TEXT_MODEL = /(?:gpt|claude|gemini|qwen|deepseek|kimi|moonshot|mistral|llama|codex|chat)/i
const REQUIRED_AUTOMATIC_TASKS = [
  'text',
  'vision',
  'webdev',
  'image-to-webdev',
  'image-generation',
  'image-edit',
] as const satisfies readonly ModelTaskKind[]

const AUTOMATIC_FALLBACK_PROBE_LIMIT = 1

export interface AutomaticTextRoutePreference {
  readonly kind: ProviderKind
  readonly model: string
}

export interface AutomaticAiSetupOptions {
  readonly preferredTextRoutes?: readonly AutomaticTextRoutePreference[]
}

function credentialAuthorityPriority(candidate: ProviderDiscoveryCandidate): number {
  // Cutout-owned Provider metadata carries the exact persisted wire protocol
  // for its matching Keychain credential. Agent configs remain reusable, but
  // must not shadow that more specific authority for automatic setup.
  return candidate.source === 'cutout-keychain' ? 1 : 0
}

function fallbackProbePriority(candidate: ProviderDiscoveryCandidate): number {
  const model = candidate.modelHint
  if (!model) return 0
  const recommendation = imageRouteRecommendationRank(model, 'refinement')
  if (isPrototypeProductionImageModel(model)) return 2_000 + recommendation
  if (isImageModelNominationCandidate(model)) return 1_000 + recommendation
  return 0
}

function takeNextAutomaticCandidate(
  pending: ProviderDiscoveryCandidate[],
  requiredCoverageReady: boolean,
): ProviderDiscoveryCandidate | undefined {
  if (!requiredCoverageReady) return pending.shift()
  let selectedIndex = 0
  let selectedPriority = fallbackProbePriority(pending[0]!)
  for (let index = 1; index < pending.length; index += 1) {
    const priority = fallbackProbePriority(pending[index]!)
    if (priority > selectedPriority) {
      selectedIndex = index
      selectedPriority = priority
    }
  }
  return pending.splice(selectedIndex, 1)[0]
}

export interface AutomaticAiSetupResult {
  readonly configured: readonly AutoConfiguredProvider[]
  readonly bindings: Readonly<Partial<Record<ModelTaskKind, ModelAssignment>>>
}

export function automaticBindingsFor(
  configured: readonly AutoConfiguredProvider[],
  options: AutomaticAiSetupOptions = {},
): Readonly<Partial<Record<ModelTaskKind, ModelAssignment>>> {
  const bindings: Partial<Record<ModelTaskKind, ModelAssignment>> = {}
  const rows = configured.flatMap(({ provider, models }) =>
    models.map((model) => ({ provider, model })))
  const descriptors = automaticDescriptorsFor(configured)
  const hasImageCapability = (providerId: string, model: string) => {
    const descriptor = exactImageRouteDescriptor(descriptors, { providerId, model })
    return descriptor?.capabilities.some((capability) =>
      capability === 'image-generation' || capability === 'image-edit') ?? false
  }
  const preferredTextRoute = options.preferredTextRoutes
    ?.map((preference) => rows.find(({ provider, model }) =>
      provider.kind === preference.kind
      && model === preference.model
      && !isImageModelNominationCandidate(model)
      && !hasImageCapability(provider.id, model)))
    .find((row) => row !== undefined)
  const chat = rows.find(({ provider, model }) =>
    model === provider.defaultModel && !isImageModelNominationCandidate(model) && !hasImageCapability(provider.id, model))
    ?? rows.find(({ provider, model }) => TEXT_MODEL.test(model) && !isImageModelNominationCandidate(model) && !hasImageCapability(provider.id, model))
    ?? rows.find(({ provider, model }) => !isImageModelNominationCandidate(model) && !hasImageCapability(provider.id, model))
  const assessed = rows.filter(({ provider, model }) =>
    isImageModelNominationCandidate(model) || hasImageCapability(provider.id, model)
  ).map(({ provider, model }) => {
    const assignment = { providerId: provider.id, model }
    return assessImageRoute({
      provider,
      assignment,
      descriptor: exactImageRouteDescriptor(descriptors, assignment),
    })
  })
  const preferredSupportedRoute = (
    operation: 'generation' | 'edit',
  ) => {
    const supported = assessed.filter((route) => route[operation].supported)
    const configuredDefault = supported.find((route) => {
      const provider = rows.find(({ provider, model }) =>
        provider.id === route.assignment.providerId
        && model === route.assignment.model)?.provider
      return provider?.defaultModel === route.assignment.model
    })
    return configuredDefault ?? sortImageRouteRecommendations(
      supported.map((route) => ({ ...route, model: route.assignment.model })),
      'refinement',
    )[0]
  }
  const generation = preferredSupportedRoute('generation')
  const edit = preferredSupportedRoute('edit')

  if (chat) {
    const assignment = { providerId: chat.provider.id, model: chat.model }
    for (const task of ['text', 'vision', 'webdev', 'image-to-webdev'] as const) {
      bindings[task] = assignment
    }
  }
  if (preferredTextRoute) {
    bindings.text = {
      providerId: preferredTextRoute.provider.id,
      model: preferredTextRoute.model,
    }
  }
  if (generation) bindings['image-generation'] = generation.assignment
  if (edit) bindings['image-edit'] = edit.assignment
  return bindings
}

export async function configureAutomaticAi(
  candidates: readonly ProviderDiscoveryCandidate[],
  options: AutomaticAiSetupOptions = {},
): Promise<AutomaticAiSetupResult> {
  const configured: AutoConfiguredProvider[] = []
  const failures: string[] = []
  const pending = candidates
    .filter((candidate) => candidate.credential.available && candidate.credential.importable)
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) =>
      credentialAuthorityPriority(b.candidate) - credentialAuthorityPriority(a.candidate)
      || a.index - b.index)
    .map(({ candidate }) => candidate)
  let fallbackProbeAttempts = 0
  while (pending.length > 0) {
    const currentBindings = automaticBindingsFor(configured, options)
    const requiredCoverageReady = REQUIRED_AUTOMATIC_TASKS.every(
      (task) => currentBindings[task],
    )
    if (requiredCoverageReady) {
      if (fallbackProbeAttempts >= AUTOMATIC_FALLBACK_PROBE_LIMIT) break
      fallbackProbeAttempts += 1
    }
    const candidate = takeNextAutomaticCandidate(pending, requiredCoverageReady)
    if (!candidate) break
    try {
      configured.push(await autoConfigureProviderCandidate(candidate.id))
    } catch (error) {
      failures.push(aiDisplayErrorMessage(error))
    }
  }
  if (configured.length === 0) {
    throw new Error(failures[0] ?? 'No reusable local AI credential could be configured.')
  }
  const bindings = automaticBindingsFor(configured, options)
  for (const [task, assignment] of Object.entries(bindings) as [ModelTaskKind, ModelAssignment][]) {
    await setCapabilityBinding(task, assignment)
  }
  for (const { provider, models } of configured) {
    setProviderVerification(provider.id, {
      status: 'verified',
      model: provider.defaultModel,
      models,
      checkedAt: new Date().toISOString(),
    })
  }
  await setCapabilityDescriptors(automaticDescriptorsFor(configured))
  return { configured, bindings }
}

function automaticDescriptorsFor(
  configured: readonly AutoConfiguredProvider[],
) {
  return mergeModelDescriptors(configured.flatMap(({ provider, models, descriptors }) => [
    ...(descriptors ?? []),
    ...reviewedCatalogImageDescriptors(provider, models),
  ]))
}
