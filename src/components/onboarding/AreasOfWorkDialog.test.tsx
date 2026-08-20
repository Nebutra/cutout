import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { AreasOfWorkDialog } from "./AreasOfWorkDialog";
import { WORK_AREA_CAP, type WorkAreaId } from "./areas-of-work";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function tiles(): HTMLButtonElement[] {
  const group = document.body.querySelector('[role="group"]');
  return [...(group?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
}

function counter(): HTMLElement | null {
  return document.body.querySelector('[aria-live="polite"]');
}

describe("AreasOfWorkDialog", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onConfirm: Mock<(areas: readonly WorkAreaId[]) => void>;
  let onSkip: Mock<() => void>;
  let onOpenChange: Mock<(open: boolean) => void>;

  function render(initialAreas?: readonly WorkAreaId[]) {
    act(() =>
      root.render(
        <I18nProvider i18n={i18n}>
          <AreasOfWorkDialog
            open
            onOpenChange={onOpenChange}
            initialAreas={initialAreas}
            onConfirm={onConfirm}
            onSkip={onSkip}
          />
        </I18nProvider>,
      ),
    );
  }

  beforeEach(() => {
    onConfirm = vi.fn();
    onSkip = vi.fn();
    onOpenChange = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders the six areas as multi-select tiles inside a labelled group", () => {
    render();
    const group = document.body.querySelector('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("Areas of work");
    expect(tiles()).toHaveLength(6);
    for (const tile of tiles()) {
      expect(tile.getAttribute("aria-pressed")).toBe("false");
    }
    expect(document.body.textContent).toContain("Web");
    expect(document.body.textContent).toContain("Mobile app");
    expect(document.body.textContent).toContain("Poster");
  });

  it("reflects the persisted selection when it opens", () => {
    render(["mobile", "poster"]);
    const pressed = tiles()
      .filter((tile) => tile.getAttribute("aria-pressed") === "true")
      .map((tile) => tile.textContent);
    expect(pressed).toHaveLength(2);
    expect(pressed.join(" ")).toContain("Mobile app");
    expect(pressed.join(" ")).toContain("Poster");
    expect(counter()?.textContent).toBe("2 of 3 selected");
  });

  it("toggles a tile on and off and keeps the live counter in step", () => {
    render();
    expect(counter()?.textContent).toBe("0 of 3 selected");
    act(() => tiles()[0]!.click());
    expect(tiles()[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(counter()?.textContent).toBe("1 of 3 selected");
    act(() => tiles()[0]!.click());
    expect(tiles()[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(counter()?.textContent).toBe("0 of 3 selected");
  });

  it("disables — rather than hides — unselected tiles once the cap is reached", () => {
    render();
    for (let index = 0; index < WORK_AREA_CAP; index += 1) {
      act(() => tiles()[index]!.click());
    }
    expect(tiles()).toHaveLength(6);
    expect(counter()?.textContent).toBe("3 of 3 selected");
    for (let index = 0; index < WORK_AREA_CAP; index += 1) {
      expect(tiles()[index]!.disabled).toBe(false);
    }
    for (let index = WORK_AREA_CAP; index < 6; index += 1) {
      expect(tiles()[index]!.disabled).toBe(true);
      expect(tiles()[index]!.className).toContain("disabled:opacity-50");
    }
    // De-selecting frees a slot again.
    act(() => tiles()[0]!.click());
    expect(tiles()[5]!.disabled).toBe(false);
  });

  it("confirms the selection in click order and closes", () => {
    render();
    act(() => tiles()[2]!.click());
    act(() => tiles()[0]!.click());
    const continueButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Continue",
    );
    act(() => continueButton!.click());
    expect(onConfirm).toHaveBeenCalledWith(["miniapp", "web"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("skips without confirming a selection", () => {
    render();
    act(() => tiles()[1]!.click());
    const skipButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Skip for now",
    );
    act(() => skipButton!.click());
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the brand aside off the mobile bottom sheet", () => {
    render();
    const aside = document.body.querySelector("aside");
    expect(aside?.className).toContain("hidden");
    expect(aside?.className).toContain("sm:flex");
  });
});

describe("AreasOfWorkDialog trigger policy", () => {
  it("is never auto-opened by the component itself", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/onboarding/AreasOfWorkDialog.tsx"),
      "utf8",
    );
    // `open` is entirely caller-driven: no internal default-open state.
    expect(source).toContain("<Dialog open={open}");
    expect(source).not.toContain("useState(true)");
    expect(source).not.toContain("defaultOpen");
  });
});
