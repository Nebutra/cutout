import type { NativeBridge, SaveBundleFileInput } from '@/platform/native'
import type {
  BundleFileContent,
  BundleRepository,
  BundleToSave,
  Result,
  BundleSaveReceipt,
} from '@/services/types'
import { err, ok } from '@/services/types'

export const DEFAULT_BUNDLE_LIMITS = Object.freeze({
  maxFiles: 2_048,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
})

export interface BundleRepositoryLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
}

async function contentBytes(content: BundleFileContent): Promise<Uint8Array> {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  if (content instanceof Uint8Array) return content
  return new Uint8Array(await content.arrayBuffer())
}

function validBundleName(name: string): boolean {
  return name.length > 0
    && name.length <= 128
    && name !== '.'
    && name !== '..'
    && !name.includes('/')
    && !name.includes('\\')
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)
}

function normalizedRelativePath(path: string): string | null {
  if (!path || path.length > 1024 || path.includes('\\') || path.startsWith('/')) return null
  const parts = path.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) return null
  return parts.join('/')
}

function assertNoPathConflicts(paths: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const path of paths) {
    if (seen.has(path)) return `Duplicate bundle path: ${path}`
    const parts = path.split('/')
    let parent = ''
    for (const part of parts.slice(0, -1)) {
      parent = parent ? `${parent}/${part}` : part
      if (seen.has(parent)) return `Bundle path conflicts with file ancestor: ${parent}`
    }
    for (const existing of seen) {
      if (existing.startsWith(`${path}/`)) return `Bundle path conflicts with directory: ${path}`
    }
    seen.add(path)
  }
  return null
}

export function createLocalBundleRepository(
  bridge: NativeBridge,
  limits: BundleRepositoryLimits = DEFAULT_BUNDLE_LIMITS,
): BundleRepository {
  return {
    async save(bundle: BundleToSave): Promise<Result<BundleSaveReceipt>> {
      if (!validBundleName(bundle.name)) return err('Bundle name must be a safe directory name.')
      if (bundle.files.length === 0) return err('Bundle must contain at least one file.')
      if (bundle.files.length > limits.maxFiles) return err(`Bundle exceeds the ${limits.maxFiles} file limit.`)

      try {
        const files: SaveBundleFileInput[] = []
        let totalBytes = 0
        for (const file of bundle.files) {
          const path = normalizedRelativePath(file.path)
          if (!path) return err(`Unsafe bundle path: ${file.path}`)
          const bytes = await contentBytes(file.content)
          if (bytes.byteLength > limits.maxFileBytes) return err(`Bundle file exceeds the per-file size limit: ${path}`)
          totalBytes += bytes.byteLength
          if (totalBytes > limits.maxTotalBytes) return err('Bundle exceeds the total size limit.')
          files.push({ path, bytes })
        }
        const conflict = assertNoPathConflicts(files.map((file) => file.path))
        if (conflict) return err(conflict)

        return ok(await bridge.saveBundle({ name: bundle.name, files }))
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },
  }
}
