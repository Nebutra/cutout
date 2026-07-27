import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import { discoverLocalAgentInventory } from './local-agent-inventory'

interface NativeInventoryFixture {
  id: string
  displayName: string
  cliAliases: string[]
  provenance: {
    catalog: string
    slug: string
    reviewedAt: string
  }
  installation: {
    status: string
    executableAlias?: string
  }
  configRoots: Array<{
    label: string
    status: string
    markers: string[]
  }>
  capabilities: {
    credentialAdapter: string
    sessionDelegation: string
  }
}

const LOCAL_AGENT_IDS = [
  'claude-code', 'codex', 'opencode', 'copilot', 'omp', 'pi', 'cursor',
  'gemini', 'hermes', 'qwen-code', 'kimi', 'amp', 'auggie', 'cline',
  'codebuddy', 'cortex-code', 'corust', 'crow', 'deepagents', 'deepseek-tui',
  'dimcode', 'dirac', 'factory-droid', 'fast-agent', 'glm', 'goose', 'junie',
  'kilo', 'minion-code', 'mistral-vibe', 'nova', 'poolside', 'qoder', 'sigit',
  'stakpak', 'vtcode', 'agoragentic', 'autohand', 'grok',
] as const

function row(id: string): NativeInventoryFixture {
  return {
    id,
    displayName: `Agent ${id}`,
    cliAliases: [id],
    provenance: {
      catalog: 'Paseo 39-Agent catalog',
      slug: id,
      reviewedAt: '2026-07-27',
    },
    installation: { status: 'not-installed' },
    configRoots: [],
    capabilities: {
      credentialAdapter: 'unsupported',
      sessionDelegation: 'unsupported',
    },
  }
}

describe('local Agent inventory native contract', () => {
  beforeEach(() => invokeMock.mockReset())

  it('accepts exactly 39 sanitized and unique rows', async () => {
    const rows = LOCAL_AGENT_IDS.map(row)
    invokeMock.mockResolvedValueOnce(rows)

    await expect(discoverLocalAgentInventory()).resolves.toEqual(rows)
    expect(invokeMock).toHaveBeenCalledWith('discover_local_agent_inventory')
  })

  it('rejects secret-bearing, path-bearing, and unknown native fields', async () => {
    const rows = LOCAL_AGENT_IDS.map(row)
    rows[0] = {
      ...rows[0],
      apiKey: 'must-not-cross-ipc',
      executablePath: '/Users/person/.local/bin/agent',
    } as typeof rows[number]
    invokeMock.mockResolvedValueOnce(rows)

    await expect(discoverLocalAgentInventory()).rejects.toThrow()
  })

  it('rejects duplicate IDs and incomplete registries', async () => {
    const rows = LOCAL_AGENT_IDS.map(row)
    rows[38] = row('claude-code')
    invokeMock.mockResolvedValueOnce(rows)
    await expect(discoverLocalAgentInventory()).rejects.toThrow('duplicate IDs')

    invokeMock.mockResolvedValueOnce(rows.slice(0, 38))
    await expect(discoverLocalAgentInventory()).rejects.toThrow()
  })

  it('accepts sanitized root and capability states', async () => {
    const rows = LOCAL_AGENT_IDS.map(row)
    rows[0] = {
      ...rows[0],
      cliAliases: ['claude'],
      installation: { status: 'installed', executableAlias: 'claude' },
      configRoots: [{
        label: '$CLAUDE_CONFIG_DIR',
        status: 'found',
        markers: ['$CLAUDE_CONFIG_DIR/settings.json'],
      }],
      capabilities: {
        credentialAdapter: 'supported',
        sessionDelegation: 'unsupported',
      },
    }
    invokeMock.mockResolvedValueOnce(rows)

    await expect(discoverLocalAgentInventory()).resolves.toEqual(rows)
  })

  it('rejects catalog drift and inconsistent sanitized relationships', async () => {
    const reordered = LOCAL_AGENT_IDS.map(row)
    ;[reordered[0], reordered[1]] = [reordered[1], reordered[0]]
    invokeMock.mockResolvedValueOnce(reordered)
    await expect(discoverLocalAgentInventory()).rejects.toThrow('pinned catalog')

    const mismatched = LOCAL_AGENT_IDS.map(row)
    mismatched[0] = {
      ...mismatched[0],
      provenance: { ...mismatched[0].provenance, slug: 'codex' },
      installation: { status: 'installed', executableAlias: 'not-registered' },
      configRoots: [{
        label: '~/.claude',
        status: 'found',
        markers: ['~/.codex/auth.json'],
      }],
    }
    invokeMock.mockResolvedValueOnce(mismatched)
    await expect(discoverLocalAgentInventory()).rejects.toThrow()
  })
})
