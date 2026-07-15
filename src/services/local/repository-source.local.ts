import type { NativeBridge } from '@/platform/native'
import { err, ok, type RepositorySourceService } from '@/services/types'

export function createLocalRepositorySourceService(bridge: NativeBridge): RepositorySourceService {
  return {
    nativeAvailable: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && Boolean(bridge.scanRepository),
    async selectAndScan() {
      if (!bridge.scanRepository) return err('Native repository scanning is unavailable in this host.')
      try { return ok(await bridge.scanRepository()) }
      catch (error) { return err(error instanceof Error ? error.message : String(error)) }
    },
  }
}
