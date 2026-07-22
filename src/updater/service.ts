import { getStoreState } from "@/store";
import { getVersion } from "@tauri-apps/api/app";
import { getAuthorizedWorkspace } from "@/platform/authorized-workspace";
import { createTauriAgentHostService } from "@/agent-host/tauri-service";
import { createTauriUpdaterRuntime, type UpdateSnapshot } from "./runtime";
import { UpdateOperationError, type UpdateBackend, type UpdateInstallSafety, type UpdatePreferenceStore, type UpdatePreferences, type UpdateRetryAction } from "./contracts";
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
  return run?.status === "running";
}

export function createDesktopUpdateOrchestrator(input: {
  readonly prepareRecoverySnapshot: () => Promise<boolean>;
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
  readonly getAppVersion?: () => Promise<string>;
}) {
  const runtime = createTauriUpdaterRuntime();
  const readVersion = input.getAppVersion ?? getVersion;
  const operationFailure = async (error: unknown, fallback: UpdateRetryAction) => {
    const status = await runtime.getStatus().catch(() => undefined);
    return new UpdateOperationError(
      status?.error ?? (error instanceof Error ? error.message : String(error)),
      status?.retryAction ?? fallback,
    );
  };
  const backend: UpdateBackend = {
    async capability() {
      const status = await runtime.getStatus();
      const unavailable = status.unavailableReason;
      const stable = status.channelCapabilities?.stable ?? {
        available: !unavailable,
        ...(unavailable ? { reason: unavailable } : {}),
      };
      const beta = status.channelCapabilities?.beta ?? {
        available: false,
        reason: "Beta updates are not configured in this build.",
      };
      const available = stable.available || beta.available;
      return {
        available,
        currentVersion: await readVersion().catch(() => "unknown"),
        reason: available ? undefined : unavailable,
        endpointConfigured: available,
        pubkeyConfigured: available,
        channels: { stable, beta },
      };
    },
    async check(channel) {
      try {
        const snapshot = await runtime.check(channel) as RuntimeSnapshot;
        return snapshot.availableVersion ? { version: snapshot.availableVersion, notes: snapshot.releaseNotes, publishedAt: snapshot.publishedAt } : undefined;
      } catch (error) {
        throw await operationFailure(error, "check");
      }
    },
    async download(_release, onProgress) {
      const unsubscribe = await runtime.subscribeProgress((snapshot) =>
        onProgress(snapshot.downloadedBytes, snapshot.contentLength),
      );
      try {
        const snapshot = await runtime.download();
        onProgress(snapshot.downloadedBytes, snapshot.contentLength);
      } catch (error) {
        throw await operationFailure(error, "download");
      } finally {
        unsubscribe();
      }
    },
    async cancel() {
      try {
        await runtime.cancel();
      } catch (error) {
        throw await operationFailure(error, "download");
      }
    },
    async installAndRestart() {
      try {
        await runtime.installAndRelaunch(getAuthorizedWorkspace()?.handle);
      } catch (error) {
        throw await operationFailure(error, "download");
      }
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
