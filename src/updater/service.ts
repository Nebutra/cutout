import { getStoreState } from "@/store";
import { getVersion } from "@tauri-apps/api/app";
import { getAuthorizedWorkspace } from "@/platform/authorized-workspace";
import { createTauriAgentHostService } from "@/agent-host/tauri-service";
import { createTauriUpdaterRuntime, type UpdateSnapshot } from "./runtime";
import type { UpdateBackend, UpdateInstallSafety, UpdatePreferenceStore, UpdatePreferences } from "./contracts";
import { createUpdateOrchestrator } from "./orchestrator";

const PREFERENCES_KEY = "cutout.updates.preferences.v1";
type RuntimeSnapshot = UpdateSnapshot & { releaseNotes?: string; publishedAt?: string };

export function createLocalUpdatePreferences(storage: Pick<Storage, "getItem" | "setItem">): UpdatePreferenceStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? "null") as Partial<UpdatePreferences> | null;
        return { channel: parsed?.channel === "beta" ? "beta" : "stable", autoCheck: parsed?.autoCheck !== false, ...(parsed?.lastCheckedAt ? { lastCheckedAt: parsed.lastCheckedAt } : {}) };
      } catch {
        return { channel: "stable", autoCheck: true };
      }
    },
    write(value) { storage.setItem(PREFERENCES_KEY, JSON.stringify(value)); },
  };
}

function hasActiveAgentRun() {
  const run = getStoreState().workspaceSnapshot?.agentRunEvents?.activeRun;
  return Boolean(run && run.status !== "cancelled");
}

export function createDesktopUpdateOrchestrator(input: {
  readonly prepareRecoverySnapshot: () => Promise<boolean>;
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
  readonly getAppVersion?: () => Promise<string>;
}) {
  const runtime = createTauriUpdaterRuntime();
  const readVersion = input.getAppVersion ?? getVersion;
  const backend: UpdateBackend = {
    async capability() {
      const status = await runtime.getStatus();
      const unavailable = status.unavailableReason;
      return {
        available: !unavailable,
        currentVersion: await readVersion().catch(() => "unknown"),
        reason: unavailable,
        endpointConfigured: !unavailable,
        pubkeyConfigured: !unavailable,
      };
    },
    async check(channel) {
      const snapshot = await runtime.check(channel) as RuntimeSnapshot;
      return snapshot.availableVersion ? { version: snapshot.availableVersion, notes: snapshot.releaseNotes, publishedAt: snapshot.publishedAt } : undefined;
    },
    async download(_release, onProgress) {
      const unsubscribe = await runtime.subscribeProgress((snapshot) =>
        onProgress(snapshot.downloadedBytes, snapshot.contentLength),
      );
      try {
        const snapshot = await runtime.download();
        onProgress(snapshot.downloadedBytes, snapshot.contentLength);
      } finally {
        unsubscribe();
      }
    },
    async cancel() { await runtime.cancel(); },
    async installAndRestart() {
      await runtime.installAndRelaunch(getAuthorizedWorkspace()?.handle);
    },
  };
  const safety: UpdateInstallSafety = {
    hasActiveAgentRun: async () => hasActiveAgentRun(),
    async createRecoverySnapshot() {
      if (!await input.prepareRecoverySnapshot()) throw new Error("Could not create a local recovery snapshot. The current version remains available.");
    },
    async shutdownDurableHost() {
      const workspace = getAuthorizedWorkspace();
      if (!workspace) return;
      await createTauriAgentHostService({ workspaceHandle: workspace.handle, instanceId: `updater.${crypto.randomUUID()}` }).shutdown();
    },
  };
  return createUpdateOrchestrator({ backend, safety, preferences: createLocalUpdatePreferences(input.storage ?? localStorage) });
}

export type DesktopUpdateController = ReturnType<typeof createDesktopUpdateOrchestrator>;
