import { describe, expect, it } from 'vitest'
import {
  GENERAL_TOOL_LOOP_MAX_OUTPUT_TOKENS,
  GENERATION_DECISION_MAX_OUTPUT_TOKENS,
  generationToolLoopMaxOutputTokens,
  generationDecisionSchema,
  proceedWithGenerationTool,
} from './generation-tool'

describe('proceedWithGenerationTool', () => {
  it('is a pure passthrough decision tool, read-only', async () => {
    const tool = proceedWithGenerationTool()
    expect(tool.name).toBe('proceed_with_generation')
    expect(tool.isReadOnly).toBe(true)
    expect(tool.description.length).toBeGreaterThan(0)
    const input = tool.inputSchema.parse({
      refinedBrief: 'A travel planner for independent travelers.',
    })
    await expect(tool.execute(input)).resolves.toEqual(input)
  })

  it('requires a non-empty refined brief', () => {
    expect(generationDecisionSchema.safeParse({ refinedBrief: '' }).success).toBe(false)
    expect(generationDecisionSchema.safeParse({}).success).toBe(false)
    expect(generationDecisionSchema.safeParse({
      refinedBrief: 'Build a travel planner.',
    }).success).toBe(true)
    expect(generationDecisionSchema.safeParse({
      refinedBrief: 'Build a travel planner.',
      planningSeed: { suites: [] },
    }).success).toBe(false)
  })

  it('keeps route topology and material planning out of the tool gate', () => {
    const tool = proceedWithGenerationTool()
    expect(tool.description).toContain('only decides whether to proceed')
    expect(tool.description).toContain('Planner remains the sole owner')
    expect(Object.keys(generationDecisionSchema.shape)).toEqual(['refinedBrief'])
    expect(GENERATION_DECISION_MAX_OUTPUT_TOKENS).toBe(2_000)
  })

  it('uses the short ceiling only for the classification-only tool set', () => {
    expect(generationToolLoopMaxOutputTokens([
      'proceed_with_generation',
      'ask_clarifying_question',
      'reply_conversationally',
    ])).toBe(GENERATION_DECISION_MAX_OUTPUT_TOKENS)
    expect(generationToolLoopMaxOutputTokens([
      'proceed_with_generation',
      'compile_astryx_theme',
    ])).toBe(GENERAL_TOOL_LOOP_MAX_OUTPUT_TOKENS)
  })
})
