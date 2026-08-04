import { z } from 'zod'
import {
  candidateDirectionSchema,
  candidateExplorationDecisionSchema,
} from '@/candidate-selection/contracts'
import type { Result } from '@/services/types'
import { err, ok } from '@/services/types'

export const prototypeActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    targetPageId: z.string().min(1),
  }),
  z.object({
    type: z.literal('open-overlay'),
    targetOverlayId: z.string().min(1),
  }),
  z.object({
    type: z.literal('change-state'),
    targetStateId: z.string().min(1),
  }),
  z.object({
    type: z.literal('external'),
    destination: z.string().min(1),
  }),
  z.object({
    type: z.literal('none'),
    reason: z.string().min(1),
  }),
])

export const prototypeInteractionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  trigger: z.enum(['click', 'tap', 'hover', 'scroll', 'submit', 'change']),
  sourceSectionId: z.string().min(1).optional(),
  sourceElement: z.string().min(1),
  intent: z.string().min(1),
  action: prototypeActionSchema,
})

export const prototypeRegionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  summary: z.string().min(1),
  complexity: z.enum(['low', 'medium', 'high']),
  decompositionStrategy: z
    .enum(['direct', 'region-crop', 'recursive-region'])
    .default('direct'),
  assetRoute: z
    .enum(['direct-generate', 'board-cutout', 'ignore-code-ui'])
    .default('board-cutout'),
  assetOpportunities: z.array(z.string().min(1)).default([]),
})

export const prototypePageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  route: z.string().min(1),
  purpose: z.string().min(1),
  viewport: z.object({
    platform: z.string().min(1),
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    scroll: z.enum(['single-screen', 'long-scroll']).default('single-screen'),
  }),
  regions: z.array(prototypeRegionSchema).min(1),
  overlays: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
  })).default([]),
  states: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
  })).default([]),
  interactions: z.array(prototypeInteractionSchema).default([]),
})

export const prototypeFlowStepSchema = z.object({
  fromPageId: z.string().min(1),
  interactionId: z.string().min(1),
  toPageId: z.string().min(1).optional(),
})

export const prototypeFlowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  goal: z.string().min(1),
  startPageId: z.string().min(1),
  steps: z.array(prototypeFlowStepSchema).default([]),
})

export const prototypeHumanLoopChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  impact: z.string().min(1),
})

export const prototypeHumanLoopSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('continue'),
    rationale: z.string().min(1),
  }),
  z.object({
    mode: z.literal('ask'),
    rationale: z.string().min(1),
    question: z.string().min(1),
    choices: z.array(prototypeHumanLoopChoiceSchema).min(2).max(4),
    defaultChoiceId: z.string().min(1),
  }),
])

export const prototypeReviewDocumentSchema = z.object({
  format: z.literal('markdown'),
  primaryFlow: z.string().min(1).max(40_000),
  fullPlan: z.string().min(1).max(40_000),
})

export const prototypeDesignSystemSchema = z.object({
  styleSummary: z.string().min(1),
  palette: z.array(z.string().min(1)).min(1),
  typography: z.string().min(1),
  spacing: z.string().min(1),
  componentPrinciples: z.array(z.string().min(1)).min(1),
  assetDirection: z.string().min(1),
  exploration: candidateExplorationDecisionSchema,
})

const prototypePlanningMaterialIdentityShape = {
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
} as const

const prototypePlanningBoardGroupIdSchema = z.string().trim().min(1).max(80)

/** The shape is structural so Provider tool schemas expose the conditional
 * requirement before execution. */
export const prototypePlanningMaterialSchema = z.discriminatedUnion(
  'production',
  [
    z.object({
      ...prototypePlanningMaterialIdentityShape,
      production: z.literal('board-cutout'),
      boardGroupId: prototypePlanningBoardGroupIdSchema.describe(
        'Required route-local id for the coherent atomic family sharing this board.',
      ),
    }).strict(),
    z.object({
      ...prototypePlanningMaterialIdentityShape,
      production: z.literal('direct-generate'),
    }).strict(),
  ],
)
export const generatedPrototypePlanningMaterialSchema = prototypePlanningMaterialSchema

export const prototypePlanningRouteSchema = prototypePageSchema.pick({
  id: true,
  name: true,
  route: true,
  purpose: true,
  viewport: true,
}).extend({
  materials: z.array(prototypePlanningMaterialSchema).describe(
    'Zero or more non-UI visual materials genuinely worth reusing on this route. '
      + 'Do not include cards, forms, navigation, buttons, tables, or other code-reproducible UI.',
  ),
}).superRefine((route, context) => {
  const materialIds = new Set<string>()
  for (const [materialIndex, material] of route.materials.entries()) {
    if (materialIds.has(material.id)) {
      context.addIssue({
        code: 'custom',
        path: ['materials', materialIndex, 'id'],
        message: `Duplicate material id "${material.id}" on route "${route.route}".`,
      })
    }
    materialIds.add(material.id)
  }
})

