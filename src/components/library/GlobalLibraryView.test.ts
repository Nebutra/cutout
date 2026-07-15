import { describe, expect, it } from 'vitest'
import type { GlobalLibraryItem } from '@/global-library'
import { filterLibraryItems } from './global-library-filter'

const base = { id: 'kit.alpha', kind: 'brand-kit', name: 'Alpha Brand', description: 'Retail identity', tags: ['retail'], collections: ['favorites'], qualityReceipts: [{ status: 'passed' }] } as unknown as GlobalLibraryItem

describe('Global Library product filters', () => {
  it('keeps type, text, collection and quality filters conjunctive', () => {
    expect(filterLibraryItems([base], { kind: 'brand-kit', query: 'retail', collection: 'favorites', quality: 'passed' })).toEqual([base])
    expect(filterLibraryItems([base], { kind: 'design-system-kit', query: '', collection: 'all', quality: 'all' })).toEqual([])
    expect(filterLibraryItems([{ ...base, qualityReceipts: [{ ...base.qualityReceipts[0]!, status: 'failed' }] }], { kind: 'brand-kit', query: '', collection: 'all', quality: 'attention' })).toHaveLength(1)
  })

  it('does not present unverified or archived items as verified', () => {
    expect(filterLibraryItems([{ ...base, qualityReceipts: [] }], { kind: 'brand-kit', query: '', collection: 'all', quality: 'passed' })).toEqual([])
    expect(filterLibraryItems([{ ...base, archivedAt: '2026-07-12T00:00:00Z' }], { kind: 'brand-kit', query: '', collection: 'all', quality: 'all' })).toEqual([])
  })
})
