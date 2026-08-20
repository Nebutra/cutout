/**
 * One task row in "Assign models to tasks" (layer 3).
 *
 * A row names a *task* and answers "which connection, which model". Both halves
 * are always visible: the collapsed summary reads `<provider> · <model>`, never
 * a bare slug, because a model id alone does not say which connection serves
 * it. Model choices come from the connection's probed catalog
 * (`ProviderConfig.catalog`) rather than a per-provider `/v1/models` query that
 * was silently disabled for every provider without an explicit base URL.
 *
 * An unbound task inherits from a more general one (see `task-routing.ts`);
 * the summary says so rather than showing a bare "Auto".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, CircleAlert, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { toast } from 'sonner'
import {
  useProviders,
  useProviderVerifications,
  useVerifyProvider,
} from '@/hooks/queries/providers'
import { useCapabilityBindings, useSetCapabilityBinding } from '@/hooks/queries/ai-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ModelDimension } from './model-dimensions'
import { requiresVerifiedVision } from './model-dimensions'
import {
  assessImageRoute,
  imageRoutePresentationStatus,
  verifiedImageRouteDescriptor,
} from '@/services/ai/image-route-assessment'
import { providerCatalogModels } from '@/services/ai/provider-types'
import { providerVerificationIsVerified } from '@/services/ai/provider-verification'
import { resolveTaskRoute } from '@/services/ai/task-routing'
import type { ModelTaskKind } from '@/services/ai/model-capabilities'

type ModelSlotProps = ModelDimension & {
  readonly advanced: boolean
  /** Localized task labels, so an inherited route can name its source. */
  readonly taskLabels?: Readonly<Record<string, string>>
}

