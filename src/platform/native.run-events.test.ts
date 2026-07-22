import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { tauriBridge } from './native'

describe('native Agent run-event store transport', () => {
  beforeEach(() => invoke.mockReset())

  it('passes only an opaque handle to the fixed-path read command', async () => {
    invoke.mockResolvedValue({ store: {}, sha256: null, exists: false })

    await tauriBridge.readRunEventStore?.('workspace.opaque')

    expect(invoke).toHaveBeenCalledWith('workspace_run_events_read', {
      workspaceHandle: 'workspace.opaque',
    })
  })

  it('passes the expected digest and store without accepting a caller path', async () => {
    const store = {
      version: 'agent-run-events.v1',
      activeRunId: null,
      events: [],
      activeRun: null,
    }
    invoke.mockResolvedValue({ store, sha256: 'a'.repeat(64), exists: true })

    await tauriBridge.writeRunEventStore?.('workspace.opaque', null, store)

    expect(invoke).toHaveBeenCalledWith('workspace_run_events_write', {
      workspaceHandle: 'workspace.opaque',
      expectedSha256: null,
      store,
    })
  })
})
