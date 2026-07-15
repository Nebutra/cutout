import { describe, expect, it, vi } from "vitest";
import {
  executeCodingTask,
  type CodingBackend,
  type CodingPatch,
  type CodingTask,
  type CodingWorkspace,
} from ".";

const task: CodingTask = {
  version: "cutout.coding-task.v1",
  taskId: "coding:home",
  kind: "execute",
  goal: "Implement home",
  acceptanceCriteria: ["Build passes"],
  repo: { snapshotId: "snapshot-1", ref: "main" },
  inputs: {
    designDocumentRef: "design-ir:1",
    brandKitRefs: ["brand:1"],
    designKitRefs: ["kit:1"],
    prototypeRefs: ["prototype:home"],
    imageAssetRefs: ["asset:hero"],
  },
  target: { stack: "vite-react", packageManager: "pnpm" },
  constraints: {
    allowedPaths: ["src"],
    allowedCommands: ["typecheck", "build"],
  },
  expectedRevision: 3,
  budget: { maxChangedFiles: 3, maxBytes: 10_000, maxDurationMs: 60_000 },
};
const patch: CodingPatch = {
  version: "cutout.coding-patch.v1",
  taskId: task.taskId,
  baseSnapshotId: "snapshot-1",
  files: [
    {
      path: "src/Home.tsx",
      operation: "create",
      contents: "export function Home(){return <main/>}",
    },
  ],
  rationale: "Implement the verified layout contract.",
  provenance: { backend: "fake-agent", inputRefs: ["prototype:home"] },
};

function fixture() {
  const backend: CodingBackend = {
    id: "fake-agent",
    propose: vi.fn(async () => patch),
  };
  const workspace: CodingWorkspace = {
    snapshotId: vi.fn(async () => "snapshot-1"),
    readAllowed: vi.fn(async () => ({ "src/index.ts": "" })),
    preview: vi.fn(async () => [
      {
        path: "src/Home.tsx",
        operation: "create" as const,
        sha256: "a".repeat(64),
      },
    ]),
    stage: vi.fn(async () => ({
      id: "stage-1",
      changedFiles: [
        {
          path: "src/Home.tsx",
          operation: "create" as const,
          sha256: "a".repeat(64),
        },
      ],
    })),
    promote: vi.fn(async () => ({
      snapshotId: "snapshot-2",
      changedFiles: [
        {
          path: "src/Home.tsx",
          operation: "create" as const,
          sha256: "a".repeat(64),
        },
      ],
    })),
    runChecks: vi.fn(async () => [
      { name: "typecheck", status: "passed" as const },
      { name: "build", status: "passed" as const },
    ]),
    rollback: vi.fn(async () => undefined),
  };
  return { backend, workspace };
}

describe("controlled coding runtime", () => {
  it("previews a multimodal-backed patch without applying or running commands", async () => {
    const { backend, workspace } = fixture();
    const receipt = await executeCodingTask(task, {
      backend,
      workspace,
      apply: false,
      now: () => 10,
    });
    expect(receipt).toMatchObject({
      status: "previewed",
      baseSnapshotId: "snapshot-1",
      changedFiles: [{ path: "src/Home.tsx" }],
    });
    expect(workspace.stage).not.toHaveBeenCalled();
    expect(workspace.runChecks).not.toHaveBeenCalled();
  });
  it("applies once then records allowlisted checks and provenance", async () => {
    const { backend, workspace } = fixture();
    const receipt = await executeCodingTask(task, {
      backend,
      workspace,
      apply: true,
      now: () => 20,
    });
    expect(receipt).toMatchObject({
      status: "applied",
      resultSnapshotId: "snapshot-2",
      checks: [
        { name: "typecheck", status: "passed" },
        { name: "build", status: "passed" },
      ],
      provenance: {
        backend: "fake-agent",
        inputRefs: [
          "design-ir:1",
          "brand:1",
          "kit:1",
          "prototype:home",
          "asset:hero",
        ],
      },
    });
  });
  it("rejects traversal, secret paths, stale snapshots, out-of-scope patches and budgets", async () => {
    const { backend, workspace } = fixture();
    await expect(
      executeCodingTask(
        {
          ...task,
          constraints: { ...task.constraints, allowedPaths: ["../src"] },
        },
        { backend, workspace, apply: false },
      ),
    ).rejects.toThrow();
    await expect(
      executeCodingTask(
        {
          ...task,
          constraints: { ...task.constraints, allowedPaths: [".env"] },
        },
        { backend, workspace, apply: false },
      ),
    ).rejects.toThrow();
    workspace.snapshotId = vi.fn(async () => "stale");
    await expect(
      executeCodingTask(task, { backend, workspace, apply: false }),
    ).rejects.toThrow("revision-conflict");
  });
  it("never reports success without a real injected backend and workspace", async () => {
    await expect(executeCodingTask(task, { apply: true })).rejects.toThrow(
      "capability-required",
    );
  });
  it("enforces the declared time budget after backend work", async () => {
    const fixtureValue = fixture();
    let now = 0;
    fixtureValue.backend.propose = vi.fn(async () => {
      now = 60_001;
      return patch;
    });
    await expect(
      executeCodingTask(task, {
        ...fixtureValue,
        apply: false,
        now: () => now,
      }),
    ).rejects.toThrow("budget-exceeded");
  });
  it("supports a deterministic build failure followed by a repair task", async () => {
    const first = fixture();
    first.workspace.runChecks = vi.fn(async () => [
      { name: "build", status: "failed" as const, detail: "TS2322" },
    ]);
    expect(
      (await executeCodingTask(task, { ...first, apply: true })).status,
    ).toBe("failed");
    const repair = fixture();
    repair.workspace.snapshotId = vi.fn(async () => "snapshot-2");
    repair.backend.propose = vi.fn(async () => ({
      ...patch,
      taskId: "coding:repair-home",
      baseSnapshotId: "snapshot-2",
    }));
    const repaired = await executeCodingTask(
      {
        ...task,
        taskId: "coding:repair-home",
        kind: "repair",
        repo: { snapshotId: "snapshot-2" },
      },
      { ...repair, apply: true },
    );
    expect(repaired.status).toBe("applied");
  });
  it("rolls back staged changes on failed checks and rejects a stale CAS promotion", async () => {
    const failed = fixture();
    failed.workspace.runChecks = vi.fn(async () => [
      { name: "build", status: "failed" as const, detail: "TS2322" },
    ]);
    const receipt = await executeCodingTask(task, { ...failed, apply: true });
    expect(receipt).toMatchObject({
      status: "failed",
      detail: expect.stringMatching(/rolled back/),
    });
    expect(receipt.resultSnapshotId).toBeUndefined();
    expect(failed.workspace.promote).not.toHaveBeenCalled();
    expect(failed.workspace.rollback).toHaveBeenCalledWith("stage-1");

    const stale = fixture();
    stale.workspace.snapshotId = vi
      .fn()
      .mockResolvedValueOnce("snapshot-1")
      .mockResolvedValueOnce("snapshot-external-change");
    await expect(
      executeCodingTask(task, { ...stale, apply: true }),
    ).rejects.toThrow(/changed before staged promotion/);
    expect(stale.workspace.promote).not.toHaveBeenCalled();
    expect(stale.workspace.rollback).toHaveBeenCalledWith("stage-1");
  });
});
