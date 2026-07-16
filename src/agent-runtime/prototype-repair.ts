import type { MissingRequirement, OutcomeRuntimeState } from './outcome-runtime'

export interface PrototypeRepairPlan {
  readonly synthesizeDesignMarkdown: boolean
  readonly generateDesignSystem: boolean
  readonly generatePages: boolean
  readonly deconstructPages: boolean
  readonly targetRegionIds: readonly string[]
}

const EMPTY_REPAIR_PLAN: PrototypeRepairPlan = {
  synthesizeDesignMarkdown: false,
  generateDesignSystem: false,
  generatePages: false,
  deconstructPages: false,
  targetRegionIds: [],
}

/** Maps verified outcome gaps to the smallest executable prototype repair. */
export function planPrototypeRepair(
  outcome: OutcomeRuntimeState | null | undefined,
  hasDesignSystem: boolean,
  failedRegionIds: readonly string[] = [],
): PrototypeRepairPlan | null {
  if (!outcome || outcome.evaluation.status === 'satisfied') return null

  const missing = outcome.evaluation.missing
  const generateDesignSystem = isMissing(missing, 'design-system')
  const synthesizeDesignMarkdown =
    !generateDesignSystem && hasDesignSystem && isMissing(missing, 'design-markdown')
  const generatePages = isMissing(missing, 'prototype-page')
  const deconstructPages = isMissing(missing, 'cutout-slice')

  const plan = {
    ...EMPTY_REPAIR_PLAN,
    synthesizeDesignMarkdown,
    generateDesignSystem,
    generatePages,
    deconstructPages,
    targetRegionIds: deconstructPages ? [...failedRegionIds] : [],
  }
  return Object.entries(plan).some(([key, value]) =>
    key === 'targetRegionIds' ? false : Boolean(value),
  ) ? plan : null
}

export function repairPlanLabel(plan: PrototypeRepairPlan): string {
  const actions = [
    plan.generateDesignSystem || plan.synthesizeDesignMarkdown ? 'design system' : null,
    plan.generatePages ? 'prototype pages' : null,
    plan.deconstructPages ? 'reusable materials' : null,
  ].filter(Boolean)
  return `Continue missing ${actions.join(', ')}`
}

function isMissing(
  missing: readonly MissingRequirement[],
  kind: MissingRequirement['kind'],
): boolean {
  return missing.some((requirement) => requirement.kind === kind && requirement.count > 0)
}
