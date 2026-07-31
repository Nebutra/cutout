import { describe, expect, it } from 'vitest'
import {
  GENERATION_DECISION_MAX_OUTPUT_TOKENS,
  generationDecisionSchema,
  proceedWithGenerationTool,
} from './generation-tool'

const planningSeed = {
  product: {
    name: 'Roam',
    summary: 'A calm travel planning workspace.',
    audience: 'Independent travelers',
    primaryGoal: 'Turn saved places into a trip.',
    platform: 'responsive web app',
  },
  rationale: 'Compare an editorial route model with a map-first workflow.',
  suites: [
    {
      direction: {
        id: 'editorial',
        label: 'Editorial journal',
        thesis: 'Build anticipation through destination storytelling.',
        vary: ['content hierarchy'],
        preserve: ['calm tone'],
      },
      pages: [{
        id: 'discover',
        name: 'Discover',
        route: '/discover',
        purpose: 'Browse destination stories.',
        viewport: { platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll' },
        materials: [],
      }],
    },
    {
      direction: {
        id: 'map-first',
        label: 'Map first',
        thesis: 'Make spatial planning the center of the experience.',
        vary: ['navigation model'],
        preserve: ['calm tone'],
      },
      pages: [{
        id: 'atlas',
        name: 'Atlas',
        route: '/atlas',
        purpose: 'Arrange saved places spatially.',
        viewport: { platform: 'desktop', width: 1440, height: 1000, scroll: 'single-screen' },
        materials: [
          {
            id: 'map-marker-set',
            name: 'Map marker set',
            description: 'Reusable illustrated place markers.',
            production: 'board-cutout',
            boardGroupId: 'place-markers',
          },
          {
            id: 'atlas-map',
            name: 'Atlas map',
            description: 'Art-directed spatial overview for the trip.',
            production: 'direct-generate',
          },
        ],
      }],
    },
  ],
}

describe('proceedWithGenerationTool', () => {
  it('is a pure passthrough decision tool, read-only', async () => {
    const tool = proceedWithGenerationTool()
    expect(tool.name).toBe('proceed_with_generation')
    expect(tool.isReadOnly).toBe(true)
    expect(tool.description.length).toBeGreaterThan(0)
    const input = tool.inputSchema.parse({
      refinedBrief: 'A travel planner for independent travelers.',
      planningSeed,
    })
    await expect(tool.execute(input)).resolves.toEqual(input)
  })

  it('requires a non-empty refined brief', () => {
    expect(generationDecisionSchema.safeParse({ refinedBrief: '' }).success).toBe(false)
    expect(generationDecisionSchema.safeParse({}).success).toBe(false)
    expect(generationDecisionSchema.safeParse({
      refinedBrief: 'Build a travel planner.',
      planningSeed,
    }).success).toBe(true)
    expect(generationDecisionSchema.safeParse({
      refinedBrief: 'Build a travel planner.',
    }).success).toBe(false)

    const missingBoardGroup = structuredClone(planningSeed)
    delete (missingBoardGroup.suites[1]!.pages[0]!.materials[0] as {
      boardGroupId?: string
    }).boardGroupId
    expect(generationDecisionSchema.safeParse({
      refinedBrief: 'Build a travel planner.',
      planningSeed: missingBoardGroup,
    }).success).toBe(false)
  })

  it('makes the Agent own complete route topology instead of enforcing a count', () => {
    const tool = proceedWithGenerationTool()
    expect(tool.description).toContain('derive each complete suite from its domain and journeys')
    expect(tool.description).toContain('page count in the seed rationale')
    expect(generationDecisionSchema.shape.planningSeed.description).toContain(
      'not authority to pad or truncate the graph',
    )
    expect(generationDecisionSchema.shape.planningSeed.description).toContain(
      'zero or more non-UI visual materials',
    )
    expect(generationDecisionSchema.shape.planningSeed.description).toMatch(
      /never invent a fixed per-page quantity/i,
    )
    expect(generationDecisionSchema.shape.planningSeed.description).toContain(
      'split unrelated or dense sets into multiple groups',
    )
    expect(tool.description).toContain('Board grouping is also an Agent planning decision')
    expect(GENERATION_DECISION_MAX_OUTPUT_TOKENS).toBeGreaterThan(6_000)
  })
})
