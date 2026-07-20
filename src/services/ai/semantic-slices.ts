import { z } from 'zod'
import type { PromptPart } from '@/prompts/types'
import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type {
  EditImageInput,
  GeneratedAsset,
  GenerateInput,
  GenerationService,
} from './types'

const DEFAULT_MAX_SLICES = 24

export const semanticSliceSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['required', 'optional']).default('required'),
  targetSize: z.object({
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
  }),
  background: z.literal('transparent').default('transparent'),
  styleHints: z.array(z.string().min(1)).default([]),
  generationPrompt: z.string().min(1),
  mustInclude: z.array(z.string().min(1)).default([]),
  mustExclude: z.array(z.string().min(1)).default([]),
})

export const semanticSlicePlanSchema = z.object({
  version: z.literal('semantic-slices.v0'),
  sourceSummary: z.string().min(1),
  style: z.object({
    domain: z.string().min(1),
    palette: z.array(z.string().min(1)).default([]),
    density: z.string().min(1),
    tone: z.string().min(1),
  }),
  slices: z.array(semanticSliceSpecSchema).min(1),
}).superRefine((plan, context) => {
  const ids = new Set<string>()
  for (const slice of plan.slices) {
    if (ids.has(slice.id)) {
      context.addIssue({
        code: 'custom',
        path: ['slices'],
        message: `Semantic slice ids must be unique: ${slice.id}`,
      })
    }
    ids.add(slice.id)
  }
})

export const generatedSliceValidationSchema = z.object({
  verdict: z.enum(['pass', 'retry', 'reject']),
  hasSingleSubject: z.boolean(),
  hasTransparentBackground: z.boolean(),
  matchesSpec: z.boolean(),
  issues: z.array(z.string()).default([]),
  suggestedPromptPatch: z.string().optional(),
})

export type SemanticSliceSpec = z.infer<typeof semanticSliceSpecSchema>
export type SemanticSlicePlan = z.infer<typeof semanticSlicePlanSchema>
export type GeneratedSliceValidation = z.infer<
  typeof generatedSliceValidationSchema
>
export type SemanticSliceRoute = 'text-to-image' | 'image-to-image'

export interface SemanticSliceDeps {
  readonly generation: Pick<
    GenerationService,
    'generateObject' | 'generateImages' | 'editImage'
  >
}

export interface SemanticSlicePlanParams {
  readonly providerId: string
  readonly model?: string
  readonly brief: string
  readonly sourceKind?: 'brief' | 'mockup' | 'board' | 'mixed'
  readonly referenceImage?: Uint8Array
  readonly maxSlices?: number
  readonly signal?: AbortSignal
}

export interface GenerateSemanticSliceParams {
  readonly providerId: string
  readonly model?: string
  readonly spec: SemanticSliceSpec
  readonly plan?: SemanticSlicePlan
  readonly route?: SemanticSliceRoute
  readonly referenceImages?: readonly Uint8Array[]
  readonly signal?: AbortSignal
}

export interface ValidateSemanticSliceParams {
  readonly providerId: string
  readonly model?: string
  readonly spec: SemanticSliceSpec
  readonly asset: GeneratedAsset
  readonly signal?: AbortSignal
}

export interface RunSemanticSliceExperimentParams
  extends SemanticSlicePlanParams {
  readonly imageProviderId?: string
  readonly imageModel?: string
  readonly validationProviderId?: string
  readonly validationModel?: string
  readonly referenceImages?: readonly Uint8Array[]
  readonly routes?: readonly SemanticSliceRoute[]
  readonly validate?: boolean
}

export interface SemanticSliceArtifact {
  readonly spec: SemanticSliceSpec
  readonly route: SemanticSliceRoute
  readonly asset?: GeneratedAsset
  readonly validation?: GeneratedSliceValidation
  readonly error?: string
  readonly accepted: boolean
  readonly retryable: boolean
}

export interface SemanticSliceExperimentResult {
  readonly plan: SemanticSlicePlan
  readonly artifacts: readonly SemanticSliceArtifact[]
  readonly summary: {
    readonly requestedSpecs: number
    readonly attemptedArtifacts: number
    readonly generatedArtifacts: number
    readonly acceptedArtifacts: number
    readonly retryableArtifacts: number
    readonly failedArtifacts: number
  }
}

const PLANNER_SYSTEM = `You are a Semantic UI Asset Planner for an AI-native prototype asset pipeline.

Your job is to understand the product intent and optional reference image, then produce a structured list of high-value standalone visual assets that should be generated one by one. This is not a UI component library planner.

Rules:
- Do not plan a full asset board or a screenshot collage.
- Each slice spec must represent exactly one visual asset that is hard to recreate in code: one avatar, cover artwork, logo-like mark, badge art, illustration, texture, photo-like subject, or decorative icon.
- Do not plan code-reproducible UI containers such as cards, buttons, inputs, skeletons, nav bars, toolbars, list items, price rows, forms, or full panels. If valuable artwork is embedded inside one, plan only that artwork.
- Do not plan text as assets: no headings, labels, CTA copy, brand-name text, individual letters/characters, decorative typography specimens, or UI copy. Only plan a complete logo/wordmark when explicitly requested, and never split it into separate glyph slices.
- Avoid compound specs that would put multiple independent assets into the same slice.
- Preserve a coherent design system across all specs.
- Prefer fewer, higher-value slices over exhaustive noise.
- The downstream image model will generate each spec separately on a transparent background.`

