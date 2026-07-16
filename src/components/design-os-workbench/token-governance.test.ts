import { describe, expect, it } from 'vitest'
import type { DesignToken } from '@/design-ir'
import { buildTokenContrastGovernance } from './token-governance'

const color = (id: string, name: string, value: string): DesignToken =>
  ({ id, name, kind: 'color', value }) as DesignToken

describe('buildTokenContrastGovernance', () => {
  it('returns undefined with fewer than two usable colors', () => {
    expect(buildTokenContrastGovernance([])).toBeUndefined()
    expect(buildTokenContrastGovernance([color('a', 'Primary', '#000000')])).toBeUndefined()
  })

  it('flags a low-contrast foreground/background pair as failed and blocks', () => {
    const gov = buildTokenContrastGovernance([
      color('bg', 'Background', '#ffffff'),
      color('faint', 'Faint text', '#eeeeee'), // ~1.1:1 on white — fails
    ])
    expect(gov).toBeDefined()
    const finding = gov!.receipt.findings.find((f) => f.scenarioId === 'token:faint:on:bg')
    expect(finding?.status).toBe('failed')
    expect(gov!.receipt.status).toBe('blocked')
  })

  it('passes a high-contrast pair', () => {
    const gov = buildTokenContrastGovernance([
      color('bg', 'Background', '#ffffff'),
      color('ink', 'Body text', '#111111'), // ~18:1 on white — passes
    ])
    expect(gov).toBeDefined()
    const finding = gov!.receipt.findings.find((f) => f.scenarioId === 'token:ink:on:bg')
    expect(finding?.status).toBe('passed')
    expect(gov!.receipt.status).toBe('passed')
  })

  it('picks a named background and checks every other color against it', () => {
    const gov = buildTokenContrastGovernance([
      color('accent', 'Accent', '#0055ff'),
      color('surface', 'Surface', '#ffffff'),
      color('muted', 'Muted', '#cccccc'),
    ])
    expect(gov).toBeDefined()
    // Two foregrounds (accent, muted) checked against the named background (surface).
    expect(gov!.scenarios.map((s) => s.backgroundTokenId)).toEqual(['surface', 'surface'])
    expect(gov!.receipt.findings).toHaveLength(2)
  })

  it('skips tokens whose value is not a parseable color', () => {
    const gov = buildTokenContrastGovernance([
      color('bg', 'Background', '#ffffff'),
      color('ink', 'Ink', '#000000'),
      color('bad', 'Bad', 'not-a-color'),
    ])
    expect(gov).toBeDefined()
    expect(gov!.receipt.findings).toHaveLength(1) // only ink-on-bg; bad skipped
  })
})
