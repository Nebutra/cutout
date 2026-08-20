/**
 * AI settings queries + mutations (design spec §5).
 *
 * Model assignments are a local, non-secret preference (like theme/language),
 * persisted via plugin-store — so these hooks call the local module directly
 * rather than routing through the service registry.
 *
 * There is deliberately no endpoint-model query here. Discovering a
 * connection's models is one action with verifying its credential
 * (`verifyProviderCatalog`), and the result is persisted on the connection as
 * `ProviderConfig.catalog`. The previous `useEndpointModels` query was gated on
 * `provider.baseUrl`, which is absent for every direct vendor connection, so it
 * was permanently disabled for them and their model pickers were always empty.
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
import { resolveTaskRoute } from '@/services/ai/task-routing'
import type {
  ModelAssignment,
  ModelAssignments,
  SlotId,
} from '@/services/ai/model-assignment-types'

export const aiSettingsKeys = {
  all: ['ai-settings'] as const,
  assignments: () => [...aiSettingsKeys.all, 'assignments'] as const,
  capabilityBindings: () => [...aiSettingsKeys.all, 'capability-bindings'] as const,
}
export function useCapabilityBindings(){return useQuery({queryKey:aiSettingsKeys.capabilityBindings(),queryFn:loadCapabilityBindings})}

/**
 * The route serving one task (layer 3) — the hook every generation call site
 * uses. Prefer this over {@link useModelAssignments}, which is the run-level
 * two-slot override view and cannot express per-task routing.
 */
export function useTaskAssignment(task: ModelTaskKind) {
  const bindings = useCapabilityBindings()
  const route = resolveTaskRoute(bindings.data?.bindings, task)
  return {
    assignment: route?.assignment,
    inheritedFrom: route?.inheritedFrom,
    isPending: bindings.isPending,
  }
}
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
