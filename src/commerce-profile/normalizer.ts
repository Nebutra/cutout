import { productFactsSchema, type FactValue, type ProductFact, type ProductFacts } from './contracts'
import { assertAllowlistedCommerceInputPath, DEFAULT_INVENTORY_LIMITS } from './inventory'

type JsonObject = Record<string, unknown>

const PRODUCT_MARKERS = new Set([
  'productId', 'product_id', 'itemId', 'item_id', 'subject', 'title', 'productTitle',
  'description', 'descriptionHtml', 'description_html', 'skus', 'skuList', 'sku_list',
])

const FIELD_ALIASES = {
  productId: ['productId', 'product_id', 'itemId', 'item_id', 'num_iid', 'id'],
  sourcePlatform: ['sourcePlatform', 'source_platform', 'sourceType', 'source_type', 'platform', 'platformName', 'platform_name', 'site'],
  sourceUrl: ['productUrl', 'product_url', 'detailUrl', 'detail_url', 'itemUrl', 'url'],
  title: ['title', 'subject', 'productTitle', 'product_title', 'itemName', 'item_name'],
  description: ['description', 'descriptionHtml', 'description_html', 'desc', 'descHtml', 'desc_html'],
  category: ['leafCategoryId', 'leaf_category_id', 'categoryId', 'category_id', 'category'],
  attributes: [
    'productAttributes', 'product_attributes', 'skuAttributes', 'sku_attributes',
    'attributes', 'props', 'productProps', 'product_props', 'productPropList', 'product_prop_list',
  ],
  skus: ['skus', 'skuList', 'sku_list', 'skuRecords', 'sku_records', 'skuInfos', 'sku_infos'],
  images: ['images', 'itemImages', 'item_images', 'itemImgs', 'item_imgs', 'imageUrls', 'image_urls', 'imageUrlList', 'image_url_list', 'imageUrl', 'image_url'],
  videos: ['videos', 'itemVideos', 'item_videos', 'videoUrls', 'video_urls', 'videoUrlList', 'video_url_list', 'videoUrl', 'video_url'],
} as const

const ATTRIBUTE_KEY_ALIASES = [
  'key', 'name', 'attributeName', 'attribute_name', 'attrName', 'attr_name',
  'propertyName', 'property_name', 'propName', 'prop_name',
] as const
const ATTRIBUTE_VALUE_ALIASES = [
  'value', 'attributeValue', 'attribute_value', 'attrValue', 'attr_value',
  'propertyValue', 'property_value', 'propValue', 'prop_value',
] as const
const SKU_ID_ALIASES = ['skuId', 'sku_id', 'id', 'specId', 'spec_id'] as const
const MEASUREMENT_PATTERN = /(?:length|width|height|depth|size|weight|waist|bust|chest|hip|sleeve|inseam)/i
const MEASUREMENT_VALUE_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|g|kg|oz|lb|lbs)\s*$/i
export const MAXIMUM_PRODUCT_RECORD_BYTES = DEFAULT_INVENTORY_LIMITS.maximumFileBytes

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapePointer(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function pick(object: JsonObject, aliases: readonly string[], basePointer: string): {
  readonly value: unknown
  readonly pointer: string
} | undefined {
  for (const alias of aliases) {
    if (Object.hasOwn(object, alias) && object[alias] !== null && object[alias] !== undefined) {
      return { value: object[alias], pointer: `${basePointer}/${escapePointer(alias)}` }
    }
  }
  return undefined
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function decodeEntity(entity: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  }
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const code = Number.parseInt(entity.slice(2), 16)
    return validCodePoint(code) ? String.fromCodePoint(code) : `&${entity};`
  }
  if (entity.startsWith('#')) {
    const code = Number.parseInt(entity.slice(1), 10)
    return validCodePoint(code) ? String.fromCodePoint(code) : `&${entity};`
  }
  return named[entity] ?? `&${entity};`
}

function validCodePoint(code: number): boolean {
  return Number.isSafeInteger(code)
    && code >= 0
    && code <= 0x10FFFF
    && (code < 0xD800 || code > 0xDFFF)
}

