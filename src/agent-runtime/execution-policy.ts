import type {
  ModelAssignment,
  ModelAssignments,
  SlotId,
} from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import { routeByCapabilities, type ModelCapability, type ModelDescriptor, type ModelRouteReceipt, type RoutePreferences } from './capability-router'

export type AgentTaskStage =
  | 'understand'
  | 'research'
  | 'plan'
  | 'execute'
  | 'name'
  | 'review'
  | 'deliver'

export type PaidAction = 'none' | 'image-generation' | 'image-edit'

export interface AgentTaskContext {
  readonly stage: AgentTaskStage
  readonly multimodal: boolean
  readonly paidAction: PaidAction
  readonly workload?: 'general'|'webdev'|'image-to-webdev'
  readonly effortSignals?: {
    readonly complexity?: number
    readonly ambiguity?: number
    readonly dagDepth?: number
    readonly risk?: 'low' | 'medium' | 'high'
    readonly retryCount?: number
    readonly budgetPressure?: number
  }
}

export type ComposerModelPolicy =
  | { readonly mode: 'auto' }
  | {
      readonly mode: 'fixed'
      readonly slot: SlotId
      readonly assignment: ModelAssignment
    }

export type ComposerThinkingPolicy =
  | 'auto'
  | 'provider-default'
  | ReasoningEffort

export type ExecutionPolicyDegradation =
  | 'assignment-missing'
  | 'provider-unavailable'
  | 'fixed-model-incompatible'
  | 'thinking-not-applicable-to-image'
  | 'thinking-provider-unsupported'

export type ExecutionPolicyRationale =
  | ExecutionPolicyDegradation
  | 'auto-route-chat'
  | 'auto-route-image'
  | 'fixed-model-selected'
  | 'provider-default-thinking'
  | `auto-thinking-${ReasoningEffort}`

export interface ExecutionPolicyInput {
  readonly model: ComposerModelPolicy
  readonly thinking: ComposerThinkingPolicy
  readonly task: AgentTaskContext
  readonly assignments: ModelAssignments
  readonly providers: readonly ProviderConfig[]
  readonly modelCatalog?: readonly ModelDescriptor[]
  readonly routePreferences?: RoutePreferences
}

export interface ExecutionPolicyResult {
  readonly status: 'ready' | 'degraded' | 'blocked'
  readonly slot: SlotId
  readonly assignment?: ModelAssignment
  readonly requestedModel: ComposerModelPolicy
  readonly modelSupported: boolean
  readonly requestedThinking: ComposerThinkingPolicy
  readonly thinkingSupport: 'supported' | 'not-applicable' | 'unsupported'
  readonly reasoningEffort?: ReasoningEffort
  readonly degradations: readonly ExecutionPolicyDegradation[]
  readonly rationaleCodes: readonly ExecutionPolicyRationale[]
  readonly routeReceipt?: ModelRouteReceipt
  readonly effortReceipt?: NonNullable<ModelRouteReceipt['effort']>
}

/**
 * Resolve a Composer choice into capabilities the current backend actually has.
 * This function does not execute work and never infers support from a model slug.
 */
export function routeExecutionPolicy(
  input: ExecutionPolicyInput,
): ExecutionPolicyResult {
  const requiredSlot = requiredSlotFor(input.task)
  const degradations: ExecutionPolicyDegradation[] = []
  const rationaleCodes: ExecutionPolicyRationale[] = []
  let slot = requiredSlot
  let assignment: ModelAssignment | undefined
  let routeReceipt:ModelRouteReceipt|undefined

  if (input.model.mode === 'fixed' && input.model.slot === requiredSlot) {
    slot = input.model.slot
    assignment = input.model.assignment
    rationaleCodes.push('fixed-model-selected')
  } else {
    if (input.model.mode === 'fixed') {
      degradations.push('fixed-model-incompatible')
      rationaleCodes.push('fixed-model-incompatible')
    }
    assignment = input.assignments[requiredSlot]
    rationaleCodes.push(
      requiredSlot === 'chat' ? 'auto-route-chat' : 'auto-route-image',
    )
  }

  const exactFixedSelection =
    input.model.mode === 'fixed' && input.model.slot === requiredSlot
  if(input.modelCatalog && !exactFixedSelection){const configured=assignment,capabilities=capabilitiesFor(input.task),enabledProviders=new Set(input.providers.filter(provider=>provider.enabled).map(provider=>provider.id)),routed=routeByCapabilities({slot,descriptors:input.modelCatalog.map(descriptor=>({...descriptor,available:descriptor.available!==false&&enabledProviders.has(descriptor.providerId)})),requiredCapabilities:capabilities.required,preferredCapabilities:capabilities.preferred,preferences:input.routePreferences,preferredAssignment:assignment});assignment=routed.assignment;routeReceipt=routed.receipt
    if(!assignment&&configured){
      // A slot IS configured but every catalog candidate was rejected
      // (unverified provider, capability/region mismatch). Reporting
      // assignment-missing here would tell the user to configure a model
      // they already configured.
      degradations.push('provider-unavailable')
      rationaleCodes.push('provider-unavailable')
      return blocked(input, slot, degradations, rationaleCodes, configured, routeReceipt)
    }}

  if (!assignment) {
    degradations.push('assignment-missing')
    rationaleCodes.push('assignment-missing')
    return blocked(input, slot, degradations, rationaleCodes,undefined,routeReceipt)
  }

  const provider = input.providers.find(
    (candidate) => candidate.id === assignment.providerId && candidate.enabled,
  )
  if (!provider) {
    degradations.push('provider-unavailable')
    rationaleCodes.push('provider-unavailable')
    return blocked(input, slot, degradations, rationaleCodes, assignment)
  }

  let reasoningEffort: ReasoningEffort | undefined
  let effortReceipt: NonNullable<ModelRouteReceipt['effort']> | undefined
  let thinkingSupport: ExecutionPolicyResult['thinkingSupport'] = 'supported'
  if (slot === 'image') {
    thinkingSupport = 'not-applicable'
    if (input.thinking !== 'auto' && input.thinking !== 'provider-default') {
      degradations.push('thinking-not-applicable-to-image')
      rationaleCodes.push('thinking-not-applicable-to-image')
    }
  } else if (input.thinking === 'provider-default') {
    rationaleCodes.push('provider-default-thinking')
    effortReceipt = effortDecision(input.task, input.thinking)
  } else {
    const decision = effortDecision(input.task, input.thinking)
    const requested = decision.selected!
    if (supportsReasoningControl(provider, assignment, input.modelCatalog)) {
      reasoningEffort = requested
      effortReceipt = decision
      if (input.thinking === 'auto') {
        rationaleCodes.push(`auto-thinking-${requested}`)
      }
    } else {
      degradations.push('thinking-provider-unsupported')
      rationaleCodes.push('thinking-provider-unsupported')
      thinkingSupport = 'unsupported'
      effortReceipt = { ...decision, selected: undefined }
    }
  }

  const receiptedRoute = routeReceipt && effortReceipt ? { ...routeReceipt, effort: effortReceipt } : routeReceipt

  return {
    status: degradations.length > 0 ? 'degraded' : 'ready',
    slot,
    assignment,
    requestedModel: input.model,
    modelSupported: true,
    requestedThinking: input.thinking,
    thinkingSupport,
    reasoningEffort,
    effortReceipt,
    degradations,
    rationaleCodes,
    ...(receiptedRoute?{routeReceipt:receiptedRoute}:{}),
  }
}

