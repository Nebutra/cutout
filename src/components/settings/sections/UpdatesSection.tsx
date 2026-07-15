import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createDesktopUpdateOrchestrator, type DesktopUpdateController } from "@/updater/service";
import type { UpdateState } from "@/updater";

export function UpdatesSection(props: { readonly prepareRecoverySnapshot: () => Promise<boolean>; readonly controller?: DesktopUpdateController }) {
  const controller = useMemo(() => props.controller ?? createDesktopUpdateOrchestrator({ prepareRecoverySnapshot: props.prepareRecoverySnapshot }), [props.controller, props.prepareRecoverySnapshot]);
  const [state, setState] = useState<UpdateState>(() => controller.getState());
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = controller.subscribe(setState);
    if (!props.controller) void controller.initialize().then(() => {
      timer = window.setTimeout(() => void controller.autoCheck(true), 8_000);
    });
    return () => { unsubscribe(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [controller, props.controller]);
  const busy = state.phase === "checking" || state.phase === "downloading" || state.phase === "installing";
  const progress = state.total ? Math.min(100, Math.round(state.downloaded / state.total * 100)) : undefined;

  return <section aria-labelledby="updates-title" className="py-3">
    <div className="flex items-start justify-between gap-3">
      <div><h3 id="updates-title" className="text-sm font-medium">Updates</h3><p className="mt-0.5 text-xs text-muted-foreground">Current version {state.capability?.currentVersion ?? "checking..."}</p></div>
      <Button size="sm" variant="outline" disabled={busy || !state.capability?.available} onClick={() => void controller.check()}><RefreshCw />Check now</Button>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Update channel" className="flex rounded-md bg-muted/40 p-0.5">
        {(["stable", "beta"] as const).map((channel) => <Button key={channel} size="sm" variant={state.preferences.channel === channel ? "secondary" : "ghost"} aria-pressed={state.preferences.channel === channel} onClick={() => controller.setChannel(channel)}>{channel === "stable" ? "Stable" : "Beta"}</Button>)}
      </div>
      <label className="flex items-center gap-2 text-xs"><span>Check automatically</span><Switch aria-label="Check for updates automatically" checked={state.preferences.autoCheck} onCheckedChange={(value) => controller.setAutoCheck(value)} /></label>
    </div>
    <div role="status" aria-live="polite" className="mt-3 text-xs text-muted-foreground">
      {state.phase === "loading" ? "Checking update availability..." : null}
      {state.phase === "unavailable" ? state.capability?.reason ?? state.error ?? "Updates are unavailable." : null}
      {state.phase === "idle" ? `Cutout is up to date on the ${state.preferences.channel} channel.` : null}
      {state.phase === "checking" ? "Checking for updates..." : null}
      {state.release && ["available", "downloading", "ready", "installing"].includes(state.phase) ? `Version ${state.release.version} is available.` : null}
      {state.phase === "error" ? state.error : null}
    </div>
    {state.release?.notes ? <p className="mt-2 whitespace-pre-wrap text-xs">{state.release.notes}</p> : null}
    {state.phase === "downloading" ? <div className="mt-2"><progress aria-label="Update download progress" className="h-1.5 w-full" value={state.downloaded} max={state.total ?? Math.max(state.downloaded, 1)} /><p className="mt-1 text-[11px] text-muted-foreground">{progress === undefined ? `${state.downloaded} bytes downloaded` : `${progress}% downloaded`}</p></div> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {state.phase === "available" ? <Button size="sm" onClick={() => void controller.download()}><Download />Download update</Button> : null}
      {state.phase === "ready" ? <Button size="sm" onClick={() => void controller.install()}><RotateCcw />Install & restart</Button> : null}
      {state.phase === "error" ? <Button size="sm" variant="outline" onClick={() => void controller.retry()}><RefreshCw />Retry</Button> : null}
    </div>
    {state.phase === "ready" ? <p className="mt-2 text-[11px] text-muted-foreground">Restart happens only after you choose Install & restart. Active Agent work blocks installation.</p> : null}
  </section>;
}
