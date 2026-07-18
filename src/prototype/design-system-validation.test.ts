import { describe, expect, it } from 'vitest'
import { designSystemMarkdownValidationError, designSystemValidationError } from './design-system-validation'

const validMarkdown = [
  '---',
  'primary: "#10b981"',
  'radius: 12px',
  '---',
  '',
  '# Design system',
].join('\n')

describe('designSystemValidationError', () => {
  it('accepts a decodable design system with concrete tokens', () => {
    expect(designSystemValidationError({ width: 1024, height: 768, designMarkdown: validMarkdown })).toBeNull()
  })

  it('rejects invalid imagery and documentation without exportable tokens', () => {
    expect(designSystemValidationError({ width: 0, height: 768, designMarkdown: validMarkdown })).toContain('invalid dimensions')
    expect(designSystemValidationError({ width: 1024, height: 768, designMarkdown: '---\ncolors:\n  intent:\n    - green\n---\n# Overview' })).toContain('no exportable')
    expect(designSystemValidationError({ width: 1024, height: 768, designMarkdown: '# Overview' })).toContain('missing YAML')
  })

  it('shares the same token contract with image-grounded synthesis', () => {
    expect(designSystemMarkdownValidationError(validMarkdown)).toBeNull()
    expect(designSystemMarkdownValidationError('---\nname: Visual direction\n---\n# Overview')).toContain('no exportable')
  })
})
