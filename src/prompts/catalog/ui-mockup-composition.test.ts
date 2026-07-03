import { describe, it, expect } from 'vitest'
import { createBuiltinRegistry } from './index'
import { uiMockupComposition } from './ui-mockup-composition'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { render } from '../render'

describe('ui-mockup-composition v1.0.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiMockupComposition.id).toBe('ui-mockup-composition')
    expect(uiMockupComposition.version).toBe('1.0.0')
    expect(uiMockupComposition.scenario).toBe('composition')
    expect(uiMockupComposition.hints).toEqual({
      modality: 'image-generation',
      temperature: 0.7,
    })
  })

  it('renders the verbatim system instruction (distinctive substrings)', () => {
    const out = render(uiMockupComposition, {})
    // Distinctive verbatim fragments — persona, goal, and a forbidden-behavior.
    expect(out.system).toContain('Senior UI Composition Designer')
    expect(out.system).toContain('one clean, high-fidelity UI page mockup')
    expect(out.system).toContain('Do NOT output the asset sheet again')
    // v1 has no template variables.
    expect(out.userScaffold).toBeUndefined()
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-mockup-composition').version).toBe('1.0.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-mockup-composition')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-mockup-composition' })
    expect(rendered.system).toContain('Senior UI Composition Designer')

    const versions = await service.versions('ui-mockup-composition')
    expect(versions).toEqual(['1.0.0'])
  })
})
