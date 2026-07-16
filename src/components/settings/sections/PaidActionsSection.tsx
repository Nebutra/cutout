import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  loadPaidToolPreferences,
  savePaidToolPreferences,
} from "@/agent-runtime/paid-tool-preferences";

export function PaidActionsSection() {
  const { t } = useLingui();
  const [preferences, setPreferences] = useState(loadPaidToolPreferences);
  const update = (next: typeof preferences) => {
    savePaidToolPreferences(next);
    setPreferences(next);
  };

  return (
    <section
      data-settings-anchor="paid-actions"
      tabIndex={-1}
      className="border-t border-border pt-4 outline-none"
      aria-labelledby="paid-actions-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="paid-actions-title" className="text-sm font-medium">
            <Trans id="settings.paid_actions.title">Paid actions</Trans>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Trans id="settings.paid_actions.hint">
              Let the Agent proceed automatically only within this per-action ceiling.
            </Trans>
          </p>
        </div>
        <Switch
          aria-label={t({
            id: "settings.paid_actions.auto_approve_aria",
            message: "Automatically approve paid actions within budget",
          })}
          checked={preferences.approvalPolicy === "auto-within-budget"}
          onCheckedChange={(checked) =>
            update({
              ...preferences,
              approvalPolicy: checked ? "auto-within-budget" : "explicit",
            })
          }
        />
      </div>
      <label className="mt-3 flex items-center justify-between gap-4 text-xs">
        <span>
          <Trans id="settings.paid_actions.maximum_cost">
            Maximum per action (USD)
          </Trans>
        </span>
        <Input
          aria-label={t({
            id: "settings.paid_actions.maximum_cost_aria",
            message: "Maximum paid action cost in USD",
          })}
          className="h-8 w-24 text-right"
          type="number"
          min="0"
          step="0.01"
          value={preferences.budgetCeiling.amount}
          onChange={(event) => {
            const amount = Number(event.target.value);
            if (Number.isFinite(amount) && amount >= 0)
              update({
                ...preferences,
                budgetCeiling: { ...preferences.budgetCeiling, amount },
              });
          }}
        />
      </label>
    </section>
  );
}
