import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type { GenerationService } from '@/services/ai/types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import type { IntentProfile } from '@/dag/intent-types'
import { z } from 'zod'
import {
  generatedPrototypePlanSchema,
  prototypeFlowSchema,
  prototypeHumanLoopSchema,
  prototypeDesignSystemSchema,
  prototypePlanningSeedSchema,
  prototypePlanSchema,
  prototypePageSchema,
  prototypeReviewDocumentSchema,
  validatePrototypePlan,
  type PrototypePlan,
  type PrototypePlanningSeed,
} from './prototype-plan'
import {
  candidateDirectionSchema,
  candidateExplorationDecisionSchema,
} from '@/candidate-selection/contracts'

export interface PlanPrototypeParams {
  readonly providerId: string
  readonly model?: string
  readonly brief: string
  readonly intent?: IntentProfile
  readonly effort?: ReasoningEffort
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: PrototypePlanningProgress) => void
}

export interface PrototypePlanningProgress {
  readonly stage:
    | 'outline'
    | 'design-foundation'
    | 'design-exploration'
    | 'page'
    | 'closure'
    | 'complete'
  readonly completedPages: number
  readonly totalPages: number
}

const progressivePageOutlineSchema = prototypePageSchema.pick({
  id: true,
  name: true,
  route: true,
  purpose: true,
  viewport: true,
})

const progressivePrototypeOutlineSchema = generatedPrototypePlanSchema.pick({
  version: true,
  product: true,
}).extend({
  pages: z.array(progressivePageOutlineSchema).min(1).max(12),
  humanLoop: prototypeHumanLoopSchema,
})

const progressiveDesignFoundationSchema = prototypeDesignSystemSchema.omit({
  exploration: true,
})

const progressiveDesignExplorationSchema = z.object({
  mode: z.enum(['auto', 'fixed']),
  decidedBy: z.enum(['user', 'agent']),
  count: z.number().int().positive().max(8),
  rationale: z.string().trim().min(1).max(2_000),
  directions: z.array(candidateDirectionSchema).min(1).max(8),
})

const progressivePrototypeClosureSchema = z.object({
  flows: z.array(prototypeFlowSchema).min(1),
  reviewDocument: prototypeReviewDocumentSchema,
})

type ProgressivePrototypeOutline = z.infer<typeof progressivePrototypeOutlineSchema>

const PROGRESSIVE_OUTLINE_SYSTEM = [
  'You are Cutout\'s prototype route architect.',
  'Produce only a concise product definition and complete route outline.',
  'Derive route topology from the business domain, content model, platform conventions, and complete user journeys.',
  'Treat a user-mentioned page count as scope context, not authority to pad or truncate the graph. Ask when ambiguity materially changes topology; otherwise justify the resolved graph in the human-loop rationale.',
  'Every route must be a distinct useful destination.',
  'Do not write Design System details, page regions, interactions, flows, or review Markdown in this step.',
].join(' ')

const PROGRESSIVE_OUTLINE_TEXT_SYSTEM = [
  'You are Cutout\'s prototype route architect.',
  'Return only the CUTOUT_OUTLINE_V1 tab-separated line protocol below, without Markdown or blank lines.',
  'The exact grammar is:',
  '<TAB> means one literal tab character; do not print the angle-bracket token.',
  'CUTOUT_OUTLINE_V1',
  'VERSION<TAB>prototype-plan.v0',
  'PRODUCT<TAB>name<TAB>project-name-or--<TAB>summary<TAB>audience<TAB>primary-goal<TAB>platform',
  'PAGE<TAB>id<TAB>name<TAB>route<TAB>purpose<TAB>viewport-platform<TAB>width<TAB>height<TAB>single-screen-or-long-scroll',
  'Repeat PAGE once for every Agent-authored route, in navigation order.',
  'Then use CONTINUE<TAB>rationale, or ASK<TAB>rationale<TAB>question<TAB>default-choice-id followed by two to four CHOICE<TAB>id<TAB>label<TAB>description<TAB>impact lines.',
  'Finish with END.',
  'Derive the complete route graph from the product rather than forcing a user-mentioned count. Use concise plain-text fields without tabs, controls, URLs, filesystem paths, or parent traversal.',
  'Every page id and route must be unique. Do not use a fixed route template.',
].join('\n')

const PROGRESSIVE_DESIGN_FOUNDATION_SYSTEM = [
  'You are Cutout\'s Design System architect.',
  'Define one coherent visual foundation for the supplied product and route outline.',
  'Describe palette, typography, spacing, component principles, and reusable non-UI asset direction.',
  'Do not propose alternative directions in this step.',
].join(' ')

const PROGRESSIVE_DESIGN_EXPLORATION_SYSTEM = [
  'You are Cutout\'s Design System exploration planner.',
  'Propose meaningfully different visual directions while preserving the supplied product intent.',
  'Honor an explicit candidate count exactly. Keep direction ids concise and stable.',
  'Do not repeat the Design System foundation or route outline.',
].join(' ')

const PROGRESSIVE_PAGES_SYSTEM = [
  'You are Cutout\'s prototype page architect.',
  'Expand only the explicitly targeted route outline into one complete page with regions, overlays, states, and interactions.',
  'Use the complete route outline only as navigation context. Do not return sibling pages.',
  'Preserve the target page id, name, route, purpose, and viewport exactly.',
  'Interactions must make the route graph navigable. Author zero or more asset opportunities based only on genuine non-UI reuse value and non-code-reproducibility; zero is valid and a number mentioned in the brief is not a quota.',
  'Keep code-reproducible layout regions on ignore-code-ui. Use zero or more coherent board-cutout regions: share a well-separated white board only when the atomic assets belong together and remain legible, and split unrelated or dense sets into separate regions. Reserve direct-generate for exceptional complex standalone artwork, never one call per manifest item by default.',
].join(' ')

