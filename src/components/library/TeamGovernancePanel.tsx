import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Share2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CollaborationService,
  createIndexedDbCollaborationHost,
  type CollaborationHost,
} from "@/team-ecosystem";
import { ReviewBranchEditor } from "./ReviewBranchEditor";
import { pendingReviewCount, type ReviewBranchSummary } from "./collaboration-disclosure";

export function TeamGovernancePanel({
  projectId,
  host,
}: {
  readonly projectId: string | null;
  readonly host?: CollaborationHost | null;
}) {
  const { t } = useLingui();
  const resolvedHost = useMemo(
    () =>
      host === undefined
        ? typeof indexedDB === "undefined"
          ? undefined
          : createIndexedDbCollaborationHost(indexedDB)
        : (host ?? undefined),
    [host],
  );
  const service = useMemo(
    () => new CollaborationService(resolvedHost),
    [resolvedHost],
  );
  const capabilities = service.capabilities();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [branch, setBranch] = useState<ReviewBranchSummary>();
  const branchId = projectId ? `branch.${projectId}` : null;
  useEffect(() => {
    let current = true;
    setBranch(undefined);
    if (resolvedHost && branchId)
      void resolvedHost.loadBranch(branchId).then((value) => {
        if (current && value && typeof value === "object")
          setBranch(value as ReviewBranchSummary);
      });
    return () => {
      current = false;
    };
  }, [branchId, resolvedHost]);
  const pending = pendingReviewCount(branch);
  const label = t({ id: "team.share_review", message: "Share and review" });

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="ghost"
        aria-label={pending ? t({ id: "team.share_review_pending_aria", message: `${label}, ${pending} pending` }) : label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="relative shrink-0"
      >
        <Share2 />
        <span className="hidden sm:inline">{label}</span>
        {pending > 0 ? (
          <Badge
            aria-label={t({ id: "team.pending_reviews_count", message: `${pending} pending reviews` })}
            className="min-w-5 justify-center px-1 text-[10px]"
          >
            {pending}
          </Badge>
        ) : null}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) requestAnimationFrame(() => triggerRef.current?.focus());
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>
              {capabilities.local
                ? t({
                    id: "team.local_review_description",
                    message:
                      "Local review keeps comments, approvals, and read-only shares on this device.",
                  })
                : t({
                    id: "team.host_required_description",
                    message:
                      "A desktop collaboration host is required to review or create a read-only share.",
                  })}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <div className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
              <MessageSquare className="size-4 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {capabilities.local
                    ? t({ id: "team.local_review", message: "Local review" })
                    : t({ id: "team.host_required", message: "Host required" })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {projectId
                    ? t({ id: "team.current_project_revision", message: "Current project revision" })
                    : t({ id: "team.open_project_to_review", message: "Open a project to start a review." })}
                </p>
              </div>
            </div>
            {projectId && resolvedHost ? (
              <ReviewBranchEditor
                projectId={projectId}
                revisionId="current"
                host={resolvedHost}
                onBranchChange={(value) => setBranch(value as ReviewBranchSummary)}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
