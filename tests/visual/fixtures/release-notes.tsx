import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WhatsNewDialog } from "@/components/release-notes/WhatsNewDialog";
import releaseNotesCatalog from "@/release-notes/catalog.json";
import type { ReleaseNotesView } from "@/updater/release-notes";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const locale = params.get("locale") === "fr" ? "fr" : "zh-CN";
const dark = params.get("theme") === "dark";
document.documentElement.lang = locale;
document.documentElement.classList.toggle("dark", dark);
i18n.loadAndActivate({
  locale,
  messages: locale === "fr" ? {
    "common.close": "Fermer",
    "release_notes.whats_new": "Nouveautés",
    "release_notes.release_details": "Détails de la version",
    "release_notes.version_summary": "Points forts de cette version de Cutout.",
    "release_notes.open_github_release": "Ouvrir la version sur GitHub",
  } : {
    "common.close": "关闭",
    "release_notes.whats_new": "更新说明",
    "release_notes.release_details": "版本详情",
    "release_notes.version_summary": "此版本 Cutout 的更新亮点。",
    "release_notes.open_github_release": "打开 GitHub 版本页面",
  },
});

const catalogEntry = releaseNotesCatalog.entries[0]!;
const note: ReleaseNotesView = {
  version: catalogEntry.version,
  releasedOn: catalogEntry.releasedOn,
  ...catalogEntry.locales[locale],
};

export function Fixture() {
  const [open, setOpen] = useState(params.get("interactive") !== "1");
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          setRestoreFocusTo(event.currentTarget);
          setOpen(true);
        }}
      >
        Open What's New
      </button>
      <WhatsNewDialog
        note={note}
        open={open}
        onOpenChange={setOpen}
        restoreFocusTo={restoreFocusTo}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>
  </React.StrictMode>,
);