const PROGRESSIVE_CLOSURE_SYSTEM = [
  'You are Cutout\'s prototype journey reviewer.',
  'Author reachable flows using only the supplied page and interaction ids, plus two complete Markdown review documents.',
  'Do not add, remove, or rename routes.',
].join(' ')

const PROGRESSIVE_OUTLINE_MAX_TOKENS = 8_000
const PROGRESSIVE_OUTLINE_TEXT_MAX_TOKENS = 4_000
const PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES = 16_384
const PROGRESSIVE_OUTLINE_TEXT_MAX_LINES = 24
const PROGRESSIVE_OUTLINE_TEXT_TIMEOUT_MS = 120_000
const PROGRESSIVE_DESIGN_MAX_TOKENS = 8_000
const PROGRESSIVE_PAGE_MAX_TOKENS = 12_000
const PROGRESSIVE_CLOSURE_MAX_TOKENS = 20_000

export function composePrototypeRequirement(
  brief: string,
  intent?: IntentProfile,
): string {
  if (!intent) return brief

  const lines: string[] = [
    'Reconstructed intent — plan the prototype suite from THIS understanding:',
    '',
    `GOAL: ${intent.goal}`,
    `STRATEGY: ${intent.strategy}`,
    `RATIONALE: ${intent.rationale}`,
  ]

  if (intent.dimensions.length > 0) {
    lines.push('DIMENSIONS:')
    for (const d of intent.dimensions) lines.push(`- ${d.aspect}: ${d.value}`)
  }
  if (intent.assumptions.length > 0) {
    lines.push('ASSUMPTIONS:')
    for (const a of intent.assumptions) lines.push(`- ${a}`)
  }

  lines.push('', `ORIGINAL BRIEF: ${brief}`)
  return lines.join('\n')
}

export function createLocalPrototypePlan(
  brief: string,
  intent?: IntentProfile,
): PrototypePlan {
  const name = fallbackProductName(brief, intent)
  const platform = fallbackPlatform(brief, intent)
  const viewport = fallbackViewport(platform)
  const summary = firstNonEmpty(
    intent?.goal,
    `${name} prototype generated from the available intent.`,
  )
  const goal = firstNonEmpty(
    intent?.strategy,
    `Clarify the core value of ${name} and prepare reusable visual assets.`,
  )

  return {
    version: 'prototype-plan.v0',
    product: {
      name,
      projectName: fallbackProjectName(name),
      summary,
      audience: firstNonEmpty(
        intentDimension(intent, 'audience'),
        'Target users and decision makers',
      ),
      primaryGoal: goal,
      platform,
    },
    designSystem: {
      styleSummary: fallbackStyleSummary(brief, intent),
      palette: fallbackPalette(brief, intent),
      typography:
        'Clean sans-serif hierarchy with clear headings, readable body text, and stable labels.',
      spacing:
        '8px rhythm with restrained section spacing and predictable alignment.',
      componentPrinciples: [
        'Use one dominant action per screen.',
        'Keep code-reproducible containers separate from special artwork.',
        'Preserve consistent navigation, surfaces, radius, and spacing.',
      ],
      assetDirection:
        'Generate only reusable artwork, covers, icons, decorative motifs, and material textures; ignore ordinary code-reproducible UI chrome.',
      exploration: {
        mode: 'auto',
        decidedBy: 'fallback',
        count: 1,
        rationale: 'The local fallback keeps one conservative visual direction because no Agent-authored comparison proposal is available.',
        directions: [{
          id: 'fallback-direction',
          label: 'Core direction',
          thesis: 'Express the inferred product intent as one coherent, production-ready visual system.',
          vary: ['visual execution'],
          preserve: ['product intent', 'platform conventions', 'source identity'],
        }],
        bounds: { maxCandidates: 8, maxParallelism: 2 },
      },
    },
    pages: [
      {
        id: 'core',
        name: 'Core experience',
        route: '/',
        purpose: goal,
        viewport,
        regions: [
          {
            id: 'brand-entry',
            name: 'Brand entry',
            role: 'orientation',
            summary:
              'Introduce the product, its visual language, and the main path into the experience.',
            complexity: 'medium',
            decompositionStrategy: 'region-crop',
            assetRoute: 'ignore-code-ui',
            assetOpportunities: [],
          },
          {
            id: 'content-system',
            name: 'Content system',
            role: 'structure',
            summary:
              'Show the repeatable content areas without treating simple UI containers as assets.',
            complexity: 'medium',
            decompositionStrategy: 'region-crop',
            assetRoute: 'ignore-code-ui',
            assetOpportunities: [],
          },
          {
            id: 'conversion',
            name: 'Conversion path',
            role: 'action',
            summary:
              'Expose the primary action and any visual asset required to make it feel specific.',
            complexity: 'low',
            decompositionStrategy: 'direct',
            assetRoute: 'ignore-code-ui',
            assetOpportunities: [],
          },
        ],
        overlays: [],
        states: [],
        interactions: [
          {
            id: 'primary-action',
            label: 'Primary action',
            trigger: 'click',
            sourceSectionId: 'conversion',
            sourceElement: 'primary action',
            intent:
              'Keep the fallback prototype self-contained until the model planner provides a fuller flow.',
            action: {
              type: 'none',
              reason:
                'Local fallback avoids inventing unreachable pages when the model plan is unavailable.',
            },
          },
        ],
      },
    ],
    flows: [
      {
        id: 'primary-flow',
        name: 'Primary flow',
        goal,
        startPageId: 'core',
        steps: [],
      },
    ],
    reviewDocument: {
      format: 'markdown',
      primaryFlow: `# ${name}\n\n${summary}\n\n## Primary flow\n\n${goal}`,
      fullPlan: `# ${name}\n\n${summary}\n\n## Core experience\n\n${goal}`,
    },
    humanLoop: {
      mode: 'continue',
      rationale:
        'The model planner failed to produce schema-valid JSON, so Cutout is using a minimal local semantic plan to keep generation moving.',
    },
  }
}

