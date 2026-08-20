import { useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CutoutBrandMark } from "@/components/brand/CutoutBrandMark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  WORK_AREA_CAP,
  WORK_AREA_ICONS,
  WORK_AREA_IDS,
  isWorkAreaBlocked,
  toggleWorkArea,
  type WorkAreaId,
} from "./areas-of-work";

/**
 * First-run "areas of work" picker.
 *
 * Presentational only: it owns the in-flight selection and hands the confirmed
 * list back through `onConfirm`. Persistence lives in
 * `@/services/work-areas-prefs.local`, and the mount is wired in `AppShell`.
 *
 * It is NEVER auto-opened in this pass — see `initializeWorkAreasOnboarding`.
 */
export function AreasOfWorkDialog({
  open,
  onOpenChange,
  initialAreas,
  onConfirm,
  onSkip,
  restoreFocusTo,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialAreas?: readonly WorkAreaId[];
  readonly onConfirm: (areas: readonly WorkAreaId[]) => void;
  readonly onSkip?: () => void;
  readonly restoreFocusTo?: HTMLElement | null;
}) {
  const { t } = useLingui();
  const [selected, setSelected] = useState<readonly WorkAreaId[]>(
    () => initialAreas ?? [],
  );

  // Re-seed from the persisted selection on each closed→open transition, so a
  // cancelled session never leaks into the next one. Keyed on the transition
  // rather than on `initialAreas` identity, so a caller passing a fresh array
  // literal every render cannot wipe an in-flight selection.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) setSelected(initialAreas ?? []);
    wasOpenRef.current = open;
  }, [open, initialAreas]);

  // Labels reuse the Home composer preset ids; the descriptions do not. Those
  // presets are composer *prompt prefixes* ("Design a responsive web experience
  // for ") — reusing them here rendered half-sentences that trail off mid-clause.
  // A tile description has to name the area, so these ids are their own.
  const areaCopy: Record<WorkAreaId, { label: string; description: string }> = {
    web: {
      label: t({ id: "home.preset_web", message: "Web" }),
      description: t({
        id: "onboarding.area_web_description",
        message: "Responsive sites and web apps",
      }),
    },
    mobile: {
      label: t({ id: "home.preset_mobile", message: "Mobile app" }),
      description: t({
        id: "onboarding.area_mobile_description",
        message: "iOS and Android app interfaces",
      }),
    },
    miniapp: {
      label: t({ id: "home.preset_miniapp", message: "Mini program" }),
      description: t({
        id: "onboarding.area_miniapp_description",
        message: "WeChat and in-app mini programs",
      }),
    },
    desktop: {
      label: t({ id: "home.preset_desktop", message: "Desktop" }),
      description: t({
        id: "onboarding.area_desktop_description",
        message: "Dense, tool-like desktop workspaces",
      }),
    },
    brand: {
      label: t({ id: "home.preset_brand", message: "Brand kit" }),
      description: t({
        id: "onboarding.area_brand_description",
        message: "Logo, palette, type and assets",
      }),
    },
    poster: {
      label: t({ id: "home.preset_poster", message: "Poster" }),
      description: t({
        id: "onboarding.area_poster_description",
        message: "Key visuals, posters and social art",
      }),
    },
  };

  const selectedCount = selected.length;
  const maxCount = WORK_AREA_CAP;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-x-0 top-auto bottom-0 left-0 max-h-[calc(100dvh-0.75rem)] w-full max-w-none translate-x-0 translate-y-0 grid-rows-1 gap-0 overflow-hidden rounded-t-lg rounded-b-none p-0 motion-reduce:animate-none motion-reduce:transition-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[min(42rem,calc(100dvh-3rem))] sm:max-w-2xl sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
        onCloseAutoFocus={(event) => {
          if (!restoreFocusTo?.isConnected) return;
          event.preventDefault();
          restoreFocusTo.focus();
        }}
      >
        <aside className="relative hidden overflow-hidden border-r border-border bg-muted p-6 sm:flex sm:flex-col sm:justify-between">
          <CutoutBrandMark
            variant="stacked"
            label="Cutout"
            className="h-14 w-auto self-start text-foreground"
          />
          <p className="text-xs text-muted-foreground">
            <Trans id="onboarding.areas_brand_line">
              Cutout keeps your design work in one place.
            </Trans>
          </p>
          <CutoutBrandMark
            variant="symbol"
            className="pointer-events-none absolute -right-8 -bottom-8 h-48 w-auto text-foreground/5"
          />
        </aside>

        <div className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-12">
            <DialogTitle className="font-heading text-lg leading-snug font-medium sm:text-xl">
              <Trans id="onboarding.areas_title">What do you work on?</Trans>
            </DialogTitle>
            <DialogDescription className="leading-6">
              <Trans id="onboarding.areas_description">
                Pick up to three areas you work in most. You can change them
                later in Settings.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
            <div
              role="group"
              aria-label={t({
                id: "onboarding.areas_group_label",
                message: "Areas of work",
              })}
              className="grid gap-3 sm:grid-cols-2"
            >
              {WORK_AREA_IDS.map((id) => {
                const Icon = WORK_AREA_ICONS[id];
                const copy = areaCopy[id];
                const isSelected = selected.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isWorkAreaBlocked(selected, id)}
                    onClick={() =>
                      setSelected((current) => toggleWorkArea(current, id))
                    }
                    className={cn(
                      "flex min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                      isSelected
                        ? "border-foreground bg-foreground/5"
                        : "border-border hover:border-foreground/25 hover:bg-foreground/5",
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {copy.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {copy.description.trim()}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between border-t border-border px-5 py-3 sm:justify-between sm:px-6 sm:py-3.5">
            <p
              aria-live="polite"
              className="text-xs text-muted-foreground tabular-nums"
            >
              <Trans id="onboarding.areas_counter">
                {selectedCount} of {maxCount} selected
              </Trans>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  onSkip?.();
                  onOpenChange(false);
                }}
              >
                <Trans id="onboarding.areas_skip">Skip for now</Trans>
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  onConfirm(selected);
                  onOpenChange(false);
                }}
              >
                <Trans id="onboarding.areas_continue">Continue</Trans>
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
