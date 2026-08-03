import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startUpdateAutoCheckScheduler,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_MAX_JITTER_MS,
  UPDATE_CHECK_STARTUP_DELAY_MS,
} from "./auto-check-scheduler";

describe("update auto-check scheduler", () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function start(random: () => number = () => 0) {
    const autoCheck = vi.fn(async () => {});
    cleanups.push(startUpdateAutoCheckScheduler({ autoCheck }, { random }));
    return autoCheck;
  }

  it("preserves the eight-second startup delay for every trigger", async () => {
    const autoCheck = start();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_STARTUP_DELAY_MS - 1);
    expect(autoCheck).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(autoCheck).toHaveBeenCalledOnce();
    expect(autoCheck).toHaveBeenCalledWith(true);
  });

  it("runs focus, visible, and online checks after startup", async () => {
    const autoCheck = start();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_STARTUP_DELAY_MS);
    autoCheck.mockClear();

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(autoCheck).toHaveBeenCalledTimes(3);
    expect(autoCheck).toHaveBeenNthCalledWith(1, true);
    expect(autoCheck).toHaveBeenNthCalledWith(2, true);
    expect(autoCheck).toHaveBeenNthCalledWith(3, true);
  });

  it("uses the six-hour lower jitter bound", async () => {
    const autoCheck = start(() => 0);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_STARTUP_DELAY_MS);
    autoCheck.mockClear();

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1);
    expect(autoCheck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(autoCheck).toHaveBeenCalledOnce();
    expect(autoCheck).toHaveBeenCalledWith(true);
  });

  it("caps periodic jitter at thirty minutes", async () => {
    const autoCheck = start(() => 1);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_STARTUP_DELAY_MS);
    autoCheck.mockClear();

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS + UPDATE_CHECK_MAX_JITTER_MS - 1);
    expect(autoCheck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(autoCheck).toHaveBeenCalledOnce();
  });

  it("removes timers and lifecycle listeners on cleanup", async () => {
    const autoCheck = vi.fn(async () => {});
    const cleanup = startUpdateAutoCheckScheduler({ autoCheck }, { random: () => 0 });
    cleanup();
    cleanup();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_STARTUP_DELAY_MS + UPDATE_CHECK_INTERVAL_MS);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(autoCheck).not.toHaveBeenCalled();
  });
});
