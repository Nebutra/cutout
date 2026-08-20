import { useEffect, useState } from "react";
import { ChevronRight, Download, RotateCcw, Stethoscope } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createAuthoritativeRecoveryController,
  createDiagnosticBundle,
  diagnosticBundleBytes,
  resetUiState,
} from "@/local-recovery";
import { getRuntimeDiagnostics } from "@/services/runtime-diagnostics";
import {
  getAuthorizedWorkspace,
  subscribeAuthorizedWorkspace,
  type AuthorizedWorkspace,
} from "@/platform/authorized-workspace";
import { WORKSPACE_NAVIGATION_KEY } from "@/workspace/navigation";
import { PRODUCT_VERSION } from "@/product-version";

type HostStatus = "unavailable" | "idle" | "checking" | "ready" | "error";

export function RecoverySection() {
  const { t } = useLingui();
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<string>();
  const [authorizedWorkspace, setAuthorizedWorkspace] = useState<
    AuthorizedWorkspace | undefined
  >(getAuthorizedWorkspace);
  const [hostStatus, setHostStatus] = useState<HostStatus>(
    getAuthorizedWorkspace() ? "idle" : "unavailable",
  );

  useEffect(
    () =>
      subscribeAuthorizedWorkspace((workspace) => {
        setAuthorizedWorkspace(workspace);
        setHostStatus(workspace ? "idle" : "unavailable");
      }),
    [],
  );

  const hostStatusText: Partial<Record<HostStatus, string>> = {
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
  const currentHostStatusText = hostStatusText[hostStatus];
  const diagnosticBundle = () => {
    const generatedAt = new Date().toISOString();
    return createDiagnosticBundle({
      generatedAt,
      version: PRODUCT_VERSION,
      safeMode: false,
      events: [
        ...getRuntimeDiagnostics().map((item) => ({
          at: new Date(item.at).toISOString(),
          level: item.level,
          scope: "ui" as const,
          code: item.scope,
          correlationId: item.id,
          details: { message: item.message, details: item.details },
        })),
        {
          at: generatedAt,
          level:
            hostStatus === "error" ? ("error" as const) : ("info" as const),
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
    const { createTauriAgentHostService } =
      await import("@/agent-host/tauri-service");
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
    <section aria-labelledby="recovery-title">
      <h3
        id="recovery-title"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        <Trans id="settings.recovery.title">Troubleshooting</Trans>
      </h3>
      <p className="mt-2 text-xs text-muted-foreground">
        <Trans id="settings.recovery.hint">
          Reset interface preferences or export a redacted local diagnostic
          bundle. Project data is not deleted.
        </Trans>
      </p>
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetUiState(localStorage, [
              WORKSPACE_NAVIGATION_KEY,
              "cutout.canvas-background",
              "cutout.canvas-grid",
            ]);
            toast.success(
              t({
                id: "settings.recovery.ui_reset",
                message: "UI state reset",
              }),
            );
          }}
        >
          <RotateCcw />
          <Trans id="settings.recovery.reset_ui">Reset UI state</Trans>
        </Button>
      </div>
      <details className="group/recovery mt-3 border-t border-border pt-1">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open/recovery:rotate-90" />
          <Trans id="settings.recovery.advanced">
            Diagnostics and recovery
          </Trans>
        </summary>
        <div className="flex flex-col gap-3 pb-1 pl-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDiagnosticsPreview(
                  new TextDecoder().decode(
                    diagnosticBundleBytes(diagnosticBundle()),
                  ),
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
          </div>

          <div className="border-t border-border pt-3">
            {authorizedWorkspace ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={hostStatus === "checking"}
                    onClick={() => void checkHost()}
                  >
                    <Stethoscope />
                    <Trans id="settings.recovery.check_host">Check host</Trans>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={hostStatus === "checking"}
                    onClick={() => void checkHost(true)}
                  >
                    <RotateCcw />
                    <Trans id="settings.recovery.recover_host">
                      Recover host
                    </Trans>
                  </Button>
                </div>
                {currentHostStatusText ? (
                  <p
                    role="status"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    {currentHostStatusText}
                  </p>
                ) : null}
              </>
            ) : (
              <p role="status" className="mt-1 text-xs text-muted-foreground">
                {hostStatusText.unavailable}
              </p>
            )}
          </div>

          {diagnosticsPreview ? (
            <pre
              aria-label={t({
                id: "settings.recovery.diagnostic_preview_aria",
                message: "Diagnostic bundle preview",
              })}
              className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs"
            >
              {diagnosticsPreview}
            </pre>
          ) : null}
        </div>
      </details>
    </section>
  );
}
