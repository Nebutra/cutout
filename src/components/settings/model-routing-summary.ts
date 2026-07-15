import type { ProviderConfig } from '@/services/ai/provider-types'
import { createBuiltinProviderRegistry } from '@/services/ai/provider-registry'
import { modelTaskProfile } from '@/services/ai/model-capabilities'
import { MODEL_DIMENSIONS } from './model-dimensions'

export function modelRoutingCoverage(providers:readonly ProviderConfig[]){
  const registry=createBuiltinProviderRegistry()
  const capabilities=new Set(providers.flatMap(provider=>registry.adaptersFor(provider.kind).flatMap(adapter=>adapter.capabilities)))
  const covered=MODEL_DIMENSIONS.filter(item=>modelTaskProfile(item.task).required.every(value=>capabilities.has(value)))
  const missing=MODEL_DIMENSIONS.filter(item=>!covered.includes(item))
  return{covered,missing,total:MODEL_DIMENSIONS.length}
}
