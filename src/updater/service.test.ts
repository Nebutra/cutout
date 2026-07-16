import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = {
  getStatus: vi.fn(async () => ({ phase: 'idle', downloadedBytes: 0 })),
  check: vi.fn(), download: vi.fn(), cancel: vi.fn(), subscribeProgress: vi.fn(), installAndRelaunch: vi.fn(),
}
vi.mock('./runtime', () => ({ createTauriUpdaterRuntime: () => runtime }))
vi.mock('@/store', () => ({ getStoreState: () => ({ workspaceSnapshot: undefined }) }))
vi.mock('@/platform/authorized-workspace', () => ({ getAuthorizedWorkspace: () => undefined }))
vi.mock('@/agent-host/tauri-service', () => ({ createTauriAgentHostService: vi.fn() }))

import { createDesktopUpdateOrchestrator } from './service'

describe('desktop updater service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports the package version supplied by the Tauri app API instead of a hardcoded copy', async () => {
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '3.4.5',
    })
    await controller.initialize()
    expect(controller.getState().capability?.currentVersion).toBe('3.4.5')
  })
})
