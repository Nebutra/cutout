import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('packaged E2E Provider registry provisioning', () => {
  it('copies only sanitized metadata between fixed canonical locations', async () => {
    const script = await readFile('scripts/provision-packaged-e2e-provider-registry.sh', 'utf8')

    expect(script).toContain('com.nebutra.cutout/providers.json')
    expect(script).toContain('stage-packaged-e2e-provider-registry.mjs')
    expect(script).toContain('stageProviderRegistry(source, destination)')
    expect(script).toContain('/private/tmp/cutout-packaged-e2e-provider-registry.json')
    expect(script).toContain('Usage: $0 <provision|delete> <user@host>')
    expect(script).not.toMatch(/find-generic-password|dump-keychain|api[_-]?key|credential/i)
    expect(script).not.toContain('HOME=')
  })
})
