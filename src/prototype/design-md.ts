export interface ParsedDesignMarkdown {
  readonly frontmatter: string | null
  readonly body: string
}

export function isDesignMarkdownFileName(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return (
    lower === 'design.md' ||
    lower.endsWith('/design.md') ||
    lower.endsWith('.design.md') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown')
  )
}

export function parseDesignMarkdown(content: string): ParsedDesignMarkdown {
  const text = content.replace(/^\uFEFF/, '')
  if (!text.startsWith('---\n')) return { frontmatter: null, body: text }

  const end = text.indexOf('\n---', 4)
  if (end < 0) return { frontmatter: null, body: text }

  const afterFence = text.slice(end + 4)
  const body = afterFence.startsWith('\n') ? afterFence.slice(1) : afterFence
  return {
    frontmatter: text.slice(4, end).trim(),
    body,
  }
}

export function normalizedDesignMarkdown(content: string): string {
  return content.replace(/^\uFEFF/, '').trim()
}
