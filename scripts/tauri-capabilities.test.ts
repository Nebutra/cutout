import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

type Capability = {
  identifier: string
  windows: string[]
  permissions: string[]
}

const root = process.cwd()

async function readCapability(name: string): Promise<Capability> {
  return JSON.parse(
    await readFile(`${root}/src-tauri/capabilities/${name}.json`, 'utf8'),
  ) as Capability
}

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(`${root}/${path}`, 'utf8')
}

const expectedMainWindowPermissions = [
  'core:app:allow-version',
  'core:event:allow-listen',
  'core:event:allow-unlisten',
  'os:allow-locale',
  'store:allow-load',
  'store:allow-get',
  'store:allow-set',
  'store:allow-delete',
  'store:allow-save',
]

describe('Tauri capability least privilege contract', () => {
  it('keeps the main-window native surface on the reviewed command allowlist', async () => {
    const capability = await readCapability('default')

    expect(capability.identifier).toBe('default')
    expect(capability.windows).toEqual(['main'])
    expect(capability.permissions).toEqual(expectedMainWindowPermissions)
  })

  it('does not reintroduce broad plugin defaults or direct filesystem/dialog access', async () => {
    const capabilities = await Promise.all(
      ['default', 'updater'].map(readCapability),
    )
    const permissions = capabilities.flatMap((capability) => capability.permissions)

    expect(permissions.filter((permission) => permission.endsWith(':default'))).toEqual([])
    expect(permissions.filter((permission) => /^(?:fs|dialog):/.test(permission))).toEqual([])
  })

  it('keeps the retired GUI Queue out of native modules, handlers and permissions', async () => {
    const sources = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
    ])

    for (const source of sources) {
      expect(source).not.toMatch(/\bai_native(?:_|::)/)
    }
    expect(sources[2]).toContain(
      'commands.allow = ["save_assets", "save_bundle", "scan_repository"]',
    )
  })

  it('registers foreground segmentation as a narrow desktop capability', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod foreground_segmentation;')
    expect(handlers).toContain('foreground_segmentation_capabilities')
    expect(handlers).toContain('foreground_segment')
    expect(permissions).toContain('identifier = "foreground-segmentation"')
    expect(desktopCapability.permissions).toContain('foreground-segmentation')
  })

  it('registers the closed Codex planning runtime without generic process authority', async () => {
    const [modules, handlers, permissions, desktopCapability] = await Promise.all([
      readRepositoryFile('src-tauri/src/commands/ai/mod.rs'),
      readRepositoryFile('src-tauri/src/lib.rs'),
      readRepositoryFile('src-tauri/permissions/application.toml'),
      readCapability('updater'),
    ])

    expect(modules).toContain('pub mod codex_system;')
    expect(handlers).toContain('codex_system_probe')
    expect(permissions).toContain('identifier = "codex-system-runtime"')
    expect(handlers).toContain('codex_system_turn_start')
    expect(handlers).toContain('codex_system_turn_steer')
    expect(handlers).toContain('codex_system_turn_interrupt')
    expect(handlers).toContain('codex_system_conversation_reset')
    expect(permissions).toContain('"codex_system_turn_start"')
    expect(permissions).toContain('"codex_system_turn_interrupt"')
    expect(desktopCapability.permissions).toContain('codex-system-runtime')
    expect(handlers).not.toContain('codex_system_bind_conversation')
    expect(permissions).not.toMatch(/codex_system_(?:exec|spawn|shell)/)
  })
})
