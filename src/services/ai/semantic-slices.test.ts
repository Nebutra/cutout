import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { ok, type Result } from '@/services/types'
import type {
  EditImageInput,
  GeneratedAsset,
  GenerateInput,
  GenerationService,
} from './types'
import {
  generateSemanticSlice,
  generatedSliceValidationSchema,
  planSemanticSlices,
  runSemanticSliceExperiment,
  semanticSlicePlanSchema,
  type GeneratedSliceValidation,
  type SemanticSlicePlan,
} from './semantic-slices'

const png = (value: number): GeneratedAsset => ({
  mediaType: 'image/png',
  bytes: new Uint8Array([value]),
})

const plan: SemanticSlicePlan = {
  version: 'semantic-slices.v0',
  sourceSummary: 'Government portal with search, service cards, and emblem.',
  style: {
    domain: 'public service website',
    palette: ['red', 'blue', 'white'],
    density: 'medium',
    tone: 'trustworthy',
  },
  slices: [
    {
      id: 'slice-01',
      name: 'national-emblem',
      role: 'brand mark',
      description: 'A regenerated official-style circular emblem.',
      priority: 'required',
      targetSize: { width: 256, height: 256 },
      background: 'transparent',
      styleHints: ['crisp vector-like edges'],
      generationPrompt: 'Create a formal red and gold emblem.',
      mustInclude: ['red circular seal', 'gold central symbol'],
      mustExclude: ['full page', 'neighboring controls'],
    },
    {
      id: 'slice-02',
      name: 'search-button',
      role: 'primary action',
      description: 'A red rounded square search button with a white magnifier.',
      priority: 'required',
      targetSize: { width: 96, height: 96 },
      background: 'transparent',
      styleHints: ['rounded corners', 'flat UI'],
      generationPrompt: 'Create one red search button.',
      mustInclude: ['magnifier icon'],
      mustExclude: ['input field', 'second icon'],
    },
  ],
}

function fakeGeneration(config: {
  readonly objectResults?: readonly Result<unknown>[]
  readonly imageResults?: readonly Result<GeneratedAsset[]>[]
  readonly editResults?: readonly Result<GeneratedAsset[]>[]
}) {
  const objectCalls: Array<{ input: GenerateInput; schema: unknown }> = []
  const imageCalls: GenerateInput[] = []
  const editCalls: EditImageInput[] = []
  const objectResults = [...(config.objectResults ?? [])]
  const imageResults = [...(config.imageResults ?? [])]
  const editResults = [...(config.editResults ?? [])]

  const generation: Pick<
    GenerationService,
    'generateObject' | 'generateImages' | 'editImage'
  > = {
    async generateObject<T>(
      input: GenerateInput,
      schema: z.ZodType<T>,
    ): Promise<Result<T>> {
      objectCalls.push({ input, schema })
      const result = objectResults.shift() ?? ok({})
      return result as Result<T>
    },
    async generateImages(input): Promise<Result<GeneratedAsset[]>> {
      imageCalls.push(input)
      return imageResults.shift() ?? ok([png(9)])
    },
    async editImage(input): Promise<Result<GeneratedAsset[]>> {
      editCalls.push(input)
      return editResults.shift() ?? ok([png(8)])
    },
  }

  return { editCalls, generation, imageCalls, objectCalls }
}

