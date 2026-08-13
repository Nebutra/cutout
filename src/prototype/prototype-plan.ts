import { z } from 'zod'
import { candidateExplorationDecisionSchema } from '@/candidate-selection/contracts'
import type { Result } from '@/services/types'
import { err, ok } from '@/services/types'

const prototypeNavigateActionSchema = z.object({
  type: z.literal('navigate'),
  targetPageId: z.string().min(1),
})
const prototypeExternalActionSchema = z.object({
  type: z.literal('external'),
  destination: z.string().min(1),
})
const prototypeNoopActionSchema = z.object({
  type: z.literal('none'),
  reason: z.string().min(1),
})

export const prototypeActionSchema = z.discriminatedUnion('type', [
  prototypeNavigateActionSchema,
  z.object({
    type: z.literal('open-overlay'),
    targetOverlayId: z.string().min(1),
  }),
  z.object({
    type: z.literal('change-state'),
    targetStateId: z.string().min(1),
  }),
  prototypeExternalActionSchema,
  prototypeNoopActionSchema,
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
  assetOutput: z
    .enum(['transparent-subject', 'rectangular-media'])
    .optional(),
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
export type PrototypeHumanLoopAsk = Extract<PrototypeHumanLoop, { mode: 'ask' }>
export type PrototypePlan = z.infer<typeof prototypePlanSchema>

export interface PrototypeRouteGraphLike {
  readonly pages: readonly {
    readonly id: string
    readonly name: string
    readonly route: string
    readonly purpose: string
    readonly regions: readonly {
      readonly id: string
      readonly name: string
      readonly role: PrototypeRegion['role']
      readonly summary: string
    }[]
    readonly overlays?: readonly {
      readonly id: string
      readonly name: string
      readonly purpose: string
    }[]
    readonly states?: readonly {
      readonly id: string
      readonly name: string
      readonly purpose: string
    }[]
    readonly interactions: readonly PrototypeInteraction[]
  }[]
  readonly flows: readonly PrototypeFlow[]
}

const prototypeRouteGraphIdentityActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), targetPage: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('open-overlay'), targetOverlay: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('change-state'), targetState: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('external'), destination: z.string().min(1) }).strict(),
  z.object({ type: z.literal('none'), reason: z.string().min(1) }).strict(),
])

export const prototypeRouteGraphIdentitySchema = z.object({
  version: z.literal('prototype-route-graph.v1'),
  pages: z.array(z.object({
    name: z.string().min(1),
    route: z.string().min(1),
    purpose: z.string().min(1),
    regions: z.array(z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      summary: z.string().min(1),
    }).strict()).min(1),
    overlays: z.array(z.object({
      name: z.string().min(1),
      purpose: z.string().min(1),
    }).strict()),
    states: z.array(z.object({
      name: z.string().min(1),
      purpose: z.string().min(1),
    }).strict()),
    interactions: z.array(z.object({
      label: z.string().min(1),
      trigger: prototypeInteractionSchema.shape.trigger,
      sourceRegion: z.number().int().nonnegative().nullable(),
      sourceElement: z.string().min(1),
      intent: z.string().min(1),
      action: prototypeRouteGraphIdentityActionSchema,
    }).strict()),
  }).strict()).min(1).max(12),
  flows: z.array(z.object({
    name: z.string().min(1),
    goal: z.string().min(1),
    startPage: z.number().int().nonnegative(),
    steps: z.array(z.object({
      fromPage: z.number().int().nonnegative(),
      interaction: z.number().int().nonnegative(),
      toPage: z.number().int().nonnegative().nullable(),
    }).strict()),
  }).strict()).min(1),
}).strict()

export type PrototypeRouteGraphIdentity = z.infer<typeof prototypeRouteGraphIdentitySchema>
type PrototypeRouteGraphIdentityAction = z.infer<typeof prototypeRouteGraphIdentityActionSchema>

