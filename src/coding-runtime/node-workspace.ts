import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { CodingPatch, CodingReceipt, CodingTask } from "./contracts";
import type { CodingWorkspace } from "./runtime";

export type ControlledCheckRunner = (
  check: CodingTask["constraints"]["allowedCommands"][number],
  options: { root: string; signal?: AbortSignal },
) => Promise<CodingReceipt["checks"][number]>;

export function createNodeCodingWorkspace(
  controlledRoot: string,
  runCheck: ControlledCheckRunner,
): CodingWorkspace {
  const requestedRoot = resolve(controlledRoot);
  const root = async () => {
    const canonical = await realpath(requestedRoot);
    const info = await stat(canonical);
    if (!info.isDirectory())
      throw new Error("Controlled coding root must be a directory.");
    return canonical;
  };
  const stages = new Map<string, string>();
  return {
    async snapshotId() {
      return snapshot(await root());
    },
    async readAllowed(paths) {
      const base = await root();
      const output: Record<string, string> = {};
      for (const path of paths)
        await collectFiles(base, await safePath(base, path, true), output);
      return output;
    },
    async preview(task, patch) {
      const base = await root();
      return Promise.all(
        patch.files.map((file) => inspectPatch(base, task, file)),
      );
    },
    async stage(task, patch) {
      const base = await root();
      await Promise.all(
        patch.files.map((file) => inspectPatch(base, task, file)),
      );
      const stageRoot = await mkdtemp(join(tmpdir(), "cutout-coding-stage-"));
      try {
        await cloneTree(base, stageRoot);
        const changedFiles = await applyPatch(stageRoot, task, patch);
        const id = randomUUID();
        stages.set(id, stageRoot);
        return { id, changedFiles };
      } catch (error) {
        await rm(stageRoot, { recursive: true, force: true });
        throw error;
      }
    },
    async runChecks(commands, signal, stageId) {
      const base = stageId ? stages.get(stageId) : await root();
      if (!base)
        throw new Error("revision-conflict: Unknown or expired coding stage.");
      const results: Array<CodingReceipt["checks"][number]> = [];
      for (const command of commands) {
        if (signal?.aborted)
          return [
            ...results,
            {
              name: command,
              status: "skipped",
              detail: "Cancelled before controlled check.",
            },
          ];
        results.push(await runCheck(command, { root: base, signal }));
      }
      return results;
    },
    async promote(task, patch, stageId, expectedSnapshotId) {
      const base = await root();
      if (!stages.has(stageId))
        throw new Error("revision-conflict: Unknown or expired coding stage.");
      if ((await snapshot(base)) !== expectedSnapshotId)
        throw new Error(
          "revision-conflict: Repository changed before staged promotion.",
        );
      const changedFiles = await applyPatch(base, task, patch);
      return { snapshotId: await snapshot(base), changedFiles };
    },
    async rollback(stageId) {
      const stageRoot = stages.get(stageId);
      stages.delete(stageId);
      if (stageRoot) await rm(stageRoot, { recursive: true, force: true });
    },
  };
}

