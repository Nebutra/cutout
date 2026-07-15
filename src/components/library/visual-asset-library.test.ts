import { describe, expect, it } from 'vitest'
import type { GlobalLibraryItem } from '@/global-library'
import { duplicateContentGroups, filterVisualAssets, lineageResults, visualAssetCategory } from './visual-asset-library'

const asset = (id: string, mediaType = 'image/png', tags: string[] = [], hash = id.padEnd(64, 'a')) => ({ id, version: '1.0.0', kind: 'visual-asset', tags, contentSha256: hash, content: { artifacts: [{ mediaType }] }, lineage: { depth: 0, root: { itemId: id, version: '1.0.0', contentSha256: hash } } }) as unknown as GlobalLibraryItem

describe('Visual Asset Library projections', () => {
  it('uses recorded media types and tags without claiming processing', () => {
    expect(visualAssetCategory(asset('image'))).toBe('image')
    expect(visualAssetCategory(asset('video', 'video/mp4'))).toBe('video')
    expect(visualAssetCategory(asset('slice', 'image/png', ['cutout-slice']))).toBe('slice')
    expect(filterVisualAssets([asset('image'), asset('video', 'video/mp4')], 'video')).toHaveLength(1)
  })
  it('reports exact content-hash duplicates and exact lineage descendants only', () => {
    const parent = asset('parent'), duplicate = asset('duplicate', 'image/png', [], parent.contentSha256)
    const child = { ...asset('child'), origin: { kind: 'forked', itemId: parent.id, version: parent.version, contentSha256: parent.contentSha256 }, lineage: { root: parent.lineage.root, parent: { itemId: parent.id, version: parent.version, contentSha256: parent.contentSha256 }, depth: 1 } } as GlobalLibraryItem
    expect(duplicateContentGroups([parent, duplicate]).get(parent.contentSha256)).toHaveLength(2)
    expect(lineageResults(parent, [duplicate, child])).toEqual([child])
  })
})
