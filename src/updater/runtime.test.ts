import { describe, expect, it, vi } from "vitest";
import { createUpdaterRuntime, type Invoke } from "./runtime";

describe("updater runtime binding", () => {
  it("defaults checks to stable and exposes only narrow application commands", async () => {
    const invoke = vi.fn(async () => ({ phase: "idle", downloadedBytes: 0 }));
    const runtime = createUpdaterRuntime(invoke as unknown as Invoke);

    await runtime.getStatus();
    await runtime.check();
    await runtime.download();
    await runtime.cancel();
    await runtime.installAndRelaunch("workspace.opaque");

    expect(invoke.mock.calls).toEqual([
      ["updater_status"],
      ["updater_check", { channel: "stable" }],
      ["updater_download"],
      ["updater_cancel"],
      ["updater_install_and_relaunch", { workspaceHandle: "workspace.opaque" }],
    ]);
  });

  it("supports beta and never invents a workspace checkpoint handle", async () => {
    const invoke = vi.fn(async () => ({ phase: "idle", downloadedBytes: 0 }));
    const runtime = createUpdaterRuntime(invoke as unknown as Invoke);

    await runtime.check("beta");
    await runtime.installAndRelaunch();

    expect(invoke).toHaveBeenNthCalledWith(1, "updater_check", { channel: "beta" });
    expect(invoke).toHaveBeenNthCalledWith(2, "updater_install_and_relaunch", {
      workspaceHandle: null,
    });
  });

  it("projects native download progress and returns its unlisten function", async () => {
    const invoke = vi.fn(async () => ({ phase: "idle", downloadedBytes: 0 }));
    const unlisten = vi.fn();
    const listen = vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      handler({ payload: { phase: "downloading", downloadedBytes: 42 } });
      return unlisten;
    });
    const listener = vi.fn();
    const runtime = createUpdaterRuntime(invoke as unknown as Invoke, listen as never);

    const dispose = await runtime.subscribeProgress(listener);
    expect(listener).toHaveBeenCalledWith({ phase: "downloading", downloadedBytes: 42 });
    dispose();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("reports browser availability truthfully without invoking Tauri", async () => {
    const runtime = createUpdaterRuntime();
    await expect(runtime.getStatus()).resolves.toMatchObject({
      phase: "idle",
      unavailableReason: expect.stringContaining("desktop app"),
    });
    await expect(runtime.check()).rejects.toThrow("desktop app");
  });
});
