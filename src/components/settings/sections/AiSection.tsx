import { memo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ProviderDefinition } from '@/services/ai/provider-registry'
import {
  discoverProviderCandidates,
  type ProviderDiscoveryCandidate,
} from '@/services/ai/provider-discovery'
import {
  useProviderVerifications,
  useProviders,
} from '@/hooks/queries/providers'
import { useCapabilityBindings } from '@/hooks/queries/ai-settings'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProviderRow } from '../ProviderRow'
import { ProviderForm } from '../ProviderForm'
import { ModelSlot } from '../ModelSlot'
import { MODEL_DIMENSIONS } from '../model-dimensions'
import { VectorizerPanel } from '../VectorizerPanel'
import { ProviderDirectory } from '../ProviderDirectory'
import { discoveredProviderSourceLabel } from '../discovered-provider-source'
import {
  projectAiSetup,
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
  const providers = useProviders()
  const bindings = useCapabilityBindings()
  const discovery = useQuery({
    queryKey: ['provider-discovery'],
    queryFn: discoverProviderCandidates,
    retry: false,
  })
  const verifications = useProviderVerifications()
  const list = providers.data ?? []
  const setup = projectAiSetup({
    providersState: queryState(providers),
    providers: providers.data,
    verifications,
    bindingsState: queryState(bindings),
    bindings: bindings.data,
    discoveryState: queryState(discovery),
    candidates: discovery.data,
  })

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
    void providers.refetch()
    void bindings.refetch()
    void discovery.refetch()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AiSetupOverview
        setup={setup}
        onConnect={() => setView({ mode: 'add' })}
        onManage={() => setAdvanced(true)}
        onRetry={retry}
        onSelectCandidate={(discovered) => setView({ mode: 'add', discovered })}
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
  onSelectCandidate,
}: {
  readonly setup: AiSetupProjection
  readonly onConnect: () => void
  readonly onManage: () => void
  readonly onRetry: () => void
  readonly onSelectCandidate: (candidate: ProviderDiscoveryCandidate) => void
}) {
  const { t } = useLingui()
  const dimensionLabels: Readonly<Record<string, string>> = {
    text: t({ id: 'settings.dimension_text_label', message: 'Text understanding' }),
    vision: t({ id: 'settings.dimension_vision_label', message: 'Vision' }),
    webdev: t({ id: 'settings.dimension_webdev_label', message: 'Web development' }),
    'image-to-webdev': t({ id: 'settings.dimension_image_to_webdev_label', message: 'Image to Web' }),
    'image-generation': t({ id: 'settings.dimension_image_generation_label', message: 'Image generation' }),
    'image-edit': t({ id: 'settings.dimension_image_edit_label', message: 'Image editing' }),
  }
  const sourceLabel = (candidate: ProviderDiscoveryCandidate) => {
    const source = discoveredProviderSourceLabel(candidate)
    if (source.kind === 'environment') {
      return t({ id: 'settings.provider_source_environment', message: 'Process environment' })
    }
    if (source.kind === 'cutout-keychain') {
      return t({ id: 'settings.provider_source_keychain', message: 'Cutout local credentials' })
    }
    return source.label
  }

  let icon = <TriangleAlert className="size-5 text-amber-600 dark:text-amber-300" />
  let title = t({ id: 'settings.ai_setup_action_required', message: 'AI setup needs attention' })
  let description = ''
  let action: React.ReactNode = null
  let detail: React.ReactNode = null

  switch (setup.status) {
    case 'checking':
      icon = <CircleDashed className="size-5 animate-spin text-muted-foreground" />
      title = t({ id: 'settings.ai_setup_checking', message: 'Checking AI setup' })
      description = t({
        id: 'settings.ai_setup_checking_description',
        message: 'Reviewing configured providers and reusable credentials on this device.',
      })
      break
    case 'ready':
      icon = <CheckCircle2 className="size-5 text-emerald-600" />
      title = t({ id: 'settings.ai_setup_ready', message: 'AI is ready' })
      description = t({
        id: 'settings.ai_setup_ready_description',
        message: 'Verified providers cover every required AI capability.',
      })
      break
    case 'needs-verification':
      description = t({
        id: 'settings.ai_setup_verification_description',
        message: 'Configured providers must be enabled and verified before Cutout can use them.',
      })
      action = (
        <Button size="sm" variant="outline" onClick={onManage}>
          <SlidersHorizontal />
          <Trans id="settings.manage_providers">Manage providers</Trans>
        </Button>
      )
      break
    case 'needs-capabilities':
      title = t({ id: 'settings.ai_setup_capabilities_title', message: 'More AI capabilities are needed' })
      description = t({
        id: 'settings.ai_setup_capabilities_description',
        message: 'Your verified providers do not cover every required task.',
      })
      detail = (
        <div className="flex flex-wrap gap-1.5">
          {setup.missing.map((item) => (
            <span key={item.task} className="border border-amber-500/30 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
              {dimensionLabels[item.task] ?? item.label}
            </span>
          ))}
        </div>
      )
      action = (
        <Button size="sm" variant="outline" onClick={onConnect}>
          <Plus />
          <Trans id="settings.connect_provider">Connect provider</Trans>
        </Button>
      )
      break
    case 'discovered-credentials':
      icon = <WandSparkles className="size-5 text-emerald-600" />
      title = t({ id: 'settings.ai_setup_credentials_found', message: 'Reusable credentials found' })
      description = t({
        id: 'settings.ai_setup_credentials_found_description',
        message: 'Review and connect a credential to finish setup.',
      })
      detail = (
        <div className="divide-y divide-border border-y border-border">
          {setup.candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectCandidate(candidate)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{candidate.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{sourceLabel(candidate)}</span>
              </span>
              <span className="shrink-0 text-xs font-medium">
                <Trans id="settings.review_and_connect">Review and connect</Trans>
              </span>
            </button>
          ))}
        </div>
      )
      break
    case 'needs-provider':
      icon = <KeyRound className="size-5 text-muted-foreground" />
      title = t({ id: 'settings.ai_setup_connect_title', message: 'Connect AI to get started' })
      description = t({
        id: 'settings.ai_setup_connect_description',
        message: 'Choose a provider and verify its credentials.',
      })
      action = (
        <Button size="sm" variant="outline" onClick={onConnect}>
          <Plus />
          <Trans id="settings.browse_providers">Browse providers</Trans>
        </Button>
      )
      break
    case 'unavailable':
      title = t({ id: 'settings.ai_setup_unavailable', message: 'Automatic AI setup is unavailable' })
      description = setup.reason === 'discovery'
        ? t({
            id: 'settings.ai_setup_discovery_unavailable_description',
            message: 'Cutout could not check reusable credentials on this device. Try again or connect a provider manually.',
          })
        : t({
            id: 'settings.ai_setup_configuration_unavailable_description',
            message: 'Cutout could not load the current AI configuration. Try again.',
          })
      action = (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw />
            <Trans id="settings.retry">Retry</Trans>
          </Button>
          {setup.reason === 'discovery' ? (
            <Button size="sm" variant="ghost" onClick={onConnect}>
              <Plus />
              <Trans id="settings.browse_providers">Browse providers</Trans>
            </Button>
          ) : null}
        </div>
      )
      break
  }

  return (
    <section className="border-y border-border py-4" aria-live="polite" data-ai-setup-status={setup.status}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">{description}</p>
          {detail ? <div className="mt-3">{detail}</div> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
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
