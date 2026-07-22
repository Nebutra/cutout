import { describe, expect, it, vi } from "vitest";
import { UpdateOperationError } from "./contracts";
import type {
  UpdateBackend,
  UpdateCapability,
  UpdateInstallSafety,
  UpdatePreferences,
} from "./contracts";
import { createMemoryUpdatePreferences, createUpdateOrchestrator, shouldAutoCheck } from "./orchestrator";

const release = { version: "1.2.0", notes: "Safer local updates." };
const availableCapability: UpdateCapability = {
  available: true,
  currentVersion: "1.1.0",
  endpointConfigured: true,
  pubkeyConfigured: true,
  channels: {
    stable: { available: true },
    beta: { available: false, reason: "Beta updates are not configured." },
  },
};

function fixture(
  overrides: Partial<UpdateBackend> = {},
  safetyOverrides: Partial<UpdateInstallSafety> = {},
  preferenceOverrides: Partial<UpdatePreferences> = {},
) {
  const backend: UpdateBackend = {
    capability: vi.fn(async () => availableCapability),
    check: vi.fn(async () => release),
    download: vi.fn(async (_release, progress) => { progress(25, 100); progress(100, 100) }),
    cancel: vi.fn(async () => {}),
    installAndRestart: vi.fn(async () => {}),
    ...overrides,
  };
  const safety: UpdateInstallSafety = {
    hasActiveAgentRun: vi.fn(async () => false),
    createRecoverySnapshot: vi.fn(async () => {}),
    shutdownDurableHost: vi.fn(async () => {}),
    ...safetyOverrides,
  };
  const orchestrator = createUpdateOrchestrator({
    backend,
    safety,
    preferences: createMemoryUpdatePreferences(preferenceOverrides),
    now: () => new Date("2026-07-15T00:00:00.000Z"),
  });
  return { backend, safety, orchestrator };
}

