import type { PrototypePlan } from './prototype-plan'

export interface PrototypeImageRequestBudget {
  readonly designSystemCalls: number
  readonly pageCalls: number
  readonly boardCalls: number
  readonly directAssetCalls: number
  readonly totalCalls: number
}

/**
 * Compiles the resolved Agent-authored business topology into the baseline
 * paid-image DAG. This function owns no product defaults for page or asset
 * counts and never interprets a number from the user's prose.
 */
export function compilePrototypeImageRequestBudget(input: {
  readonly designSystemCalls: number
  readonly suites: readonly Pick<PrototypePlan, 'pages'>[]
}): PrototypeImageRequestBudget {
  if (!Number.isSafeInteger(input.designSystemCalls) || input.designSystemCalls < 0) {
    throw new Error('Design System image-call count must be a non-negative safe integer.')
  }

  let pageCalls = 0
  let boardCalls = 0
  let directAssetCalls = 0
  for (const suite of input.suites) {
    pageCalls += suite.pages.length
    for (const page of suite.pages) {
      for (const region of page.regions) {
        if (region.assetRoute === 'board-cutout') {
          boardCalls += 1
        } else if (region.assetRoute === 'direct-generate') {
          directAssetCalls += Math.max(1, region.assetOpportunities.length)
        }
      }
    }
  }

  return {
    designSystemCalls: input.designSystemCalls,
    pageCalls,
    boardCalls,
    directAssetCalls,
    totalCalls: input.designSystemCalls + pageCalls + boardCalls + directAssetCalls,
  }
}