export const prototypePlanningSeedSchema = z.object({
  product: z.object({
    name: z.string().min(1),
    projectName: z.string().min(1).max(32).optional(),
    summary: z.string().min(1),
    audience: z.string().min(1),
    primaryGoal: z.string().min(1),
    platform: z.string().min(1),
  }),
  rationale: z.string().trim().min(1).max(2_000),
  suites: z.array(z.object({
    direction: candidateDirectionSchema,
    pages: z.array(prototypePlanningRouteSchema).min(1).max(12),
  }).strict()).min(1).max(8),
}).strict().superRefine((seed, context) => {
  const directionIds = new Set<string>()
  const routeGraphs = new Set<string>()
  for (const [suiteIndex, suite] of seed.suites.entries()) {
    if (directionIds.has(suite.direction.id)) {
      context.addIssue({
        code: 'custom',
        path: ['suites', suiteIndex, 'direction', 'id'],
        message: `Duplicate direction id "${suite.direction.id}".`,
      })
    }
    directionIds.add(suite.direction.id)
    const ids = new Set<string>()
    const routes = new Set<string>()
    for (const [pageIndex, page] of suite.pages.entries()) {
      if (ids.has(page.id)) {
        context.addIssue({
          code: 'custom',
          path: ['suites', suiteIndex, 'pages', pageIndex, 'id'],
          message: `Duplicate page id "${page.id}".`,
        })
      }
      if (routes.has(page.route)) {
        context.addIssue({
          code: 'custom',
          path: ['suites', suiteIndex, 'pages', pageIndex, 'route'],
          message: `Duplicate route "${page.route}".`,
        })
      }
      ids.add(page.id)
      routes.add(page.route)
    }
    const graph = JSON.stringify(suite.pages.map(({ route }) => route))
    if (routeGraphs.has(graph)) {
      context.addIssue({
        code: 'custom',
        path: ['suites', suiteIndex, 'pages'],
        message: 'Every suite must use a distinct route graph.',
      })
    }
    routeGraphs.add(graph)
  }
})

export const generatedPrototypePlanningSeedSchema = prototypePlanningSeedSchema

export const prototypePlanSchema = z.object({
  version: z.literal('prototype-plan.v0'),
  product: z.object({
    name: z.string().min(1),
    projectName: z.string().min(1).max(32).optional(),
    summary: z.string().min(1),
    audience: z.string().min(1),
    primaryGoal: z.string().min(1),
    platform: z.string().min(1),
  }),
  designSystem: prototypeDesignSystemSchema,
  pages: z.array(prototypePageSchema).min(1).max(12),
  flows: z.array(prototypeFlowSchema).min(1),
  reviewDocument: prototypeReviewDocumentSchema,
  /** Agent-authored compact input used to derive corresponding suite alternatives. */
  planningSeed: prototypePlanningSeedSchema.optional(),
  humanLoop: prototypeHumanLoopSchema.default({
    mode: 'continue',
    rationale: 'The requirement is clear enough to proceed.',
  }),
})

export const generatedPrototypePlanSchema = prototypePlanSchema

export type PrototypeAction = z.infer<typeof prototypeActionSchema>
export type PrototypeInteraction = z.infer<typeof prototypeInteractionSchema>
export type PrototypeRegion = z.infer<typeof prototypeRegionSchema>
export type PrototypePage = z.infer<typeof prototypePageSchema>
export type PrototypeFlow = z.infer<typeof prototypeFlowSchema>
export type PrototypeHumanLoop = z.infer<typeof prototypeHumanLoopSchema>
export type PrototypeReviewDocument = z.infer<typeof prototypeReviewDocumentSchema>
export type PrototypePlanningMaterial = z.infer<typeof prototypePlanningMaterialSchema>
export type PrototypePlanningSeed = z.infer<typeof prototypePlanningSeedSchema>
export type PrototypeHumanLoopAsk = Extract<PrototypeHumanLoop, { mode: 'ask' }>
export type PrototypePlan = z.infer<typeof prototypePlanSchema>

export type HumanLoopChoice = PrototypeHumanLoopAsk['choices'][number]
export type ResolvedHumanLoopAnswer =
  | { readonly kind: 'choice', readonly choice: HumanLoopChoice, readonly note: string | null }
  | { readonly kind: 'custom', readonly text: string }

/**
 * The minimal shape both `PrototypeHumanLoopAsk` (planPrototype's structured
 * output, mutable arrays from z.infer) and a live `AgentRunProjection`
 * ask (readonly arrays, built from run events) satisfy — a plain mutable
 * array is assignable to a `readonly` one, not the reverse, so this is
 * intentionally `readonly` throughout to accept both without a cast.
 */
export interface HumanLoopAskLike {
  readonly question: string
  readonly choices: readonly HumanLoopChoice[]
  readonly defaultChoiceId: string
}

export interface PrototypePlanValidation {
  readonly reachablePageIds: readonly string[]
}

