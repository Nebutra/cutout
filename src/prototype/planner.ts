import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import type { IntentProfile } from '@/dag/intent-types'
import { forEachConcurrent } from '@/lib/async-pool'
import { createMonotonicDeadline } from '@/platform/monotonic-deadline'
import { z } from 'zod'
import {
  generatedPrototypePlanSchema,
  prototypeHumanLoopSchema,
  prototypeInteractionSchema,
  prototypeDesignSystemSchema,
  prototypePageSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'
import {
  candidateDirectionSchema,
  candidateExplorationDecisionSchema,
} from '@/candidate-selection/contracts'
import { classifyGenerationError } from '@/services/ai/generation-error'

export const PROTOTYPE_DESIGN_SYSTEM_MAX_PARALLELISM = 3
export const PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM = 3
export const PROTOTYPE_PLANNER_STAGE_TIMEOUT_MS = 180_000
export const PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS = 300_000
export const PROTOTYPE_PROGRESSIVE_PLANNER_MAX_TIMEOUT_MS = 10 * 60_000
export const PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES = 32_768

type PlannerGenerationService = Pick<
  GenerationService,
  'generateObject' | 'streamText'
> & {
  /** A bounded native planning runtime can lower, but never raise, page fanout. */
  readonly planningTurnConcurrency?: number
}

export interface PlanPrototypeParams {
  readonly providerId: string
  readonly model?: string
  readonly brief: string
  readonly intent?: IntentProfile
  readonly effort?: ReasoningEffort
  readonly signal?: AbortSignal
  /** Runtime-owned ceiling for independent page expansion. */
  readonly pageParallelism?: number
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

/**
 * The route graph is Agent-authored, so its page count is unknowable before
 * outline completion. Size the remaining DAG budget from that resolved graph
 * instead of treating five minutes as an implicit fixed-page product limit.
 * Every individual turn keeps its stricter stage deadline and the full journey
 * remains capped at twenty minutes.
 */
export function progressivePlannerTimeoutMs(
  pageCount: number,
  pageParallelism = PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM,
): number {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 12) {
    throw new Error('Progressive planner page count is outside the supported range.')
  }
  if (!Number.isInteger(pageParallelism)
    || pageParallelism < 1
    || pageParallelism > PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM) {
    throw new Error('Progressive planner page parallelism is outside the supported range.')
  }
  const pageWaves = Math.ceil(pageCount / pageParallelism)
  const expectedMs =
    PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS + pageWaves * 30_000
  return Math.min(
    PROTOTYPE_PROGRESSIVE_PLANNER_MAX_TIMEOUT_MS,
    Math.max(PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS, expectedMs),
  )
}

function effectivePlannerPageParallelism(
  generation: PlannerGenerationService,
  requested: number | undefined,
): number {
  const requestedParallelism = requested
    ?? PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM
  const runtimeParallelism = generation.planningTurnConcurrency
    ?? PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM
  return Math.min(requestedParallelism, runtimeParallelism)
}

async function runPlannerResultWithDeadline<T>(input: {
  readonly parentSignal?: AbortSignal
  readonly timeoutMs: number
  readonly timeoutMessage: string
  readonly run: (signal: AbortSignal) => Promise<Result<T>>
}): Promise<Result<T>> {
  if (input.parentSignal?.aborted) return err('AbortError: operation aborted')
  const controller = new AbortController()
  let settleInterruption: (reason: 'parent' | 'timeout') => void = () => {}
  const interruption = new Promise<'parent' | 'timeout'>((resolve) => {
    settleInterruption = resolve
  })
  const abortFromParent = () => {
    settleInterruption('parent')
    controller.abort()
  }
  input.parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const deadline = createMonotonicDeadline(input.timeoutMs)
  void deadline.elapsed.then((elapsed) => {
    if (!elapsed) return
    settleInterruption('timeout')
    controller.abort()
  })
  try {
    const settled = await Promise.race([
      input.run(controller.signal).then(
        (result) => ({ kind: 'result' as const, result }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      ),
      interruption.then((reason) => ({ kind: 'interrupted' as const, reason })),
    ])
    if (settled.kind === 'interrupted') {
      return settled.reason === 'parent'
        ? err('AbortError: operation aborted')
        : err(input.timeoutMessage)
    }
    if (settled.kind === 'error') {
      return err(settled.error instanceof Error ? settled.error.message : String(settled.error))
    }
    return settled.result
  } finally {
    deadline.cancel()
    input.parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

function generatePlannerObject<T>(
  generation: Pick<GenerationService, 'generateObject'>,
  params: PlanPrototypeParams,
  stage: string,
  input: GenerateInput,
  schema: z.ZodType<T>,
): Promise<Result<T>> {
  return runPlannerResultWithDeadline({
    parentSignal: params.signal,
    timeoutMs: PROTOTYPE_PLANNER_STAGE_TIMEOUT_MS,
    timeoutMessage: `Prototype planner ${stage} timed out.`,
    run: (signal) => generation.generateObject({ ...input, signal }, schema),
  })
}

const progressivePageOutlineSchema = prototypePageSchema.pick({
  id: true,
  name: true,
  route: true,
  purpose: true,
  viewport: true,
})

const progressiveRouteEdgeSchema = z.object({
  id: z.string().min(1),
  fromPageId: z.string().min(1),
  toPageId: z.string().min(1),
  label: z.string().min(1),
  trigger: prototypeInteractionSchema.shape.trigger,
  sourceElement: z.string().min(1),
  intent: z.string().min(1),
}).strict()

const progressivePrototypeOutlineSchema = generatedPrototypePlanSchema.pick({
  version: true,
  product: true,
}).extend({
  pages: z.array(progressivePageOutlineSchema).min(1).max(12),
  entryPageIds: z.array(z.string().min(1)).min(1).max(12),
  edges: z.array(progressiveRouteEdgeSchema).max(48),
  humanLoop: prototypeHumanLoopSchema,
}).superRefine((outline, context) => {
  const pageIds = new Set<string>()
  const routes = new Set<string>()
  for (const [pageIndex, page] of outline.pages.entries()) {
    if (pageIds.has(page.id)) {
      context.addIssue({
        code: 'custom',
        path: ['pages', pageIndex, 'id'],
        message: `Duplicate outlined page id "${page.id}".`,
      })
    }
    if (routes.has(page.route)) {
      context.addIssue({
        code: 'custom',
        path: ['pages', pageIndex, 'route'],
        message: `Duplicate outlined page route "${page.route}".`,
      })
    }
    pageIds.add(page.id)
    routes.add(page.route)
  }

  if (outline.humanLoop.mode === 'ask') {
    const choiceIds = new Set<string>()
    for (const [choiceIndex, choice] of outline.humanLoop.choices.entries()) {
      if (choiceIds.has(choice.id)) {
        context.addIssue({
          code: 'custom',
          path: ['humanLoop', 'choices', choiceIndex, 'id'],
          message: `Duplicate human-loop choice id "${choice.id}".`,
        })
      }
      choiceIds.add(choice.id)
    }
    if (!choiceIds.has(outline.humanLoop.defaultChoiceId)) {
      context.addIssue({
        code: 'custom',
        path: ['humanLoop', 'defaultChoiceId'],
        message: 'Human-loop default choice must reference an authored choice.',
      })
    }
  }

  const edgeIdsByPage = new Map<string, Set<string>>()
  for (const [edgeIndex, edge] of outline.edges.entries()) {
    if (!pageIds.has(edge.fromPageId) || !pageIds.has(edge.toPageId)) {
      context.addIssue({
        code: 'custom',
        path: ['edges', edgeIndex],
        message: 'Route edges must reference outlined pages.',
      })
    }
    const ids = edgeIdsByPage.get(edge.fromPageId) ?? new Set<string>()
    if (ids.has(edge.id)) {
      context.addIssue({
        code: 'custom',
        path: ['edges', edgeIndex, 'id'],
        message: `Duplicate route edge id "${edge.id}" on page "${edge.fromPageId}".`,
      })
    }
    ids.add(edge.id)
    edgeIdsByPage.set(edge.fromPageId, ids)
  }

  const entryPageIds = new Set<string>()
  for (const [entryIndex, pageId] of outline.entryPageIds.entries()) {
    if (!pageIds.has(pageId) || entryPageIds.has(pageId)) {
      context.addIssue({
        code: 'custom',
        path: ['entryPageIds', entryIndex],
        message: 'Route entries must reference distinct outlined pages.',
      })
    }
    entryPageIds.add(pageId)
  }

  const reachable = new Set<string>()
  const queue = [...outline.entryPageIds]
  while (queue.length > 0) {
    const pageId = queue.shift() as string
    if (reachable.has(pageId)) continue
    reachable.add(pageId)
    for (const edge of outline.edges) {
      if (edge.fromPageId === pageId) queue.push(edge.toPageId)
    }
  }
  for (const [pageIndex, page] of outline.pages.entries()) {
    if (reachable.has(page.id)) continue
    context.addIssue({
      code: 'custom',
      path: ['pages', pageIndex, 'id'],
      message: `Outlined page "${page.id}" is unreachable from every authored entry.`,
    })
  }
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

type ProgressivePrototypeOutline = z.infer<typeof progressivePrototypeOutlineSchema>
type ProgressivePage = PrototypePlan['pages'][number]

type ProgressivePageDetailIssueCode =
  | 'page-id-drift'
  | 'route-identity-drift'
  | 'viewport-drift'
  | 'duplicate-region'
  | 'duplicate-overlay'
  | 'duplicate-state'
  | 'duplicate-interaction'
  | 'unknown-source-section'
  | 'unknown-overlay'
  | 'unknown-state'
  | 'unknown-page'
  | 'repair-count-drift'
  | 'repair-content-drift'

interface ProgressivePageDetailIssue {
  readonly owner: 'page-detail'
  readonly code: ProgressivePageDetailIssueCode
  readonly pageId: string
  readonly message: string
}

interface ProgressivePageShape {
  readonly regions: number
  readonly overlays: number
  readonly states: number
  readonly interactions: number
  readonly assetOpportunities: number
}

const PROGRESSIVE_OUTLINE_SYSTEM = [
  'You are Cutout\'s prototype route architect.',
  'Produce only a concise product definition and complete reachable route graph.',
  'Derive route topology from the business domain, content model, platform conventions, and complete user journeys.',
  'Treat a user-mentioned page count as scope context, not authority to pad or truncate the graph. Ask when ambiguity materially changes topology; otherwise justify the resolved graph in the human-loop rationale.',
  'Every route must be a distinct useful destination and every route after the first must be reachable through an authored navigation edge.',
  'Do not write Design System details, page regions, interactions, flows, or review Markdown in this step.',
].join(' ')

const PROGRESSIVE_OUTLINE_TEXT_SYSTEM = [
  'You are Cutout\'s prototype route architect.',
  'Return only the CUTOUT_OUTLINE_V2 tab-separated line protocol below, without Markdown or blank lines.',
  'The exact grammar is:',
  '<TAB> means one literal tab character; do not print the angle-bracket token.',
  'CUTOUT_OUTLINE_V2',
  'VERSION<TAB>prototype-plan.v0',
  'PRODUCT<TAB>name<TAB>project-name-or--<TAB>summary<TAB>audience<TAB>primary-goal<TAB>platform',
  'PAGE<TAB>id<TAB>name<TAB>route<TAB>purpose<TAB>viewport-platform<TAB>width<TAB>height<TAB>single-screen-or-long-scroll',
  'Repeat PAGE once for every Agent-authored route, in navigation order.',
  'ENTRY<TAB>page-id',
  'Repeat ENTRY for each legitimate journey entry route. Every page must be reachable from at least one ENTRY through EDGE lines.',
  'EDGE<TAB>interaction-id<TAB>from-page-id<TAB>to-page-id<TAB>label<TAB>trigger<TAB>source-element<TAB>intent',
  'Repeat EDGE for the business-meaningful navigation graph. Trigger is click, tap, hover, scroll, submit, or change.',
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
  'The route outline already owns cross-page navigation. Do not author navigate actions; the orchestrator compiles the exact outlined navigation edges after this page settles. Author only meaningful page-local interactions.',
  'Author zero or more asset opportunities based only on genuine non-UI reuse value and non-code-reproducibility; zero is valid and a number mentioned in the brief is not a quota.',
  'Keep code-reproducible layout regions on ignore-code-ui. Use zero or more coherent board-cutout regions: share a well-separated white board only when the atomic assets belong together and remain legible, and split unrelated or dense sets into separate regions. Reserve direct-generate for exceptional complex standalone artwork, never one call per manifest item by default.',
].join(' ')

const PROGRESSIVE_PAGE_REPAIR_SYSTEM = [
  'You are Cutout\'s prototype page integrity repairer.',
  'Repair only the supplied invalid page detail and return one complete page.',
  'Preserve the exact route-outline identity plus every authored region, overlay, state, interaction, reusable-asset count, and semantic intent.',
  'Correct only invalid identities or references using the supplied route-outline page ids and page-local target ids.',
  'Do not add or remove regions, overlays, states, interactions, or reusable asset opportunities. Do not return sibling pages.',
].join(' ')

const PROGRESSIVE_OUTLINE_MAX_TOKENS = 8_000
const PROGRESSIVE_OUTLINE_TEXT_MAX_TOKENS = 4_000
// Header/version/product + 12 pages + 12 entries + 48 edges + ASK +
// four choices + END. Keep the parser bound aligned with the schema bounds so
// a valid maximal outline does not pay for a second structured planning turn.
const PROGRESSIVE_OUTLINE_TEXT_MAX_LINES = 81
const PROGRESSIVE_OUTLINE_TEXT_TIMEOUT_MS = 120_000
const PROGRESSIVE_DESIGN_MAX_TOKENS = 8_000
const PROGRESSIVE_PAGE_MAX_TOKENS = 12_000

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
        bounds: {
          maxCandidates: 8,
          maxParallelism: PROTOTYPE_DESIGN_SYSTEM_MAX_PARALLELISM,
        },
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

function shouldUseProgressivePlanner(message: string): boolean {
  const lower = message.toLowerCase()
  if (classifyGenerationError(message).kind !== 'configuration') return false
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

/**
 * Some compatible text routes retain an otherwise exact protocol inside one
 * Markdown fence. Accept only that lossless wrapper; explanatory prose,
 * multiple fences, and unterminated output remain outside the closed grammar.
 */
function unwrapProgressiveOutlineProtocol(output: string): string {
  const normalized = output
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n/gu, '\n')
    .trim()
  const fenced = /^```(?:text|plaintext|tsv)?\n([\s\S]*)\n```$/iu.exec(normalized)
  return fenced?.[1].trim() ?? normalized
}

function parseProgressiveOutlineText(
  output: string,
): Result<ProgressivePrototypeOutline> {
  if (new TextEncoder().encode(output).byteLength > PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES) {
    return progressiveOutlineTextFailure('oversized')
  }
  const lines = unwrapProgressiveOutlineProtocol(output).split('\n')
  while (lines.at(-1) === '') lines.pop()
  if (
    lines.length < 5
    || lines.length > PROGRESSIVE_OUTLINE_TEXT_MAX_LINES
    || lines[0] !== 'CUTOUT_OUTLINE_V2'
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

  const entryPageIds: string[] = []
  while (lines[cursor]?.startsWith('ENTRY\t')) {
    const fields = lines[cursor]!.split('\t')
    if (fields.length !== 2 || !isSafeProtocolId(fields[1]!)) {
      return progressiveOutlineTextFailure('unsafe')
    }
    entryPageIds.push(fields[1]!)
    cursor += 1
  }
  if (entryPageIds.length === 0 || entryPageIds.length > 12) {
    return progressiveOutlineTextFailure('malformed')
  }

  const edges: ProgressivePrototypeOutline['edges'] = []
  while (lines[cursor]?.startsWith('EDGE\t')) {
    const fields = lines[cursor]!.split('\t')
    if (fields.length !== 8) return progressiveOutlineTextFailure('malformed')
    const [, id, fromPageId, toPageId, label, trigger, sourceElement, intent] = fields
    if (
      !isSafeProtocolId(id!)
      || !isSafeProtocolId(fromPageId!)
      || !isSafeProtocolId(toPageId!)
      || !isSafeProtocolText(label!, 160)
      || !prototypeInteractionSchema.shape.trigger.safeParse(trigger).success
      || !isSafeProtocolText(sourceElement!, 160)
      || !isSafeProtocolText(intent!, 1_000)
    ) {
      return progressiveOutlineTextFailure('unsafe')
    }
    edges.push({
      id: id!,
      fromPageId: fromPageId!,
      toPageId: toPageId!,
      label: label!,
      trigger: trigger as z.infer<typeof prototypeInteractionSchema.shape.trigger>,
      sourceElement: sourceElement!,
      intent: intent!,
    })
    cursor += 1
  }
  if (edges.length > 48) return progressiveOutlineTextFailure('malformed')

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
    entryPageIds,
    edges,
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

  const structured = await generatePlannerObject(
    generation,
    params,
    'outline',
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
  const deadline = createMonotonicDeadline(PROGRESSIVE_OUTLINE_TEXT_TIMEOUT_MS)
  void deadline.elapsed.then((elapsed) => {
    if (!elapsed) return
    controller.abort()
    settleInterruption('timeout')
  })
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
    deadline.cancel()
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
  const pages = outline.pages.map((page) => {
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
      interactions: outline.edges
        .filter(({ fromPageId }) => fromPageId === page.id)
        .map((edge) => ({
          id: edge.id,
          label: edge.label,
          trigger: edge.trigger,
          sourceSectionId: regionId,
          sourceElement: edge.sourceElement,
          intent: edge.intent,
          action: { type: 'navigate' as const, targetPageId: edge.toPageId },
        })),
    }
  })
  return {
    ...fallback,
    product: outline.product,
    pages,
    flows: outline.entryPageIds.map((startPageId, index) => ({
      id: `clarification-route-outline-${index + 1}`,
      name: `Clarification route outline ${index + 1}`,
      goal: outline.product.primaryGoal,
      startPageId,
      steps: outline.edges.map((edge) => ({
        fromPageId: edge.fromPageId,
        interactionId: edge.id,
        toPageId: edge.toPageId,
      })),
    })),
    humanLoop: outline.humanLoop,
  }
}

function compileProgressiveRouteEdges(
  outline: ProgressivePrototypeOutline,
  pages: readonly ProgressivePage[],
): Result<ProgressivePage[]> {
  const edgesByPage = new Map<string, ProgressivePrototypeOutline['edges']>()
  for (const edge of outline.edges) {
    const edges = edgesByPage.get(edge.fromPageId) ?? []
    edgesByPage.set(edge.fromPageId, [...edges, edge])
  }

  const compiled: ProgressivePage[] = []
  for (const page of pages) {
    const localInteractions = page.interactions.filter(
      ({ action }) => action.type !== 'navigate',
    )
    const reservedIds = new Set((edgesByPage.get(page.id) ?? []).map(({ id }) => id))
    const collision = localInteractions.find(({ id }) => reservedIds.has(id))
    if (collision) return err(
      `Progressive planner page details remained invalid: Page "${page.id}" uses reserved route-edge interaction id "${collision.id}".`,
    )
    compiled.push({
      ...page,
      interactions: [
        ...localInteractions,
        ...(edgesByPage.get(page.id) ?? []).map((edge) => ({
          id: edge.id,
          label: edge.label,
          trigger: edge.trigger,
          sourceElement: edge.sourceElement,
          intent: edge.intent,
          action: { type: 'navigate' as const, targetPageId: edge.toPageId },
        })),
      ],
    })
  }
  return ok(compiled)
}

function progressivePageNavigationContext(
  outline: ProgressivePrototypeOutline,
  target: z.infer<typeof progressivePageOutlineSchema>,
): string {
  return JSON.stringify({
    product: outline.product,
    routes: outline.pages.map(({ id, name, route }) => ({ id, name, route })),
    entryPageIds: outline.entryPageIds,
    incomingEdges: outline.edges.filter(({ toPageId }) => toPageId === target.id),
    outgoingEdges: outline.edges.filter(({ fromPageId }) => fromPageId === target.id),
  })
}

function compileProgressiveClosure(
  outline: ProgressivePrototypeOutline,
): Pick<PrototypePlan, 'flows' | 'reviewDocument'> {
  const pageById = new Map(outline.pages.map((page) => [page.id, page]))
  const edgeLines = outline.edges.map((edge) => {
    const source = pageById.get(edge.fromPageId)
    const target = pageById.get(edge.toPageId)
    return `- ${source?.name ?? edge.fromPageId} (${source?.route ?? edge.fromPageId}) -- ${edge.label} --> ${target?.name ?? edge.toPageId} (${target?.route ?? edge.toPageId})`
  })
  const routeLines = outline.pages.map((page) =>
    `- ${page.name} (${page.route}): ${page.purpose}`,
  )
  const entryLines = outline.entryPageIds.map((pageId) => {
    const page = pageById.get(pageId)
    return `- ${page?.name ?? pageId} (${page?.route ?? pageId})`
  })
  const flows = outline.entryPageIds.map((startPageId, index) => ({
    id: `route-journey-${index + 1}`,
    name: `Route journey ${index + 1}`,
    goal: outline.product.primaryGoal,
    startPageId,
    steps: outline.edges.map((edge) => ({
      fromPageId: edge.fromPageId,
      interactionId: edge.id,
      toPageId: edge.toPageId,
    })),
  }))
  return {
    flows,
    reviewDocument: {
      format: 'markdown',
      primaryFlow: [
        `# ${outline.product.name} primary journey`,
        '',
        `Goal: ${outline.product.primaryGoal}`,
        '',
        'Entry routes:',
        ...entryLines,
        '',
        'Authoritative navigation:',
        ...(edgeLines.length > 0 ? edgeLines : ['- No cross-route navigation is required.']),
      ].join('\n'),
      fullPlan: [
        `# ${outline.product.name} route plan`,
        '',
        outline.product.summary,
        '',
        'Routes:',
        ...routeLines,
        '',
        'Journey entries:',
        ...entryLines,
        '',
        'Authoritative navigation:',
        ...(edgeLines.length > 0 ? edgeLines : ['- No cross-route navigation is required.']),
      ].join('\n'),
    },
  }
}

function progressivePageShape(page: ProgressivePage): ProgressivePageShape {
  return {
    regions: page.regions.length,
    overlays: page.overlays.length,
    states: page.states.length,
    interactions: page.interactions.length,
    assetOpportunities: page.regions.reduce(
      (total, region) => total + region.assetOpportunities.length,
      0,
    ),
  }
}

function progressivePageRepairContent(page: ProgressivePage): unknown {
  return {
    regions: page.regions.map(({ id: _id, ...region }) => region),
    overlays: page.overlays.map(({ id: _id, ...overlay }) => overlay),
    states: page.states.map(({ id: _id, ...state }) => state),
    interactions: page.interactions.map((interaction) => ({
      label: interaction.label,
      trigger: interaction.trigger,
      sourceElement: interaction.sourceElement,
      intent: interaction.intent,
      action: interaction.action.type === 'external'
        ? interaction.action
        : interaction.action.type === 'none'
          ? interaction.action
          : { type: interaction.action.type },
    })),
  }
}

function progressivePageIssue(
  code: ProgressivePageDetailIssueCode,
  pageId: string,
  message: string,
): ProgressivePageDetailIssue {
  return { owner: 'page-detail', code, pageId, message }
}

function duplicateIdentity(values: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return null
}

function progressivePageDetailIssue(
  outline: z.infer<typeof progressivePageOutlineSchema>,
  detailed: ProgressivePage,
  expectedShape?: ProgressivePageShape,
  expectedContent?: unknown,
): ProgressivePageDetailIssue | null {
  if (detailed.id !== outline.id) {
    return progressivePageIssue(
      'page-id-drift',
      outline.id,
      `Progressive planner page details changed page id for ${outline.id}.`,
    )
  }
  if (
    detailed.name !== outline.name
    || detailed.route !== outline.route
    || detailed.purpose !== outline.purpose
  ) {
    return progressivePageIssue(
      'route-identity-drift',
      outline.id,
      `Progressive planner page details changed route identity for ${outline.id}.`,
    )
  }
  if (
    detailed.viewport.platform !== outline.viewport.platform
    || detailed.viewport.width !== outline.viewport.width
    || detailed.viewport.height !== outline.viewport.height
    || detailed.viewport.scroll !== outline.viewport.scroll
  ) {
    return progressivePageIssue(
      'viewport-drift',
      outline.id,
      `Progressive planner page details changed viewport for ${outline.id}.`,
    )
  }
  if (expectedShape) {
    const actualShape = progressivePageShape(detailed)
    const countDrift = Object.entries(expectedShape).find(
      ([key, expected]) => actualShape[key as keyof ProgressivePageShape] !== expected,
    )
    if (countDrift) {
      return progressivePageIssue(
        'repair-count-drift',
        outline.id,
        `Progressive planner page repair changed authored ${countDrift[0]} count for ${outline.id}.`,
      )
    }
  }
  if (
    expectedContent !== undefined
    && JSON.stringify(progressivePageRepairContent(detailed)) !== JSON.stringify(expectedContent)
  ) {
    return progressivePageIssue(
      'repair-content-drift',
      outline.id,
      `Progressive planner page repair changed authored semantic content for ${outline.id}.`,
    )
  }

  const duplicateRegion = duplicateIdentity(detailed.regions.map(({ id }) => id))
  if (duplicateRegion) {
    return progressivePageIssue(
      'duplicate-region',
      outline.id,
      `Page "${outline.id}" has duplicate region id: "${duplicateRegion}".`,
    )
  }
  const duplicateOverlay = duplicateIdentity(detailed.overlays.map(({ id }) => id))
  if (duplicateOverlay) {
    return progressivePageIssue(
      'duplicate-overlay',
      outline.id,
      `Page "${outline.id}" has duplicate overlay id: "${duplicateOverlay}".`,
    )
  }
  const duplicateState = duplicateIdentity(detailed.states.map(({ id }) => id))
  if (duplicateState) {
    return progressivePageIssue(
      'duplicate-state',
      outline.id,
      `Page "${outline.id}" has duplicate state id: "${duplicateState}".`,
    )
  }
  const duplicateInteraction = duplicateIdentity(detailed.interactions.map(({ id }) => id))
  if (duplicateInteraction) {
    return progressivePageIssue(
      'duplicate-interaction',
      outline.id,
      `Page "${outline.id}" has duplicate interaction id: "${duplicateInteraction}".`,
    )
  }

  const regionIds = new Set(detailed.regions.map(({ id }) => id))
  const overlayIds = new Set(detailed.overlays.map(({ id }) => id))
  const stateIds = new Set(detailed.states.map(({ id }) => id))
  for (const interaction of detailed.interactions) {
    if (interaction.sourceSectionId && !regionIds.has(interaction.sourceSectionId)) {
      return progressivePageIssue(
        'unknown-source-section',
        outline.id,
        `Interaction "${interaction.id}" references unknown section "${interaction.sourceSectionId}" on page "${outline.id}".`,
      )
    }
    const action = interaction.action
    if (action.type === 'open-overlay' && !overlayIds.has(action.targetOverlayId)) {
      return progressivePageIssue(
        'unknown-overlay',
        outline.id,
        `Interaction "${interaction.id}" opens unknown overlay "${action.targetOverlayId}" on page "${outline.id}".`,
      )
    }
    if (action.type === 'change-state' && !stateIds.has(action.targetStateId)) {
      return progressivePageIssue(
        'unknown-state',
        outline.id,
        `Interaction "${interaction.id}" changes to unknown state "${action.targetStateId}" on page "${outline.id}".`,
      )
    }
  }
  return null
}

function progressivePageCrossPageIssue(
  pageIds: ReadonlySet<string>,
  detailed: ProgressivePage,
): ProgressivePageDetailIssue | null {
  for (const interaction of detailed.interactions) {
    const action = interaction.action
    if (action.type === 'navigate' && !pageIds.has(action.targetPageId)) {
      return progressivePageIssue(
        'unknown-page',
        detailed.id,
        `Interaction "${interaction.id}" navigates to unknown page "${action.targetPageId}".`,
      )
    }
  }
  return null
}

function progressiveCompletePageIssue(
  outline: z.infer<typeof progressivePageOutlineSchema>,
  pageIds: ReadonlySet<string>,
  detailed: ProgressivePage,
  expectedShape?: ProgressivePageShape,
  expectedContent?: unknown,
): ProgressivePageDetailIssue | null {
  return progressivePageDetailIssue(outline, detailed, expectedShape, expectedContent)
    ?? progressivePageCrossPageIssue(pageIds, detailed)
}

function progressivePageRepairInput(input: {
  readonly params: PlanPrototypeParams
  readonly requirement: string
  readonly outline: ProgressivePrototypeOutline
  readonly target: z.infer<typeof progressivePageOutlineSchema>
  readonly invalidPage: ProgressivePage
  readonly issue: ProgressivePageDetailIssue
}): GenerateInput {
  return progressiveInput(
    input.params,
    PROGRESSIVE_PAGE_REPAIR_SYSTEM,
    [
      'Original requirement:',
      input.requirement,
      '',
      'Complete authoritative route outline JSON:',
      JSON.stringify({
        product: input.outline.product,
        pages: input.outline.pages,
        entryPageIds: input.outline.entryPageIds,
        edges: input.outline.edges,
      }),
      '',
      'Exact target route outline JSON:',
      JSON.stringify(input.target),
      '',
      'Invalid page detail JSON:',
      JSON.stringify(input.invalidPage),
      '',
      'Structured page-detail validation issue JSON:',
      JSON.stringify(input.issue),
    ].join('\n'),
    PROGRESSIVE_PAGE_MAX_TOKENS,
  )
}

async function repairProgressivePage(input: {
  readonly generation: Pick<GenerationService, 'generateObject'>
  readonly params: PlanPrototypeParams
  readonly requirement: string
  readonly outline: ProgressivePrototypeOutline
  readonly target: z.infer<typeof progressivePageOutlineSchema>
  readonly invalidPage: ProgressivePage
  readonly issue: ProgressivePageDetailIssue
}): Promise<Result<ProgressivePage>> {
  const repaired = await generatePlannerObject(
    input.generation,
    input.params,
    `page ${input.target.id} repair`,
    progressivePageRepairInput(input),
    prototypePageSchema,
  )
  if (isErr(repaired)) return repaired
  const remainingIssue = progressiveCompletePageIssue(
    input.target,
    new Set(input.outline.pages.map(({ id }) => id)),
    repaired.data,
    progressivePageShape(input.invalidPage),
    progressivePageRepairContent(input.invalidPage),
  )
  return remainingIssue
    ? err(`Progressive planner page repair remained invalid: ${remainingIssue.message}`)
    : repaired
}

async function planPrototypeProgressively(
  generation: PlannerGenerationService,
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

  return runPlannerResultWithDeadline({
    parentSignal: params.signal,
    timeoutMs: progressivePlannerTimeoutMs(
      outline.pages.length,
      effectivePlannerPageParallelism(generation, params.pageParallelism),
    ),
    timeoutMessage: 'Prototype planning timed out.',
    run: (signal) => planPrototypeProgressivelyFromOutline(
      generation,
      { ...params, signal },
      requirement,
      outline,
    ),
  })
}

async function planPrototypeProgressivelyFromOutline(
  generation: PlannerGenerationService,
  params: PlanPrototypeParams,
  requirement: string,
  outline: ProgressivePrototypeOutline,
): Promise<Result<PrototypePlan>> {

  const outlineContext = JSON.stringify({
    product: outline.product,
    pages: outline.pages,
    entryPageIds: outline.entryPageIds,
    edges: outline.edges,
  })
  params.onProgress?.({
    stage: 'design-foundation',
    completedPages: 0,
    totalPages: outline.pages.length,
  })
  const designFoundationResult = await generatePlannerObject(
    generation,
    params,
    'design foundation',
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
  const designExplorationResult = await generatePlannerObject(
    generation,
    params,
    'design exploration',
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
    bounds: {
      maxCandidates: 8,
      maxParallelism: PROTOTYPE_DESIGN_SYSTEM_MAX_PARALLELISM,
    },
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

  const pageResults = Array<Result<PrototypePlan['pages'][number]> | undefined>(
    outline.pages.length,
  )
  const pageIssues = Array<ProgressivePageDetailIssue | null | undefined>(
    outline.pages.length,
  )
  let completedPages = 0
  await forEachConcurrent(
    outline.pages,
    effectivePlannerPageParallelism(generation, params.pageParallelism),
    async (page, pageIndex) => {
      const pageResult = await generatePlannerObject(
        generation,
        params,
        `page ${pageIndex + 1}`,
        progressiveInput(
          params,
          PROGRESSIVE_PAGES_SYSTEM,
          [
            'Original requirement:',
            requirement,
            '',
            'Choose zero or more reusable non-UI asset opportunities for this page based on genuine reuse value. Do not target a fixed per-page count from the brief.',
            '',
            'Target route navigation context JSON:',
            progressivePageNavigationContext(outline, page),
            '',
            'Expand only this exact page outline JSON:',
            JSON.stringify(page),
          ].join('\n'),
          PROGRESSIVE_PAGE_MAX_TOKENS,
        ),
        prototypePageSchema,
      )
      pageResults[pageIndex] = pageResult
      if (!isErr(pageResult)) {
        pageIssues[pageIndex] = progressivePageDetailIssue(page, pageResult.data)
        completedPages += 1
        params.onProgress?.({
          stage: 'page',
          completedPages,
          totalPages: outline.pages.length,
        })
      }
    },
  )

  const pages = [] as PrototypePlan['pages'][number][]
  for (const pageIndex of outline.pages.keys()) {
    const pageResult = pageResults[pageIndex]
    if (!pageResult) return err('Progressive planner did not settle every page expansion.')
    if (isErr(pageResult)) return progressiveStageFailure('page', pageResult.error)
    pages.push(pageResult.data)
  }

  const outlinePageIds = new Set(outline.pages.map(({ id }) => id))
  let pageRepairSpent = false
  for (const [pageIndex, outlinePage] of outline.pages.entries()) {
    const page = pages[pageIndex]!
    const issue = pageIssues[pageIndex]
    if (!issue) continue
    if (pageRepairSpent) {
      return err(`Progressive planner page details remained invalid: ${issue.message}`)
    }
    pageRepairSpent = true
    const repair = await repairProgressivePage({
      generation,
      params,
      requirement,
      outline,
      target: outlinePage,
      invalidPage: page,
      issue,
    })
    if (isErr(repair)) return repair
    pages[pageIndex] = repair.data
  }

  const compiledPages = compileProgressiveRouteEdges(outline, pages)
  if (isErr(compiledPages)) return compiledPages
  pages.splice(0, pages.length, ...compiledPages.data)

  for (const [pageIndex, outlinePage] of outline.pages.entries()) {
    const issue = progressivePageDetailIssue(
      outlinePage,
      pages[pageIndex]!,
    ) ?? progressivePageCrossPageIssue(outlinePageIds, pages[pageIndex]!)
    if (issue) {
      return err(`Progressive planner page details remained invalid: ${issue.message}`)
    }
  }

  params.onProgress?.({
    stage: 'closure',
    completedPages: pages.length,
    totalPages: outline.pages.length,
  })
  const closure = compileProgressiveClosure(outline)

  const combined = generatedPrototypePlanSchema.safeParse({
    version: outline.version,
    product: outline.product,
    designSystem,
    pages,
    flows: closure.flows,
    reviewDocument: closure.reviewDocument,
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

async function planPrototypeWithinDeadline(
  generation: PlannerGenerationService,
  params: PlanPrototypeParams,
): Promise<Result<PrototypePlan>> {
  const brief = params.brief.trim()
  if (brief.length === 0) return err('A requirement brief is required.')
  if (params.pageParallelism !== undefined && (
    !Number.isInteger(params.pageParallelism)
    || params.pageParallelism < 1
    || params.pageParallelism > PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM
  )) {
    return err('Prototype planner page parallelism is outside the supported range.')
  }

  // Only a clearly bounded small request benefits from one structured turn.
  // Normal intent-driven work has no page quota, so outline the topology first
  // and expand its independent routes concurrently.
  const explicitPages = explicitPrototypePageCount(brief)
  if (explicitPages === null || explicitPages >= 4) {
    return planPrototypeProgressively(generation, { ...params, brief })
  }

  const result = await generatePlannerObject(
    generation,
    params,
    'plan',
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

  params.onProgress?.({
    stage: 'complete',
    completedPages: plan.pages.length,
    totalPages: plan.pages.length,
  })
  return ok(plan)
}

export async function planPrototype(
  generation: PlannerGenerationService,
  params: PlanPrototypeParams,
): Promise<Result<PrototypePlan>> {
  const brief = params.brief.trim()
  if (brief.length === 0) return err('A requirement brief is required.')
  if (params.pageParallelism !== undefined && (
    !Number.isInteger(params.pageParallelism)
    || params.pageParallelism < 1
    || params.pageParallelism > PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM
  )) {
    return err('Prototype planner page parallelism is outside the supported range.')
  }
  const explicitPages = explicitPrototypePageCount(brief)
  if (explicitPages === null || explicitPages >= 4) {
    return planPrototypeProgressively(generation, { ...params, brief })
  }
  return runPlannerResultWithDeadline({
    parentSignal: params.signal,
    timeoutMs: PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS,
    timeoutMessage: 'Prototype planning timed out.',
    run: (signal) => planPrototypeWithinDeadline(generation, { ...params, signal }),
  })
}

export function explicitPrototypePageCount(brief: string): number | null {
  const numeric = brief.match(/\b(\d{1,2})\s*(?:pages?|screens?)\b/i)
    ?? brief.match(
      /(\d{1,2})\s*(?:个|张)?[^，。,.;；\n\d]{0,32}(?:页面|页|屏幕)/,
    )
  if (numeric) return boundedPageCount(Number(numeric[1]))

  const chinese = brief.match(
    /([一二两三四五六七八九十]+)\s*(?:(?:个|张)[^，。,.;；\n\d]{0,32})?(?:页面|页|屏幕)/,
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
