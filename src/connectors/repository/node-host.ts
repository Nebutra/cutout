import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { scanLocalRepository, type RepositoryScanOptions } from '@/ingestion/repo-scanner'
import type { RepositoryHostAdapter } from './repository-connector'

/** Node-only host adapter. Callers must explicitly grant one or more controlled roots. */
export async function createNodeRepositoryHost(allowedRoots: readonly string[]): Promise<RepositoryHostAdapter> {
  if (allowedRoots.length === 0) throw new Error('At least one controlled repository root is required.')
  const roots = await Promise.all(allowedRoots.map(async (root) => {
    if (!isAbsolute(root)) throw new Error('Controlled repository roots must be absolute paths.')
    const stats = await lstat(root)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('Controlled repository roots must be real directories, not symbolic links.')
    return realpath(root)
  }))
  return {
    async scan(locator, options) {
      options.signal.throwIfAborted()
      if (!isAbsolute(locator)) throw new Error('Repository locator must be an absolute host-authorized path.')
      const stats = await lstat(locator)
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('Repository locator must be a real directory, not a symbolic link.')
      const canonical = await realpath(locator)
      if (!roots.some((root) => contained(root, canonical))) throw new Error('Repository locator is outside the controlled roots.')
      const scanOptions: RepositoryScanOptions = {
        role: options.role, license: options.license,
        ...(options.label ? { label: options.label } : {}),
        ...(options.promptProvenance ? { promptProvenance: options.promptProvenance } : {}),
      }
      const result = await scanLocalRepository(canonical, scanOptions)
      options.signal.throwIfAborted()
      return result
    },
  }
}

function contained(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate))
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