async function applyPatch(base: string, task: CodingTask, patch: CodingPatch) {
  await Promise.all(patch.files.map((file) => inspectPatch(base, task, file)));
  const transaction = resolve(base, `.cutout-coding-${randomUUID()}`);
  await mkdir(transaction, { recursive: false });
  const touched: { target: string; backup?: string; existed: boolean }[] = [];
  try {
    for (const [index, file] of patch.files.entries()) {
      const target = await safePath(base, file.path, false);
      const existed = await exists(target);
      const backup = existed ? resolve(transaction, String(index)) : undefined;
      if (backup) {
        await mkdir(dirname(backup), { recursive: true });
        await rename(target, backup);
      }
      touched.push({ target, backup, existed });
      if (file.operation !== "delete") {
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.cutout-${randomUUID()}`;
        await writeFile(temporary, file.contents ?? "", {
          flag: "wx",
          mode: 0o644,
        });
        await rename(temporary, target);
      }
    }
  } catch (error) {
    for (const item of touched.reverse()) {
      await rm(item.target, { recursive: true, force: true });
      if (item.existed && item.backup) {
        await mkdir(dirname(item.target), { recursive: true });
        await rename(item.backup, item.target);
      }
    }
    throw error;
  } finally {
    await rm(transaction, { recursive: true, force: true });
  }
  return inspectApplied(base, patch);
}

async function inspectApplied(base: string, patch: CodingPatch) {
  return Promise.all(
    patch.files.map(async (file) => ({
      path: file.path,
      operation: file.operation,
      ...(file.operation === "delete"
        ? {}
        : {
            sha256: hash(await readFile(await safePath(base, file.path, true))),
          }),
    })),
  );
}

async function cloneTree(source: string, target: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name.startsWith(".cutout-coding-"))
      continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(
        `policy-denied: Symbolic links cannot enter a coding stage: ${entry.name}`,
      );
    if (entry.isDirectory()) {
      await mkdir(to);
      await cloneTree(from, to);
    } else if (entry.isFile())
      await copyFile(from, to, constants.COPYFILE_FICLONE);
  }
}

async function inspectPatch(
  base: string,
  task: CodingTask,
  file: CodingPatch["files"][number],
) {
  const target = await safePath(base, file.path, false);
  const existsNow = await exists(target);
  if (file.operation === "create" && existsNow)
    throw new Error(
      `revision-conflict: Create target already exists: ${file.path}`,
    );
  if (
    (file.operation === "replace" || file.operation === "delete") &&
    !existsNow
  )
    throw new Error(
      `revision-conflict: Patch target does not exist: ${file.path}`,
    );
  let previousSha256: string | undefined;
  if (existsNow) {
    const info = await lstat(target);
    if (!info.isFile())
      throw new Error(
        `policy-denied: Patch target is not a regular file: ${file.path}`,
      );
    previousSha256 = hash(await readFile(target));
    if (file.previousSha256 && previousSha256 !== file.previousSha256)
      throw new Error(
        `revision-conflict: Previous file hash changed: ${file.path}`,
      );
  }
  if (
    !task.constraints.allowedPaths.some(
      (path) =>
        file.path === path ||
        file.path.startsWith(`${path.replace(/\/$/, "")}/`),
    )
  )
    throw new Error(
      `policy-denied: Patch target is outside allowed paths: ${file.path}`,
    );
  return {
    path: file.path,
    operation: file.operation,
    ...(file.operation === "delete"
      ? {}
      : { sha256: hash(file.contents ?? "") }),
  };
}

async function safePath(base: string, requested: string, mustExist: boolean) {
  const target = resolve(base, requested);
  if (target !== base && !target.startsWith(`${base}${sep}`))
    throw new Error("policy-denied: Coding path escapes the controlled root.");
  const rel = relative(base, target);
  let cursor = base;
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error(
          "policy-denied: Symbolic links are not allowed in controlled coding paths.",
        );
    } catch (error) {
      if (!isMissing(error)) throw error;
      break;
    }
  }
  if (mustExist) await lstat(target);
  return target;
}

async function collectFiles(
  base: string,
  target: string,
  output: Record<string, string>,
) {
  const info = await lstat(target);
  if (info.isSymbolicLink())
    throw new Error("policy-denied: Symbolic links are not readable.");
  if (info.isFile()) {
    output[relative(base, target).replaceAll(sep, "/")] = await readFile(
      target,
      "utf8",
    );
    return;
  }
  if (!info.isDirectory()) return;
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(target))
    await collectFiles(
      base,
      await safePath(base, relative(base, resolve(target, entry)), true),
      output,
    );
}

async function snapshot(base: string) {
  const files: Record<string, string> = {};
  for (const entry of ["src", "package.json", "tsconfig.json"]) {
    try {
      await collectFiles(base, await safePath(base, entry, true), files);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return `sha256:${hash(JSON.stringify(Object.entries(files).sort()))}`;
}
function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}
function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}
