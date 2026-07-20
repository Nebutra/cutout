import { describe, expect, it } from 'vitest'
import { createPrototypeAssetManifest } from '@/prototype/asset-manifest'
import type { PrototypePlan } from '@/prototype/prototype-plan'
import { emptyAssetProductionSnapshot } from '../contracts'
import { qualityIssue } from '../quality-policy'
import {
  beginPrototypeProduction,
  cancelPrototypeProduction,
  carryPrototypeTaskPublication,
  compilePrototypeProductionPlan,
  failPrototypeTask,
  finalizePrototypeProduction,
  prototypeDirectAssetChecklist,
  prototypeDirectAssetPrompt,
  publishPrototypeTaskArtifact,
} from './prototype'
import { integrityIssue } from '../quality-policy'

const prototypePlan: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: { name: 'Product', summary: 'Summary', audience: 'Users', primaryGoal: 'Use it', platform: 'web' },
  designSystem: { styleSummary: 'Clear', palette: ['white'], typography: 'Sans', spacing: '8px', componentPrinciples: ['Simple'], assetDirection: 'Icons' },
  pages: [{
    id: 'home', name: 'Home', route: '/', purpose: 'Start',
    viewport: { platform: 'web', width: 100, height: 100, scroll: 'single-screen' },
    regions: [
      { id: 'icons', name: 'Icons', role: 'tools', summary: 'Tool icons', complexity: 'low', decompositionStrategy: 'direct', assetRoute: 'board-cutout', assetOpportunities: ['search', 'save'] },
      { id: 'hero', name: 'Hero', role: 'intro', summary: 'Hero art', complexity: 'high', decompositionStrategy: 'direct', assetRoute: 'direct-generate', assetOpportunities: ['hero illustration'] },
    ],
    overlays: [], states: [], interactions: [],
  }],
  flows: [], humanLoop: { mode: 'continue', rationale: 'Ready' },
}

