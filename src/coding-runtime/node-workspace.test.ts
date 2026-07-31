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
  executeCodingTask,
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
  it("binds revision checks to every task-scoped root, not only src", async () => {
    const { workspace, root } = await fixture();
    await mkdir(join(root, "app"));
    await writeFile(join(root, "app", "index.html"), "before");
    const snapshot = await workspace.snapshotId(["app"]);
    const task: CodingTask = {
      ...baseTask(snapshot),
      constraints: { allowedPaths: ["app"], allowedCommands: [] },
    };
    const patch: CodingPatch = {
      version: "cutout.coding-patch.v1",
      taskId: task.taskId,
      baseSnapshotId: snapshot,
      files: [
        {
          path: "app/index.html",
          operation: "replace",
          contents: "after",
        },
      ],
      rationale: "Apply the reviewed multi-route handoff.",
      provenance: { backend: "fake", inputRefs: ["prototype:home"] },
    };
    const stage = await workspace.stage(task, patch);
    await writeFile(join(root, "app", "index.html"), "external-change");

    expect(await workspace.snapshotId(["app"])).not.toBe(snapshot);
    await expect(
      workspace.promote(task, patch, stage.id, snapshot),
    ).rejects.toThrow("Repository changed before staged promotion");
    await workspace.rollback(stage.id);
    expect(await readFile(join(root, "app", "index.html"), "utf8")).toBe(
      "external-change",
    );
  });
  it("applies an Agent-authored HTML handoff with heterogeneous material refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutout-coding-journey-"));
    await mkdir(join(root, "app"));
    await writeFile(join(root, "app", "README.md"), "Controlled output root.");
    const routeMaterialScopes = [
      { route: "home", materialCount: 0 },
      { route: "catalog", materialCount: 2 },
      { route: "product", materialCount: 5 },
      { route: "cart", materialCount: 1 },
      { route: "account", materialCount: 3 },
      { route: "settings", materialCount: 0 },
    ] as const;
    const routes = routeMaterialScopes.map(({ route }) => route);
    const prototypeRefs = routes.map((route) => `prototype:${route}`);
    const imageAssetRefs = routeMaterialScopes.flatMap(({ route, materialCount }) =>
      Array.from({ length: materialCount }, (_, index) => `asset:${route}:${index + 1}`),
    );
    const workspace = createNodeCodingWorkspace(root, async (check, options) => {
      for (const route of routes) {
        const html = await readFile(join(options.root, "app", `${route}.html`), "utf8");
        if (!html.includes(`data-route="${route}"`)) {
          return { name: check, status: "failed", detail: `Missing ${route}.` };
        }
      }
      const manifest = JSON.parse(
        await readFile(join(options.root, "app", "resource-pack.json"), "utf8"),
      ) as { assets?: unknown[] };
      return manifest.assets?.length === imageAssetRefs.length
        ? { name: check, status: "passed" }
        : { name: check, status: "failed", detail: "Incomplete resource pack." };
    });
    const snapshot = await workspace.snapshotId(["app"]);
    const task: CodingTask = {
      version: "cutout.coding-task.v1",
      taskId: "coding:atlas-agent-authored-handoff",
      kind: "execute",
      goal: "Produce the reviewed route graph from selected design and materials.",
      acceptanceCriteria: ["Every approved route and attributable asset is represented."],
      repo: { snapshotId: snapshot, ref: "journey-fixture" },
      inputs: {
        designDocumentRef: "design-ir:atlas:selected-editorial-ledger",
        brandKitRefs: [],
        designKitRefs: ["design-kit:atlas:selected-editorial-ledger"],
        prototypeRefs,
        imageAssetRefs,
      },
      target: { stack: "existing-repository", packageManager: "pnpm" },
      constraints: { allowedPaths: ["app"], allowedCommands: ["build"] },
      expectedRevision: 1,
      budget: {
        maxChangedFiles: routes.length + 1,
        maxBytes: 100_000,
        maxDurationMs: 10_000,
      },
    };
    const files: CodingPatch["files"] = [
      ...routes.map((route) => ({
        path: `app/${route}.html`,
        operation: "create" as const,
        contents: `<!doctype html><html><body><nav>${routes
          .map((target) => `<a href="${target}.html">${target}</a>`)
          .join("")}</nav><main data-route="${route}">${route}</main></body></html>`,
      })),
      {
        path: "app/resource-pack.json",
        operation: "create" as const,
        contents: JSON.stringify({
          designSystem: task.inputs.designKitRefs[0],
          routes: prototypeRefs,
          assets: imageAssetRefs,
        }),
      },
    ];
    const backend = {
      id: "deterministic-coding-fixture",
      async propose(received: CodingTask): Promise<CodingPatch> {
        expect(received.inputs.prototypeRefs).toEqual(prototypeRefs);
        expect(received.inputs.imageAssetRefs).toEqual(imageAssetRefs);
        return {
          version: "cutout.coding-patch.v1",
          taskId: received.taskId,
          baseSnapshotId: received.repo.snapshotId,
          files,
          rationale: "Render every reviewed route and bind the attributable resource pack.",
          provenance: {
            backend: "deterministic-coding-fixture",
            inputRefs: [
              received.inputs.designDocumentRef,
              ...received.inputs.designKitRefs,
              ...received.inputs.prototypeRefs,
              ...received.inputs.imageAssetRefs,
            ],
          },
        };
      },
    };

    const receipt = await executeCodingTask(task, {
      backend,
      workspace,
      apply: true,
    });

    expect(receipt).toMatchObject({
      status: "applied",
      checks: [{ name: "build", status: "passed" }],
    });
    expect(receipt.changedFiles).toHaveLength(7);
    expect(receipt.provenance.inputRefs).toHaveLength(
      2 + prototypeRefs.length + imageAssetRefs.length,
    );
    for (const route of routes) {
      expect(await readFile(join(root, "app", `${route}.html`), "utf8")).toContain(
        `data-route="${route}"`,
      );
    }
  });
});
