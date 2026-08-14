import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ProviderDefinition } from '@/services/ai/provider-registry'
import {
  discoverProviderCandidates,
  type ProviderDiscoveryCandidate,
} from '@/services/ai/provider-discovery'
import { configureAutomaticAi } from '@/services/ai/automatic-ai-setup'
import { aiDisplayErrorMessage } from '@/services/ai/display-error-message'
import {
  probeCodexSystemRuntime,
  type PlanningRuntimeEvidence,
} from '@/services/ai/planning-runtime'
import {
  ensureProviderVerification,
  providerVerificationIsVerified,
} from '@/services/ai/provider-verification'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import {
  useProviderVerifications,
  useProviders,
} from '@/hooks/queries/providers'
import { aiSettingsKeys, useCapabilityBindings } from '@/hooks/queries/ai-settings'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProviderRow } from '../ProviderRow'
import { ProviderForm } from '../ProviderForm'
import { ModelSlot } from '../ModelSlot'
import { MODEL_DIMENSIONS } from '../model-dimensions'
import { VectorizerPanel } from '../VectorizerPanel'
import { ProviderDirectory } from '../ProviderDirectory'
import {
  projectAiSetup,
  setupDuringAutomaticRefresh,
  type AiSetupProjection,
  type AiSetupQueryState,
} from '../ai-setup-projection'

type View =
  | { readonly mode: 'list' }
  | {
      readonly mode: 'add'
      readonly definition?: ProviderDefinition
      readonly discovered?: ProviderDiscoveryCandidate
    }
  | { readonly mode: 'edit'; readonly provider: ProviderConfig }

function queryState(query: { readonly isPending: boolean; readonly isError: boolean }): AiSetupQueryState {
  if (query.isPending) return 'pending'
  return query.isError ? 'error' : 'success'
}

