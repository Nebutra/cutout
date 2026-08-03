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
  snapshotId(paths?: readonly string[]): Promise<string>;
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
    approvalId?: string;
    changedFiles: readonly {
      path: string;
      operation: "create" | "replace" | "delete";
      sha256?: string;
    }[];
  }>;
  rollback(stageId: string): Promise<void>;
}

export interface PreparedCodingTask {
  readonly task: CodingTask;
  readonly patch: CodingPatch;
  readonly backendId: string;
  readonly patchSha256: string;
  readonly changedFiles: CodingReceipt["changedFiles"];
  readonly startedAt: number;
  readonly receipt: CodingReceipt;
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
  if (options.signal?.aborted) {
    const task = codingTaskSchema.parse(input);
    if (!options.backend || !options.workspace)
      throw new Error(
        "capability-required: A controlled coding backend and workspace are required.",
      );
    const startedAt = (options.now ?? Date.now)();
    return cancelled(task, options.backend.id, startedAt, options.now);
  }
  const prepared = await prepareCodingTask(input, options);
  if (!options.apply) return prepared.receipt;
  return applyPreparedCodingTask(prepared, options);
}

export async function prepareCodingTask(
  input: unknown,
  options: {
    backend?: CodingBackend;
    workspace?: CodingWorkspace;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<PreparedCodingTask> {
  const task = codingTaskSchema.parse(input);
  if (!options.backend || !options.workspace)
    throw new Error(
      "capability-required: A controlled coding backend and workspace are required.",
    );
  const startedAt = (options.now ?? Date.now)();
  if (options.signal?.aborted) throw new Error("coding-cancelled: Coding task was cancelled before preview.");
  const snapshotId = await options.workspace.snapshotId(
    task.constraints.allowedPaths,
  );
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
  const patchSha256 = await digest(JSON.stringify(patch));
  const changedFiles = await options.workspace.preview(task, patch);
  const receipt = codingReceiptSchema.parse({
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
  return {
    task,
    patch,
    backendId: options.backend.id,
    patchSha256,
    changedFiles: receipt.changedFiles,
    startedAt,
    receipt,
  };
}

export async function applyPreparedCodingTask(
  input: PreparedCodingTask,
  options: {
    workspace?: CodingWorkspace;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<CodingReceipt> {
  if (!options.workspace)
    throw new Error(
      "capability-required: A controlled coding workspace is required.",
    );
  const task = codingTaskSchema.parse(input.task);
  const patch = codingPatchSchema.parse(input.patch);
  const snapshotId = task.repo.snapshotId;
  const currentDigest = await digest(JSON.stringify(patch));
  if (currentDigest !== input.patchSha256 || input.receipt.provenance.patchSha256 !== currentDigest)
    throw new Error("revision-conflict: Coding patch changed after preview.");
  if (patch.taskId !== task.taskId || patch.baseSnapshotId !== task.repo.snapshotId)
    throw new Error("revision-conflict: Prepared coding patch no longer matches its task.");
  if (
    (await options.workspace.snapshotId(task.constraints.allowedPaths)) !==
    task.repo.snapshotId
  )
    throw new Error("revision-conflict: Repository changed after coding preview.");
  enforceBudgetAndPaths(task, patch);
  enforceTimeBudget(task, input.startedAt, options.now);
  if (options.signal?.aborted)
    return cancelled(
      task,
      input.backendId,
      input.startedAt,
      options.now,
      input.patchSha256,
    );
  const stage = await options.workspace.stage(task, patch);
  try {
    if (options.signal?.aborted)
      return cancelled(
        task,
        input.backendId,
        input.startedAt,
        options.now,
        input.patchSha256,
      );
    const checks = await options.workspace.runChecks(
      task.constraints.allowedCommands,
      options.signal,
      stage.id,
    );
    enforceTimeBudget(task, input.startedAt, options.now);
    if (options.signal?.aborted)
      return cancelled(
        task,
        input.backendId,
        input.startedAt,
        options.now,
        input.patchSha256,
      );
    const failed = checks.some((check) => check.status !== "passed");
    if (failed)
      return codingReceiptSchema.parse({
        version: "cutout.coding-receipt.v1",
        receiptId: `coding-receipt:${input.patchSha256.slice(0, 24)}`,
        taskId: task.taskId,
        status: "failed",
        baseSnapshotId: snapshotId,
        changedFiles: stage.changedFiles,
        checks,
        screenshots: [],
        provenance: {
          backend: input.backendId,
          inputRefs: inputRefs(task),
          patchSha256: input.patchSha256,
        },
        startedAt: input.startedAt,
        completedAt: (options.now ?? Date.now)(),
        detail:
          "Staged changes were rolled back because one or more controlled quality checks did not pass.",
      });
    if (
      (await options.workspace.snapshotId(task.constraints.allowedPaths)) !==
      snapshotId
    )
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
      receiptId: `coding-receipt:${input.patchSha256.slice(0, 24)}`,
      taskId: task.taskId,
      status: "applied",
      baseSnapshotId: snapshotId,
      resultSnapshotId: applied.snapshotId,
      ...(applied.approvalId ? { approvalId: applied.approvalId } : {}),
      changedFiles: applied.changedFiles,
      checks,
      screenshots: [],
      provenance: {
        backend: input.backendId,
        inputRefs: inputRefs(task),
        patchSha256: input.patchSha256,
      },
      startedAt: input.startedAt,
      completedAt: (options.now ?? Date.now)(),
    });
  } finally {
    await options.workspace.rollback(stage.id);
  }
}

function enforceBudgetAndPaths(task: CodingTask, patch: CodingPatch) {
  if (patch.files.length > task.budget.maxChangedFiles)
    throw new Error("budget-exceeded: Coding patch changes too many files.");
  const encoder = new TextEncoder();
  const bytes = patch.files.reduce(
    (sum, file) => sum + encoder.encode(file.contents ?? "").byteLength,
    0,
  );
  if (bytes > task.budget.maxBytes)
    throw new Error("budget-exceeded: Coding patch exceeds the byte budget.");
  if (
    patch.files.some((file) =>
      /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i.test(
        file.contents ?? "",
      ),
    )
  )
    throw new Error(
      "policy-denied: Coding patch contains credential-shaped data.",
    );
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
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hashed].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
