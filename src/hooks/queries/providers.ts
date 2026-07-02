/**
 * BYOK provider queries + mutations (spec §5).
 *
 * The key-factory lives here (mirrors `keys.ts`) so mutations invalidate exact
 * subtrees. Every mutation invalidates `providerKeys.all` — the coarse but
 * correct choice: setting a key, testing, upserting, or removing can all change
 * both the list and per-provider status. `Result`-returning service calls are
 * unwrapped (throw on error) so a mutation's `isError`/`onError` drives the
 * Settings toast, while raw-array/void calls surface invoke rejections directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import type { ProviderConfig, ProviderDraft } from '@/services/ai/provider-types'

/** Query keys for provider list + per-provider key status. */
export const providerKeys = {
  all: ['providers'] as const,
  list: () => [...providerKeys.all, 'list'] as const,
  status: (id: string) => [...providerKeys.all, 'status', id] as const,
}

/** All configured providers (non-secret config). */
export function useProviders() {
  const { providers } = useServices()
  return useQuery({
    queryKey: providerKeys.list(),
    queryFn: (): Promise<ProviderConfig[]> => providers.list(),
  })
}

/** Whether a keychain secret exists for one provider (status only). */
export function useProviderStatus(id: string) {
  const { providers } = useServices()
  return useQuery({
    queryKey: providerKeys.status(id),
    queryFn: async (): Promise<boolean> => {
      const { hasKey } = await providers.status(id)
      return hasKey
    },
    enabled: id.length > 0,
  })
}

/** Store/replace a provider's secret (write-only; secret never returned). */
export function useSetKey() {
  const { providers } = useServices()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; secret: string }): Promise<void> =>
      providers.setKey(vars.id, vars.secret),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

/** Validate a provider's key via a cheap round-trip through the proxy. */
export function useTestKey() {
  const { providers } = useServices()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<{ model: string }> => {
      const result = await providers.test(id)
      if (isErr(result)) throw new Error(result.error)
      return result.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

/** Create or update a provider config. */
export function useUpsertProvider() {
  const { providers } = useServices()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (draft: ProviderDraft): Promise<ProviderConfig> =>
      providers.upsert(draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}

/** Remove a provider config and delete its keychain secret. */
export function useRemoveProvider() {
  const { providers } = useServices()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string): Promise<void> => providers.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  })
}
