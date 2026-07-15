export type MaterialKind = 'design-system' | 'prototype-page' | 'cutout-slice'

export interface MaterialProvenance {
  readonly source: 'prototype-generation' | 'page-deconstruction'
  readonly sourcePageId?: string
  readonly independentlyEditable?: boolean
}

export interface MaterialRef {
  readonly id: string
  readonly kind: MaterialKind
  readonly label: string
  readonly version: string
  readonly provenance: MaterialProvenance
}

export interface MaterialInventory {
  readonly designSystemId: string | null
  readonly pageIds: readonly string[]
  readonly sliceIds: readonly string[]
}

export interface MaterialImpactPlan {
  readonly target: MaterialRef | null
  readonly effectiveTarget: MaterialRef | null
  readonly scope: 'project' | 'design' | 'page' | 'slice'
  readonly redo: readonly string[]
  readonly preserve: readonly string[]
  readonly paidActionRequired: boolean
  readonly degradation: string | null
  readonly blockedReason: string | null
}

export function buildMaterialImpactPlan(
  target: MaterialRef | null,
  inventory: MaterialInventory,
): MaterialImpactPlan {
  if (!target) {
    return {
      target: null,
      effectiveTarget: null,
      scope: 'project',
      redo: [
        ...(inventory.designSystemId ? [`design:${inventory.designSystemId}`] : []),
        ...inventory.pageIds.map((id) => `page:${id}`),
        'all-slices',
      ],
      preserve: [],
      paidActionRequired: true,
      degradation: null,
      blockedReason: null,
    }
  }

  if (target.kind === 'design-system') {
    return {
      target,
      effectiveTarget: target,
      scope: 'design',
      redo: [`design:${target.id}`],
      preserve: [
        ...inventory.pageIds.map((id) => `page:${id}`),
        ...inventory.sliceIds.map((id) => `slice:${id}`),
      ],
      paidActionRequired: true,
      degradation: null,
      blockedReason: null,
    }
  }

  if (target.kind === 'prototype-page') {
    return pageImpact(target, inventory)
  }

  if (target.provenance.independentlyEditable) {
    return {
      target,
      effectiveTarget: target,
      scope: 'slice',
      redo: [`slice:${target.id}`],
      preserve: [
        ...(inventory.designSystemId ? [`design:${inventory.designSystemId}`] : []),
        ...inventory.pageIds.map((id) => `page:${id}`),
        ...inventory.sliceIds.filter((id) => id !== target.id).map((id) => `slice:${id}`),
      ],
      paidActionRequired: true,
      degradation: null,
      blockedReason: null,
    }
  }

  const sourcePageId = target.provenance.sourcePageId
  if (!sourcePageId || !inventory.pageIds.includes(sourcePageId)) {
    return {
      target,
      effectiveTarget: target,
      scope: 'slice',
      redo: [],
      preserve: [],
      paidActionRequired: false,
      degradation: null,
      blockedReason: 'This slice cannot be edited independently and its source page is unavailable.',
    }
  }

  const sourcePage: MaterialRef = {
    id: sourcePageId,
    kind: 'prototype-page',
    label: `Source page for ${target.label}`,
    version: target.version,
    provenance: { source: 'prototype-generation' },
  }
  return {
    ...pageImpact(sourcePage, inventory),
    target,
    degradation: 'This slice cannot be edited independently. The Agent will rebuild its source page and derived slices.',
  }
}

function pageImpact(
  target: MaterialRef,
  inventory: MaterialInventory,
): MaterialImpactPlan {
  return {
    target,
    effectiveTarget: target,
    scope: 'page',
    redo: [`page:${target.id}`, 'all-slices'],
    preserve: [
      ...(inventory.designSystemId ? [`design:${inventory.designSystemId}`] : []),
      ...inventory.pageIds.filter((id) => id !== target.id).map((id) => `page:${id}`),
    ],
    paidActionRequired: true,
    degradation: null,
    blockedReason: null,
  }
}

export function reconcileMaterialSelection(
  selected: MaterialRef | null,
  available: readonly MaterialRef[],
): MaterialRef | null {
  if (!selected) return null
  const current = available.find((candidate) =>
    candidate.id === selected.id && candidate.kind === selected.kind,
  )
  return current?.version === selected.version ? current : null
}

/** Must run immediately before route locking or any paid provider call. */
export function assertImpactPlanCurrent(
  plan: MaterialImpactPlan,
  currentTarget: MaterialRef | null,
): void {
  if (plan.blockedReason) throw new Error(plan.blockedReason)
  if (!plan.paidActionRequired) throw new Error('The requested change has no executable paid action.')
  if (!plan.target) return
  if (
    !currentTarget ||
    currentTarget.id !== plan.target.id ||
    currentTarget.kind !== plan.target.kind ||
    currentTarget.version !== plan.target.version
  ) {
    throw new Error('The selected material changed. Review the updated impact before running paid actions.')
  }
}
