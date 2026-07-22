import { UpdateOperationError } from "./contracts";
import type {
  UpdateBackend,
  UpdateCapability,
  UpdateInstallSafety,
  UpdatePreferenceStore,
  UpdatePreferences,
  UpdateRetryAction,
  UpdateState,
} from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;

type Listener = (state: UpdateState) => void;

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function retryAction(error: unknown, fallback: UpdateRetryAction) {
  return error instanceof UpdateOperationError ? error.retryAction : fallback;
}

function channelAvailable(capability: UpdateCapability, channel: UpdatePreferences["channel"]) {
  return capability.channels[channel].available;
}

export function shouldAutoCheck(
  preferences: UpdatePreferences,
  now: number,
  delayElapsed: boolean,
) {
  if (!preferences.autoCheck || !delayElapsed) return false;
  if (!preferences.lastCheckedAt) return true;
  const checkedAt = Date.parse(preferences.lastCheckedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt >= DAY_MS;
}

export function createUpdateOrchestrator(input: {
  backend: UpdateBackend;
  safety: UpdateInstallSafety;
  preferences: UpdatePreferenceStore;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  let state: UpdateState = {
    phase: "loading",
    preferences: input.preferences.read(),
    downloaded: 0,
  };
  let downloadAttempt = 0;
  const listeners = new Set<Listener>();
  const publish = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };
  const savePreferences = (preferences: UpdatePreferences) => {
    input.preferences.write(preferences);
    publish({ preferences });
  };

  const initialize = async () => {
    try {
      const capability = await input.backend.capability();
      let preferences = state.preferences;
      if (capability.available && !channelAvailable(capability, preferences.channel)) {
        const fallback = capability.channels.stable.available ? "stable" : "beta";
        preferences = { ...preferences, channel: fallback };
        input.preferences.write(preferences);
      }
      publish({
        capability,
        preferences,
        phase: capability.available ? "idle" : "unavailable",
        error: undefined,
        retryAction: undefined,
      });
    } catch (error) {
      publish({ phase: "unavailable", error: message(error), retryAction: undefined });
    }
  };

  const check = async () => {
    if (!state.capability?.available) return;
    if (!channelAvailable(state.capability, state.preferences.channel)) return;
    publish({ phase: "checking", error: undefined, retryAction: undefined });
    try {
      const release = await input.backend.check(state.preferences.channel);
      const preferences = {
        ...state.preferences,
        lastCheckedAt: now().toISOString(),
      };
      input.preferences.write(preferences);
      publish({
        preferences,
        release,
        phase: release ? "available" : "idle",
        downloaded: 0,
        total: undefined,
        retryAction: undefined,
      });
    } catch (error) {
      publish({ phase: "error", error: message(error), retryAction: retryAction(error, "check") });
    }
  };

  const autoCheck = async (delayElapsed = true) => {
    if (
      state.capability?.available &&
      shouldAutoCheck(state.preferences, now().getTime(), delayElapsed)
    )
      await check();
  };

  const download = async () => {
    const release = state.release;
    const retrying = state.phase === "error" && state.retryAction === "download";
    if (!release || (state.phase !== "available" && !retrying)) return;
    publish({ phase: "downloading", downloaded: 0, total: undefined, error: undefined, retryAction: undefined });
    const attempt = ++downloadAttempt;
    try {
      await input.backend.download(release, (downloaded, total) =>
        publish({ downloaded, total }),
      );
      if (attempt === downloadAttempt) publish({ phase: "ready", retryAction: undefined });
    } catch (error) {
      if (attempt === downloadAttempt) publish({ phase: "error", error: message(error), downloaded: 0, total: undefined, retryAction: retryAction(error, "download") });
    }
  };

  const cancel = async () => {
    if (state.phase !== "downloading") return;
    try {
      await input.backend.cancel();
      downloadAttempt += 1;
      publish({ phase: state.release ? "available" : "idle", downloaded: 0, total: undefined, error: undefined, retryAction: undefined });
    } catch (error) {
      publish({ phase: "error", error: message(error), retryAction: retryAction(error, "download") });
    }
  };

  const install = async () => {
    const release = state.release;
    const retrying = state.phase === "error" && state.retryAction === "install";
    if (!release || (state.phase !== "ready" && !retrying)) return;
    publish({ phase: "installing", error: undefined, retryAction: undefined });
    try {
      if (await input.safety.hasActiveAgentRun())
        throw new Error("Finish or stop the active Agent run before restarting.");
      await input.safety.createRecoverySnapshot();
      await input.safety.shutdownDurableHost();
      await input.backend.installAndRestart(release);
    } catch (error) {
      const action = retryAction(error, "install");
      publish({
        phase: "error",
        error: message(error),
        retryAction: action,
        ...(action === "download" ? { downloaded: 0, total: undefined } : {}),
      });
    }
  };

  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    initialize,
    check,
    autoCheck,
    download,
    cancel,
    install,
    retry() {
      if (state.retryAction === "download") return download();
      if (state.retryAction === "install") return install();
      return check();
    },
    setChannel(channel: UpdatePreferences["channel"]) {
      if (!state.capability || !channelAvailable(state.capability, channel)) return;
      savePreferences({ ...state.preferences, channel });
      publish({ release: undefined, phase: state.capability?.available ? "idle" : state.phase, retryAction: undefined });
    },
    setAutoCheck(autoCheck: boolean) {
      savePreferences({ ...state.preferences, autoCheck });
    },
  };
}

export function createMemoryUpdatePreferences(
  initial: Partial<UpdatePreferences> = {},
): UpdatePreferenceStore {
  let value: UpdatePreferences = {
    channel: "stable",
    autoCheck: true,
    ...initial,
  };
  return { read: () => value, write: (next) => void (value = next) };
}

export function unavailableCapability(
  currentVersion: string,
  reason: string,
): UpdateCapability {
  return {
    available: false,
    currentVersion,
    reason,
    endpointConfigured: false,
    pubkeyConfigured: false,
    channels: {
      stable: { available: false, reason },
      beta: { available: false, reason },
    },
  };
}
