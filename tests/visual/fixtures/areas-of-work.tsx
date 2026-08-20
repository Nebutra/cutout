import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { AreasOfWorkDialog } from "@/components/onboarding/AreasOfWorkDialog";
import type { WorkAreaId } from "@/components/onboarding/areas-of-work";
import "@/index.css";

// The dialog is deliberately never auto-opened by the app, so it has no route
// of its own. This fixture is its only mount, exactly the way release-notes.tsx
// is the only mount for What's New. Messages are hand-stubbed because the
// fixture does not load a compiled catalog.
const messages: Record<string, Record<string, string>> = {
  en: {
    "common.close": "Close",
    "onboarding.areas_title": "What do you work on?",
    "onboarding.areas_description":
      "Pick up to three areas you work in most. Cutout uses them to decide what to show you first, and you can change them later.",
    "onboarding.areas_brand_line": "Cutout keeps your design work in one place.",
    "onboarding.areas_group_label": "Areas of work",
    "onboarding.areas_counter": "{selectedCount} of {maxCount} selected",
    "onboarding.areas_skip": "Skip for now",
    "onboarding.areas_continue": "Continue",
    "home.preset_web": "Web",
    "home.preset_web_brief": "Design a responsive web experience for ",
    "home.preset_mobile": "Mobile app",
    "home.preset_mobile_brief": "Design a mobile app UI for ",
    "home.preset_miniapp": "Mini program",
    "home.preset_miniapp_brief": "Design a WeChat mini-program flow for ",
    "home.preset_desktop": "Desktop",
    "home.preset_desktop_brief": "Design a desktop application workspace for ",
    "home.preset_brand": "Brand kit",
    "home.preset_brand_brief":
      "Create a complete brand kit (logo, colors, type, assets) for ",
    "home.preset_poster": "Poster",
    "home.preset_poster_brief": "Create a poster / key visual for ",
  },
  "zh-CN": {
    "common.close": "关闭",
    "onboarding.areas_title": "你主要做哪类设计？",
    "onboarding.areas_description":
      "最多选择三个你最常做的方向。Cutout 会据此决定优先展示的内容，随时可以修改。",
    "onboarding.areas_brand_line": "Cutout 把你的设计工作集中在一处。",
    "onboarding.areas_group_label": "工作方向",
    "onboarding.areas_counter": "已选 {selectedCount} / {maxCount}",
    "onboarding.areas_skip": "暂时跳过",
    "onboarding.areas_continue": "继续",
    "home.preset_web": "网页端",
    "home.preset_web_brief": "为……设计一个响应式网页体验（请补充产品/主题）：",
    "home.preset_mobile": "移动 App",
    "home.preset_mobile_brief": "为……设计一套移动 App 界面（请补充产品/主题）：",
    "home.preset_miniapp": "小程序",
    "home.preset_miniapp_brief": "为……设计一个微信小程序流程（请补充产品/主题）：",
    "home.preset_desktop": "桌面端",
    "home.preset_desktop_brief": "为……设计一个桌面应用工作区（请补充产品/主题）：",
    "home.preset_brand": "品牌 VI",
    "home.preset_brand_brief": "为……创建一整套品牌 VI（Logo、色彩、字体、物料）：",
    "home.preset_poster": "海报",
    "home.preset_poster_brief": "为……创建一张海报 / 主视觉：",
  },
};

const params = new URLSearchParams(window.location.search);
const locale = params.get("locale") === "zh-CN" ? "zh-CN" : "en";
const dark = params.get("theme") === "dark";
document.documentElement.lang = locale;
document.documentElement.classList.toggle("dark", dark);
i18n.loadAndActivate({ locale, messages: messages[locale]! });

export function Fixture() {
  const [open, setOpen] = useState(params.get("interactive") !== "1");
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null);
  const [confirmed, setConfirmed] = useState<readonly WorkAreaId[]>([]);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          setRestoreFocusTo(event.currentTarget);
          setOpen(true);
        }}
      >
        Open areas of work
      </button>
      <output data-testid="confirmed-areas">{confirmed.join(",")}</output>
      <AreasOfWorkDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={setConfirmed}
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