export function createPrototypePlanFromSeed(
  input: PrototypePlanningSeed,
  directionId?: string,
): PrototypePlan {
  const seed = prototypePlanningSeedSchema.parse(input)
  const suite = directionId
    ? seed.suites.find((candidate) => candidate.direction.id === directionId)
    : seed.suites[0]
  if (!suite) throw new Error(`The planning seed has no suite for direction "${directionId}".`)

  const fallback = createLocalPrototypePlan(seed.product.summary)
  const pages = suite.pages.map((page, index) => {
    const next = suite.pages[(index + 1) % suite.pages.length]!
    const regionInputs = [
      {
        id: 'hero',
        name: 'Route identity',
        role: 'orientation',
        summary: `Establish ${page.name} with artwork specific to ${page.purpose}`,
      },
      {
        id: 'context',
        name: 'Context and wayfinding',
        role: 'navigation',
        summary: `Give users visual context and wayfinding for ${page.purpose}`,
      },
      {
        id: 'content',
        name: 'Core content',
        role: 'content',
        summary: `Support the primary decisions and content on ${page.name}`,
      },
      {
        id: 'confidence',
        name: 'Confidence and completion',
        role: 'trust',
        summary: `Reinforce progress, trust, and completion for ${page.purpose}`,
      },
    ]
    const interfaceRegions = regionInputs.map((region) => ({
      id: `${page.id}-${region.id}`,
      name: region.name,
      role: region.role,
      summary: region.summary,
      complexity: 'medium' as const,
      decompositionStrategy: 'region-crop' as const,
      assetRoute: 'ignore-code-ui' as const,
      assetOpportunities: [],
    }))
    const materials = page.materials
    const boardGroups = new Map<string, typeof materials>()
    for (const material of materials) {
      if (material.production !== 'board-cutout') continue
      const groupId = material.boardGroupId
      boardGroups.set(groupId, [...(boardGroups.get(groupId) ?? []), material])
    }
    const directMaterials = materials.filter((material) =>
      material.production === 'direct-generate')
    const boardRegions = [...boardGroups.entries()].map(
      ([groupId, groupedMaterials], groupIndex) => {
        return {
          id: `${page.id}-reusable-materials-${groupIndex + 1}`,
          name: `Reusable visual materials: ${groupId}`,
          role: 'visual-materials',
          summary: `Reusable non-UI visual materials for ${page.name}`,
          complexity: 'medium' as const,
          decompositionStrategy: 'region-crop' as const,
          assetRoute: 'board-cutout' as const,
          assetOpportunities: groupedMaterials.map((material) => material.description),
        }
      },
    )
    const materialRegions = [
      ...boardRegions,
      ...directMaterials.map((material) => ({
        id: `${page.id}-material-${material.id}`,
        name: material.name,
        role: 'visual-material',
        summary: material.description,
        complexity: 'high' as const,
        decompositionStrategy: 'direct' as const,
        assetRoute: 'direct-generate' as const,
        assetOpportunities: [material.description],
      })),
    ]
    const regions = [...interfaceRegions, ...materialRegions]
    return {
      ...page,
      regions,
      overlays: [],
      states: [],
      interactions: [{
        id: `continue-${page.id}-to-${next.id}`,
        label: `Continue to ${next.name}`,
        trigger: 'click' as const,
        sourceSectionId: `${page.id}-confidence`,
        sourceElement: 'primary continuation action',
        intent: `Continue the primary journey from ${page.name} to ${next.name}.`,
        action: { type: 'navigate' as const, targetPageId: next.id },
      }],
    }
  })
  const routeReview = pages
    .map((page) => `- [${page.name}](${page.route}): ${page.purpose}`)
    .join('\n')
  const plan = prototypePlanSchema.parse({
    version: 'prototype-plan.v0',
    product: seed.product,
    designSystem: {
      ...fallback.designSystem,
      styleSummary: suite.direction.thesis,
      exploration: {
        mode: 'auto',
        decidedBy: 'agent',
        count: seed.suites.length,
        rationale: seed.rationale,
        directions: seed.suites.map(({ direction }) => direction),
        bounds: { maxCandidates: 8, maxParallelism: 2 },
      },
    },
    pages,
    flows: [{
      id: `primary-${suite.direction.id}-flow`,
      name: `${suite.direction.label} primary journey`,
      goal: seed.product.primaryGoal,
      startPageId: pages[0]!.id,
      steps: pages.map((page, index) => ({
        fromPageId: page.id,
        interactionId: page.interactions[0]!.id,
        toPageId: pages[(index + 1) % pages.length]!.id,
      })),
    }],
    reviewDocument: {
      format: 'markdown',
      primaryFlow: [
        `# ${suite.direction.label} primary flow`,
        '',
        seed.product.primaryGoal,
        '',
        routeReview,
      ].join('\n'),
      fullPlan: [
        `# ${seed.product.name} prototype plan`,
        '',
        seed.product.summary,
        '',
        `Direction: ${suite.direction.thesis}`,
        '',
        routeReview,
      ].join('\n'),
    },
    planningSeed: seed,
    humanLoop: {
      mode: 'continue',
      rationale: 'The Agent supplied a complete bounded planning seed.',
    },
  })
  const validation = validatePrototypePlan(plan)
  if (isErr(validation)) throw new Error(validation.error)
  return plan
}

