import type {
  UpdateBackend,
  UpdateCapability,
  UpdateInstallSafety,
  UpdatePreferenceStore,
  UpdatePreferences,
  UpdateState,
} from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;

type Listener = (state: UpdateState) => void;

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
      publish({
        capability,
        phase: capability.available ? "idle" : "unavailable",
        error: undefined,
      });
    } catch (error) {
      publish({ phase: "unavailable", error: message(error) });
    }
  };

  const check = async () => {
    if (!state.capability?.available) return;
    publish({ phase: "checking", error: undefined });
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
      });
    } catch (error) {
      publish({ phase: "error", error: message(error) });
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
    if (!release || state.phase !== "available") return;
    publish({ phase: "downloading", downloaded: 0, error: undefined });
    try {
      await input.backend.download(release, (downloaded, total) =>
        publish({ downloaded, total }),
      );
      publish({ phase: "ready" });
    } catch (error) {
      publish({ phase: "error", error: message(error) });
    }
  };

  const install = async () => {
    const release = state.release;
    if (!release || state.phase !== "ready") return;
    publish({ phase: "installing", error: undefined });
    try {
      if (await input.safety.hasActiveAgentRun())
        throw new Error("Finish or stop the active Agent run before restarting.");
      await input.safety.createRecoverySnapshot();
      await input.safety.shutdownDurableHost();
      await input.backend.installAndRestart(release);
    } catch (error) {
      publish({ phase: "error", error: message(error) });
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
    install,
    retry() {
      return state.release && state.downloaded > 0 ? download() : check();
    },
    setChannel(channel: UpdatePreferences["channel"]) {
      savePreferences({ ...state.preferences, channel });
      publish({ release: undefined, phase: state.capability?.available ? "idle" : state.phase });
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
  };
}
