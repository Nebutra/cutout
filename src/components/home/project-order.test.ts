import { describe, expect, it } from 'vitest'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'
import { sortProjects } from './project-order'

const project = (
  id: string,
  updatedAt: number,
  pinnedAt?: number,
): LocalProjectSummary => ({
  id,
  name: id,
  brief: '',
  assetCount: 0,
  hasDesignMarkdown: false,
  status: 'Empty',
  createdAt: 0,
  updatedAt,
  pinnedAt,
})

describe('sortProjects', () => {
  it('orders pinned projects by pin recency before unpinned project recency', () => {
    const sorted = sortProjects([
      project('recent', 900),
      project('older-pin', 200, 10),
      project('newer-pin', 100, 20),
      project('older', 300),
    ])
    expect(sorted.map(({ id }) => id)).toEqual([
      'newer-pin',
      'older-pin',
      'recent',
      'older',
    ])
  })

  it('does not mutate repository order', () => {
    const input = [project('older', 1), project('newer', 2)]
    sortProjects(input)
    expect(input.map(({ id }) => id)).toEqual(['older', 'newer'])
  })
})
