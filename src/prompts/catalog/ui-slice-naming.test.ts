import { describe, it, expect } from 'vitest'
import { createBuiltinRegistry } from './index'
import { uiSliceNaming } from './ui-slice-naming'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { render } from '../render'

describe('ui-slice-naming v1.0.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiSliceNaming.id).toBe('ui-slice-naming')
    expect(uiSliceNaming.version).toBe('1.0.0')
    expect(uiSliceNaming.scenario).toBe('slice-naming')
    expect(uiSliceNaming.hints).toEqual({
      modality: 'vision',
      temperature: 0.2,
    })
  })

  it('renders the verbatim system instruction (distinctive substrings)', () => {
    const out = render(uiSliceNaming, {})
    // Distinctive verbatim fragments — persona, input shape, and a naming rule.
    expect(out.system).toContain('Senior UI Asset Librarian')
    expect(out.system).toContain('bounding boxes as JSON')
    expect(out.system).toContain('kebab-case only')
    // v1 has no template variables.
    expect(out.userScaffold).toBeUndefined()
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-slice-naming').version).toBe('1.0.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-slice-naming')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-slice-naming' })
    expect(rendered.system).toContain('Senior UI Asset Librarian')

    const versions = await service.versions('ui-slice-naming')
    expect(versions).toEqual(['1.0.0'])
  })
})