function shouldUseProgressivePlanner(message: string): boolean {
  const lower = message.toLowerCase()
  if (isCredentialOrAuthFailure(lower)) return false
  return (
    lower.includes('structured json generation failed') ||
    lower.includes('structured output failed') ||
    lower.includes('response did not match schema') ||
    lower.includes('did not match schema') ||
    lower.includes('no output generated') ||
    lower.includes('no object generated')
  )
}

function isCredentialOrAuthFailure(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    /api[_ -]?key/.test(lower) ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    /authentication (?:failed|required|error)/.test(lower) ||
    lower.includes('=authentication') ||
    /(?:invalid|missing|expired) credential/.test(lower) ||
    lower.includes('provider not configured') ||
    lower.includes('forbidden') ||
    lower.includes('permission denied') ||
    /\b(?:401|403)\b/.test(lower)
  )
}

function isProgressiveContractFailure(message: string): boolean {
  return message.startsWith('Progressive planner ')
    && !message.includes(' structured output failed:')
    && !message.includes(' outline transport failed.')
    && !message.includes(' outline timed out.')
}

function progressiveInput(
  params: PlanPrototypeParams,
  system: string,
  text: string,
  maxOutputTokens: number,
) {
  return {
    providerId: params.providerId,
    model: params.model,
    system,
    input: [{ type: 'text' as const, text }],
    reasoningEffort: params.effort ?? 'low',
    signal: params.signal,
    maxOutputTokens,
  }
}

type ProgressiveOutlineTextFailure =
  | 'duplicate'
  | 'malformed'
  | 'oversized'
  | 'schema'
  | 'unsafe'

function progressiveOutlineTextFailure(
  reason: ProgressiveOutlineTextFailure,
): Result<never> {
  const detail: Record<ProgressiveOutlineTextFailure, string> = {
    duplicate: 'contained duplicate page or choice identities',
    malformed: 'did not match the closed line protocol',
    oversized: 'exceeded the line protocol limits',
    schema: 'did not match the progressive outline schema',
    unsafe: 'contained an unsafe field',
  }
  return err(`Progressive planner outline text fallback ${detail[reason]}.`)
}

function isSafeProtocolText(value: string, maxLength: number): boolean {
  return value.length > 0
    && value.length <= maxLength
    && ![...value].some((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint <= 0x1f
        || (codePoint >= 0x7f && codePoint <= 0x9f)
        || (codePoint >= 0x2028 && codePoint <= 0x202e)
        || (codePoint >= 0x2066 && codePoint <= 0x2069)
    })
}

function isSafeProtocolId(value: string): boolean {
  return value.length <= 64
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value)
}

