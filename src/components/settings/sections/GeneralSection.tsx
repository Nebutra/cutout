/**
 * GeneralSection — thin preferences, each instant-apply (no Save/Cancel).
 *
 *   Theme     light / dark / system   (next-themes)
 *   Language  en / zh-CN / ja / fr / es, live switch (Lingui `activateLocale`, persisted)
 */
import { type ReactNode } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { switchLocale } from "@/i18n/switch";
import { SUPPORTED, LOCALE_LABEL, type Locale } from "@/i18n/config";

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
    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

const THEME_OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function GeneralSection() {
  const { i18n } = useLingui();
  const { theme, setTheme } = useTheme();
  const currentLocale = i18n.locale as Locale;

  return (
    <section aria-labelledby="general-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="general-heading" className="text-sm font-medium">
          <Trans id="settings.section_general">General</Trans>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Trans id="settings.general.description">
            Appearance and language for this device.
          </Trans>
        </p>
      </div>
      <div data-settings-rows className="flex flex-col divide-y divide-border">
      <Row
        label={<Trans id="settings.theme_label">Theme</Trans>}
        hint={
          <Trans id="settings.theme_hint">
            Follow the system appearance or pin Cutout to light or dark.
          </Trans>
        }
      >
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

      <Row
        label={<Trans id="topbar.language_label">Language</Trans>}
        hint={
          <Trans id="settings.language_hint">
            Switches the interface language immediately and remembers it on this
            device.
          </Trans>
        }
      >
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
      </div>
    </section>
  );
}