export function ModelSlot({ task, label, description, advanced, taskLabels }: ModelSlotProps) {
  const { t } = useLingui()
  const providers = useProviders()
  const providerVerifications = useProviderVerifications()
  const verifyProvider = useVerifyProvider()
  const list = useMemo(() => providers.data ?? [], [providers.data])
  const bindings = useCapabilityBindings()
  const { mutateAsync: setCapabilityBinding } = useSetCapabilityBinding()
  const saved = bindings.data?.bindings[task]
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [fallback, setFallback] = useState('')
  const [manualEntry, setManualEntry] = useState(false)
  const hydrated = useRef<string | undefined>(undefined)
  const [expanded, setExpanded] = useState(false)
  const selected = list.find((provider) => provider.id === providerId)
  const catalog = useMemo(() => providerCatalogModels(selected), [selected])
  /** The catalog plus whatever is already bound, so a stale slug stays visible. */
  const modelOptions = useMemo(
    () => Array.from(new Set([...catalog, ...(model ? [model] : [])])).sort(),
    [catalog, model],
  )
  const visionRequired = requiresVerifiedVision(task)
  const imageCapability = task === 'image-generation' || task === 'image-edit' ? task : undefined
  const selectedVerification = selected ? providerVerifications[selected.id] : undefined
  const imageStatus = imageCapability && selected && model.trim()
    ? imageRoutePresentationStatus(assessImageRoute({
        assignment: { providerId: selected.id, model: model.trim() },
        provider: selected,
        descriptor: verifiedImageRouteDescriptor({
          provider: selected,
          assignment: { providerId: selected.id, model: model.trim() },
          descriptors: bindings.data?.descriptors ?? [],
          verifiedCatalogModels: providerVerificationIsVerified(selectedVerification)
            ? catalog
            : undefined,
        }),
      }), imageCapability)
    : undefined
  const unavailable = list.length === 0

  // What the runtime would actually use when this task carries no binding.
  const inherited = resolveTaskRoute(bindings.data?.bindings, task)
  const inheritedProvider = inherited?.inheritedFrom
    ? list.find((provider) => provider.id === inherited.assignment.providerId)
    : undefined

  const summary = unavailable
    ? t({ id: 'settings.model_slot_unavailable', message: 'Unavailable' })
    : model.trim()
      ? `${selected?.label ?? t({ id: 'settings.provider_placeholder', message: 'Provider' })} · ${model.trim()}`
      : inherited?.inheritedFrom
        ? t({
            id: 'settings.model_slot_inherited',
            message: `Auto · inherits ${taskLabel(inherited.inheritedFrom, taskLabels)}`,
          })
        : t({ id: 'settings.model_slot_auto', message: 'Auto' })

  const evidence = catalog.length > 0
    ? t({
        id: 'settings.models_from_catalog',
        message: `${catalog.length} models in this connection's catalog`,
      })
    : providerId
      ? t({ id: 'settings.capability_evidence_unavailable', message: 'Capability evidence unavailable' })
      : t({ id: 'settings.auto_will_choose', message: 'Auto will choose from connected providers' })

  useEffect(()=>{if(bindings.isPending||hydrated.current===task)return;hydrated.current=task;setProviderId(saved?.providerId??(list.length===1?list[0]?.id??'':''));setModel(saved?.model??'');setFallback(saved?.fallbackModel??'')},[bindings.isPending,list,saved,task])
  useEffect(()=>{if(hydrated.current!==task)return;const timer=setTimeout(()=>{const assignment=providerId&&model.trim()?{providerId,model:model.trim(),...(fallback.trim()?{fallbackModel:fallback.trim()}:{} )}:undefined;void setCapabilityBinding({task,assignment})},300);return()=>clearTimeout(timer)},[fallback,model,providerId,setCapabilityBinding,task])
  // A connection with no catalog cannot offer a picker; fall back to typing.
  useEffect(() => {
    if (providerId && catalog.length === 0) setManualEntry(true)
  }, [catalog.length, providerId])

  async function refreshCatalog() {
    if (!selected) return
    try {
      const { models } = await verifyProvider.mutateAsync(selected.id)
      setManualEntry(models.length === 0)
      toast.success(t({
        id: 'settings.models_discovered_toast',
        message: `${selected.label} · ${models.length} models discovered`,
      }))
    } catch (error) {
      toast.error(t({ id: 'settings.status_failed', message: 'Verification failed' }), {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card/30" aria-label={label}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
        onClick={() => advanced && setExpanded((value) => !value)}
        aria-expanded={advanced ? expanded : undefined}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {label}
            {visionRequired ? (
              <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                <Trans id="settings.vision_required">Vision required</Trans>
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        </span>
        <span className="flex min-w-0 shrink items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate" data-model-slot-summary={task}>{summary}</span>
          {advanced ? <ChevronDown className={`size-3.5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} /> : null}
        </span>
      </button>

      {advanced && expanded ? (
        <div className="border-t border-border px-3 py-3">
          {!model.trim() && inherited?.inheritedFrom ? (
            <p className="mb-2 rounded border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              {t({
                id: 'settings.inherited_route_detail',
                message: `Unassigned — calls use ${taskLabel(inherited.inheritedFrom, taskLabels)}: ${inheritedProvider?.label ?? inherited.assignment.providerId} · ${inherited.assignment.model}`,
              })}
            </p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
            <Select value={providerId || undefined} onValueChange={(value) => { setProviderId(value); setModel(''); setManualEntry(false) }}>
              <SelectTrigger aria-label={t({ id: 'settings.model_slot_provider_aria', message: `${label} provider` })}><SelectValue placeholder={t({ id: 'settings.provider_placeholder', message: 'Provider' })} /></SelectTrigger>
              <SelectContent>
                {list.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {providerCatalogModels(provider).length > 0
                      ? t({
                          id: 'settings.provider_option_with_count',
                          message: `${provider.label} (${providerCatalogModels(provider).length} models)`,
                        })
                      : provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {manualEntry ? (
              <Input
                list={`models-${task}`}
                value={model}
                disabled={!providerId}
                onChange={(event) => setModel(event.target.value)}
                placeholder={t({ id: 'settings.model_or_blank_placeholder', message: 'Model or leave blank for Auto' })}
                aria-label={t({ id: 'settings.model_slot_model_aria', message: `${label} model` })}
                className="font-mono"
              />
            ) : (
              <Select value={model || undefined} disabled={!providerId} onValueChange={setModel}>
                <SelectTrigger className="font-mono" aria-label={t({ id: 'settings.model_slot_model_aria', message: `${label} model` })}>
                  <SelectValue placeholder={t({ id: 'settings.select_model', message: 'Select a model' })} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((value) => (
                    <SelectItem key={value} value={value} className="font-mono">{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <datalist id={`models-${task}`}>
              {modelOptions.map((value) => <option key={value} value={value} />)}
            </datalist>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!providerId || verifyProvider.isPending} onClick={() => void refreshCatalog()}>
              {verifyProvider.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              <Trans id="settings.refresh_model_catalog">Refresh model list</Trans>
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!providerId} onClick={() => setManualEntry((value) => !value)}>
              {manualEntry
                ? <Trans id="settings.pick_from_catalog">Pick from catalog</Trans>
                : <Trans id="settings.enter_model_manually">Enter model ID manually</Trans>}
            </Button>
            {model.trim() ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setModel(''); setFallback('') }}>
                <Trans id="settings.clear_binding">Clear</Trans>
              </Button>
            ) : null}
          </div>
          <Input
            className="mt-2 font-mono"
            value={fallback}
            disabled={!providerId}
            onChange={(event) => setFallback(event.target.value)}
            placeholder={t({ id: 'settings.optional_fallback_model_placeholder', message: 'Optional fallback model' })}
            aria-label={t({ id: 'settings.model_slot_fallback_aria', message: `${label} fallback model` })}
          />
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            {catalog.length > 0 ? <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 size-3 shrink-0" />}
            <span>{t({ id: 'settings.evidence_disclaimer', message: `${evidence}. Endpoint discovery proves availability, not task quality or modality support.` })}</span>
          </div>
          {visionRequired && model ? (
            <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              <Trans id="settings.vision_capability_unverified">This assignment remains unavailable until image-input capability is verified by catalog evidence or a provider probe.</Trans>
            </p>
          ) : null}
          {imageStatus ? (
            <p
              className="mt-2 rounded border border-border px-2 py-1.5 text-[11px] text-muted-foreground"
              data-image-route-status={imageStatus}
            >
              {imageStatus === 'recommended'
                ? t({ id: 'settings.image_route_recommended', message: 'Recommended for high fidelity' })
                : imageStatus === 'supported'
                  ? t({ id: 'settings.image_route_supported', message: 'Supported' })
                  : imageStatus === 'adapter-required'
                    ? t({ id: 'settings.image_route_adapter_required', message: 'Adapter required' })
                    : t({ id: 'settings.image_route_evidence_required', message: 'Verified capability evidence required' })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** The localized name of the task a route was inherited from. */
function taskLabel(
  task: ModelTaskKind,
  labels: Readonly<Record<string, string>> | undefined,
): string {
  return labels?.[task] ?? task
}
