import type { CommerceProjectDeliverable } from "@/commerce-profile/project-production";
import { base64ToBytes, formatBytes } from "@/lib/image";
import { commerceRoleLabel } from "./commerce-view-labels";

export function CommerceDeliverablePreview({
  deliverable,
}: {
  readonly deliverable: CommerceProjectDeliverable;
}) {
  const image = deliverable.mediaType.startsWith("image/");
  const video = deliverable.mediaType === "video/mp4";
  const source = `data:${deliverable.mediaType};base64,${deliverable.bytesBase64}`;
  let documentPreview = "";
  if (!image && !video) {
    try {
      documentPreview = new TextDecoder().decode(
        base64ToBytes(deliverable.bytesBase64),
      );
    } catch {
      documentPreview = "Preview unavailable.";
    }
  }
  return (
    <article className="min-w-0 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted/40">
        {image ? (
          <img
            src={source}
            alt={commerceRoleLabel(deliverable.semanticRole)}
            className="size-full object-contain"
          />
        ) : video ? (
          <video
            src={source}
            controls
            preload="metadata"
            aria-label={commerceRoleLabel(deliverable.semanticRole)}
            className="size-full object-contain"
          />
        ) : (
          <pre className="size-full overflow-auto whitespace-pre-wrap break-words p-2 text-[10px] leading-relaxed">
            {documentPreview}
          </pre>
        )}
      </div>
      <div className="min-w-0 border-t border-border p-2">
        <p className="truncate text-xs font-medium" title={deliverable.fileName}>
          {commerceRoleLabel(deliverable.semanticRole)}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {formatBytes(deliverable.byteLength)} · {deliverable.qa ? "QA passed" : "Provider receipt"}
        </p>
      </div>
    </article>
  );
}
