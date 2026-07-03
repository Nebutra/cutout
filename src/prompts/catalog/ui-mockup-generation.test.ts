import { describe, it, expect } from 'vitest'
import { createBuiltinRegistry } from './index'
import { uiMockupGeneration } from './ui-mockup-generation'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { render } from '../render'

describe('ui-mockup-generation v1.0.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiMockupGeneration.id).toBe('ui-mockup-generation')
    expect(uiMockupGeneration.version).toBe('1.0.0')
    expect(uiMockupGeneration.scenario).toBe('generation')
    expect(uiMockupGeneration.hints).toEqual({
      modality: 'image-generation',
      temperature: 0.7,
    })
  })

  it('renders the verbatim system instruction (distinctive substrings)', () => {
    const out = render(uiMockupGeneration, {})
    // Distinctive verbatim fragments — persona, goal, and a forbidden-behavior.
    expect(out.system).toContain(
      'Senior Product UI Designer and high-fidelity prototype generator',
    )
    expect(out.system).toContain('one clean, high-fidelity UI page mockup')
    expect(out.system).toContain('Do NOT output multiple screens')
    // v1 has no template variables.
    expect(out.userScaffold).toBeUndefined()
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-mockup-generation').version).toBe('1.0.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-mockup-generation')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-mockup-generation' })
    expect(rendered.system).toContain(
      'Senior Product UI Designer and high-fidelity prototype generator',
    )

    const versions = await service.versions('ui-mockup-generation')
    expect(versions).toEqual(['1.0.0'])
  })
})
