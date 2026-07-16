import { describe, expect, it } from 'vitest'
import { generationDecisionSchema, proceedWithGenerationTool } from './generation-tool'

describe('proceedWithGenerationTool', () => {
  it('is a pure passthrough decision tool, read-only', async () => {
    const tool = proceedWithGenerationTool()
    expect(tool.name).toBe('proceed_with_generation')
    expect(tool.isReadOnly).toBe(true)
    expect(tool.description.length).toBeGreaterThan(0)
    const input = tool.inputSchema.parse({ refinedBrief: 'A budgeting app for freelancers.' })
    await expect(tool.execute(input)).resolves.toEqual(input)
  })

  it('requires a non-empty refined brief', () => {
    expect(generationDecisionSchema.safeParse({ refinedBrief: '' }).success).toBe(false)
    expect(generationDecisionSchema.safeParse({}).success).toBe(false)
    expect(
      generationDecisionSchema.safeParse({ refinedBrief: 'Redesign the checkout flow.' }).success,
    ).toBe(true)
  })
})
