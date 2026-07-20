import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSandboxPath, runControlledCommand } from "./node-host";

const limits = { maxDurationMs: 2_000, maxBytes: 10_000, maxProcesses: 2 };
describe("node sandbox host", () => {
  it("rejects absolute, traversal, and symlink escape paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutout-sandbox-"));
    await mkdir(join(root, "src"));
    await symlink(tmpdir(), join(root, "src", "escape"));
    await expect(resolveSandboxPath(root, "/tmp")).rejects.toThrow("absolute-path");
    await expect(resolveSandboxPath(root, "../escape")).rejects.toThrow("path-traversal");
    await expect(resolveSandboxPath(root, "src/escape/file")).rejects.toThrow("symlink-escape");
  });
  it.skipIf(process.platform === "win32")("runs only a host-mapped command with a secret-free environment", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutout-sandbox-"));
    const result = await runControlledCommand({ root, command: "test", commands: { test: { file: process.execPath, args: ["-e", "process.stdout.write(String(Boolean(process.env.MOX_API_KEY)))"] } } as never, limits, env: { PATH: process.env.PATH, MOX_API_KEY: "secret" } });
    expect(result.stdout).toBe("false");
  });
  it.runIf(process.platform === "win32")("fails closed when reliable process-tree cancellation is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutout-sandbox-"));
    await expect(runControlledCommand({ root, command: "test", commands: { test: { file: process.execPath, args: [] } } as never, limits })).rejects.toThrow("Windows job-object host adapter");
  });
  it.skipIf(process.platform === "win32")("cancels the whole detached process group", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutout-sandbox-"));
    const controller = new AbortController();
    const run = runControlledCommand({ root, command: "test", commands: { test: { file: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] } } as never, limits, signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  });
});
