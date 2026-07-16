import type { BrandViGenerationPlan, BrandViPlanNode } from './vi-catalog'

export type BrandViItemStatus = 'planned' | 'approved' | 'succeeded' | 'failed'

export interface BrandViItemReceipt {
  readonly itemId: string
  readonly approvalId: string
  readonly artifactIds: readonly string[]
  readonly completedAt: string
  readonly status: 'succeeded' | 'failed'
  readonly error?: string
}

export interface BrandViItemRun {
  readonly itemId: string
  readonly status: BrandViItemStatus
  readonly approvalId?: string
  readonly receipt?: BrandViItemReceipt
}

export interface BrandViRun {
  readonly version: 'brand-vi-run.v1'
  readonly plan: BrandViGenerationPlan
  readonly items: readonly BrandViItemRun[]
}

export function createBrandViRun(plan: BrandViGenerationPlan): BrandViRun {
  return {
    version: 'brand-vi-run.v1',
    plan,
    items: plan.nodes.map((node) => ({ itemId: node.itemId, status: 'planned' })),
  }
}

export function approveBrandViItem(
  run: BrandViRun,
  itemId: string,
  approvalId: string,
): BrandViRun {
  if (!approvalId.trim()) throw new Error('An opaque approval id is required.')
  const node = findNode(run, itemId)
  assertDependenciesSucceeded(run, node)
  return replaceItem(run, itemId, (item) => ({ ...item, status: 'approved', approvalId }))
}

export function recordBrandViItemReceipt(
  run: BrandViRun,
  receipt: BrandViItemReceipt,
): BrandViRun {
  const node = findNode(run, receipt.itemId)
  const item = findItem(run, receipt.itemId)
  assertDependenciesSucceeded(run, node)
  if (node.approval.required && (!item.approvalId || item.approvalId !== receipt.approvalId)) {
    throw new Error(`${receipt.itemId} receipt is not bound to its approved action.`)
  }
  if (receipt.status === 'succeeded' && receipt.artifactIds.length === 0) {
    throw new Error(`${receipt.itemId} succeeded without an artifact receipt.`)
  }
  return replaceItem(run, receipt.itemId, (current) => ({
    ...current,
    status: receipt.status,
    receipt,
  }))
}

export function executableBrandViItems(run: BrandViRun): readonly BrandViPlanNode[] {
  return run.plan.nodes.filter((node) => {
    const item = findItem(run, node.itemId)
    return item.status === 'approved' && dependenciesSucceeded(run, node)
  })
}

function assertDependenciesSucceeded(run: BrandViRun, node: BrandViPlanNode): void {
  const missing = node.dependencies.filter(
    (dependencyId) => findItem(run, dependencyId).status !== 'succeeded',
  )
  if (missing.length) {
    throw new Error(`${node.itemId} is blocked by unfinished dependencies: ${missing.join(', ')}.`)
  }
}

function dependenciesSucceeded(run: BrandViRun, node: BrandViPlanNode): boolean {
  return node.dependencies.every((dependencyId) => findItem(run, dependencyId).status === 'succeeded')
}

function findNode(run: BrandViRun, itemId: string): BrandViPlanNode {
  const node = run.plan.nodes.find((candidate) => candidate.itemId === itemId)
  if (!node) throw new Error(`Unknown Brand VI plan item "${itemId}".`)
  return node
}

function findItem(run: BrandViRun, itemId: string): BrandViItemRun {
  const item = run.items.find((candidate) => candidate.itemId === itemId)
  if (!item) throw new Error(`Unknown Brand VI run item "${itemId}".`)
  return item
}

function replaceItem(
  run: BrandViRun,
  itemId: string,
  update: (item: BrandViItemRun) => BrandViItemRun,
): BrandViRun {
  return { ...run, items: run.items.map((item) => item.itemId === itemId ? update(item) : item) }
}
