import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildAttributeIndex, buildCategoryIndex, catalogCandidates, evidenceBackedCatalogAttributes, normalizeProduct,
  planImageRoleSources,
} from '../competition/qianwen-commerce-agent/lib/data.js'
import {
  factLocalizationInventory, factLocalizationInventoryCoverage, localizeFact,
} from '../competition/qianwen-commerce-agent/lib/localization.js'

// Public-sample gold is benchmark-only and is never imported by the submitted Agent.
const PUBLIC_GOLD = Object.freeze({
  'product_3887087154767.json': ['29073', '39034'],
  'product_5681480836479.json': ['28951', '28952'],
  'product_5758364264251.json': ['29069', '39033', '53874'],
  'product_5977010166484.json': ['28965', '28972', '28976'],
  'product_6786311895552.json': ['39029'],
  'product_6837006744133.json': ['30408', '40221'],
  'product_8409262509816.json': ['39107'],
  'product_8688570444629.json': ['29553', '30843'],
  'product_8822221153828.json': ['39153'],
  'product_9451226053560.json': ['30470', '30471', '30474'],
  'product_9493156931235.json': ['30341', '30342', '30425'],
})
const MEASUREMENT = /(?:\d\s*(?:cm|厘米|斤|码)|\d\s*[-~至到]\s*\d\s*斤)/iu

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function parseArguments(argv) {
  const json = argv.includes('--json')
  const values = argv.filter((argument) => argument !== '--json')
  if (values.length !== 1) throw new Error('Usage: node scripts/qianwen-public-benchmark.mjs <Data_for_Users directory> [--json]')
  return { root: resolve(values[0]), json }
}
async function record(root, path) {
  const bytes = await readFile(join(root, path))
  return { path, bytes, sha256: sha256(bytes) }
}

export function publicBenchmarkPasses(summary) {
  const count = summary.productCount
  return Number.isSafeInteger(count) && count > 0
    && summary.category.top1 === count
    && summary.category.recallAt5 === count
    && summary.category.recallAt30 === count
    && summary.category.meanReciprocalRank === 1
    && summary.category.unbackedDespiteCatalogDefinitions === 0
    && summary.robustness.withoutSourceCategoryTop1 === count
    && summary.robustness.titleOnlyTop1 === count
    && summary.localization.productsWithLocalizedMeasurements === summary.localization.productsWithMeasurements
    && summary.localization.localizedMeasurementFacts === summary.localization.measurementFacts
    && summary.localization.incompleteInventoryProducts === 0
    && summary.localization.requestedModelTranslations === summary.localization.requiredModelTranslations
    && summary.visualGrounding.identityAnchorBoundProducts === count
    && summary.visualGrounding.bestAvailableSourceAssignments === summary.visualGrounding.detailRoles
    && summary.visualGrounding.nonAnchorSourceAssignments === summary.visualGrounding.detailRoles
    && summary.visualGrounding.productsWithCompleteNonAnchorSupport === count
    && summary.visualGrounding.productsWithAtLeastThreeDistinctSupportingSources === count
}

