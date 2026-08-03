import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));
vi.mock("@/i18n/switch", () => ({ switchLocale: vi.fn() }));

import { GeneralSection } from "./GeneralSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

describe("GeneralSection", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("keeps the expected preference order without project developer controls", () => {
    const rows = [...(host.firstElementChild?.children ?? [])];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Theme");
    expect(rows[1]?.textContent).toContain("Language");
    expect(host.textContent).not.toContain("Developer mode");
    expect(host.querySelector('[role="switch"]')).toBeNull();
  });
});
