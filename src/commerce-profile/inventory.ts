import { z } from 'zod'

export const commerceInputRoleSchema = z.enum([
  'product-record',
  'category-catalog',
  'attribute-catalog',
])
export type CommerceInputRole = z.infer<typeof commerceInputRoleSchema>

export interface CommerceInputFile {
  readonly path: string
  readonly role: CommerceInputRole
  readonly contents: string
  readonly mediaType: 'application/json'
  readonly kind?: 'regular' | 'symlink'
}

export interface InventoryLimits {
  readonly maximumFiles: number
  readonly maximumFileBytes: number
  readonly maximumTotalBytes: number
  readonly maximumProductRecords: number
}

export interface InventoriedCommerceInput extends CommerceInputFile {
  readonly kind: 'regular'
  readonly byteLength: number
}

export const DEFAULT_INVENTORY_LIMITS: InventoryLimits = Object.freeze({
  maximumFiles: 100,
  maximumFileBytes: 8 * 1024 * 1024,
  maximumTotalBytes: 32 * 1024 * 1024,
  maximumProductRecords: 50,
})

export function assertAllowlistedCommerceInputPath(path: string): void {
  if (path.length === 0 || path.length > 512 || path.includes('\0') || path.includes('\\')) {
    throw new Error(`Input path is malformed: ${JSON.stringify(path)}`)
  }
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new Error(`Input path must be relative: ${path}`)
  }
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Input path contains an unsafe segment: ${path}`)
  }
  if (!path.toLowerCase().endsWith('.json')) {
    throw new Error(`Input file type is not allowlisted: ${path}`)
  }
}

export function inventoryCommerceInputs(
  files: readonly CommerceInputFile[],
  limits: InventoryLimits = DEFAULT_INVENTORY_LIMITS,
): readonly InventoriedCommerceInput[] {
  if (files.length === 0) throw new Error('Commerce input inventory is empty.')
  if (files.length > limits.maximumFiles) {
    throw new Error(`Commerce input file count exceeds ${limits.maximumFiles}.`)
  }
  const paths = new Set<string>()
  let totalBytes = 0
  let productRecords = 0
  let categoryCatalogs = 0
  let attributeCatalogs = 0
  const inventoried = files.map((file) => {
    assertAllowlistedCommerceInputPath(file.path)
    commerceInputRoleSchema.parse(file.role)
    if (file.mediaType !== 'application/json') {
      throw new Error(`Input media type is not allowlisted: ${file.path}`)
    }
    if ((file.kind ?? 'regular') !== 'regular') {
      throw new Error(`Input must be a regular file: ${file.path}`)
    }
    if (paths.has(file.path)) throw new Error(`Duplicate input path: ${file.path}`)
    paths.add(file.path)
    const byteLength = new TextEncoder().encode(file.contents).byteLength
    if (byteLength > limits.maximumFileBytes) {
      throw new Error(`Input file exceeds ${limits.maximumFileBytes} bytes: ${file.path}`)
    }
    totalBytes += byteLength
    if (file.role === 'product-record') productRecords += 1
    if (file.role === 'category-catalog') categoryCatalogs += 1
    if (file.role === 'attribute-catalog') attributeCatalogs += 1
    return { ...file, kind: 'regular' as const, byteLength }
  })
  if (totalBytes > limits.maximumTotalBytes) {
    throw new Error(`Commerce input aggregate exceeds ${limits.maximumTotalBytes} bytes.`)
  }
  if (productRecords === 0 || productRecords > limits.maximumProductRecords) {
    throw new Error(`Product record count must be between 1 and ${limits.maximumProductRecords}.`)
  }
  if (categoryCatalogs !== 1 || attributeCatalogs !== 1) {
    throw new Error('Commerce input requires exactly one category catalog and one attribute catalog.')
  }
  return inventoried.sort((left, right) => left.path.localeCompare(right.path))
}
