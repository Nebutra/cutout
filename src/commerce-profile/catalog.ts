import { z } from 'zod'

type JsonObject = Record<string, unknown>

const catalogCategorySchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(500),
  parentId: z.string().min(1).max(240).optional(),
  leaf: z.boolean(),
}).strict()
export type CatalogCategory = z.infer<typeof catalogCategorySchema>

export const categoryIndexSchema = z.object({
  schema: z.literal('commerce.category-index.v1'),
  categories: z.array(catalogCategorySchema).max(100_000),
  leafIds: z.array(z.string().min(1).max(240)).max(100_000),
}).strict()
export type CategoryIndex = z.infer<typeof categoryIndexSchema>

const attributeDefinitionSchema = z.object({
  categoryId: z.string().min(1).max(240),
  key: z.string().min(1).max(240),
  values: z.array(z.string().min(1).max(500)).min(1).max(10_000),
}).strict()
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>

export const attributeIndexSchema = z.object({
  schema: z.literal('commerce.attribute-index.v1'),
  definitions: z.array(attributeDefinitionSchema).max(100_000),
}).strict()
export type AttributeIndex = z.infer<typeof attributeIndexSchema>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function first(object: JsonObject, keys: readonly string[]): unknown {
  return keys.find((key) => Object.hasOwn(object, key))
    ? object[keys.find((key) => Object.hasOwn(object, key))!]
    : undefined
}

function parseJson(contents: string, label: string): unknown {
  try {
    return JSON.parse(contents)
  } catch (error) {
    throw new Error(`Malformed ${label} JSON: ${error instanceof Error ? error.message : 'parse failed'}`)
  }
}

function rootArray(raw: unknown, keys: readonly string[], label: string): readonly unknown[] {
  if (Array.isArray(raw)) return raw
  if (isObject(raw)) {
    for (const key of keys) if (Array.isArray(raw[key])) return raw[key]
  }
  throw new Error(`${label} must be an array or contain an allowlisted array field.`)
}

function attributeRoots(raw: unknown): readonly unknown[] {
  if (Array.isArray(raw)) return raw
  if (!isObject(raw)) throw new Error('Attribute catalog must be an object or array.')
  for (const key of ['attributes', 'attributeList', 'attribute_list', 'data', 'result', 'definitions']) {
    if (Array.isArray(raw[key])) return raw[key]
  }
  return Object.entries(raw).map(([categoryId, definitions]) => ({
    categoryId,
    attributes: definitions,
  }))
}

export function buildCategoryIndex(contents: string): CategoryIndex {
  const raw = parseJson(contents, 'category catalog')
  const roots = rootArray(raw, ['categories', 'categoryList', 'category_list', 'data', 'result', 'nodes'], 'Category catalog')
  const categories: CatalogCategory[] = []
  const explicitLeaf = new Map<string, boolean | undefined>()
  const walk = (entries: readonly unknown[], inheritedParentId?: string): void => {
    for (const entry of entries) {
      if (!isObject(entry)) throw new Error('Category entries must be objects.')
      const id = stringValue(first(entry, ['id', 'categoryId', 'category_id', 'value']))
      const name = stringValue(first(entry, ['name', 'categoryName', 'category_name', 'label']))
      if (!id || !name) throw new Error('Category entries require exact id and name values.')
      const parentId = stringValue(first(entry, ['parentId', 'parent_id', 'parentCategoryId', 'parent_category_id']))
        ?? inheritedParentId
      const childrenValue = first(entry, [
        'children', 'subcategories', 'childCategories', 'child_categories',
        'childrenCategoryList', 'children_category_list',
      ])
      const children = Array.isArray(childrenValue) ? childrenValue : []
      const declaredLeaf = first(entry, ['leaf', 'isLeaf', 'is_leaf'])
      if (declaredLeaf !== undefined && typeof declaredLeaf !== 'boolean') {
        throw new Error(`Category ${id} has a malformed leaf flag.`)
      }
      categories.push({ id, name, ...(parentId ? { parentId } : {}), leaf: false })
      explicitLeaf.set(id, declaredLeaf as boolean | undefined)
      walk(children, id)
    }
  }
  walk(roots)
  const ids = categories.map((category) => category.id)
  if (new Set(ids).size !== ids.length) throw new Error('Category ids must be unique.')
  const known = new Set(ids)
  if (categories.some((category) => category.parentId && !known.has(category.parentId))) {
    throw new Error('Category parent references must resolve.')
  }
  const childCount = new Map<string, number>()
  for (const category of categories) {
    if (category.parentId) childCount.set(category.parentId, (childCount.get(category.parentId) ?? 0) + 1)
    const seen = new Set<string>()
    let cursor: CatalogCategory | undefined = category
    while (cursor?.parentId) {
      if (seen.has(cursor.parentId)) throw new Error(`Category hierarchy contains a cycle at ${category.id}.`)
      seen.add(cursor.parentId)
      cursor = categories.find((candidate) => candidate.id === cursor!.parentId)
    }
  }
  const normalized = categories.map((category) => {
    const derivedLeaf = !childCount.has(category.id)
    const declared = explicitLeaf.get(category.id)
    if (declared !== undefined && declared !== derivedLeaf) {
      throw new Error(`Category ${category.id} leaf flag conflicts with its hierarchy.`)
    }
    return { ...category, leaf: derivedLeaf }
  }).sort((left, right) => left.id.localeCompare(right.id))
  return categoryIndexSchema.parse({
    schema: 'commerce.category-index.v1',
    categories: normalized,
    leafIds: normalized.filter((category) => category.leaf).map((category) => category.id),
  })
}

