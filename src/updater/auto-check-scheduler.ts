export const UPDATE_CHECK_STARTUP_DELAY_MS = 8_000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const UPDATE_CHECK_MAX_JITTER_MS = 30 * 60 * 1_000;

export interface UpdateAutoCheckController {
  autoCheck(delayElapsed: boolean): Promise<void>;
}

export interface UpdateAutoCheckSchedulerOptions {
  readonly startupDelayMs?: number;
  readonly intervalMs?: number;
  readonly maxJitterMs?: number;
  readonly random?: () => number;
  readonly window?: Window;
  readonly document?: Document;
}

function boundedJitter(random: () => number, maximum: number) {
  const sample = random();
  const bounded = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0;
  return Math.floor(bounded * Math.max(0, maximum));
}

export function startUpdateAutoCheckScheduler(
  controller: UpdateAutoCheckController,
  options: UpdateAutoCheckSchedulerOptions = {},
) {
  const hostWindow = options.window ?? window;
  const hostDocument = options.document ?? document;
  const startupDelayMs = options.startupDelayMs ?? UPDATE_CHECK_STARTUP_DELAY_MS;
  const intervalMs = options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS;
  const maxJitterMs = options.maxJitterMs ?? UPDATE_CHECK_MAX_JITTER_MS;
  const random = options.random ?? Math.random;
  let startupElapsed = false;
  let disposed = false;
  let periodicTimer: number | undefined;

  const runAutoCheck = () => {
    if (disposed || !startupElapsed) return Promise.resolve();
    return controller.autoCheck(true).catch(() => undefined);
  };

  const schedulePeriodic = () => {
    if (disposed) return;
    const delay = Math.max(0, intervalMs) + boundedJitter(random, maxJitterMs);
    periodicTimer = hostWindow.setTimeout(() => {
      periodicTimer = undefined;
      void runAutoCheck().then(schedulePeriodic);
    }, delay);
  };

  const onFocus = () => { void runAutoCheck(); };
  const onOnline = () => { void runAutoCheck(); };
  const onVisibilityChange = () => {
    if (hostDocument.visibilityState === "visible") void runAutoCheck();
  };

  hostWindow.addEventListener("focus", onFocus);
  hostWindow.addEventListener("online", onOnline);
  hostDocument.addEventListener("visibilitychange", onVisibilityChange);

  const startupTimer = hostWindow.setTimeout(() => {
    startupElapsed = true;
    void runAutoCheck().then(schedulePeriodic);
  }, Math.max(0, startupDelayMs));

  return () => {
    if (disposed) return;
    disposed = true;
    hostWindow.clearTimeout(startupTimer);
    if (periodicTimer !== undefined) hostWindow.clearTimeout(periodicTimer);
    hostWindow.removeEventListener("focus", onFocus);
    hostWindow.removeEventListener("online", onOnline);
    hostDocument.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
