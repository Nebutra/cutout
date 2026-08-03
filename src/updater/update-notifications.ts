import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { t } from "@lingui/core/macro";
import { z } from "zod";
import {
  deferLocalNotification,
  replaceLocalNotificationSource,
  type LocalNotification,
} from "@/services/local/local-notifications";
import {
  UPDATE_PREFERENCES_STORAGE_KEY,
  type PersistedUpdatePreferences,
  type UpdateChannel,
  type UpdatePreferences,
  type UpdateRelease,
} from "./contracts";

export const UPDATE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1_000;
export const UPDATE_NOTIFICATION_STATE_STORAGE_KEY = "cutout.updates.notifications.v1";

type UpdateStorage = Pick<Storage, "getItem" | "setItem">;

export interface NativeNotificationHost {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  sendNotification(options: { readonly title: string; readonly body: string }): void;
}

const persistedPreferencesSchema = z.object({
  channel: z.enum(["stable", "beta"]).optional(),
  autoCheck: z.boolean().optional(),
  lastCheckedAt: z.string().min(1).optional(),
  systemNotifications: z.boolean().optional(),
});

const persistedNotificationStateSchema = z.object({
  current: z.object({
    id: z.string().min(1).max(200),
    channel: z.enum(["stable", "beta"]),
    version: z.string().min(1).max(100),
    deferredUntil: z.number().int().nonnegative().optional(),
  }).strict().optional(),
}).strict();

type PersistedUpdateNotificationState = z.infer<typeof persistedNotificationStateSchema>;

function parsePersistedPreferences(value: unknown): PersistedUpdatePreferences {
  const parsed = persistedPreferencesSchema.safeParse(value);
  const preferences = parsed.success ? parsed.data : {};
  return {
    channel: preferences.channel ?? "stable",
    autoCheck: preferences.autoCheck !== false,
    ...(preferences.lastCheckedAt ? { lastCheckedAt: preferences.lastCheckedAt } : {}),
    systemNotifications: preferences.systemNotifications === true,
  };
}

export function readPersistedUpdatePreferences(storage: Pick<Storage, "getItem">): PersistedUpdatePreferences {
  try {
    return parsePersistedPreferences(JSON.parse(storage.getItem(UPDATE_PREFERENCES_STORAGE_KEY) ?? "null"));
  } catch {
    return parsePersistedPreferences(null);
  }
}

export function writeUpdatePreferences(storage: UpdateStorage, value: UpdatePreferences): void {
  const current = readPersistedUpdatePreferences(storage);
  storage.setItem(UPDATE_PREFERENCES_STORAGE_KEY, JSON.stringify({
    ...value,
    systemNotifications: current.systemNotifications,
  }));
}

function writeSystemNotificationPreference(storage: UpdateStorage, enabled: boolean): void {
  const current = readPersistedUpdatePreferences(storage);
  storage.setItem(UPDATE_PREFERENCES_STORAGE_KEY, JSON.stringify({
    channel: current.channel,
    autoCheck: current.autoCheck,
    ...(current.lastCheckedAt ? { lastCheckedAt: current.lastCheckedAt } : {}),
    systemNotifications: enabled,
  }));
}

