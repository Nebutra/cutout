import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type { GenerationService } from '@/services/ai/types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import type { IntentProfile } from '@/dag/intent-types'
import {
  generatedPrototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'

export interface PlanPrototypeParams {
  readonly providerId: string
  readonly model?: string
  readonly brief: string
  readonly intent?: IntentProfile
  readonly effort?: ReasoningEffort
  readonly signal?: AbortSignal
}

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

export function shouldUseLocalSemanticFallback(message: string): boolean {
  const lower = message.toLowerCase()
  const structuredFailure =
    lower.includes('structured json generation failed') ||
    lower.includes('response did not match schema') ||
    lower.includes('no object generated') ||
    lower.includes('did not match schema')

  if (structuredFailure) return true

  const hardProviderFailure =
    lower.includes('api_key') ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('provider not configured') ||
    lower.includes('forbidden') ||
    lower.includes('invalid api') ||
    lower.includes('invalid key')

  if (hardProviderFailure) return false

  const transientPlannerFailure =
    lower.includes('request failed') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('fetch failed')

  return transientPlannerFailure || (lower.includes('json') && lower.includes('schema'))
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
            assetRoute: 'direct-generate',
            assetOpportunities: [
              'brand key visual',
              'hero artwork',
              'distinctive illustration or material texture',
            ],
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
            assetOpportunities: [
              'thumbnail artwork',
              'cover image',
              'semantic icon',
            ],
          },
          {
            id: 'conversion',
            name: 'Conversion path',
            role: 'action',
            summary:
              'Expose the primary action and any visual asset required to make it feel specific.',
            complexity: 'low',
            decompositionStrategy: 'direct',
            assetRoute: 'board-cutout',
            assetOpportunities: ['badge artwork', 'CTA accent icon'],
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
    humanLoop: {
      mode: 'continue',
      rationale:
        'The model planner failed to produce schema-valid JSON, so Cutout is using a minimal local semantic plan to keep generation moving.',
    },
  }
}

export async function planPrototype(
  generation: Pick<GenerationService, 'generateObject'>,
  params: PlanPrototypeParams,
): Promise<Result<PrototypePlan>> {
  const brief = params.brief.trim()
  if (brief.length === 0) return err('A requirement brief is required.')

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
    if (shouldUseLocalSemanticFallback(result.error)) {
      const fallback = createLocalPrototypePlan(brief, params.intent)
      const fallbackValidation = validatePrototypePlan(fallback)
      const coverageError = prototypeBriefCoverageError(brief, fallback)
      if (!isErr(fallbackValidation) && !coverageError) return ok(fallback)
    }
    return result
  }

  let plan = result.data
  let coverageError = prototypeBriefCoverageError(brief, plan)
  if (coverageError) {
    const repaired = await generation.generateObject(
      {
        providerId: params.providerId,
        model: params.model,
        promptRef: { id: 'ui-prototype-planner' },
        input: [{
          type: 'text',
          text: [
            composePrototypeRequirement(brief, params.intent),
            '',
            'CORRECTION REQUIRED:',
            coverageError,
            'Regenerate the complete plan. Do not merge explicitly requested pages or screens.',
          ].join('\n'),
        }],
        reasoningEffort: params.effort,
        signal: params.signal,
      },
      generatedPrototypePlanSchema,
    )
    if (isErr(repaired)) return repaired
    plan = repaired.data
    coverageError = prototypeBriefCoverageError(brief, plan)
    if (coverageError) return err(`The planner did not satisfy the explicit scope: ${coverageError}`)
  }

  const validation = validatePrototypePlan(plan)
  if (isErr(validation)) {
    return err(`The planner produced an invalid prototype plan: ${validation.error}`)
  }

  return ok(plan)
}

export function explicitPrototypePageCount(brief: string): number | null {
  const numeric = brief.match(/\b(\d{1,2})\s*(?:个|张)?\s*(?:页面|页|屏幕|pages?|screens?)\b/i)
    ?? brief.match(/(\d{1,2})\s*(?:个|张)?\s*(?:页面|页|屏幕)/i)
  if (numeric) return boundedPageCount(Number(numeric[1]))

  const chinese = brief.match(/([一二两三四五六七八九十]+)\s*(?:个|张)?\s*(?:页面|页|屏幕)/)
  if (chinese) return boundedPageCount(parseChineseCount(chinese[1]!))

  const english = brief.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:pages?|screens?)\b/i)
  if (!english) return null
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return words.indexOf(english[1]!.toLowerCase()) + 1
}

function prototypeBriefCoverageError(brief: string, plan: PrototypePlan): string | null {
  const expected = explicitPrototypePageCount(brief)
  if (expected === null || plan.humanLoop.mode === 'ask') return null
  return plan.pages.length === expected
    ? null
    : `The brief explicitly requires ${expected} pages/screens, but the plan contains ${plan.pages.length}.`
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
