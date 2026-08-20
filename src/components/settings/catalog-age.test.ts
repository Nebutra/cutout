import { describe, expect, it } from 'vitest'
import { catalogAge } from './catalog-age'

const NOW = Date.parse('2026-08-20T12:00:00.000Z')

describe('catalogAge', () => {
  it('reports the coarsest honest unit', () => {
    expect(catalogAge('2026-08-20T11:59:30.000Z', 'en', NOW)).toBe('this minute')
    expect(catalogAge('2026-08-20T11:45:00.000Z', 'en', NOW)).toBe('15 minutes ago')
    expect(catalogAge('2026-08-20T09:00:00.000Z', 'en', NOW)).toBe('3 hours ago')
    expect(catalogAge('2026-08-18T12:00:00.000Z', 'en', NOW)).toBe('2 days ago')
  })

  it('follows the active locale', () => {
    expect(catalogAge('2026-08-20T09:00:00.000Z', 'zh-CN', NOW)).toBe('3小时前')
  })

  it('says nothing when there is no usable timestamp', () => {
    // A connection whose catalog was never probed, or a record written by a
    // build that stored something other than an ISO timestamp.
    expect(catalogAge(undefined, 'en', NOW)).toBeUndefined()
    expect(catalogAge('not-a-date', 'en', NOW)).toBeUndefined()
  })
})
