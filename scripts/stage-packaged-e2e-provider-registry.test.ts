import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PACKAGED_E2E_PROVIDER_DISCOVERY_FILE,
  providerRegistryPaths,
  stageProviderRegistry,
} from './stage-packaged-e2e-provider-registry.mjs'

const temporaryRoots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function paths() {
  const root = await mkdtemp(join(tmpdir(), 'cutout-provider-stage-'))
  temporaryRoots.push(root)
  return { source: join(root, 'source.json'), destination: join(root, 'nested', 'providers.json') }
}

describe('packaged E2E Provider registry staging', () => {
  it('keeps discovery metadata separate from the clean E2E Provider registry', () => {
    const paths = providerRegistryPaths('/test-home')

    expect(basename(paths.source)).toBe('providers.json')
    expect(basename(paths.destination)).toBe(PACKAGED_E2E_PROVIDER_DISCOVERY_FILE)
    expect(paths.destination).not.toBe(paths.source)
    expect(paths.destination).not.toMatch(/\/providers\.json$/u)
  })

  it('copies only strict non-secret Provider metadata with explicit wire contracts', async () => {
    const { source, destination } = await paths()
    await writeFile(source, JSON.stringify([
      {
        id: 'legacy', kind: 'openai-compatible', label: 'Legacy',
        baseUrl: 'https://legacy.example', defaultModel: 'gpt-5.5', enabled: true,
      },
      {
        id: 'image', kind: 'openai-compatible', label: 'Image',
        baseUrl: 'https://image.example/v1', wireProtocol: 'chat-completions',
        defaultModel: 'gpt-image-2', enabled: true,
      },
      {
        id: 'secret-bearing', kind: 'openai-compatible', label: 'Unsafe',
        baseUrl: 'https://unsafe.example/v1', wireProtocol: 'chat-completions',
        defaultModel: 'gpt-image-2', enabled: true, apiKey: 'forbidden',
      },
    ]))

    await expect(stageProviderRegistry(source, destination)).resolves.toBe(1)
    const staged = JSON.parse(await readFile(destination, 'utf8'))
    expect(staged).toEqual([expect.objectContaining({ id: 'image' })])
    expect(JSON.stringify(staged)).not.toContain('forbidden')
  })

  it('refuses symlinks, unsafe URLs, duplicate ids, and oversized registries', async () => {
    const { symlink } = await import('node:fs/promises')
    const first = await paths()
    await writeFile(first.source, '[]')
    await symlink(first.source, `${first.source}.link`)
    await expect(stageProviderRegistry(`${first.source}.link`, first.destination)).resolves.toBe(0)

    const unsafe = await paths()
    await writeFile(unsafe.source, JSON.stringify([{
      id: 'image', kind: 'openai-compatible', label: 'Image',
      baseUrl: 'https://user:pass@example.com/v1', wireProtocol: 'chat-completions',
      defaultModel: 'gpt-image-2', enabled: true,
    }]))
    await expect(stageProviderRegistry(unsafe.source, unsafe.destination)).resolves.toBe(0)

    const duplicate = await paths()
    const provider = {
      id: 'image', kind: 'openai-compatible', label: 'Image',
      baseUrl: 'https://image.example/v1', wireProtocol: 'chat-completions',
      defaultModel: 'gpt-image-2', enabled: true,
    }
    await writeFile(duplicate.source, JSON.stringify([provider, provider]))
    await expect(stageProviderRegistry(duplicate.source, duplicate.destination)).resolves.toBe(0)

    const oversized = await paths()
    await writeFile(oversized.source, ' '.repeat(1024 * 1024 + 1))
    await expect(stageProviderRegistry(oversized.source, oversized.destination)).resolves.toBe(0)
  })
})
