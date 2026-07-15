import { describe, expect, it } from 'vitest'
import { parseEditableDesignMarkdown } from '@/prototype/design-md'
import { astryxThemeTool, configurePageTargetingTool, NO_ARG_TOOL_FACTORIES } from './tool-registry'

const SAMPLE_PAGES = [
  { id: 'page-1', name: 'Login' },
  { id: 'page-2', name: 'Settings' },
  { id: 'page-3', name: 'Login' },
]

describe('tool-registry completeness', () => {
  it('every no-arg tool has isReadOnly set and a non-empty description', () => {
    for (const factory of NO_ARG_TOOL_FACTORIES) {
      const tool = factory()
      expect(tool.name.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.isReadOnly).toBe(true)
    }
  })

  it('astryxThemeTool has isReadOnly set and a non-empty description', () => {
    const model = parseEditableDesignMarkdown('- Primary: #beff50')
    const tool = astryxThemeTool(model)
    expect(tool.name.length).toBeGreaterThan(0)
    expect(tool.description.length).toBeGreaterThan(0)
    expect(tool.isReadOnly).toBe(true)
  })

  it('configurePageTargetingTool has isReadOnly set and a non-empty description', () => {
    const tool = configurePageTargetingTool(SAMPLE_PAGES)
    expect(tool.name.length).toBeGreaterThan(0)
    expect(tool.description.length).toBeGreaterThan(0)
    expect(tool.isReadOnly).toBe(true)
  })

  it('every tool name is unique', () => {
    const model = parseEditableDesignMarkdown('- Primary: #beff50')
    const names = [
      astryxThemeTool(model),
      configurePageTargetingTool(SAMPLE_PAGES),
      ...NO_ARG_TOOL_FACTORIES.map((factory) => factory()),
    ].map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
