import {
  autoConfigureProviderCandidate,
  type AutoConfiguredProvider,
  type ProviderDiscoveryCandidate,
} from './provider-discovery'
import {
  setCapabilityBinding,
} from './model-assignment.local'
import type { ModelTaskKind } from './model-capabilities'
import type { ModelAssignment } from './model-assignment-types'
import { setProviderVerification } from './provider-verification'

const IMAGE_MODEL = /(?:^|[-_./])(?:gpt[-_.]?image|dall[-_.]?e|imagen|flux|sdxl?|stable[-_.]?diffusion|image[-_.]?(?:gen|edit))/i
const TEXT_MODEL = /(?:gpt|claude|gemini|qwen|deepseek|kimi|moonshot|mistral|llama|codex|chat)/i
const REQUIRED_AUTOMATIC_TASKS = [
  'text',
  'vision',
  'webdev',
  'image-to-webdev',
  'image-generation',
  'image-edit',
] as const satisfies readonly ModelTaskKind[]
const PREFERRED_IMAGE_MODELS = [
  'gpt-image-2',
  'imagen-3',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
  'gpt-image-1.5',
  'gpt-image-1',
] as const

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
  const chat = rows.find(({ provider, model }) =>
    model === provider.defaultModel && !IMAGE_MODEL.test(model))
    ?? rows.find(({ model }) => TEXT_MODEL.test(model) && !IMAGE_MODEL.test(model))
    ?? rows.find(({ model }) => !IMAGE_MODEL.test(model))
  const imageRows = rows.filter(({ model }) => IMAGE_MODEL.test(model))
  const image = PREFERRED_IMAGE_MODELS
    .map((preferred) => imageRows.find(({ model }) => model === preferred))
    .find((candidate) => candidate !== undefined)
    ?? imageRows[0]

  if (chat) {
    const assignment = { providerId: chat.provider.id, model: chat.model }
    for (const task of ['text', 'vision', 'webdev', 'image-to-webdev'] as const) {
      bindings[task] = assignment
    }
  }
  if (image) {
    const assignment = { providerId: image.provider.id, model: image.model }
    bindings['image-generation'] = assignment
    if (
      image.provider.kind === 'openai'
      || image.provider.kind === 'openai-compatible'
      || image.provider.kind === 'cc-switch'
    ) {
      bindings['image-edit'] = assignment
    }
  }
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
  return { configured, bindings }
}
