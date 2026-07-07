import { describe, it, expect } from 'vitest'
import { createBuiltinRegistry } from './index'
import { uiGraphPlanner } from './ui-graph-planner'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { render } from '../render'

describe('ui-graph-planner v1.1.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiGraphPlanner.id).toBe('ui-graph-planner')
    expect(uiGraphPlanner.version).toBe('1.1.0')
    expect(uiGraphPlanner.scenario).toBe('planning')
    expect(uiGraphPlanner.hints).toEqual({
      modality: 'text',
      temperature: 0.3,
    })
  })

  it('renders the verbatim system instruction (persona, vocabulary, rules)', () => {
    const out = render(uiGraphPlanner, {})
    expect(out.system).toContain('Senior Design-Ops Planner')
    expect(out.system).toContain('GraphSpec')
    // Constrains to the node vocabulary + canonical fan-out topology.
    expect(out.system).toContain('generate-image')
    expect(out.system).toContain('edit-image')
    expect(out.system).toContain('deconstruct')
    expect(out.system).toContain('BOARD-SAFE assets only')
    expect(out.system).toContain('direct-generate')
    expect(out.system).toContain('ignore-code-ui')
    expect(out.system).toContain('cutout')
    expect(out.system).toContain('ACYCLIC')
    // v1.1 shapes the graph from the reconstructed intent (goal/strategy/…).
    expect(out.system).toContain('RECONSTRUCTED INTENT')
    // Still no template variables — the requirement is a call-time text part.
    expect(out.userScaffold).toBeUndefined()
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-graph-planner').version).toBe('1.1.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-graph-planner')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-graph-planner' })
    expect(rendered.system).toContain('Senior Design-Ops Planner')

    const versions = await service.versions('ui-graph-planner')
    expect(versions).toEqual(['1.1.0'])
  })
})
