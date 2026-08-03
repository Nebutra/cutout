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
  reviewedCatalogImageDescriptors,
} from './image-route-assessment'
import { mergeModelDescriptors } from './model-catalog'

const TEXT_MODEL = /(?:gpt|claude|gemini|qwen|deepseek|kimi|moonshot|mistral|llama|codex|chat)/i
const REQUIRED_AUTOMATIC_TASKS = [
  'text',
  'vision',
  'webdev',
  'image-to-webdev',
  'image-generation',
  'image-edit',
] as const satisfies readonly ModelTaskKind[]

export interface AutomaticAiSetupResult {
  readonly configured: readonly AutoConfiguredProvider[]
  readonly bindings: Readonly<Partial<Record<ModelTaskKind, ModelAssignment>>>
}

export function automaticBindingsFor(
  configured: readonly AutoConfiguredProvider[],
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
  const rankRoutes = (left: typeof assessed[number], right: typeof assessed[number]) =>
    imageRouteRecommendationRank(right.assignment.model)
    - imageRouteRecommendationRank(left.assignment.model)
  const generation = assessed
    .filter((route) => route.generation.supported)
    .sort(rankRoutes)[0]
  const edit = assessed
    .filter((route) => route.edit.supported)
    .sort(rankRoutes)[0]

  if (chat) {
    const assignment = { providerId: chat.provider.id, model: chat.model }
    for (const task of ['text', 'vision', 'webdev', 'image-to-webdev'] as const) {
      bindings[task] = assignment
    }
  }
  if (generation) bindings['image-generation'] = generation.assignment
  if (edit) bindings['image-edit'] = edit.assignment
  return bindings
}

export async function configureAutomaticAi(
  candidates: readonly ProviderDiscoveryCandidate[],
): Promise<AutomaticAiSetupResult> {
  const configured: AutoConfiguredProvider[] = []
  const failures: string[] = []
  for (const candidate of candidates) {
    if (!candidate.credential.available || !candidate.credential.importable) continue
    try {
      configured.push(await autoConfigureProviderCandidate(candidate.id))
      const bindings = automaticBindingsFor(configured)
      if (REQUIRED_AUTOMATIC_TASKS.every((task) => bindings[task])) break
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (configured.length === 0) {
    throw new Error(failures[0] ?? 'No reusable local AI credential could be configured.')
  }
  const bindings = automaticBindingsFor(configured)
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
