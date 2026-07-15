import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AppShell workspace surface routing', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/AppShell.tsx'), 'utf8')

  it('renders Deliver in the project main surface and restricts the dialog to inspectors', () => {
    expect(source).toContain('workspaceSurface.surface === "inline-main"')
    expect(source).toContain('surfaceMode="deliver"')
    expect(source).toContain('designOsOpen && workspaceSurface.surface === "canvas-inspector"')
    expect(source).toContain('data-slot="project-workspace-surface"')
    expect(source).toContain('inert={Boolean(inlineDeliveryTab)}')
    expect(source).toContain('returnFromDeliver({ current: workspaceNavigation')
  })
})
