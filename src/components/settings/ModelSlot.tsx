/**
 * ModelSlot (design spec §4b) — assign one model to an output-modality slot.
 *
 * Pick an endpoint + a model. The model field is a free-text input backed by a
 * datalist whose suggestions come from the in-repo `SUGGESTED_MODELS` for the
 * chosen endpoint's kind unioned with its discovered `/v1/models` (relays). The
 * choice persists instantly (plugin-store) via `useSetModelAssignment`.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import type { SlotId } from '@/services/ai/model-assignment-types'
import { SUGGESTED_MODELS, POPULAR_MODELS } from '@/services/ai/models'
import { REASONING_EFFORTS, type ReasoningEffort } from '@/services/ai/reasoning'
import { useProviders } from '@/hooks/queries/providers'
import {
  useModelAssignments,
  useSetModelAssignment,
  useEndpointModels,
} from '@/hooks/queries/ai-settings'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ModelSlotProps {
  readonly slot: SlotId
  readonly label: ReactNode
  readonly hint?: ReactNode
}

interface ModelSlotDraft {
  readonly sourceKey: string
  readonly providerId: string
  readonly model: string
  readonly effort: ReasoningEffort | undefined
}

function draftSourceKey(
  currentProviderId: string | undefined,
  currentModel: string | undefined,
  currentEffort: ReasoningEffort | undefined,
  soleProviderId: string,
): string {
  return [
    currentProviderId ?? '',
    currentModel ?? '',
    currentEffort ?? '',
    soleProviderId,
  ].join('\u0000')
}

function createDraft(
  sourceKey: string,
  currentProviderId: string | undefined,
  currentModel: string | undefined,
  currentEffort: ReasoningEffort | undefined,
  soleProviderId: string,
): ModelSlotDraft {
  if (currentProviderId !== undefined) {
    return {
      sourceKey,
      providerId: currentProviderId,
      model: currentModel ?? '',
      effort: currentEffort,
    }
  }
  return {
    sourceKey,
    providerId: soleProviderId,
    model: '',
    effort: undefined,
  }
}

export function ModelSlot({ slot, label, hint }: ModelSlotProps) {
  const { t } = useLingui()
  const providers = useProviders()
  const assignments = useModelAssignments()
  const setAssignment = useSetModelAssignment()

  const list = providers.data ?? []
  const current = assignments.data?.[slot]

  // With exactly one endpoint, pre-select it — the same connection (one key)
  // serves every slot; models are chosen per capability, not per provider.
  const soleProviderId = list.length === 1 ? list[0].id : ''
  const currentProviderId = current?.providerId
  const currentModel = current?.model
  const currentEffort = current?.effort

  const sourceKey = draftSourceKey(
    currentProviderId,
    currentModel,
    currentEffort,
    soleProviderId,
  )
  const nextDraft = createDraft(
    sourceKey,
    currentProviderId,
    currentModel,
    currentEffort,
    soleProviderId,
  )
  const [draft, setDraft] = useState<ModelSlotDraft>(nextDraft)
  const activeDraft = draft.sourceKey === sourceKey ? draft : nextDraft
  if (draft.sourceKey !== sourceKey) {
    setDraft(nextDraft)
  }

  const providerId = activeDraft.providerId
  const model = activeDraft.model
  const effort = activeDraft.effort

  const selected = list.find((p) => p.id === providerId)
  const endpointModels = useEndpointModels(selected)

  // Relays / gateways proxy many upstreams → offer the curated mainstream list;
  // direct vendors offer their own. Union with the endpoint's discovered models.
  const curated = selected
    ? selected.kind === 'openai-compatible' || selected.kind === 'gateway'
      ? POPULAR_MODELS
      : SUGGESTED_MODELS[selected.kind]
    : []
  const suggestions = Array.from(
    new Set([
      ...curated,
      ...(endpointModels.data ?? []),
      ...(model.trim() ? [model.trim()] : []),
    ]),
  )

  const commit = (pid: string, m: string, e: ReasoningEffort | undefined) => {
    if (pid && m.trim()) {
      setAssignment.mutate({
        slot,
        assignment: {
          providerId: pid,
          model: m.trim(),
          // Thinking strength is a chat-slot concept only.
          ...(slot === 'chat' && e ? { effort: e } : {}),
        },
      })
    }
  }

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-3">
        <div className="text-sm font-medium">{label}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Trans id="settings.model_no_provider">
            Add an endpoint above to assign a model.
          </Trans>
        </p>
      </div>
    )
  }

  const listId = `models-${slot}`

  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-3">
      <div className="text-sm font-medium">{label}</div>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Select
          value={providerId || undefined}
          onValueChange={(value) => {
            // Switching endpoint keeps the typed model — a connection isn't tied
            // to one model; the model is chosen per capability from the list below.
            setDraft({ ...activeDraft, providerId: value })
            commit(value, model, effort)
          }}
        >
          <SelectTrigger
            className="w-40 shrink-0"
            aria-label={t({
              id: 'settings.model_endpoint_aria',
              message: 'Model endpoint',
            })}
          >
            <SelectValue
              placeholder={t({
                id: 'settings.model_pick_endpoint',
                message: 'Endpoint',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {list.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          list={listId}
          value={model}
          disabled={!providerId}
          onChange={(e) =>
            setDraft({ ...activeDraft, model: e.target.value })
          }
          onBlur={() => commit(providerId, model, effort)}
          placeholder={t({
            id: 'settings.model_slug_placeholder',
            message: 'model',
          })}
          aria-label={t({
            id: 'settings.model_name_aria',
            message: 'Model name',
          })}
          className="font-mono"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <datalist id={listId}>
          {suggestions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </datalist>
      </div>

      {slot === 'chat' ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            <Trans id="settings.effort_label">Thinking strength</Trans>
          </span>
          <Select
            value={effort ?? 'default'}
            onValueChange={(value) => {
              const next =
                value === 'default' ? undefined : (value as ReasoningEffort)
              setDraft({ ...activeDraft, effort: next })
              commit(providerId, model, next)
            }}
          >
            <SelectTrigger
              className="w-32 shrink-0"
              disabled={!providerId}
              aria-label={t({
                id: 'settings.effort_aria',
                message: 'Thinking strength',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                <Trans id="settings.effort_default">Default</Trans>
              </SelectItem>
              {REASONING_EFFORTS.map((level) => (
                <SelectItem key={level} value={level}>
                  <EffortLabel effort={level} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}

/** The localized label for one thinking-strength level. */
function EffortLabel({ effort }: { readonly effort: ReasoningEffort }) {
  switch (effort) {
    case 'low':
      return <Trans id="settings.effort_low">Low</Trans>
    case 'medium':
      return <Trans id="settings.effort_medium">Medium</Trans>
    case 'high':
      return <Trans id="settings.effort_high">High</Trans>
  }
}
