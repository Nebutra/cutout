import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WhatsNewDialog } from "@/components/release-notes/WhatsNewDialog";
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

const note: ReleaseNotesView = {
  version: "0.1.16",
  releasedOn: "2026-08-03",
  headline: locale === "fr"
    ? "Comprenez précisément les changements avant et après chaque mise à jour"
    : "每次更新前后，都能清楚了解变化",
  highlights: [
    {
      id: "localized-highlights",
      title: locale === "fr" ? "Les nouveautés dans votre langue" : "用你的语言查看更新亮点",
      body: locale === "fr"
        ? "Cutout présente désormais des points forts relus en anglais, chinois simplifié, japonais, français et espagnol."
        : "Cutout 现在会用英语、简体中文、日语、法语和西班牙语展示经过审核的更新亮点。",
    },
    {
      id: "review-before-installing",
      title: locale === "fr" ? "Consultez les détails avant l’installation" : "安装前先查看",
      body: locale === "fr"
        ? "La section Mises à jour et assistance affiche les détails de la version disponible avant son téléchargement et son installation."
        : "下载并安装更新前，可在“更新与支持”中查看可用版本的详细说明。",
    },
    {
      id: "reopen-offline",
      title: locale === "fr" ? "Rouvrez-les à tout moment" : "随时重新打开",
      body: locale === "fr"
        ? "Après une mise à niveau, la fenêtre Nouveautés s’ouvre une fois et reste accessible dans Mises à jour et assistance, même hors ligne."
        : "升级后，“更新说明”会自动打开一次，之后无需联网也可随时从“更新与支持”重新查看。",
    },
  ],
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
