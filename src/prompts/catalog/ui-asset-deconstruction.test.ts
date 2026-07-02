import { describe, it, expect } from 'vitest'
import { createBuiltinRegistry } from './index'
import { uiAssetDeconstruction } from './ui-asset-deconstruction'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { render } from '../render'

describe('ui-asset-deconstruction v1.0.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiAssetDeconstruction.id).toBe('ui-asset-deconstruction')
    expect(uiAssetDeconstruction.version).toBe('1.0.0')
    expect(uiAssetDeconstruction.scenario).toBe('ui-deconstruction')
    expect(uiAssetDeconstruction.hints).toEqual({
      modality: 'image-generation',
      kind: 'google',
      temperature: 0.4,
    })
  })

  it('renders the verbatim system instruction (distinctive substrings)', () => {
    const out = render(uiAssetDeconstruction, {})
    // Distinctive verbatim fragments — persona, goal, and a forbidden-behavior.
    expect(out.system).toContain(
      'Senior UI Asset Deconstruction Artist',
    )
    expect(out.system).toContain('UI Asset Sheet / Design Decomposition Board')
    expect(out.system).toContain('Do NOT generate a complete UI page')
    expect(out.system).toContain('soft matte green/neutral studio background')
    // v1 has no template variables.
    expect(out.userScaffold).toBeUndefined()
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-asset-deconstruction').version).toBe('1.0.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-asset-deconstruction')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-asset-deconstruction' })
    expect(rendered.system).toContain('Senior UI Asset Deconstruction Artist')

    const versions = await service.versions('ui-asset-deconstruction')
    expect(versions).toEqual(['1.0.0'])
  })
})