function isSafePrototypeRoute(value: string): boolean {
  if (value === '/') return true
  if (value.length > 256 || !value.startsWith('/') || value.startsWith('//')) return false
  if (/[\\?#\s]/u.test(value)) return false
  return value.slice(1).split('/').every((segment) =>
    segment.length > 0
      && segment !== '.'
      && segment !== '..'
      && /^[\p{L}\p{N}_~-]+$/u.test(segment),
  )
}

function protocolInteger(value: string): number | null {
  if (!/^\d{1,4}$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 8192 ? parsed : null
}

function parseProgressiveOutlineText(
  output: string,
): Result<ProgressivePrototypeOutline> {
  if (new TextEncoder().encode(output).byteLength > PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES) {
    return progressiveOutlineTextFailure('oversized')
  }
  const lines = output.replace(/\r\n/gu, '\n').split('\n')
  while (lines.at(-1) === '') lines.pop()
  if (
    lines.length < 5
    || lines.length > PROGRESSIVE_OUTLINE_TEXT_MAX_LINES
    || lines[0] !== 'CUTOUT_OUTLINE_V1'
    || lines.at(-1) !== 'END'
  ) {
    return progressiveOutlineTextFailure('malformed')
  }

  const version = lines[1]?.split('\t')
  const product = lines[2]?.split('\t')
  if (
    version?.length !== 2
    || version[0] !== 'VERSION'
    || version[1] !== 'prototype-plan.v0'
    || product?.length !== 7
    || product[0] !== 'PRODUCT'
  ) {
    return progressiveOutlineTextFailure('malformed')
  }
  const [, productName, projectNameValue, summary, audience, primaryGoal, platform] = product
  if (
    !isSafeProtocolText(productName!, 160)
    || (projectNameValue !== '-' && !isSafeProtocolText(projectNameValue!, 32))
    || !isSafeProtocolText(summary!, 1_000)
    || !isSafeProtocolText(audience!, 500)
    || !isSafeProtocolText(primaryGoal!, 1_000)
    || !isSafeProtocolText(platform!, 80)
  ) {
    return progressiveOutlineTextFailure('unsafe')
  }

  const pages: ProgressivePrototypeOutline['pages'] = []
  const pageIds = new Set<string>()
  const routes = new Set<string>()
  let cursor = 3
  while (lines[cursor]?.startsWith('PAGE\t')) {
    const fields = lines[cursor]!.split('\t')
    if (fields.length !== 9) return progressiveOutlineTextFailure('malformed')
    const [, id, name, route, purpose, viewportPlatform, widthValue, heightValue, scroll] = fields
    const width = protocolInteger(widthValue!)
    const height = protocolInteger(heightValue!)
    if (
      !isSafeProtocolId(id!)
      || !isSafeProtocolText(name!, 160)
      || !isSafePrototypeRoute(route!)
      || !isSafeProtocolText(purpose!, 1_000)
      || !isSafeProtocolText(viewportPlatform!, 80)
      || width === null
      || height === null
      || (scroll !== 'single-screen' && scroll !== 'long-scroll')
    ) {
      return progressiveOutlineTextFailure('unsafe')
    }
    if (pageIds.has(id!) || routes.has(route!)) {
      return progressiveOutlineTextFailure('duplicate')
    }
    pageIds.add(id!)
    routes.add(route!)
    pages.push({
      id: id!,
      name: name!,
      route: route!,
      purpose: purpose!,
      viewport: {
        platform: viewportPlatform!,
        width,
        height,
        scroll,
      },
    })
    cursor += 1
  }
  if (pages.length === 0 || pages.length > 12) {
    return progressiveOutlineTextFailure('malformed')
  }
  const humanFields = lines[cursor]?.split('\t')
  if (!humanFields) return progressiveOutlineTextFailure('malformed')
  let humanLoop: ProgressivePrototypeOutline['humanLoop']
  if (humanFields[0] === 'CONTINUE') {
    if (humanFields.length !== 2 || !isSafeProtocolText(humanFields[1]!, 1_000)) {
      return progressiveOutlineTextFailure('unsafe')
    }
    humanLoop = { mode: 'continue', rationale: humanFields[1]! }
    cursor += 1
  } else if (humanFields[0] === 'ASK') {
    if (
      humanFields.length !== 4
      || !isSafeProtocolText(humanFields[1]!, 1_000)
      || !isSafeProtocolText(humanFields[2]!, 1_000)
      || !isSafeProtocolId(humanFields[3]!)
    ) {
      return progressiveOutlineTextFailure('unsafe')
    }
    cursor += 1
    const choices = [] as Extract<ProgressivePrototypeOutline['humanLoop'], { mode: 'ask' }>['choices']
    const choiceIds = new Set<string>()
    while (lines[cursor]?.startsWith('CHOICE\t')) {
      const fields = lines[cursor]!.split('\t')
      if (
        fields.length !== 5
        || !isSafeProtocolId(fields[1]!)
        || !isSafeProtocolText(fields[2]!, 160)
        || !isSafeProtocolText(fields[3]!, 1_000)
        || !isSafeProtocolText(fields[4]!, 1_000)
      ) {
        return progressiveOutlineTextFailure('unsafe')
      }
      if (choiceIds.has(fields[1]!)) return progressiveOutlineTextFailure('duplicate')
      choiceIds.add(fields[1]!)
      choices.push({
        id: fields[1]!,
        label: fields[2]!,
        description: fields[3]!,
        impact: fields[4]!,
      })
      cursor += 1
    }
    if (
      choices.length < 2
      || choices.length > 4
      || !choiceIds.has(humanFields[3]!)
    ) {
      return progressiveOutlineTextFailure('malformed')
    }
    humanLoop = {
      mode: 'ask',
      rationale: humanFields[1]!,
      question: humanFields[2]!,
      choices,
      defaultChoiceId: humanFields[3]!,
    }
  } else {
    return progressiveOutlineTextFailure('malformed')
  }
  if (lines[cursor] !== 'END' || cursor !== lines.length - 1) {
    return progressiveOutlineTextFailure('malformed')
  }
  const parsed = progressivePrototypeOutlineSchema.safeParse({
    version: version[1],
    product: {
      name: productName,
      ...(projectNameValue === '-' ? {} : { projectName: projectNameValue }),
      summary,
      audience,
      primaryGoal,
      platform,
    },
    pages,
    humanLoop,
  })
  return parsed.success ? ok(parsed.data) : progressiveOutlineTextFailure('schema')
}

async function generateProgressiveOutline(
  generation: Pick<GenerationService, 'generateObject' | 'streamText'>,
  params: PlanPrototypeParams,
  requirement: string,
): Promise<Result<ProgressivePrototypeOutline>> {
  const text = await streamProgressiveOutlineText(generation, params, requirement)
  if (isErr(text)) return text
  const parsedText = parseProgressiveOutlineText(text.data)
  if (!isErr(parsedText)) return parsedText

  const structured = await generation.generateObject(
    progressiveInput(
      params,
      PROGRESSIVE_OUTLINE_SYSTEM,
      requirement,
      PROGRESSIVE_OUTLINE_MAX_TOKENS,
    ),
    progressivePrototypeOutlineSchema,
  )
  if (!isErr(structured)) return structured
  if (!shouldUseProgressivePlanner(structured.error)) return structured
  return parsedText
}

async function streamProgressiveOutlineText(
  generation: Pick<GenerationService, 'streamText'>,
  params: PlanPrototypeParams,
  requirement: string,
): Promise<Result<string>> {
  const controller = new AbortController()
  let settleInterruption: (reason: 'parent' | 'timeout') => void = () => {}
  const interruption = new Promise<'parent' | 'timeout'>((resolve) => {
    settleInterruption = resolve
  })
  const abortFromParent = () => {
    controller.abort()
    settleInterruption('parent')
  }
  params.signal?.addEventListener('abort', abortFromParent, { once: true })
  const timeout = globalThis.setTimeout(() => {
    controller.abort()
    settleInterruption('timeout')
  }, PROGRESSIVE_OUTLINE_TEXT_TIMEOUT_MS)
  let output = ''
  let iterator: AsyncIterator<string> | undefined
  let iteratorDone = false
  try {
    const input = {
      ...progressiveInput(
        params,
        PROGRESSIVE_OUTLINE_TEXT_SYSTEM,
        requirement,
        PROGRESSIVE_OUTLINE_TEXT_MAX_TOKENS,
      ),
      signal: controller.signal,
    }
    iterator = generation.streamText(input)[Symbol.asyncIterator]()
    while (true) {
      const next = await Promise.race([
        iterator.next().then(
          (value) => ({ kind: 'next' as const, value }),
          (error: unknown) => ({ kind: 'error' as const, error }),
        ),
        interruption.then((reason) => ({ kind: 'interrupted' as const, reason })),
      ])
      if (next.kind === 'interrupted') {
        return next.reason === 'parent'
          ? err('AbortError: operation aborted')
          : err('Progressive planner outline timed out.')
      }
      if (next.kind === 'error') throw next.error
      if (next.value.done) {
        iteratorDone = true
        break
      }
      const chunk = next.value.value
      output += chunk
      if (new TextEncoder().encode(output).byteLength > PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES) {
        controller.abort()
        return progressiveOutlineTextFailure('oversized')
      }
      const normalized = output.replace(/\r\n/gu, '\n').trimEnd()
      if (normalized === 'END' || normalized.endsWith('\nEND')) break
    }
    return ok(output)
  } catch (error) {
    if (params.signal?.aborted) return err('AbortError: operation aborted')
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('abort')) {
      return err('AbortError: operation aborted')
    }
    if (isCredentialOrAuthFailure(message)) {
      return err('Progressive planner outline authentication failed.')
    }
    return err('Progressive planner outline transport failed.')
  } finally {
    globalThis.clearTimeout(timeout)
    params.signal?.removeEventListener('abort', abortFromParent)
    if (iterator && !iteratorDone) {
      void Promise.resolve(iterator.return?.()).catch(() => {})
    }
  }
}

function progressiveAskPlan(
  brief: string,
  intent: IntentProfile | undefined,
  outline: ProgressivePrototypeOutline,
): PrototypePlan {
  const fallback = createLocalPrototypePlan(brief, intent)
  const templatePage = fallback.pages[0]!
  const pages = outline.pages.map((page, index) => {
    const nextPage = outline.pages[index + 1]
    const regionId = `${page.id}-outline`
    return {
      ...templatePage,
      ...page,
      regions: [{
        ...templatePage.regions[0]!,
        id: regionId,
        name: `${page.name} outline`,
        summary: page.purpose,
      }],
      interactions: nextPage ? [{
        ...templatePage.interactions[0]!,
        id: `continue-to-${nextPage.id}`,
        sourceSectionId: regionId,
        intent: `Continue to ${nextPage.name}.`,
        action: { type: 'navigate' as const, targetPageId: nextPage.id },
      }] : [],
    }
  })
  return {
    ...fallback,
    product: outline.product,
    pages,
    flows: [{
      id: 'clarification-route-outline',
      name: 'Clarification route outline',
      goal: outline.product.primaryGoal,
      startPageId: pages[0]!.id,
      steps: pages.slice(0, -1).map((page, index) => ({
        fromPageId: page.id,
        interactionId: `continue-to-${pages[index + 1]!.id}`,
        toPageId: pages[index + 1]!.id,
      })),
    }],
    humanLoop: outline.humanLoop,
  }
}

async function planPrototypeProgressively(
  generation: Pick<GenerationService, 'generateObject' | 'streamText'>,
  params: PlanPrototypeParams,
): Promise<Result<PrototypePlan>> {
  const requirement = composePrototypeRequirement(params.brief, params.intent)
  params.onProgress?.({
    stage: 'outline',
    completedPages: 0,
    totalPages: 0,
  })
  const outlineResult = await generateProgressiveOutline(generation, params, requirement)
  if (isErr(outlineResult)) {
    return progressiveStageFailure('outline', outlineResult.error)
  }
  const outline = outlineResult.data
  if (outline.humanLoop.mode === 'ask') {
    return ok(progressiveAskPlan(params.brief, params.intent, outline))
  }

  const outlineContext = JSON.stringify({
    product: outline.product,
    pages: outline.pages,
  })
  params.onProgress?.({
    stage: 'design-foundation',
    completedPages: 0,
    totalPages: outline.pages.length,
  })
  const designFoundationResult = await generation.generateObject(
    progressiveInput(
      params,
      PROGRESSIVE_DESIGN_FOUNDATION_SYSTEM,
      [
        'Original requirement:',
        requirement,
        '',
        'Product and route outline JSON:',
        outlineContext,
      ].join('\n'),
      PROGRESSIVE_DESIGN_MAX_TOKENS,
    ),
    progressiveDesignFoundationSchema,
  )
  if (isErr(designFoundationResult)) {
    return progressiveStageFailure('design-foundation', designFoundationResult.error)
  }

  params.onProgress?.({
    stage: 'design-exploration',
    completedPages: 0,
    totalPages: outline.pages.length,
  })
  const designExplorationResult = await generation.generateObject(
    progressiveInput(
      params,
      PROGRESSIVE_DESIGN_EXPLORATION_SYSTEM,
      [
        'Original requirement:',
        requirement,
        '',
        'Product and route outline JSON:',
        outlineContext,
        '',
        'Approved Design System foundation JSON:',
        JSON.stringify(designFoundationResult.data),
      ].join('\n'),
      PROGRESSIVE_DESIGN_MAX_TOKENS,
    ),
    progressiveDesignExplorationSchema,
  )
  if (isErr(designExplorationResult)) {
    return progressiveStageFailure('design-exploration', designExplorationResult.error)
  }
  const exploration = candidateExplorationDecisionSchema.safeParse({
    ...designExplorationResult.data,
    bounds: { maxCandidates: 8, maxParallelism: 2 },
  })
  if (!exploration.success) {
    return err(
      `Progressive planner design exploration violated runtime bounds: ${exploration.error.message}`,
    )
  }
  const designSystem = {
    ...designFoundationResult.data,
    exploration: exploration.data,
  }

  const pages = [] as PrototypePlan['pages'][number][]
  for (const [pageIndex, page] of outline.pages.entries()) {
    params.onProgress?.({
      stage: 'page',
      completedPages: pageIndex,
      totalPages: outline.pages.length,
    })
    const pageResult = await generation.generateObject(
      progressiveInput(
        params,
        PROGRESSIVE_PAGES_SYSTEM,
        [
          'Original requirement:',
          requirement,
          '',
          'Choose zero or more reusable non-UI asset opportunities for this page based on genuine reuse value. Do not target a fixed per-page count from the brief.',
          '',
          'Complete route outline JSON:',
          JSON.stringify({ product: outline.product, pages: outline.pages }),
          '',
          'Expand only this exact page outline JSON:',
          JSON.stringify(page),
        ].join('\n'),
        PROGRESSIVE_PAGE_MAX_TOKENS,
      ),
      prototypePageSchema,
    )
    if (isErr(pageResult)) {
      return progressiveStageFailure('page', pageResult.error)
    }
    const identityError = progressivePageIdentityError(page, pageResult.data)
    if (identityError) return err(identityError)
    pages.push(pageResult.data)
    params.onProgress?.({
      stage: 'page',
      completedPages: pages.length,
      totalPages: outline.pages.length,
    })
  }

  params.onProgress?.({
    stage: 'closure',
    completedPages: pages.length,
    totalPages: outline.pages.length,
  })
  const closureResult = await generation.generateObject(
    progressiveInput(
      params,
      PROGRESSIVE_CLOSURE_SYSTEM,
      [
        'Original requirement:',
        requirement,
        '',
        'Product JSON:',
        JSON.stringify(outline.product),
        '',
        'Pages and interaction ids JSON:',
        JSON.stringify(pages.map((page) => ({
          id: page.id,
          name: page.name,
          route: page.route,
          purpose: page.purpose,
          interactions: page.interactions.map((interaction) => ({
            id: interaction.id,
            action: interaction.action,
          })),
        }))),
      ].join('\n'),
      PROGRESSIVE_CLOSURE_MAX_TOKENS,
    ),
    progressivePrototypeClosureSchema,
  )
  if (isErr(closureResult)) {
    return progressiveStageFailure('closure', closureResult.error)
  }

  const combined = generatedPrototypePlanSchema.safeParse({
    version: outline.version,
    product: outline.product,
    designSystem,
    pages,
    flows: closureResult.data.flows,
    reviewDocument: closureResult.data.reviewDocument,
    humanLoop: outline.humanLoop,
  })
  if (!combined.success) {
    return err(`Progressive planner merge did not match the prototype schema: ${combined.error.message}`)
  }
  const validation = validatePrototypePlan(combined.data)
  if (isErr(validation)) {
    return err(`Progressive planner produced an invalid prototype plan: ${validation.error}`)
  }
  params.onProgress?.({
    stage: 'complete',
    completedPages: pages.length,
    totalPages: outline.pages.length,
  })
  return ok(combined.data)
}

function progressiveStageFailure(
  stage:
    | 'outline'
    | 'design-foundation'
    | 'design-exploration'
    | 'page'
    | 'closure',
  message: string,
): Result<never> {
  if (!shouldUseProgressivePlanner(message)) return err(message)
  return err(`Progressive planner ${stage} structured output failed: ${message}`)
}

function progressivePageIdentityError(
  outline: z.infer<typeof progressivePageOutlineSchema>,
  detailed: PrototypePlan['pages'][number],
): string | null {
  if (detailed.id !== outline.id) {
    return `Progressive planner page details changed page id for ${outline.id}.`
  }
  if (
    detailed.name !== outline.name ||
    detailed.route !== outline.route ||
    detailed.purpose !== outline.purpose
  ) {
    return `Progressive planner page details changed route identity for ${outline.id}.`
  }
  if (
    detailed.viewport.platform !== outline.viewport.platform ||
    detailed.viewport.width !== outline.viewport.width ||
    detailed.viewport.height !== outline.viewport.height ||
    detailed.viewport.scroll !== outline.viewport.scroll
  ) {
    return `Progressive planner page details changed viewport for ${outline.id}.`
  }
  return null
}

export async function planPrototype(
  generation: Pick<GenerationService, 'generateObject' | 'streamText'>,
  params: PlanPrototypeParams,
): Promise<Result<PrototypePlan>> {
  const brief = params.brief.trim()
  if (brief.length === 0) return err('A requirement brief is required.')

  // A mentioned count is only a workload hint for choosing the bounded
  // transport. The Agent-authored outline remains topology authority.
  const explicitPages = explicitPrototypePageCount(brief)
  if (explicitPages !== null && explicitPages >= 4) {
    return planPrototypeProgressively(generation, { ...params, brief })
  }

  const result = await generation.generateObject(
    {
      providerId: params.providerId,
      model: params.model,
      promptRef: { id: 'ui-prototype-planner' },
      input: [
        { type: 'text', text: composePrototypeRequirement(brief, params.intent) },
      ],
      reasoningEffort: params.effort,
      signal: params.signal,
    },
    generatedPrototypePlanSchema,
  )
  if (isErr(result)) {
    let failure = result
    if (shouldUseProgressivePlanner(result.error)) {
      const progressive = await planPrototypeProgressively(generation, {
        ...params,
        brief,
      })
      if (!isErr(progressive)) return progressive
      if (isCredentialOrAuthFailure(progressive.error)) return progressive
      if (isProgressiveContractFailure(progressive.error)) return progressive
      failure = progressive
    }
    return failure
  }

  const plan = result.data

  const validation = validatePrototypePlan(plan)
  if (isErr(validation)) {
    return err(`The planner produced an invalid prototype plan: ${validation.error}`)
  }

  return ok(plan)
}

export function explicitPrototypePageCount(brief: string): number | null {
  const numeric = brief.match(/\b(\d{1,2})\s*(?:pages?|screens?)\b/i)
    ?? brief.match(
      /(\d{1,2})\s*(?:个|张)?[^，。,.;；\n\d]{0,32}(?:页面|页|屏幕)/,
    )
  if (numeric) return boundedPageCount(Number(numeric[1]))

  const chinese = brief.match(
    /([一二两三四五六七八九十]+)\s*(?:个|张)?[^，。,.;；\n\d]{0,32}(?:页面|页|屏幕)/,
  )
  if (chinese) return boundedPageCount(parseChineseCount(chinese[1]!))

  const english = brief.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:pages?|screens?)\b/i)
  if (!english) return null
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return words.indexOf(english[1]!.toLowerCase()) + 1
}

