import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '@/workspace/workspace-snapshot'
import {
  persistPrototypeDesignSystemCandidateSet,
  recoverPrototypeDesignSystemCandidateSet,
} from '@/prototype/design-system-candidates'
import { createPrototypeAssetManifest } from '@/prototype/asset-manifest'
import type { CodingReceipt } from '@/coding-runtime/contracts'
import { sha256Bytes } from '@/asset-production/hash'
import {
  designDocumentToWorkspaceSnapshot,
  legacyWorkspaceSupplementalContent,
  migrateWorkspaceV1,
  projectWorkspaceSnapshotToDesignDocument,
} from './legacy-projection'

describe('legacy workspace Design IR projection', () => {
  it('migrates an old partial workspace.v1 without inventing outcome events', () => {
    const legacy = {
      version: 'workspace.v1',
      workflowPhase: 'review',
      prototypePlan: plan(),
      prototypePages: [],
    } as const

    const migrated = migrateWorkspaceV1(legacy)

    expect(migrated).toMatchObject({
      version: 'workspace.v1',
      prototypeScope: 'primary-flow',
      attachments: [],
      webSearchEnabled: false,
      humanLoopChoiceId: null,
      liveAgentOutput: '',
    })
    expect(migrated.outcome).toBeUndefined()
    expect(migrated.agentRunEvents).toBeUndefined()
  })

  it('is idempotent for already migrated workspace.v1 records', () => {
    const first = migrateWorkspaceV1(snapshot())
    const second = migrateWorkspaceV1(first)

    expect(second).toEqual(first)
  })

  it('preserves additive prototype suite and Coding evidence during workspace.v1 migration', () => {
    const source = snapshotWithSuite()

    const migrated = migrateWorkspaceV1(source)

    expect(migrated.prototypeSuiteCandidates).toEqual(source.prototypeSuiteCandidates)
    expect(migrated.codingReceipts).toEqual(source.codingReceipts)
  })

  it('maps plan, artifacts, slices, markdown, and attachments to stable Design IR ids', async () => {
    const source = snapshot()
    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
      slices: [
        {
          id: 'slice:hero',
          index: 0,
          name: 'Hero illustration',
          bytes: new Uint8Array([8, 9]),
          mediaType: 'image/png',
          width: 20,
          height: 30,
          box: { x: 0, y: 0, width: 20, height: 30 },
        },
      ],
    })

    expect(document.prototype).toMatchObject({ id: 'prototype:project:acme', plan: plan() })
    expect(document.sources.map((item) => item.id)).toEqual([
      'source:project:acme',
      'source:attachment:ref:logo',
    ])
    expect(document.materials.map((item) => item.id)).toEqual([
      'material:design-system',
      'material:design-markdown',
      'material:prototype-page:home',
      'material:cutout-slice:slice:hero',
    ])
    expect(document.provenance.map((item) => item.id)).toEqual([
      'provenance:legacy:project:acme',
    ])
    expect(document.materials.every((item) => item.revisions[0]?.content.sha256)).toBe(true)
    expect(
      document.materials.find((item) => item.id === 'material:design-system')
        ?.revisions[0]?.content.pixelSize,
    ).toEqual({ width: 100, height: 200 })
    expect(JSON.stringify(document)).not.toContain('AQID')
    expect(JSON.stringify(document)).not.toContain('BAUG')
  })

  it('changes only the content revision hash when legacy binary content changes', async () => {
    const first = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: snapshot(),
    })
    const changed = snapshot({ pageBytes: new Uint8Array([7, 7, 7]) })
    const second = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: changed,
    })

    const firstPage = first.materials.find((item) => item.id === 'material:prototype-page:home')
    const secondPage = second.materials.find((item) => item.id === 'material:prototype-page:home')
    expect(secondPage?.id).toBe(firstPage?.id)
    expect(secondPage?.revisions[0]?.content.sha256).not.toBe(
      firstPage?.revisions[0]?.content.sha256,
    )
  })

  it('projects Design System candidates, explicit selection, and selected DESIGN.md tokens', async () => {
    const source = snapshot()
    const selectedMarkdown = [
      '---',
      'tokens:',
      '  color:',
      '    background: "#ffffff"',
      '    surface: "#f5f5f5"',
      '    text: "#111111"',
      '    primary: "#0055ff"',
      '    accent: "#ffcc00"',
      '  spacing:',
      '    md: "16px"',
      '  radius:',
      '    md: "8px"',
      '---',
      '# Selected direction',
    ].join('\n')
    const candidateArtifact = {
      name: 'Selected direction',
      designMarkdown: selectedMarkdown,
      bytes: new Uint8Array([7, 8, 9]),
      mediaType: 'image/png',
      width: 120,
      height: 80,
    }
    const withCandidates: WorkspaceSnapshot = {
      ...source,
      prototypeDesignSystem: candidateArtifact,
      prototypeDesignSystemCandidates: {
        set: {
          id: 'candidate-set:design-system:test',
          kind: 'design-system',
          baseRevisionId: 'design-revision:project:acme:1',
          proposal: {
            mode: 'auto',
            decidedBy: 'agent',
            count: 1,
            rationale: 'One deliberate direction is sufficient.',
            directions: [{
              id: 'direction:selected',
              label: 'Selected direction',
              thesis: 'A crisp production system.',
              vary: ['surface treatment'],
              preserve: ['product identity'],
            }],
            bounds: { maxCandidates: 8, maxParallelism: 2 },
          },
          candidates: [{
            id: 'candidate:selected',
            directionId: 'direction:selected',
            status: 'ready',
            outputs: [
              { role: 'design-system', materialId: 'material:design-system-candidate:candidate:selected:visual' },
              { role: 'design-markdown', materialId: 'material:design-system-candidate:candidate:selected:markdown' },
            ],
            provenanceIds: ['provenance:design-system-candidate:candidate:selected'],
          }],
          selection: {
            candidateId: 'candidate:selected',
            selectedAt: '2026-07-23T00:00:00.000Z',
            actor: { kind: 'human', id: 'workspace-user' },
            baseRevisionId: 'design-revision:project:acme:1',
            provenanceId: 'provenance:design-system-selection:test',
          },
        },
        artifacts: { 'candidate:selected': candidateArtifact },
      },
    }

    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: withCandidates,
    })

    expect(document.candidateSets).toHaveLength(1)
    expect(document.materials.map((material) => material.id)).toContain(
      'material:design-system-candidate:candidate:selected:markdown',
    )
    expect(document.provenance.map((item) => item.id)).toContain(
      'provenance:design-system-selection:test',
    )
    expect(document.tokens.map((token) => token.value)).toContain('#0055ff')
    expect(document.tokens.every((token) =>
      token.provenanceId === 'provenance:design-system-selection:test',
    )).toBe(true)

    const content = contentByUri(withCandidates, document)
    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri),
    })
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.data.snapshot.prototypeDesignSystemCandidates?.set.selection?.candidateId)
      .toBe('candidate:selected')
    expect(restored.data.snapshot.prototypeDesignSystemCandidates?.artifacts['candidate:selected']?.designMarkdown)
      .toBe(selectedMarkdown)
  })

  it('projects a persisted legacy selected candidate without duplicating canonical materials', async () => {
    const source = snapshot()
    const recovered = recoverPrototypeDesignSystemCandidateSet(
      null,
      source.prototypeDesignSystem,
    )
    expect(recovered).not.toBeNull()
    if (!recovered) return
    const persistedRecovery = persistPrototypeDesignSystemCandidateSet(recovered)
    const historicalPersistedRecovery = {
      ...persistedRecovery,
      set: {
        ...persistedRecovery.set,
        candidates: persistedRecovery.set.candidates.map((candidate) => ({
          ...candidate,
          outputs: [
            { role: 'design-system' as const, materialId: 'material:design-system' },
            { role: 'design-markdown' as const, materialId: 'material:design-markdown' },
          ],
        })),
      },
    }
    const withPersistedRecovery: WorkspaceSnapshot = {
      ...source,
      prototypeDesignSystemCandidates: historicalPersistedRecovery,
    }

    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: withPersistedRecovery,
    })

    const materialIds = document.materials.map((material) => material.id)
    expect(new Set(materialIds).size).toBe(materialIds.length)
    expect(materialIds.filter((id) => id === 'material:design-system')).toHaveLength(1)
    expect(materialIds.filter((id) => id === 'material:design-markdown')).toHaveLength(1)
    expect(materialIds).toContain(
      'material:design-system-candidate:candidate:legacy-selected:visual',
    )
    expect(materialIds).toContain(
      'material:design-system-candidate:candidate:legacy-selected:markdown',
    )
    expect(document.candidateSets?.[0]?.candidates[0]?.outputs).toEqual([
      {
        role: 'design-system',
        materialId: 'material:design-system-candidate:candidate:legacy-selected:visual',
      },
      {
        role: 'design-markdown',
        materialId: 'material:design-system-candidate:candidate:legacy-selected:markdown',
      },
    ])

    const content = contentByUri(withPersistedRecovery, document)
    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri),
    })
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.data.snapshot.prototypeDesignSystemCandidates?.set.selection?.candidateId)
      .toBe('candidate:legacy-selected')
    expect(restored.data.snapshot.prototypeDesignSystemCandidates?.artifacts['candidate:legacy-selected']?.bytes)
      .toEqual(source.prototypeDesignSystem?.bytes)
  })

  it('round-trips complete prototype suites, resource bindings, selection, and Coding receipts', async () => {
    const source = snapshotWithSuite()
    const suiteArtifact = source.prototypeSuiteCandidates?.artifacts['candidate:suite:selected']
    const page = suiteArtifact?.pages[0]
    const resource = suiteArtifact?.resourcePack.assets[0]
    if (!page || !resource) throw new Error('Expected complete suite fixture.')
    const pageReview = {
      version: 'prototype-page-review.v1' as const,
      artifactSha256: await sha256Bytes(page.bytes),
      reviewer: { providerId: 'reviewer', model: 'vision-model' },
      verdict: { pass: true, failures: [] },
      reviewedAt: '2026-08-03T00:00:00.000Z',
    }
    const resourceReview = {
      version: 'prototype-resource-review.v1' as const,
      artifactId: resource.artifactId,
      reviewer: { providerId: 'reviewer', model: 'vision-model' },
      verdict: { pass: false, failures: ['Needs attention.'] },
      observationalIssues: [{ code: 'qa-rejected', message: 'Needs attention.' }],
      reviewedAt: '2026-08-03T00:00:01.000Z',
    }
    ;(page as { review?: typeof pageReview }).review = pageReview
    ;(resource as { review?: typeof resourceReview }).review = resourceReview
    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
    })

    expect(document.candidateSets?.map((set) => set.kind)).toEqual([
      'design-system',
      'prototype-suite',
    ])
    expect(document.materials.map((item) => item.id)).toEqual(expect.arrayContaining([
      'material:prototype-suite:candidate:suite:selected:suite',
      'material:prototype-suite:candidate:suite:selected:resource-pack',
      'material:prototype-suite-support:candidate:suite:selected:page:1',
      'material:prototype-suite-support:candidate:suite:selected:resource-asset:1',
      'material:coding-receipt:receipt:suite:selected',
    ]))
    expect(document.provenance.map((item) => item.id)).toEqual(expect.arrayContaining([
      'provenance:suite:selected',
      'provenance:resource-pack:selected',
      'provenance:resource-asset:selected',
      'provenance:suite-selection:selected',
      'provenance:coding-receipt:receipt:suite:selected',
    ]))

    const content = contentByUri(source, document)
    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri),
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    const suite = restored.data.snapshot.prototypeSuiteCandidates
    expect(suite?.set.selection?.candidateId).toBe('candidate:suite:selected')
    expect(suite?.artifacts['candidate:suite:selected']?.pages[0]?.bytes)
      .toEqual(Uint8Array.from([31, 32, 33]))
    expect(suite?.artifacts['candidate:suite:selected']?.pages[0]?.review).toEqual(pageReview)
    expect(suite?.artifacts['candidate:suite:selected']?.resourcePack.assets).toEqual([
      {
        manifestItemId: 'home-hero-1',
        artifactId: 'artifact:suite:selected:hero',
        provenanceIds: ['provenance:resource-asset:selected'],
        review: resourceReview,
      },
    ])
    expect(suite?.artifacts['candidate:suite:selected']?.codingReceipt)
      .toEqual(codingReceipt())
    expect(restored.data.snapshot.codingReceipts).toEqual([codingReceipt()])
  })

  it('round-trips singular page review evidence and rejects stale review bytes', async () => {
    const source = snapshot()
    const page = source.prototypePages[0]!
    const review = {
      version: 'prototype-page-review.v1' as const,
      artifactSha256: await sha256Bytes(page.bytes),
      reviewer: { providerId: 'reviewer', model: 'vision-model' },
      verdict: { pass: true, failures: [] },
      reviewedAt: '2026-08-03T00:00:00.000Z',
    }
    const reviewed = {
      ...source,
      prototypePages: [{ ...page, review }],
    }
    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: reviewed,
    })
    expect(document.materials.map((material) => material.id)).toContain(
      'material:prototype-page-review:home',
    )
    const content = contentByUri(reviewed, document)
    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri),
    })
    expect(restored.ok && restored.data.snapshot.prototypePages[0]?.review).toEqual(review)

    const stale = new Map(content)
    const pageMaterial = document.materials.find(
      (material) => material.id === 'material:prototype-page:home',
    )
    stale.set(pageMaterial!.revisions[0]!.content.uri, Uint8Array.from([9, 9, 9]))
    const rejected = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => stale.get(reference.uri),
    })
    expect(rejected).toMatchObject({ ok: false })
  })

  it('fails closed when a ready suite page reference cannot be resolved', async () => {
    const source = snapshotWithSuite()
    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
    })
    const content = contentByUri(source, document)
    const suitePage = document.materials.find((material) =>
      material.id === 'material:prototype-suite-support:candidate:suite:selected:page:1',
    )
    content.delete(suitePage?.revisions[0]?.content.uri ?? '')

    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri),
    })

    expect(restored).toMatchObject({
      ok: false,
      error: expect.stringContaining('material:prototype-suite-support:candidate:suite:selected:page:1'),
    })
  })

  it('migrates canonical candidate aliases while restoring an existing Design IR', async () => {
    const source = snapshot()
    const recovered = recoverPrototypeDesignSystemCandidateSet(
      null,
      source.prototypeDesignSystem,
    )
    expect(recovered).not.toBeNull()
    if (!recovered) return
    const persisted = persistPrototypeDesignSystemCandidateSet(recovered)
    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
    })
    const legacySet = {
      ...persisted.set,
      candidates: persisted.set.candidates.map((candidate) => ({
        ...candidate,
        outputs: [
          { role: 'design-system' as const, materialId: 'material:design-system' },
          { role: 'design-markdown' as const, materialId: 'material:design-markdown' },
        ],
      })),
    }
    const baseProvenance = document.provenance[0]!
    const historicalDocument = {
      ...document,
      candidateSets: [legacySet],
      provenance: [
        ...document.provenance,
        { ...baseProvenance, id: persisted.set.candidates[0]!.provenanceIds[0]! },
        {
          ...baseProvenance,
          id: persisted.set.selection!.provenanceId,
          actor: persisted.set.selection!.actor,
          recordedAt: persisted.set.selection!.selectedAt,
        },
      ],
    }

    const content = contentByUri(source, historicalDocument)
    const restored = await designDocumentToWorkspaceSnapshot(historicalDocument, {
      resolveContent: (reference) => content.get(reference.uri),
    })

    if (!restored.ok) throw new Error(restored.error)
    expect(restored.data.snapshot.prototypeDesignSystemCandidates?.set.candidates[0]?.outputs)
      .toEqual(persisted.set.candidates[0]?.outputs)
    expect(restored.data.snapshot.prototypeDesignSystemCandidates?.artifacts['candidate:legacy-selected']?.bytes)
      .toEqual(source.prototypeDesignSystem?.bytes)
  })

  it('does not project a prior Design IR back into itself', async () => {
    const source = snapshot()
    const first = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
    })
    const second = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: { ...source, designDocument: first },
    })

    expect(second).toEqual(first)
  })

  it('projects current plan, page, and attachment edits into the next Design IR', async () => {
    const source = snapshot()
    const changedPlan = {
      ...source.prototypePlan!,
      product: { ...source.prototypePlan!.product, summary: 'Sell subscriptions.' },
      pages: source.prototypePlan!.pages.map((page) => ({ ...page, name: 'Storefront' })),
    }
    const changed = {
      ...source,
      prototypePlan: changedPlan,
      prototypePages: source.prototypePages.map((page) => ({
        ...page,
        page: changedPlan.pages.find((candidate) => candidate.id === page.page.id)!,
      })),
      attachments: source.attachments.map((attachment) => ({
        ...attachment,
        name: 'brand-reference.png',
      })),
    }

    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: changed,
    })

    expect(document.prototype?.plan.product.summary).toBe('Sell subscriptions.')
    expect(document.materials.find((item) => item.id === 'material:prototype-page:home')?.name)
      .toBe('Storefront')
    expect(document.sources.find((item) => item.id === 'source:attachment:ref:logo')?.title)
      .toBe('brand-reference.png')
  })

  it('round-trips resolvable legacy workspace material bytes without reading outcome events', async () => {
    const source = snapshot()
    const document = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
    })
    const content = contentByUri(source, document)
    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri) ?? null,
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.data.snapshot.prototypePlan).toEqual(source.prototypePlan)
    expect(restored.data.snapshot.prototypeDesignSystem).toMatchObject({
      width: 100,
      height: 200,
    })
    expect(restored.data.snapshot.prototypePages[0]?.page.id).toBe('home')
    expect(restored.data.snapshot.prototypePages[0]?.bytes).toEqual(
      source.prototypePages[0]?.bytes,
    )
    expect(restored.data.snapshot.attachments[0]?.id).toBe('ref:logo')
    expect(restored.data.snapshot.outcome).toBeUndefined()
    expect(restored.data.snapshot.agentRunEvents).toBeUndefined()
  })

  it('recovers intrinsic size from old IR image bytes without pixel metadata', async () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47], 0)
    new DataView(png.buffer).setUint32(16, 640, false)
    new DataView(png.buffer).setUint32(20, 480, false)
    const base = snapshot({ designBytes: png })
    const source = {
      ...base,
      prototypeDesignSystem: base.prototypeDesignSystem
        ? { ...base.prototypeDesignSystem, width: 0, height: 0 }
        : null,
    }
    const projected = await projectWorkspaceSnapshotToDesignDocument({
      project: project(),
      workspace: source,
    })
    expect(
      projected.materials.find((item) => item.id === 'material:design-system')
        ?.revisions[0]?.content.pixelSize,
    ).toEqual({ width: 640, height: 480 })
    const document = {
      ...projected,
      materials: projected.materials.map((item) =>
        item.id !== 'material:design-system'
          ? item
          : {
              ...item,
              revisions: item.revisions.map((revision) => ({
                ...revision,
                content: { ...revision.content, pixelSize: undefined },
              })),
            },
      ),
    }
    const content = contentByUri(source, projected)

    const restored = await designDocumentToWorkspaceSnapshot(document, {
      resolveContent: (reference) => content.get(reference.uri) ?? null,
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.data.snapshot.prototypeDesignSystem).toMatchObject({
      width: 640,
      height: 480,
    })
  })
})

