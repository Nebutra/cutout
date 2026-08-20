import { ExternalLink } from "lucide-react";
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
import { githubReleaseUrl, type ReleaseNotesView } from "@/updater/release-notes";

function releaseDate(value: string | undefined, locale: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function bundledMedia(_mediaId: string | undefined): undefined {
  // The catalog has a closed media vocabulary; this release ships text-only notes.
  return undefined;
}

export function WhatsNewDialog({
  note,
  open,
  onOpenChange,
  restoreFocusTo,
}: {
  readonly note?: ReleaseNotesView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly restoreFocusTo?: HTMLElement | null;
}) {
  const { i18n } = useLingui();
  const date = releaseDate(note?.releasedOn, i18n.locale);
  const releaseUrl = note ? githubReleaseUrl(note.version) : undefined;

  return (
    <Dialog open={open && Boolean(note)} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-x-0 top-auto bottom-0 left-0 max-h-[calc(100dvh-0.75rem)] w-full max-w-none translate-x-0 translate-y-0 grid-rows-1 gap-0 overflow-hidden rounded-t-lg rounded-b-none p-0 motion-reduce:animate-none motion-reduce:transition-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[min(42rem,calc(100dvh-3rem))] sm:max-w-3xl sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
        onCloseAutoFocus={(event) => {
          if (!restoreFocusTo?.isConnected) return;
          event.preventDefault();
          restoreFocusTo.focus();
        }}
      >
        {note ? (
          <>
            <aside className="relative hidden overflow-hidden border-r border-border bg-muted p-6 sm:flex sm:flex-col sm:justify-between">
              <CutoutBrandMark
                variant="stacked"
                label="Cutout"
                className="h-14 w-auto self-start text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                <Trans id="release_notes.brand_line">The agent-native Design OS.</Trans>
              </p>
              <CutoutBrandMark
                variant="symbol"
                className="pointer-events-none absolute -right-8 -bottom-8 h-48 w-auto text-foreground/5"
              />
            </aside>

            <div className="flex min-h-0 flex-col">
              <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 sm:px-6 sm:py-5 sm:pr-12">
                <CutoutBrandMark
                  variant="horizontal"
                  className="h-4 w-auto self-start text-foreground sm:hidden"
                />
                <p className="text-xs text-muted-foreground">
                  <Trans id="release_notes.whats_new">What's New</Trans>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">Cutout v{note.version}</span>
                </p>
                <DialogTitle className="font-heading text-lg leading-snug font-medium sm:text-xl">
                  {note.headline ?? (
                    <Trans id="release_notes.release_details">Release details</Trans>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {date ?? (
                    <Trans id="release_notes.version_summary">
                      Highlights for this version of Cutout.
                    </Trans>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
                <ol className="flex flex-col gap-4 py-5">
                  {note.highlights.map((highlight) => {
                    const media = bundledMedia(highlight.mediaId);
                    return (
                      <li
                        key={highlight.id}
                        className="grid grid-cols-[0.375rem_minmax(0,1fr)] gap-3"
                      >
                        <span
                          className="mt-2 size-1.5 rounded-full bg-muted-foreground/60"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          {highlight.title ? (
                            <h3 className="text-sm font-medium leading-snug">{highlight.title}</h3>
                          ) : null}
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {highlight.body}
                          </p>
                          {media ? (
                            <img
                              className="mt-3 aspect-video w-full rounded-xl object-cover"
                              src={media}
                              alt={highlight.alt ?? ""}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <DialogFooter className="shrink-0 border-t border-border px-5 py-3 sm:px-6 sm:py-3.5">
                {releaseUrl ? (
                  <Button
                    variant="default"
                    className="w-full min-w-0 sm:w-auto"
                    onClick={() => window.open(releaseUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink />
                    <span className="truncate">
                      <Trans id="release_notes.open_github_release">Open GitHub Release</Trans>
                    </span>
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