const VALIDATOR_SYSTEM = `You are a strict visual QA reviewer for generated UI cutout assets.

Return whether the image is usable as a single standalone transparent-background slice for the provided spec.

Pass only when the image has one primary subject, no fused neighboring assets, a transparent or clean isolated background, and matches the role/style requested.`

function slicePlanInput(params: SemanticSlicePlanParams): readonly PromptPart[] {
  const maxSlices = params.maxSlices ?? DEFAULT_MAX_SLICES
  const sourceKind = params.sourceKind ?? (params.referenceImage ? 'mixed' : 'brief')
  const parts: PromptPart[] = [
    {
      type: 'text',
      text: [
        `Source kind: ${sourceKind}`,
        `Maximum slices: ${maxSlices}`,
        'Product intent / brief:',
        params.brief.trim(),
        '',
        'Return a semantic slice plan. Number every spec with stable ids such as slice-01, slice-02. Keep each spec atomic.',
      ].join('\n'),
    },
  ]
  if (params.referenceImage) {
    parts.push({ type: 'image', image: params.referenceImage })
  }
  return parts
}

function cappedPlan(
  plan: SemanticSlicePlan,
  maxSlices: number | undefined,
): SemanticSlicePlan {
  const limit = maxSlices ?? DEFAULT_MAX_SLICES
  if (plan.slices.length <= limit) return plan
  return { ...plan, slices: plan.slices.slice(0, limit) }
}

function uniqueRoutes(
  routes: readonly SemanticSliceRoute[] | undefined,
): readonly SemanticSliceRoute[] {
  const raw = routes?.length ? routes : (['text-to-image'] as const)
  return raw.filter((route, index) => raw.indexOf(route) === index)
}