function boundedPageCount(value: number): number | null {
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null
}

function parseChineseCount(value: string): number {
  const digits: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6,
    七: 7, 八: 8, 九: 9,
  }
  if (value === '十') return 10
  if (value.startsWith('十')) return 10 + (digits[value[1]!] ?? 0)
  if (value.endsWith('十')) return (digits[value[0]!] ?? 0) * 10
  return digits[value] ?? Number.NaN
}

function fallbackProductName(brief: string, intent?: IntentProfile): string {
  return firstNonEmpty(
    intentDimension(intent, 'product'),
    firstLine(brief),
    'Untitled product',
  ).slice(0, 80)
}

function fallbackProjectName(name: string): string {
  const shortName = firstLine(name).replace(/\s+/g, ' ').trim()
  if (!shortName) return 'Untitled product'
  return shortName.length > 32 ? shortName.slice(0, 32).trim() : shortName
}

function fallbackPlatform(brief: string, intent?: IntentProfile): string {
  const text = `${brief} ${intent?.goal ?? ''} ${intent?.strategy ?? ''} ${intent
    ?.dimensions
    .map((dimension) => `${dimension.aspect} ${dimension.value}`)
    .join(' ') ?? ''}`.toLowerCase()

  if (
    text.includes('mobile') ||
    text.includes('ios') ||
    text.includes('android') ||
    text.includes('app')
  ) {
    return 'mobile app'
  }
  if (text.includes('ipad') || text.includes('tablet')) return 'tablet app'
  if (text.includes('macos') || text.includes('desktop')) return 'desktop app'
  if (text.includes('embedded') || text.includes('device')) return 'embedded UI'
  return 'responsive web'
}

