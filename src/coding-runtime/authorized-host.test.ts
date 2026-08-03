import { describe, expect, it, vi } from 'vitest'
import { createAuthorizedCodingHost } from './authorized-host'
import type { CodingPatch, CodingTask } from './contracts'
import type { NativeCodingWorkspaceBridge } from './native-workspace'

const task: CodingTask = {
  version: 'cutout.coding-task.v1',
  taskId: 'coding:authorized-host',
  kind: 'execute',
  goal: 'Build the reviewed route.',
  acceptanceCriteria: ['The controlled build passes.'],
  repo: { snapshotId: 'sha256:base' },
  inputs: {
    designDocumentRef: 'design-ir:selected',
    brandKitRefs: [],
    designKitRefs: ['design-kit:selected'],
    prototypeRefs: ['prototype:home'],
    imageAssetRefs: ['asset:hero'],
  },
  target: { stack: 'vite-react', packageManager: 'pnpm' },
  constraints: { allowedPaths: ['app'], allowedCommands: ['typecheck'] },
  expectedRevision: 4,
  budget: { maxChangedFiles: 4, maxBytes: 20_000, maxDurationMs: 30_000 },
}

const patch: CodingPatch = {
  version: 'cutout.coding-patch.v1',
  taskId: task.taskId,
  baseSnapshotId: task.repo.snapshotId,
  files: [{ path: 'app/index.html', operation: 'create', contents: '<main />' }],
  rationale: 'Implemented the selected prototype.',
  provenance: { backend: 'provider:verified:model', inputRefs: [] },
}

function bridge(): NativeCodingWorkspaceBridge {
  return {
    snapshot: vi.fn(async () => ({ snapshotId: task.repo.snapshotId })),
    readAllowed: vi.fn(async () => ({ 'app/README.md': 'Approved context.' })),
    preview: vi.fn(async () => patch.files),
    stage: vi.fn(async () => ({ id: 'stage.opaque', changedFiles: patch.files })),
    runChecks: vi.fn(async () => [{ name: 'typecheck', status: 'passed' as const }]),
    promote: vi.fn(async () => ({ snapshotId: 'sha256:next', changedFiles: patch.files })),
    rollback: vi.fn(async () => undefined),
  }
}

describe('authorized coding host', () => {
  it('binds provider generation to one opaque native workspace handle', async () => {
    const native = bridge()
    const generateObject = vi.fn(async (_input, schema) => ({
      ok: true as const,
      data: schema.parse({ files: patch.files, rationale: patch.rationale }),
    }))
    const host = createAuthorizedCodingHost({
      workspaceHandle: 'workspace.reviewed-1',
      generation: { generateObject },
      assignment: { providerId: 'verified', model: 'model' },
      bridge: native,
    })

    await expect(host.workspace.snapshotId(['app'])).resolves.toBe(task.repo.snapshotId)
    await expect(host.backend.propose(task, { 'app/README.md': 'Approved context.' })).resolves.toMatchObject({
      taskId: task.taskId,
      provenance: { backend: 'provider:verified:model' },
    })

    expect(native.snapshot).toHaveBeenCalledWith('workspace.reviewed-1', ['app'])
    expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'verified',
      model: 'model',
    }), expect.anything())
  })

  it('keeps check execution stage-bound and rejects path-shaped handles', async () => {
    const native = bridge()
    const host = createAuthorizedCodingHost({
      workspaceHandle: 'workspace.reviewed-1',
      generation: { generateObject: vi.fn() as never },
      assignment: { providerId: 'verified', model: 'model' },
      bridge: native,
    })
    const stage = await host.workspace.stage(task, patch)
    await host.workspace.runChecks(['typecheck'], undefined, stage.id)
    expect(native.runChecks).toHaveBeenCalledWith(
      'workspace.reviewed-1',
      'stage.opaque',
      ['typecheck'],
      task.budget.maxDurationMs,
    )
    expect(() => createAuthorizedCodingHost({
      workspaceHandle: '/Users/alice/project',
      generation: { generateObject: vi.fn() as never },
      assignment: { providerId: 'verified', model: 'model' },
      bridge: native,
    })).toThrow('handle is invalid')
  })
})
