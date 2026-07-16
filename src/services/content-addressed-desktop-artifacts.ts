import { IndexedDbLibraryBlobStore } from '@/global-library/blob-store'
import type { DesktopToolArtifact, DesktopToolArtifactStore } from './desktop-tool-executor'

const PREFIX = 'artifact:sha256:'

export class ContentAddressedDesktopArtifactStore implements DesktopToolArtifactStore {
  readonly #blobs: IndexedDbLibraryBlobStore
  constructor(factory: IDBFactory) { this.#blobs = new IndexedDbLibraryBlobStore(factory) }

  async read(id: string): Promise<DesktopToolArtifact | null> {
    const digest = parseArtifactId(id)
    if (!digest) return null
    const record = await this.#blobs.get(digest)
    return record ? { id, mediaType: record.mediaType, bytes: new Uint8Array(record.bytes) } : null
  }

  async write(input: { readonly mediaType: string; readonly bytes: Uint8Array; readonly source: 'generate-image' | 'edit-image' | 'cutout'; readonly runId: string }): Promise<string> {
    const record = await this.#blobs.put(input.bytes, input.mediaType)
    return artifactId(record.sha256)
  }

  async writeBatch(inputs: readonly { readonly mediaType: string; readonly bytes: Uint8Array; readonly source: 'generate-image' | 'edit-image' | 'cutout'; readonly runId: string }[]): Promise<readonly string[]> {
    return Promise.all(inputs.map((input) => this.write(input)))
  }
}

export function artifactId(sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Desktop artifact digest must be lowercase SHA-256.')
  return `${PREFIX}${sha256}`
}

export function parseArtifactId(id: string): string | null {
  const digest = id.startsWith(PREFIX) ? id.slice(PREFIX.length) : ''
  return /^[a-f0-9]{64}$/.test(digest) ? digest : null
}
