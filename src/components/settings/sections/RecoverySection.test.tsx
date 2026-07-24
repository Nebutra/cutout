import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = vi.hoisted(() => ({
  get: vi.fn<() => { handle: string; label?: string } | undefined>(),
}));

vi.mock("@/platform/authorized-workspace", () => ({
  getAuthorizedWorkspace: workspace.get,
  subscribeAuthorizedWorkspace: vi.fn(() => () => undefined),
}));

import { RecoverySection } from "./RecoverySection";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function renderRecoverySection() {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n },
      createElement(RecoverySection),
    ),
  );
  const document = new DOMParser().parseFromString(html, "text/html");
  const section = document.querySelector("section");
  const advanced = section?.querySelector("details");
  if (!section || !advanced) {
    throw new Error("Recovery disclosure was not rendered");
  }
  return { section, advanced };
}

function buttonLabels(root: ParentNode) {
  return [...root.querySelectorAll("button")].map((button) =>
    button.textContent?.trim(),
  );
}

describe("RecoverySection", () => {
  beforeEach(() => workspace.get.mockReturnValue(undefined));

  it("keeps one common action visible and progressively discloses advanced tools", () => {
    const { section, advanced } = renderRecoverySection();
    const directButtons = [...section.querySelectorAll("button")].filter(
      (button) => !advanced.contains(button),
    );

    expect(directButtons.map((button) => button.textContent?.trim())).toEqual([
      "Reset UI state",
    ]);
    expect(section.textContent).toContain("Troubleshooting");
    expect(advanced.open).toBe(false);
    expect(advanced.querySelector("summary")?.textContent).toContain(
      "Diagnostics and recovery",
    );
    expect(buttonLabels(advanced)).toEqual([
      "Preview diagnostics",
      "Export diagnostics",
    ]);
    expect(advanced.textContent).toContain(
      "Authorize a workspace before using host recovery.",
    );
    expect(section.textContent).toContain("Project data is not deleted.");
  });

  it("keeps host actions available after workspace authorization", () => {
    workspace.get.mockReturnValue({
      handle: "workspace.opaque",
      label: "Authorized workspace",
    });

    const { advanced } = renderRecoverySection();

    expect(buttonLabels(advanced)).toEqual([
      "Preview diagnostics",
      "Export diagnostics",
      "Check host",
      "Recover host",
    ]);
    expect(advanced.querySelectorAll("button[disabled]")).toHaveLength(0);
    expect(advanced.querySelector('[role="status"]')).toBeNull();
  });
});
