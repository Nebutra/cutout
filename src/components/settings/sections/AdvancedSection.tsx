import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/store";
import { loadWorkspaceNavigation, setDeveloperMode } from "@/workspace/navigation";

export function AdvancedSection() {
  const { t } = useLingui();
  const resetParams = useStore((state) => state.resetParams);
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
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            <Trans id="settings.reset_params_label">Cutout parameters</Trans>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <Trans id="settings.reset_params_hint">
              Restore threshold, min area, gap and padding to defaults.
            </Trans>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetParams();
            toast.success(
              t({ id: "settings.reset_done_toast", message: "Parameters reset" }),
            );
          }}
        >
          <RotateCcw />
          <Trans id="settings.reset_params">Reset parameters</Trans>
        </Button>
      </div>
    </div>
  );
}
