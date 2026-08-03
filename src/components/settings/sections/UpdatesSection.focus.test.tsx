import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import releaseNotesCatalog from "@/release-notes/catalog.json";
import type { LocalizedReleaseNotes } from "@/updater/contracts";
import type { DesktopUpdateController } from "@/updater/service";

vi.mock("@/updater/auto-check-scheduler", () => ({
  startUpdateAutoCheckScheduler: () => () => {},
}));

import { UpdatesSection } from "./UpdatesSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const notes: LocalizedReleaseNotes = {
  protocol: "cutout.release-notes.v1",
  ...releaseNotesCatalog.entries[0]!,
};

function controller(): DesktopUpdateController {
  const state = {
    phase: "idle" as const,
    preferences: { channel: "stable" as const, autoCheck: true },
    downloaded: 0,
  };
  return {
    getState: () => state,
    subscribe: () => () => {},
    initialize: async () => {},
    getSystemNotificationsEnabled: () => false,
    subscribeSystemNotifications: () => () => {},
  } as unknown as DesktopUpdateController;
}

describe("UpdatesSection release-note focus contract", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("passes the connected manual-open button as the dialog focus target", async () => {
    const onOpenReleaseNotes = vi.fn();
    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <UpdatesSection
          prepareRecoverySnapshot={async () => true}
          controller={controller()}
          currentReleaseNotes={notes}
          onOpenReleaseNotes={onOpenReleaseNotes}
        />
      </I18nProvider>,
    ));
    const openButton = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.trim() === "Open");
    expect(openButton).toBeInstanceOf(HTMLButtonElement);
    openButton!.focus();
    await act(async () => openButton!.click());
    expect(onOpenReleaseNotes).toHaveBeenCalledWith(
      expect.objectContaining({ version: notes.version }),
      openButton,
    );
    expect(openButton!.isConnected).toBe(true);
  });
});
