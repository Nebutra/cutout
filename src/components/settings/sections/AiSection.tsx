/**
 * AiSection — BYOK credentials (list + add/edit form).
 *
 * Folds the retired `ProviderSettingsDialog` into the Settings dialog: same
 * list | add | edit view machine, minus the outer `Dialog` (it now lives inside
 * `SettingsDialog`). Reuses `ProviderRow` / `ProviderForm` and all provider
 * hooks unchanged. A trust line surfaces the keychain guarantee inline.
 *
 * The Models block (assignment by output modality) is added in Phase 3.
 */
import { memo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { ProviderConfig } from "@/services/ai/provider-types";
import { useProviders } from "@/hooks/queries/providers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderRow } from "../ProviderRow";
import { ProviderForm } from "../ProviderForm";
import { ModelSlot } from "../ModelSlot";
import { MODEL_DIMENSIONS } from "../model-dimensions";
import { VectorizerPanel } from "../VectorizerPanel";
import { ProviderDirectory } from "../ProviderDirectory";
import type { ProviderDefinition } from "@/services/ai/provider-registry";
import { modelRoutingCoverage } from "../model-routing-summary";

type View =
  | { readonly mode: "list" }
  | { readonly mode: "add"; readonly definition?: ProviderDefinition }
  | { readonly mode: "edit"; readonly provider: ProviderConfig };

export function AiSection() {
  const [view, setView] = useState<View>({ mode: "list" });
  const providers = useProviders();
  const list = providers.data ?? [];

  if (view.mode !== "list") {
    if (view.mode === "add" && !view.definition) {
      return (
        <div data-provider-connect-layout className="flex min-h-full min-w-0 flex-col">
          <div className="shrink-0 pb-3">
            <h2 className="text-sm font-medium">
              <Trans id="settings.connect_a_provider">Connect a provider</Trans>
            </h2>
            <p className="mt-0.5 max-w-prose break-words text-xs text-muted-foreground">
              <Trans id="settings.choose_catalog_definition">
                Choose a catalog definition. Auto routing remains the default
                after connection.
              </Trans>
            </p>
          </div>
          <ProviderDirectory
            onSelect={(definition) => setView({ mode: "add", definition })}
          />
          <div className="sticky bottom-0 z-10 mt-3 shrink-0 border-t border-border bg-popover pt-3">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => setView({ mode: "list" })}
            >
              <Trans id="settings.cancel">Cancel</Trans>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">
            {view.mode === "add" ? (
              <Trans id="settings.add_provider">Add provider</Trans>
            ) : (
              <Trans id="settings.dialog_edit_title">Edit provider</Trans>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Trans id="settings.dialog_form_desc">
              Keys are stored only in the system keychain, never written to the
              web page or disk in plaintext.
            </Trans>
          </p>
        </div>
        <ProviderForm
          initial={view.mode === "edit" ? view.provider : undefined}
          initialKind={view.mode === "add" ? view.definition?.id : undefined}
          onDone={() => setView({ mode: "list" })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
        <Trans id="settings.keychain_trust">
          API keys are stored only in your OS keychain and injected in the
          native layer — they never enter the web page.
        </Trans>
      </div>

      <div className="flex flex-col gap-2">
        {providers.isLoading ? (
          <>
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </>
        ) : providers.isError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-6 text-center text-sm text-destructive">
            <Trans id="settings.load_failed">Failed to load providers</Trans>
          </p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-8 text-center">
            <KeyRound className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">
              <Trans id="settings.empty_title">
                No providers configured yet
              </Trans>
            </p>
            <p className="text-xs text-muted-foreground">
              <Trans id="settings.empty_desc">
                Add a provider and enter an API key to start using AI features.
              </Trans>
            </p>
          </div>
        ) : (
          list.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onEdit={(p) => setView({ mode: "edit", provider: p })}
            />
          ))
        )}
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setView({ mode: "add" })}
      >
        <Plus />
        <Trans id="settings.add_provider">Add provider</Trans>
      </Button>

      <ModelAssignments onConnect={() => setView({ mode: "add" })} />
    </div>
  );
}

const ModelAssignments = memo(function ModelAssignments({
  onConnect,
}: {
  readonly onConnect: () => void;
}) {
  const { t } = useLingui();
  const [advanced, setAdvanced] = useState(false);
  const providers = useProviders();
  const list = providers.data ?? [];
  const coverage = modelRoutingCoverage(list);
  const localizedDimensions: Record<
    (typeof MODEL_DIMENSIONS)[number]["task"],
    { label: string; description: string }
  > = {
    text: {
      label: t({
        id: "settings.dimension_text_label",
        message: "Text understanding",
      }),
      description: t({
        id: "settings.dimension_text_description",
        message: "Conversation, planning and document understanding.",
      }),
    },
    vision: {
      label: t({ id: "settings.dimension_vision_label", message: "Vision" }),
      description: t({
        id: "settings.dimension_vision_description",
        message: "Understand screenshots, photos and visual references.",
      }),
    },
    asr: {
      label: t({
        id: "settings.dimension_asr_label",
        message: "Speech to text",
      }),
      description: t({
        id: "settings.dimension_asr_description",
        message: "Transcribe spoken audio.",
      }),
    },
    tts: {
      label: t({
        id: "settings.dimension_tts_label",
        message: "Text to speech",
      }),
      description: t({
        id: "settings.dimension_tts_description",
        message: "Create spoken audio.",
      }),
    },
    webdev: {
      label: t({
        id: "settings.dimension_webdev_label",
        message: "Web development",
      }),
      description: t({
        id: "settings.dimension_webdev_description",
        message: "Plan and implement web interfaces.",
      }),
    },
    "image-to-webdev": {
      label: t({
        id: "settings.dimension_image_to_webdev_label",
        message: "Image to Web",
      }),
      description: t({
        id: "settings.dimension_image_to_webdev_description",
        message: "Implement a web interface from visual evidence.",
      }),
    },
    "image-generation": {
      label: t({
        id: "settings.dimension_image_generation_label",
        message: "Image generation",
      }),
      description: t({
        id: "settings.dimension_image_generation_description",
        message: "Generate new visual material.",
      }),
    },
    "image-edit": {
      label: t({
        id: "settings.dimension_image_edit_label",
        message: "Image editing",
      }),
      description: t({
        id: "settings.dimension_image_edit_description",
        message: "Edit one or more supplied images.",
      }),
    },
    research: {
      label: "Research",
      description: "Research with provider-supported search and tools.",
    },
    "video-generation": {
      label: "Video generation",
      description: "Generate video deliverables.",
    },
    "video-edit": {
      label: "Video editing",
      description: "Edit supplied video material.",
    },
  };

  if (list.length === 0)
    return (
      <div className="mt-2 rounded-lg border border-dashed border-border px-4 py-5 text-center">
        <KeyRound className="mx-auto size-5 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium">
          <Trans id="settings.connect_ai_capabilities">
            Connect AI capabilities
          </Trans>
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          <Trans id="settings.connect_ai_capabilities_description">
            Connect one provider first. Cutout will then route text, vision,
            speech, coding and image tasks automatically.
          </Trans>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onConnect}
        >
          <Plus className="size-3.5" />
          <Trans id="settings.connect_provider">Connect provider</Trans>
        </Button>
      </div>
    );

  return (
    <div data-settings-anchor="model-routing" tabIndex={-1} className="mt-2 flex flex-col gap-3 border-t border-border pt-4 outline-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Trans id="settings.model_routing">Model routing</Trans>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans id="settings.model_routing_description">
              Auto routes each task only to an available adapter with the
              required capability.
            </Trans>
          </p>
        </div>
        <Button
          variant={advanced ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setAdvanced((value) => !value)}
        >
          <SlidersHorizontal className="size-3.5" />{" "}
          <Trans id="settings.advanced">Advanced</Trans>
        </Button>
      </div>
      <div
        className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-emerald-500" />
          {t({
            id: "settings.task_dimensions_covered",
            message: `${coverage.covered.length} of ${coverage.total} task dimensions covered`,
          })}
        </div>
        {coverage.missing.length ? (
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-3.5" />
              {t({
                id: "settings.capability_gaps_count",
                message: plural(coverage.missing.length, {
                  one: "# capability gap",
                  other: "# capability gaps",
                }),
              })}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {coverage.missing.map((item) => (
                <span
                  key={item.task}
                  className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300"
                >
                  {localizedDimensions[item.task]?.label ?? item.label}
                </span>
              ))}
            </div>
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 text-xs"
              onClick={onConnect}
            >
              <Trans id="settings.connect_provider_with_capabilities">
                Connect a provider with these capabilities
              </Trans>
            </Button>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans id="settings.all_dimensions_covered">
              All configured dimensions have adapter coverage. Model-level
              evidence is checked at selection time.
            </Trans>
          </p>
        )}
      </div>
      {advanced ? (
        <div
          className="flex flex-col gap-2"
          aria-label={t({
            id: "settings.advanced_model_bindings_aria",
            message: "Advanced model bindings",
          })}
        >
          {MODEL_DIMENSIONS.map((dimension) => (
            <ModelSlot
              key={dimension.task}
              {...dimension}
              {...localizedDimensions[dimension.task]}
              advanced
            />
          ))}
        </div>
      ) : null}
      <VectorizerPanel />
    </div>
  );
});
