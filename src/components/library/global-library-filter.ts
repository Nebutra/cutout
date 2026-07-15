import type { GlobalLibraryItem, LibraryItemKind } from '@/global-library'

export function filterLibraryItems(items: readonly GlobalLibraryItem[], filter: { readonly kind: LibraryItemKind; readonly query: string; readonly collection: string; readonly quality: 'all' | 'passed' | 'attention' }) {
  const query = filter.query.trim().toLowerCase()
  return items.filter((item) => !item.archivedAt && item.kind === filter.kind && (filter.collection === 'all' || item.collections.includes(filter.collection)) && (filter.quality !== 'passed' || (item.qualityReceipts.length > 0 && item.qualityReceipts.every(({ status }) => status === 'passed'))) && (filter.quality !== 'attention' || item.qualityReceipts.some(({ status }) => status === 'failed')) && `${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(query))
}
