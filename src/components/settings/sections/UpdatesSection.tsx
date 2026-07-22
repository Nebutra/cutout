import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  createDesktopUpdateOrchestrator,
  type DesktopUpdateController,
} from "@/updater/service";
import type { UpdateState } from "@/updater";

export function UpdatesSection(props: {
  readonly prepareRecoverySnapshot: () => Promise<boolean>;
  readonly controller?: DesktopUpdateController;
}) {
  const { t } = useLingui();
  const controller = useMemo(
    () =>
      props.controller ??
      createDesktopUpdateOrchestrator({
        prepareRecoverySnapshot: props.prepareRecoverySnapshot,
      }),
    [props.controller, props.prepareRecoverySnapshot],
  );
  const [state, setState] = useState<UpdateState>(() => controller.getState());
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = controller.subscribe(setState);
    if (!props.controller)
      void controller.initialize().then(() => {
        timer = window.setTimeout(() => void controller.autoCheck(true), 8_000);
      });
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [controller, props.controller]);
  const busy =
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "installing";
  const progress = state.total
    ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
    : undefined;

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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t({
            id: "settings.updates.channel_aria",
            message: "Update channel",
          })}
          className="flex rounded-md bg-muted/40 p-0.5"
        >
          {(["stable", "beta"] as const).map((channel) => (
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
      <div
        role="status"
        aria-live="polite"
        className="mt-3 text-xs text-muted-foreground"
      >
        {statusText}
      </div>
      {state.release?.notes ? (
        <p className="mt-2 whitespace-pre-wrap text-xs">{state.release.notes}</p>
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
