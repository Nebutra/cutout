/**
 * GeneralSection — thin preferences, each instant-apply (no Save/Cancel).
 *
 *   Theme     light / dark / system   (next-themes)
 *   Language  en / zh-CN / ja / fr / es, live switch (Lingui `activateLocale`, persisted)
 *   Developer expose read-only project audit tools
 */
import { type ReactNode, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { switchLocale } from "@/i18n/switch";
import { SUPPORTED, LOCALE_LABEL, type Locale } from "@/i18n/config";
import {
  loadWorkspaceNavigation,
  setDeveloperMode,
} from "@/workspace/navigation";

/** One labelled preference row: title (+ hint) on the left, control on the right. */
function Row({
  label,
  hint,
  children,
}: {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const THEME_OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function GeneralSection() {
  const { t, i18n } = useLingui();
  const { theme, setTheme } = useTheme();
  const currentLocale = i18n.locale as Locale;
  const [developerMode, setDeveloperModeState] = useState(
    () => loadWorkspaceNavigation().advanced,
  );

  return (
    <div className="flex flex-col divide-y divide-border">
      <Row label={<Trans id="settings.theme_label">Theme</Trans>}>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <Button
              key={value}
              variant={theme === value ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={theme === value}
              aria-label={value}
              onClick={() => setTheme(value)}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </Row>

      <Row label={<Trans id="topbar.language_label">Language</Trans>}>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          {SUPPORTED.map((locale) => (
            <Button
              key={locale}
              variant={currentLocale === locale ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={currentLocale === locale}
              onClick={() => void switchLocale(locale)}
            >
              {LOCALE_LABEL[locale]}
            </Button>
          ))}
        </div>
      </Row>

      <Row
        label={
          <Trans id="settings.developer_mode.title">Developer mode</Trans>
        }
        hint={
          <Trans id="settings.developer_mode.hint">
            Show read-only DAG, Design IR and receipt audit tools inside projects.
          </Trans>
        }
      >
        <Switch
          checked={developerMode}
          onCheckedChange={(enabled) => {
            setDeveloperMode(enabled);
            setDeveloperModeState(enabled);
          }}
          aria-label={t({
            id: "settings.developer_mode.title",
            message: "Developer mode",
          })}
        />
      </Row>
    </div>
  );
}
