import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createNodeCodingWorkspace,
  type CodingPatch,
  type CodingTask,
} from ".";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "cutout-coding-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "App.tsx"), "old");
  const checks = vi.fn(
    async (name: string, _options: { root: string; signal?: AbortSignal }) => ({
      name,
      status: "passed" as const,
    }),
  );
  return { root, checks, workspace: createNodeCodingWorkspace(root, checks) };
}
const baseTask = (snapshotId: string): CodingTask => ({
  version: "cutout.coding-task.v1",
  taskId: "coding:test",
  kind: "execute",
  goal: "Implement",
  acceptanceCriteria: ["Pass"],
  repo: { snapshotId },
  inputs: {
    designDocumentRef: "ir:1",
    brandKitRefs: [],
    designKitRefs: [],
    prototypeRefs: [],
    imageAssetRefs: [],
  },
  target: { stack: "existing-repository", packageManager: "pnpm" },
  constraints: { allowedPaths: ["src"], allowedCommands: ["test"] },
  expectedRevision: 1,
  budget: { maxChangedFiles: 2, maxBytes: 1000, maxDurationMs: 1000 },
});
describe("Node coding workspace", () => {
  it("previews and applies a hash-guarded patch below the controlled root", async () => {
    const { workspace, root, checks } = await fixture();
    const snapshot = await workspace.snapshotId();
    const patch: CodingPatch = {
      version: "cutout.coding-patch.v1",
      taskId: "coding:test",
      baseSnapshotId: snapshot,
      files: [{ path: "src/App.tsx", operation: "replace", contents: "new" }],
      rationale: "repair",
      provenance: { backend: "fake", inputRefs: [] },
    };
    expect(await workspace.preview(baseTask(snapshot), patch)).toMatchObject([
      { path: "src/App.tsx", operation: "replace" },
    ]);
    const stage = await workspace.stage(baseTask(snapshot), patch);
    expect(await readFile(join(root, "src/App.tsx"), "utf8")).toBe("old");
    await workspace.runChecks(["test"], undefined, stage.id);
    expect(checks.mock.calls.at(-1)?.[1].root).not.toBe(await realpath(root));
    const applied = await workspace.promote(
      baseTask(snapshot),
      patch,
      stage.id,
      snapshot,
    );
    await workspace.rollback(stage.id);
    expect(await readFile(join(root, "src/App.tsx"), "utf8")).toBe("new");
    expect(applied.snapshotId).not.toBe(snapshot);
  });
  it("rejects symlink traversal and never invokes arbitrary command strings", async () => {
    const { workspace, root, checks } = await fixture();
    await symlink(tmpdir(), join(root, "src", "escape"));
    await expect(workspace.readAllowed(["src/escape"])).rejects.toThrow(
      "Symbolic links",
    );
    await workspace.runChecks(["build"]);
    expect(checks).toHaveBeenCalledWith(
      "build",
      expect.objectContaining({ root: await realpath(root) }),
    );
  });
});
