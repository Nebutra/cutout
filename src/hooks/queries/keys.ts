/**
 * Query key factories (spec §5).
 *
 * Centralised so mutations can invalidate exact subtrees and the future remote
 * impls reuse the same keys. `as const` keeps the tuples literally typed for
 * TanStack Query's key matching.
 */
import type { AssetListFilter } from '@/services/types'

export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all, 'list'] as const,
  list: (filter?: AssetListFilter) =>
    [...assetKeys.lists(), filter?.query ?? ''] as const,
  one: (id: string) => [...assetKeys.all, 'one', id] as const,
}

export const cutoutKeys = {
  all: ['cutout'] as const,
}
