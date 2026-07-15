import { createHash } from "node:crypto";
import {
  codingPatchSchema,
  codingReceiptSchema,
  codingTaskSchema,
  type CodingPatch,
  type CodingReceipt,
  type CodingTask,
} from "./contracts";

export interface CodingBackend {
  readonly id: string;
  propose(
    task: CodingTask,
    context: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<CodingPatch>;
}

export interface CodingWorkspace {
  snapshotId(): Promise<string>;
  readAllowed(
    paths: readonly string[],
  ): Promise<Readonly<Record<string, string>>>;
  preview(
    task: CodingTask,
    patch: CodingPatch,
  ): Promise<
    readonly {
      path: string;
      operation: "create" | "replace" | "delete";
      sha256?: string;
    }[]
  >;
  stage(
    task: CodingTask,
    patch: CodingPatch,
  ): Promise<{
    id: string;
    changedFiles: readonly {
      path: string;
      operation: "create" | "replace" | "delete";
      sha256?: string;
    }[];
  }>;
  runChecks(
    commands: CodingTask["constraints"]["allowedCommands"],
    signal?: AbortSignal,
    stageId?: string,
  ): Promise<CodingReceipt["checks"]>;
  promote(
    task: CodingTask,
    patch: CodingPatch,
    stageId: string,
    expectedSnapshotId: string,
  ): Promise<{
    snapshotId: string;
    changedFiles: readonly {
      path: string;
      operation: "create" | "replace" | "delete";
      sha256?: string;
    }[];
  }>;
  rollback(stageId: string): Promise<void>;
}

export async function executeCodingTask(
  input: unknown,
  options: {
    backend?: CodingBackend;
    workspace?: CodingWorkspace;
    apply: boolean;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<CodingReceipt> {
  const task = codingTaskSchema.parse(input);
  if (!options.backend || !options.workspace)
    throw new Error(
      "capability-required: A controlled coding backend and workspace are required.",
    );
  const startedAt = (options.now ?? Date.now)();
  if (options.signal?.aborted)
    return cancelled(task, options.backend.id, startedAt, options.now);
  const snapshotId = await options.workspace.snapshotId();
  if (snapshotId !== task.repo.snapshotId)
    throw new Error(
      "revision-conflict: Repository snapshot does not match CodingTask.repo.snapshotId.",
    );
  const context = await options.workspace.readAllowed(
    task.constraints.allowedPaths,
  );
  const patch = codingPatchSchema.parse(
    await options.backend.propose(task, context, options.signal),
  );
  enforceTimeBudget(task, startedAt, options.now);
  if (patch.taskId !== task.taskId || patch.baseSnapshotId !== snapshotId)
    throw new Error(
      "revision-conflict: Coding patch targets a different task or repository snapshot.",
    );
  enforceBudgetAndPaths(task, patch);
  const patchSha256 = digest(JSON.stringify(patch));
  const changedFiles = await options.workspace.preview(task, patch);
  if (!options.apply)
    return codingReceiptSchema.parse({
      version: "cutout.coding-receipt.v1",
      receiptId: `coding-receipt:${patchSha256.slice(0, 24)}`,
      taskId: task.taskId,
      status: "previewed",
      baseSnapshotId: snapshotId,
      changedFiles,
      checks: [],
      screenshots: [],
      provenance: {
        backend: options.backend.id,
        inputRefs: inputRefs(task),
        patchSha256,
      },
      startedAt,
      completedAt: (options.now ?? Date.now)(),
    });
  if (options.signal?.aborted)
    return cancelled(
      task,
      options.backend.id,
      startedAt,
      options.now,
      patchSha256,
    );
  const stage = await options.workspace.stage(task, patch);
  try {
    if (options.signal?.aborted)
      return cancelled(
        task,
        options.backend.id,
        startedAt,
        options.now,
        patchSha256,
      );
    const checks = await options.workspace.runChecks(
      task.constraints.allowedCommands,
      options.signal,
      stage.id,
    );
    enforceTimeBudget(task, startedAt, options.now);
    if (options.signal?.aborted)
      return cancelled(
        task,
        options.backend.id,
        startedAt,
        options.now,
        patchSha256,
      );
    const failed = checks.some((check) => check.status !== "passed");
    if (failed)
      return codingReceiptSchema.parse({
        version: "cutout.coding-receipt.v1",
        receiptId: `coding-receipt:${patchSha256.slice(0, 24)}`,
        taskId: task.taskId,
        status: "failed",
        baseSnapshotId: snapshotId,
        changedFiles: stage.changedFiles,
        checks,
        screenshots: [],
        provenance: {
          backend: options.backend.id,
          inputRefs: inputRefs(task),
          patchSha256,
        },
        startedAt,
        completedAt: (options.now ?? Date.now)(),
        detail:
          "Staged changes were rolled back because one or more controlled quality checks did not pass.",
      });
    if ((await options.workspace.snapshotId()) !== snapshotId)
      throw new Error(
        "revision-conflict: Repository changed before staged promotion.",
      );
    const applied = await options.workspace.promote(
      task,
      patch,
      stage.id,
      snapshotId,
    );
    return codingReceiptSchema.parse({
      version: "cutout.coding-receipt.v1",
      receiptId: `coding-receipt:${patchSha256.slice(0, 24)}`,
      taskId: task.taskId,
      status: "applied",
      baseSnapshotId: snapshotId,
      resultSnapshotId: applied.snapshotId,
      changedFiles: applied.changedFiles,
      checks,
      screenshots: [],
      provenance: {
        backend: options.backend.id,
        inputRefs: inputRefs(task),
        patchSha256,
      },
      startedAt,
      completedAt: (options.now ?? Date.now)(),
    });
  } finally {
    await options.workspace.rollback(stage.id);
  }
}

function enforceBudgetAndPaths(task: CodingTask, patch: CodingPatch) {
  if (patch.files.length > task.budget.maxChangedFiles)
    throw new Error("budget-exceeded: Coding patch changes too many files.");
  const bytes = patch.files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.contents ?? ""),
    0,
  );
  if (bytes > task.budget.maxBytes)
    throw new Error("budget-exceeded: Coding patch exceeds the byte budget.");
  const allowed = task.constraints.allowedPaths.map((path) =>
    path.replace(/\/$/, ""),
  );
  for (const file of patch.files)
    if (
      !allowed.some(
        (root) => file.path === root || file.path.startsWith(`${root}/`),
      )
    )
      throw new Error(
        `policy-denied: Patch path is outside CodingTask.constraints.allowedPaths: ${file.path}`,
      );
}
function enforceTimeBudget(
  task: CodingTask,
  startedAt: number,
  now = Date.now,
) {
  if (now() - startedAt > task.budget.maxDurationMs)
    throw new Error("budget-exceeded: Coding task exceeded its time budget.");
}

function inputRefs(task: CodingTask) {
  return [
    task.inputs.designDocumentRef,
    ...task.inputs.brandKitRefs,
    ...task.inputs.designKitRefs,
    ...task.inputs.prototypeRefs,
    ...task.inputs.imageAssetRefs,
  ];
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function cancelled(
  task: CodingTask,
  backend: string,
  startedAt: number,
  now = Date.now,
  patchSha256 = "0".repeat(64),
): CodingReceipt {
  return codingReceiptSchema.parse({
    version: "cutout.coding-receipt.v1",
    receiptId: `coding-receipt:cancelled:${task.taskId}`,
    taskId: task.taskId,
    status: "cancelled",
    baseSnapshotId: task.repo.snapshotId,
    changedFiles: [],
    checks: [],
    screenshots: [],
    provenance: { backend, inputRefs: inputRefs(task), patchSha256 },
    startedAt,
    completedAt: now(),
  });
}
