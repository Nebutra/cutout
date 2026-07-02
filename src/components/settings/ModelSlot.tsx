/**
 * ModelSlot (design spec §4b) — assign one model to an output-modality slot.
 *
 * Pick an endpoint + a model. The model field is a free-text input backed by a
 * datalist whose suggestions come from the in-repo `SUGGESTED_MODELS` for the
 * chosen endpoint's kind unioned with its discovered `/v1/models` (relays). The
 * choice persists instantly (plugin-store) via `useSetModelAssignment`.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import type { SlotId } from '@/services/ai/model-assignment-types'
import { SUGGESTED_MODELS } from '@/services/ai/models'
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

export function ModelSlot({ slot, label, hint }: ModelSlotProps) {
  const { t } = useLingui()
  const providers = useProviders()
  const assignments = useModelAssignments()
  const setAssignment = useSetModelAssignment()

  const list = providers.data ?? []
  const current = assignments.data?.[slot]

  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')

  // Sync the fields when the persisted assignment (re)loads.
  useEffect(() => {
    setProviderId(current?.providerId ?? '')
    setModel(current?.model ?? '')
  }, [current?.providerId, current?.model])

  const selected = list.find((p) => p.id === providerId)
  const endpointModels = useEndpointModels(selected)

  const suggestions = Array.from(
    new Set([
      ...(selected ? SUGGESTED_MODELS[selected.kind] : []),
      ...(endpointModels.data ?? []),
      ...(model.trim() ? [model.trim()] : []),
    ]),
  )

  const commit = (pid: string, m: string) => {
    if (pid && m.trim()) {
      setAssignment.mutate({
        slot,
        assignment: { providerId: pid, model: m.trim() },
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
            setProviderId(value)
            commit(value, model)
          }}
        >
          <SelectTrigger className="w-40 shrink-0">
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
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => commit(providerId, model)}
          placeholder={t({
            id: 'settings.model_slug_placeholder',
            message: 'model',
          })}
          className="font-mono"
        />
        <datalist id={listId}>
          {suggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
