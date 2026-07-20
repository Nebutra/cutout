/**
 * Real-browser proof of the per-region slicing pixel path.
 *
 * `sliceRegionBoardBitmap` (OffscreenCanvas frame extraction + the `runPipeline`
 * CV + PNG crops) cannot run under jsdom, so the vitest unit tests only cover
 * the region orchestration. This Playwright test runs the ACTUAL function in
 * Chromium against a synthetic board with a KNOWN number of separated shapes,
 * proving the whole chain — board bitmap → CV segmentation → region/page-tagged
 * slice blobs — works end to end with real canvas APIs.
 *
 * Deterministic (no model / no network): three well-separated dark squares on
 * a white board must yield exactly three region-tagged slices.
 */
import { test, expect } from '@playwright/test'

test.describe('per-region board slicing (real browser CV)', () => {
  test('segments a synthetic region board into region-tagged slices', async ({ page }) => {
    // A blank Vite-served page (not the app root, whose boot navigation would
    // destroy the evaluate context) — Vite still resolves the /src import.
    await page.goto('/tests/visual/region-slicing-harness.html')

    const result = await page.evaluate(async () => {
      const { sliceRegionBoardBitmap } = await import(
        '/src/prototype/region-deconstruct.ts'
      )

      // A white board with three well-separated dark squares — each square is
      // one "asset". Squares are 80x80 (area 6400 > minArea 900) and >18px
      // apart (> mergeGap), so CV must resolve exactly three components.
      const size = 512
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = '#202024'
      ctx.fillRect(60, 60, 80, 80)
      ctx.fillRect(360, 60, 80, 80)
      ctx.fillRect(210, 360, 80, 80)
      const bitmap = await createImageBitmap(canvas)

      const result = await sliceRegionBoardBitmap(
        bitmap,
        { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
        'region-hero',
        'page-1',
      )

      return {
        count: result.slices.length,
        regionIds: result.slices.map((s) => s.regionId),
        pageIds: result.slices.map((s) => s.pageId),
        allHaveBlob: result.slices.every((s) => s.blob instanceof Blob && s.blob.size > 0),
        allHaveSize: result.slices.every((s) => s.width > 0 && s.height > 0),
        indices: result.slices.map((s) => s.index),
        diagnostics: result.diagnostics,
      }
    })

    expect(result.count).toBe(3)
    expect(result.regionIds).toEqual(['region-hero', 'region-hero', 'region-hero'])
    expect(result.pageIds).toEqual(['page-1', 'page-1', 'page-1'])
    expect(result.allHaveBlob).toBe(true)
    expect(result.allHaveSize).toBe(true)
    expect(result.indices).toEqual([0, 1, 2])
    expect(result.diagnostics.compliant).toBe(true)
  })

  test('round-trips task-bound slices through persistence into Outcome', async ({ page }) => {
    await page.goto('/tests/visual/region-slicing-harness.html')

    const result = await page.evaluate(async () => {
      let stage = 'load-modules'
      try {
      const [{ sliceRegionBoardBitmap }, image, production, manifestModule, repository, store, outcomeModule] = await Promise.all([
        import('/src/prototype/region-deconstruct.ts'),
        import('/src/lib/image.ts'),
        import('/src/asset-production/index.ts'),
        import('/src/prototype/asset-manifest.ts'),
        import('/src/services/local/project-repository.local.ts'),
        import('/src/store/index.ts'),
        import('/src/agent-runtime/prototype-outcome.ts'),
      ])
      stage = 'create-board'
      const plan = {
        version: 'prototype-plan.v0' as const,
        product: { name: 'Board', summary: 'Board', audience: 'Users', primaryGoal: 'Deliver assets', platform: 'web' },
        designSystem: { styleSummary: 'Clear', palette: ['#fff'], typography: 'Sans', spacing: '8px', componentPrinciples: ['Clear'], assetDirection: 'Dark squares' },
        pages: [{
          id: 'home', name: 'Home', route: '/', purpose: 'Show assets',
          viewport: { platform: 'web', width: 512, height: 512, scroll: 'single-screen' as const },
          regions: [{
            id: 'hero', name: 'Hero', role: 'content', summary: 'Three assets',
            complexity: 'low' as const, decompositionStrategy: 'direct' as const,
            assetRoute: 'board-cutout' as const,
            assetOpportunities: ['one', 'two', 'three'],
          }],
          overlays: [], states: [], interactions: [],
        }],
        flows: [{ id: 'main', name: 'Main', goal: 'Deliver', startPageId: 'home', steps: [] }],
        humanLoop: { mode: 'continue' as const, rationale: 'Ready' },
      }
      const size = 512
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = '#202024'
      ctx.fillRect(60, 60, 80, 80)
      ctx.fillRect(360, 60, 80, 80)
      ctx.fillRect(60, 360, 80, 80)
      const boardBlob = await canvas.convertToBlob({ type: 'image/png' })
      const boardBytes = await image.blobToBytes(boardBlob)
      const bitmap = await createImageBitmap(boardBlob)
      const cut = await sliceRegionBoardBitmap(
        bitmap,
        { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
        'hero',
        'home',
      )
      bitmap.close()

      stage = 'persist-board'
      const artifacts = new (await import('/src/services/content-addressed-desktop-artifacts.ts')).ContentAddressedDesktopArtifactStore(indexedDB)
      const pageArtifactId = await artifacts.write({ bytes: boardBytes, mediaType: 'image/png', source: 'cutout', runId: 'e2e' })
      stage = 'compile-plan'
      const manifest = manifestModule.createPrototypeAssetManifest(plan, plan.pages)
      const productionPlan = await production.compilePrototypeProductionPlan({
        projectRevisionId: 'revision:e2e',
        manifest,
        pages: [{ page: plan.pages[0], artifactId: pageArtifactId, bytes: boardBytes }],
        createdAt: 1,
      })
      stage = 'begin-run'
      let snapshot = production.beginPrototypeProduction({
        snapshot: production.emptyAssetProductionSnapshot(),
        plan: productionPlan,
        runId: 'run:e2e',
        at: 2,
      })
      stage = 'persist-slices'
      const candidates = await Promise.all(cut.slices.map(async (slice) => {
        const bytes = await image.blobToBytes(slice.blob)
        const artifactId = await artifacts.write({ bytes, mediaType: 'image/png', source: 'cutout', runId: 'run:e2e' })
        return {
          slice,
          candidate: {
            box: slice.box,
            artifact: {
              artifactId,
              sha256: artifactId.replace('artifact:sha256:', ''),
              mediaType: 'image/png',
              width: slice.width,
              height: slice.height,
            },
          },
        }
      }))
      stage = 'assign-board'
      const assignment = production.assignBoardCandidates(productionPlan.boardLayouts[0], {
        width: size,
        height: size,
        candidates: candidates.map((item) => item.candidate),
      }, 3)
      const storedSlices = []
      stage = 'publish-tasks'
      for (const task of productionPlan.tasks) {
        const assigned = assignment.byTaskId.get(task.taskId)!
        snapshot = production.publishPrototypeTaskArtifact({
          snapshot,
          runId: 'run:e2e',
          taskId: task.taskId,
          artifact: assigned.artifact,
          reviewIssues: [],
          evidence: { bounds: assigned.box, boardDiagnostics: cut.diagnostics },
          at: 4,
        })
        const source = candidates.find((item) => item.candidate === assigned)!
        storedSlices.push({
          ...source.slice,
          name: `${task.label}.png`,
          assetManifestItemId: task.manifestItemId,
          productionTaskId: task.taskId,
          productionRunId: 'run:e2e',
          outputArtifactId: assigned.artifact.artifactId,
          readiness: 'ready' as const,
        })
      }
      stage = 'finalize-run'
      snapshot = production.finalizePrototypeProduction(snapshot, 'run:e2e', 5)
      const record = {
        ...repository.createEmptyProjectRecord(1),
        id: 'project:e2e',
        name: 'E2E',
        slices: storedSlices,
        assetProduction: snapshot,
      }
      stage = 'restore-project'
      const restored = await repository.createRestoreInputFromProject(record)
      stage = 'restore-store'
      store.getStoreState().resetProject()
      store.getStoreState().restoreProject(restored)
      stage = 'project-outcome'
      const materials = production.projectProductionMaterials(store.getStoreState().assetProduction)
      const outcome = outcomeModule.projectPrototypeOutcome({
        plan,
        scope: 'primary-flow',
        hasDesignSystem: true,
        hasDesignMarkdown: true,
        pages: [{ page: { id: 'home', name: 'Home' } }],
        assets: materials.map((material) => ({
          id: material.taskId,
          manifestItemId: material.manifestItemId,
          revision: material.artifact.sha256,
        })),
      })
      return {
        sliceCount: store.getStoreState().analysis.slices.length,
        materialCount: materials.length,
        outcomeStatus: outcome?.status,
        assignmentIssues: assignment.issues.map((issue) => issue.code),
      }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : typeof error,
          stage,
        }
      }
    })

    expect(result).toEqual({
      sliceCount: 3,
      materialCount: 3,
      outcomeStatus: 'ready-to-deliver',
      assignmentIssues: [],
    })
  })
})
