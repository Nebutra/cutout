/**
 * GeneralSection — thin preferences, each instant-apply (no Save/Cancel).
 *
 *   Theme     light / dark / system   (next-themes)
 *   Language  en / zh-CN / ja / fr / es, live switch (Lingui `activateLocale`, persisted)
 *   Reset     restore the four cutout params to defaults (Zustand)
 */
import { useEffect, useState, type ReactNode } from "react";
import { Download, Moon, Sun, Monitor, RotateCcw, Stethoscope } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useExportPrefs,
  useSetRememberDir,
} from "@/hooks/queries/export-prefs";
import { switchLocale } from "@/i18n/switch";
import { SUPPORTED, LOCALE_LABEL, type Locale } from "@/i18n/config";
import {
  loadWorkspaceNavigation,
  setDeveloperMode,
  WORKSPACE_NAVIGATION_KEY,
} from "@/workspace/navigation";
import { createAuthoritativeRecoveryController, createDiagnosticBundle, diagnosticBundleBytes, resetUiState } from "@/local-recovery";
import { getAiNativeDiagnostics } from "@/services/ai-native/diagnostics";
import { getAuthorizedWorkspace, subscribeAuthorizedWorkspace, type AuthorizedWorkspace } from "@/platform/authorized-workspace";
import { UpdatesSection } from "./UpdatesSection";
import type { DesktopUpdateController } from "@/updater/service";

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

export function GeneralSection({ prepareRecoverySnapshot = async () => true, updateController }: { readonly prepareRecoverySnapshot?: () => Promise<boolean>; readonly updateController?: DesktopUpdateController }) {
  const { t, i18n } = useLingui();
  const { theme, setTheme } = useTheme();
  const resetParams = useStore((s) => s.resetParams);
  const currentLocale = i18n.locale as Locale;
  const exportPrefs = useExportPrefs();
  const setRememberDir = useSetRememberDir();
  const [developerMode, setDeveloperModeState] = useState(
    () => loadWorkspaceNavigation().advanced,
  );
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<string>();
  const [authorizedWorkspace,setAuthorizedWorkspaceState]=useState<AuthorizedWorkspace|undefined>(getAuthorizedWorkspace)
  const [hostStatus,setHostStatus]=useState<{status:'unavailable'|'checking'|'ready'|'error';detail:string}>({status:getAuthorizedWorkspace()?'checking':'unavailable',detail:getAuthorizedWorkspace()?'Status not checked yet.':'Authorize a workspace before using host recovery.'})
  useEffect(()=>subscribeAuthorizedWorkspace((workspace)=>{setAuthorizedWorkspaceState(workspace);setHostStatus(workspace?{status:'checking',detail:'Status not checked yet.'}:{status:'unavailable',detail:'Authorize a workspace before using host recovery.'})}),[])
  const checkHost=async(recover=false)=>{setHostStatus({status:'checking',detail:recover?'Recovering authoritative host state...':'Checking authoritative host state...'});const{createTauriAgentHostService}=await import('@/agent-host/tauri-service'),controller=createAuthoritativeRecoveryController({workspace:authorizedWorkspace,create:(workspaceHandle)=>createTauriAgentHostService({workspaceHandle,instanceId:`settings.${crypto.randomUUID()}`})}),result=await(recover?controller.recover():controller.status());setHostStatus({status:result.status,detail:result.detail})}
  const diagnosticBundle = () => { const generatedAt=new Date().toISOString();return createDiagnosticBundle({ generatedAt, version: '0.1.0', safeMode: false, events: [...getAiNativeDiagnostics().map((item) => ({ at: new Date(item.at).toISOString(), level: item.level, scope: 'ui' as const, code: item.scope, correlationId: item.id, details: { message: item.message, details: item.details } })),{at:generatedAt,level:hostStatus.status==='error'?'error' as const:'info' as const,scope:'host' as const,code:'recovery.status',correlationId:'local-recovery',details:{status:hostStatus.status,detail:hostStatus.detail}}] }) };

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
        label="Developer mode"
        hint="Show read-only DAG, Design IR and receipt audit tools inside projects."
      >
        <Switch
          checked={developerMode}
          onCheckedChange={(enabled) => {
            setDeveloperMode(enabled);
            setDeveloperModeState(enabled);
          }}
          aria-label="Developer mode"
        />
      </Row>

      <UpdatesSection prepareRecoverySnapshot={prepareRecoverySnapshot} controller={updateController} />

      <Row
        label={
          <Trans id="settings.reset_params_label">Cutout parameters</Trans>
        }
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
            resetParams();
            toast.success(
              t({
                id: "settings.reset_done_toast",
                message: "Parameters reset",
              }),
            );
          }}
        >
          <RotateCcw />
          <Trans id="settings.reset_params">Reset parameters</Trans>
        </Button>
      </Row>

      <div className="py-3">
        <div className="text-sm font-medium">Local recovery</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Reset interface preferences or export a redacted local diagnostic bundle. Project data is not deleted.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { resetUiState(localStorage,[WORKSPACE_NAVIGATION_KEY,'cutout.canvas-background','cutout.canvas-grid','cutout.canvas-minimap']);toast.success('UI state reset'); }}><RotateCcw/>Reset UI state</Button>
          <Button variant="outline" size="sm" onClick={() => setDiagnosticsPreview(new TextDecoder().decode(diagnosticBundleBytes(diagnosticBundle())))}><Stethoscope/>Preview diagnostics</Button>
          <Button variant="outline" size="sm" onClick={() => { const bytes=diagnosticBundleBytes(diagnosticBundle()),url=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download='cutout-diagnostics.json';anchor.click();URL.revokeObjectURL(url); }}><Download/>Export diagnostics</Button>
          <Button variant="outline" size="sm" disabled={!authorizedWorkspace||hostStatus.status==='checking'} onClick={()=>void checkHost(false)}><Stethoscope/>Check host</Button>
          <Button variant="outline" size="sm" disabled={!authorizedWorkspace||hostStatus.status==='checking'} onClick={()=>void checkHost(true)}><RotateCcw/>Recover host</Button>
        </div>
        <p role="status" className="mt-2 text-xs text-muted-foreground">Host recovery: {hostStatus.detail}</p>
        {diagnosticsPreview ? <pre aria-label="Diagnostic bundle preview" className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-2 font-mono text-[10px]">{diagnosticsPreview}</pre> : null}
      </div>

      <Row
        label={
          <Trans id="settings.remember_dir_label">Remember export folder</Trans>
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
            id: "settings.remember_dir_label",
            message: "Remember export folder",
          })}
        />
      </Row>
    </div>
  );
}
