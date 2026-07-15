import { describe, expect, it } from 'vitest'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'
import { filterProjects } from './project-search'

const project = (id: string, name: string, brief = ''): LocalProjectSummary => ({
  id,
  name,
  brief,
  assetCount: 0,
  hasDesignMarkdown: false,
  status: 'Empty',
  createdAt: 0,
  updatedAt: 0,
})

describe('filterProjects', () => {
  const projects = [
    project('a', 'Brand launch', 'Poster set for spring campaign'),
    project('b', '太湖翠竹', '演示幻灯片'),
    project('c', 'Icon refresh'),
  ]

  it('returns every project for an empty or whitespace query', () => {
    expect(filterProjects(projects, '')).toEqual(projects)
    expect(filterProjects(projects, '   ')).toEqual(projects)
  })

  it('matches names case-insensitively', () => {
    expect(filterProjects(projects, 'brand').map(({ id }) => id)).toEqual(['a'])
    expect(filterProjects(projects, 'ICON').map(({ id }) => id)).toEqual(['c'])
  })

  it('matches briefs and CJK text', () => {
    expect(filterProjects(projects, 'spring').map(({ id }) => id)).toEqual(['a'])
    expect(filterProjects(projects, '翠竹').map(({ id }) => id)).toEqual(['b'])
  })

  it('returns nothing when no project matches', () => {
    expect(filterProjects(projects, 'zzz')).toEqual([])
  })
})