function semanticSlicePrompt(
  spec: SemanticSliceSpec,
  plan: SemanticSlicePlan | undefined,
  route: SemanticSliceRoute,
): string {
  const style = plan
    ? [
        `Domain: ${plan.style.domain}`,
        `Tone: ${plan.style.tone}`,
        `Density: ${plan.style.density}`,
        plan.style.palette.length
          ? `Palette: ${plan.style.palette.join(', ')}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n')
    : 'Use the visual language implied by the brief and references. If unclear, keep the asset neutral and do not invent a generic modern UI style.'

  return [
    'Generate one isolated UI asset as a transparent-background PNG.',
    '',
    `Route: ${route}`,
    `Slice id: ${spec.id}`,
    `Name: ${spec.name}`,
    `Role: ${spec.role}`,
    `Target canvas: ${spec.targetSize.width}x${spec.targetSize.height}`,
    '',
    'Design-system context:',
    style,
    '',
    'Asset description:',
    spec.description,
    '',
    'Generation prompt:',
    spec.generationPrompt,
    '',
    spec.styleHints.length
      ? `Style hints: ${spec.styleHints.join('; ')}`
      : undefined,
    spec.mustInclude.length
      ? `Must include: ${spec.mustInclude.join('; ')}`
      : undefined,
    spec.mustExclude.length
      ? `Must exclude: ${spec.mustExclude.join('; ')}`
      : undefined,
    '',
    'Hard constraints:',
    '- Exactly one standalone asset, not a board, not a complete UI screen.',
    '- No text-only assets, no UI labels, no isolated letters/characters, and no typography specimens unless this spec explicitly asks for one complete logo/wordmark.',
    '- Transparent background. Do not add a tile, frame, caption, label, ruler, shadow plane, or neighboring asset.',
    '- Keep the full asset inside the canvas with a small clear margin.',
    '- No watermark, no design-tool chrome, no explanatory text.',
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
}

function validationInput(
  spec: SemanticSliceSpec,
  asset: GeneratedAsset,
): readonly PromptPart[] {
  return [
    {
      type: 'text',
      text: [
        'Validate this generated slice against the spec.',
        JSON.stringify(
          {
            id: spec.id,
            name: spec.name,
            role: spec.role,
            description: spec.description,
            targetSize: spec.targetSize,
            mustInclude: spec.mustInclude,
            mustExclude: spec.mustExclude,
          },
          null,
          2,
        ),
      ].join('\n'),
    },
    { type: 'image', image: asset.bytes },
  ]
}

function artifactFromValidation(
  spec: SemanticSliceSpec,
  route: SemanticSliceRoute,
  asset: GeneratedAsset,
  validation: GeneratedSliceValidation | undefined,
): SemanticSliceArtifact {
  if (!validation) {
    return { spec, route, asset, accepted: true, retryable: false }
  }
  return {
    spec,
    route,
    asset,
    validation,
    accepted: validation.verdict === 'pass',
    retryable: validation.verdict === 'retry',
  }
}

function summarize(
  plan: SemanticSlicePlan,
  artifacts: readonly SemanticSliceArtifact[],
): SemanticSliceExperimentResult['summary'] {
  return {
    requestedSpecs: plan.slices.length,
    attemptedArtifacts: artifacts.length,
    generatedArtifacts: artifacts.filter((item) => item.asset).length,
    acceptedArtifacts: artifacts.filter((item) => item.accepted).length,
    retryableArtifacts: artifacts.filter((item) => item.retryable).length,
    failedArtifacts: artifacts.filter((item) => item.error).length,
  }
}

export async function planSemanticSlices(
  deps: SemanticSliceDeps,
  params: SemanticSlicePlanParams,
): Promise<Result<SemanticSlicePlan>> {
  if (!params.brief.trim()) return err('brief is required')

  const result = await deps.generation.generateObject(
    {
      providerId: params.providerId,
      model: params.model,
      system: PLANNER_SYSTEM,
      input: slicePlanInput(params),
      signal: params.signal,
    },
    semanticSlicePlanSchema,
  )
  if (isErr(result)) return result
  return ok(cappedPlan(result.data, params.maxSlices))
}

export async function generateSemanticSlice(
  deps: SemanticSliceDeps,
  params: GenerateSemanticSliceParams,
): Promise<Result<GeneratedAsset>> {
  const route = params.route ?? 'text-to-image'
  const prompt = semanticSlicePrompt(params.spec, params.plan, route)

  if (route === 'image-to-image') {
    const images = params.referenceImages ?? []
    if (images.length === 0) {
      return err('image-to-image slice generation requires a reference image')
    }
    const input: EditImageInput = {
      providerId: params.providerId,
      model: params.model,
      prompt: [
        prompt,
        '',
        'Use the reference image only for style, visual language, and proportions. Regenerate the requested single asset; do not crop or copy pixels from the reference.',
      ].join('\n'),
      images,
      inputFidelity: 'high',
      signal: params.signal,
    }
    const result = await deps.generation.editImage(input)
    if (isErr(result)) return result
    const asset = result.data[0]
    return asset ? ok(asset) : err('The model returned no image.')
  }

  const input: GenerateInput = {
    providerId: params.providerId,
    model: params.model,
    prompt,
    signal: params.signal,
  }
  const result = await deps.generation.generateImages(input)
  if (isErr(result)) return result
  const asset = result.data[0]
  return asset ? ok(asset) : err('The model returned no image.')
}

export async function validateSemanticSlice(
  deps: SemanticSliceDeps,
  params: ValidateSemanticSliceParams,
): Promise<Result<GeneratedSliceValidation>> {
  return deps.generation.generateObject(
    {
      providerId: params.providerId,
      model: params.model,
      system: VALIDATOR_SYSTEM,
      input: validationInput(params.spec, params.asset),
      signal: params.signal,
    },
    generatedSliceValidationSchema,
  )
}

export async function runSemanticSliceExperiment(
  deps: SemanticSliceDeps,
  params: RunSemanticSliceExperimentParams,
): Promise<Result<SemanticSliceExperimentResult>> {
  const referenceImages = params.referenceImages ?? []
  const plan = await planSemanticSlices(deps, {
    providerId: params.providerId,
    model: params.model,
    brief: params.brief,
    sourceKind: params.sourceKind,
    referenceImage: params.referenceImage ?? referenceImages[0],
    maxSlices: params.maxSlices,
    signal: params.signal,
  })
  if (isErr(plan)) return plan

  const artifacts: SemanticSliceArtifact[] = []
  for (const spec of plan.data.slices) {
    for (const route of uniqueRoutes(params.routes)) {
      const generated = await generateSemanticSlice(deps, {
        providerId: params.imageProviderId ?? params.providerId,
        model: params.imageModel,
        spec,
        plan: plan.data,
        route,
        referenceImages,
        signal: params.signal,
      })

      if (isErr(generated)) {
        artifacts.push({
          spec,
          route,
          error: generated.error,
          accepted: false,
          retryable: route === 'image-to-image' && referenceImages.length === 0,
        })
        continue
      }

      let validation: GeneratedSliceValidation | undefined
      if (params.validate ?? true) {
        const checked = await validateSemanticSlice(deps, {
          providerId: params.validationProviderId ?? params.providerId,
          model: params.validationModel ?? params.model,
          spec,
          asset: generated.data,
          signal: params.signal,
        })
        if (isErr(checked)) {
          artifacts.push({
            spec,
            route,
            asset: generated.data,
            error: checked.error,
            accepted: false,
            retryable: true,
          })
          continue
        }
        validation = checked.data
      }

      artifacts.push(
        artifactFromValidation(spec, route, generated.data, validation),
      )
    }
  }

  return ok({
    plan: plan.data,
    artifacts,
    summary: summarize(plan.data, artifacts),
  })
}
