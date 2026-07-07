import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  createEmptyProjectRecord,
  createLocalProjectRepository,
  createProjectRecordFromStore,
} from './project-repository.local'
import { getStoreState } from '@/store'

const pngBlob = (byte = 1) =>
  new Blob([new Uint8Array([byte])], { type: 'image/png' })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function makeRepo() {
  return createLocalProjectRepository({ idb: new IDBFactory() })
}

describe('project-repository.local', () => {
  function planningSnapshot() {
    return {
      version: 'workspace.v1' as const,
      workflowPhase: 'review' as const,
      prototypeScope: 'primary-flow' as const,
      prototypePlan: {
        version: 'prototype-plan.v0' as const,
        product: {
          name: 'Brand site',
          summary: 'A product website.',
          audience: 'Visitors',
          primaryGoal: 'Choose a direction.',
          platform: 'responsive web',
        },
        designSystem: {
          styleSummary: 'Clear commercial UI.',
          palette: ['primary'],
          typography: 'Sans serif',
          spacing: '8px grid',
          componentPrinciples: ['One primary action'],
          assetDirection: 'Brand visuals',
        },
        pages: [
          {
            id: 'home',
            name: 'Home',
            route: '/',
            purpose: 'Introduce the product.',
            viewport: {
              platform: 'responsive web',
              width: 1440,
              height: 1024,
              scroll: 'single-screen' as const,
            },
            regions: [
              {
                id: 'hero',
                name: 'Hero',
                role: 'introduction',
                summary: 'Primary offer.',
                complexity: 'medium' as const,
                decompositionStrategy: 'direct' as const,
                assetRoute: 'board-cutout' as const,
                assetOpportunities: [],
              },
            ],
            overlays: [],
            states: [],
            interactions: [],
          },
        ],
        flows: [
          {
            id: 'main',
            name: 'Main flow',
            goal: 'Understand the product.',
            startPageId: 'home',
            steps: [],
          },
        ],
        humanLoop: {
          mode: 'ask' as const,
          rationale: 'The product category is ambiguous.',
          question: 'Which direction?',
          defaultChoiceId: 'official',
          choices: [
            {
              id: 'official',
              label: 'Official site',
              description: 'Brand-first official site.',
              impact: 'Generate a brand narrative.',
            },
            {
              id: 'commerce',
              label: 'Commerce',
              description: 'Product grid and checkout.',
              impact: 'Generate a shopping flow.',
            },
          ],
        },
      },
      humanLoopChoiceId: 'commerce',
      humanLoopCustomAnswer: '',
      prototypeDesignSystem: null,
      prototypePages: [],
      selectedPrototypePageId: null,
      runError: null,
      namingStatus: 'idle' as const,
      liveAgentOutput: '',
      attachments: [],
      webSearchEnabled: false,
    }
  }

  it('saves, lists newest-first, loads, and removes projects', async () => {
    const repo = makeRepo()
    const first = {
      ...createEmptyProjectRecord(100),
      name: 'First project',
      brief: 'first',
      updatedAt: Date.now(),
      thumbnail: pngBlob(1),
    }
    await sleep(5)
    const second = {
      ...createEmptyProjectRecord(200),
      name: 'Second project',
      brief: 'second',
      updatedAt: Date.now(),
      assetCount: 2,
      status: 'Ready' as const,
      thumbnail: pngBlob(2),
    }

    expect((await repo.save(first)).ok).toBe(true)
    expect((await repo.save(second)).ok).toBe(true)

    const listed = await repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.data.map((project) => project.name)).toEqual([
      'Second project',
      'First project',
    ])
    expect(listed.data[0].assetCount).toBe(2)

    const loaded = await repo.load(first.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.data.brief).toBe('first')
    expect(loaded.data.thumbnail).toBeDefined()

    expect((await repo.remove(first.id)).ok).toBe(true)
    const after = await repo.list()
    expect(after.ok).toBe(true)
    if (after.ok) expect(after.data).toHaveLength(1)
  })

  it('persists workspace planning snapshot with a project', async () => {
    const repo = makeRepo()
    const project = {
      ...createEmptyProjectRecord(300),
      name: 'HITL project',
      brief: 'brand site',
      status: 'Draft' as const,
      workspace: {
        ...planningSnapshot(),
      },
    }

    expect((await repo.save(project)).ok).toBe(true)

    const loaded = await repo.load(project.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.data.workspace?.prototypePlan?.humanLoop.mode).toBe('ask')
    expect(loaded.data.workspace?.humanLoopChoiceId).toBe('commerce')
  })

  it('creates autosave records from the store workspace snapshot', async () => {
    const state = getStoreState()
    state.resetProject()
    state.setBrief('brand site')
    state.setWorkspaceSnapshot(planningSnapshot())

    const record = await createProjectRecordFromStore({
      id: crypto.randomUUID(),
      createdAt: 400,
      state: getStoreState(),
      now: 500,
    })

    expect(record.workspace?.prototypePlan?.humanLoop.mode).toBe('ask')
    expect(record.workspace?.humanLoopChoiceId).toBe('commerce')
    expect(record.status).toBe('Draft')

    getStoreState().resetProject()
  })
})