describe('prototype production adapter', () => {
  it('keeps planned routes executable and stable', async () => {
    const manifest = createPrototypeAssetManifest(prototypePlan, prototypePlan.pages)
    const plan = await compilePrototypeProductionPlan({
      projectRevisionId: 'revision:1', manifest,
      pages: [{ page: prototypePlan.pages[0]!, artifactId: 'artifact:home', bytes: new Uint8Array([1]) }],
      createdAt: 1,
    })
    expect(plan.tasks.map((task) => task.route)).toEqual([
      'direct-generate', 'board-cutout', 'board-cutout',
    ])
    expect(plan.tasks.find((task) => task.route === 'direct-generate')?.label).toBe('home-hero-illustration')
  })

  it('publishes accepted tasks and leaves rejected tasks in review', async () => {
    const manifest = createPrototypeAssetManifest(prototypePlan, prototypePlan.pages)
    const plan = await compilePrototypeProductionPlan({
      projectRevisionId: 'revision:1', manifest,
      pages: [{ page: prototypePlan.pages[0]!, artifactId: 'artifact:home', bytes: new Uint8Array([1]) }],
      createdAt: 1,
    })
    let state = beginPrototypeProduction({
      snapshot: emptyAssetProductionSnapshot(), plan, runId: 'run:1', at: 2,
    })
    const [direct, board] = [
      plan.tasks.find((task) => task.route === 'direct-generate')!,
      plan.tasks.find((task) => task.route === 'board-cutout')!,
    ]
    const artifact = { artifactId: 'artifact:a', sha256: 'a'.repeat(64), mediaType: 'image/png', width: 20, height: 20 }
    state = publishPrototypeTaskArtifact({ snapshot: state, runId: 'run:1', taskId: direct.taskId, artifact, reviewIssues: [], at: 3 })
    state = publishPrototypeTaskArtifact({
      snapshot: state, runId: 'run:1', taskId: board.taskId, artifact,
      reviewIssues: [qualityIssue('qa-rejected', 'Rejected.', 'model-review', 4)], at: 4,
    })
    state = finalizePrototypeProduction(state, 'run:1', 5)
    expect(state.runs['run:1']?.tasks[direct.taskId]?.status).toBe('ready')
    expect(state.runs['run:1']?.tasks[board.taskId]?.status).toBe('needs-review')
    expect(state.runs['run:1']?.status).toBe('needs-review')
  })

  it('records task failure and cancellation without manufacturing success', async () => {
    const manifest = createPrototypeAssetManifest(prototypePlan, prototypePlan.pages)
    const plan = await compilePrototypeProductionPlan({
      projectRevisionId: 'revision:1', manifest,
      pages: [{ page: prototypePlan.pages[0]!, artifactId: 'artifact:home', bytes: new Uint8Array([1]) }],
      createdAt: 1,
    })
    let state = beginPrototypeProduction({
      snapshot: emptyAssetProductionSnapshot(), plan, runId: 'run:failure', at: 2,
    })
    state = failPrototypeTask({
      snapshot: state,
      runId: 'run:failure',
      taskId: plan.tasks[0]!.taskId,
      issues: [integrityIssue('missing-output', 'No output was produced.', 3)],
      at: 3,
    })
    expect(state.runs['run:failure']?.tasks[plan.tasks[0]!.taskId]?.status).toBe('failed')
    state = cancelPrototypeProduction(state, 'run:failure', 4)
    expect(state.runs['run:failure']?.status).toBe('cancelled')
  })

  it('builds one-subject direct generation and review contracts', async () => {
    const manifest = createPrototypeAssetManifest(prototypePlan, prototypePlan.pages)
    const plan = await compilePrototypeProductionPlan({
      projectRevisionId: 'revision:1', manifest,
      pages: [{ page: prototypePlan.pages[0]!, artifactId: 'artifact:home', bytes: new Uint8Array([1]) }],
      createdAt: 1,
    })
    const task = plan.tasks.find((candidate) => candidate.route === 'direct-generate')!
    const prompt = prototypeDirectAssetPrompt({
      task,
      page: prototypePlan.pages[0]!,
      styleSummary: prototypePlan.designSystem.styleSummary,
      assetDirection: prototypePlan.designSystem.assetDirection,
    })
    expect(prompt).toContain('exactly one standalone visual asset')
    expect(prompt).toContain('Transparent background')
    expect(prototypeDirectAssetChecklist(task)).toHaveLength(4)
  })

  it('carries an accepted artifact only between runs of the same plan', async () => {
    const manifest = createPrototypeAssetManifest(prototypePlan, prototypePlan.pages)
    const plan = await compilePrototypeProductionPlan({
      projectRevisionId: 'revision:1', manifest,
      pages: [{ page: prototypePlan.pages[0]!, artifactId: 'artifact:home', bytes: new Uint8Array([1]) }],
      createdAt: 1,
    })
    const task = plan.tasks[0]!
    const artifact = { artifactId: 'artifact:a', sha256: 'a'.repeat(64), mediaType: 'image/png', width: 20, height: 20 }
    let state = beginPrototypeProduction({ snapshot: emptyAssetProductionSnapshot(), plan, runId: 'run:1', at: 2 })
    state = publishPrototypeTaskArtifact({ snapshot: state, runId: 'run:1', taskId: task.taskId, artifact, reviewIssues: [], at: 3 })
    state = beginPrototypeProduction({ snapshot: state, plan, runId: 'run:2', at: 4 })
    expect(state.runs['run:1']?.status).toBe('cancelled')
    state = carryPrototypeTaskPublication({ snapshot: state, fromRunId: 'run:1', toRunId: 'run:2', taskId: task.taskId, at: 5 })
    expect(state.runs['run:2']?.tasks[task.taskId]).toMatchObject({
      status: 'ready',
      evidence: { lineage: { previousRunId: 'run:1', previousArtifactSha256: 'a'.repeat(64) } },
    })
  })
})