function project() {
  return {
    id: 'project:acme',
    name: 'Acme storefront',
    brief: 'Create a conversion-focused storefront.',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_010_000,
  }
}

function snapshot(options: {
  readonly pageBytes?: Uint8Array
  readonly designBytes?: Uint8Array
} = {}): WorkspaceSnapshot {
  return {
    version: 'workspace.v1',
    workflowPhase: 'idle',
    prototypePlan: plan(),
    prototypeScope: 'primary-flow',
    humanLoopChoiceId: null,
    humanLoopCustomAnswer: '',
    prototypeDesignSystem: {
      name: 'System board',
      designMarkdown: '# Acme\nUse a compact grid.',
      bytes: options.designBytes ?? new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
      width: 100,
      height: 200,
    },
    prototypePages: [
      {
        page: plan().pages[0]!,
        bytes: options.pageBytes ?? new Uint8Array([4, 5, 6]),
        mediaType: 'image/png',
        width: 1440,
        height: 900,
      },
    ],
    selectedPrototypePageId: 'home',
    runError: null,
    namingStatus: 'idle',
    liveAgentOutput: '',
    attachments: [
      {
        id: 'ref:logo',
        name: 'logo.png',
        bytes: new Uint8Array([9, 8, 7]),
        mediaType: 'image/png',
      },
    ],
    webSearchEnabled: false,
    outcome: {
      version: 'outcome-runtime.v1',
      contract: { id: 'outcome', intent: 'irrelevant', requirements: [] },
      runId: 'run',
      status: 'ready-to-deliver',
      materials: [],
      evaluation: { status: 'satisfied', missing: [] },
      events: [],
    },
  }
}

