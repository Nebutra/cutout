import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

describe('Commerce production Host source boundary', () => {
  it('keeps runner and session orchestration free of direct Tauri invocation', async () => {
    const [runner, session, heldOut] = await Promise.all([
      source('./production-runner.ts'),
      source('./production-session.ts'),
      source('./held-out.ts'),
    ])
    for (const value of [runner, session, heldOut]) {
      expect(value).not.toContain('@tauri-apps/api/core')
      expect(value).not.toMatch(/\binvoke\s*\(/u)
    }
    for (const method of [
      'host.preflightProvider',
      'host.createCommitment',
      'host.ingestSource',
      'host.structuredText',
      'host.image',
      'host.visionJson',
      'host.video',
      'host.verify',
    ]) {
      expect(runner).toContain(method)
    }
    expect(session).toContain('host: input.host ?? createCommerceProductionDesktopHost()')
    expect(heldOut).toContain('input.host.admit')
  })

  it('builds the native operator Host only after clearing every Tauri window', async () => {
    const nativeHost = await source('../../src-tauri/src/commerce_operator_native.rs')
    const clear = nativeHost.indexOf('context.config_mut().app.windows.clear();')
    const build = nativeHost.indexOf('.build(context)')
    expect(clear).toBeGreaterThan(0)
    expect(build).toBeGreaterThan(clear)
    expect(nativeHost).not.toContain('WebviewWindowBuilder')
    expect(nativeHost).not.toContain('get_webview_window')
  })

  it('does not add Commerce operator commands to cutout.control.v1 CLI or MCP', async () => {
    const [cli, mcp, capabilities] = await Promise.all([
      readFile(resolve('scripts/cutout.mjs'), 'utf8'),
      readFile(resolve('scripts/cutout-mcp-server.mjs'), 'utf8'),
      readFile(resolve('cutout.agent-capabilities.json'), 'utf8'),
    ])
    expect(cli).not.toContain('commerce-operator')
    expect(mcp).not.toContain('commerce-operator')
    const manifest = JSON.parse(capabilities) as {
      cli: { commands: string[] }
      mcp: { tools: string[] }
    }
    expect(manifest.cli.commands).not.toContain('commerce-operator')
    expect(manifest.mcp.tools).not.toContain('commerce-operator')
  })
})
