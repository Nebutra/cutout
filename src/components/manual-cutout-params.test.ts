import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentSource = (path: string) =>
  readFileSync(join(process.cwd(), 'src/components', path), 'utf8')

describe('manual cutout parameter UI', () => {
  it('removes parameter controls from settings and source UI', () => {
    const general = componentSource('settings/sections/GeneralSection.tsx')

    expect(general).not.toMatch(/Cutout parameters|resetParams|reset_params/)
    expect(existsSync(join(
      process.cwd(),
      'src/components/settings/sections/AdvancedSection.tsx',
    ))).toBe(false)
    expect(existsSync(join(
      process.cwd(),
      'src/components/source/ParameterControls.tsx',
    ))).toBe(false)
    expect(existsSync(join(
      process.cwd(),
      'src/components/source/ParameterSlider.tsx',
    ))).toBe(false)
  })

  it('does not offer numeric tuning commands in the empty result state', () => {
    const emptyState = componentSource('slices/SliceGridEmpty.tsx')

    expect(emptyState).not.toMatch(/setParam|threshold|min-area|halveMinArea/)
    expect(emptyState).toContain('Try a different asset sheet.')
  })
})
