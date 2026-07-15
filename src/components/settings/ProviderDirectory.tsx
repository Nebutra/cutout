import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound, Search } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProviderDefinition } from "@/services/ai/provider-registry";
import { Input } from "@/components/ui/input";
import { providerDirectoryItems } from "./provider-directory-model";
import { ProviderIcon } from "./provider-icons";

const categories: readonly ProviderDefinition["category"][] = [
  "recommended",
  "global",
  "china",
  "gateway",
  "local",
  "speech",
  "media",
  "custom",
];

export function ProviderDirectory({
  onSelect,
}: {
  readonly onSelect: (definition: ProviderDefinition) => void;
}) {
  const { t } = useLingui();
  const labels: Record<ProviderDefinition["category"], string> = {
    recommended: t({
      id: "settings.provider_category_recommended",
      message: "Recommended",
    }),
    global: t({ id: "settings.provider_category_global", message: "Global" }),
    china: t({ id: "settings.provider_category_china", message: "China" }),
    gateway: t({
      id: "settings.provider_category_gateway",
      message: "Gateways",
    }),
    local: t({ id: "settings.provider_category_local", message: "Local" }),
    speech: t({ id: "settings.provider_category_speech", message: "Speech" }),
    media: t({
      id: "settings.provider_category_media",
      message: "Image & video",
    }),
    custom: t({ id: "settings.provider_category_custom", message: "Custom" }),
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<
    ProviderDefinition["category"] | "all"
  >("recommended");
  const items = useMemo(
    () => providerDirectoryItems(query, category),
    [query, category],
  );
  const categoryLabel = (value: ProviderDefinition["category"] | "all") =>
    value === "all"
      ? t({ id: "settings.provider_category_all", message: "All" })
      : labels[value];
  return (
    <div data-provider-directory className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="relative min-w-0 shrink-0">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value) setCategory("all");
          }}
          placeholder={t({
            id: "settings.search_providers_placeholder",
            message: "Search providers",
          })}
          className="min-w-0 pl-8"
          aria-label={t({
            id: "settings.search_providers_aria",
            message: "Search providers",
          })}
        />
      </div>
      <select
        aria-label={t({ id: "settings.provider_categories_aria", message: "Provider categories" })}
        value={category}
        onChange={(event) => setCategory(event.target.value as typeof category)}
        className="h-9 w-full min-w-0 shrink-0 rounded-md border border-input bg-background px-2 text-sm sm:hidden"
      >
        {(["all", ...categories] as const).map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
      </select>
      <div
        role="tablist"
        className="hidden min-w-0 max-w-full shrink-0 gap-1 overflow-x-auto overscroll-x-contain pb-1 sm:flex"
        aria-label={t({
          id: "settings.provider_categories_aria",
          message: "Provider categories",
        })}
      >
        {(["all", ...categories] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={category === value}
            type="button"
            onClick={() => setCategory(value)}
            className={`shrink-0 rounded-md px-2 py-1 text-xs ${category === value ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {categoryLabel(value)}
          </button>
        ))}
      </div>
      <div data-provider-directory-body className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(
          ({ definition, adapterAvailable, authorizationRequired }) => (
            <button
              key={definition.id}
              type="button"
              disabled={!adapterAvailable}
              onClick={() => onSelect(definition)}
              title={
                adapterAvailable
                  ? t({
                      id: "settings.connect_named_provider",
                      message: `Connect ${definition.label}`,
                    })
                  : t({
                      id: "settings.provider_catalog_only_hint",
                      message:
                        "Provider is listed in the catalog, but no runtime adapter is installed.",
                    })
              }
              className="flex min-h-24 min-w-0 items-start gap-2 rounded-lg border border-border p-2.5 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
                <ProviderIcon definition={definition} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium leading-tight">
                  {definition.label}
                </span>
                <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  {adapterAvailable ? (
                    <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
                  ) : (
                    <CircleAlert className="size-3 shrink-0 text-amber-500" />
                  )}
                  {adapterAvailable
                    ? t({
                        id: "settings.adapter_available",
                        message: "Adapter available",
                      })
                    : t({
                        id: "settings.catalog_only",
                        message: "Catalog only",
                      })}
                </span>
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 break-all text-[10px] text-muted-foreground">
                  <KeyRound className="size-3 shrink-0" />
                  {authorizationRequired
                    ? definition.authMethods.join(" / ")
                    : t({
                        id: "settings.no_authorization",
                        message: "No authorization",
                      })}
                </span>
              </span>
            </button>
          ),
        )}
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          <Trans id="settings.no_providers_match_search">
            No providers match this search.
          </Trans>
        </p>
      ) : null}
      <p className="mt-3 max-w-prose break-words pb-1 text-[11px] text-muted-foreground">
        <Trans id="settings.catalog_availability_disclaimer">
          Catalog availability does not imply an installed adapter, valid
          authorization, or support for every model capability.
        </Trans>
      </p>
      </div>
    </div>
  );
}
