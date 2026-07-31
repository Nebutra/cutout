import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceSource = readFileSync(
  resolve(process.cwd(), 'src/components/workspace/IntentWorkspace.tsx'),
  'utf8',
)

describe('prototype production throughput wiring', () => {
  it('keeps page QA observational and one paid page invocation per attempt', () => {
    const start = workspaceSource.indexOf('async function generatePrototypePage(')
    const end = workspaceSource.indexOf('async function invokeDesktopImageTool(', start)
    const pageGeneration = workspaceSource.slice(start, end)

    expect(workspaceSource).toContain('const PROTOTYPE_QA_MAX_RETRIES = 0')
    expect(pageGeneration).toContain('capability: useReferenceEdit ? "edit-image" : "generate-image"')
    expect(pageGeneration).toContain('references: useReferenceEdit ? referenceImages : []')
    expect(pageGeneration).not.toContain('visualRuntime.execute')
  })

  it('bounds board context and produces pages concurrently without a text-free paid prepass', () => {
    const start = workspaceSource.indexOf('const extractionTargets =')
    const end = workspaceSource.indexOf('const failedProductionRegions =', start)
    const boardProduction = workspaceSource.slice(start, end)

    expect(boardProduction).toContain('await forEachConcurrent(')
    expect(boardProduction).toContain('PROTOTYPE_BOARD_PAGE_CONCURRENCY')
    expect(boardProduction).toContain('PROTOTYPE_BOARD_GROUP_CONCURRENCY_PER_PAGE')
    expect(boardProduction).toContain('designSystem.bytes')
    expect(boardProduction).toContain('anchorPage.bytes')
    expect(boardProduction).not.toContain('textFreeSource')
  })

  it('does not truncate Agent-authored routes and scopes strict suite fail-fast to packaged E2E', () => {
    expect(workspaceSource).not.toContain('pages.slice(0, 6)')
    expect(workspaceSource).toContain('import.meta.env.VITE_CUTOUT_PACKAGED_E2E === "1"')
    expect(workspaceSource).toContain('cancelUnstartedPrototypeSuiteCandidates(')
  })
})
