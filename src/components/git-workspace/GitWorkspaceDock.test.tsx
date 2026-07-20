import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsUIProvider } from '@/components/settings/settings-ui'

const { bridge, openSettings } = vi.hoisted(() => ({
  openSettings: vi.fn(),
  bridge: {
    authorizeWorkspace: vi.fn(),
    gitCapability: vi.fn(),
    gitStatus: vi.fn(),
    gitLog: vi.fn(),
    gitCommitFiles: vi.fn(),
    gitCommitDiff: vi.fn(),
    gitBranches: vi.fn(),
    gitBranchCompare: vi.fn(),
    gitDiff: vi.fn(),
    gitStage: vi.fn(),
    gitUnstage: vi.fn(),
    gitPreviewMutation: vi.fn(),
    gitApplyMutation: vi.fn(),
    gitPushPreview: vi.fn(),
    gitPush: vi.fn(),
  },
}))

vi.mock('@/platform/authorized-workspace', () => ({
  getAuthorizedWorkspace: () => ({ handle: 'workspace:opaque', label: 'Cutout' }),
  setAuthorizedWorkspace: vi.fn(),
}))
vi.mock('@/platform/native', () => ({ tauriBridge: bridge }))

import { GitWorkspaceDock } from './GitWorkspaceDock'

const status = {
  repositoryId: 'repo.1', snapshotToken: 'snapshot.1', branch: 'main', upstream: 'origin/main',
  ahead: 0, behind: 0, detached: false, files: [],
}

describe('GitWorkspaceDock', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    openSettings.mockReset()
    bridge.gitCapability.mockResolvedValue({ available: true, repository: true })
    bridge.gitStatus.mockResolvedValue(status)
    bridge.gitLog.mockResolvedValue([])
    bridge.gitBranches.mockResolvedValue([])
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it('keeps pull requests unavailable and routes to Integrations', async () => {
    await act(async () => root.render(
      <SettingsUIProvider value={{ open: openSettings }}>
        <GitWorkspaceDock onClose={() => {}} />
      </SettingsUIProvider>,
    ))
    await act(async () => {})

    const prTab = [...host.querySelectorAll('button')].find((button) => button.textContent === 'PRs')
    act(() => prTab?.click())
    const integrations = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Open Integrations')
    expect(host.textContent).toContain('Pull requests require a verified GitHub Host session')
    act(() => integrations?.click())
    expect(openSettings).toHaveBeenCalledWith({ section: 'integrations', anchor: 'connections' })
  })

  it('requests older history with an offset', async () => {
    const commits = Array.from({ length: 100 }, (_, index) => ({
      oid: `oid-${index}`, shortOid: `${index}`, parents: [], author: 'Ada',
      authoredAt: '2026-07-20T10:00:00+08:00', decorations: [], subject: `Commit ${index}`,
    }))
    bridge.gitLog.mockResolvedValueOnce(commits).mockResolvedValueOnce([])
    await act(async () => root.render(
      <SettingsUIProvider value={{ open: openSettings }}>
        <GitWorkspaceDock onClose={() => {}} />
      </SettingsUIProvider>,
    ))
    await act(async () => {})

    const historyTab = [...host.querySelectorAll('button')].find((button) => button.textContent === 'History')
    act(() => historyTab?.click())
    const loadMore = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Load older commits'))
    await act(async () => loadMore?.click())
    expect(bridge.gitLog).toHaveBeenLastCalledWith('workspace:opaque', 100, 100)
  })

  it('stops after capability detection when the workspace is not a repository', async () => {
    bridge.gitCapability.mockResolvedValue({
      available: true,
      repository: false,
      message: 'The authorized folder is not a Git repository.',
    })

    await act(async () => root.render(
      <SettingsUIProvider value={{ open: openSettings }}>
        <GitWorkspaceDock onClose={() => {}} />
      </SettingsUIProvider>,
    ))
    await act(async () => {})

    expect(host.textContent).toContain('not a Git repository')
    expect(bridge.gitStatus).not.toHaveBeenCalled()
    expect(bridge.gitLog).not.toHaveBeenCalled()
    expect(bridge.gitBranches).not.toHaveBeenCalled()
  })

  it('requires preview confirmation before applying a commit', async () => {
    const stagedStatus = {
      ...status,
      files: [{ path: 'src/app.tsx', originalPath: null, indexStatus: 'M', worktreeStatus: ' ', conflicted: false }],
    }
    bridge.gitStatus.mockResolvedValue(stagedStatus)
    bridge.gitPreviewMutation.mockResolvedValue({
      planId: 'mutation.1',
      repositoryId: 'repo.1',
      snapshotToken: 'snapshot.1',
      mutation: { kind: 'commit', message: 'Ship it' },
      warnings: [],
    })
    bridge.gitApplyMutation.mockResolvedValue({ planId: 'mutation.1', operation: 'commit', status })

    await act(async () => root.render(
      <SettingsUIProvider value={{ open: openSettings }}>
        <GitWorkspaceDock onClose={() => {}} />
      </SettingsUIProvider>,
    ))
    await act(async () => {})

    const textarea = host.querySelector('textarea')
    expect(textarea).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, 'Ship it')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const review = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Review commit'))
    await act(async () => review?.click())

    expect(bridge.gitPreviewMutation).toHaveBeenCalledWith('workspace:opaque', 'snapshot.1', { kind: 'commit', message: 'Ship it' })
    expect(bridge.gitApplyMutation).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Commit staged changes?')
  })
})
