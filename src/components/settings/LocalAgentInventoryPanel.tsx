import { useMemo } from "react";
import { Bot, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  discoverLocalAgentInventory,
  type LocalAgentInventoryRow,
} from "@/services/ai/local-agent-inventory";

type InventoryStatus =
  | "installed"
  | "configuration-found"
  | "permission-required"
  | "scan-failed"
  | "not-installed";

function inventoryStatus(row: LocalAgentInventoryRow): InventoryStatus {
  const rootStatuses = row.configRoots.map((root) => root.status);
  if (
    row.installation.status === "permission-required" ||
    rootStatuses.includes("permission-required")
  ) {
    return "permission-required";
  }
  if (
    row.installation.status === "probe-failed" ||
    rootStatuses.includes("probe-failed")
  ) {
    return "scan-failed";
  }
  if (row.installation.status === "installed") return "installed";
  if (rootStatuses.includes("found")) return "configuration-found";
  return "not-installed";
}

function StatusLabel({ status }: { readonly status: InventoryStatus }) {
  switch (status) {
    case "installed":
      return <Trans id="settings.local_agents_installed">Installed</Trans>;
    case "configuration-found":
      return (
        <Trans id="settings.local_agents_configuration_found">
          Configuration found
        </Trans>
      );
    case "permission-required":
      return (
        <Trans id="settings.local_agents_permission_required">
          Permission required
        </Trans>
      );
    case "scan-failed":
      return <Trans id="settings.local_agents_scan_failed">Scan failed</Trans>;
    case "not-installed":
      return (
        <Trans id="settings.local_agents_not_installed">Not installed</Trans>
      );
  }
}

function rowLocations(row: LocalAgentInventoryRow): string | null {
  const visibleRoots = row.configRoots.filter(
    (root) => root.status !== "not-found",
  );
  if (visibleRoots.length === 0) return null;
  return visibleRoots.map((root) => root.label).join(" · ");
}

export function LocalAgentInventoryView({
  rows,
  loading,
  error,
  refreshing,
  onRetry,
}: {
  readonly rows?: readonly LocalAgentInventoryRow[];
  readonly loading: boolean;
  readonly error: boolean;
  readonly refreshing: boolean;
  readonly onRetry: () => void;
}) {
  const { t } = useLingui();
  const summary = useMemo(() => {
    const available = rows ?? [];
    return {
      installed: available.filter(
        (row) => row.installation.status === "installed",
      ).length,
      configured: available.filter((row) =>
        row.configRoots.some((root) => root.status === "found"),
      ).length,
      permissionRequired: available.some(
        (row) => inventoryStatus(row) === "permission-required",
      ),
    };
  }, [rows]);
  const retryLabel = t({
    id: "settings.local_agents_scan_again",
    message: "Scan again",
  });

  return (
    <section
      data-local-agent-inventory
      className="flex min-w-0 flex-col gap-2 border-t border-border pt-4"
      aria-labelledby="settings-local-agents-heading"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="settings-local-agents-heading"
            className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            <Bot className="size-3.5 shrink-0" />
            <Trans id="settings.local_agents_title">Local coding agents</Trans>
          </h3>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            <Trans id="settings.local_agents_description">
              Cutout checks 39 reviewed coding agents across their registered
              command and configuration locations.
            </Trans>
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={retryLabel}
              onClick={onRetry}
              disabled={refreshing}
            >
              <RefreshCw
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{retryLabel}</TooltipContent>
        </Tooltip>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground" role="status">
          <Trans id="settings.local_agents_scanning">
            Scanning reviewed Agent locations...
          </Trans>
        </p>
      ) : error || !rows ? (
        <div className="flex items-center justify-between gap-3 border-y border-border py-2">
          <p className="text-xs text-destructive" role="alert">
            <Trans id="settings.local_agents_scan_error">
              Could not scan local Agent locations.
            </Trans>
          </p>
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            <RefreshCw />
            {retryLabel}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <Trans id="settings.local_agents_summary">
              {summary.installed} installed · {summary.configured} with
              configuration
            </Trans>
          </p>
          {summary.permissionRequired ? (
            <div className="flex items-start gap-2 border-y border-amber-500/30 py-2 text-xs text-amber-700 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <Trans id="settings.local_agents_permission_hint">
                Allow access if your system asks, then scan again.
              </Trans>
            </div>
          ) : null}
          <details className="group min-w-0">
            <summary className="cursor-pointer select-none text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Trans id="settings.local_agents_view_all">
                View all 39 agents
              </Trans>
            </summary>
            <div className="mt-2 max-h-72 min-w-0 divide-y divide-border overflow-y-auto border-y border-border">
              {rows.map((row) => {
                const status = inventoryStatus(row);
                const locations = rowLocations(row);
                return (
                  <div
                    key={row.id}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {row.displayName}
                      </p>
                      <p className="break-words text-[11px] text-muted-foreground">
                        {locations ?? (
                          <Trans id="settings.local_agents_no_config">
                            No reviewed config found
                          </Trans>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      <StatusLabel status={status} />
                    </span>
                    <span className="col-span-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <KeyRound className="size-3 shrink-0" />
                      {row.capabilities.credentialAdapter === "supported" ? (
                        <Trans id="settings.local_agents_api_key_supported">
                          API key import supported
                        </Trans>
                      ) : (
                        <Trans id="settings.local_agents_api_key_unsupported">
                          No reviewed API key import
                        </Trans>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function LocalAgentInventoryPanel() {
  const query = useQuery({
    queryKey: ["local-agent-inventory"],
    queryFn: discoverLocalAgentInventory,
    retry: false,
  });
  return (
    <LocalAgentInventoryView
      rows={query.data}
      loading={query.isLoading}
      error={query.isError}
      refreshing={query.isFetching}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
}
