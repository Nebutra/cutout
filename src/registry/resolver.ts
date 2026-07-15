import { RegistryItemSchema, type RegistryItem } from './contracts'

export type RegistrySourceDescriptor =
  | { readonly id: string; readonly kind: 'bundled' }
  | { readonly id: string; readonly kind: 'local'; readonly rootLabel?: string }
  | { readonly id: string; readonly kind: 'http'; readonly baseUrl: string }

export interface RegistryReference {
  readonly sourceId: string
  readonly itemId: string
  readonly version?: string
}

export interface RegistryHost {
  readonly source: RegistrySourceDescriptor
  readItem(reference: RegistryReference, options?: { readonly signal?: AbortSignal }): Promise<unknown>
  readFile(path: string, reference: RegistryReference, options?: { readonly signal?: AbortSignal }): Promise<Uint8Array>
}

export interface VerifiedRegistryFile {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

export interface RegistryResolution {
  readonly item: RegistryItem
  readonly source: RegistrySourceDescriptor
  readonly verifiedFiles: readonly VerifiedRegistryFile[]
}

export type RegistryResolutionErrorCode =
  | 'duplicate-source' | 'source-not-found' | 'invalid-item' | 'item-mismatch'
  | 'version-mismatch' | 'file-size-mismatch' | 'file-hash-mismatch' | 'aborted'

export class RegistryResolutionError extends Error {
  readonly code: RegistryResolutionErrorCode
  constructor(code: RegistryResolutionErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'RegistryResolutionError'
  }
}

export interface RegistryResolver {
  resolve(reference: RegistryReference, options?: { readonly signal?: AbortSignal }): Promise<RegistryResolution>
}

export function createRegistryResolver(hosts: readonly RegistryHost[]): RegistryResolver {
  const hostById = new Map<string, RegistryHost>()
  for (const host of hosts) {
    if (!host.source.id.trim() || hostById.has(host.source.id)) {
      throw new RegistryResolutionError('duplicate-source', `Registry source IDs must be non-empty and unique: ${host.source.id}`)
    }
    hostById.set(host.source.id, host)
  }

  return {
    async resolve(reference, options = {}) {
      assertActive(options.signal)
      const host = hostById.get(reference.sourceId)
      if (!host) throw new RegistryResolutionError('source-not-found', `Registry source not found: ${reference.sourceId}`)

      const parsed = RegistryItemSchema.safeParse(await host.readItem(reference, options))
      assertActive(options.signal)
      if (!parsed.success) throw new RegistryResolutionError('invalid-item', 'Registry item failed strict schema validation.')
      const item = parsed.data
      if (item.id !== reference.itemId) throw new RegistryResolutionError('item-mismatch', `Registry returned ${item.id} for ${reference.itemId}.`)
      if (reference.version !== undefined && item.version !== reference.version) {
        throw new RegistryResolutionError('version-mismatch', `Registry returned version ${item.version}; expected ${reference.version}.`)
      }

      const verifiedFiles: VerifiedRegistryFile[] = []
      for (const file of item.files) {
        assertActive(options.signal)
        const returnedBytes = await host.readFile(file.path, reference, options)
        assertActive(options.signal)
        if (!ArrayBuffer.isView(returnedBytes) || returnedBytes.BYTES_PER_ELEMENT !== 1) throw new RegistryResolutionError('file-size-mismatch', `Registry file host returned invalid bytes for ${file.path}.`)
        const bytes = Uint8Array.from(returnedBytes)
        if (bytes.byteLength !== file.size) throw new RegistryResolutionError('file-size-mismatch', `Registry file size mismatch: ${file.path}.`)
        const actualHash = await sha256Hex(bytes)
        if (actualHash !== file.sha256) throw new RegistryResolutionError('file-hash-mismatch', `Registry file hash mismatch: ${file.path}.`)
        verifiedFiles.push({ path: file.path, size: file.size, sha256: actualHash })
      }
      return { item, source: host.source, verifiedFiles }
    },
  }
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RegistryResolutionError('aborted', 'Registry resolution was aborted.')
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
