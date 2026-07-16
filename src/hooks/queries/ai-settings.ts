/**
 * AI settings queries + mutations (design spec §5).
 *
 * Model assignments are a local, non-secret preference (like theme/language),
 * persisted via plugin-store — so these hooks call the local module directly
 * rather than routing through the service registry. Endpoint model discovery
 * (`/v1/models`) is a per-provider query, gated on the provider having both a
 * key and a base URL.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  clearCapabilityBinding,
  loadCapabilityBindings,
  loadAssignments,
  setCapabilityBinding,
  setAssignment,
} from '@/services/ai/model-assignment.local'
import type { ModelTaskKind } from '@/services/ai/model-capabilities'
import { listEndpointModels } from '@/services/ai/list-models'
import type {
  ModelAssignment,
  ModelAssignments,
  SlotId,
} from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { useProviderStatus } from './providers'

export const aiSettingsKeys = {
  all: ['ai-settings'] as const,
  assignments: () => [...aiSettingsKeys.all, 'assignments'] as const,
  capabilityBindings: () => [...aiSettingsKeys.all, 'capability-bindings'] as const,
  endpointModels: (id: string) =>
    [...aiSettingsKeys.all, 'endpoint-models', id] as const,
}
export function useCapabilityBindings(){return useQuery({queryKey:aiSettingsKeys.capabilityBindings(),queryFn:loadCapabilityBindings})}
export function useSetCapabilityBinding(){const qc=useQueryClient();return useMutation({mutationFn:(input:{task:ModelTaskKind;assignment?:ModelAssignment})=>input.assignment?setCapabilityBinding(input.task,input.assignment):clearCapabilityBinding(input.task),onSuccess:()=>Promise.all([qc.invalidateQueries({queryKey:aiSettingsKeys.capabilityBindings()}),qc.invalidateQueries({queryKey:aiSettingsKeys.assignments()})])})}

/** The current model-assignment table. */
export function useModelAssignments() {
  return useQuery<ModelAssignments>({
    queryKey: aiSettingsKeys.assignments(),
    queryFn: loadAssignments,
  })
}

/** Assign a model to a slot (persists + invalidates). */
export function useSetModelAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { slot: SlotId; assignment: ModelAssignment }) =>
      setAssignment(vars.slot, vars.assignment),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: aiSettingsKeys.assignments() }),
  })
}

/**
 * Models advertised by an endpoint via `/v1/models`. Enabled only when the
 * provider exists, has a key, and carries a base URL; otherwise the query is
 * idle and callers fall back to the suggested list.
 */
export function useEndpointModels(provider?: ProviderConfig) {
  const status = useProviderStatus(provider?.id ?? '')
  const hasKey = status.data === true
  return useQuery<string[]>({
    queryKey: aiSettingsKeys.endpointModels(provider?.id ?? ''),
    queryFn: () => (provider ? listEndpointModels(provider) : Promise.resolve([])),
    enabled: Boolean(provider?.baseUrl) && hasKey,
  })
}
