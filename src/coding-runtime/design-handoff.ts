import type { GenerationService } from '@/services/ai/types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { NativeCodingWorkspaceBridge } from './native-workspace'
import type { CodingTask } from './contracts'
import { createAuthorizedCodingHost } from './authorized-host'
import { prepareCodingTask, type PreparedCodingTask, type CodingWorkspace } from './runtime'

export interface CodingHandoffAsset {
  readonly id: string
  readonly label: string
  readonly kind: 'design-system' | 'prototype-page' | 'slice'
  readonly mediaType: string
  readonly bytes: Uint8Array
  readonly pageId?: string
}

export interface ManagedCodingAssetReceipt {
  readonly id: string
  readonly path: string
  readonly sha256: string
  readonly byteLength: number
}

export interface ManagedCodingBridge {
  create(): Promise<{ readonly handle: string; readonly label: string }>
  seed(
    workspaceHandle: string,
    assets: readonly {
      id: string
      mediaType: string
      bytes: Uint8Array
      sha256: string
    }[],
  ): Promise<readonly ManagedCodingAssetReceipt[]>
}

export interface PreparedDesignCodingHandoff {
  readonly prepared: PreparedCodingTask
  readonly workspace: CodingWorkspace
  readonly workspaceHandle: string
  readonly workspaceLabel: string
  readonly assets: readonly ManagedCodingAssetReceipt[]
}

export async function prepareDesignCodingHandoff(input: {
  readonly generation: Pick<GenerationService, 'generateObject'>
  readonly assignment: ModelAssignment
  readonly managedBridge: ManagedCodingBridge
  readonly workspaceBridge: NativeCodingWorkspaceBridge
  readonly brief: string
  readonly designDocumentRef: string
  readonly designDocumentJson: string
  readonly designMarkdown: string
  readonly routeGraphJson: string
  readonly routeIds: readonly string[]
  readonly candidateId?: string
  readonly assets: readonly CodingHandoffAsset[]
  readonly expectedRevision: number
  readonly signal?: AbortSignal
}): Promise<PreparedDesignCodingHandoff> {
  if (input.routeIds.length === 0) throw new Error('Coding handoff requires at least one route.')
  if (input.assets.length === 0) throw new Error('Coding handoff requires visual materials.')
  const managed = await input.managedBridge.create()
  const seeded = await input.managedBridge.seed(
    managed.handle,
    await Promise.all(input.assets.map(async (asset) => ({
      id: asset.id,
      mediaType: supportedMediaType(asset.mediaType),
      bytes: asset.bytes,
      sha256: await sha256(asset.bytes),
    }))),
  )
  const seededById = new Map(seeded.map((asset) => [asset.id, asset]))
  const manifest = input.assets.map((asset, referenceIndex) => {
    const receipt = seededById.get(asset.id)
    if (!receipt) throw new Error(`Coding asset receipt is missing: ${asset.id}`)
    return {
      id: asset.id,
      label: asset.label,
      kind: asset.kind,
      pageId: asset.pageId,
      path: receipt.path,
      sha256: receipt.sha256,
      byteLength: receipt.byteLength,
      visualReferenceIndex: referenceIndex,
    }
  })
  const resolvedContext = {
    'cutout/brief.txt': input.brief,
    'cutout/design-ir.json': input.designDocumentJson,
    'cutout/DESIGN.md': input.designMarkdown,
    'cutout/routes.json': input.routeGraphJson,
    'cutout/assets.json': JSON.stringify({ version: 'cutout.coding-assets.v1', assets: manifest }),
  }
  const host = createAuthorizedCodingHost({
    workspaceHandle: managed.handle,
    generation: input.generation,
    assignment: input.assignment,
    bridge: input.workspaceBridge,
    resolvedContext,
    visualReferences: input.assets.map((asset) => asset.bytes),
  })
  const allowedPaths = ['site/pages', 'site/styles'] as const
  const snapshotId = await host.workspace.snapshotId(allowedPaths)
  const task: CodingTask = {
    version: 'cutout.coding-task.v1',
    taskId: `coding:design-handoff:${crypto.randomUUID()}`,
    kind: 'execute',
    goal: [
      'Create a runnable, high-fidelity static multi-route HTML implementation.',
      'Write route HTML below site/pages and shared CSS below site/styles.',
      'Consume the exact seeded asset paths from cutout/assets.json; do not redraw available art with CSS placeholders.',
      'Use the supplied Design IR, DESIGN.md, route graph, visual-reference order, and page/slice provenance as authority.',
    ].join(' '),
    acceptanceCriteria: [
      `Implement all ${input.routeIds.length} routes: ${input.routeIds.join(', ')}.`,
      'Every route is reachable through visible navigation and works from local static files.',
      'Typography, color, spacing, layout hierarchy, imagery, and responsive behavior match the supplied references.',
      'Reference seeded assets through relative site/assets paths and preserve their intended page attribution.',
      'Create site/pages/index.html as the runnable entry point and keep shared styling in site/styles.',
    ],
    repo: { snapshotId },
    inputs: {
      designDocumentRef: input.designDocumentRef,
      brandKitRefs: [],
      designKitRefs: input.candidateId ? [`design-system:${input.candidateId}`] : [],
      prototypeRefs: input.routeIds.map((route) => `prototype:${route}`),
      imageAssetRefs: seeded.map((asset) => `sha256:${asset.sha256}`),
    },
    target: { stack: 'existing-repository', packageManager: 'pnpm' },
    constraints: { allowedPaths: [...allowedPaths], allowedCommands: [] },
    expectedRevision: input.expectedRevision,
    budget: {
      maxChangedFiles: 200,
      maxBytes: 20_000_000,
      maxDurationMs: 600_000,
    },
  }
  return {
    prepared: await prepareCodingTask(task, {
      backend: host.backend,
      workspace: host.workspace,
      signal: input.signal,
    }),
    workspace: host.workspace,
    workspaceHandle: managed.handle,
    workspaceLabel: managed.label,
    assets: seeded,
  }
}

function supportedMediaType(value: string): string {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value)
    ? value
    : 'image/png'
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
