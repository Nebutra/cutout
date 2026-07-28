import type { CapabilityBindings } from '@/services/ai/model-capabilities'
import type { ProviderDiscoveryCandidate } from '@/services/ai/provider-discovery'
import {
  defaultProviderWireProtocol,
  effectiveProviderWireProtocol,
  type ProviderConfig,
} from '@/services/ai/provider-types'
import {
  providerVerificationIsVerified,
  type ProviderVerification,
} from '@/services/ai/provider-verification'
import { modelRoutingCoverage } from './model-routing-summary'
import type { ModelDimension } from './model-dimensions'

export type AiSetupQueryState = 'pending' | 'success' | 'error'

export type AiSetupProjection =
  | { readonly status: 'checking' }
  | { readonly status: 'ready'; readonly verifiedProviders: readonly ProviderConfig[] }
  | { readonly status: 'needs-verification'; readonly providers: readonly ProviderConfig[] }
  | {
      readonly status: 'needs-capabilities'
      readonly verifiedProviders: readonly ProviderConfig[]
      readonly missing: readonly ModelDimension[]
    }
  | {
      readonly status: 'discovered-credentials'
      readonly candidates: readonly ProviderDiscoveryCandidate[]
    }
  | { readonly status: 'needs-provider' }
  | { readonly status: 'unavailable'; readonly reason: 'configuration' | 'discovery' }

export interface AiSetupProjectionInput {
  readonly providersState: AiSetupQueryState
  readonly providers?: readonly ProviderConfig[]
  readonly verifications: Readonly<Record<string, ProviderVerification>>
  readonly bindingsState: AiSetupQueryState
  readonly bindings?: CapabilityBindings
  readonly discoveryState: AiSetupQueryState
  readonly candidates?: readonly ProviderDiscoveryCandidate[]
}

function normalizedBaseUrl(value: string | undefined): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase()
  }
}

export function discoveredCandidateMatchesProvider(
  candidate: ProviderDiscoveryCandidate,
  provider: ProviderConfig,
): boolean {
  if (candidate.kind !== provider.kind) return false
  const candidateProtocol =
    candidate.wireProtocol ?? defaultProviderWireProtocol(candidate.kind)
  if (candidateProtocol !== effectiveProviderWireProtocol(provider)) return false
  return normalizedBaseUrl(candidate.baseUrl) === normalizedBaseUrl(provider.baseUrl)
}

export function projectAiSetup(input: AiSetupProjectionInput): AiSetupProjection {
  if (input.providersState === 'pending' || input.bindingsState === 'pending') {
    return { status: 'checking' }
  }
  if (input.providersState === 'error' || input.bindingsState === 'error') {
    return { status: 'unavailable', reason: 'configuration' }
  }

  const providers = input.providers ?? []
  const verifiedProviders = providers.filter(
    (provider) =>
      provider.enabled && providerVerificationIsVerified(input.verifications[provider.id]),
  )

  if (verifiedProviders.length > 0) {
    const coverage = modelRoutingCoverage(verifiedProviders, input.bindings)
    if (coverage.missing.length === 0) {
      return { status: 'ready', verifiedProviders }
    }
    return {
      status: 'needs-capabilities',
      verifiedProviders,
      missing: coverage.missing,
    }
  }

  const importableCandidates = (input.candidates ?? []).filter(
    (candidate) =>
      candidate.credential.available &&
      candidate.credential.importable &&
      !providers.some((provider) => discoveredCandidateMatchesProvider(candidate, provider)),
  )
  if (input.discoveryState === 'success' && importableCandidates.length > 0) {
    return { status: 'discovered-credentials', candidates: importableCandidates }
  }
  if (providers.length > 0) {
    return { status: 'needs-verification', providers }
  }
  if (input.discoveryState === 'pending') return { status: 'checking' }
  if (input.discoveryState === 'error') {
    return { status: 'unavailable', reason: 'discovery' }
  }
  return { status: 'needs-provider' }
}
