import { useEffect, useState } from "react";
import { Download, RotateCcw, Stethoscope } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createAuthoritativeRecoveryController,
  createDiagnosticBundle,
  diagnosticBundleBytes,
  resetUiState,
} from "@/local-recovery";
import { getAiNativeDiagnostics } from "@/services/ai-native/diagnostics";
import {
  getAuthorizedWorkspace,
  subscribeAuthorizedWorkspace,
  type AuthorizedWorkspace,
} from "@/platform/authorized-workspace";
import { WORKSPACE_NAVIGATION_KEY } from "@/workspace/navigation";

type HostStatus = "unavailable" | "checking" | "ready" | "error";

export function RecoverySection() {
  const { t } = useLingui();
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<string>();
  const [authorizedWorkspace, setAuthorizedWorkspace] = useState<
    AuthorizedWorkspace | undefined
  >(getAuthorizedWorkspace);
  const [hostStatus, setHostStatus] = useState<HostStatus>(
    getAuthorizedWorkspace() ? "checking" : "unavailable",
  );

  useEffect(
    () =>
      subscribeAuthorizedWorkspace((workspace) => {
        setAuthorizedWorkspace(workspace);
        setHostStatus(workspace ? "checking" : "unavailable");
      }),
    [],
  );

  const hostStatusText: Record<HostStatus, string> = {
    unavailable: t({
      id: "settings.recovery.host_unauthorized",
      message: "Authorize a workspace before using host recovery.",
    }),
    checking: t({
      id: "settings.recovery.host_checking",
      message: "Checking host status...",
    }),
    ready: t({ id: "settings.recovery.host_ready", message: "Host is ready." }),
    error: t({
      id: "settings.recovery.host_error",
      message: "Host recovery could not be completed.",
    }),
  };
  const diagnosticBundle = () => {
    const generatedAt = new Date().toISOString();
    return createDiagnosticBundle({
      generatedAt,
      version: "0.1.3",
      safeMode: false,
      events: [
        ...getAiNativeDiagnostics().map((item) => ({
          at: new Date(item.at).toISOString(),
          level: item.level,
          scope: "ui" as const,
          code: item.scope,
          correlationId: item.id,
          details: { message: item.message, details: item.details },
        })),
        {
          at: generatedAt,
          level: hostStatus === "error" ? ("error" as const) : ("info" as const),
          scope: "host" as const,
          code: "recovery.status",
          correlationId: "local-recovery",
          details: { status: hostStatus },
        },
      ],
    });
  };
  const checkHost = async (recover = false) => {
    setHostStatus("checking");
    const { createTauriAgentHostService } = await import(
      "@/agent-host/tauri-service"
    );
    const controller = createAuthoritativeRecoveryController({
      workspace: authorizedWorkspace,
      create: (workspaceHandle) =>
        createTauriAgentHostService({
          workspaceHandle,
          instanceId: `settings.${crypto.randomUUID()}`,
        }),
    });
    const result = await (recover ? controller.recover() : controller.status());
    setHostStatus(result.status);
  };

  return (
    <section className="border-t border-border pt-4" aria-labelledby="recovery-title">
      <h3 id="recovery-title" className="text-sm font-medium">
        <Trans id="settings.recovery.title">Local recovery</Trans>
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        <Trans id="settings.recovery.hint">
          Reset interface preferences or export a redacted local diagnostic bundle. Project data is not deleted.
        </Trans>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetUiState(localStorage, [
              WORKSPACE_NAVIGATION_KEY,
              "cutout.canvas-background",
              "cutout.canvas-grid",
              "cutout.canvas-minimap",
            ]);
            toast.success(
              t({ id: "settings.recovery.ui_reset", message: "UI state reset" }),
            );
          }}
        >
          <RotateCcw />
          <Trans id="settings.recovery.reset_ui">Reset UI state</Trans>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setDiagnosticsPreview(
              new TextDecoder().decode(diagnosticBundleBytes(diagnosticBundle())),
            )
          }
        >
          <Stethoscope />
          <Trans id="settings.recovery.preview_diagnostics">
            Preview diagnostics
          </Trans>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const bytes = diagnosticBundleBytes(diagnosticBundle());
            const url = URL.createObjectURL(
              new Blob([bytes], { type: "application/json" }),
            );
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "cutout-diagnostics.json";
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download />
          <Trans id="settings.recovery.export_diagnostics">
            Export diagnostics
          </Trans>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!authorizedWorkspace || hostStatus === "checking"}
          onClick={() => void checkHost()}
        >
          <Stethoscope />
          <Trans id="settings.recovery.check_host">Check host</Trans>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!authorizedWorkspace || hostStatus === "checking"}
          onClick={() => void checkHost(true)}
        >
          <RotateCcw />
          <Trans id="settings.recovery.recover_host">Recover host</Trans>
        </Button>
      </div>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        <Trans id="settings.recovery.host_status">Host recovery:</Trans>{" "}
        {hostStatusText[hostStatus]}
      </p>
      {diagnosticsPreview ? (
        <pre
          aria-label={t({
            id: "settings.recovery.diagnostic_preview_aria",
            message: "Diagnostic bundle preview",
          })}
          className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-2 font-mono text-[10px]"
        >
          {diagnosticsPreview}
        </pre>
      ) : null}
    </section>
  );
}
