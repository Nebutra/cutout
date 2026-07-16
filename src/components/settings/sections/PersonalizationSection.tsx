import { useEffect, useState } from "react";
import { Brain, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  defaultPersonalizationSettings,
  type PersonalizationSettings,
} from "@/personalization";
import {
  usePersonalization,
  useResetPersonalization,
  useSavePersonalization,
} from "@/hooks/queries/personalization";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PERSONALITY_VALUES = [
  "auto",
  "friendly",
  "concise",
  "professional",
  "direct",
  "custom",
] as const satisfies readonly PersonalizationSettings["personality"][];

export function PersonalizationSection() {
  const { t } = useLingui();
  const query = usePersonalization(),
    save = useSavePersonalization(),
    reset = useResetPersonalization(),
    settings = query.data ?? defaultPersonalizationSettings,
    [instructions, setInstructions] = useState(settings.customInstructions),
    [personality, setPersonality] = useState(settings.personality);
  useEffect(() => {
    setInstructions(settings.customInstructions);
    setPersonality(settings.personality);
  }, [settings]);
  const busy = query.isLoading || save.isPending || reset.isPending,
    dirty =
      instructions !== settings.customInstructions ||
      personality !== settings.personality;

  const personalities = PERSONALITY_VALUES.map((value) => {
    switch (value) {
      case "auto":
        return {
          value,
          label: t({
            id: "settings.personalization.personality_auto",
            message: "Auto",
          }),
          description: t({
            id: "settings.personalization.personality_auto_desc",
            message: "Adapt to the task and requested result.",
          }),
        };
      case "friendly":
        return {
          value,
          label: t({
            id: "settings.personalization.personality_friendly",
            message: "Friendly",
          }),
          description: t({
            id: "settings.personalization.personality_friendly_desc",
            message: "Warm and collaborative.",
          }),
        };
      case "concise":
        return {
          value,
          label: t({
            id: "settings.personalization.personality_concise",
            message: "Concise",
          }),
          description: t({
            id: "settings.personalization.personality_concise_desc",
            message: "Short, direct responses.",
          }),
        };
      case "professional":
        return {
          value,
          label: t({
            id: "settings.personalization.personality_professional",
            message: "Professional",
          }),
          description: t({
            id: "settings.personalization.personality_professional_desc",
            message: "Structured and formal.",
          }),
        };
      case "direct":
        return {
          value,
          label: t({
            id: "settings.personalization.personality_direct",
            message: "Direct",
          }),
          description: t({
            id: "settings.personalization.personality_direct_desc",
            message: "Clear trade-offs and decisive recommendations.",
          }),
        };
      case "custom":
        return {
          value,
          label: t({
            id: "settings.personalization.personality_custom",
            message: "Custom",
          }),
          description: t({
            id: "settings.personalization.personality_custom_desc",
            message: "Follow your saved instructions.",
          }),
        };
    }
  });

  const persist = async (next: PersonalizationSettings, success: string) => {
    try {
      await save.mutateAsync(next);
      toast.success(success);
    } catch (error) {
      toast.error(
        t({
          id: "settings.personalization.save_failed_toast",
          message: "Could not save personalization",
        }),
        {
          description:
            error instanceof Error ? error.message : String(error),
        },
      );
    }
  };

  const selectPersonality = (
    value: PersonalizationSettings["personality"],
  ) => {
    setPersonality(value);
    if (value === "custom" && !instructions.trim()) return;
    void persist(
      { ...settings, personality: value, customInstructions: instructions },
      t({
        id: "settings.personalization.personality_updated_toast",
        message: "Personality updated",
      }),
    );
  };

  if (query.isLoading)
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        <Trans id="settings.personalization.loading">
          Loading personalization…
        </Trans>
      </div>
    );

  if (query.isError)
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
      >
        <p className="text-sm font-medium text-destructive">
          <Trans id="settings.personalization.load_failed">
            Personalization could not be loaded.
          </Trans>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void query.refetch()}
        >
          <Trans id="settings.personalization.retry">Retry</Trans>
        </Button>
      </div>
    );

  return (
    <section
      aria-labelledby="personalization-heading"
      className="flex flex-col gap-5"
    >
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h2 id="personalization-heading" className="text-sm font-semibold">
            <Trans id="settings.section_personalization">Personalization</Trans>
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans id="settings.personalization.description">
            Shape how the Agent works with you while keeping every project
            focused on the result.
          </Trans>
        </p>
        <p className="mt-2 rounded-md border border-border bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
          <Trans id="settings.personalization.compatibility">
            Compatibility: these preferences are stored locally. External Agents
            receive only privacy-safe capability status, never your instruction
            text.
          </Trans>
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">
          <Trans id="settings.personalization.personality">Personality</Trans>
        </h3>
        <div
          role="radiogroup"
          aria-label={t({
            id: "settings.personalization.personality_aria",
            message: "Agent personality",
          })}
          className="mt-2 grid grid-cols-2 gap-2"
        >
          {personalities.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={personality === item.value}
              disabled={busy}
              onClick={() => selectPersonality(item.value)}
              className={`rounded-lg border p-2.5 text-left disabled:opacity-50 ${
                personality === item.value
                  ? "border-foreground bg-foreground/5"
                  : "border-border"
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {item.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <Label htmlFor="custom-instructions">
            <Trans id="settings.personalization.custom_instructions">
              Custom instructions
            </Trans>
          </Label>
          <span className="text-[11px] text-muted-foreground">
            {instructions.length} / 4000
          </span>
        </div>
        <Textarea
          id="custom-instructions"
          value={instructions}
          disabled={busy}
          maxLength={4000}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={t({
            id: "settings.personalization.custom_instructions_placeholder",
            message:
              "Describe stable preferences, constraints, or how you want results presented.",
          })}
          className="mt-2 min-h-28 resize-y"
          aria-describedby="custom-instructions-help"
        />
        <p
          id="custom-instructions-help"
          className="mt-1 text-xs text-muted-foreground"
        >
          <Trans id="settings.personalization.custom_instructions_help">
            Do not include API keys or private credentials. Project-specific
            requirements belong in the project brief.
          </Trans>
        </p>
        {personality === "custom" && !instructions.trim() ? (
          <p
            role="alert"
            className="mt-1 text-xs text-amber-700 dark:text-amber-300"
          >
            <Trans id="settings.personalization.custom_requires_instructions">
              Custom personality requires instructions before it can be saved.
            </Trans>
          </p>
        ) : null}
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={
              !dirty ||
              busy ||
              (personality === "custom" && !instructions.trim())
            }
            onClick={() =>
              void persist(
                {
                  ...settings,
                  personality,
                  customInstructions: instructions,
                },
                t({
                  id: "settings.personalization.instructions_saved_toast",
                  message: "Instructions saved",
                }),
              )
            }
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            <Trans id="settings.personalization.save_changes">
              Save changes
            </Trans>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">
              <Trans id="settings.personalization.memory">Memory</Trans>
            </h3>
            <p className="text-xs text-muted-foreground">
              <Trans id="settings.personalization.memory_description">
                Allow useful preferences to carry across your local work.
              </Trans>
            </p>
          </div>
        </div>
        <div className="mt-3 divide-y divide-border">
          <label className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-sm">
                <Trans id="settings.personalization.use_memory">
                  Use memory
                </Trans>
              </span>
              <span className="block text-xs text-muted-foreground">
                <Trans id="settings.personalization.use_memory_desc">
                  Reuse approved preferences in future sessions.
                </Trans>
              </span>
            </span>
            <Switch
              checked={settings.memoryEnabled}
              disabled={busy}
              onCheckedChange={(checked) =>
                void persist(
                  {
                    ...settings,
                    memoryEnabled: checked,
                    toolAssistedMemory: checked
                      ? settings.toolAssistedMemory
                      : false,
                  },
                  checked
                    ? t({
                        id: "settings.personalization.memory_enabled_toast",
                        message: "Memory enabled",
                      })
                    : t({
                        id: "settings.personalization.memory_disabled_toast",
                        message: "Memory disabled",
                      }),
                )
              }
              aria-label={t({
                id: "settings.personalization.use_memory",
                message: "Use memory",
              })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-sm">
                <Trans id="settings.personalization.tool_assisted_memory">
                  Tool-assisted memory
                </Trans>
              </span>
              <span className="block text-xs text-muted-foreground">
                <Trans id="settings.personalization.tool_assisted_memory_desc">
                  Let approved tools contribute preference signals.
                </Trans>
              </span>
            </span>
            <Switch
              checked={settings.toolAssistedMemory}
              disabled={busy || !settings.memoryEnabled}
              onCheckedChange={(checked) =>
                void persist(
                  { ...settings, toolAssistedMemory: checked },
                  checked
                    ? t({
                        id: "settings.personalization.tool_memory_enabled_toast",
                        message: "Tool-assisted memory enabled",
                      })
                    : t({
                        id: "settings.personalization.tool_memory_disabled_toast",
                        message: "Tool-assisted memory disabled",
                      }),
                )
              }
              aria-label={t({
                id: "settings.personalization.tool_assisted_memory",
                message: "Tool-assisted memory",
              })}
            />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="text-muted-foreground"
              >
                <RotateCcw />
                <Trans id="settings.personalization.reset">Reset</Trans>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans id="settings.personalization.reset_title">
                    Reset personalization?
                  </Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans id="settings.personalization.reset_description">
                    This restores personality, custom instructions, and memory
                    permissions to their defaults. It cannot be undone.
                  </Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Trans id="settings.cancel">Cancel</Trans>
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void reset
                      .mutateAsync()
                      .then(() =>
                        toast.success(
                          t({
                            id: "settings.personalization.reset_done_toast",
                            message: "Personalization reset",
                          }),
                        ),
                      )
                      .catch((error) =>
                        toast.error(
                          t({
                            id: "settings.personalization.reset_failed_toast",
                            message: "Reset failed",
                          }),
                          {
                            description:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          },
                        ),
                      )
                  }
                >
                  <Trans id="settings.personalization.reset_confirm">
                    Reset personalization
                  </Trans>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </section>
  );
}
