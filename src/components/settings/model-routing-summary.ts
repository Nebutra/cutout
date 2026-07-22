import type { ProviderConfig } from '@/services/ai/provider-types'
import { createBuiltinProviderRegistry } from '@/services/ai/provider-registry'
import { modelTaskProfile, type CapabilityBindings } from '@/services/ai/model-capabilities'
import { MODEL_DIMENSIONS } from './model-dimensions'

/**
 * A dimension is covered when the user has explicitly bound a model to it. Auto
 * routing only maps a task to an adapter that statically declares the required
 * capability, so `openai-compatible`/gateway providers (whose adapters omit
 * `image-generation`/`image-edit`) never satisfy those dimensions on their own —
 * but an explicit binding to a connected, enabled provider is the user vouching
 * for that model, and the UI verifies model-level evidence at selection time.
 */
export function modelRoutingCoverage(providers:readonly ProviderConfig[],bindings?:CapabilityBindings){
  const registry=createBuiltinProviderRegistry()
  const capabilities=new Set(providers.flatMap(provider=>registry.adaptersFor(provider.kind).flatMap(adapter=>adapter.capabilities)))
  const enabledProviderIds=new Set(providers.filter(provider=>provider.enabled).map(provider=>provider.id))
  const boundTasks=new Set(Object.entries(bindings?.bindings??{}).filter(([,assignment])=>assignment?.model.trim()&&enabledProviderIds.has(assignment.providerId)).map(([task])=>task))
  const covered=MODEL_DIMENSIONS.filter(item=>boundTasks.has(item.task)||modelTaskProfile(item.task).required.every(value=>capabilities.has(value)))
  const missing=MODEL_DIMENSIONS.filter(item=>!covered.includes(item))
  return{covered,missing,total:MODEL_DIMENSIONS.length}
}