function normalizedValues(value: unknown, definitionKey: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Attribute ${definitionKey} requires an enum value array.`)
  return value.map((entry) => {
    const result = stringValue(entry)
      ?? (isObject(entry) ? stringValue(first(entry, ['value', 'id', 'name', 'label'])) : undefined)
    if (!result) throw new Error(`Attribute ${definitionKey} contains a malformed enum value.`)
    return result
  })
}

export function buildAttributeIndex(contents: string, categoryIndex: CategoryIndex): AttributeIndex {
  const parsedCategories = categoryIndexSchema.parse(categoryIndex)
  const raw = parseJson(contents, 'attribute catalog')
  const roots = attributeRoots(raw)
  const definitions: AttributeDefinition[] = []
  const addDefinition = (entry: JsonObject, inheritedCategoryId?: string) => {
    const categoryId = stringValue(first(entry, ['categoryId', 'category_id', 'leafCategoryId', 'leaf_category_id']))
      ?? inheritedCategoryId
    const key = stringValue(first(entry, ['key', 'id', 'attributeId', 'attribute_id', 'name', 'attributeName']))
    const values = first(entry, [
      'values', 'attributeValues', 'attribute_values', 'enumValues', 'enum_values',
      'options', 'valueList', 'value_list',
    ])
    if (!categoryId || !key) throw new Error('Attribute definitions require categoryId and key.')
    definitions.push({ categoryId, key, values: [...normalizedValues(values, key)] })
  }
  for (const entry of roots) {
    if (!isObject(entry)) throw new Error('Attribute catalog entries must be objects.')
    const nested = first(entry, ['attributes', 'attributeList', 'attribute_list', 'definitions'])
    if (Array.isArray(nested)) {
      const categoryId = stringValue(first(entry, ['categoryId', 'category_id', 'leafCategoryId', 'leaf_category_id', 'id']))
      if (!categoryId) throw new Error('Grouped attribute definitions require a category id.')
      for (const child of nested) {
        if (!isObject(child)) throw new Error('Attribute definitions must be objects.')
        addDefinition(child, categoryId)
      }
    } else {
      addDefinition(entry)
    }
  }
  const knownCategories = new Set(parsedCategories.categories.map((category) => category.id))
  const leafCategories = new Set(parsedCategories.leafIds)
  for (const definition of definitions) {
    if (!knownCategories.has(definition.categoryId)) {
      throw new Error(`Attribute references unknown category ${definition.categoryId}.`)
    }
    if (!leafCategories.has(definition.categoryId)) {
      throw new Error(`Attributes may only bind leaf category ${definition.categoryId}.`)
    }
    if (new Set(definition.values).size !== definition.values.length) {
      throw new Error(`Attribute ${definition.key} contains duplicate enum values.`)
    }
  }
  const keys = definitions.map((definition) => `${definition.categoryId}\0${definition.key}`)
  if (new Set(keys).size !== keys.length) throw new Error('Attribute keys must be unique within a category.')
  return attributeIndexSchema.parse({
    schema: 'commerce.attribute-index.v1',
    definitions: definitions.sort((left, right) => left.categoryId.localeCompare(right.categoryId)
      || left.key.localeCompare(right.key)),
  })
}

export function validateCatalogSelection(input: {
  readonly categoryId: string
  readonly attributes: Readonly<Record<string, string>>
  readonly categoryIndex: CategoryIndex
  readonly attributeIndex: AttributeIndex
}): void {
  const categories = categoryIndexSchema.parse(input.categoryIndex)
  const attributes = attributeIndexSchema.parse(input.attributeIndex)
  if (!categories.leafIds.includes(input.categoryId)) {
    throw new Error(`Category is not an exact catalog leaf: ${input.categoryId}`)
  }
  const permitted = new Map(attributes.definitions
    .filter((definition) => definition.categoryId === input.categoryId)
    .map((definition) => [definition.key, new Set(definition.values)]))
  for (const [key, value] of Object.entries(input.attributes)) {
    const values = permitted.get(key)
    if (!values) throw new Error(`Attribute key is not permitted for ${input.categoryId}: ${key}`)
    if (!values.has(value)) throw new Error(`Attribute value is not permitted for ${input.categoryId}/${key}: ${value}`)
  }
}
