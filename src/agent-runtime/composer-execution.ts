import type {
  ComposerModelPolicy,
  ComposerThinkingPolicy,
  ExecutionPolicyResult,
} from './execution-policy'
import { routeExecutionPolicy } from './execution-policy'
import type {
  ModelAssignment,
  ModelAssignments,
  SlotId,
} from '@/services/ai/model-assignment-types'
import { providerEligibleForAuto } from '@/services/ai/provider-verification'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ModelDescriptor, RoutePreferences } from './capability-router'

export interface LockedComposerRoute {
  readonly chat: ModelAssignment
  readonly image: ModelAssignment
  readonly chatPolicy: ExecutionPolicyResult
  readonly imagePolicy: ExecutionPolicyResult
}

export interface LockedComposerChatRoute {
  readonly chat: ModelAssignment
  readonly chatPolicy: ExecutionPolicyResult
}

export interface LockedComposerImageRoute {
  readonly image: ModelAssignment
  readonly imagePolicy: ExecutionPolicyResult
}

export function composerModelValue(policy: ComposerModelPolicy): string {
  if (policy.mode === 'auto') return 'auto'
  return fixedModelValue(policy.slot, policy.assignment)
}

export function fixedModelValue(
  slot: SlotId,
  assignment: ModelAssignment,
): string {
  return [slot, assignment.providerId, assignment.model].map(encodeURIComponent).join(':')
}

export function parseComposerModelValue(
  value: string,
  assignments: ModelAssignments,
): ComposerModelPolicy {
  if (value === 'auto') return { mode: 'auto' }
  const [rawSlot, rawProviderId, rawModel] = value.split(':')
  if (!rawSlot || !rawProviderId || !rawModel) return { mode: 'auto' }
  const slot = decodeURIComponent(rawSlot)
  if (slot !== 'chat' && slot !== 'image') return { mode: 'auto' }
  const assignment = assignments[slot]
  const providerId = decodeURIComponent(rawProviderId)
  const model = decodeURIComponent(rawModel)
  if (!assignment || assignment.providerId !== providerId || assignment.model !== model) {
    return { mode: 'auto' }
  }
  return { mode: 'fixed', slot, assignment }
}

export function lockComposerRoute(input: {
  readonly model: ComposerModelPolicy
  readonly thinking: ComposerThinkingPolicy
  readonly assignments: ModelAssignments
  readonly providers: readonly ProviderConfig[]
  readonly hasReferenceImages: boolean
  readonly modelCatalog?:readonly ModelDescriptor[]
  readonly routePreferences?:RoutePreferences
}): LockedComposerRoute {
  const chat = lockComposerChatRoute(input)
  const image = lockComposerImageRoute(input)
  return { ...chat, ...image }
}

export function lockComposerChatRoute(input: {
  readonly model: ComposerModelPolicy
  readonly thinking: ComposerThinkingPolicy
  readonly assignments: ModelAssignments
  readonly providers: readonly ProviderConfig[]
  readonly hasReferenceImages: boolean
  readonly modelCatalog?: readonly ModelDescriptor[]
  readonly routePreferences?: RoutePreferences
}): LockedComposerChatRoute {
  const modelCatalog=input.modelCatalog??runtimeModelDescriptors(input.assignments,input.providers)
  const chatPolicy = routeExecutionPolicy({
    model: input.model,
    thinking: input.thinking,
    task: { stage: 'plan', multimodal: input.hasReferenceImages, paidAction: 'none' },
    assignments: input.assignments,
    providers: input.providers,
    modelCatalog,
    routePreferences:input.routePreferences,
  })
  if (!chatPolicy.assignment || chatPolicy.status === 'blocked') {
    throw new Error(routeError('chat/vision', chatPolicy))
  }
  return {
    chat: { ...chatPolicy.assignment, effort: chatPolicy.reasoningEffort },
    chatPolicy,
  }
}

export function lockComposerImageRoute(input: {
  readonly model: ComposerModelPolicy
  readonly thinking: ComposerThinkingPolicy
  readonly assignments: ModelAssignments
  readonly providers: readonly ProviderConfig[]
  readonly hasReferenceImages: boolean
  readonly modelCatalog?: readonly ModelDescriptor[]
  readonly routePreferences?: RoutePreferences
}): LockedComposerImageRoute {
  const modelCatalog=input.modelCatalog??runtimeModelDescriptors(input.assignments,input.providers)
  const imagePolicy = routeExecutionPolicy({
    model: input.model,
    thinking: input.thinking,
    task: {
      stage: 'execute',
      multimodal: input.hasReferenceImages,
      paidAction: input.hasReferenceImages ? 'image-edit' : 'image-generation',
    },
    assignments: input.assignments,
    providers: input.providers,
    modelCatalog,
    routePreferences:input.routePreferences,
  })

  if (!imagePolicy.assignment || imagePolicy.status === 'blocked') {
    throw new Error(routeError('image', imagePolicy))
  }
  return {
    image: imagePolicy.assignment,
    imagePolicy,
  }
}

const runtimeCapabilities:Readonly<Record<string,readonly ModelDescriptor['capabilities'][number][]>>={openai:['text','vision','reasoning','tools','image-generation','image-edit'],anthropic:['text','vision','reasoning','tools'],google:['text','vision','reasoning','tools','image-generation'],gateway:['text','vision','reasoning','tools'],'openai-compatible':['text','vision','tools','image-generation','image-edit']}
export function runtimeModelDescriptors(assignments:ModelAssignments,providers:readonly ProviderConfig[],isVerified:(providerId:string)=>boolean=providerEligibleForAuto):ModelDescriptor[]{const rows:ModelDescriptor[]=[];for(const slot of ['chat','image'] as const){const assignment=assignments[slot];if(!assignment)continue;const provider=providers.find(value=>value.id===assignment.providerId),capabilities=provider?runtimeCapabilities[provider.kind]??[]:[],reasoningProtocol=provider?.kind==='openai'||provider?.kind==='anthropic'||provider?.kind==='google'?provider.kind:assignment.reasoningProtocol;rows.push({providerId:assignment.providerId,model:assignment.model,slot,capabilities,quality:.5,cost:.5,speed:.5,region:'global',available:Boolean(provider?.enabled&&isVerified(provider.id)),...(reasoningProtocol?{reasoningProtocol}:{})})}return rows}

export function supportsWebSearch(
  assignment: ModelAssignment,
  providers: readonly ProviderConfig[],
): boolean {
  const kind = providers.find(
    (provider) => provider.id === assignment.providerId && provider.enabled,
  )?.kind
  return kind === 'openai' || kind === 'anthropic' || kind === 'google'
}

export function composerRouteNotices(route: LockedComposerRoute): string[] {
  const notices: string[] = []
  if (route.chatPolicy.degradations.includes('thinking-provider-unsupported')) {
    notices.push(
      'The selected chat provider does not expose a reliable Thinking control. Provider default was used.',
    )
  }
  if (route.imagePolicy.degradations.includes('thinking-not-applicable-to-image')) {
    notices.push('Thinking level applies to chat work only and was not sent to the image model.')
  }
  if (
    route.chatPolicy.degradations.includes('fixed-model-incompatible') ||
    route.imagePolicy.degradations.includes('fixed-model-incompatible')
  ) {
    notices.push('The fixed model applies to one capability slot; Agent Router used the configured assignment for the other slot.')
  }
  return notices
}

function routeError(label: string, result: ExecutionPolicyResult): string {
  if (result.degradations.includes('assignment-missing')) {
    return `Configure a ${label} model before generating.`
  }
  return `The selected ${label} provider is unavailable. Check that it is enabled and verified in Settings.`
}
