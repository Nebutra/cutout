import { describe, expect, it } from 'vitest'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { createBuiltinRegistry } from './index'
import { uiPrototypePlanner } from './ui-prototype-planner'
import { render } from '../render'

describe('ui-prototype-planner v1.1.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiPrototypePlanner.id).toBe('ui-prototype-planner')
    expect(uiPrototypePlanner.version).toBe('1.1.0')
    expect(uiPrototypePlanner.scenario).toBe('prototype-planning')
    expect(uiPrototypePlanner.hints).toEqual({
      modality: 'text',
      temperature: 0.25,
    })
  })

  it('renders the prototype graph planning rules', () => {
    const out = render(uiPrototypePlanner, {})

    expect(out.system).toContain('Senior Prototype Architect')
    expect(out.system).toContain('prototype graph')
    expect(out.system).toContain('water-shaped')
    expect(out.system).toContain('Scene-native professionalism')
    expect(out.system).toContain('every page must be reachable')
    expect(out.system).toContain('shared design system')
    expect(out.system).toContain('recursive-region')
    expect(out.system).toContain('Asset routing')
    expect(out.system).toContain('"direct-generate"')
    expect(out.system).toContain('"board-cutout"')
    expect(out.system).toContain('"ignore-code-ui"')
    expect(out.system).toContain('Human-in-the-loop is dynamic')
    expect(out.system).toContain('humanLoop.mode')
    expect(out.system).toContain('PrototypePlan')
    expect(out.userScaffold).toBeUndefined()
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-prototype-planner').version).toBe('1.1.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-prototype-planner')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-prototype-planner' })
    expect(rendered.system).toContain('Senior Prototype Architect')

    const versions = await service.versions('ui-prototype-planner')
    expect(versions).toEqual(['1.1.0'])
  })
})
