import { describe, expect, it } from 'vitest'
import { parseEditableDesignMarkdown } from '@/prototype/design-md'
import { astryxThemeTool, describeAstryxColorChoices } from './astryx-tool'
import { astryxColorChoices } from './astryx-design-md'

const DESIGN_MD = [
  '- Primary: #beff50',
  '- Background: #14140f',
].join('\n')

describe('describeAstryxColorChoices', () => {
  it('lists each color as a bullet and reports when there are none', () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const text = describeAstryxColorChoices(astryxColorChoices(model))
    expect(text).toBe('- Primary: #beff50\n- Background: #14140f')
    expect(describeAstryxColorChoices([])).toContain('No color tokens')
  })
})

describe('astryxThemeTool', () => {
  it('rejects an invalid theme name via its input schema', () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const tool = astryxThemeTool(model)
    const parsed = tool.inputSchema.safeParse({
      themeName: 'Not Valid',
      mapping: [{ designTokenLabel: 'Primary', astryxVariable: '--color-accent' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('resolves labels to controls and compiles a real theme', async () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const tool = astryxThemeTool(model)
    const input = tool.inputSchema.parse({
      themeName: 'cutout-theme',
      mapping: [
        { designTokenLabel: 'primary', astryxVariable: '--color-accent' },
        { designTokenLabel: 'Background', astryxVariable: '--color-background-body' },
      ],
    })
    const binding = await tool.execute(input)
    const theme = binding.files.find((file) => file.path === 'astryx/cutout-theme.ts')?.content ?? ''
    expect(theme).toContain('"--color-accent": ["#beff50", "#beff50"]')
    expect(theme).toContain('"--color-background-body": ["#14140f", "#14140f"]')
  })

  it('throws a descriptive error for a label that does not exist', async () => {
    const model = parseEditableDesignMarkdown(DESIGN_MD)
    const tool = astryxThemeTool(model)
    const input = tool.inputSchema.parse({
      themeName: 'cutout-theme',
      mapping: [{ designTokenLabel: 'Accent', astryxVariable: '--color-accent' }],
    })
    await expect(tool.execute(input)).rejects.toThrow('No DESIGN.md color token named "Accent"')
  })

  it('uses a second label as the dark-mode value when provided', async () => {
    const model = parseEditableDesignMarkdown([
      '- Primary: #beff50',
      '- Primary Dark: #9adf2a',
    ].join('\n'))
    const tool = astryxThemeTool(model)
    const input = tool.inputSchema.parse({
      themeName: 'cutout-theme',
      mapping: [{ designTokenLabel: 'Primary', astryxVariable: '--color-accent', darkModeTokenLabel: 'Primary Dark' }],
    })
    const binding = await tool.execute(input)
    const theme = binding.files.find((file) => file.path === 'astryx/cutout-theme.ts')?.content ?? ''
    expect(theme).toContain('"--color-accent": ["#beff50", "#9adf2a"]')
  })
})
