import type { CodingPatch, CodingReceipt, CodingTask } from './contracts'
import type { CodingWorkspace } from './runtime'

export interface NativeCodingWorkspaceBridge {
  snapshot(
    workspaceHandle: string,
    paths: readonly string[],
  ): Promise<{ readonly snapshotId: string }>
  readAllowed(
    workspaceHandle: string,
    paths: readonly string[],
  ): Promise<Readonly<Record<string, string>>>
  preview(
    workspaceHandle: string,
    task: CodingTask,
    patch: CodingPatch,
  ): Promise<CodingReceipt['changedFiles']>
  stage(
    workspaceHandle: string,
    task: CodingTask,
    patch: CodingPatch,
  ): Promise<{
    readonly id: string
    readonly changedFiles: CodingReceipt['changedFiles']
  }>
  runChecks(
    workspaceHandle: string,
    stageId: string,
    commands: CodingTask['constraints']['allowedCommands'],
    maxDurationMs: number,
  ): Promise<CodingReceipt['checks']>
  promote(
    workspaceHandle: string,
    task: CodingTask,
    patch: CodingPatch,
    stageId: string,
    expectedSnapshotId: string,
  ): Promise<{
    readonly snapshotId: string
    readonly approvalId?: string
    readonly changedFiles: CodingReceipt['changedFiles']
  }>
  rollback(workspaceHandle: string, stageId: string): Promise<void>
}

export function createNativeCodingWorkspace(
  workspaceHandle: string,
  bridge: NativeCodingWorkspaceBridge,
): CodingWorkspace {
  if (!/^[A-Za-z0-9._:-]{3,256}$/.test(workspaceHandle)) {
    throw new Error('Authorized workspace handle is invalid.')
  }
  const stageBudgets = new Map<string, number>()
  return {
    async snapshotId(paths = ['src']) {
      return (await bridge.snapshot(workspaceHandle, paths)).snapshotId
    },
    readAllowed: (paths) => bridge.readAllowed(workspaceHandle, paths),
    preview: (task, patch) => bridge.preview(workspaceHandle, task, patch),
    async stage(task, patch) {
      const stage = await bridge.stage(workspaceHandle, task, patch)
      stageBudgets.set(stage.id, task.budget.maxDurationMs)
      return stage
    },
    async runChecks(commands, signal, stageId) {
      if (!stageId) {
        throw new Error('revision-conflict: A native coding stage is required.')
      }
      if (signal?.aborted) {
        return commands.map((name) => ({
          name,
          status: 'skipped' as const,
          detail: 'Cancelled before controlled check.',
        }))
      }
      const maxDurationMs = stageBudgets.get(stageId)
      if (maxDurationMs === undefined) {
        throw new Error('revision-conflict: Unknown or expired coding stage.')
      }
      return bridge.runChecks(
        workspaceHandle,
        stageId,
        commands,
        maxDurationMs,
      )
    },
    promote: (task, patch, stageId, expectedSnapshotId) =>
      bridge.promote(
        workspaceHandle,
        task,
        patch,
        stageId,
        expectedSnapshotId,
      ),
    async rollback(stageId) {
      stageBudgets.delete(stageId)
      await bridge.rollback(workspaceHandle, stageId)
    },
  }
}