export function validatePrototypePlan(
  plan: PrototypePlan,
): Result<PrototypePlanValidation> {
  const pageIds = new Set<string>()
  const pageRoutes = new Set<string>()
  for (const page of plan.pages) {
    if (pageIds.has(page.id)) return err(`Duplicate page id: "${page.id}".`)
    pageIds.add(page.id)
    if (pageRoutes.has(page.route)) {
      return err(`Duplicate page route: "${page.route}".`)
    }
    pageRoutes.add(page.route)

    const regionIds = new Set<string>()
    for (const region of page.regions) {
      if (regionIds.has(region.id)) {
        return err(`Page "${page.id}" has duplicate region id: "${region.id}".`)
      }
      regionIds.add(region.id)
    }

    const overlayIds = new Set(page.overlays.map((overlay) => overlay.id))
    if (overlayIds.size !== page.overlays.length) {
      return err(`Page "${page.id}" has duplicate overlay ids.`)
    }

    const stateIds = new Set(page.states.map((state) => state.id))
    if (stateIds.size !== page.states.length) {
      return err(`Page "${page.id}" has duplicate state ids.`)
    }

    const interactionIds = new Set<string>()
    for (const interaction of page.interactions) {
      if (interactionIds.has(interaction.id)) {
        return err(
          `Page "${page.id}" has duplicate interaction id: "${interaction.id}".`,
        )
      }
      interactionIds.add(interaction.id)
      if (
        interaction.sourceSectionId &&
        !regionIds.has(interaction.sourceSectionId)
      ) {
        return err(
          `Interaction "${interaction.id}" references unknown section "${interaction.sourceSectionId}" on page "${page.id}".`,
        )
      }

      const action = interaction.action
      if (action.type === 'navigate' && !pageIds.has(action.targetPageId)) {
        // Page ids are collected incrementally; defer cross-page checks below.
        continue
      }
      if (action.type === 'open-overlay' && !overlayIds.has(action.targetOverlayId)) {
        return err(
          `Interaction "${interaction.id}" opens unknown overlay "${action.targetOverlayId}" on page "${page.id}".`,
        )
      }
      if (action.type === 'change-state' && !stateIds.has(action.targetStateId)) {
        return err(
          `Interaction "${interaction.id}" changes to unknown state "${action.targetStateId}" on page "${page.id}".`,
        )
      }
    }
  }

  for (const page of plan.pages) {
    for (const interaction of page.interactions) {
      const action = interaction.action
      if (action.type === 'navigate' && !pageIds.has(action.targetPageId)) {
        return err(
          `Interaction "${interaction.id}" navigates to unknown page "${action.targetPageId}".`,
        )
      }
    }
  }

  for (const flow of plan.flows) {
    if (!pageIds.has(flow.startPageId)) {
      return err(`Flow "${flow.id}" starts at unknown page "${flow.startPageId}".`)
    }
    for (const step of flow.steps) {
      const page = plan.pages.find((item) => item.id === step.fromPageId)
      if (!page) {
        return err(
          `Flow "${flow.id}" references unknown page "${step.fromPageId}".`,
        )
      }
      const interaction = page.interactions.find(
        (item) => item.id === step.interactionId,
      )
      if (!interaction) {
        return err(
          `Flow "${flow.id}" step references unknown interaction "${step.interactionId}" on page "${step.fromPageId}".`,
        )
      }
      if (step.toPageId && !pageIds.has(step.toPageId)) {
        return err(
          `Flow "${flow.id}" step points to unknown page "${step.toPageId}".`,
        )
      }
      if (
        interaction.action.type === 'navigate' &&
        step.toPageId &&
        interaction.action.targetPageId !== step.toPageId
      ) {
        return err(
          `Flow "${flow.id}" step "${step.interactionId}" target does not match the interaction target.`,
        )
      }
    }
  }

  const humanLoop = plan.humanLoop
  if (humanLoop.mode === 'ask') {
    const ids = new Set(humanLoop.choices.map((choice) => choice.id))
    if (ids.size !== humanLoop.choices.length) {
      return err('Human-in-the-loop choices have duplicate ids.')
    }
    if (!ids.has(humanLoop.defaultChoiceId)) {
      return err(
        `Human-in-the-loop default choice "${humanLoop.defaultChoiceId}" is missing.`,
      )
    }
  }

  const reachablePageIds = reachablePages(plan)
  if (reachablePageIds.size !== pageIds.size) {
    const missing = [...pageIds].filter((id) => !reachablePageIds.has(id))
    return err(`Prototype has unreachable pages: ${missing.join(', ')}.`)
  }

  return ok({ reachablePageIds: [...reachablePageIds] })
}

function reachablePages(plan: PrototypePlan): Set<string> {
  const byId = new Map(plan.pages.map((page) => [page.id, page]))
  const seen = new Set<string>()
  const queue = plan.flows.map((flow) => flow.startPageId)

  while (queue.length > 0) {
    const id = queue.shift() as string
    if (seen.has(id)) continue
    seen.add(id)
    const page = byId.get(id)
    if (!page) continue
    for (const interaction of page.interactions) {
      const action = interaction.action
      if (action.type === 'navigate' && !seen.has(action.targetPageId)) {
        queue.push(action.targetPageId)
      }
    }
  }

  return seen
}
