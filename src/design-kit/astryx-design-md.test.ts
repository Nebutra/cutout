import { describe, expect, it } from 'vitest'
import { parseEditableDesignMarkdown } from '@/prototype/design-md'
import {
  astryxColorChoices,
  automaticAstryxMapping,
  compileAstryxThemeFromDesignMarkdown,
  suggestAstryxMapping,
} from './astryx-design-md'

const DESIGN_MD = [
  '# Design',
  '',
  '## Tokens',
  '',
  '- Primary: #beff50',
  '- Background: #14140f',
  '- Text Secondary: #919183',
  '- Radius Card: 28px',
  '- Voice: confident and editorial',
  '',
].join('\n')

describe('astryxColorChoices', () => {
  it('lists only color controls, skipping text and number tokens', () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const choices = astryxColorChoices(model)
    expect(choices.map((choice) => choice.label)).toEqual(['Primary', 'Background', 'Text Secondary'])
  })
})

describe('suggestAstryxMapping', () => {
  it('matches common labels to Astryx variables and leaves the rest unmapped', () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const choices = astryxColorChoices(model)
    const suggestions = suggestAstryxMapping(choices)
    const byLabel = new Map(choices.map((choice) => [choice.label, suggestions.get(choice.controlId)]))
    expect(byLabel.get('Primary')).toBe('--color-accent')
    expect(byLabel.get('Background')).toBe('--color-background-body')
    expect(byLabel.get('Text Secondary')).toBe('--color-text-secondary')
  })

  it('never suggests the same variable twice, even when two labels would both match it', () => {
    const model = parseEditableDesignMarkdown([
      '- Primary: #111111',
      '- Accent: #222222',
    ].join('\n'))
    const choices = astryxColorChoices(model)
    const suggestions = suggestAstryxMapping(choices)
    const byLabel = new Map(choices.map((choice) => [choice.label, suggestions.get(choice.controlId)]))
    expect(byLabel.get('Primary')).toBe('--color-accent')
    expect(byLabel.get('Accent')).toBeNull()
    const assigned = [...suggestions.values()].filter((value): value is string => value !== null)
    expect(new Set(assigned).size).toBe(assigned.length)
  })
})

describe('automaticAstryxMapping', () => {
  it('assigns unlabelled palettes to common visual roles without user setup', () => {
    const choices = astryxColorChoices(parseEditableDesignMarkdown([
      '---',
      'tokens:',
      '  colors:',
      '    warm_ivory: "#F8F1E7"',
      '    feather_cream: "#F3D9B1"',
      '    soft_ochre: "#D9A441"',
      '    ink_brown: "#3A2416"',
      '    muted_red: "#B85C38"',
      '---',
    ].join('\n')))
    const mapping = automaticAstryxMapping(choices)
    const byLabel = new Map(choices.map((choice) => [choice.label, mapping.get(choice.controlId)]))

    expect(byLabel.get('tokens.colors.warm_ivory')).toBe('--color-background-body')
    expect(byLabel.get('tokens.colors.feather_cream')).toBe('--color-background-surface')
    expect(byLabel.get('tokens.colors.ink_brown')).toBe('--color-text-primary')
    expect(byLabel.get('tokens.colors.soft_ochre')).toBe('--color-accent')
  })
})

describe('compileAstryxThemeFromDesignMarkdown', () => {
  it('compiles a confirmed mapping into a real Astryx defineTheme file', async () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const choices = astryxColorChoices(model)
    const primary = choices.find((choice) => choice.label === 'Primary')
    const background = choices.find((choice) => choice.label === 'Background')
    if (!primary || !background) throw new Error('fixture missing expected controls')

    const binding = await compileAstryxThemeFromDesignMarkdown(model, 'cutout-theme', [
      { controlId: primary.controlId, astryxVariable: '--color-accent' },
      { controlId: background.controlId, astryxVariable: '--color-background-body' },
    ])

    const theme = binding.files.find((file) => file.path === 'astryx/cutout-theme.ts')?.content ?? ''
    expect(theme).toContain("from '@astryxdesign/core/theme'")
    expect(theme).toContain('"--color-accent": ["#beff50", "#beff50"]')
    expect(theme).toContain('"--color-background-body": ["#14140f", "#14140f"]')
    expect(binding.capability.status).toBe('adapter-required')
  })

  it('uses a second mapped control as the dark-mode value when provided', async () => {
    const model = parseEditableDesignMarkdown([
      '- Primary: #beff50',
      '- Primary Dark: #9adf2a',
    ].join('\n'))
    const choices = astryxColorChoices(model)
    const light = choices.find((choice) => choice.label === 'Primary')
    const dark = choices.find((choice) => choice.label === 'Primary Dark')
    if (!light || !dark) throw new Error('fixture missing expected controls')

    const binding = await compileAstryxThemeFromDesignMarkdown(model, 'cutout-theme', [
      { controlId: light.controlId, astryxVariable: '--color-accent', darkControlId: dark.controlId },
    ])

    const theme = binding.files.find((file) => file.path === 'astryx/cutout-theme.ts')?.content ?? ''
    expect(theme).toContain('"--color-accent": ["#beff50", "#9adf2a"]')
  })
})