export function AiSection() {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [advanced, setAdvanced] = useState(false)
  const [automaticBusy, setAutomaticBusy] = useState(false)
  const [automaticError, setAutomaticError] = useState<string>()
  const automaticAttempt = useRef('')
  const verificationAttempt = useRef('')
  const queryClient = useQueryClient()
  const { providers: providerService } = useServices()
  const providers = useProviders()
  const bindings = useCapabilityBindings()
  const discovery = useQuery({
    queryKey: ['provider-discovery'],
    queryFn: discoverProviderCandidates,
    retry: false,
  })
  const planningRuntime = useQuery({
    queryKey: ['planning-runtime', 'codex-system'],
    queryFn: probeCodexSystemRuntime,
    retry: false,
  })
  const verifications = useProviderVerifications()
  const list = useMemo(() => providers.data ?? [], [providers.data])
  const setup = projectAiSetup({
    runtimeState: queryState(planningRuntime),
    runtime: planningRuntime.data,
    providersState: queryState(providers),
    providers: providers.data,
    verifications,
    bindingsState: queryState(bindings),
    bindings: bindings.data,
    discoveryState: queryState(discovery),
    candidates: discovery.data,
  })

  const runAutomaticSetup = useCallback(async (
    candidates: readonly ProviderDiscoveryCandidate[],
  ) => {
    if (automaticBusy) return
    setAutomaticBusy(true)
    setAutomaticError(undefined)
    try {
      await configureAutomaticAi(candidates)
      await Promise.all([
        providers.refetch(),
        discovery.refetch(),
        queryClient.refetchQueries({
          queryKey: aiSettingsKeys.capabilityBindings(),
          exact: true,
          type: 'all',
        }),
        queryClient.refetchQueries({
          queryKey: aiSettingsKeys.assignments(),
          exact: true,
          type: 'all',
        }),
      ])
    } catch (error) {
      setAutomaticError(aiDisplayErrorMessage(error))
    } finally {
      setAutomaticBusy(false)
    }
  }, [automaticBusy, discovery, providers, queryClient])

  useEffect(() => {
    if (setup.status === 'ready') return
    const key = setup.automaticCandidates.map((candidate) => candidate.id).sort().join(':')
    if (!key || automaticAttempt.current === key) return
    automaticAttempt.current = key
    void runAutomaticSetup(setup.automaticCandidates)
  }, [runAutomaticSetup, setup])

  useEffect(() => {
    const enabled = new Set(list.filter((provider) => provider.enabled).map((provider) => provider.id))
    const unresolved = [...new Map(
      Object.values(bindings.data?.bindings ?? {})
        .filter((assignment) => assignment && enabled.has(assignment.providerId))
        .map((assignment) => [`${assignment!.providerId}:${assignment!.model}`, assignment!] as const),
    ).values()].filter((assignment) =>
      !providerVerificationIsVerified(verifications[assignment.providerId], assignment.model),
    )
    const key = unresolved.map((assignment) => `${assignment.providerId}:${assignment.model}`).sort().join('|')
    if (!key || verificationAttempt.current === key) return
    verificationAttempt.current = key
    setAutomaticBusy(true)
    setAutomaticError(undefined)
    void Promise.all(unresolved.map(async (assignment) => {
      const status = await ensureProviderVerification(assignment.providerId, async () => {
        const result = await providerService.test(assignment.providerId)
        if (isErr(result)) throw new Error(result.error)
        return result.data
      }, undefined, assignment.model)
      if (status !== 'verified') {
        throw new Error(`The authenticated provider catalog does not include ${assignment.model}.`)
      }
    })).catch((error: unknown) => {
      setAutomaticError(aiDisplayErrorMessage(error))
    }).finally(() => setAutomaticBusy(false))
  }, [bindings.data?.bindings, list, providerService, verifications])

  if (view.mode !== 'list') {
    if (view.mode === 'add' && !view.definition && !view.discovered) {
      return (
        <div data-provider-connect-layout className="flex min-h-full min-w-0 flex-col">
          <div className="shrink-0 pb-3">
            <h2 className="text-sm font-medium">
              <Trans id="settings.connect_a_provider">Connect a provider</Trans>
            </h2>
            <p className="mt-0.5 max-w-prose break-words text-xs text-muted-foreground">
              <Trans id="settings.choose_catalog_definition">
                Choose a catalog definition. Auto routing remains the default after connection.
              </Trans>
            </p>
          </div>
          <ProviderDirectory onSelect={(definition) => setView({ mode: 'add', definition })} />
          <div className="sticky bottom-0 z-10 mt-3 shrink-0 border-t border-border bg-popover pt-3">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setView({ mode: 'list' })}>
              <Trans id="settings.cancel">Cancel</Trans>
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">
            {view.mode === 'add' ? (
              <Trans id="settings.add_provider">Add provider</Trans>
            ) : (
              <Trans id="settings.dialog_edit_title">Edit provider</Trans>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Trans id="settings.dialog_form_desc">
              Keys are stored locally on this device and injected natively, never sent to the web page.
            </Trans>
          </p>
        </div>
        <ProviderForm
          initial={view.mode === 'edit' ? view.provider : undefined}
          initialKind={view.mode === 'add' ? view.definition?.id : undefined}
          discovered={view.mode === 'add' ? view.discovered : undefined}
          onDone={() => setView({ mode: 'list' })}
        />
      </div>
    )
  }

  const retry = () => {
    verificationAttempt.current = ''
    void providers.refetch()
    void bindings.refetch()
    void discovery.refetch()
    void planningRuntime.refetch()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AiSetupOverview
        setup={setupDuringAutomaticRefresh(setup, automaticBusy)}
        onConnect={() => setView({ mode: 'add' })}
        onManage={() => setAdvanced(true)}
        onRetry={retry}
        automaticBusy={automaticBusy}
        automaticError={automaticError}
      />

      <details
        className="group border-t border-border pt-3"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="size-4" />
              <Trans id="settings.advanced_ai_management">Advanced AI management</Trans>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              <Trans id="settings.advanced_ai_management_description">
                Providers, manual model bindings and SVG export.
              </Trans>
            </span>
          </span>
          <ChevronDown className="mt-0.5 size-4 text-muted-foreground group-open:rotate-180" aria-hidden />
        </summary>

        {advanced ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-start gap-2 border-y border-border py-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              <Trans id="settings.keychain_trust">
                API keys are stored locally on this device and injected in the native layer - they never enter the web page.
              </Trans>
            </div>

            <PlanningRuntimeDiagnostics
              evidence={planningRuntime.data}
              checking={planningRuntime.isPending}
            />

            <section className="flex flex-col gap-2" aria-labelledby="configured-providers-heading">
              <h3 id="configured-providers-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Trans id="settings.configured_providers">Configured providers</Trans>
              </h3>
              {providers.isLoading ? (
                <Skeleton className="h-14 w-full rounded-md" />
              ) : providers.isError ? (
                <p className="border-y border-destructive/30 py-4 text-center text-sm text-destructive">
                  <Trans id="settings.load_failed">Failed to load providers</Trans>
                </p>
              ) : list.length === 0 ? (
                <p className="border-y border-border py-4 text-center text-xs text-muted-foreground">
                  <Trans id="settings.empty_title">No providers configured yet</Trans>
                </p>
              ) : (
                list.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    onEdit={(providerToEdit) => setView({ mode: 'edit', provider: providerToEdit })}
                  />
                ))
              )}
              <Button variant="outline" className="w-full" onClick={() => setView({ mode: 'add' })}>
                <Plus />
                <Trans id="settings.add_provider">Add provider</Trans>
              </Button>
            </section>

            <AdvancedModelAssignments />
            <VectorizerPanel />
          </div>
        ) : null}
      </details>
    </div>
  )
}

