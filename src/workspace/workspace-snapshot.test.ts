import { describe, expect, it } from 'vitest'
import type { OutcomeRuntimeState } from '@/agent-runtime/outcome-runtime'
import { replayRunEvents } from '@/agent-runtime/run-events'
import {
  isWorkspaceSnapshotEmpty,
  textFingerprint,
  workspaceSnapshotFingerprint,
  type WorkspaceSnapshot,
} from './workspace-snapshot'

describe('workspace snapshot helpers', () => {
  it('fingerprints same-length text changes', () => {
    expect(textFingerprint('16px')).not.toBe(textFingerprint('18px'))
  })

  it('fingerprints outcome progress so material evidence triggers persistence', () => {
    const incomplete = snapshot(outcome('running', []))
    const complete = snapshot(
      outcome('ready-to-deliver', [
        {
          id: 'page:home',
          kind: 'prototype-page',
          label: 'Home',
          source: 'agent',
        },
      ]),
    )

    expect(workspaceSnapshotFingerprint(incomplete)).not.toBe(
      workspaceSnapshotFingerprint(complete),
    )
  })

  it('accepts workspace.v1 records saved before composer and attachment fields existed', () => {
    const legacy = {
      ...snapshot(outcome('running', [])),
      outcome: undefined,
      attachments: undefined,
      webSearchEnabled: undefined,
      composerModelPolicy: undefined,
      composerThinkingPolicy: undefined,
      agentRunEvents: undefined,
    } as unknown as WorkspaceSnapshot

    expect(() => isWorkspaceSnapshotEmpty(legacy)).not.toThrow()
    expect(() => workspaceSnapshotFingerprint(legacy)).not.toThrow()
  })

  it('fingerprints durable run events so autosave persists activity progress', () => {
    const base = snapshot(outcome('running', []))
    const started = {
      ...base,
      agentRunEvents: replayRunEvents([
        { eventId: 'start', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
      ]),
    } satisfies WorkspaceSnapshot
    const toolStarted = {
      ...base,
      agentRunEvents: replayRunEvents([
        { eventId: 'start', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
        {
          eventId: 'tool',
          runId: 'run-1',
          at: 2,
          type: 'tool-started',
          toolCallId: 'planner',
          tool: 'prototype.plan',
          label: 'Plan prototype',
        },
      ]),
    } satisfies WorkspaceSnapshot

    expect(workspaceSnapshotFingerprint(started)).not.toBe(
      workspaceSnapshotFingerprint(toolStarted),
    )
  })

  it('fingerprints revision-bound Design OS authoring so approvals trigger autosave', () => {
    const base = snapshot(outcome('running', []))
    const authored = {
      ...base,
      designOsAuthoring: {
        version: 'design-os-authoring.v1',
        base: { documentId: 'project:1', revisionId: 'revision:1', revisionNumber: 1 },
        starterConfigs: [{ framework: 'vite-react', assetBindings: [], existingPaths: [] }],
      },
    } satisfies WorkspaceSnapshot

    expect(isWorkspaceSnapshotEmpty(authored)).toBe(false)
    expect(workspaceSnapshotFingerprint(authored)).not.toBe(workspaceSnapshotFingerprint(base))
  })

  it('fingerprints approved deliverable receipts so they survive project restart', () => {
    const base = snapshot(outcome('ready-to-deliver', []))
    const approved = { ...base, approvedDeliverables: [{ protocol: 'cutout.approved-deliverable.v1', approvalId: 'approval.one', approvedAt: '2026-07-12T00:00:00.000Z' }] as unknown as WorkspaceSnapshot['approvedDeliverables'] } satisfies WorkspaceSnapshot
    expect(isWorkspaceSnapshotEmpty(approved)).toBe(false)
    expect(workspaceSnapshotFingerprint(approved)).not.toBe(workspaceSnapshotFingerprint(base))
  })

  it('treats a Design IR-only legacy snapshot as persistent workspace state', () => {
    const irOnly = {
      ...snapshot(outcome('running', [])),
      outcome: undefined,
      designDocument: {
        version: 'design-ir.v1',
        meta: { id: 'design-document:legacy', title: 'Legacy', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        revision: { id: 'revision:legacy:1', number: 1, createdAt: '2026-01-01T00:00:00.000Z', author: { kind: 'import', id: 'legacy' } },
        needs: [],
        sources: [],
        materials: [],
        provenance: [],
        brands: [],
        tokens: [],
        components: [],
        relations: [],
      },
    } as WorkspaceSnapshot

    expect(isWorkspaceSnapshotEmpty(irOnly)).toBe(false)
    expect(workspaceSnapshotFingerprint(irOnly)).not.toBe('')
  })

  it('fingerprints full plan/page and attachment metadata changes for autosave', () => {
    const base = snapshot(outcome('running', []))
    const planned = {
      ...base,
      prototypePlan: {
        version: 'prototype-plan.v0',
        product: { name: 'Acme', projectName: 'Acme', summary: 'First', audience: 'Buyer', primaryGoal: 'Buy', platform: 'web' },
        designSystem: { styleSummary: 'Calm', palette: [], typography: 'Sans', spacing: '8px', componentPrinciples: [], assetDirection: 'Clean' },
        pages: [],
        flows: [],
        humanLoop: { mode: 'continue', rationale: 'Clear' },
      },
      prototypePages: [{
        page: { id: 'home', name: 'Home', route: '/', purpose: 'Browse', viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' }, regions: [], overlays: [], states: [], interactions: [] },
        bytes: new Uint8Array([1]), mediaType: 'image/png', width: 1440, height: 900,
      }],
      attachments: [{ id: 'reference', name: 'reference-a.png', bytes: new Uint8Array([1]), mediaType: 'image/png' }],
    } as WorkspaceSnapshot
    const changed = {
      ...planned,
      prototypePlan: { ...planned.prototypePlan!, product: { ...planned.prototypePlan!.product, summary: 'Second' } },
      prototypePages: [{ ...planned.prototypePages[0]!, page: { ...planned.prototypePages[0]!.page, route: '/store' } }],
      attachments: [{ ...planned.attachments[0]!, name: 'reference-b.png' }],
    } as WorkspaceSnapshot

    expect(workspaceSnapshotFingerprint(planned)).not.toBe(
      workspaceSnapshotFingerprint(changed),
    )
  })
})

function snapshot(outcomeState: OutcomeRuntimeState): WorkspaceSnapshot {
  return {
    version: 'workspace.v1',
    workflowPhase: 'idle',
    prototypePlan: null,
    prototypeScope: 'primary-flow',
    humanLoopChoiceId: null,
    humanLoopCustomAnswer: '',
    prototypeDesignSystem: null,
    prototypePages: [],
    selectedPrototypePageId: null,
    runError: null,
    namingStatus: 'idle',
    liveAgentOutput: '',
    attachments: [],
    webSearchEnabled: false,
    outcome: outcomeState,
  }
}

function outcome(
  status: OutcomeRuntimeState['status'],
  materials: OutcomeRuntimeState['materials'],
): OutcomeRuntimeState {
  return {
    version: 'outcome-runtime.v1',
    contract: {
      id: 'prototype:home',
      intent: 'Produce the home page',
      requirements: [
        { kind: 'prototype-page', minCount: 1, label: 'Prototype page' },
      ],
    },
    runId: 'workspace:prototype:home',
    status,
    materials,
    evaluation: {
      status: status === 'ready-to-deliver' ? 'satisfied' : 'needs-repair',
      missing:
        status === 'ready-to-deliver'
          ? []
          : [{ kind: 'prototype-page', count: 1, label: 'Prototype page' }],
    },
    events: [],
  }
}
