/**
 * Which Qwen Image 3 model a DashScope connection can serve.
 *
 * The native game-asset and game-map bridges accept exactly two model ids. A
 * connection no longer names a model, so eligibility is read from its probed
 * catalog (layer 2) instead of a per-provider default. When a connection
 * advertises both, `-pro` wins — it is the higher-fidelity route, matching the
 * ordering in `image-route-assessment.ts`.
 */
import {
  providerCatalogModels,
  type ProviderConfig,
} from '@/services/ai/provider-types'

export type QwenImage3Model = 'qwen-image-3.0-pro' | 'qwen-image-3.0'

/** Highest-fidelity first, so `find` picks the better route. */
const PREFERRED: readonly QwenImage3Model[] = ['qwen-image-3.0-pro', 'qwen-image-3.0']

export function qwenImage3Route(
  provider: Pick<ProviderConfig, 'catalog'> | undefined,
): QwenImage3Model | undefined {
  const advertised = new Set(providerCatalogModels(provider))
  return PREFERRED.find((model) => advertised.has(model))
}

export function servesQwenImage3(
  provider: Pick<ProviderConfig, 'catalog'> | undefined,
): boolean {
  return qwenImage3Route(provider) !== undefined
}