function decodeEntities(value: string): string {
  return value.replace(/&([A-Za-z]+|#[0-9]+|#[xX][0-9A-Fa-f]+);/g, (_, entity: string) => decodeEntity(entity))
}

export interface ExtractedHtmlData {
  readonly visibleText: string
  readonly mediaDescriptors: readonly { readonly kind: 'image' | 'video', readonly descriptor: string }[]
}

export function extractUntrustedHtml(html: string): ExtractedHtmlData {
  let index = 0
  let suppressedTag: 'script' | 'style' | undefined
  const visible: string[] = []
  const media: Array<{ kind: 'image' | 'video', descriptor: string }> = []
  while (index < html.length) {
    if (html[index] !== '<') {
      const next = html.indexOf('<', index)
      if (!suppressedTag) visible.push(html.slice(index, next === -1 ? html.length : next))
      index = next === -1 ? html.length : next
      continue
    }
    if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4)
      index = end === -1 ? html.length : end + 3
      continue
    }
    let cursor = index + 1
    let quote: '"' | "'" | undefined
    for (; cursor < html.length; cursor += 1) {
      const character = html[cursor]
      if (quote) {
        if (character === quote) quote = undefined
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
    }
    if (cursor >= html.length) {
      if (!suppressedTag) visible.push(html.slice(index))
      break
    }
    const rawTag = html.slice(index + 1, cursor)
    const closing = /^\s*\//.test(rawTag)
    const tagName = rawTag.match(/^\s*\/?\s*([A-Za-z0-9-]+)/)?.[1]?.toLowerCase()
    if (closing && tagName === suppressedTag) suppressedTag = undefined
    if (!closing && (tagName === 'script' || tagName === 'style')) suppressedTag = tagName
    if (!closing && !suppressedTag && (tagName === 'img' || tagName === 'video' || tagName === 'source')) {
      const source = rawTag.match(/(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const descriptor = decodeEntities(source?.[1] ?? source?.[2] ?? source?.[3] ?? '').trim()
      if (descriptor) media.push({ kind: tagName === 'img' ? 'image' : 'video', descriptor })
    }
    if (!suppressedTag && ['br', 'div', 'li', 'p', 'section', 'td', 'tr'].includes(tagName ?? '')) visible.push(' ')
    index = cursor + 1
  }
  return {
    visibleText: decodeEntities(visible.join('')).replace(/\s+/g, ' ').trim(),
    mediaDescriptors: media,
  }
}

function unwrapProduct(raw: unknown): { object: JsonObject, pointer: string, shape: ProductFacts['sourceShape'] } {
  if (!isObject(raw)) throw new Error('Product record must be a JSON object.')
  const nested = isObject(raw.ret) && isObject(raw.ret.result) && isObject(raw.ret.result.result)
    ? raw.ret.result.result
    : undefined
  if (nested) return { object: nested, pointer: '/ret/result/result', shape: 'nested-ret-result-result' }
  if ([...PRODUCT_MARKERS].some((marker) => Object.hasOwn(raw, marker))) {
    return { object: raw, pointer: '', shape: 'direct-product' }
  }
  throw new Error('Unsupported product record shape; expected a direct product or ret.result.result object.')
}

function arrayItems(selection: { value: unknown, pointer: string } | undefined): readonly { value: unknown, pointer: string }[] {
  if (!selection) return []
  if (Array.isArray(selection.value)) {
    return selection.value.map((value, index) => ({ value, pointer: `${selection.pointer}/${index}` }))
  }
  return [{ value: selection.value, pointer: selection.pointer }]
}

function mediaItems(selection: { value: unknown, pointer: string } | undefined): readonly { descriptor: string, pointer: string }[] {
  return arrayItems(selection).flatMap((entry) => {
    const descriptor = text(entry.value)
      ?? (isObject(entry.value) ? text(entry.value.url) ?? text(entry.value.src) : undefined)
    return descriptor ? [{ descriptor, pointer: entry.pointer }] : []
  })
}

function parseMeasurement(value: string): { value: number, unit: string } | undefined {
  const match = MEASUREMENT_VALUE_PATTERN.exec(value)
  if (!match) return undefined
  return { value: Number(match[1]), unit: match[2]!.toLowerCase() }
}

export function normalizeProductRecord(input: {
  readonly file: string
  readonly contents: string
}): ProductFacts {
  assertAllowlistedCommerceInputPath(input.file)
  const byteLength = new TextEncoder().encode(input.contents).byteLength
  if (byteLength > MAXIMUM_PRODUCT_RECORD_BYTES) {
    throw new Error(`Product record exceeds ${MAXIMUM_PRODUCT_RECORD_BYTES} bytes: ${input.file}`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(input.contents)
  } catch (error) {
    throw new Error(`Malformed product JSON in ${input.file}: ${error instanceof Error ? error.message : 'parse failed'}`)
  }
  const unwrapped = unwrapProduct(raw)
  const facts: ProductFact[] = []
  const usedIds = new Map<string, number>()
  const addFact = (field: string, value: FactValue, pointer: string, confidence: ProductFact['confidence']): string => {
    const safeField = field.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '') || 'value'
    const ordinal = (usedIds.get(safeField) ?? 0) + 1
    usedIds.set(safeField, ordinal)
    const id = `fact:${safeField}${ordinal === 1 ? '' : `:${ordinal}`}`
    facts.push({ id, field, value, confidence, source: { file: input.file, pointer: pointer || '/' } })
    return id
  }
  const requiredUnknownFactIds: string[] = []
  const requiredText = (field: string, aliases: readonly string[]): string => {
    const selected = pick(unwrapped.object, aliases, unwrapped.pointer)
    const value = selected ? text(selected.value) : undefined
    if (value) return addFact(field, { type: 'text', value }, selected!.pointer, 'explicit')
    const id = addFact(field, { type: 'unknown', reason: `${field} was not supplied.` }, unwrapped.pointer || '/', 'unknown')
    requiredUnknownFactIds.push(id)
    return id
  }

  const productIdFactId = requiredText('identity.product-id', FIELD_ALIASES.productId)
  const sourcePlatformFactId = requiredText('identity.source-platform', FIELD_ALIASES.sourcePlatform)
  const sourceUrlFactId = requiredText('identity.source-url', FIELD_ALIASES.sourceUrl)
  const titleFactIds = [requiredText('title', FIELD_ALIASES.title)]

  const descriptionSelection = pick(unwrapped.object, FIELD_ALIASES.description, unwrapped.pointer)
  const descriptionRaw = descriptionSelection ? text(descriptionSelection.value) : undefined
  const extracted = descriptionRaw ? extractUntrustedHtml(descriptionRaw) : { visibleText: '', mediaDescriptors: [] }
  const descriptionFactIds = extracted.visibleText
    ? [addFact('description.visible-text', { type: 'text', value: extracted.visibleText }, descriptionSelection!.pointer, 'derived')]
    : [addFact('description.visible-text', { type: 'unknown', reason: 'A visible product description was not supplied.' }, unwrapped.pointer || '/', 'unknown')]
  if (!extracted.visibleText) requiredUnknownFactIds.push(descriptionFactIds[0]!)

  const categorySelection = pick(unwrapped.object, FIELD_ALIASES.category, unwrapped.pointer)
  const categoryValue = categorySelection && isObject(categorySelection.value)
    ? text(categorySelection.value.id) ?? text(categorySelection.value.categoryId) ?? text(categorySelection.value.name)
    : categorySelection ? text(categorySelection.value) : undefined
  const categoryFactId = categoryValue
    ? addFact('category.leaf-id', { type: 'text', value: categoryValue }, categorySelection!.pointer, 'explicit')
    : addFact('category.leaf-id', { type: 'unknown', reason: 'A leaf category was not supplied.' }, unwrapped.pointer || '/', 'unknown')
  if (!categoryValue) requiredUnknownFactIds.push(categoryFactId)

  const mediaFactIds: string[] = []
  const addMedia = (kind: 'image' | 'video', descriptor: string, pointer: string, confidence: ProductFact['confidence']) => {
    if (mediaFactIds.some((id) => {
      const fact = facts.find((candidate) => candidate.id === id)
      return fact?.value.type === 'media' && fact.value.descriptor === descriptor
    })) return
    mediaFactIds.push(addFact(`media.${kind}`, { type: 'media', mediaKind: kind, descriptor }, pointer, confidence))
  }
  for (const item of mediaItems(pick(unwrapped.object, FIELD_ALIASES.images, unwrapped.pointer))) {
    addMedia('image', item.descriptor, item.pointer, 'explicit')
  }
  for (const item of mediaItems(pick(unwrapped.object, FIELD_ALIASES.videos, unwrapped.pointer))) {
    addMedia('video', item.descriptor, item.pointer, 'explicit')
  }
  for (const item of extracted.mediaDescriptors) addMedia(item.kind, item.descriptor, descriptionSelection!.pointer, 'derived')

  const attributeFactIds: string[] = []
  const measurementFactIds: string[] = []
  const semanticAttributeField = (prefix: string, key: string): string => {
    if (/(?:composition|material|fabric)/i.test(key)) return `${prefix}.composition.${key}`
    if (/(?:certif|compliance|approved)/i.test(key)) return `${prefix}.certification.${key}`
    if (/(?:performance|waterproof|resistan|durab)/i.test(key)) return `${prefix}.performance.${key}`
    return `${prefix}.attribute.${key}`
  }
  const normalizeAttributes = (selection: { value: unknown, pointer: string } | undefined, prefix: string) => {
    if (!selection) return
    if (isObject(selection.value)
      && !ATTRIBUTE_KEY_ALIASES.some((key) => Object.hasOwn(selection.value as JsonObject, key))) {
      for (const [key, rawValue] of Object.entries(selection.value)) {
        const value = text(rawValue)
        if (!value) continue
        const pointer = `${selection.pointer}/${escapePointer(key)}`
        const measurement = MEASUREMENT_PATTERN.test(key) ? parseMeasurement(value) : undefined
        const id = measurement
          ? addFact(`${prefix}.dimensions.measurement.${key}`, { type: 'measurement', ...measurement }, pointer, 'explicit')
          : addFact(semanticAttributeField(prefix, key), { type: 'text', value }, pointer, 'explicit')
        if (measurement) measurementFactIds.push(id)
        else attributeFactIds.push(id)
      }
      return
    }
    for (const entry of arrayItems(selection)) {
      if (!isObject(entry.value)) continue
      const keySelection = pick(entry.value, ATTRIBUTE_KEY_ALIASES, entry.pointer)
      const valueSelection = pick(entry.value, ATTRIBUTE_VALUE_ALIASES, entry.pointer)
      const key = keySelection ? text(keySelection.value) : undefined
      const value = valueSelection ? text(valueSelection.value) : undefined
      if (!key || !value) continue
      const measurement = MEASUREMENT_PATTERN.test(key) ? parseMeasurement(value) : undefined
      const id = measurement
        ? addFact(`${prefix}.dimensions.measurement.${key}`, { type: 'measurement', ...measurement }, valueSelection!.pointer, 'explicit')
        : addFact(semanticAttributeField(prefix, key), { type: 'text', value }, valueSelection!.pointer, 'explicit')
      if (measurement) measurementFactIds.push(id)
      else attributeFactIds.push(id)
    }
  }
  normalizeAttributes(pick(unwrapped.object, FIELD_ALIASES.attributes, unwrapped.pointer), 'product')

  const skuSelection = pick(unwrapped.object, FIELD_ALIASES.skus, unwrapped.pointer)
  const skus = arrayItems(skuSelection).flatMap((entry, index) => {
    if (!isObject(entry.value)) return []
    const skuIdSelection = pick(entry.value, SKU_ID_ALIASES, entry.pointer)
    const skuId = skuIdSelection ? text(skuIdSelection.value) : undefined
    const skuIdFactId = addFact(
      `sku.${index + 1}.id`,
      skuId ? { type: 'text', value: skuId } : { type: 'unknown', reason: 'SKU id was not supplied.' },
      skuIdSelection?.pointer ?? entry.pointer,
      skuId ? 'explicit' : 'unknown',
    )
    if (!skuId) requiredUnknownFactIds.push(skuIdFactId)
    const beforeAttributes = attributeFactIds.length
    const beforeMeasurements = measurementFactIds.length
    normalizeAttributes(pick(entry.value, FIELD_ALIASES.attributes, entry.pointer), `sku.${index + 1}`)
    const skuMediaFactIds: string[] = []
    for (const image of mediaItems(pick(entry.value, FIELD_ALIASES.images, entry.pointer))) {
      const before = mediaFactIds.length
      addMedia('image', image.descriptor, image.pointer, 'explicit')
      if (mediaFactIds.length > before) skuMediaFactIds.push(mediaFactIds.at(-1)!)
    }
    return [{
      id: `sku:${index + 1}`,
      skuIdFactId,
      attributeFactIds: attributeFactIds.slice(beforeAttributes),
      measurementFactIds: measurementFactIds.slice(beforeMeasurements),
      mediaFactIds: skuMediaFactIds,
    }]
  })

  for (const field of ['composition', 'dimensions', 'certification', 'performance'] as const) {
    if (!facts.some((fact) => fact.field.toLowerCase().includes(field))) {
      requiredUnknownFactIds.push(addFact(
        `claim.${field}`,
        { type: 'unknown', reason: `${field} evidence was not supplied.` },
        unwrapped.pointer || '/',
        'unknown',
      ))
    }
  }

  return productFactsSchema.parse({
    schema: 'product-facts.v1',
    sourceFile: input.file,
    sourceShape: unwrapped.shape,
    identity: { productIdFactId, sourcePlatformFactId, sourceUrlFactId },
    titleFactIds,
    descriptionFactIds,
    categoryFactId,
    mediaFactIds,
    skus,
    attributeFactIds,
    measurementFactIds,
    requiredUnknownFactIds,
    facts,
  })
}
