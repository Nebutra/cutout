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

  it('maps the native localized release-note projection without parsing raw updater data', async () => {
    runtime.check.mockResolvedValueOnce({
      phase: 'available',
      downloadedBytes: 0,
      availableVersion: '0.1.16',
      releaseNotes: 'Readable English fallback.',
      localizedReleaseNotes: {
        protocol: 'cutout.release-notes.v1',
        version: '0.1.16',
        releasedOn: '2026-08-03',
        locales: {
          en: {
            headline: 'Know what changed',
            highlights: [{ id: 'details', title: 'Review details', body: 'Read before installing.' }],
          },
        },
      },
    })
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '0.1.15',
    })
    await controller.initialize()
    await controller.check()
    expect(controller.getState().release).toMatchObject({
      version: '0.1.16',
      notes: 'Readable English fallback.',
      localizedNotes: { version: '0.1.16', locales: { en: { headline: 'Know what changed' } } },
    })
  })

  it('drops an invalid native localized projection without hiding the English fallback', async () => {
    runtime.check.mockResolvedValueOnce({
      phase: 'available',
      downloadedBytes: 0,
      availableVersion: '0.1.16',
      releaseNotes: 'Readable English fallback.',
      localizedReleaseNotes: {
        protocol: 'cutout.release-notes.v1',
        version: '0.1.16',
        releasedOn: '2026-08-03',
        locales: {
          en: {
            headline: 'Know what changed',
            highlights: [{ id: 'details', title: 'Review details', body: '<strong>unsafe</strong>' }],
          },
        },
      },
    })
    const controller = createDesktopUpdateOrchestrator({
      prepareRecoverySnapshot: async () => true,
      storage: { getItem: () => null, setItem: () => {} },
      getAppVersion: async () => '0.1.15',
    })
    await controller.initialize()
    await controller.check()
    expect(controller.getState().release).toEqual({
      version: '0.1.16',
      notes: 'Readable English fallback.',
    })
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
