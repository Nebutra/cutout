import { getStoreState } from "@/store";
import { getVersion } from "@tauri-apps/api/app";
import { getAuthorizedWorkspace } from "@/platform/authorized-workspace";
import { createTauriAgentHostService } from "@/agent-host/tauri-service";
import { createTauriUpdaterRuntime, type UpdateSnapshot } from "./runtime";
import { UpdateOperationError, type UpdateBackend, type UpdateInstallSafety, type UpdatePreferenceStore, type UpdateRetryAction } from "./contracts";
import { createUpdateOrchestrator } from "./orchestrator";
import { createUpdateNotificationService, readPersistedUpdatePreferences, writeUpdatePreferences } from "./update-notifications";

type RuntimeSnapshot = UpdateSnapshot & { releaseNotes?: string; publishedAt?: string };

export function createLocalUpdatePreferences(storage: Pick<Storage, "getItem" | "setItem">): UpdatePreferenceStore {
  return {
    read() {
      const persisted = readPersistedUpdatePreferences(storage);
      return {
        channel: persisted.channel,
        autoCheck: persisted.autoCheck,
        ...(persisted.lastCheckedAt ? { lastCheckedAt: persisted.lastCheckedAt } : {}),
      };
    },
    write(value) { writeUpdatePreferences(storage, value); },
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
  const storage = input.storage ?? localStorage;
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
  const controller = createUpdateOrchestrator({
    backend,
    safety,
    preferences: createLocalUpdatePreferences(storage),
  });
  const updateNotifications = createUpdateNotificationService({
    storage,
    localNotificationStorage: input.storage,
  });
  controller.subscribe((state) => {
    if (state.phase === "available" && state.release) {
      void updateNotifications.project(state.preferences.channel, state.release);
    }
  });
  return {
    ...controller,
    getSystemNotificationsEnabled: updateNotifications.getSystemNotificationsEnabled,
    subscribeSystemNotifications: updateNotifications.subscribeSystemNotifications,
    setSystemNotificationsEnabled: updateNotifications.setSystemNotificationsEnabled,
    deferUpdateNotification: updateNotifications.defer,
  };
}

export type DesktopUpdateController = ReturnType<typeof createDesktopUpdateOrchestrator>;
