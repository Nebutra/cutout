import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type UpdateChannel = "stable" | "beta";
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdateSnapshot {
  phase: UpdatePhase;
  availableVersion?: string;
  releaseNotes?: string;
  publishedAt?: string;
  channel?: UpdateChannel;
  downloadedBytes: number;
  contentLength?: number;
  error?: string;
  unavailableReason?: string;
}

export interface UpdaterRuntime {
  getStatus(): Promise<UpdateSnapshot>;
  check(channel?: UpdateChannel): Promise<UpdateSnapshot>;
  download(): Promise<UpdateSnapshot>;
  cancel(): Promise<UpdateSnapshot>;
  subscribeProgress(listener: (snapshot: UpdateSnapshot) => void): Promise<() => void>;
  installAndRelaunch(workspaceHandle?: string): Promise<void>;
}

export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = typeof listen;

const browserUnavailable: UpdateSnapshot = {
  phase: "idle",
  downloadedBytes: 0,
  unavailableReason: "Updates are available only in the Cutout desktop app.",
};

export function createTauriUpdaterRuntime(call?: Invoke, listenForEvent: Listen = listen): UpdaterRuntime {
  const tauriAvailable = Boolean(
    (globalThis as typeof globalThis & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
  if (!call && !tauriAvailable) {
    const unavailable = async () => {
      throw new Error(browserUnavailable.unavailableReason);
    };
    return {
      getStatus: async () => ({ ...browserUnavailable }),
      check: unavailable,
      download: unavailable,
      cancel: unavailable,
      subscribeProgress: async () => () => {},
      installAndRelaunch: unavailable,
    };
  }
  const command = call ?? invoke;
  return {
    getStatus: () => command("updater_status"),
    check: (channel = "stable") => command("updater_check", { channel }),
    download: () => command("updater_download"),
    cancel: () => command("updater_cancel"),
    subscribeProgress: (listener) =>
      listenForEvent<UpdateSnapshot>("cutout://updater-progress", (event) => listener(event.payload)),
    installAndRelaunch: (workspaceHandle) =>
      command("updater_install_and_relaunch", {
        workspaceHandle: workspaceHandle ?? null,
      }),
  };
}

export const createUpdaterRuntime = createTauriUpdaterRuntime;
export const updaterRuntime = createTauriUpdaterRuntime();