function capabilitiesFor(task:AgentTaskContext):{required:ModelCapability[];preferred:ModelCapability[]}{if(task.paidAction==='image-generation')return{required:['image-generation'],preferred:[]};if(task.paidAction==='image-edit')return{required:['image-edit'],preferred:[]};if(task.workload==='image-to-webdev')return{required:['text','tools','vision'],preferred:[]};if(task.workload==='webdev')return{required:['text','tools'],preferred:['vision']};if(task.multimodal)return{required:['text','vision'],preferred:[]};return{required:['text'],preferred:task.stage==='plan'||task.stage==='review'?['reasoning']:[]}}

function requiredSlotFor(task: AgentTaskContext): SlotId {
  if (
    task.paidAction === 'image-generation' ||
    task.paidAction === 'image-edit'
  ) {
    return 'image'
  }
  return 'chat'
}

function effortDecision(task: AgentTaskContext, requested: ComposerThinkingPolicy): NonNullable<ModelRouteReceipt['effort']> {
  const signals = task.effortSignals ?? {}, stageBase: Record<AgentTaskStage, number> = { understand: task.multimodal ? .25 : .1, research: .25, plan: .3, execute: .2, name: .08, review: .3, deliver: .05 }
  const bounded = (value = 0) => Math.max(0, Math.min(1, value)), risk = signals.risk === 'high' ? 1 : signals.risk === 'medium' ? .5 : 0
  const score = Number(Math.max(0, Math.min(1, stageBase[task.stage] + bounded(signals.complexity) * .25 + bounded(signals.ambiguity) * .15 + Math.min(1, Math.max(0, signals.dagDepth ?? 0) / 8) * .15 + risk * .2 + Math.min(1, Math.max(0, signals.retryCount ?? 0) / 2) * .15 - bounded(signals.budgetPressure) * .15)).toFixed(3))
  const automatic: ReasoningEffort = score >= .68 ? 'high' : score >= .25 ? 'medium' : 'low'
  const selected = requested === 'auto' ? automatic : requested === 'provider-default' ? undefined : requested
  return { protocol: 'cutout.effort-decision.v1', requested, selected, score, manualOverride: requested !== 'auto' && requested !== 'provider-default', signals: { stage: task.stage, multimodal: String(task.multimodal), complexity: bounded(signals.complexity), ambiguity: bounded(signals.ambiguity), dagDepth: Math.max(0, signals.dagDepth ?? 0), risk: signals.risk ?? 'low', retryCount: Math.max(0, signals.retryCount ?? 0), budgetPressure: bounded(signals.budgetPressure) } }
}

function supportsReasoningControl(provider: ProviderConfig, assignment: ModelAssignment, catalog?: readonly ModelDescriptor[]): boolean {
  if (provider.kind === 'openai' || provider.kind === 'anthropic' || provider.kind === 'google') return true
  if (!assignment.reasoningProtocol || !catalog) return false
  return catalog.some((descriptor) => descriptor.providerId === assignment.providerId && descriptor.model === assignment.model && descriptor.available !== false && descriptor.capabilities.includes('reasoning') && descriptor.reasoningProtocol === assignment.reasoningProtocol)
}

function blocked(
  input: ExecutionPolicyInput,
  slot: SlotId,
  degradations: readonly ExecutionPolicyDegradation[],
  rationaleCodes: readonly ExecutionPolicyRationale[],
  assignment?: ModelAssignment,
  routeReceipt?:ModelRouteReceipt,
): ExecutionPolicyResult {
  return {
    status: 'blocked',
    slot,
    assignment,
    requestedModel: input.model,
    modelSupported: false,
    requestedThinking: input.thinking,
    thinkingSupport: slot === 'image' ? 'not-applicable' : 'unsupported',
    reasoningEffort: undefined,
    degradations,
    rationaleCodes,
    ...(routeReceipt?{routeReceipt}:{}),
  }
}
