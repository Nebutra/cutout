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
    expect(workspaceSource).toContain('const PROTOTYPE_QA_CONCURRENCY = 3')
    expect(pageGeneration).toContain('capability: useReferenceEdit ? "edit-image" : "generate-image"')
    expect(pageGeneration).toContain('references: useReferenceEdit ? referenceImages : []')
    expect(pageGeneration).not.toContain('generateWithQa')
    expect(pageGeneration).toContain('await reviewGeneratedImage(')
    expect(pageGeneration).toContain('lease.controller.signal')
    expect(pageGeneration).not.toContain('visualRuntime.execute')
    expect(workspaceSource).toContain('reviewMode: image.providerId === chat.providerId ? "inline" : "overlap"')
    expect(workspaceSource).toContain('reviewConcurrency: PROTOTYPE_QA_CONCURRENCY')
  })

  it('interleaves direct and board work under one global image ceiling', () => {
    const start = workspaceSource.indexOf('const directTasks =')
    const end = workspaceSource.indexOf('const failedProductionRegions =', start)
    const boardProduction = workspaceSource.slice(start, end)

    expect(boardProduction).toContain('interleavePrototypeProductionWork<ProductionWork>(')
    expect(boardProduction).toContain('await schedulePrototypeProductionWork({')
    expect(boardProduction).toContain('concurrency: PROTOTYPE_GENERATION_CONCURRENCY')
    expect(boardProduction).toContain('PROTOTYPE_BOARD_GROUP_CONCURRENCY_PER_PAGE')
    expect(boardProduction).toContain('designSystem.bytes')
    expect(boardProduction).toContain('anchorPage.bytes')
    expect(boardProduction).not.toContain('textFreeSource')
  })

  it('does not truncate Agent-authored routes or cancel independent suite siblings', () => {
    expect(workspaceSource).not.toContain('pages.slice(0, 6)')
    expect(workspaceSource).not.toContain('cancelUnstartedPrototypeSuiteCandidates(')
    expect(workspaceSource).toContain('if (left.directionId === selectedDirectionId) return -1')
    expect(workspaceSource).toContain('nameRegion: (boardBytes, slices, context, signal) =>')
    expect(workspaceSource).not.toContain('nameRegion: options.resumePrototypeSuiteCandidates')
  })
})
