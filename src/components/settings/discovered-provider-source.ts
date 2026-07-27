import type { ProviderDiscoveryCandidate } from '@/services/ai/provider-discovery'

export type DiscoveredProviderSourceLabel =
  | { readonly kind: 'environment' }
  | { readonly kind: 'cutout-keychain' }
  | { readonly kind: 'agent'; readonly label: string }

export function discoveredProviderSourceLabel(
  candidate: Pick<ProviderDiscoveryCandidate, 'source' | 'sourceLabel'>,
): DiscoveredProviderSourceLabel {
  if (candidate.source === 'environment') return { kind: 'environment' }
  if (candidate.source === 'cutout-keychain') return { kind: 'cutout-keychain' }
  return { kind: 'agent', label: candidate.sourceLabel }
}
