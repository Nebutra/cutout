import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("What's New dialog contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/release-notes/WhatsNewDialog.tsx"),
    "utf8",
  );

  it("uses the accessible dialog primitive with compact and desktop geometry", () => {
    expect(source).toContain("<Dialog open=");
    expect(source).toContain("<DialogTitle");
    expect(source).toContain("<DialogDescription");
    expect(source).toContain("bottom-0");
    expect(source).toContain("sm:top-1/2");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("motion-reduce:animate-none");
    expect(source).toContain("onCloseAutoFocus");
    expect(source).toContain("restoreFocusTo.focus()");
  });

  it("uses the two-column dialog shell with a brand panel that collapses on mobile", () => {
    expect(source).toContain("sm:max-w-3xl");
    expect(source).toContain("sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]");
    expect(source).toContain("<aside className=");
    expect(source).toContain("hidden overflow-hidden border-r border-border bg-muted p-6 sm:flex");
    expect(source).toContain('variant="stacked"');
    expect(source).toContain("text-foreground/5");
    // The close X is absolute to the whole DialogContent and floats over the right column.
    expect(source).toContain("pr-12");
  });

  it("renders text and local media only, with a fixed release URL helper", () => {
    expect(source).toContain("bundledMedia(highlight.mediaId)");
    expect(source).toContain("githubReleaseUrl(note.version)");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("ReactMarkdown");
    expect(source).not.toContain("fetch(");
  });
});
