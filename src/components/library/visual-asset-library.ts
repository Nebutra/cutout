import type { GlobalLibraryItem } from '@/global-library'

export type VisualAssetFilter = 'all' | 'image' | 'video' | 'slice' | 'reference'

export function visualAssetCategory(item: GlobalLibraryItem): Exclude<VisualAssetFilter, 'all'> | 'other' {
  if (item.tags.includes('cutout-slice') || item.tags.includes('slice')) return 'slice'
  if (item.tags.includes('reference')) return 'reference'
  if (item.content.artifacts.some(({ mediaType }) => mediaType.startsWith('video/'))) return 'video'
  if (item.content.artifacts.some(({ mediaType }) => mediaType.startsWith('image/'))) return 'image'
  return 'other'
}

export function filterVisualAssets(items: readonly GlobalLibraryItem[], filter: VisualAssetFilter) {
  return filter === 'all' ? items : items.filter((item) => visualAssetCategory(item) === filter)
}

export function duplicateContentGroups(items: readonly GlobalLibraryItem[]) {
  const groups = new Map<string, GlobalLibraryItem[]>()
  for (const item of items) groups.set(item.contentSha256, [...(groups.get(item.contentSha256) ?? []), item])
  return new Map([...groups].filter(([, entries]) => entries.length > 1))
}

/** Only recorded fork/update ancestry counts as a More-like-this result. */
export function lineageResults(parent: GlobalLibraryItem, items: readonly GlobalLibraryItem[]) {
  return items.filter((item) => item.lineage.parent?.itemId === parent.id && item.lineage.parent.version === parent.version && item.lineage.parent.contentSha256 === parent.contentSha256)
}
