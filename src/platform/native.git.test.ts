import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { tauriBridge } from './native'

describe('native Git bridge', () => {
  beforeEach(() => invoke.mockReset())

  it('authorizes a repository through the existing workspace picker', async () => {
    invoke.mockResolvedValue({ canceled: false, handle: 'workspace:opaque', label: 'Cutout' })

    await expect(tauriBridge.authorizeWorkspace?.()).resolves.toMatchObject({ handle: 'workspace:opaque' })
    expect(invoke).toHaveBeenCalledWith('registry_authorize_workspace')
  })

  it('passes only opaque handles and typed Git arguments to native commands', async () => {
    invoke.mockResolvedValue({})

    await tauriBridge.gitCapability?.('workspace:opaque')
    await tauriBridge.gitStatus?.('workspace:opaque')
    await tauriBridge.gitLog?.('workspace:opaque', 25, 50)
    await tauriBridge.gitCommitFiles?.('workspace:opaque', 'a'.repeat(40))
    await tauriBridge.gitCommitDiff?.('workspace:opaque', 'a'.repeat(40), 'src/app.tsx')
    await tauriBridge.gitBranches?.('workspace:opaque')
    await tauriBridge.gitBranchCompare?.('workspace:opaque', 'main', 'feature')
    await tauriBridge.gitDiff?.('workspace:opaque', 'src/app.tsx', 'staged')
    await tauriBridge.gitStage?.('workspace:opaque', 'snapshot:1', ['src/app.tsx'])
    await tauriBridge.gitUnstage?.('workspace:opaque', 'snapshot:2', ['src/app.tsx'])
    await tauriBridge.gitPreviewMutation?.('workspace:opaque', 'snapshot:2', { kind: 'commit', message: 'Ship it' })
    await tauriBridge.gitApplyMutation?.('workspace:opaque', 'mutation:opaque')
    await tauriBridge.gitCommit?.('workspace:opaque', 'snapshot:3', 'Ship it')
    await tauriBridge.gitCreateBranch?.('workspace:opaque', 'snapshot:4', 'feature/git')
    await tauriBridge.gitSwitchBranch?.('workspace:opaque', 'snapshot:5', 'main')
    await tauriBridge.gitPushPreview?.('workspace:opaque', 'snapshot:6')
    await tauriBridge.gitPush?.('workspace:opaque', 'push:opaque')

    expect(invoke.mock.calls).toEqual([
      ['git_capability', { workspaceHandle: 'workspace:opaque' }],
      ['git_status', { workspaceHandle: 'workspace:opaque' }],
      ['git_log', { workspaceHandle: 'workspace:opaque', limit: 25, skip: 50 }],
      ['git_commit_files', { workspaceHandle: 'workspace:opaque', oid: 'a'.repeat(40) }],
      ['git_commit_diff', { workspaceHandle: 'workspace:opaque', oid: 'a'.repeat(40), path: 'src/app.tsx' }],
      ['git_branches', { workspaceHandle: 'workspace:opaque' }],
      ['git_branch_compare', { workspaceHandle: 'workspace:opaque', base: 'main', compare: 'feature' }],
      ['git_diff', { workspaceHandle: 'workspace:opaque', path: 'src/app.tsx', target: 'staged' }],
      ['git_stage', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:1', paths: ['src/app.tsx'] }],
      ['git_unstage', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:2', paths: ['src/app.tsx'] }],
      ['git_preview_mutation', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:2', mutation: { kind: 'commit', message: 'Ship it' } }],
      ['git_apply_mutation', { workspaceHandle: 'workspace:opaque', planId: 'mutation:opaque' }],
      ['git_commit', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:3', message: 'Ship it' }],
      ['git_create_branch', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:4', name: 'feature/git' }],
      ['git_switch_branch', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:5', name: 'main' }],
      ['git_push_preview', { workspaceHandle: 'workspace:opaque', expectedSnapshotToken: 'snapshot:6' }],
      ['git_push', { workspaceHandle: 'workspace:opaque', planId: 'push:opaque' }],
    ])
  })
})