describe("update orchestration", () => {
  it("checks, downloads, checkpoints, shuts down, then installs", async () => {
    const order: string[] = [];
    const { orchestrator } = fixture({ installAndRestart: vi.fn(async () => void order.push("install")) }, {
      createRecoverySnapshot: vi.fn(async () => void order.push("snapshot")),
      shutdownDurableHost: vi.fn(async () => void order.push("shutdown")),
    });
    await orchestrator.initialize(); await orchestrator.check(); await orchestrator.download(); await orchestrator.install();
    expect(orchestrator.getState()).toMatchObject({ phase: "installing", release, downloaded: 100, total: 100 });
    expect(order).toEqual(["snapshot", "shutdown", "install"]);
  });

  it("never prepares or restarts while an Agent run is active", async () => {
    const { orchestrator, backend, safety } = fixture({}, { hasActiveAgentRun: vi.fn(async () => true) });
    await orchestrator.initialize(); await orchestrator.check(); await orchestrator.download(); await orchestrator.install();
    expect(orchestrator.getState()).toMatchObject({ phase: "error", error: expect.stringMatching(/active Agent run/) });
    expect(safety.createRecoverySnapshot).not.toHaveBeenCalled();
    expect(backend.installAndRestart).not.toHaveBeenCalled();
  });

  it("keeps the current version usable when preparation fails", async () => {
    const { orchestrator, backend, safety } = fixture({}, { createRecoverySnapshot: vi.fn(async () => { throw new Error("snapshot failed") }) });
    await orchestrator.initialize(); await orchestrator.check(); await orchestrator.download(); await orchestrator.install();
    expect(orchestrator.getState()).toMatchObject({ phase: "error", error: "snapshot failed", retryAction: "install" });
    expect(safety.shutdownDurableHost).not.toHaveBeenCalled();
    expect(backend.installAndRestart).not.toHaveBeenCalled();
  });

  it("retries preparation and installation without downloading again", async () => {
    const createRecoverySnapshot = vi.fn()
      .mockRejectedValueOnce(new Error("snapshot failed"))
      .mockResolvedValue(undefined);
    const { orchestrator, backend } = fixture({}, { createRecoverySnapshot });
    await orchestrator.initialize(); await orchestrator.check(); await orchestrator.download();
    await orchestrator.install();
    await orchestrator.retry();
    expect(createRecoverySnapshot).toHaveBeenCalledTimes(2);
    expect(backend.download).toHaveBeenCalledOnce();
    expect(backend.installAndRestart).toHaveBeenCalledOnce();
    expect(orchestrator.getState().phase).toBe("installing");
  });

  it("retries a failed download from the native retry action", async () => {
    const download = vi.fn()
      .mockRejectedValueOnce(new UpdateOperationError("download failed", "download"))
      .mockImplementation(async (_release, progress) => progress(100, 100));
    const { orchestrator } = fixture({ download });
    await orchestrator.initialize(); await orchestrator.check(); await orchestrator.download();
    expect(orchestrator.getState()).toMatchObject({
      phase: "error",
      error: "download failed",
      retryAction: "download",
      downloaded: 0,
    });
    await orchestrator.retry();
    expect(download).toHaveBeenCalledTimes(2);
    expect(orchestrator.getState()).toMatchObject({ phase: "ready", downloaded: 100, total: 100 });
  });

  it("returns to download when native installation consumes the verified bytes", async () => {
    const installAndRestart = vi.fn(async () => {
      throw new UpdateOperationError("install failed", "download");
    });
    const { orchestrator, backend } = fixture({ installAndRestart });
    await orchestrator.initialize(); await orchestrator.check(); await orchestrator.download();
    await orchestrator.install();
    expect(orchestrator.getState()).toMatchObject({
      phase: "error",
      error: "install failed",
      retryAction: "download",
      downloaded: 0,
    });
    await orchestrator.retry();
    expect(backend.download).toHaveBeenCalledTimes(2);
    expect(installAndRestart).toHaveBeenCalledOnce();
    expect(orchestrator.getState().phase).toBe("ready");
  });

  it("cancels a native download and returns to the available release", async () => {
    let releaseDownload!: () => void;
    const { orchestrator, backend } = fixture({
      download: vi.fn(() => new Promise<void>((resolve) => { releaseDownload = resolve; })),
    });
    await orchestrator.initialize(); await orchestrator.check();
    const downloading = orchestrator.download();
    expect(orchestrator.getState().phase).toBe("downloading");
    await orchestrator.cancel();
    expect(backend.cancel).toHaveBeenCalledOnce();
    expect(orchestrator.getState()).toMatchObject({ phase: "available", downloaded: 0 });
    releaseDownload(); await downloading;
  });

  it("truthfully reports an unavailable backend", async () => {
    const reason = "Desktop update endpoint and public key are not configured.";
    const { orchestrator, backend } = fixture({ capability: vi.fn(async () => ({
      available: false,
      currentVersion: "0.1.0",
      endpointConfigured: false,
      pubkeyConfigured: false,
      reason,
      channels: {
        stable: { available: false, reason },
        beta: { available: false, reason },
      },
    })) });
    await orchestrator.initialize(); await orchestrator.check();
    expect(orchestrator.getState()).toMatchObject({ phase: "unavailable", capability: { available: false } });
    expect(backend.check).not.toHaveBeenCalled();
  });

  it("falls back from a persisted unavailable beta channel", async () => {
    const { orchestrator } = fixture({}, {}, { channel: "beta" });
    await orchestrator.initialize();
    expect(orchestrator.getState().preferences.channel).toBe("stable");
  });

  it("does not select an unavailable beta channel", async () => {
    const { orchestrator } = fixture();
    await orchestrator.initialize();
    orchestrator.setChannel("beta");
    expect(orchestrator.getState().preferences.channel).toBe("stable");
  });
});

it("auto-check requires opt-in, startup delay, and a 24 hour interval", () => {
  const now = Date.parse("2026-07-15T00:00:00.000Z");
  expect(shouldAutoCheck({ channel: "stable", autoCheck: true }, now, true)).toBe(true);
  expect(shouldAutoCheck({ channel: "stable", autoCheck: false }, now, true)).toBe(false);
  expect(shouldAutoCheck({ channel: "stable", autoCheck: true }, now, false)).toBe(false);
  expect(shouldAutoCheck({ channel: "stable", autoCheck: true, lastCheckedAt: "2026-07-14T01:00:00.000Z" }, now, true)).toBe(false);
  expect(shouldAutoCheck({ channel: "stable", autoCheck: true, lastCheckedAt: "2026-07-13T23:00:00.000Z" }, now, true)).toBe(true);
});
