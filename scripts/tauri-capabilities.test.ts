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
})
