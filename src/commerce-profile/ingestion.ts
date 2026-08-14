import { buildAttributeIndex, buildCategoryIndex, type AttributeIndex, type CategoryIndex } from './catalog'
import {
  inventoryCommerceInputs,
  type CommerceInputFile,
  type InventoryLimits,
} from './inventory'
import { normalizeProductRecord } from './normalizer'
import type { ProductFacts } from './contracts'

export interface CommerceIngestion {
  readonly products: readonly ProductFacts[]
  readonly categoryIndex: CategoryIndex
  readonly attributeIndex: AttributeIndex
}

export function ingestCommerceInputs(
  files: readonly CommerceInputFile[],
  limits?: InventoryLimits,
): CommerceIngestion {
  const inventory = inventoryCommerceInputs(files, limits)
  const categoryFile = inventory.find((file) => file.role === 'category-catalog')!
  const attributeFile = inventory.find((file) => file.role === 'attribute-catalog')!
  const categoryIndex = buildCategoryIndex(categoryFile.contents)
  return {
    products: inventory
      .filter((file) => file.role === 'product-record')
      .map((file) => normalizeProductRecord({ file: file.path, contents: file.contents })),
    categoryIndex,
    attributeIndex: buildAttributeIndex(attributeFile.contents, categoryIndex),
  }
}
