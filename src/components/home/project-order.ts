import type { LocalProjectSummary } from '@/services/local/project-repository.local'

export function sortProjects(projects: readonly LocalProjectSummary[]) {
  return [...projects].sort((left, right) => {
    const pinOrder = (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0)
    return pinOrder || right.updatedAt - left.updatedAt
  })
}
