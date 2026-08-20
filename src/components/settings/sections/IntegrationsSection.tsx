import { useState } from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { connectorCatalog } from "@/components/integrations/connector-catalog";
import { useIntegrationConnections } from "@/components/integrations/IntegrationConnectionContext";
import { IntegrationIcon } from "../integration-icons";

const oauthProviders = new Set(["cutout.github", "cutout.notion"]);

export function IntegrationsSection() {
  const { t } = useLingui();
  const controller = useIntegrationConnections(),
    [, render] = useState(0);
  const update = () => render((v) => v + 1);

  const statusLabel = (status: string, reason?: string) => {
    if (status === "disabled")
      return (
        reason ??
        t({
          id: "settings.integrations.desktop_not_installed",
          message: "Desktop provider is not installed.",
        })
      );
    if (status === "connected")
      return t({
        id: "settings.integrations.connected",
        message: "Connected with a host-owned session.",
      });
    if (status === "expired")
      return t({
        id: "settings.integrations.expired",
        message: "Session expired. Refresh or reconnect.",
      });
    if (status === "authorizing")
      return t({
        id: "settings.integrations.authorizing",
        message: "Complete authorization in the provider window.",
      });
    if (status === "refreshing")
      return t({
        id: "settings.integrations.refreshing",
        message: "Refreshing session...",
      });
    if (status === "revoking")
      return t({
        id: "settings.integrations.revoking",
        message: "Revoking session...",
      });
    if (status === "error")
      return t({
        id: "settings.integrations.connection_failed",
        message: "Connection failed.",
      });
    return (
      reason ??
      t({
        id: "settings.integrations.not_connected",
        message: "Not connected.",
      })
    );
  };

  return (
    <section
      aria-labelledby="settings-integrations-heading"
      className="flex flex-col gap-4"
    >
      <div>
        <h2
          id="settings-integrations-heading"
          tabIndex={-1}
          className="text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trans id="settings.section_integrations">Integrations</Trans>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <Trans id="settings.integrations.description">
            Credentials remain in the desktop host. Cutout stores only opaque,
            revocable session handles.
          </Trans>
        </p>
      </div>
      <div className="divide-y divide-border">
        {connectorCatalog.map((connector) => {
          const state = controller.state(connector.id, connector.provider.id),
            oauth = oauthProviders.has(connector.id),
            busy = ["authorizing", "refreshing", "revoking"].includes(
              state.status,
            );
          return (
            <div
              key={connector.id}
              className="flex min-h-14 items-center gap-3 py-3"
            >
              <IntegrationIcon
                id={connector.id}
                name={connector.product.name}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{connector.product.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {statusLabel(state.status, connector.unavailableReason)}
                </p>
                {state.error ? (
                  <p className="mt-0.5 text-xs text-destructive">
                    {state.error}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {state.status === "connected" ? (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t({
                        id: "settings.integrations.refresh_session",
                        message: "Refresh session",
                      })}
                      disabled={busy}
                      onClick={() =>
                        void controller.refresh(connector.id).then(update)
                      }
                    >
                      <RefreshCw />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t({
                        id: "settings.integrations.disconnect",
                        message: "Disconnect",
                      })}
                      disabled={busy}
                      onClick={() =>
                        void controller.disconnect(connector.id).then(update)
                      }
                    >
                      <Unplug />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!oauth || state.status === "disabled" || busy}
                    onClick={() =>
                      void controller
                        .begin(
                          connector.id,
                          connector.provider.id,
                          scopes(connector.id),
                        )
                        .then(update)
                    }
                  >
                    {state.status === "authorizing"
                      ? t({
                          id: "settings.integrations.waiting_callback",
                          message: "Waiting for callback",
                        })
                      : t({
                          id: "settings.integrations.connect",
                          message: "Connect",
                        })}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans id="settings.integrations.handshake_note">
          Plugin, MCP, CLI and local-vault integrations become available only
          after their host handshake is verified.
        </Trans>
      </p>
    </section>
  );
}

function scopes(id: string) {
  return id === "cutout.github"
    ? ["contents:read", "pull_requests:write"]
    : id === "cutout.notion"
      ? ["read_content", "insert_content"]
      : [];
}
