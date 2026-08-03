import { useEffect, useMemo, useState } from "react";
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
  readonly onOpenReleaseNotes?: (note: ReleaseNotesView, restoreFocusTo: HTMLElement) => void;
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
  const [systemNotifications, setSystemNotifications] = useState(
    () => controller.getSystemNotificationsEnabled(),
  );
  const [requestingNotificationPermission, setRequestingNotificationPermission] =
    useState(false);
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
        if (!disposed) stopAutoCheckScheduler = startUpdateAutoCheckScheduler(controller);
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
    <section aria-labelledby="updates-title" className="py-3" data-settings-anchor="updates" tabIndex={-1}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="updates-title" className="text-sm font-medium">
            <Trans id="settings.updates.title">Updates</Trans>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t({
              id: "settings.updates.current_version",
              message: `Current version ${state.capability?.currentVersion ?? "checking..."}`,
            })}
          </p>
        </div>
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
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="text-xs font-medium">
            <Trans id="settings.updates.whats_new">What's New</Trans>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
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
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!currentReleaseNotes || !props.onOpenReleaseNotes}
          onClick={(event) => currentReleaseNotes
            && props.onOpenReleaseNotes?.(currentReleaseNotes, event.currentTarget)}
        >
          <BookOpen />
          <Trans id="settings.updates.open_whats_new">Open</Trans>
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {visibleChannels.length > 1 ? (
          <div
            role="group"
            aria-label={t({
              id: "settings.updates.channel_aria",
              message: "Update channel",
            })}
            className="flex rounded-md bg-muted/40 p-0.5"
          >
            {visibleChannels.map((channel) => (
              <Button
                key={channel}
                size="sm"
                variant={
                  state.preferences.channel === channel ? "secondary" : "ghost"
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
        ) : null}
        <label className="flex items-center gap-2 text-xs">
          <span>
            <Trans id="settings.updates.check_automatically">
              Check automatically
            </Trans>
          </span>
          <Switch
            aria-label={t({
              id: "settings.updates.check_automatically_aria",
              message: "Check for updates automatically",
            })}
            checked={state.preferences.autoCheck}
            onCheckedChange={(value) => controller.setAutoCheck(value)}
          />
        </label>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-xs font-medium">
            <Trans id="settings.updates.system_notifications">
              System notifications
            </Trans>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <Trans id="settings.updates.system_notifications_hint">
              Notify when an update is found while Cutout is in the background.
            </Trans>
          </p>
        </div>
        <Switch
          aria-label={t({
            id: "settings.updates.system_notifications_aria",
            message: "Notify me about updates while Cutout is in the background",
          })}
          checked={systemNotifications}
          disabled={requestingNotificationPermission}
          onCheckedChange={(enabled) => void setSystemNotificationPreference(enabled)}
        />
      </div>
      {notificationPermissionDenied ? (
        <p role="status" className="mt-2 text-[11px] text-muted-foreground">
          <Trans id="settings.updates.system_notifications_denied">
            System notifications remain off because permission was not granted.
          </Trans>
        </p>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className="mt-3 text-xs text-muted-foreground"
      >
        {statusText}
      </div>
      {availableReleaseNotes ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {availableReleaseNotes.headline ?? (
                  <Trans id="settings.updates.release_details">Release details</Trans>
                )}
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {availableReleaseNotes.highlights.slice(0, 3).map((highlight) => (
                  <li key={highlight.id} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[0.4rem] size-1 shrink-0 rounded-full bg-current" />
                    <span className="min-w-0">
                      {highlight.title ? `${highlight.title}: ` : null}
                      {highlight.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!props.onOpenReleaseNotes}
              onClick={(event) => props.onOpenReleaseNotes?.(availableReleaseNotes, event.currentTarget)}
            >
              <BookOpen />
              <Trans id="settings.updates.view_release_details">Details</Trans>
            </Button>
          </div>
        </div>
      ) : null}
      {state.phase === "downloading" ? (
        <div className="mt-2">
          <progress
            aria-label={t({
              id: "settings.updates.download_progress_aria",
              message: "Update download progress",
            })}
            className="h-1.5 w-full"
            value={state.downloaded}
            max={state.total ?? Math.max(state.downloaded, 1)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
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
      <div className="mt-3 flex flex-wrap gap-2">
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
      {state.phase === "ready" ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Trans id="settings.updates.install_note">
            Restart happens only after you choose Install & restart. Active
            Agent work blocks installation.
          </Trans>
        </p>
      ) : null}
    </section>
  );
}
