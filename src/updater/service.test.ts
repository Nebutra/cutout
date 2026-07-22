import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateSnapshot } from './runtime'

const runtime = {
  getStatus: vi.fn(async (): Promise<UpdateSnapshot> => ({ phase: 'idle', downloadedBytes: 0 })),
  check: vi.fn(), download: vi.fn(), cancel: vi.fn(), subscribeProgress: vi.fn(), installAndRelaunch: vi.fn(),
}
const store = vi.hoisted(() => ({ activeRunStatus: undefined as undefined | 'running' | 'ready' | 'needs-repair' | 'cancelled' }))
vi.mock('./runtime', () => ({ createTauriUpdaterRuntime: () => runtime }))
vi.mock('@/store', () => ({
  getStoreState: () => ({
    workspaceSnapshot: store.activeRunStatus
      ? { agentRunEvents: { activeRun: { status: store.activeRunStatus } } }
      : undefined,
  }),
}))
vi.mock('@/platform/authorized-workspace', () => ({ getAuthorizedWorkspace: () => undefined }))
vi.mock('@/agent-host/tauri-service', () => ({ createTauriAgentHostService: vi.fn() }))

import { createDesktopUpdateOrchestrator } from './service'

describe('desktop updater service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.activeRunStatus = undefined
    runtime.getStatus.mockResolvedValue({ phase: 'idle', downloadedBytes: 0 })
    runtime.check.mockResolvedValue({ phase: 'available', downloadedBytes: 0, availableVersion: '9.9.9' })
    runtime.download.mockResolvedValue({ phase: 'ready', downloadedBytes: 100, contentLength: 100 })
    runtime.installAndRelaunch.mockResolvedValue(undefined)
    runtime.subscribeProgress.mockResolvedValue(() => {})
  })

  it('reports the package version supplied by the Tauri app API instead of a hardcoded copy', async () => {
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '3.4.5',
    })
    await controller.initialize()
    expect(controller.getState().capability?.currentVersion).toBe('3.4.5')
  })

  it('uses native capability to expose configured channels', async () => {
    runtime.getStatus.mockResolvedValueOnce({
      phase: 'idle',
      downloadedBytes: 0,
      channelCapabilities: {
        stable: { available: true },
        beta: { available: false, reason: 'Beta is not configured.' },
      },
    })
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '3.4.5',
    })
    await controller.initialize()
    expect(controller.getState().capability?.channels).toEqual({
      stable: { available: true },
      beta: { available: false, reason: 'Beta is not configured.' },
    })
  })

  it('projects native retry state after a command failure', async () => {
    runtime.check.mockRejectedValueOnce(new Error('invoke failed'))
    runtime.getStatus
      .mockResolvedValueOnce({ phase: 'idle', downloadedBytes: 0 })
      .mockResolvedValueOnce({
        phase: 'error',
        downloadedBytes: 0,
        error: 'native download must be retried',
        retryAction: 'download',
      })
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '3.4.5',
    })
    await controller.initialize()
    await controller.check()
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      error: 'native download must be retried',
      retryAction: 'download',
    })
  })

  it.each(['ready', 'needs-repair', 'cancelled'] as const)(
    'allows installation after an Agent run reaches %s',
    async (status) => {
      store.activeRunStatus = status
      const controller = createDesktopUpdateOrchestrator({
        prepareRecoverySnapshot: async () => true,
        storage: { getItem: () => null, setItem: () => {} },
        getAppVersion: async () => '3.4.5',
      })
      await controller.initialize()
      await controller.check()
      await controller.download()
      await controller.install()
      expect(runtime.installAndRelaunch).toHaveBeenCalledOnce()
    },
  )

  it('blocks installation only while an Agent run is running', async () => {
    store.activeRunStatus = 'running'
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '3.4.5',
    })
    await controller.initialize()
    await controller.check()
    await controller.download()
    await controller.install()
    expect(runtime.installAndRelaunch).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      error: 'Finish or stop the active Agent run before restarting.',
      retryAction: 'install',
    })
  })
})
