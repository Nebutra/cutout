import type { LocalProjectSummary } from '@/services/local/project-repository.local'

export function filterProjects(
  projects: readonly LocalProjectSummary[],
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return projects
  return projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(needle)
    || project.brief.toLocaleLowerCase().includes(needle),
  )
}
