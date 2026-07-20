export function parseSkillFrontmatter(source) {
  return source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
}
