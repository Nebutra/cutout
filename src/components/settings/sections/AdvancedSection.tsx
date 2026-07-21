import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Switch } from "@/components/ui/switch";
import { loadWorkspaceNavigation, setDeveloperMode } from "@/workspace/navigation";

export function AdvancedSection() {
  const { t } = useLingui();
  const [developerMode, setDeveloperModeState] = useState(
    () => loadWorkspaceNavigation().advanced,
  );

  return (
    <div className="flex flex-col divide-y divide-border">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            <Trans id="settings.developer_mode.title">Developer mode</Trans>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <Trans id="settings.developer_mode.hint">
              Show read-only DAG, Design IR and receipt audit tools inside projects.
            </Trans>
          </div>
        </div>
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
      </div>
    </div>
  );
}