function fallbackViewport(platform: string): PrototypePlan['pages'][number]['viewport'] {
  if (platform === 'mobile app') {
    return { platform, width: 390, height: 844, scroll: 'long-scroll' }
  }
  if (platform === 'tablet app') {
    return { platform, width: 1024, height: 1366, scroll: 'long-scroll' }
  }
  if (platform === 'desktop app') {
    return { platform, width: 1440, height: 960, scroll: 'single-screen' }
  }
  if (platform === 'embedded UI') {
    return { platform, width: 800, height: 480, scroll: 'single-screen' }
  }
  return { platform, width: 1440, height: 1200, scroll: 'long-scroll' }
}

function fallbackStyleSummary(brief: string, intent?: IntentProfile): string {
  const source = `${brief} ${intent?.goal ?? ''} ${intent?.strategy ?? ''}`.toLowerCase()
  if (source.includes('game') || source.includes('club')) {
    return 'Immersive, high-contrast interface with strong visual assets and restrained functional chrome.'
  }
  if (source.includes('shop') || source.includes('store') || source.includes('mall')) {
    return 'Clean commerce interface with trustworthy structure, clear product imagery, and reusable promotional assets.'
  }
  if (source.includes('dashboard') || source.includes('admin')) {
    return 'Quiet professional interface with dense information hierarchy and selective visual assets.'
  }
  return 'Modern, clear, professional interface that separates product structure from high-value visual assets.'
}

function fallbackPalette(brief: string, intent?: IntentProfile): string[] {
  const source = `${brief} ${intent?.goal ?? ''} ${intent?.strategy ?? ''}`.toLowerCase()
  if (source.includes('diamond') || source.includes('luxury')) {
    return ['graphite', 'diamond white', 'cool blue', 'platinum']
  }
  if (source.includes('cat') || source.includes('pet')) {
    return ['warm ivory', 'ink', 'soft peach', 'mint accent']
  }
  if (source.includes('beer') || source.includes('bar') || source.includes('club')) {
    return ['ink black', 'warm amber', 'cream highlight', 'electric accent']
  }
  return ['neutral canvas', 'ink', 'brand accent', 'soft surface']
}

function intentDimension(
  intent: IntentProfile | undefined,
  aspect: string,
): string | undefined {
  return intent?.dimensions.find(
    (dimension) => dimension.aspect.toLowerCase() === aspect,
  )?.value
}

function firstLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value): value is string => Boolean(value?.trim()))?.trim() ?? ''
}
