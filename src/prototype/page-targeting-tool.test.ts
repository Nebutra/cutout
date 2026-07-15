import { describe, expect, it } from 'vitest'
import { configurePageTargetingTool } from './page-targeting-tool'

const PAGES = [
  { id: 'page-1', name: 'Login' },
  { id: 'page-2', name: 'Settings' },
  { id: 'page-3', name: 'Dashboard' },
]

describe('configurePageTargetingTool', () => {
  it('resolves selected page names to ids', async () => {
    const tool = configurePageTargetingTool(PAGES)
    const input = tool.inputSchema.parse({ pageNames: ['Login', 'Dashboard'] })
    await expect(tool.execute(input)).resolves.toEqual({
      targetPageIds: ['page-1', 'page-3'],
      targetPageNames: ['Login', 'Dashboard'],
    })
  })

  it('rejects a page name not in the current list', () => {
    const tool = configurePageTargetingTool(PAGES)
    const result = tool.inputSchema.safeParse({ pageNames: ['Nonexistent'] })
    expect(result.success).toBe(false)
  })

  it('rejects an empty selection', () => {
    const tool = configurePageTargetingTool(PAGES)
    const result = tool.inputSchema.safeParse({ pageNames: [] })
    expect(result.success).toBe(false)
  })

  it('is isReadOnly with a non-empty name and description', () => {
    const tool = configurePageTargetingTool(PAGES)
    expect(tool.isReadOnly).toBe(true)
    expect(tool.name).toBe('select_pages_to_regenerate')
    expect(tool.description.length).toBeGreaterThan(0)
  })
})
