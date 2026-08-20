import {
  autoConfigureProviderCandidate,
  type AutoConfiguredProvider,
  type ProviderDiscoveryCandidate,
} from './provider-discovery'
import {
  setAutomaticCapabilityBindings,
} from './model-assignment.local'
import type { ModelTaskKind } from './model-capabilities'
import type { ModelAssignment } from './model-assignment-types'
import { setProviderVerification } from './provider-verification'
import {
  assessImageRoute,
  exactImageRouteDescriptor,
  isImageModelNominationCandidate,
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

export interface AutomaticTextRoutePreference {
  readonly kind: ProviderKind
  readonly model: string
}

export interface AutomaticAiSetupOptions {
  readonly preferredTextRoutes?: readonly AutomaticTextRoutePreference[]
}

function hasPreferredTextRoute(
  bindings: Readonly<Partial<Record<ModelTaskKind, ModelAssignment>>>,
  options: AutomaticAiSetupOptions,
): boolean {
  return options.preferredTextRoutes?.some((preference) => (
    bindings.text?.model === preference.model
  )) ?? false
}

function credentialAuthorityPriority(candidate: ProviderDiscoveryCandidate): number {
  // Cutout-owned Provider metadata carries the exact persisted wire protocol
  // for its matching Keychain credential. Agent configs remain reusable, but
  // must not shadow that more specific authority for automatic setup.
  return candidate.source === 'cutout-keychain' ? 1 : 0
}

function takeNextAutomaticCandidate(
  pending: ProviderDiscoveryCandidate[],
): ProviderDiscoveryCandidate | undefined {
  return pending.shift()
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
  const chat = rows.find(({ provider, model }) => TEXT_MODEL.test(model) && !isImageModelNominationCandidate(model) && !hasImageCapability(provider.id, model))
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
  ) => sortImageRouteRecommendations(
    assessed
      .filter((route) => route[operation].supported)
      .map((route) => ({ ...route, model: route.assignment.model })),
    'refinement',
  )[0]
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
  while (pending.length > 0) {
    const currentBindings = automaticBindingsFor(configured, options)
    const requiredCoverageReady = REQUIRED_AUTOMATIC_TASKS.every(
      (task) => currentBindings[task],
    )
    if (requiredCoverageReady && hasPreferredTextRoute(currentBindings, options)) break
    if (requiredCoverageReady && !options.preferredTextRoutes?.length) break
    const candidate = takeNextAutomaticCandidate(pending)
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
  await setAutomaticCapabilityBindings(bindings, automaticDescriptorsFor(configured))
  for (const { provider } of configured) {
    setProviderVerification(provider.id, {
      status: 'verified',
      checkedAt: new Date().toISOString(),
    })
  }
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
