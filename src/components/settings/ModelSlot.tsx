import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, CircleAlert, ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import type { ModelTaskKind } from '@/services/ai/model-capabilities'
import { useProviders } from '@/hooks/queries/providers'
import { useEndpointModels } from '@/hooks/queries/ai-settings'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ModelDimension } from './model-dimensions'
import { requiresVerifiedVision } from './model-dimensions'

type ModelSlotProps = ModelDimension & { readonly advanced: boolean }

type SavedRoute = { readonly providerId?: string; readonly model?: string; readonly fallback?: string }
const ROUTE_KEY = 'cutout.model-routing.v1'

function loadRoute(task: ModelTaskKind): SavedRoute {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(ROUTE_KEY) ?? '{}') as Record<string, SavedRoute>
    return value[task] ?? {}
  } catch {
    return {}
  }
}

function saveRoute(task: ModelTaskKind, route: SavedRoute): void {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(ROUTE_KEY) ?? '{}') as Record<string, SavedRoute>
    globalThis.localStorage?.setItem(ROUTE_KEY, JSON.stringify({ ...value, [task]: route }))
  } catch {
    // Browser storage is an optional non-secret preference cache.
  }
}

export function ModelSlot({ task, label, description, advanced }: ModelSlotProps) {
  const { t } = useLingui()
  const providers = useProviders()
  const list = providers.data ?? []
  const saved = useMemo(() => loadRoute(task), [task])
  const [providerId, setProviderId] = useState(saved.providerId ?? (list.length === 1 ? list[0]?.id ?? '' : ''))
  const [model, setModel] = useState(saved.model ?? '')
  const [fallback, setFallback] = useState(saved.fallback ?? '')
  const [expanded, setExpanded] = useState(false)
  const selected = list.find((provider) => provider.id === providerId)
  const endpointModels = useEndpointModels(selected)
  const discovered = useMemo(
    () => Array.from(new Set([...(endpointModels.data ?? []), ...(model ? [model] : [])])).sort(),
    [endpointModels.data, model],
  )
  const visionRequired = requiresVerifiedVision(task)
  const unavailable = list.length === 0
  const evidence = endpointModels.isSuccess
    ? t({ id: 'settings.models_discovered_from_endpoint', message: `${endpointModels.data.length} models discovered from endpoint` })
    : providerId
      ? t({ id: 'settings.capability_evidence_unavailable', message: 'Capability evidence unavailable' })
      : t({ id: 'settings.auto_will_choose', message: 'Auto will choose from connected providers' })

  useEffect(() => {
    saveRoute(task, {
      ...(providerId ? { providerId } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(fallback.trim() ? { fallback: fallback.trim() } : {}),
    })
  }, [fallback, model, providerId, task])

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
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {unavailable ? t({ id: 'settings.model_slot_unavailable', message: 'Unavailable' }) : t({ id: 'settings.model_slot_auto', message: 'Auto' })}
          {advanced ? <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} /> : null}
        </span>
      </button>

      {advanced && expanded ? (
        <div className="border-t border-border px-3 py-3">
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
            <Select value={providerId || undefined} onValueChange={(value) => { setProviderId(value); setModel('') }}>
              <SelectTrigger aria-label={t({ id: 'settings.model_slot_provider_aria', message: `${label} provider` })}><SelectValue placeholder={t({ id: 'settings.provider_placeholder', message: 'Provider' })} /></SelectTrigger>
              <SelectContent>
                {list.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              list={`models-${task}`}
              value={model}
              disabled={!providerId}
              onChange={(event) => setModel(event.target.value)}
              placeholder={t({ id: 'settings.model_or_blank_placeholder', message: 'Model or leave blank for Auto' })}
              aria-label={t({ id: 'settings.model_slot_model_aria', message: `${label} model` })}
              className="font-mono"
            />
            <datalist id={`models-${task}`}>
              {discovered.map((value) => <option key={value} value={value} />)}
            </datalist>
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
            {endpointModels.isSuccess ? <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 size-3 shrink-0" />}
            <span>{t({ id: 'settings.evidence_disclaimer', message: `${evidence}. Endpoint discovery proves availability, not task quality or modality support.` })}</span>
          </div>
          {visionRequired && model ? (
            <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              <Trans id="settings.vision_capability_unverified">This assignment remains unavailable until image-input capability is verified by catalog evidence or a provider probe.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
