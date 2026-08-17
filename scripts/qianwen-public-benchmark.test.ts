import { describe, expect, it } from 'vitest'
import { publicBenchmarkPasses } from './qianwen-public-benchmark.mjs'

function perfectSummary() {
  return {
    productCount: 11,
    category: {
      top1: 11,
      recallAt5: 11,
      recallAt30: 11,
      meanReciprocalRank: 1,
      unbackedDespiteCatalogDefinitions: 0,
    },
    robustness: { withoutSourceCategoryTop1: 11, titleOnlyTop1: 11 },
    localization: {
      productsWithLocalizedMeasurements: 8,
      productsWithMeasurements: 8,
      localizedMeasurementFacts: 176,
      measurementFacts: 176,
      incompleteInventoryProducts: 0,
      requestedModelTranslations: 42,
      requiredModelTranslations: 42,
    },
    visualGrounding: {
      identityAnchorBoundProducts: 11,
      bestAvailableSourceAssignments: 55,
      detailRoles: 55,
      nonAnchorSourceAssignments: 55,
      productsWithCompleteNonAnchorSupport: 11,
      productsWithAtLeastThreeDistinctSupportingSources: 11,
    },
  }
}

describe('Qianwen public benchmark baseline gate', () => {
  it('locks PASS to the complete current category baseline', () => {
    expect(publicBenchmarkPasses(perfectSummary())).toBe(true)
    for (const [field, value] of [
      ['top1', 10],
      ['recallAt5', 10],
      ['recallAt30', 10],
      ['meanReciprocalRank', 0.9999],
    ] as const) {
      const summary = perfectSummary()
      summary.category[field] = value
      expect(publicBenchmarkPasses(summary)).toBe(false)
    }
  })
})
