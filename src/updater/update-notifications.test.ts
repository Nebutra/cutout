import { describe, expect, it, vi } from "vitest";
import {
  clearLocalNotifications,
  loadLocalNotifications,
} from "@/services/local/local-notifications";
import { UPDATE_PREFERENCES_STORAGE_KEY } from "./contracts";
import {
  UPDATE_REMINDER_DELAY_MS,
  createUpdateNotificationService,
  readPersistedUpdatePreferences,
  writeUpdatePreferences,
  type NativeNotificationHost,
} from "./update-notifications";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function nativeHost(input: {
  readonly granted?: boolean;
  readonly requested?: NotificationPermission;
} = {}) {
  return {
    isPermissionGranted: vi.fn(async () => input.granted ?? false),
    requestPermission: vi.fn(async () => input.requested ?? "denied"),
    sendNotification: vi.fn(),
  } satisfies NativeNotificationHost;
}

describe("update notification projection", () => {
  it("deduplicates one channel/version and replaces stale update items", async () => {
    const storage = memory();
    const service = createUpdateNotificationService({
      storage,
      localNotificationStorage: storage,
      now: () => new Date("2026-07-27T00:00:00.000Z"),
    });

    await service.project("stable", { version: "1.2.0" });
    await service.project("stable", { version: "1.2.0" });
    expect(loadLocalNotifications(storage)).toEqual([
      expect.objectContaining({
        id: "update:stable:1.2.0",
        source: "update",
        action: { type: "open-settings", section: "updates-support", anchor: "updates" },
      }),
    ]);

    await service.project("stable", { version: "1.3.0" });
    expect(loadLocalNotifications(storage).map((item) => item.id)).toEqual([
      "update:stable:1.3.0",
    ]);
  });

  it("keeps dedupe state after bell history is cleared", async () => {
    const storage = memory();
    const native = nativeHost({ granted: true });
    const service = createUpdateNotificationService({
      storage,
      localNotificationStorage: storage,
      nativeNotifications: native,
      isAppForeground: () => false,
    });
    await service.setSystemNotificationsEnabled(true);
    await service.project("stable", { version: "1.2.0" });
    clearLocalNotifications(storage);

    await service.project("stable", { version: "1.2.0" });
    expect(loadLocalNotifications(storage)).toEqual([]);
    expect(native.sendNotification).toHaveBeenCalledOnce();

    await service.project("stable", { version: "1.3.0" });
    expect(loadLocalNotifications(storage).map((item) => item.id)).toEqual([
      "update:stable:1.3.0",
    ]);
    expect(native.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("defers the bell reminder for exactly 24 hours", async () => {
    const storage = memory();
    let now = Date.parse("2026-07-27T00:00:00.000Z");
    const service = createUpdateNotificationService({
      storage,
      localNotificationStorage: storage,
      now: () => new Date(now),
    });
    await service.project("stable", { version: "1.2.0" });

    service.defer("update:stable:1.2.0");
    expect(loadLocalNotifications(storage, now)).toEqual([]);
    expect(loadLocalNotifications(storage, now + UPDATE_REMINDER_DELAY_MS - 1)).toEqual([]);
    now += UPDATE_REMINDER_DELAY_MS;
    await service.project("stable", { version: "1.2.0" });
    expect(loadLocalNotifications(storage, now)).toEqual([
      expect.objectContaining({ id: "update:stable:1.2.0", read: false }),
    ]);
  });

  it("explicitly re-alerts an expired reminder on the next eligible project", async () => {
    const storage = memory();
    const native = nativeHost({ granted: true });
    let now = Date.parse("2026-07-27T00:00:00.000Z");
    const service = createUpdateNotificationService({
      storage,
      localNotificationStorage: storage,
      nativeNotifications: native,
      isAppForeground: () => false,
      now: () => new Date(now),
    });
    await service.setSystemNotificationsEnabled(true);
    await service.project("stable", { version: "1.2.0" });
    service.defer("update:stable:1.2.0");

    now += UPDATE_REMINDER_DELAY_MS - 1;
    expect(await service.project("stable", { version: "1.2.0" })).toBe(false);
    expect(native.sendNotification).toHaveBeenCalledOnce();

    now += 1;
    expect(await service.project("stable", { version: "1.2.0" })).toBe(true);
    expect(native.sendNotification).toHaveBeenCalledTimes(2);
    const notifications = loadLocalNotifications(storage, now);
    expect(notifications).toEqual([
      expect.objectContaining({ id: "update:stable:1.2.0" }),
    ]);
    expect(notifications[0]).not.toHaveProperty("deferredUntil");
  });

  it("migrates existing updater preferences with system notifications off", async () => {
    const storage = memory();
    storage.setItem(UPDATE_PREFERENCES_STORAGE_KEY, JSON.stringify({
      channel: "beta",
      autoCheck: false,
      lastCheckedAt: "2026-07-26T00:00:00.000Z",
    }));
    expect(readPersistedUpdatePreferences(storage)).toEqual({
      channel: "beta",
      autoCheck: false,
      lastCheckedAt: "2026-07-26T00:00:00.000Z",
      systemNotifications: false,
    });

    const native = nativeHost({ granted: true });
    const service = createUpdateNotificationService({
      storage,
      localNotificationStorage: storage,
      nativeNotifications: native,
    });
    expect(await service.setSystemNotificationsEnabled(true)).toBe(true);
    writeUpdatePreferences(storage, {
      channel: "stable",
      autoCheck: true,
      lastCheckedAt: "2026-07-27T00:00:00.000Z",
    });
    expect(readPersistedUpdatePreferences(storage)).toEqual({
      channel: "stable",
      autoCheck: true,
      lastCheckedAt: "2026-07-27T00:00:00.000Z",
      systemNotifications: true,
    });
  });

  it("requests permission only while enabling and stays off after denial", async () => {
    const grantedStorage = memory();
    const grantedNative = nativeHost({ requested: "granted" });
    const granted = createUpdateNotificationService({
      storage: grantedStorage,
      localNotificationStorage: grantedStorage,
      nativeNotifications: grantedNative,
    });
    expect(await granted.setSystemNotificationsEnabled(true)).toBe(true);
    expect(grantedNative.requestPermission).toHaveBeenCalledOnce();
    expect(granted.getSystemNotificationsEnabled()).toBe(true);

    const deniedStorage = memory();
    const deniedNative = nativeHost({ requested: "denied" });
    const denied = createUpdateNotificationService({
      storage: deniedStorage,
      localNotificationStorage: deniedStorage,
      nativeNotifications: deniedNative,
    });
    expect(await denied.setSystemNotificationsEnabled(true)).toBe(false);
    expect(denied.getSystemNotificationsEnabled()).toBe(false);
    await denied.setSystemNotificationsEnabled(false);
    expect(deniedNative.requestPermission).toHaveBeenCalledOnce();
  });

  it("sends once for a new release only while the app is backgrounded", async () => {
    const storage = memory();
    const native = nativeHost({ granted: true });
    let foreground = true;
    const service = createUpdateNotificationService({
      storage,
      localNotificationStorage: storage,
      nativeNotifications: native,
      isAppForeground: () => foreground,
    });
    await service.setSystemNotificationsEnabled(true);

    await service.project("stable", { version: "1.2.0" });
    expect(native.sendNotification).not.toHaveBeenCalled();

    foreground = false;
    await service.project("stable", { version: "1.3.0" });
    await service.project("stable", { version: "1.3.0" });
    expect(native.sendNotification).toHaveBeenCalledOnce();
    expect(native.sendNotification).toHaveBeenCalledWith({
      title: "Update available",
      body: "Cutout 1.3.0 is available on the Stable channel.",
    });
  });
});
