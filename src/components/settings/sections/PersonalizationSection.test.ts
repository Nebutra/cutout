// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultPersonalizationSettings } from "@/personalization";
import { PersonalizationSection } from "./PersonalizationSection";

const mutateAsync = vi.fn(async (value) => value),
  resetAsync = vi.fn(async () => defaultPersonalizationSettings),
  query = {
    data: defaultPersonalizationSettings,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };

vi.mock("@/hooks/queries/personalization", () => ({
  usePersonalization: () => query,
  useSavePersonalization: () => ({ mutateAsync, isPending: false }),
  useResetPersonalization: () => ({ mutateAsync: resetAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

i18n.loadAndActivate({ locale: "en", messages: {} });

let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  mutateAsync.mockClear();
  resetAsync.mockClear();
});

function mount() {
  host = document.createElement("div");
  document.body.append(host);
  act(() => {
    root = createRoot(host!);
    root.render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(PersonalizationSection),
      ),
    );
  });
  return host;
}

describe("Personalization settings", () => {
  it("renders result-oriented progressive controls with accessible states", () => {
    const node = mount();
    expect(
      node.querySelector('[role="radiogroup"][aria-label="Agent personality"]'),
    ).toBeTruthy();
    expect(node.querySelectorAll('[role="radio"]')).toHaveLength(6);
    expect(node.querySelector("textarea#custom-instructions")).toBeTruthy();
    expect(
      node.querySelector('[role="switch"][aria-label="Use memory"]'),
    ).toBeTruthy();
    expect(
      (
        node.querySelector(
          '[role="switch"][aria-label="Tool-assisted memory"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(node.textContent).toContain(
      "External Agents receive only privacy-safe capability status",
    );
  });

  it("keeps save disabled until instructions are dirty", () => {
    const node = mount(),
      save = [...node.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Save changes"),
      )!;
    expect(save.disabled).toBe(true);
    const textarea = node.querySelector("textarea")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "Prefer concise design reviews.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(save.disabled).toBe(false);
    act(() => save.click());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: "Prefer concise design reviews.",
      }),
    );
  });

  it("requires confirmation before reset", () => {
    const node = mount(),
      reset = [...node.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Reset",
      )!;
    act(() => reset.click());
    expect(document.body.textContent).toContain("Reset personalization?");
    expect(resetAsync).not.toHaveBeenCalled();
  });
});
