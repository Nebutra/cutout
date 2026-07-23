import { describe, expect, it } from 'vitest'
import { parseEditableDesignMarkdown } from './design-md'
import {
  designMarkdownToCssVariables,
  designMarkdownToTailwindTheme,
  designMarkdownToTokensJson,
  hasExportableTokens,
  projectDesignMarkdownTokens,
} from './design-md-export'

const DESIGN_MD = [
  '# Design',
  '',
  '## Tokens',
  '',
  '- Primary: #beff50',
  '- Ink: #14140f',
  '- Radius Card: 28px',
  '- Voice: confident and editorial',
  '',
].join('\n')

describe('design markdown exports', () => {
  const model = parseEditableDesignMarkdown(DESIGN_MD)

  it('detects exportable tokens and skips text-only controls', () => {
    expect(hasExportableTokens(model)).toBe(true)
    expect(designMarkdownToTokensJson(model)).not.toContain('confident')
  })

  it('renders css variables from color and number controls', () => {
    const css = designMarkdownToCssVariables(model)
    expect(css).toContain(':root {')
    expect(css).toContain('--primary: #beff50;')
    expect(css).toContain('--radius-card: 28px;')
  })

  it('renders a tailwind v4 theme with color prefix', () => {
    const theme = designMarkdownToTailwindTheme(model)
    expect(theme).toContain('@theme {')
    expect(theme).toContain('--color-primary: #beff50;')
    expect(theme).toContain('--radius-card: 28px;')
  })

  it('renders W3C-style design tokens json', () => {
    const parsed = JSON.parse(designMarkdownToTokensJson(model)) as Record<
      string,
      { $type: string; $value: string }
    >
    expect(parsed['primary']).toEqual({ $type: 'color', $value: '#beff50' })
    expect(parsed['radius-card']).toEqual({ $type: 'dimension', $value: '28px' })
  })

  it('handles documents with no tokens', () => {
    const empty = parseEditableDesignMarkdown('# Notes\n\nJust prose.\n')
    expect(hasExportableTokens(empty)).toBe(false)
    expect(designMarkdownToCssVariables(empty)).toBe(':root {\n}\n')
    expect(designMarkdownToTailwindTheme(empty)).toBe('@theme {\n}\n')
  })

  it('projects validated controls into stable provenance-bound Design IR tokens', () => {
    const projected = projectDesignMarkdownTokens(parseEditableDesignMarkdown([
      '---',
      'tokens:',
      '  color:',
      '    primary: "#beff50"',
      '  spacing:',
      '    md: "16px"',
      '  radius:',
      '    card: "12px"',
      '  typography:',
      '    bodySize: "18px"',
      '---',
      '# Design',
    ].join('\n')), { provenanceId: 'provenance:selection:1' })

    expect(projected).toEqual([
      {
        id: 'token:design-md:color:tokens-color-primary',
        name: 'tokens.color.primary',
        kind: 'color',
        value: '#beff50',
        provenanceId: 'provenance:selection:1',
      },
      {
        id: 'token:design-md:spacing:tokens-spacing-md',
        name: 'tokens.spacing.md',
        kind: 'spacing',
        value: '16px',
        provenanceId: 'provenance:selection:1',
      },
      {
        id: 'token:design-md:radius:tokens-radius-card',
        name: 'tokens.radius.card',
        kind: 'radius',
        value: '12px',
        provenanceId: 'provenance:selection:1',
      },
      {
        id: 'token:design-md:typography:tokens-typography-bodysize',
        name: 'tokens.typography.bodySize',
        kind: 'typography',
        value: '18px',
        provenanceId: 'provenance:selection:1',
      },
    ])
  })

  it('rejects token promotion when the parsed document has not passed DESIGN.md validation', () => {
    expect(() => projectDesignMarkdownTokens(
      parseEditableDesignMarkdown('# Design\n\n- radius: 12px'),
      { provenanceId: 'provenance:selection:1' },
    )).toThrow('valid YAML frontmatter')

    expect(() => projectDesignMarkdownTokens(
      parseEditableDesignMarkdown('---\nradius: 12px\n---\n# Design'),
      { provenanceId: 'provenance:selection:1' },
    )).toThrow('color tokens')
  })
})
