import type { CapabilityBindings, ModelTaskKind } from '@/services/ai/model-capabilities'
import type { PlanningRuntimeEvidence, StableRuntimeReason } from '@/services/ai/planning-runtime'
import { selectPlanningRuntime } from '@/services/ai/planning-runtime'
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

export type AiSetupQueryState = 'pending' | 'success' | 'error'
export type WorkflowAiCapability = 'planning' | 'image-generation' | 'image-edit'
export type CapabilityNextAction =
  | 'authorize-runtime'
  | 'install-runtime'
  | 'upgrade-runtime'
  | 'update-app'
  | 'verify-provider'
  | 'connect-provider'
  | 'configure-route'
  | 'retry'

export interface CapabilityReadinessRow {
  readonly capability: WorkflowAiCapability
  readonly status: 'checking' | 'ready' | 'action-required'
  readonly adapter?: {
    readonly id: string
    readonly label: string
    readonly kind: 'system-runtime' | 'direct-provider'
  }
  readonly evidence: {
    readonly installed: boolean
    readonly authenticated: boolean
    readonly capability: 'proven' | 'unsupported' | 'unknown'
    readonly execution: 'unproven' | 'succeeded' | 'failed' | 'stale'
  }
  readonly reason?: StableRuntimeReason | 'provider-required' | 'verification-required' | 'route-required' | 'configuration-unavailable'
  readonly nextAction?: CapabilityNextAction
}

export interface AiSetupProjection {
  readonly status: 'checking' | 'ready' | 'action-required'
  readonly rows: readonly CapabilityReadinessRow[]
  readonly verifiedProviders: readonly ProviderConfig[]
  readonly automaticCandidates: readonly ProviderDiscoveryCandidate[]
  readonly importableCandidates: readonly ProviderDiscoveryCandidate[]
}

export interface AiSetupProjectionInput {
  readonly runtimeState?: AiSetupQueryState
  readonly runtime?: PlanningRuntimeEvidence
  readonly providersState: AiSetupQueryState
  readonly providers?: readonly ProviderConfig[]
  readonly verifications: Readonly<Record<string, ProviderVerification>>
  readonly bindingsState: AiSetupQueryState
  readonly bindings?: CapabilityBindings
  readonly discoveryState: AiSetupQueryState
  readonly candidates?: readonly ProviderDiscoveryCandidate[]
}