function readNotificationState(storage: Pick<Storage, "getItem">): PersistedUpdateNotificationState {
  try {
    const parsed = persistedNotificationStateSchema.safeParse(
      JSON.parse(storage.getItem(UPDATE_NOTIFICATION_STATE_STORAGE_KEY) ?? "null"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeNotificationState(storage: UpdateStorage, value: PersistedUpdateNotificationState): void {
  storage.setItem(UPDATE_NOTIFICATION_STATE_STORAGE_KEY, JSON.stringify(value));
}

function defaultForegroundState(): boolean {
  return typeof document !== "undefined"
    && document.visibilityState === "visible"
    && document.hasFocus();
}

const defaultNativeNotifications: NativeNotificationHost = {
  isPermissionGranted,
  requestPermission,
  sendNotification,
};

function localizedOrFallback(localize: () => string, fallback: string): string {
  try {
    return localize();
  } catch {
    return fallback;
  }
}

function updateNotification(channel: UpdateChannel, release: UpdateRelease, createdAt: number): LocalNotification {
  const fallbackChannelLabel = channel === "stable" ? "Stable" : "Beta";
  const channelLabel = channel === "stable"
    ? localizedOrFallback(
        () => t({ id: "settings.updates.stable", message: "Stable" }),
        fallbackChannelLabel,
      )
    : localizedOrFallback(
        () => t({ id: "settings.updates.beta", message: "Beta" }),
        fallbackChannelLabel,
      );
  return {
    id: `update:${channel}:${release.version}`,
    source: "update",
    kind: "attention",
    title: localizedOrFallback(
      () => t({
        id: "updates.notification.available_title",
        message: "Update available",
      }),
      "Update available",
    ),
    detail: localizedOrFallback(
      () => t({
        id: "updates.notification.available_detail",
        message: `Cutout ${release.version} is available on the ${channelLabel} channel.`,
      }),
      `Cutout ${release.version} is available on the ${fallbackChannelLabel} channel.`,
    ),
    createdAt,
    read: false,
    action: {
      type: "open-settings",
      section: "updates-support",
      anchor: "updates",
    },
  };
}

export function createUpdateNotificationService(input: {
  readonly storage: UpdateStorage;
  readonly localNotificationStorage?: UpdateStorage;
  readonly nativeNotifications?: NativeNotificationHost;
  readonly isAppForeground?: () => boolean;
  readonly now?: () => Date;
}) {
  const nativeNotifications = input.nativeNotifications ?? defaultNativeNotifications;
  const isAppForeground = input.isAppForeground ?? defaultForegroundState;
  const now = input.now ?? (() => new Date());
  const preferenceListeners = new Set<(enabled: boolean) => void>();
  const publishPreference = (enabled: boolean) => {
    preferenceListeners.forEach((listener) => listener(enabled));
  };

  return {
    getSystemNotificationsEnabled() {
      return readPersistedUpdatePreferences(input.storage).systemNotifications;
    },
    subscribeSystemNotifications(listener: (enabled: boolean) => void) {
      preferenceListeners.add(listener);
      return () => { preferenceListeners.delete(listener); };
    },
    async setSystemNotificationsEnabled(enabled: boolean): Promise<boolean> {
      if (!enabled) {
        writeSystemNotificationPreference(input.storage, false);
        publishPreference(false);
        return false;
      }
      let granted = await nativeNotifications.isPermissionGranted().catch(() => false);
      if (!granted) {
        const permission = await nativeNotifications.requestPermission().catch(() => "denied" as const);
        granted = permission === "granted";
      }
      writeSystemNotificationPreference(input.storage, granted);
      publishPreference(granted);
      return granted;
    },
    defer(notificationId: string): readonly LocalNotification[] {
      const state = readNotificationState(input.storage);
      const deferredUntil = now().getTime() + UPDATE_REMINDER_DELAY_MS;
      if (state.current?.id === notificationId) {
        writeNotificationState(input.storage, {
          current: { ...state.current, deferredUntil },
        });
      }
      return deferLocalNotification(
        notificationId,
        deferredUntil,
        input.localNotificationStorage,
      );
    },
    async project(channel: UpdateChannel, release: UpdateRelease): Promise<boolean> {
      const projected = updateNotification(channel, release, now().getTime());
      const state = readNotificationState(input.storage);
      const sameRelease = state.current?.id === projected.id;
      const reminderDue = sameRelease
        && state.current?.deferredUntil !== undefined
        && state.current.deferredUntil <= now().getTime();
      if (sameRelease && !reminderDue) return false;
      const result = replaceLocalNotificationSource(
        projected,
        input.localNotificationStorage,
        { force: state.current !== undefined || reminderDue },
      );
      writeNotificationState(input.storage, {
        current: {
          id: projected.id,
          channel,
          version: release.version,
        },
      });
      if (!result.inserted) return false;
      if (!readPersistedUpdatePreferences(input.storage).systemNotifications || isAppForeground()) {
        return true;
      }
      const granted = await nativeNotifications.isPermissionGranted().catch(() => false);
      if (!granted) {
        writeSystemNotificationPreference(input.storage, false);
        publishPreference(false);
        return true;
      }
      try {
        nativeNotifications.sendNotification({
          title: projected.title,
          body: projected.detail,
        });
      } catch {
        // The bell notification remains the durable fallback.
      }
      return true;
    },
  };
}

export type UpdateNotificationService = ReturnType<typeof createUpdateNotificationService>;