function snapshotWithSuite(): WorkspaceSnapshot {
  const base = snapshot()
  const designMarkdown = [
    '---',
    'tokens:',
    '  color:',
    '    background: "#ffffff"',
    '    surface: "#f5f5f5"',
    '    text: "#111111"',
    '    primary: "#0055ff"',
    '    accent: "#ffcc00"',
    '  spacing:',
    '    md: "16px"',
    '  radius:',
    '    md: "8px"',
    '---',
    '# Selected suite direction',
  ].join('\n')
  const designSystem = {
    ...base.prototypeDesignSystem!,
    name: 'Selected suite direction',
    designMarkdown,
  }
  const direction = {
    id: 'direction:suite:selected',
    label: 'Selected suite direction',
    thesis: 'A complete selected suite.',
    vary: ['information architecture'],
    preserve: ['product identity'],
  }
  const proposal = {
    mode: 'fixed' as const,
    decidedBy: 'user' as const,
    count: 1,
    rationale: 'Exercise one complete persisted suite.',
    directions: [direction],
    bounds: { maxCandidates: 8, maxParallelism: 2 },
  }
  const designCandidateId = 'candidate:design:selected'
  const suiteCandidateId = 'candidate:suite:selected'
  const suitePlan = plan()
  const manifest = createPrototypeAssetManifest(suitePlan, suitePlan.pages)
  const receipt = codingReceipt()
  return {
    ...base,
    prototypeDesignSystem: designSystem,
    prototypeDesignSystemCandidates: {
      set: {
        id: 'candidate-set:design:selected',
        kind: 'design-system',
        baseRevisionId: 'revision:design:selected',
        proposal,
        candidates: [{
          id: designCandidateId,
          directionId: direction.id,
          status: 'ready',
          outputs: [
            {
              role: 'design-system',
              materialId: 'material:design-system-candidate:candidate:design:selected:visual',
            },
            {
              role: 'design-markdown',
              materialId: 'material:design-system-candidate:candidate:design:selected:markdown',
            },
          ],
          provenanceIds: ['provenance:design:selected'],
        }],
        selection: {
          candidateId: designCandidateId,
          selectedAt: '2026-07-28T08:00:00.000Z',
          actor: { kind: 'human', id: 'workspace-user' },
          baseRevisionId: 'revision:design:selected',
          provenanceId: 'provenance:design-selection:selected',
        },
      },
      artifacts: { [designCandidateId]: designSystem },
    },
    prototypeSuiteCandidates: {
      set: {
        id: 'candidate-set:suite:selected',
        kind: 'prototype-suite',
        baseRevisionId: 'revision:suite:selected',
        proposal,
        candidates: [{
          id: suiteCandidateId,
          directionId: direction.id,
          status: 'ready',
          outputs: [
            {
              role: 'prototype-suite',
              materialId: 'material:prototype-suite:candidate:suite:selected:suite',
            },
            {
              role: 'resource-pack',
              materialId: 'material:prototype-suite:candidate:suite:selected:resource-pack',
            },
          ],
          provenanceIds: ['provenance:suite:selected'],
        }],
        selection: {
          candidateId: suiteCandidateId,
          selectedAt: '2026-07-28T09:00:00.000Z',
          actor: { kind: 'human', id: 'workspace-user' },
          baseRevisionId: 'revision:suite:selected',
          provenanceId: 'provenance:suite-selection:selected',
        },
      },
      artifacts: {
        [suiteCandidateId]: {
          designSystem: {
            candidateSetId: 'candidate-set:design:selected',
            candidateId: designCandidateId,
            directionId: direction.id,
            baseRevisionId: 'revision:design:selected',
            provenanceIds: ['provenance:design:selected'],
            artifact: designSystem,
          },
          plan: suitePlan,
          pages: [{
            page: suitePlan.pages[0]!,
            bytes: Uint8Array.from([31, 32, 33]),
            mediaType: 'image/png',
            width: 1440,
            height: 900,
          }],
          resourcePack: {
            id: 'resource-pack:suite:selected',
            manifest,
            manifestProvenanceId: 'provenance:resource-pack:selected',
            assets: [{
              manifestItemId: manifest.assets[0]!.id,
              artifactId: 'artifact:suite:selected:hero',
              provenanceIds: ['provenance:resource-asset:selected'],
            }],
          },
          provenanceIds: ['provenance:suite:selected'],
          codingReceipt: receipt,
        },
      },
    },
    codingReceipts: [receipt],
  }
}

