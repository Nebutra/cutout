import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '@/workspace/workspace-snapshot'
import {
  designDocumentToWorkspaceSnapshot,
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
  const materials = new Map(document.materials.map((material) => [material.id, material]))
  const design = materials.get('material:design-system')?.revisions[0]?.content.uri
  const markdown = materials.get('material:design-markdown')?.revisions[0]?.content.uri
  const page = materials.get('material:prototype-page:home')?.revisions[0]?.content.uri
  const attachment = document.sources.find((source) => source.id === 'source:attachment:ref:logo')?.content[0]?.uri
  if (design && snapshot.prototypeDesignSystem) content.set(design, snapshot.prototypeDesignSystem.bytes)
  if (markdown && snapshot.prototypeDesignSystem) content.set(markdown, new TextEncoder().encode(snapshot.prototypeDesignSystem.designMarkdown))
  if (page && snapshot.prototypePages[0]) content.set(page, snapshot.prototypePages[0].bytes)
  if (attachment && snapshot.attachments[0]) content.set(attachment, snapshot.attachments[0].bytes)
  for (const [candidateId, artifact] of Object.entries(snapshot.prototypeDesignSystemCandidates?.artifacts ?? {})) {
    const candidate = snapshot.prototypeDesignSystemCandidates?.set.candidates.find((item) => item.id === candidateId)
    const visualId = candidate?.outputs.find((output) => output.role === 'design-system')?.materialId
    const markdownId = candidate?.outputs.find((output) => output.role === 'design-markdown')?.materialId
    const visual = visualId ? materials.get(visualId)?.revisions[0]?.content.uri : undefined
    const candidateMarkdown = markdownId ? materials.get(markdownId)?.revisions[0]?.content.uri : undefined
    if (visual) content.set(visual, artifact.bytes)
    if (candidateMarkdown) content.set(candidateMarkdown, new TextEncoder().encode(artifact.designMarkdown))
  }
  return content
}
