import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNodeFsRuntimeStore, type HeadlessProjectState } from '@/headless'

function projectState(): HeadlessProjectState {
  return {
    manifest: {
      version: 'cutout.manifest.v1',
      project: { id: 'plugin-project', name: 'Plugin Project' },
      files: {
        designIr: 'design-ir.json', designMarkdown: 'DESIGN.md', artifactIndex: 'artifacts.json',
        policy: 'policy.json', controlLedger: 'control-ledger.json',
      },
    },
    design: {
      version: 'design-ir.v1',
      meta: { id: 'plugin-project', title: 'Plugin Project', createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z' },
      revision: { id: 'plugin-r1', number: 1, createdAt: '2026-07-18T00:00:00.000Z', author: { kind: 'human', id: 'tester' } },
      needs: [], sources: [], brands: [], tokens: [], components: [], materials: [], provenance: [], relations: [],
    },
    designMarkdown: '# Plugin Project',
    artifactIndex: { version: 'cutout.artifacts.v1', artifacts: [] },
    policy: {
      version: 'cutout.policy.v1', allowApply: false, allowedOperations: ['project.context', 'material.list', 'validate'],
      requireApprovalForExternal: true,
    },
  }
}

function startMcp(projectRoot?: string, entry = 'plugins/cutout/runtime/cutout-mcp.mjs') {
  const env = { ...process.env }
  if (projectRoot) env.CUTOUT_PROJECT_ROOT = projectRoot
  else delete env.CUTOUT_PROJECT_ROOT
  const child = spawn(process.execPath, [entry], { cwd: process.cwd(), env })
  const pending = new Map<number, (message: Record<string, unknown>) => void>()
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk)
    let newline
    while ((newline = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, newline).trim()
      stdout = stdout.slice(newline + 1)
      if (!line) continue
      const message = JSON.parse(line) as { id?: number }
      if (typeof message.id === 'number') {
        pending.get(message.id)?.(message)
        pending.delete(message.id)
      }
    }
  })
  return {
    call(id: number, method: string, params?: unknown) {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        pending.set(id, resolve)
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`)
        setTimeout(() => {
          if (!pending.delete(id)) return
          reject(new Error(`Bundled MCP timed out: ${stderr}`))
        }, 10_000).unref()
      })
    },
    close: () => closeChild(child),
  }
}

describe('Cutout Codex plugin runtime', () => {
  it('keeps discovery available and fails project tools closed without a host binding', async () => {
    const mcp = startMcp()
    try {
      const initialized = await mcp.call(1, 'initialize', {})
      const tools = await mcp.call(2, 'tools/list', {})
      const capabilities = await mcp.call(3, 'tools/call', { name: 'cutout_capabilities_status', arguments: {} })
      const skill = await mcp.call(4, 'tools/call', { name: 'cutout_skill_read', arguments: { skillId: 'design-system-kit', section: 'reference' } })
      const handshake = await mcp.call(5, 'tools/call', { name: 'cutout_controller_handshake', arguments: { clientName: 'Codex' } })

      expect(initialized).toMatchObject({ result: { serverInfo: { name: 'cutout-headless' } } })
      expect(tools).toMatchObject({ result: { tools: expect.arrayContaining([expect.objectContaining({ name: 'cutout_validate' })]) } })
      expect(capabilities).toMatchObject({ result: { isError: false, structuredContent: { ok: true } } })
      expect(skill).toMatchObject({ result: { isError: false, structuredContent: { skill: { id: 'design-system-kit', section: 'reference', content: expect.stringContaining('Design System Kit') } } } })
      expect(handshake).toMatchObject({ result: { isError: true, structuredContent: { error: { code: 'project-binding-required' } } } })
    } finally {
      await mcp.close()
    }
  })

  it('loads and validates a bound project without the source checkout runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-plugin-'))
    await createNodeFsRuntimeStore(root).save(projectState())
    const mcp = startMcp(root)
    try {
      const handshake = await mcp.call(1, 'tools/call', { name: 'cutout_controller_handshake', arguments: { clientName: 'Codex' } })
      const validation = await mcp.call(2, 'tools/call', { name: 'cutout_validate', arguments: { scope: ['design', 'tokens', 'materials'] } })
      expect(handshake).toMatchObject({ result: { isError: false, structuredContent: { response: { protocol: 'cutout.external-controller.v1', binding: { rootOwnedByHost: true } } } } })
      expect(validation).toMatchObject({ result: { isError: false, structuredContent: { response: { result: { valid: true } } } } })
    } finally {
      await mcp.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the source stdio entry fail-closed when cwd is a valid project', async () => {
    const mcp = startMcp(undefined, 'scripts/cutout-mcp.mjs')
    try {
      const handshake = await mcp.call(1, 'tools/call', { name: 'cutout_controller_handshake', arguments: { clientName: 'Codex' } })
      expect(handshake).toMatchObject({ result: { isError: true, structuredContent: { error: { code: 'project-binding-required' } } } })
    } finally {
      await mcp.close()
    }
  })
})

function closeChild(child: ChildProcessWithoutNullStreams) {
  child.stdin.end()
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once('close', () => resolve())
  })
}
