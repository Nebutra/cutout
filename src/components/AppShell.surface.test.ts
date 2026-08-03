import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AppShell workspace surface routing', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/AppShell.tsx'), 'utf8')
  const workspaceSource = readFileSync(join(process.cwd(), 'src/components/workspace/IntentWorkspace.tsx'), 'utf8')

  it('keeps Deliver inline and System progressively disclosed', () => {
    expect(source).toContain('workspaceSurface.surface === "inline-main"')
    expect(source).toContain('surfaceMode="deliver"')
    expect(source).toContain('<Dialog open={designOsOpen} onOpenChange={setDesignOsOpen}>')
    expect(source).toContain('<DialogTitle>System inspector</DialogTitle>')
    expect(source).not.toContain('designOsOpen && workspaceSurface.surface === "canvas-inspector"')
    expect(workspaceSource).toContain('Open system inspector')
    expect(workspaceSource).not.toContain('onOpenTools')
    expect(source).not.toContain('DeveloperAuditDialog')
    expect(source).not.toContain('advancedAuditOpen')
    expect(source).toContain('data-slot="project-workspace-surface"')
    expect(source).toContain('inert={Boolean(inlineDeliveryTab)}')
    expect(source).toContain('returnFromDeliver({ current: workspaceNavigation')
  })
})
