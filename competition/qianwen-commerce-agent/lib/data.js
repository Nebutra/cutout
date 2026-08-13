import { AgentError, invariant, sha256, stableJson } from './contracts.js'

const PRODUCT_MARKERS = new Set([
  'productId', 'product_id', 'itemId', 'item_id', 'offerId', 'offer_id', 'subject', 'title', 'productTitle',
  'description', 'descriptionHtml', 'description_html', 'skus', 'skuList', 'sku_list',
])
const FIELDS = Object.freeze({
  productId: ['productId', 'product_id', 'itemId', 'item_id', 'offerId', 'offer_id', 'num_iid', 'id'],
  platform: ['sourcePlatform', 'source_platform', 'sourceType', 'source_type', 'platform', 'platformName', 'platform_name', 'site'],
  url: ['productUrl', 'product_url', 'detailUrl', 'detail_url', 'itemUrl', 'item_url', 'url'],
  title: ['title', 'subject', 'productTitle', 'product_title', 'itemName', 'item_name'],
  description: ['description', 'descriptionHtml', 'description_html', 'desc', 'descHtml', 'desc_html'],
  category: ['leafCategoryId', 'leaf_category_id', 'categoryId', 'category_id', 'category', 'categoryName', 'category_name'],
  attributes: ['productAttributes', 'product_attributes', 'productAttribute', 'product_attribute', 'skuAttributes', 'sku_attributes', 'attributes', 'props', 'productProps', 'product_props', 'productPropList', 'product_prop_list'],
  skus: ['skus', 'skuList', 'sku_list', 'skuRecords', 'sku_records', 'skuInfos', 'sku_infos', 'productSkuInfos', 'product_sku_infos'],
  images: ['images', 'itemImages', 'item_images', 'itemImgs', 'item_imgs', 'imageUrls', 'image_urls', 'imageUrlList', 'image_url_list', 'imageUrl', 'image_url', 'mainImage', 'main_image', 'productImage', 'product_image'],
  videos: ['videos', 'itemVideos', 'item_videos', 'videoUrls', 'video_urls', 'videoUrlList', 'video_url_list', 'videoUrl', 'video_url'],
})
const ATTRIBUTE_KEYS = ['key', 'name', 'attributeName', 'attribute_name', 'attrName', 'attr_name', 'propertyName', 'property_name', 'propName', 'prop_name']
const ATTRIBUTE_VALUES = ['value', 'attributeValue', 'attribute_value', 'attrValue', 'attr_value', 'propertyValue', 'property_value', 'propValue', 'prop_value']
const SKU_IDS = ['skuId', 'sku_id', 'id', 'specId', 'spec_id']

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function first(value, keys) {
  if (!object(value)) return undefined
  const key = keys.find((candidate) => Object.hasOwn(value, candidate) && value[candidate] !== null && value[candidate] !== undefined)
  return key ? { key, value: value[key] } : undefined
}
function text(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}
function pointer(base, segment) { return `${base}/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}` }
function normalized(value) { return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') }
function safeUrl(value) {
  const descriptor = text(value) ?? (object(value)
    ? text(first(value, ['url', 'src', 'imageUrl', 'image_url', 'skuImageUrl', 'sku_image_url', 'videoUrl', 'video_url'])?.value)
    : undefined)
  if (!descriptor) return undefined
  let parsed
  try { parsed = new URL(descriptor) } catch { return undefined }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return undefined
  return parsed.href
}

export function extractVisibleHtml(value) {
  const mediaUrls = []
  const withoutActive = value
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ')
  withoutActive.replace(/<(?:img|video|source)\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi, (_, a, b, c) => {
    const url = safeUrl(a ?? b ?? c)
    if (url) mediaUrls.push(url)
    return ''
  })
  const visibleText = withoutActive
    .replace(/<br\s*\/?>|<\/(?:div|li|p|section|td|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim()
  return { visibleText: visibleText.slice(0, 20_000), mediaUrls: [...new Set(mediaUrls)].slice(0, 20) }
}

function unwrapProduct(raw) {
  invariant(object(raw), 'invalid-product', 'Product JSON must contain an object.')
  const nested = object(raw.ret) && object(raw.ret.result) && object(raw.ret.result.result) ? raw.ret.result.result : undefined
  if (nested) return { value: nested, base: '/ret/result/result', shape: 'nested-ret-result-result' }
  invariant([...PRODUCT_MARKERS].some((key) => Object.hasOwn(raw, key)), 'invalid-product', 'Unsupported product JSON shape.')
  return { value: raw, base: '', shape: 'direct-product' }
}

function field(unwrapped, aliases, requiredLabel) {
  const selection = first(unwrapped.value, aliases)
  const result = selection ? text(selection.value) : undefined
  if (requiredLabel) invariant(result, 'missing-product-fact', `Product ${requiredLabel} is required.`)
  return result ? { value: result, pointer: pointer(unwrapped.base, selection.key) } : undefined
}

function entries(selection, base) {
  if (!selection) return []
  if (object(selection.value)) {
    const nested = first(selection.value, ['images', 'imageList', 'image_list', 'urls', 'urlList', 'url_list'])
    if (Array.isArray(nested?.value)) {
      const nestedBase = pointer(base, nested.key)
      return nested.value.map((value, index) => ({ value, pointer: pointer(nestedBase, index) }))
    }
  }
  return (Array.isArray(selection.value) ? selection.value : [selection.value])
    .map((value, index) => ({ value, pointer: Array.isArray(selection.value) ? pointer(base, index) : base }))
}

function collectAttributes(value, base) {
  if (!value) return []
  if (object(value) && !ATTRIBUTE_KEYS.some((key) => Object.hasOwn(value, key))) {
    return Object.entries(value).flatMap(([key, raw]) => {
      const result = text(raw)
      return result ? [{ key, value: result, pointer: pointer(base, key) }] : []
    })
  }
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((entry, index) => {
    if (!object(entry)) return []
    const key = first(entry, ATTRIBUTE_KEYS)
    const rawValue = first(entry, ATTRIBUTE_VALUES)
    const name = key ? text(key.value) : undefined
    const result = rawValue ? text(rawValue.value) : undefined
    return name && result ? [{ key: name, value: result, pointer: pointer(pointer(base, index), rawValue.key) }] : []
  })
}

export function normalizeProduct(record) {
  let parsed
  try { parsed = JSON.parse(record.bytes.toString('utf8')) } catch { throw new AgentError('invalid-product', 'Product JSON is malformed.') }
  const unwrapped = unwrapProduct(parsed)
  const productId = field(unwrapped, FIELDS.productId, 'id')
  const sourcePlatform = field(unwrapped, FIELDS.platform, 'source platform')
  const productUrl = field(unwrapped, FIELDS.url, 'URL')
  invariant(safeUrl(productUrl.value), 'invalid-product', 'Product URL must be HTTPS.')
  const title = field(unwrapped, FIELDS.title, 'title')
  const category = field(unwrapped, FIELDS.category)
  const descriptionSelection = first(unwrapped.value, FIELDS.description)
  const descriptionRaw = descriptionSelection ? text(descriptionSelection.value) : undefined
  const html = extractVisibleHtml(descriptionRaw ?? '')
  const attributeSelection = first(unwrapped.value, FIELDS.attributes)
  const attributes = collectAttributes(attributeSelection?.value, attributeSelection ? pointer(unwrapped.base, attributeSelection.key) : unwrapped.base)
  const skuSelection = first(unwrapped.value, FIELDS.skus)
  const rawSkus = entries(skuSelection, skuSelection ? pointer(unwrapped.base, skuSelection.key) : unwrapped.base)
  const skus = rawSkus.flatMap((entry) => {
    if (!object(entry.value)) return []
    const id = first(entry.value, SKU_IDS)
    const idValue = id ? text(id.value) : undefined
    if (!idValue) return []
    const skuAttributes = first(entry.value, FIELDS.attributes)
    return [{ id: idValue, pointer: pointer(entry.pointer, id.key), attributes: collectAttributes(skuAttributes?.value, skuAttributes ? pointer(entry.pointer, skuAttributes.key) : entry.pointer) }]
  }).slice(0, 500)
  const imageReferences = []
  const seenImages = new Set()
  const addImageReference = (raw, sourcePointer, role) => {
    const url = safeUrl(raw)
    if (!url || url === productUrl.value || seenImages.has(url)) return
    seenImages.add(url)
    imageReferences.push({ url, pointer: sourcePointer, role })
  }
  const productImages = first(unwrapped.value, FIELDS.images)
  for (const item of entries(productImages, productImages ? pointer(unwrapped.base, productImages.key) : unwrapped.base)) {
    addImageReference(item.value, item.pointer, 'product-image')
  }
  for (const rawSku of rawSkus) {
    if (!object(rawSku.value)) continue
    const directImages = first(rawSku.value, FIELDS.images)
    for (const item of entries(directImages, directImages ? pointer(rawSku.pointer, directImages.key) : rawSku.pointer)) {
      addImageReference(item.value, item.pointer, 'sku-image')
    }
    const skuAttributes = first(rawSku.value, FIELDS.attributes)
    for (const attribute of entries(skuAttributes, skuAttributes ? pointer(rawSku.pointer, skuAttributes.key) : rawSku.pointer)) {
      if (!object(attribute.value)) continue
      const image = first(attribute.value, ['skuImageUrl', 'sku_image_url', 'imageUrl', 'image_url'])
      if (image) addImageReference(image.value, pointer(attribute.pointer, image.key), 'sku-image')
    }
  }
  const descriptionPointer = descriptionSelection ? pointer(unwrapped.base, descriptionSelection.key) : unwrapped.base
  for (const url of html.mediaUrls) addImageReference(url, descriptionPointer, 'description-image')
  invariant(imageReferences.length > 0, 'missing-product-media', 'Product record must supply at least one HTTPS image URL.')
  const retainedImageReferences = imageReferences.slice(0, 30)
  const identityAnchor = retainedImageReferences.find((reference) => reference.role === 'product-image')
  invariant(identityAnchor, 'missing-product-media', 'Product record must supply at least one explicit product image identity anchor.')
  const facts = {
    schema: 'product-facts.v1', sourceFile: record.path, sourceSha256: record.sha256, sourceShape: unwrapped.shape,
    productId, sourcePlatform, productUrl, title,
    description: descriptionRaw ? { value: html.visibleText, pointer: pointer(unwrapped.base, descriptionSelection.key) } : undefined,
    category, attributes: attributes.slice(0, 1_000), skus,
    identityAnchor,
    imageReferences: retainedImageReferences,
    mediaUrls: retainedImageReferences.map(({ url }) => url),
  }
  return Object.freeze({ ...facts, digest: sha256(stableJson(facts)) })
}

function scalar(value) { return text(value) ?? (object(value) ? text(first(value, ['valueNameAlias', 'value_name_alias', 'value', 'attrValue', 'attr_value', 'id', 'name', 'label'])?.value) : undefined) }
function parseJson(record, label) {
  try { return JSON.parse(record.bytes.toString('utf8')) } catch { throw new AgentError('invalid-catalog', `${label} JSON is malformed.`) }
}
function rootArray(raw, keys, label) {
  if (Array.isArray(raw)) return raw
  if (object(raw)) for (const key of keys) if (Array.isArray(raw[key])) return raw[key]
  throw new AgentError('invalid-catalog', `${label} must contain a supported array root.`)
}

export function buildCategoryIndex(record) {
  const raw = parseJson(record, 'Category catalog')
  const roots = rootArray(raw, ['categories', 'categoryList', 'category_list', 'data', 'result', 'nodes'], 'Category catalog')
  const categories = []
  const explicitLeaf = new Map()
  const walk = (values, inheritedParent, depth) => {
    invariant(depth <= 32, 'invalid-catalog', 'Category nesting exceeds the limit.')
    for (const entry of values) {
      invariant(object(entry), 'invalid-catalog', 'Category entries must be objects.')
      const id = scalar(first(entry, ['id', 'catId', 'cat_id', 'categoryId', 'category_id', 'value'])?.value)
      const name = scalar(first(entry, ['name', 'categoryName', 'category_name', 'label'])?.value)
      invariant(id && name && id.length <= 240 && name.length <= 500, 'invalid-catalog', 'Category entries require bounded id and name values.')
      const parentId = scalar(first(entry, ['parentId', 'parent_id', 'parentCategoryId', 'parent_category_id'])?.value) ?? inheritedParent
      const childSelection = first(entry, ['children', 'subcategories', 'childCategories', 'child_categories', 'childrenCategoryList', 'children_category_list'])
      const children = Array.isArray(childSelection?.value) ? childSelection.value : []
      const declared = first(entry, ['leaf', 'isLeaf', 'is_leaf'])?.value
      invariant(declared === undefined || typeof declared === 'boolean', 'invalid-catalog', `Category leaf flag is malformed: ${id}`)
      categories.push({ id, name, ...(parentId ? { parentId } : {}) })
      explicitLeaf.set(id, declared)
      invariant(categories.length <= 100_000, 'invalid-catalog', 'Category count exceeds the limit.')
      walk(children, id, depth + 1)
    }
  }
  walk(roots, undefined, 0)
  const byId = new Map()
  for (const category of categories) invariant(!byId.has(category.id) && byId.set(category.id, category), 'invalid-catalog', `Duplicate category id: ${category.id}`)
  const parentIds = new Set(categories.flatMap((category) => category.parentId ? [category.parentId] : []))
  for (const category of categories) {
    invariant(!category.parentId || byId.has(category.parentId), 'invalid-catalog', `Unknown category parent: ${category.id}`)
    const seen = new Set([category.id])
    let cursor = category
    while (cursor.parentId) {
      invariant(!seen.has(cursor.parentId), 'invalid-catalog', `Category cycle detected: ${category.id}`)
      seen.add(cursor.parentId); cursor = byId.get(cursor.parentId)
    }
    const leaf = !parentIds.has(category.id)
    invariant(explicitLeaf.get(category.id) !== true || leaf, 'invalid-catalog', `Category leaf flag conflicts with hierarchy: ${category.id}`)
    category.leaf = leaf
  }
  categories.sort((left, right) => left.id.localeCompare(right.id))
  return Object.freeze({ schema: 'commerce.category-index.v1', sourceFile: record.path, sourceSha256: record.sha256, categories, byId })
}

function attributeRoots(raw) {
  if (Array.isArray(raw)) return raw
  invariant(object(raw), 'invalid-catalog', 'Attribute catalog must be an object or array.')
  for (const key of ['attributes', 'attributeList', 'attribute_list', 'categories', 'data', 'result', 'definitions']) if (Array.isArray(raw[key])) return raw[key]
  return Object.entries(raw).map(([categoryId, attributes]) => ({ categoryId, attributes }))
}
function enumValues(value, key, customizable) {
  if (value === undefined && customizable) return []
  invariant(Array.isArray(value) && value.length <= 10_000, 'invalid-catalog', `Attribute requires enum values: ${key}`)
  const values = value.map(scalar)
  invariant(values.every(Boolean), 'invalid-catalog', `Attribute enum is malformed: ${key}`)
  return [...new Set(values)]
}

export function buildAttributeIndex(record, categoryIndex) {
  const sourceDefinitions = []
  const add = (entry, inheritedCategoryId) => {
    const categoryId = scalar(first(entry, ['categoryId', 'category_id', 'leafCategoryId', 'leaf_category_id'])?.value) ?? inheritedCategoryId
    const attrId = scalar(first(entry, ['attrId', 'attr_id', 'attributeId', 'attribute_id', 'id'])?.value)
      ?? scalar(first(entry, ['key', 'attributeName', 'attribute_name', 'name'])?.value)
    const label = scalar(first(entry, ['attributeNameAlias', 'attribute_name_alias', 'attributeName', 'attribute_name', 'attrName', 'attr_name', 'name', 'key'])?.value)
      ?? attrId
    const customizable = first(entry, ['customizable', 'isCustomized', 'is_customized'])?.value === true
    const values = first(entry, ['values', 'attributeValues', 'attribute_values', 'enumValues', 'enum_values', 'options', 'valueList', 'value_list'])?.value
    invariant(categoryId && attrId && label, 'invalid-catalog', 'Attribute definitions require categoryId, attrId and display label.')
    const category = categoryIndex.byId.get(categoryId)
    invariant(category, 'invalid-catalog', `Attribute references an unknown category: ${categoryId}`)
    sourceDefinitions.push({ categoryId, attrId, key: label, values: enumValues(values, attrId, customizable), customizable })
    invariant(sourceDefinitions.length <= 100_000, 'invalid-catalog', 'Attribute definition count exceeds the limit.')
  }
  for (const entry of attributeRoots(parseJson(record, 'Attribute catalog'))) {
    invariant(object(entry), 'invalid-catalog', 'Attribute entries must be objects.')
    const metadata = first(entry, ['categoryMetadata', 'category_metadata'])
    if (object(metadata?.value)) {
      const categoryId = scalar(first(entry, ['categoryId', 'category_id', 'leafCategoryId', 'leaf_category_id'])?.value)
      // `cid` is source-marketplace metadata, never target category authority.
      if (!categoryId) continue
      const definitions = [
        first(metadata.value, ['categorySaleAttrList', 'category_sale_attr_list'])?.value,
        first(metadata.value, ['categoryProductAttrList', 'category_product_attr_list'])?.value,
      ].flatMap((value) => Array.isArray(value) ? value : [])
      for (const child of definitions) {
        invariant(object(child), 'invalid-catalog', 'Attribute definitions must be objects.')
        add(child, categoryId)
      }
      continue
    }
    const nested = first(entry, ['attributes', 'attributeList', 'attribute_list', 'definitions', 'categoryMetadata', 'category_metadata'])
    if (Array.isArray(nested?.value)) {
      const categoryId = scalar(first(entry, ['categoryId', 'category_id', 'leafCategoryId', 'leaf_category_id'])?.value)
      // `cid` identifies the metadata record, not the competition category.
      if (!categoryId) continue
      for (const child of nested.value) { invariant(object(child), 'invalid-catalog', 'Attribute definitions must be objects.'); add(child, categoryId) }
    } else add(entry)
  }
  const sourceByIdentity = new Map()
  for (const definition of sourceDefinitions) {
    const identity = `${definition.categoryId}\0${definition.attrId}`
    const existing = sourceByIdentity.get(identity)
    invariant(!existing || stableJson(existing) === stableJson(definition), 'invalid-catalog', `Conflicting category attribute id: ${definition.categoryId}/${definition.attrId}`)
    sourceByIdentity.set(identity, definition)
  }
  const sourcesByCategory = new Map()
  for (const definition of sourceByIdentity.values()) {
    const siblings = sourcesByCategory.get(definition.categoryId) ?? []
    siblings.push(definition); sourcesByCategory.set(definition.categoryId, siblings)
  }
  const definitions = []
  const usedSourceCategories = new Set()
  for (const leaf of categoryIndex.categories.filter((category) => category.leaf)) {
    const lineage = []
    let cursor = leaf
    while (cursor) { lineage.unshift(cursor); cursor = cursor.parentId ? categoryIndex.byId.get(cursor.parentId) : undefined }
    const inherited = new Map()
    for (const category of lineage) {
      for (const definition of sourcesByCategory.get(category.id) ?? []) {
        inherited.set(definition.attrId, definition); usedSourceCategories.add(category.id)
      }
    }
    for (const definition of inherited.values()) definitions.push({ ...definition, categoryId: leaf.id })
  }
  const orphan = [...sourcesByCategory.keys()].find((categoryId) => !usedSourceCategories.has(categoryId))
  invariant(!orphan, 'invalid-catalog', `Attribute category has no descendant leaf: ${orphan}`)
  definitions.sort((left, right) => left.categoryId.localeCompare(right.categoryId) || left.attrId.localeCompare(right.attrId))
  return Object.freeze({ schema: 'commerce.attribute-index.v1', sourceFile: record.path, sourceSha256: record.sha256, definitions })
}

function tokens(value) {
  return new Set(normalized(value).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1))
}
export function catalogCandidates(facts, categoryIndex, maximum = 30) {
  const source = [facts.category?.value, facts.title.value, facts.description?.value].filter(Boolean).join(' ')
  const sourceNormalized = normalized(source)
  const sourceTokens = tokens(source)
  return categoryIndex.categories.filter((category) => category.leaf).map((category) => {
    const exact = [category.id, category.name].some((value) => normalized(value) === normalized(facts.category?.value ?? ''))
    const categoryTokens = tokens(`${category.id} ${category.name}`)
    let overlap = 0
    for (const token of categoryTokens) if (sourceTokens.has(token)) overlap += 1
    const contains = sourceNormalized.includes(normalized(category.name)) ? 2 : 0
    return { id: category.id, name: category.name, score: exact ? 1_000 : overlap + contains }
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, maximum)
}

export function evidenceBackedCatalogAttributes(facts, attributeIndex, categoryId) {
  const source = [...facts.attributes, ...facts.skus.flatMap((sku) => sku.attributes)]
  const result = []
  for (const definition of attributeIndex.definitions.filter((entry) => entry.categoryId === categoryId)) {
    const sourceFact = source.find((fact) => normalized(fact.key) === normalized(definition.key))
    if (!sourceFact) continue
    const exactValue = definition.customizable
      ? sourceFact.value
      : definition.values.find((value) => normalized(value) === normalized(sourceFact.value))
    if (exactValue) result.push({ attrId: definition.attrId, key: definition.key, value: exactValue, sourcePointer: sourceFact.pointer })
  }
  return result
}

export function validateCatalogSelection(selection, facts, categories, attributes, candidates) {
  invariant(candidates.some((candidate) => candidate.id === selection.categoryId), 'invalid-model-output', 'Selected category was not offered to the model.')
  invariant(categories.byId.get(selection.categoryId)?.leaf, 'invalid-model-output', 'Selected category is not an exact catalog leaf.')
  const backed = evidenceBackedCatalogAttributes(facts, attributes, selection.categoryId)
  invariant(Array.isArray(selection.catalogAttributes), 'invalid-model-output', 'Catalog attributes must be an array.')
  const seen = new Set()
  for (const entry of selection.catalogAttributes) {
    invariant(object(entry) && typeof entry.attrId === 'string' && typeof entry.value === 'string', 'invalid-model-output', 'Catalog attribute entry is malformed.')
    invariant(!seen.has(entry.attrId) && seen.add(entry.attrId), 'invalid-model-output', 'Catalog attribute ids must be unique.')
    invariant(backed.some((candidate) => candidate.attrId === entry.attrId && candidate.value === entry.value), 'invalid-model-output', `Catalog attribute lacks exact source evidence: ${entry.attrId}`)
  }
  return selection.catalogAttributes.map((entry) => ({ ...backed.find((candidate) => candidate.attrId === entry.attrId) }))
}

export function compactFactsForModel(facts) {
  const productAttributes = []
  const seenAttributes = new Set()
  for (const { key, value } of facts.attributes) {
    const identity = `${normalized(key)}\0${normalized(value)}`
    if (seenAttributes.has(identity)) continue
    seenAttributes.add(identity)
    productAttributes.push({ key, value })
  }
  return {
    productId: facts.productId.value,
    sourcePlatform: facts.sourcePlatform.value,
    title: facts.title.value,
    sourceCategory: facts.category?.value,
    productAttributes,
    skuCount: facts.skus.length,
    sourceMediaCount: facts.imageReferences.length,
  }
}