function normalizeGraphText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function compareCanonical(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function normalizedGraphAction(
  action: PrototypeInteraction['action'],
  pageIndexById: ReadonlyMap<string, number>,
  overlayIndexById: ReadonlyMap<string, number>,
  stateIndexById: ReadonlyMap<string, number>,
): PrototypeRouteGraphIdentityAction {
  switch (action.type) {
    case 'navigate':
      return {
        type: action.type,
        targetPage: pageIndexById.get(action.targetPageId) ?? -1,
      }
    case 'open-overlay':
      return {
        type: action.type,
        targetOverlay: overlayIndexById.get(action.targetOverlayId) ?? -1,
      }
    case 'change-state':
      return {
        type: action.type,
        targetState: stateIndexById.get(action.targetStateId) ?? -1,
      }
    case 'external':
      return { type: action.type, destination: normalizeGraphText(action.destination) }
    case 'none':
      return { type: action.type, reason: normalizeGraphText(action.reason) }
  }
}

/**
 * Canonical semantic graph projection. Internal ids never contribute to the
 * identity; references are rewritten to stable page/region/interaction
 * ordinals so an id-renamed copy remains the same graph.
 */
export function prototypeRouteGraphProjection(
  plan: PrototypeRouteGraphLike,
): PrototypeRouteGraphIdentity {
  const orderedPages = [...plan.pages].sort((left, right) =>
    left.route.localeCompare(right.route) || compareCanonical(left, right))
  const pageIndexById = new Map(orderedPages.map((page, index) => [page.id, index]))
  const interactionIndexByPageId = new Map<string, ReadonlyMap<string, number>>()

  const pages = orderedPages.map((page) => {
    const regionIndexById = new Map(page.regions.map((region, index) => [region.id, index]))
    const overlays = page.overlays ?? []
    const states = page.states ?? []
    const overlayIndexById = new Map(overlays.map((overlay, index) => [overlay.id, index]))
    const stateIndexById = new Map(states.map((state, index) => [state.id, index]))
    const interactionsWithIds = page.interactions.map((interaction) => ({
      id: interaction.id,
      value: {
        label: normalizeGraphText(interaction.label),
        trigger: interaction.trigger,
        sourceRegion: interaction.sourceSectionId === undefined
          ? null
          : (regionIndexById.get(interaction.sourceSectionId) ?? -1),
        sourceElement: normalizeGraphText(interaction.sourceElement),
        intent: normalizeGraphText(interaction.intent),
        action: normalizedGraphAction(
          interaction.action,
          pageIndexById,
          overlayIndexById,
          stateIndexById,
        ),
      },
    })).sort((left, right) => compareCanonical(left.value, right.value))
    interactionIndexByPageId.set(
      page.id,
      new Map(interactionsWithIds.map((interaction, index) => [interaction.id, index])),
    )
    return {
      name: normalizeGraphText(page.name),
      route: page.route.trim(),
      purpose: normalizeGraphText(page.purpose),
      regions: page.regions.map((region) => ({
        name: normalizeGraphText(region.name),
        role: normalizeGraphText(region.role),
        summary: normalizeGraphText(region.summary),
      })),
      overlays: overlays.map((overlay) => ({
        name: normalizeGraphText(overlay.name),
        purpose: normalizeGraphText(overlay.purpose),
      })),
      states: states.map((state) => ({
        name: normalizeGraphText(state.name),
        purpose: normalizeGraphText(state.purpose),
      })),
      interactions: interactionsWithIds.map(({ value }) => value),
    }
  })

  const flows = plan.flows.map((flow) => ({
    name: normalizeGraphText(flow.name),
    goal: normalizeGraphText(flow.goal),
    startPage: pageIndexById.get(flow.startPageId) ?? -1,
    steps: flow.steps.map((step) => ({
      fromPage: pageIndexById.get(step.fromPageId) ?? -1,
      interaction: interactionIndexByPageId.get(step.fromPageId)?.get(step.interactionId) ?? -1,
      toPage: step.toPageId === undefined ? null : (pageIndexById.get(step.toPageId) ?? -1),
    })),
  })).sort(compareCanonical)

  return {
    version: 'prototype-route-graph.v1',
    pages,
    flows,
  }
}

export function prototypeRouteGraphFingerprint(plan: PrototypeRouteGraphLike): string {
  const identity = prototypeRouteGraphProjection(plan)
  prototypeRouteGraphIdentitySchema.parse(identity)
  return JSON.stringify(identity)
}

export function parsePrototypeRouteGraphFingerprint(
  value: unknown,
): PrototypeRouteGraphIdentity | undefined {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512_000) return undefined
  try {
    const parsed = prototypeRouteGraphIdentitySchema.safeParse(JSON.parse(value))
    if (!parsed.success || JSON.stringify(parsed.data) !== value) return undefined
    const routes = new Set<string>()
    for (const page of parsed.data.pages) {
      if (routes.has(page.route)) return undefined
      routes.add(page.route)
      if (page.interactions.some((interaction) =>
        interaction.sourceRegion !== null
          && interaction.sourceRegion >= page.regions.length)) return undefined
      if (page.interactions.some((interaction) =>
        (interaction.action.type === 'navigate'
          && interaction.action.targetPage >= parsed.data.pages.length)
        || (interaction.action.type === 'open-overlay'
          && interaction.action.targetOverlay >= page.overlays.length)
        || (interaction.action.type === 'change-state'
          && interaction.action.targetState >= page.states.length))) return undefined
      if (page.interactions.some((interaction, index, interactions) =>
        index > 0 && compareCanonical(interactions[index - 1], interaction) > 0)) return undefined
    }
    if (parsed.data.pages.some((page, index, pages) =>
      index > 0 && pages[index - 1]!.route.localeCompare(page.route) > 0)) return undefined
    if (parsed.data.flows.some((flow, index, flows) =>
      flow.startPage >= parsed.data.pages.length
      || flow.steps.some((step) =>
        step.fromPage >= parsed.data.pages.length
        || step.interaction >= parsed.data.pages[step.fromPage]!.interactions.length
        || (step.toPage !== null && step.toPage >= parsed.data.pages.length))
      || (index > 0 && compareCanonical(flows[index - 1], flow) > 0))) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

export function isPrototypeRouteGraphFingerprint(value: unknown): value is string {
  return parsePrototypeRouteGraphFingerprint(value) !== undefined
}

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
