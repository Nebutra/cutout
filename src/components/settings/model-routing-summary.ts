import type { ProviderConfig } from '@/services/ai/provider-types'
import { createBuiltinProviderRegistry } from '@/services/ai/provider-registry'
import { modelTaskProfile, type CapabilityBindings } from '@/services/ai/model-capabilities'
import {
  assessImageRoute,
  exactImageRouteDescriptor,
} from '@/services/ai/image-route-assessment'
import {
  providerVerificationIsVerified,
  type ProviderVerification,
} from '@/services/ai/provider-verification'
import { MODEL_DIMENSIONS } from './model-dimensions'

/**
 * A dimension is covered when the user has explicitly bound a model to it. Auto
 * routing only maps a task to an adapter that statically declares the required
 * capability, so `openai-compatible`/gateway providers (whose adapters omit
 * `image-generation`/`image-edit`) never satisfy those dimensions on their own —
 * but an explicit binding to a connected, enabled provider is the user vouching
 * for that model, and the UI verifies model-level evidence at selection time.
 */
export function modelRoutingCoverage(
  providers: readonly ProviderConfig[],
  bindings?: CapabilityBindings,
  verifications: Readonly<Record<string, ProviderVerification>> = {},
) {
  const registry=createBuiltinProviderRegistry()
  const enabledProviders=providers.filter(provider=>provider.enabled)
  const providerById = new Map(enabledProviders.map((provider) => [provider.id, provider]))
  const isVerifiedRoute = (providerId: string, model: string) =>
    providerById.has(providerId)
      && providerVerificationIsVerified(verifications[providerId], model)
  const covered=MODEL_DIMENSIONS.filter((item) => {
    const direct = bindings?.bindings[item.task]
    if (direct?.model.trim()) {
      const provider = providerById.get(direct.providerId)
      if (provider && (item.task === 'image-generation' || item.task === 'image-edit')) {
        const assessment = assessImageRoute({
          assignment: direct,
          provider,
          descriptor: exactImageRouteDescriptor(bindings?.descriptors ?? [], direct),
        })
        return item.task === 'image-edit'
          ? assessment.edit.supported
          : assessment.generation.supported
      }
      if (isVerifiedRoute(direct.providerId, direct.model)) return true
    }
    const fallbackTask = item.task === 'webdev'
      ? 'text'
      : item.task === 'image-to-webdev'
        ? 'vision'
        : undefined
    const fallback = fallbackTask ? bindings?.bindings[fallbackTask] : undefined
    if (!fallback?.model.trim() || !isVerifiedRoute(fallback.providerId, fallback.model)) return false
    const provider = providerById.get(fallback.providerId)
    if (!provider) return false
    const capabilities = new Set(
      registry.adaptersFor(provider.kind).flatMap((adapter) => adapter.capabilities),
    )
    return modelTaskProfile(item.task).required.every((capability) => capabilities.has(capability))
  })
  const missing=MODEL_DIMENSIONS.filter(item=>!covered.includes(item))
  return{covered,missing,total:MODEL_DIMENSIONS.length}
}
