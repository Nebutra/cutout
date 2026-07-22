import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setDeveloperMode: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));
vi.mock("@/i18n/switch", () => ({ switchLocale: vi.fn() }));
vi.mock("@/workspace/navigation", () => ({
  loadWorkspaceNavigation: () => ({
    version: 2,
    mode: "canvas",
    advanced: true,
  }),
  setDeveloperMode: mocks.setDeveloperMode,
}));

import { GeneralSection } from "./GeneralSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

describe("GeneralSection", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root.render(
        <I18nProvider i18n={i18n}>
          <GeneralSection />
        </I18nProvider>,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the expected preference order and accessible Developer mode control", () => {
    const rows = [...(host.firstElementChild?.children ?? [])];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Theme");
    expect(rows[1]?.textContent).toContain("Language");
    expect(rows[2]?.textContent).toContain("Developer mode");

    const developerMode = host.querySelector(
      '[role="switch"][aria-label="Developer mode"]',
    ) as HTMLButtonElement | null;
    expect(developerMode).not.toBeNull();
    expect(developerMode?.getAttribute("aria-checked")).toBe("true");
  });

  it("persists Developer mode immediately through workspace navigation", () => {
    const developerMode = host.querySelector(
      '[role="switch"][aria-label="Developer mode"]',
    ) as HTMLButtonElement;

    act(() => developerMode.click());

    expect(mocks.setDeveloperMode).toHaveBeenCalledOnce();
    expect(mocks.setDeveloperMode).toHaveBeenCalledWith(false);
    expect(developerMode.getAttribute("aria-checked")).toBe("false");
  });
});
