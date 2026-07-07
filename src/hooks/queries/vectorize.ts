/**
 * Vectorization settings + keychain queries.
 *
 * Preferences are non-secret app settings; API Secret status and writes route
 * through the `VectorizeService`, which delegates to Rust/Keychain.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import {
  DEFAULT_VECTORIZE_PREFS,
  loadVectorizePrefs,
  setVectorizerApiId,
  setVectorizerApiMode,
  type VectorizePreferences,
} from '@/services/vectorize-prefs.local'

export const vectorizeKeys = {
  all: ['vectorize'] as const,
  prefs: () => [...vectorizeKeys.all, 'prefs'] as const,
  status: (apiId: string) =>
    [...vectorizeKeys.all, 'status', apiId.trim()] as const,
}

export function useVectorizePrefs() {
  return useQuery({
    queryKey: vectorizeKeys.prefs(),
    queryFn: loadVectorizePrefs,
  })
}

export function useSetVectorizerApiId() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setVectorizerApiId,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vectorizeKeys.all })
    },
  })
}

export function useSetVectorizerApiMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setVectorizerApiMode,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vectorizeKeys.prefs() })
    },
  })
}

export function useVectorizerKeyStatus(apiId: string) {
  const { vectorize } = useServices()
  const id = apiId.trim()
  return useQuery({
    queryKey: vectorizeKeys.status(id),
    queryFn: async (): Promise<boolean> => {
      const result = await vectorize.apiKeyStatus(id)
      if (isErr(result)) throw new Error(result.error)
      return result.data
    },
    enabled: id.length > 0,
  })
}

export function useSetVectorizerApiKey() {
  const { vectorize } = useServices()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      apiId: string
      apiSecret: string
    }): Promise<void> => {
      const result = await vectorize.setApiKey(vars.apiId, vars.apiSecret)
      if (isErr(result)) throw new Error(result.error)
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: vectorizeKeys.status(vars.apiId) })
    },
  })
}

export function useDeleteVectorizerApiKey() {
  const { vectorize } = useServices()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (apiId: string): Promise<void> => {
      const result = await vectorize.deleteApiKey(apiId)
      if (isErr(result)) throw new Error(result.error)
    },
    onSuccess: (_data, apiId) => {
      void qc.invalidateQueries({ queryKey: vectorizeKeys.status(apiId) })
    },
  })
}

export function vectorizePrefsOrDefault(
  prefs: VectorizePreferences | undefined,
): VectorizePreferences {
  return prefs ?? DEFAULT_VECTORIZE_PREFS
}
