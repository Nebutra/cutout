import { describe, expect, it } from 'vitest'
import {
  isDesignMarkdownFileName,
  normalizedDesignMarkdown,
  parseDesignMarkdown,
} from './design-md'

describe('DESIGN.md helpers', () => {
  it('recognizes DESIGN.md ecosystem filenames', () => {
    expect(isDesignMarkdownFileName('DESIGN.md')).toBe(true)
    expect(isDesignMarkdownFileName('brand.design.md')).toBe(true)
    expect(isDesignMarkdownFileName('notes.markdown')).toBe(true)
    expect(isDesignMarkdownFileName('mockup.png')).toBe(false)
  })

  it('parses optional YAML frontmatter and markdown body', () => {
    const parsed = parseDesignMarkdown('---\nversion: alpha\nname: Demo\n---\n# Demo\nUse blue.')

    expect(parsed.frontmatter).toContain('version: alpha')
    expect(parsed.body).toBe('# Demo\nUse blue.')
  })

  it('normalizes BOM and surrounding whitespace', () => {
    expect(normalizedDesignMarkdown('\uFEFF  # Design\n')).toBe('# Design')
  })
})