export async function benchmarkPublicSample(root) {
  const sourceRecords = []
  const categoryRecord = await record(root, 'clothing_categories.json')
  const attributeRecord = await record(root, 'clothing_attributes.json')
  sourceRecords.push(categoryRecord, attributeRecord)
  const categories = buildCategoryIndex(categoryRecord)
  const attributes = buildAttributeIndex(attributeRecord, categories)
  const productRoot = join(root, 'product_info')
  const files = (await readdir(productRoot)).filter((file) => file.endsWith('.json')).sort()
  const expectedFiles = Object.keys(PUBLIC_GOLD).sort()
  if (files.length !== expectedFiles.length || files.some((file, index) => file !== expectedFiles[index])) {
    throw new Error('Public product closure differs from the reviewed eleven-product benchmark.')
  }
  const products = []
  for (const file of files) {
    const productRecord = await record(root, join('product_info', file))
    sourceRecords.push(productRecord)
    const facts = normalizeProduct(productRecord)
    const candidates = catalogCandidates(facts, categories, 30)
    const acceptedIds = PUBLIC_GOLD[file]
    const rankOf = (candidateFacts) => catalogCandidates(candidateFacts, categories, 30)
      .findIndex(({ id }) => acceptedIds.includes(id)) + 1
    const rank = candidates.findIndex(({ id }) => acceptedIds.includes(id)) + 1
    const withoutSourceCategoryRank = rankOf({ ...facts, category: undefined })
    const titleOnlyRank = rankOf({ ...facts, category: undefined, attributes: [], skus: [] })
    const top = candidates[0]
    const backed = evidenceBackedCatalogAttributes(facts, attributes, top.id)
    const catalogAttributeDefinitions = attributes.definitions.filter(({ categoryId }) => categoryId === top.id).length
    const sourceFacts = [...facts.attributes, ...facts.skus.flatMap((sku) => sku.attributes)]
    const measurements = sourceFacts.filter(({ value }) => MEASUREMENT.test(value))
    const localizedMeasurements = measurements.filter(({ key, value }) => {
      const localized = localizeFact('en', key, value)
      return localized.changed && /(?:\blb\b|\bin\b|\bCN\b)/u.test(localized.value)
    })
    const localizationInventory = factLocalizationInventory(facts)
    const localizationClosure = factLocalizationInventoryCoverage(facts, localizationInventory)
    const roleSourcePlan = planImageRoleSources(facts)
    const detailRoleSources = roleSourcePlan.slice(1)
    const distinctSupportingSources = new Set(detailRoleSources
      .flatMap(({ supportingReference }) => supportingReference ? [supportingReference.url] : [])).size
    products.push({
      file, productId: facts.productId.value, acceptedIds, rank,
      counterfactualRanks: { withoutSourceCategory: withoutSourceCategoryRank, titleOnly: titleOnlyRank },
      top: {
        categoryId: top.id, path: top.path, score: top.score,
        catalogAttributeDefinitions, evidenceBackedAttributes: backed.length,
      },
      measurementFacts: measurements.length, localizedMeasurementFacts: localizedMeasurements.length,
      uniqueFactCount: localizationClosure.uniqueFactCount,
      requiredModelTranslations: localizationClosure.requiredModelTranslations,
      requestedModelTranslations: localizationClosure.requestedModelTranslations,
      inventoryClosureComplete: localizationClosure.inventoryClosureComplete,
      visualGrounding: {
        identityAnchorBound: facts.identityAnchor.role === 'product-image'
          && facts.imageReferences.some((reference) => reference.url === facts.identityAnchor.url
            && reference.pointer === facts.identityAnchor.pointer && reference.role === facts.identityAnchor.role),
        detailRoles: detailRoleSources.length,
        bestAvailableSourceAssignments: detailRoleSources.filter(({ supportMode }) =>
          ['primary-source', 'secondary-source', 'identity-anchor-fallback'].includes(supportMode)).length,
        nonAnchorSourceAssignments: detailRoleSources.filter(({ supportingReference }) => Boolean(supportingReference)).length,
        primarySourceAssignments: detailRoleSources.filter(({ supportMode }) => supportMode === 'primary-source').length,
        secondarySourceAssignments: detailRoleSources.filter(({ supportMode }) => supportMode === 'secondary-source').length,
        identityAnchorFallbacks: detailRoleSources.filter(({ supportMode }) => supportMode === 'identity-anchor-fallback').length,
        distinctSupportingSources,
      },
    })
  }
  const count = products.length
  const summary = {
    schema: 'cutout.qianwen-public-benchmark.v3',
    evidenceScope: 'offline-reviewed-public-sample-not-live-provider-hidden-set-leaderboard-or-SOTA',
    dataset: basename(root),
    sourceClosureSha256: sha256(sourceRecords.map(({ path, sha256: digest }) => `${path}\0${digest}`).join('\n')),
    productCount: count,
    category: {
      top1: products.filter(({ rank }) => rank === 1).length,
      recallAt5: products.filter(({ rank }) => rank > 0 && rank <= 5).length,
      recallAt30: products.filter(({ rank }) => rank > 0 && rank <= 30).length,
      meanReciprocalRank: Number((products.reduce((sum, { rank }) => sum + (rank ? 1 / rank : 0), 0) / count).toFixed(4)),
      zeroAttributeTopCandidate: products.filter(({ top }) => top.evidenceBackedAttributes === 0).length,
      unbackedDespiteCatalogDefinitions: products.filter(({ top }) =>
        top.catalogAttributeDefinitions > 0 && top.evidenceBackedAttributes === 0).length,
    },
    robustness: {
      withoutSourceCategoryTop1: products.filter(({ counterfactualRanks }) => counterfactualRanks.withoutSourceCategory === 1).length,
      titleOnlyTop1: products.filter(({ counterfactualRanks }) => counterfactualRanks.titleOnly === 1).length,
    },
    localization: {
      scope: 'request-closure-only-not-language-quality-or-SOTA',
      productsWithMeasurements: products.filter(({ measurementFacts }) => measurementFacts > 0).length,
      productsWithLocalizedMeasurements: products.filter(({ localizedMeasurementFacts }) => localizedMeasurementFacts > 0).length,
      measurementFacts: products.reduce((sum, product) => sum + product.measurementFacts, 0),
      localizedMeasurementFacts: products.reduce((sum, product) => sum + product.localizedMeasurementFacts, 0),
      uniqueFacts: products.reduce((sum, product) => sum + product.uniqueFactCount, 0),
      requiredModelTranslations: products.reduce((sum, product) => sum + product.requiredModelTranslations, 0),
      requestedModelTranslations: products.reduce((sum, product) => sum + product.requestedModelTranslations, 0),
      incompleteInventoryProducts: products.filter(({ inventoryClosureComplete }) => !inventoryClosureComplete).length,
    },
    visualGrounding: {
      identityAnchorBoundProducts: products.filter(({ visualGrounding }) => visualGrounding.identityAnchorBound).length,
      detailRoles: products.reduce((sum, product) => sum + product.visualGrounding.detailRoles, 0),
      bestAvailableSourceAssignments: products.reduce((sum, product) => sum + product.visualGrounding.bestAvailableSourceAssignments, 0),
      nonAnchorSourceAssignments: products.reduce((sum, product) => sum + product.visualGrounding.nonAnchorSourceAssignments, 0),
      primarySourceAssignments: products.reduce((sum, product) => sum + product.visualGrounding.primarySourceAssignments, 0),
      secondarySourceAssignments: products.reduce((sum, product) => sum + product.visualGrounding.secondarySourceAssignments, 0),
      identityAnchorFallbacks: products.reduce((sum, product) => sum + product.visualGrounding.identityAnchorFallbacks, 0),
      productsWithCompleteNonAnchorSupport: products.filter(({ visualGrounding }) =>
        visualGrounding.nonAnchorSourceAssignments === visualGrounding.detailRoles).length,
      productsWithAtLeastThreeDistinctSupportingSources: products.filter(({ visualGrounding }) =>
        visualGrounding.distinctSupportingSources >= 3).length,
    },
    products,
  }
  summary.passed = publicBenchmarkPasses(summary)
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { root, json } = parseArguments(process.argv.slice(2))
    const result = await benchmarkPublicSample(root)
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else {
      process.stdout.write(`Qianwen public benchmark: ${result.passed ? 'PASS' : 'FAIL'}\n`)
      process.stdout.write('Evidence scope: offline reviewed public sample only; not live Provider, hidden-set, leaderboard, or SOTA evidence.\n')
      process.stdout.write(`Category Top-1 ${result.category.top1}/${result.productCount}, Recall@5 ${result.category.recallAt5}/${result.productCount}, Recall@30 ${result.category.recallAt30}/${result.productCount}, MRR ${result.category.meanReciprocalRank}\n`)
      process.stdout.write(`Counterfactual Top-1 without source category ${result.robustness.withoutSourceCategoryTop1}/${result.productCount}, title only ${result.robustness.titleOnlyTop1}/${result.productCount}\n`)
      process.stdout.write(`Top candidates with zero backed attributes: ${result.category.zeroAttributeTopCandidate}/${result.productCount}; with catalog definitions but no evidence: ${result.category.unbackedDespiteCatalogDefinitions}\n`)
      process.stdout.write(`Measurement localization: ${result.localization.localizedMeasurementFacts}/${result.localization.measurementFacts} facts across ${result.localization.productsWithLocalizedMeasurements}/${result.localization.productsWithMeasurements} products\n`)
      process.stdout.write(`Fact-translation request closure (not language quality or SOTA): requested ${result.localization.requestedModelTranslations}/${result.localization.requiredModelTranslations} required facts; incomplete products ${result.localization.incompleteInventoryProducts}/${result.productCount}\n`)
      process.stdout.write(`Visual grounding: identity anchors ${result.visualGrounding.identityAnchorBoundProducts}/${result.productCount}; best-available source assignments ${result.visualGrounding.bestAvailableSourceAssignments}/${result.visualGrounding.detailRoles}; non-anchor support ${result.visualGrounding.nonAnchorSourceAssignments}/${result.visualGrounding.detailRoles}; >=3 distinct support sources ${result.visualGrounding.productsWithAtLeastThreeDistinctSupportingSources}/${result.productCount}\n`)
    }
    if (!result.passed) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