function codingReceipt(): CodingReceipt {
  return {
    version: 'cutout.coding-receipt.v1',
    receiptId: 'receipt:suite:selected',
    taskId: 'coding:suite:selected',
    status: 'applied',
    baseSnapshotId: 'snapshot:base',
    resultSnapshotId: 'snapshot:result',
    changedFiles: [{
      path: 'site/pages/index.html',
      operation: 'create',
      sha256: 'a'.repeat(64),
    }],
    checks: [{ name: 'build', status: 'passed' }],
    screenshots: [],
    provenance: {
      backend: 'controlled-provider-backend',
      inputRefs: ['candidate:suite:selected'],
      patchSha256: 'b'.repeat(64),
    },
    startedAt: 1_700_000_020_000,
    completedAt: 1_700_000_030_000,
  }
}

function plan() {
  return {
    version: 'prototype-plan.v0' as const,
    product: {
      name: 'Acme',
      projectName: 'Acme storefront',
      summary: 'Sell products.',
      audience: 'Shoppers',
      primaryGoal: 'Purchase.',
      platform: 'web',
    },
    designSystem: {
      styleSummary: 'Crisp',
      palette: ['blue'],
      typography: 'Sans',
      spacing: '8px',
      componentPrinciples: ['Clear CTA'],
      assetDirection: 'Editorial',
    },
    pages: [
      {
        id: 'home',
        name: 'Home',
        route: '/',
        purpose: 'Sell.',
        viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' as const },
        regions: [{ id: 'hero', name: 'Hero', role: 'hero', summary: 'Sell.', complexity: 'low' as const, decompositionStrategy: 'direct' as const, assetRoute: 'direct-generate' as const, assetOpportunities: [] }],
        overlays: [],
        states: [],
        interactions: [],
      },
    ],
    flows: [{ id: 'main', name: 'Main', goal: 'Buy.', startPageId: 'home', steps: [] }],
    humanLoop: { mode: 'continue' as const, rationale: 'Clear.' },
  }
}

