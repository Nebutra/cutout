import { pagesForScope, type PrototypeSuiteScope } from '@/prototype/generate-suite'
import type { PrototypePlan } from '@/prototype/prototype-plan'
import { createPrototypeAssetManifest } from '@/prototype/asset-manifest'
import {
  applyOutcomeEvent,
  createOutcomeRuntime,
  type MaterialEvidence,
  type OutcomeContract,
  type OutcomeRuntimeState,
} from './outcome-runtime'

export interface PrototypeOutcomeInput {
  readonly plan: PrototypePlan | null
  readonly scope: PrototypeSuiteScope
  readonly hasDesignSystem: boolean
  readonly hasDesignMarkdown: boolean
  readonly designSystemRevision?: string
  readonly pages: readonly {
    readonly page: { readonly id: string; readonly name: string }
    readonly revision?: string
  }[]
  /** Consumable production materials, already filtered by the production policy. */
  readonly assets: readonly {
    readonly id: string
    readonly manifestItemId: string
    readonly label?: string
    readonly revision?: string
  }[]
}

/** Projects durable workspace artifacts into the user's definition of done. */
export function projectPrototypeOutcome(
  input: PrototypeOutcomeInput,
): OutcomeRuntimeState | null {
  if (!input.plan) return null

  const contract = prototypeOutcomeContract(input.plan, input.scope)
  const scopedPages = pagesForScope(input.plan, input.scope)
  const scopedPageIds = new Set(scopedPages.map((page) => page.id))
  const expectedAssets = createPrototypeAssetManifest(input.plan, scopedPages).assets
  const expectedAssetIds = new Set(expectedAssets.map((asset) => asset.id))
  const runId = `workspace:${contract.id}`
  let state = createOutcomeRuntime(contract, runId)

  const materials: MaterialEvidence[] = []
  if (input.hasDesignSystem) {
    materials.push({
      id: 'design-system',
      kind: 'design-system',
      label: 'Shared design system',
      source: 'agent',
      revision: input.designSystemRevision,
    })
  }
  if (input.hasDesignMarkdown) {
    materials.push({
      id: 'design-markdown',
      kind: 'design-markdown',
      label: 'Portable DESIGN.md',
      source: 'agent',
    })
  }
  for (const artifact of input.pages) {
    materials.push({
      id: `page:${artifact.page.id}`,
      kind: 'prototype-page',
      label: artifact.page.name,
      source: 'agent',
      evidenceKey: scopedPageIds.has(artifact.page.id)
        ? `page:${artifact.page.id}`
        : undefined,
      revision: artifact.revision,
    })
  }
  for (const asset of input.assets) {
    materials.push({
      id: `asset:${asset.id}`,
      kind: 'cutout-slice',
      label: asset.label ?? asset.manifestItemId,
      source: 'algorithm',
      evidenceKey: expectedAssetIds.has(asset.manifestItemId)
        ? `asset:${asset.manifestItemId}`
        : undefined,
      revision: asset.revision,
    })
  }

  materials.forEach((material, index) => {
    state = applyOutcomeEvent(state, {
      id: `evidence:${material.id}`,
      type: 'material-recorded',
      runId,
      at: index,
      material,
    })
  })
  return state
}

export function prototypeOutcomeContract(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
): OutcomeContract {
  const pages = pagesForScope(plan, scope)
  const expectedAssets = createPrototypeAssetManifest(plan, pages).assets
  const pageIds = pages.map((page) => page.id).join(',')

  return {
    id: `${plan.product.name}:${scope}:${pageIds}`,
    intent: plan.product.primaryGoal,
    requirements: [
      { kind: 'design-system', minCount: 1, label: 'Shared design system' },
      { kind: 'design-markdown', minCount: 1, label: 'Portable DESIGN.md' },
      {
        kind: 'prototype-page',
        minCount: pages.length,
        label: 'Planned prototype pages',
        expectedKeys: pages.map((page) => `page:${page.id}`),
      },
      ...(expectedAssets.length > 0
        ? [{
            kind: 'cutout-slice' as const,
            minCount: expectedAssets.length,
            label: 'Reusable materials',
            expectedKeys: expectedAssets.map((asset) => `asset:${asset.id}`),
          }]
        : []),
    ],
  }
}