export function AiSetupOverview({
  setup,
  onConnect,
  onManage,
  onRetry,
  automaticBusy = false,
  automaticError,
}: {
  readonly setup: AiSetupProjection
  readonly onConnect: () => void
  readonly onManage: () => void
  readonly onRetry: () => void
  readonly automaticBusy?: boolean
  readonly automaticError?: string
}) {
  const { t } = useLingui()
  const capabilityLabels = {
    planning: t({ id: 'settings.capability_planning', message: 'Planning and conversation' }),
    'image-generation': t({ id: 'settings.dimension_image_generation_label', message: 'Image generation' }),
    'image-edit': t({ id: 'settings.dimension_image_edit_label', message: 'Image editing' }),
  }
  const title = setup.status === 'ready'
    ? t({ id: 'settings.ai_ready', message: 'AI ready' })
    : setup.status === 'checking'
      ? t({ id: 'settings.ai_setup_checking', message: 'Checking AI setup' })
      : t({ id: 'settings.action_required', message: 'Action required' })
  const description = setup.status === 'ready'
    ? t({ id: 'settings.ai_ready_description', message: 'Planning and image routes are available on this device.' })
    : setup.status === 'checking'
      ? t({ id: 'settings.ai_setup_checking_description', message: 'Checking planning and image capabilities on this device.' })
      : t({ id: 'settings.action_required_description', message: 'Complete the missing capability actions below.' })
  const rowDescription = (row: AiSetupProjection['rows'][number]) => {
    if (row.status === 'checking') return t({ id: 'settings.capability_checking', message: 'Checking availability' })
    if (row.status === 'ready') {
      return row.evidence.execution === 'succeeded'
        ? t({ id: 'settings.execution_confirmed', message: 'Execution confirmed' })
        : t({ id: 'settings.ready_for_first_use', message: 'Ready for first use' })
    }
    switch (row.nextAction) {
      case 'authorize-runtime': return t({ id: 'settings.authorize_codex_action', message: 'Sign in with the Codex CLI, then retry.' })
      case 'install-runtime': return t({ id: 'settings.install_codex_action', message: 'Install the signed Codex CLI, then retry.' })
      case 'upgrade-runtime': return t({ id: 'settings.upgrade_codex_action', message: 'Update Codex to a supported signed version.' })
      case 'update-app': return t({ id: 'settings.update_cutout_runtime_action', message: 'Update Cutout to enable the proven Codex runtime contract.' })
      case 'verify-provider': return t({ id: 'settings.verify_provider_action', message: 'Verify the configured provider and model catalog.' })
      case 'configure-route': return t({ id: 'settings.configure_route_action', message: 'Choose a model with exact capability evidence.' })
      case 'connect-provider': return t({ id: 'settings.connect_image_provider_action', message: 'Connect a compatible direct provider.' })
      default: return t({ id: 'settings.retry_capability_action', message: 'Retry the capability check.' })
    }
  }
  const rowAction = (row: AiSetupProjection['rows'][number]) => {
    if (row.status !== 'action-required') return null
    if (row.nextAction === 'connect-provider') {
      return <Button size="sm" variant="outline" onClick={onConnect}><Plus /><Trans id="settings.connect_provider">Connect provider</Trans></Button>
    }
    if (row.nextAction === 'verify-provider' || row.nextAction === 'configure-route') {
      return <Button size="sm" variant="outline" onClick={onManage}><SlidersHorizontal /><Trans id="settings.manage">Manage</Trans></Button>
    }
    if (
      row.nextAction === 'retry'
      || row.nextAction === 'authorize-runtime'
      || row.nextAction === 'install-runtime'
      || row.nextAction === 'upgrade-runtime'
      || row.nextAction === 'update-app'
    ) {
      return <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw /><Trans id="settings.retry">Retry</Trans></Button>
    }
    return null
  }

  return (
    <section
      className="border-y border-border py-4"
      aria-live="polite"
      data-ai-setup-status={setup.status}
      data-ai-verified-provider-count={setup.verifiedProviders.length}
      data-ai-automatic-busy={automaticBusy ? 'true' : 'false'}
      data-ai-missing-capability-count={setup.rows.filter((row) => row.status === 'action-required').length}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" aria-hidden>
          {setup.status === 'ready' ? <CheckCircle2 className="size-5 text-emerald-600" /> : setup.status === 'checking' ? <CircleDashed className="size-5 animate-spin text-muted-foreground" /> : <TriangleAlert className="size-5 text-amber-600 dark:text-amber-300" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">{description}</p>
          {automaticError ? <p className="mt-2 text-xs text-destructive" role="alert">{automaticError}</p> : null}
          <div className="mt-3 divide-y divide-border border-y border-border">
            {setup.rows.map((row) => (
              <div key={row.capability} data-ai-capability={row.capability} data-ai-capability-status={row.status} className="flex min-w-0 items-center gap-3 py-3">
                <span aria-hidden className="shrink-0">
                  {row.status === 'ready' ? <CheckCircle2 className="size-4 text-emerald-600" /> : row.status === 'checking' ? <CircleDashed className="size-4 animate-spin text-muted-foreground" /> : <TriangleAlert className="size-4 text-amber-600 dark:text-amber-300" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{capabilityLabels[row.capability]}</span>
                  <span className="block break-words text-xs text-muted-foreground">{row.adapter?.label ?? rowDescription(row)}</span>
                  {row.adapter ? <span className="block text-[11px] text-muted-foreground">{rowDescription(row)}</span> : null}
                </span>
                <span className="shrink-0">{rowAction(row)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PlanningRuntimeDiagnostics({
  evidence,
  checking,
}: {
  readonly evidence?: PlanningRuntimeEvidence
  readonly checking: boolean
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="planning-runtime-heading">
      <h3 id="planning-runtime-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Trans id="settings.planning_runtime">Planning runtime</Trans>
      </h3>
      <div className="border-y border-border py-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-foreground">Codex</span>
          <span>{checking ? <Trans id="settings.checking">Checking</Trans> : evidence?.version ?? <Trans id="settings.not_installed">Not installed</Trans>}</span>
        </div>
        {evidence ? (
          <p className="mt-1 break-words">
            <Trans id="settings.runtime_evidence_detail">
              Authentication: {evidence.authClass}. Capability: {evidence.capability}. Execution: {evidence.execution}.
            </Trans>
          </p>
        ) : null}
        {evidence?.reason ? <p className="mt-1 break-words text-amber-700 dark:text-amber-300">{evidence.reason}</p> : null}
        {evidence?.lastFailure ? <p className="mt-1 break-words text-amber-700 dark:text-amber-300">{evidence.lastFailure}</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans id="settings.claude_policy_diagnostic">Claude Code execution remains unavailable pending vendor policy review.</Trans>
      </p>
    </section>
  )
}

const AdvancedModelAssignments = memo(function AdvancedModelAssignments() {
  const { t } = useLingui()
  const localizedDimensions: Readonly<Record<string, { label: string; description: string }>> = {
    text: {
      label: t({ id: 'settings.dimension_text_label', message: 'Text understanding' }),
      description: t({ id: 'settings.dimension_text_description', message: 'Conversation, planning and document understanding.' }),
    },
    vision: {
      label: t({ id: 'settings.dimension_vision_label', message: 'Vision' }),
      description: t({ id: 'settings.dimension_vision_description', message: 'Understand screenshots, photos and visual references.' }),
    },
    webdev: {
      label: t({ id: 'settings.dimension_webdev_label', message: 'Web development' }),
      description: t({ id: 'settings.dimension_webdev_description', message: 'Plan and implement web interfaces.' }),
    },
    'image-to-webdev': {
      label: t({ id: 'settings.dimension_image_to_webdev_label', message: 'Image to Web' }),
      description: t({ id: 'settings.dimension_image_to_webdev_description', message: 'Implement a web interface from visual evidence.' }),
    },
    'image-generation': {
      label: t({ id: 'settings.dimension_image_generation_label', message: 'Image generation' }),
      description: t({ id: 'settings.dimension_image_generation_description', message: 'Generate new visual material.' }),
    },
    'image-edit': {
      label: t({ id: 'settings.dimension_image_edit_label', message: 'Image editing' }),
      description: t({ id: 'settings.dimension_image_edit_description', message: 'Edit one or more supplied images.' }),
    },
  }

  return (
    <section data-settings-anchor="model-routing" tabIndex={-1} className="flex flex-col gap-3 border-t border-border pt-4 outline-none">
      <div>
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Trans id="settings.manual_model_bindings">Manual model bindings</Trans>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans id="settings.manual_model_bindings_description">
            Override automatic routing for a specific task.
          </Trans>
        </p>
      </div>
      <div className="flex flex-col gap-2" aria-label={t({ id: 'settings.advanced_model_bindings_aria', message: 'Advanced model bindings' })}>
        {MODEL_DIMENSIONS.map((dimension) => (
          <ModelSlot
            key={dimension.task}
            {...dimension}
            {...(localizedDimensions[dimension.task] ?? {
              label: dimension.label,
              description: dimension.description,
            })}
            advanced
          />
        ))}
      </div>
    </section>
  )
})