describe('semantic slice experiment', () => {
  it('rejects duplicate semantic ids before generation can bind production tasks', () => {
    expect(semanticSlicePlanSchema.safeParse({
      ...plan,
      slices: [plan.slices[0], { ...plan.slices[1], id: plan.slices[0].id }],
    }).success).toBe(false)
  })

  it('plans atomic slice specs from brief plus optional reference image', async () => {
    const { generation, objectCalls } = fakeGeneration({
      objectResults: [ok(plan)],
    })

    const res = await planSemanticSlices(
      { generation },
      {
        providerId: 'reasoning-provider',
        model: 'gpt-5.5',
        brief: '政府官网',
        referenceImage: new Uint8Array([1, 2, 3]),
        maxSlices: 1,
      },
    )

    expect(res.ok).toBe(true)
    expect(res.ok && res.data.slices).toHaveLength(1)
    expect(objectCalls).toHaveLength(1)
    expect(objectCalls[0].schema).toBe(semanticSlicePlanSchema)
    expect(objectCalls[0].input.providerId).toBe('reasoning-provider')
    expect(objectCalls[0].input.model).toBe('gpt-5.5')
    expect(objectCalls[0].input.system).toContain('Semantic UI Asset Planner')
    expect(objectCalls[0].input.system).toContain(
      'not a UI component library planner',
    )
    expect(objectCalls[0].input.system).toContain(
      'cards, buttons, inputs, skeletons, nav bars, toolbars, list items, price rows, forms, or full panels',
    )
    expect(objectCalls[0].input.system).toContain('Do not plan text as assets')
    expect(objectCalls[0].input.system).toContain('individual letters/characters')
    expect(objectCalls[0].input.input?.[0]).toEqual(
      expect.objectContaining({ type: 'text' }),
    )
    expect(objectCalls[0].input.input?.[1]).toEqual(
      expect.objectContaining({ type: 'image' }),
    )
  })

  it('generates a single transparent slice from a semantic spec', async () => {
    const { generation, imageCalls } = fakeGeneration({
      imageResults: [ok([png(4)])],
    })

    const res = await generateSemanticSlice(
      { generation },
      {
        providerId: 'image-provider',
        model: 'gpt-image-2',
        spec: plan.slices[0],
        plan,
      },
    )

    expect(res).toEqual(ok(png(4)))
    expect(imageCalls).toHaveLength(1)
    expect(imageCalls[0].prompt).toContain('Slice id: slice-01')
    expect(imageCalls[0].prompt).toContain('transparent-background PNG')
    expect(imageCalls[0].prompt).toContain('Exactly one standalone asset')
    expect(imageCalls[0].prompt).toContain('No text-only assets')
    expect(imageCalls[0].prompt).toContain('Target canvas: 256x256')
  })

  it('uses image edits for img2img slice generation', async () => {
    const { editCalls, generation } = fakeGeneration({
      editResults: [ok([png(5)])],
    })

    const res = await generateSemanticSlice(
      { generation },
      {
        providerId: 'image-provider',
        model: 'gpt-image-2',
        spec: plan.slices[1],
        plan,
        route: 'image-to-image',
        referenceImages: [new Uint8Array([9, 9])],
      },
    )

    expect(res).toEqual(ok(png(5)))
    expect(editCalls).toHaveLength(1)
    expect(editCalls[0].inputFidelity).toBe('high')
    expect(editCalls[0].images).toHaveLength(1)
    expect(editCalls[0].prompt).toContain('Use the reference image only')
    expect(editCalls[0].prompt).toContain('Slice id: slice-02')
  })

  it('runs parallel routes and records validation pass or retry', async () => {
    const pass: GeneratedSliceValidation = {
      verdict: 'pass',
      hasSingleSubject: true,
      hasTransparentBackground: true,
      matchesSpec: true,
      issues: [],
    }
    const retry: GeneratedSliceValidation = {
      verdict: 'retry',
      hasSingleSubject: false,
      hasTransparentBackground: true,
      matchesSpec: false,
      issues: ['multiple subjects detected'],
      suggestedPromptPatch: 'Ask for one icon only.',
    }
    const { editCalls, generation, imageCalls, objectCalls } = fakeGeneration({
      objectResults: [ok(plan), ok(pass), ok(retry)],
      imageResults: [ok([png(1)])],
      editResults: [ok([png(2)])],
    })

    const res = await runSemanticSliceExperiment(
      { generation },
      {
        providerId: 'reasoning-provider',
        model: 'gpt-5.5',
        imageProviderId: 'image-provider',
        imageModel: 'gpt-image-2',
        brief: '政府官网',
        maxSlices: 1,
        routes: ['text-to-image', 'image-to-image'],
        referenceImages: [new Uint8Array([7])],
      },
    )

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(imageCalls).toHaveLength(1)
    expect(editCalls).toHaveLength(1)
    expect(objectCalls.map((call) => call.schema)).toEqual([
      semanticSlicePlanSchema,
      generatedSliceValidationSchema,
      generatedSliceValidationSchema,
    ])
    expect(res.data.artifacts).toHaveLength(2)
    expect(res.data.summary).toEqual({
      requestedSpecs: 1,
      attemptedArtifacts: 2,
      generatedArtifacts: 2,
      acceptedArtifacts: 1,
      retryableArtifacts: 1,
      failedArtifacts: 0,
    })
  })
})
