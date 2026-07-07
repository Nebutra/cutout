/**
 * GeneralSection — thin preferences, each instant-apply (no Save/Cancel).
 *
 *   Theme     light / dark / system   (next-themes)
 *   Language  zh-CN / en, live switch (Lingui `activateLocale`, persisted)
 *   Reset     restore the four cutout params to defaults (Zustand)
 */
import type { ReactNode } from 'react'
import { Moon, Sun, Monitor, RotateCcw } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  useExportPrefs,
  useSetRememberDir,
} from '@/hooks/queries/export-prefs'
import { switchLocale } from '@/i18n/switch'
import { SUPPORTED, LOCALE_LABEL, type Locale } from '@/i18n/config'

/** One labelled preference row: title (+ hint) on the left, control on the right. */
function Row({
  label,
  hint,
  children,
}: {
  readonly label: ReactNode
  readonly hint?: ReactNode
  readonly children: ReactNode
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
  )
}

const THEME_OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const

export function GeneralSection() {
  const { t, i18n } = useLingui()
  const { theme, setTheme } = useTheme()
  const resetParams = useStore((s) => s.resetParams)
  const currentLocale = i18n.locale as Locale
  const exportPrefs = useExportPrefs()
  const setRememberDir = useSetRememberDir()

  return (
    <div className="flex flex-col divide-y divide-border">
      <Row label={<Trans id="settings.theme_label">Theme</Trans>}>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <Button
              key={value}
              variant={theme === value ? 'secondary' : 'ghost'}
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
              variant={currentLocale === locale ? 'secondary' : 'ghost'}
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
        label={<Trans id="settings.reset_params_label">Cutout parameters</Trans>}
        hint={
          <Trans id="settings.reset_params_hint">
            Restore threshold, min area, gap and padding to defaults.
          </Trans>
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetParams()
            toast.success(
              t({ id: 'settings.reset_done_toast', message: 'Parameters reset' }),
            )
          }}
        >
          <RotateCcw />
          <Trans id="settings.reset_params">Reset parameters</Trans>
        </Button>
      </Row>

      <Row
        label={
          <Trans id="settings.remember_dir_label">
            Remember export folder
          </Trans>
        }
        hint={
          <Trans id="settings.remember_dir_hint">
            Reuse the last folder instead of asking on every export.
          </Trans>
        }
      >
        <Switch
          checked={exportPrefs.data?.rememberDir ?? false}
          onCheckedChange={(on) => setRememberDir.mutate(on)}
          aria-label={t({
            id: 'settings.remember_dir_label',
            message: 'Remember export folder',
          })}
        />
      </Row>
    </div>
  )
}
