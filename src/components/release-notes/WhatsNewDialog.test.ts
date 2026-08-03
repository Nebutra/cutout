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

  it("renders text and local media only, with a fixed release URL helper", () => {
    expect(source).toContain("bundledMedia(highlight.mediaId)");
    expect(source).toContain("githubReleaseUrl(note.version)");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("ReactMarkdown");
    expect(source).not.toContain("fetch(");
  });
});
