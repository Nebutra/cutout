import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  createEmptyProjectRecord,
  createLocalProjectRepository,
  createProjectRecordFromStore,
  type LocalProjectRecord,
} from './project-repository.local'
import { getStoreState } from '@/store'

const pngBlob = (byte = 1) =>
  new Blob([new Uint8Array([byte])], { type: 'image/png' })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function makeRepo() {
  return createLocalProjectRepository({ idb: new IDBFactory() })
}

async function putRawLegacyRecord(
  idb: IDBFactory,
  record: LocalProjectRecord,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = idb.open('cutout-projects', 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('projects')) {
        request.result.createObjectStore('projects', { keyPath: 'id' })
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put(record)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    }
  })
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
          projectName: 'Brand Sprint',
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

  it('updates project metadata atomically and rejects a stale menu mutation', async () => {
    const repo = makeRepo()
    const project = createEmptyProjectRecord(100)
    expect((await repo.save(project)).ok).toBe(true)

    const renamed = await repo.updateMetadata(project.id, {
      expectedMetadataUpdatedAt: 0,
      name: 'Pinned design system',
      pinnedAt: 500,
    })
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.data.name).toBe('Pinned design system')
    expect(renamed.data.customName).toBe('Pinned design system')
    expect(renamed.data.pinnedAt).toBe(500)
    expect(renamed.data.updatedAt).toBe(project.updatedAt)

    const stale = await repo.updateMetadata(project.id, {
      expectedMetadataUpdatedAt: 0,
      pinnedAt: null,
    })
    expect(stale.ok).toBe(false)
    const loaded = await repo.load(project.id)
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.data.pinnedAt).toBe(500)
  })

  it('preserves custom name and pin through autosave and clears pin on archive', async () => {
    const repo = makeRepo()
    const initial = createEmptyProjectRecord(100)
    expect((await repo.save(initial)).ok).toBe(true)
    const metadata = await repo.updateMetadata(initial.id, {
      expectedMetadataUpdatedAt: 0,
      name: 'My durable name',
      pinnedAt: 700,
    })
    expect(metadata.ok).toBe(true)
    if (!metadata.ok) return

    const state = getStoreState()
    state.resetProject()
    state.setBrief('A brief that would normally derive another project name')
    const autosaved = await createProjectRecordFromStore({
      id: initial.id,
      createdAt: initial.createdAt,
      previous: metadata.data,
      state,
      now: 900,
    })
    expect(autosaved.name).toBe('My durable name')
    expect(autosaved.pinnedAt).toBe(700)
    expect(autosaved.metadataUpdatedAt).toBe(metadata.data.metadataUpdatedAt)
    expect((await repo.save(autosaved)).ok).toBe(true)

    const archived = await repo.archive(initial.id, 1_000)
    expect(archived.ok).toBe(true)
    if (!archived.ok) return
    expect(archived.data.pinnedAt).toBeUndefined()
    expect(archived.data.updatedAt).toBe(900)
    const restored = await repo.archive(initial.id, null)
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.data.pinnedAt).toBeUndefined()
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

  it('backfills a raw legacy IndexedDB record without a version upgrade and remains idempotent', async () => {
    const idb = new IDBFactory()
    const repo = createLocalProjectRepository({ idb })
    const legacy = {
      ...createEmptyProjectRecord(310),
      name: 'Legacy project',
      brief: 'legacy brief',
      status: 'Draft' as const,
      // This is deliberately incomplete to model workspace.v1 records written
      // before durable preferences/runtime fields existed.
      workspace: {
        version: 'workspace.v1' as const,
        prototypePlan: planningSnapshot().prototypePlan,
      } as unknown as LocalProjectRecord['workspace'],
    }
    await putRawLegacyRecord(idb, legacy)

    const migrated = await repo.load(legacy.id)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.data.designDocument?.version).toBe('design-ir.v1')
    expect(migrated.data.designDocumentContentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(migrated.data.workspace?.prototypeScope).toBe('primary-flow')

    const loadedAgain = await repo.load(legacy.id)
    expect(loadedAgain.ok).toBe(true)
    if (!loadedAgain.ok) return
    expect(loadedAgain.data.designDocumentContentHash).toBe(
      migrated.data.designDocumentContentHash,
    )
    expect(loadedAgain.data.workspace).toEqual(migrated.data.workspace)
  })

  it('prefers validated Design IR when its representable workspace conflicts with legacy fields', async () => {
    const idb = new IDBFactory()
    const repo = createLocalProjectRepository({ idb })
    const canonical = {
      ...createEmptyProjectRecord(315),
      name: 'Canonical IR',
      brief: 'Use the canonical plan.',
      status: 'Draft' as const,
      workspace: planningSnapshot(),
    }
    expect((await repo.save(canonical)).ok).toBe(true)
    const saved = await repo.load(canonical.id)
    expect(saved.ok).toBe(true)
    if (!saved.ok || !saved.data.designDocument) return

    await putRawLegacyRecord(idb, {
      ...saved.data,
      workspace: {
        ...planningSnapshot(),
        prototypePlan: null,
      },
    })
    const restored = await repo.load(canonical.id)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.data.workspace?.prototypePlan?.product.projectName).toBe('Brand Sprint')
  })

  it('reloads a durable Delivery Center preview after repository restart', async () => {
    const idb = new IDBFactory()
    const plan = { protocol: 'cutout.delivery-center.v1' as const, id: 'delivery:plan', requestId: 'delivery:request', outcomeId: 'outcome:one', outcomeRevision: 'run:one', designRevision: { documentId: 'design:one', revisionId: 'revision:one', revisionNumber: 1 }, targets: [{ targetId: 'delivery:design-system', kind: 'design-system' as const, destination: { kind: 'managed-export' as const, ref: 'native-folder-picker' }, effects: ['managed-export' as const], estimatedCostUsd: 0, currency: 'USD' as const, files: [], warnings: [] }], totalEstimatedCostUsd: 0, currency: 'USD' as const, requiresApproval: true as const, createdAt: '2026-07-12T00:00:00Z' }
    const record = { ...createEmptyProjectRecord(316), workspace: { ...planningSnapshot(), deliveryPlan: plan } }
    const first = createLocalProjectRepository({ idb }); expect((await first.save(record)).ok).toBe(true)
    const restarted = createLocalProjectRepository({ idb }); const loaded = await restarted.load(record.id)
    expect(loaded).toMatchObject({ ok: true, data: { workspace: { deliveryPlan: { id: 'delivery:plan', designRevision: { revisionId: 'revision:one' } } } } })
  })

  it('reprojects and saves a new IR hash when referenced content changes', async () => {
    const repo = makeRepo()
    const project = {
      ...createEmptyProjectRecord(320),
      name: 'Content addressable',
      brief: 'Persist the design guide.',
      status: 'Draft' as const,
      workspace: planningSnapshot(),
      designMarkdown: {
        name: 'DESIGN.md',
        content: '# One\nBlue calls to action.',
        importedAt: 1,
      },
    }
    expect((await repo.save(project)).ok).toBe(true)
    const first = await repo.load(project.id)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    expect((await repo.save({
      ...first.data,
      designMarkdown: {
        ...first.data.designMarkdown!,
        // Same length as the first value; byte/content hashing must still win.
        content: '# Two\nBlue calls to action.',
      },
    })).ok).toBe(true)
    const second = await repo.load(project.id)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.data.designDocumentContentHash).not.toBe(
      first.data.designDocumentContentHash,
    )
  })

  it('preserves the DESIGN.md UI import timestamp while reprojecting canonical IR', async () => {
    const repo = makeRepo()
    const project = {
      ...createEmptyProjectRecord(322),
      name: 'Timestamped design guide',
      brief: 'Persist the design guide.',
      status: 'Draft' as const,
      designMarkdown: {
        name: 'DESIGN.md',
        content: '# Canonical guide',
        importedAt: 123,
      },
    }
    expect((await repo.save(project)).ok).toBe(true)

    const loaded = await repo.load(project.id)

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.data.designMarkdown).toEqual({
      name: 'DESIGN.md',
      content: '# Canonical guide',
      importedAt: 123,
    })
  })

  it('persists and restores the durable Agent run event stream', async () => {
    const repo = makeRepo()
    const project = {
      ...createEmptyProjectRecord(325),
      name: 'Durable run',
      brief: 'checkout prototype',
      status: 'Draft' as const,
      workspace: {
        ...planningSnapshot(),
        agentRunEvents: {
          version: 'agent-run-events.v1' as const,
          activeRunId: 'run-1',
          events: [
            { eventId: 'start', runId: 'run-1', at: 1, type: 'run-started' as const, mode: 'create' as const },
            { eventId: 'intent', runId: 'run-1', at: 2, type: 'intent-recorded' as const, intent: 'checkout prototype' },
          ],
          activeRun: {
            runId: 'run-1',
            mode: 'create' as const,
            startedAt: 1,
            status: 'running' as const,
            intent: 'checkout prototype',
            plan: null,
            steps: {},
            tools: {},
            materials: [],
            outcome: null,
            cancelledReason: null,
            humanLoopAsk: null,
          },
        },
      },
    }

    expect((await repo.save(project)).ok).toBe(true)
    const loaded = await repo.load(project.id)

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.data.workspace?.agentRunEvents?.activeRun?.intent).toBe(
      'checkout prototype',
    )
    expect(loaded.data.workspace?.agentRunEvents?.events).toHaveLength(2)
  })

  it('archives and restores projects without deleting them', async () => {
    const repo = makeRepo()
    const project = {
      ...createEmptyProjectRecord(350),
      name: 'Archive me',
      brief: 'archive test',
      status: 'Draft' as const,
    }

    expect((await repo.save(project)).ok).toBe(true)

    const archived = await repo.archive(project.id, 450)
    expect(archived.ok).toBe(true)
    if (!archived.ok) return
    expect(archived.data.archivedAt).toBe(450)

    const listed = await repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.data[0].archivedAt).toBe(450)

    const restored = await repo.archive(project.id, null)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.data.archivedAt).toBeUndefined()
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
    expect(record.name).toBe('Brand Sprint')
    expect(record.status).toBe('Draft')
    expect(record.designDocument?.version).toBe('design-ir.v1')
    expect(record.designDocumentContentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(record.workspace?.designDocument).toEqual(record.designDocument)
    expect(record.workspace?.designDocument?.prototype?.plan).toEqual(
      record.workspace?.prototypePlan,
    )

    getStoreState().resetProject()
  })

  it('marks persisted workspace work as running while a resumable step is active', async () => {
    const state = getStoreState()
    state.resetProject()
    state.setBrief('brand site')
    state.setWorkspaceSnapshot({
      ...planningSnapshot(),
      workflowPhase: 'design-system',
    })

    const record = await createProjectRecordFromStore({
      id: crypto.randomUUID(),
      createdAt: 600,
      state: getStoreState(),
      now: 700,
    })

    expect(record.status).toBe('Running')

    getStoreState().resetProject()
  })

  it('marks pending semantic naming as running in project summaries', async () => {
    const state = getStoreState()
    state.resetProject()
    state.setBrief('brand site')
    state.setWorkspaceSnapshot({
      ...planningSnapshot(),
      workflowPhase: 'idle',
      namingStatus: 'pending',
    })

    const record = await createProjectRecordFromStore({
      id: crypto.randomUUID(),
      createdAt: 800,
      state: getStoreState(),
      now: 900,
    })

    expect(record.status).toBe('Running')

    getStoreState().resetProject()
  })

  it('keeps partial outcome artifacts as a draft until the contract is satisfied', async () => {
    const state = getStoreState()
    state.resetProject()
    state.setBrief('brand site')
    state.setWorkspaceSnapshot({
      ...planningSnapshot(),
      workflowPhase: 'idle',
      outcome: {
        version: 'outcome-runtime.v1',
        contract: {
          id: 'brand-site',
          intent: 'Deliver the planned brand site',
          requirements: [
            { kind: 'prototype-page', minCount: 1, label: 'Prototype page' },
          ],
        },
        runId: 'workspace:brand-site',
        status: 'running',
        materials: [],
        evaluation: {
          status: 'needs-repair',
          missing: [{ kind: 'prototype-page', count: 1, label: 'Prototype page' }],
        },
        events: [],
      },
    })

    const record = await createProjectRecordFromStore({
      id: crypto.randomUUID(),
      createdAt: 1_000,
      state: getStoreState(),
      now: 1_100,
    })

    expect(record.status).toBe('Draft')

    getStoreState().resetProject()
  })
})
