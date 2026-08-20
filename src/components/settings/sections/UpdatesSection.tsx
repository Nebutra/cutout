import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { BookOpen, Download, RefreshCw, RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  createDesktopUpdateOrchestrator,
  type DesktopUpdateController,
} from "@/updater/service";
import type { UpdateState } from "@/updater";
import { startUpdateAutoCheckScheduler } from "@/updater/auto-check-scheduler";
import {
  resolveUpdateReleaseNotes,
  selectLocalizedReleaseNotes,
  type ReleaseNotesView,
} from "@/updater/release-notes";
import type { LocalizedReleaseNotes } from "@/updater/contracts";

export function UpdatesSection(props: {
  readonly prepareRecoverySnapshot: () => Promise<boolean>;
  readonly controller?: DesktopUpdateController;
  readonly currentReleaseNotes?: LocalizedReleaseNotes;
  readonly onOpenReleaseNotes?: (
    note: ReleaseNotesView,
    restoreFocusTo: HTMLElement,
  ) => void;
}) {
  const { t, i18n } = useLingui();
  const controller = useMemo(
    () =>
      props.controller ??
      createDesktopUpdateOrchestrator({
        prepareRecoverySnapshot: props.prepareRecoverySnapshot,
      }),
    [props.controller, props.prepareRecoverySnapshot],
  );
  const [state, setState] = useState<UpdateState>(() => controller.getState());
  const [systemNotifications, setSystemNotifications] = useState(() =>
    controller.getSystemNotificationsEnabled(),
  );
  const [
    requestingNotificationPermission,
    setRequestingNotificationPermission,
  ] = useState(false);
  const [notificationPermissionDenied, setNotificationPermissionDenied] =
    useState(false);
  const availableReleaseNotes = state.release
    ? resolveUpdateReleaseNotes(state.release, i18n.locale)
    : undefined;
  const currentReleaseNotes = props.currentReleaseNotes
    ? selectLocalizedReleaseNotes(props.currentReleaseNotes, i18n.locale)
    : undefined;
  useEffect(() => {
    let disposed = false;
    let stopAutoCheckScheduler: (() => void) | undefined;
    const unsubscribe = controller.subscribe(setState);
    const unsubscribeSystemNotifications =
      controller.subscribeSystemNotifications(setSystemNotifications);
    if (!props.controller) {
      void controller.initialize().then(() => {
        if (!disposed)
          stopAutoCheckScheduler = startUpdateAutoCheckScheduler(controller);
      });
    }
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeSystemNotifications();
      stopAutoCheckScheduler?.();
    };
  }, [controller, props.controller]);
  const busy =
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "installing";
  const progress = state.total
    ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
    : undefined;
  const visibleChannels = (["stable", "beta"] as const).filter(
    (channel) => state.capability?.channels[channel].available,
  );
  const setSystemNotificationPreference = async (enabled: boolean) => {
    setRequestingNotificationPermission(true);
    const applied = await controller.setSystemNotificationsEnabled(enabled);
    setNotificationPermissionDenied(enabled && !applied);
    setRequestingNotificationPermission(false);
  };
  const openCurrentReleaseNotes = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (!currentReleaseNotes) return;
    props.onOpenReleaseNotes?.(currentReleaseNotes, event.currentTarget);
  };
  const openAvailableReleaseNotes = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (!availableReleaseNotes) return;
    props.onOpenReleaseNotes?.(availableReleaseNotes, event.currentTarget);
  };

  const statusText = (() => {
    if (state.phase === "loading")
      return t({
        id: "settings.updates.checking_availability",
        message: "Checking update availability...",
      });
    if (state.phase === "unavailable")
      return t({
        id: "settings.updates.unavailable",
        message: "Updates are available only in the Cutout desktop app.",
      });
    if (state.phase === "idle")
      return t({
        id: "settings.updates.up_to_date",
        message: `Cutout is up to date on the ${state.preferences.channel} channel.`,
      });
    if (state.phase === "checking")
      return t({
        id: "settings.updates.checking",
        message: "Checking for updates...",
      });
    if (
      state.release &&
      ["available", "downloading", "ready", "installing"].includes(state.phase)
    ) {
      const version = state.release.version;
      return t({
        id: "settings.updates.version_available",
        message: `Version ${version} is available.`,
      });
    }
    if (state.phase === "error") return state.error;
    return null;
  })();

  return (
    <section
      aria-labelledby="updates-title"
      className="flex flex-col gap-2 outline-none"
      data-settings-anchor="updates"
      tabIndex={-1}
    >
      <h3
        id="updates-title"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        <Trans id="settings.updates.title">Updates</Trans>
      </h3>
      <div className="divide-y divide-border">
        <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              <Trans id="settings.updates.installed_build">
                Installed build
              </Trans>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t({
                id: "settings.updates.current_version",
                message: `Current version ${state.capability?.currentVersion ?? "checking..."}`,
              })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !state.capability?.available}
              onClick={() => void controller.check()}
            >
              <RefreshCw />
              <Trans id="settings.updates.check_now">Check now</Trans>
            </Button>
          </div>
        </div>

        <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              <Trans id="settings.updates.whats_new">What's New</Trans>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {currentReleaseNotes ? (
                t({
                  id: "settings.updates.whats_new_hint",
                  message: `Review the highlights for Cutout ${currentReleaseNotes.version}.`,
                })
              ) : (
                <Trans id="settings.updates.whats_new_unavailable">
                  No release notes are available for this version.
                </Trans>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!currentReleaseNotes || !props.onOpenReleaseNotes}
              onClick={openCurrentReleaseNotes}
            >
              <BookOpen />
              <Trans id="settings.updates.open_whats_new">Open</Trans>
            </Button>
          </div>
        </div>

        {visibleChannels.length > 1 ? (
          <div className="flex min-h-14 items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                <Trans id="settings.updates.channel_title">
                  Release channel
                </Trans>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                <Trans id="settings.updates.channel_hint">
                  Stable ships reviewed releases. Beta receives candidates
                  earlier and may be less predictable.
                </Trans>
              </div>
            </div>
            <div
              role="group"
              aria-label={t({
                id: "settings.updates.channel_aria",
                message: "Update channel",
              })}
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/40 p-0.5"
            >
              {visibleChannels.map((channel) => (
                <Button
                  key={channel}
                  size="sm"
                  variant={
                    state.preferences.channel === channel
                      ? "secondary"
                      : "ghost"
                  }
                  aria-pressed={state.preferences.channel === channel}
                  onClick={() => controller.setChannel(channel)}
                >
                  {channel === "stable"
                    ? t({ id: "settings.updates.stable", message: "Stable" })
                    : t({ id: "settings.updates.beta", message: "Beta" })}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="flex min-h-14 items-center justify-between gap-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              <Trans id="settings.updates.check_automatically">
                Check automatically
              </Trans>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              <Trans id="settings.updates.check_automatically_hint">
                Look for a newer release in the background while Cutout is open.
              </Trans>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Switch
              aria-label={t({
                id: "settings.updates.check_automatically_aria",
                message: "Check for updates automatically",
              })}
              checked={state.preferences.autoCheck}
              onCheckedChange={(value) => controller.setAutoCheck(value)}
            />
          </span>
        </label>

        <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              <Trans id="settings.updates.system_notifications">
                System notifications
              </Trans>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {/* prettier-ignore */}
              <Trans id="settings.updates.system_notifications_hint">
                Notify when an update is found while Cutout is in the background.
              </Trans>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              aria-label={t({
                id: "settings.updates.system_notifications_aria",
                message:
                  "Notify me about updates while Cutout is in the background",
              })}
              checked={systemNotifications}
              disabled={requestingNotificationPermission}
              onCheckedChange={(enabled) =>
                void setSystemNotificationPreference(enabled)
              }
            />
          </div>
        </div>

        {availableReleaseNotes ? (
          <div className="flex items-start justify-between gap-4 py-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {availableReleaseNotes.headline ?? (
                  <Trans id="settings.updates.release_details">
                    Release details
                  </Trans>
                )}
              </div>
              <ul className="mt-0.5 flex flex-col gap-1.5 text-xs text-muted-foreground">
                {availableReleaseNotes.highlights
                  .slice(0, 3)
                  .map((highlight) => (
                    <li key={highlight.id} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1 shrink-0 rounded-full bg-current"
                      />
                      <span className="min-w-0">
                        {highlight.title ? `${highlight.title}: ` : null}
                        {highlight.body}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!props.onOpenReleaseNotes}
                onClick={openAvailableReleaseNotes}
              >
                <BookOpen />
                <Trans id="settings.updates.view_release_details">
                  Details
                </Trans>
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {notificationPermissionDenied ? (
        <p role="status" className="text-xs text-muted-foreground">
          <Trans id="settings.updates.system_notifications_denied">
            System notifications remain off because permission was not granted.
          </Trans>
        </p>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {statusText}
      </div>
      {state.phase === "downloading" ? (
        <div>
          <progress
            aria-label={t({
              id: "settings.updates.download_progress_aria",
              message: "Update download progress",
            })}
            className="h-1.5 w-full"
            value={state.downloaded}
            max={state.total ?? Math.max(state.downloaded, 1)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {progress === undefined
              ? t({
                  id: "settings.updates.bytes_downloaded",
                  message: `${state.downloaded} bytes downloaded`,
                })
              : t({
                  id: "settings.updates.percent_downloaded",
                  message: `${progress}% downloaded`,
                })}
          </p>
        </div>
      ) : null}
      {state.phase === "available" ||
      state.phase === "ready" ||
      state.phase === "error" ? (
        <div className="flex flex-wrap gap-2">
          {state.phase === "available" ? (
            <Button size="sm" onClick={() => void controller.download()}>
              <Download />
              <Trans id="settings.updates.download">Download update</Trans>
            </Button>
          ) : null}
          {state.phase === "ready" ? (
            <Button size="sm" onClick={() => void controller.install()}>
              <RotateCcw />
              <Trans id="settings.updates.install_restart">
                Install & restart
              </Trans>
            </Button>
          ) : null}
          {state.phase === "error" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void controller.retry()}
            >
              <RefreshCw />
              <Trans id="settings.updates.retry">Retry</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      {state.phase === "ready" ? (
        <p className="text-xs text-muted-foreground">
          <Trans id="settings.updates.install_note">
            Restart happens only after you choose Install & restart. Active
            Agent work blocks installation.
          </Trans>
        </p>
      ) : null}
    </section>
  );
}
