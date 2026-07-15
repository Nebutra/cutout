import { describe, expect, it } from 'vitest'
import { configureRegenerationTool, regenerationDecisionSchema } from './regeneration-tool'

describe('configureRegenerationTool', () => {
  it('is a pure passthrough — execute returns exactly what it validated', async () => {
    const tool = configureRegenerationTool()
    const input = tool.inputSchema.parse({
      forceRegenerateDesignSystem: true,
      parallelPageGeneration: 'parallel',
    })
    await expect(tool.execute(input)).resolves.toEqual(input)
  })

  it('defaults parallelPageGeneration to "auto" when omitted', () => {
    const parsed = regenerationDecisionSchema.parse({ forceRegenerateDesignSystem: false })
    expect(parsed.parallelPageGeneration).toBe('auto')
  })

  it('rejects a non-boolean forceRegenerateDesignSystem', () => {
    const result = regenerationDecisionSchema.safeParse({ forceRegenerateDesignSystem: 'yes' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid parallelPageGeneration value', () => {
    const result = regenerationDecisionSchema.safeParse({
      forceRegenerateDesignSystem: true,
      parallelPageGeneration: 'sometimes',
    })
    expect(result.success).toBe(false)
  })
})