function contentByUri(snapshot: WorkspaceSnapshot, document: Awaited<ReturnType<typeof projectWorkspaceSnapshotToDesignDocument>>) {
  const content = new Map<string, Uint8Array>()
  for (const [uri, bytes] of legacyWorkspaceSupplementalContent(project().id, snapshot)) {
    content.set(uri, bytes)
  }
  const materials = new Map(document.materials.map((material) => [material.id, material]))
  const design = materials.get('material:design-system')?.revisions[0]?.content.uri
  const markdown = materials.get('material:design-markdown')?.revisions[0]?.content.uri
  const page = materials.get('material:prototype-page:home')?.revisions[0]?.content.uri
  const attachment = document.sources.find((source) => source.id === 'source:attachment:ref:logo')?.content[0]?.uri
  if (design && snapshot.prototypeDesignSystem) content.set(design, snapshot.prototypeDesignSystem.bytes)
  if (markdown && snapshot.prototypeDesignSystem) content.set(markdown, new TextEncoder().encode(snapshot.prototypeDesignSystem.designMarkdown))
  if (page && snapshot.prototypePages[0]) content.set(page, snapshot.prototypePages[0].bytes)
  if (attachment && snapshot.attachments[0]) content.set(attachment, snapshot.attachments[0].bytes)
  const candidateSet = document.candidateSets?.find((item) => item.kind === 'design-system')
  for (const [candidateId, artifact] of Object.entries(snapshot.prototypeDesignSystemCandidates?.artifacts ?? {})) {
    const candidate = candidateSet?.candidates.find((item) => item.id === candidateId)
    const visualId = candidate?.outputs.find((output) => output.role === 'design-system')?.materialId
    const markdownId = candidate?.outputs.find((output) => output.role === 'design-markdown')?.materialId
    const visual = visualId ? materials.get(visualId)?.revisions[0]?.content.uri : undefined
    const candidateMarkdown = markdownId ? materials.get(markdownId)?.revisions[0]?.content.uri : undefined
    if (visual) content.set(visual, artifact.bytes)
    if (candidateMarkdown) content.set(candidateMarkdown, new TextEncoder().encode(artifact.designMarkdown))
  }
  return content
}