export function setupDuringAutomaticRefresh(
  setup: AiSetupProjection,
  automaticBusy: boolean,
): AiSetupProjection {
  if (!automaticBusy || setup.status !== 'ready') return setup
  return {
    ...setup,
    status: 'checking',
    rows: setup.rows.map((row) => ({ ...row, status: 'checking' })),
  }
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

function runtimeAction(reason: StableRuntimeReason | undefined): CapabilityNextAction {
  switch (reason) {
    case 'authentication-required': return 'authorize-runtime'
    case 'not-installed': return 'install-runtime'
    case 'protocol-unsupported':
    case 'runtime-version-unsupported':
    case 'unsupported-platform':
    case 'executable-identity-rejected': return 'upgrade-runtime'
    case 'execution-adapter-unavailable': return 'update-app'
    case 'probe-failed':
    default: return 'retry'
  }
}

function directAssignment(
  bindings: CapabilityBindings | undefined,
  tasks: readonly ModelTaskKind[],
  providers: readonly ProviderConfig[],
  verifications: Readonly<Record<string, ProviderVerification>>,
) {
  for (const task of tasks) {
    const assignment = bindings?.bindings[task]
    if (!assignment) continue
    const provider = providers.find((item) => item.id === assignment.providerId && item.enabled)
    if (provider && providerVerificationIsVerified(verifications[provider.id], assignment.model)) {
      return { provider, assignment }
    }
  }
  return undefined
}

function directPlanningAssignment(
  bindings: CapabilityBindings | undefined,
  providers: readonly ProviderConfig[],
  verifications: Readonly<Record<string, ProviderVerification>>,
) {
  return directAssignment(
    bindings,
    ['text'],
    providers,
    verifications,
  )
}

function providerAction(
  providers: readonly ProviderConfig[],
  verifiedProviders: readonly ProviderConfig[],
): Pick<CapabilityReadinessRow, 'reason' | 'nextAction'> {
  if (providers.some((provider) => provider.enabled) && verifiedProviders.length === 0) {
    return { reason: 'verification-required', nextAction: 'verify-provider' }
  }
  if (verifiedProviders.length > 0) {
    return { reason: 'route-required', nextAction: 'configure-route' }
  }
  return { reason: 'provider-required', nextAction: 'connect-provider' }
}

export function projectAiSetup(input: AiSetupProjectionInput): AiSetupProjection {
  const providers = input.providers ?? []
  const verifiedProviders = providers.filter(
    (provider) => provider.enabled && providerVerificationIsVerified(input.verifications[provider.id]),
  )
  const automaticCandidates = (input.candidates ?? []).filter(
    (candidate) => candidate.credential.available
      && candidate.credential.importable,
  )
  const importableCandidates = automaticCandidates.filter(
    (candidate) => !providers.some(
      (provider) => discoveredCandidateMatchesProvider(candidate, provider),
    ),
  )

  const configurationPending = input.providersState === 'pending' || input.bindingsState === 'pending'
  const configurationFailed = input.providersState === 'error' || input.bindingsState === 'error'
  const coverage = configurationPending || configurationFailed
    ? undefined
    : modelRoutingCoverage(verifiedProviders, input.bindings, input.verifications)
  const covered = new Set(coverage?.covered.map((item) => item.task))

  const directPlanning = directPlanningAssignment(
    input.bindings,
    verifiedProviders,
    input.verifications,
  )
  const selectedPlanning = selectPlanningRuntime({
    codex: input.runtime,
    direct: directPlanning
      ? { providerId: directPlanning.provider.id, model: directPlanning.assignment.model }
      : undefined,
  })

  let planning: CapabilityReadinessRow
  if (configurationPending || (input.runtimeState ?? 'pending') === 'pending') {
    planning = {
      capability: 'planning',
      status: 'checking',
      evidence: { installed: false, authenticated: false, capability: 'unknown', execution: 'unproven' },
    }
  } else if (selectedPlanning?.runtimeId === 'codex-system') {
    planning = {
      capability: 'planning',
      status: 'ready',
      adapter: { id: 'codex-system', label: 'Codex', kind: 'system-runtime' },
      evidence: {
        installed: selectedPlanning.evidence.installed,
        authenticated: selectedPlanning.evidence.authenticated,
        capability: selectedPlanning.evidence.capability,
        execution: selectedPlanning.evidence.execution,
      },
    }
  } else if (selectedPlanning?.runtimeId === 'direct-provider' && directPlanning) {
    planning = {
      capability: 'planning',
      status: 'ready',
      adapter: {
        id: directPlanning.provider.id,
        label: `${directPlanning.provider.label} / ${directPlanning.assignment.model}`,
        kind: 'direct-provider',
      },
      evidence: { installed: true, authenticated: true, capability: 'proven', execution: 'unproven' },
    }
  } else {
    const reason = configurationFailed
      ? 'configuration-unavailable' as const
      : input.runtime?.reason ?? 'provider-required' as const
    planning = {
      capability: 'planning',
      status: 'action-required',
      evidence: input.runtime
        ? {
            installed: input.runtime.installed,
            authenticated: input.runtime.authenticated,
            capability: input.runtime.capability,
            execution: input.runtime.execution,
          }
        : { installed: false, authenticated: false, capability: 'unknown', execution: 'unproven' },
      reason,
      nextAction: reason === 'configuration-unavailable'
        ? 'retry'
        : reason === 'provider-required'
          ? 'connect-provider'
          : runtimeAction(reason),
    }
  }

  const imageRow = (capability: 'image-generation' | 'image-edit'): CapabilityReadinessRow => {
    if (configurationPending) {
      return {
        capability,
        status: 'checking',
        evidence: { installed: false, authenticated: false, capability: 'unknown', execution: 'unproven' },
      }
    }
    const assignment = input.bindings?.bindings[capability]
    const configuredProvider = assignment
      ? providers.find((provider) => provider.id === assignment.providerId && provider.enabled)
      : undefined
    const direct = directAssignment(input.bindings, [capability], verifiedProviders, input.verifications)
    if (!configurationFailed && covered.has(capability) && direct) {
      return {
        capability,
        status: 'ready',
        adapter: {
          id: direct.provider.id,
          label: `${direct.provider.label} / ${direct.assignment.model}`,
          kind: 'direct-provider',
        },
        evidence: { installed: true, authenticated: true, capability: 'proven', execution: 'unproven' },
      }
    }
    if (!configurationFailed && input.discoveryState === 'pending') {
      return {
        capability,
        status: 'checking',
        evidence: {
          installed: configuredProvider !== undefined,
          authenticated: configuredProvider !== undefined
            && providerVerificationIsVerified(
              input.verifications[configuredProvider.id],
              assignment?.model,
            ),
          capability: 'unknown',
          execution: 'unproven',
        },
      }
    }
    return {
      capability,
      status: 'action-required',
      evidence: {
        installed: configuredProvider !== undefined,
        authenticated: configuredProvider !== undefined
          && providerVerificationIsVerified(
            input.verifications[configuredProvider.id],
            assignment?.model,
          ),
        capability: 'unsupported',
        execution: 'unproven',
      },
      ...(configurationFailed
        ? { reason: 'configuration-unavailable' as const, nextAction: 'retry' as const }
        : providerAction(providers, verifiedProviders)),
    }
  }

  const rows = [planning, imageRow('image-generation'), imageRow('image-edit')] as const
  const status = rows.some((row) => row.status === 'checking')
    ? 'checking' as const
    : rows.every((row) => row.status === 'ready')
      ? 'ready' as const
      : 'action-required' as const
  return { status, rows, verifiedProviders, automaticCandidates, importableCandidates }
}
