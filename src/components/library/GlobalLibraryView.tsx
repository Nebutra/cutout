import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import {
  BadgeCheck,
  Boxes,
  Component,
  Grid2X2,
  Heart,
  Image,
  LayoutList,
  Loader2,
  PackageOpen,
  Palette,
  Search,
  Tags,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  computeLibraryContentHash,
  createIndexedDbGlobalLibraryBackend,
  GlobalLibraryStore,
  IndexedDbLibraryBlobStore,
  validateMediaBlob,
  type BrandCandidate,
  type GlobalLibraryCatalog,
  type GlobalLibraryItem,
  type LibraryItemKind,
  type ProjectLibraryReference,
} from "@/global-library";
import { filterLibraryItems } from "./global-library-filter";
import {
  duplicateContentGroups,
  filterVisualAssets,
  lineageResults,
  visualAssetCategory,
  type VisualAssetFilter,
} from "./visual-asset-library";
import { KitLibraryInspector } from "./KitLibraryInspector";
import { TeamGovernancePanel } from "./TeamGovernancePanel";
import { MotionTimelineEditor } from "@/components/motion/MotionTimelineEditor";
import type { MotionTrack } from "@/motion/timeline";
import type { RegistryInstallInput } from '@/registry'
const RegistryInstallPanel=lazy(()=>import('./RegistryInstallPanel').then(module=>({default:module.RegistryInstallPanel})))

const store =
  typeof indexedDB === "undefined"
    ? null
    : new GlobalLibraryStore(createIndexedDbGlobalLibraryBackend(indexedDB));
const blobStore =
  typeof indexedDB === "undefined"
    ? null
    : new IndexedDbLibraryBlobStore(indexedDB);
const VIEW_ICONS: readonly { kind: LibraryItemKind; icon: typeof Palette }[] = [
  { kind: "brand-kit", icon: Palette },
  { kind: "design-system-kit", icon: Boxes },
  { kind: "component-library-item", icon: Component },
  { kind: "visual-asset", icon: Image },
];
const MEDIA_FILTER_VALUES: readonly VisualAssetFilter[] = [
  "all",
  "image",
  "video",
  "slice",
  "reference",
];

export function GlobalLibraryView({
  projectId,
}: {
  readonly projectId: string | null;
}) {
  const { t } = useLingui();
  const VIEW_LABELS: Record<LibraryItemKind, string> = {
    "brand-kit": t({ id: "global_library.tab_brand_kits", message: "Brand Kits" }),
    "design-system-kit": t({ id: "global_library.tab_design_systems", message: "Design Systems" }),
    "component-library-item": t({ id: "global_library.tab_components", message: "Components" }),
    "visual-asset": t({ id: "global_library.tab_visual_assets", message: "Visual Assets" }),
  };
  const VIEWS = VIEW_ICONS.map((view) => ({ ...view, label: VIEW_LABELS[view.kind] }));
  const MEDIA_FILTER_LABELS: Record<VisualAssetFilter, string> = {
    all: t({ id: "global_library.media_filter_all", message: "All" }),
    image: t({ id: "global_library.media_filter_images", message: "Images" }),
    video: t({ id: "global_library.media_filter_videos", message: "Videos" }),
    slice: t({ id: "global_library.media_filter_slices", message: "Slices" }),
    reference: t({ id: "global_library.media_filter_references", message: "References" }),
  };
  const MEDIA_FILTERS = MEDIA_FILTER_VALUES.map((value) => ({ value, label: MEDIA_FILTER_LABELS[value] }));
  const [catalog, setCatalog] = useState<GlobalLibraryCatalog | null>(null),
    [kind, setKind] = useState<LibraryItemKind>("brand-kit"),
    [query, setQuery] = useState(""),
    [collection, setCollection] = useState("all"),
    [quality, setQuality] = useState<"all" | "passed" | "attention">("all"),
    [dense, setDense] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [mediaFilter, setMediaFilter] = useState<VisualAssetFilter>("all"),
    [selected, setSelected] = useState<ReadonlySet<string>>(new Set()),
    [preview, setPreview] = useState<GlobalLibraryItem | null>(null),
    [batchTag, setBatchTag] = useState("");
  useEffect(() => {
    void store?.catalog().then(setCatalog);
  }, []);
  const baseItems = useMemo(
    () =>
      filterLibraryItems(catalog?.items ?? [], {
        kind,
        query,
        collection,
        quality,
      }),
    [catalog, collection, kind, quality, query],
  );
  const items = useMemo(
    () =>
      kind === "visual-asset"
        ? filterVisualAssets(baseItems, mediaFilter)
        : baseItems,
    [baseItems, kind, mediaFilter],
  );
  const duplicates = useMemo(
    () => duplicateContentGroups(catalog?.items ?? []),
    [catalog],
  );
  const attach = async (
    item: GlobalLibraryItem,
    updatePolicy: ProjectLibraryReference["updatePolicy"],
  ) => {
    if (!store || !projectId) return;
    setPending(item.id);
    try {
      setCatalog(
        await store.attachProject({
          projectId,
          itemId: item.id,
          version: item.version,
          updatePolicy,
        }),
      );
      toast.success(t({ id: "global_library.toast_added_to_project", message: `${item.name} added to project` }));
    } catch (error) {
      toast.error(t({ id: "global_library.toast_add_failed", message: "Could not add library item" }), {
        description: message(error),
      });
    } finally {
      setPending(null);
    }
  };
  const batch = async (patch: {
    favorite?: boolean;
    tags?: readonly string[];
    collectionId?: string;
  }) => {
    if (!store || !selected.size) return;
    try {
      const keys = items
        .filter((item) => selected.has(key(item)))
        .map(({ id, version }) => ({ id, version }));
      setCatalog(await store.setMetadataBatch(keys, patch));
      setSelected(new Set());
      setBatchTag("");
      toast.success(t({
        id: "global_library.toast_assets_updated",
        message: plural(keys.length, { one: "# asset updated", other: "# assets updated" }),
      }));
    } catch (error) {
      toast.error(t({ id: "global_library.toast_update_failed", message: "Could not update assets" }), { description: message(error) });
    }
  };
  const publishBrandDecision = async (
    item: GlobalLibraryItem,
    candidates: readonly BrandCandidate[],
  ) => {
    if (!store || !blobStore)
      throw new Error(t({ id: "global_library.error_storage_unavailable", message: "Local Library storage is unavailable." }));
    const bytes = new TextEncoder().encode(
      JSON.stringify(
        { protocol: "cutout.brand-book-decisions.v1", candidates },
        null,
        2,
      ),
    );
    const stored = await blobStore.put(bytes, "application/json");
    const artifact = {
      path: "brand-book/confirmed-candidates.json",
      sha256: stored.sha256,
      mediaType: stored.mediaType,
      size: stored.size,
    };
    const content = {
      ...item.content,
      artifacts: [
        ...item.content.artifacts.filter(({ path }) => path !== artifact.path),
        artifact,
      ],
    };
    const contentSha256 = await computeLibraryContentHash(content),
      now = new Date().toISOString();
    const next: GlobalLibraryItem = {
      ...item,
      version: nextVersion(item.version),
      content,
      contentSha256,
      origin: {
        kind: "updated",
        itemId: item.id,
        version: item.version,
        contentSha256: item.contentSha256,
      },
      lineage: {
        root: item.lineage.root,
        parent: {
          itemId: item.id,
          version: item.version,
          contentSha256: item.contentSha256,
        },
        depth: item.lineage.depth + 1,
      },
      updatedAt: now,
    };
    const updated = await store.updateItem(item.id, item.version, next, {
      status: "succeeded",
      approvalId: `brand-book-confirmation.${stored.sha256.slice(0, 16)}`,
      contentSha256,
    });
    setCatalog(updated);
    setPreview(next);
    toast.success(t({ id: "global_library.toast_published", message: `Published ${item.name} v${next.version}` }));
  };
  return (
    <section aria-label={t({ id: "global_library.section_aria", message: "Global library" })} className="flex min-h-full flex-col">
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">
            <Trans id="global_library.title">Library</Trans>
          </h1>
          <TeamGovernancePanel projectId={projectId} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t({ id: "global_library.search_aria", message: "Search library" })}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t({ id: "global_library.search_placeholder", message: "Search names, tags, or provenance" })}
              className="pl-8"
            />
          </div>
          <select
            aria-label={t({ id: "global_library.collection_filter_aria", message: "Filter by collection" })}
            value={collection}
            onChange={(event) => setCollection(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">{t({ id: "global_library.all_collections", message: "All collections" })}</option>
            {catalog?.collections
              .filter((entry) => !entry.archivedAt)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </select>
          <select
            aria-label={t({ id: "global_library.quality_filter_aria", message: "Filter by quality" })}
            value={quality}
            onChange={(event) =>
              setQuality(event.target.value as typeof quality)
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">{t({ id: "global_library.all_quality", message: "All quality" })}</option>
            <option value="passed">{t({ id: "global_library.quality_verified", message: "Verified" })}</option>
            <option value="attention">{t({ id: "global_library.quality_needs_attention", message: "Needs attention" })}</option>
          </select>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={dense
              ? t({ id: "global_library.use_masonry_preview", message: "Use masonry preview" })
              : t({ id: "global_library.use_dense_preview", message: "Use dense preview" })}
            aria-pressed={dense}
            onClick={() => setDense((value) => !value)}
          >
            {dense ? <Grid2X2 /> : <LayoutList />}
          </Button>
        </div>
        <div
          role="tablist"
          aria-label={t({ id: "global_library.type_tablist_aria", message: "Library type" })}
          className="mt-3 flex gap-1 overflow-x-auto"
        >
          {VIEWS.map(({ kind: value, label, icon: Icon }) => (
            <Button
              key={value}
              role="tab"
              aria-selected={kind === value}
              variant={kind === value ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0"
              onClick={() => {
                setKind(value);
                setSelected(new Set());
              }}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
        {kind === "visual-asset" ? (
          <div
            className="mt-2 flex gap-1 overflow-x-auto"
            aria-label={t({ id: "global_library.visual_asset_filters_aria", message: "Visual asset filters" })}
          >
            {MEDIA_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="xs"
                variant={mediaFilter === filter.value ? "secondary" : "ghost"}
                aria-pressed={mediaFilter === filter.value}
                onClick={() => setMediaFilter(filter.value)}
              >
                {filter.value === "video" ? <Video /> : null}
                {filter.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {selected.size ? (
        <div
          role="toolbar"
          aria-label={t({ id: "global_library.bulk_toolbar_aria", message: "Bulk asset actions" })}
          className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2 sm:px-6"
        >
          <strong className="text-xs">
            {t({ id: "global_library.selected_count", message: plural(selected.size, { one: "# selected", other: "# selected" }) })}
          </strong>
          <Input
            aria-label={t({ id: "global_library.tags_to_add_aria", message: "Tags to add" })}
            value={batchTag}
            onChange={(event) => setBatchTag(event.target.value)}
            placeholder={t({ id: "global_library.add_tag_placeholder", message: "Add tag" })}
            className="h-8 w-32"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!batchTag.trim()}
            onClick={() => void batch({ tags: [safeTag(batchTag)] })}
          >
            <Tags />
            <Trans id="global_library.tag_action">Tag</Trans>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void batch({ favorite: true })}
          >
            <Heart />
            <Trans id="global_library.favorite_action">Favorite</Trans>
          </Button>
          <select
            aria-label={t({ id: "global_library.move_to_collection_aria", message: "Move selected to collection" })}
            defaultValue=""
            onChange={(event) => {
              if (event.target.value)
                void batch({ collectionId: event.target.value });
              event.currentTarget.value = "";
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="" disabled>
              {t({ id: "global_library.move_to_collection_placeholder", message: "Move to collection…" })}
            </option>
            {catalog?.collections
              .filter((entry) => !entry.archivedAt)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            <Trans id="global_library.clear_selection">Clear</Trans>
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
        {!catalog ? (
          <div className="grid min-h-48 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyLibrary
            label={VIEWS.find((view) => view.kind === kind)?.label ?? t({ id: "global_library.empty_fallback_label", message: "items" })}
          />
        ) : (
          <div
            className={cn(
              dense
                ? "divide-y divide-border border-y border-border"
                : kind === "visual-asset"
                  ? "columns-2 gap-3 md:columns-3 xl:columns-4 2xl:columns-5"
                  : "grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3",
            )}
          >
            {items.map((item) => (
              <LibraryItemRow
                key={key(item)}
                item={item}
                dense={dense}
                selected={selected.has(key(item))}
                duplicateCount={duplicates.get(item.contentSha256)?.length ?? 0}
                relatedCount={lineageResults(item, catalog.items).length}
                projectId={projectId}
                reference={catalog.projectReferences.find(
                  (entry) =>
                    entry.projectId === projectId && entry.itemId === item.id,
                )}
                pending={pending}
                onAttach={attach}
                onToggle={() =>
                  setSelected((current) => toggle(current, key(item)))
                }
                onPreview={() => setPreview(item)}
              />
            ))}
          </div>
        )}
      </div>
      {preview &&
      (preview.kind === "brand-kit" || preview.kind === "design-system-kit") ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="h-[min(90vh,56rem)] max-w-5xl overflow-hidden p-0"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{t({ id: "global_library.kit_editor_title", message: `${preview.name} kit editor` })}</DialogTitle>
              <DialogDescription>
                <Trans id="global_library.kit_editor_description">
                  Manage the approved, content-addressed kit projection.
                </Trans>
              </DialogDescription>
            </DialogHeader>
            <KitLibraryInspector
              item={preview}
              versions={(catalog?.items ?? []).filter(
                (candidate) => candidate.id === preview.id,
              )}
              references={catalog?.projectReferences ?? []}
              onPublishBrandDecision={publishBrandDecision}
              onClose={() => setPreview(null)}
            />
          </DialogContent>
        </Dialog>
      ) : (
        <AssetPreview
          item={preview}
          items={catalog?.items ?? []}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}

function LibraryItemRow({
  item,
  dense,
  selected,
  duplicateCount,
  relatedCount,
  projectId,
  reference,
  pending,
  onAttach,
  onToggle,
  onPreview,
}: {
  readonly item: GlobalLibraryItem;
  readonly dense: boolean;
  readonly selected: boolean;
  readonly duplicateCount: number;
  readonly relatedCount: number;
  readonly projectId: string | null;
  readonly reference?: ProjectLibraryReference;
  readonly pending: string | null;
  readonly onAttach: (
    item: GlobalLibraryItem,
    policy: ProjectLibraryReference["updatePolicy"],
  ) => void;
  readonly onToggle: () => void;
  readonly onPreview: () => void;
}) {
  const { t } = useLingui();
  const passed = item.qualityReceipts.filter(
      ({ status }) => status === "passed",
    ).length,
    failed = item.qualityReceipts.filter(
      ({ status }) => status === "failed",
    ).length;
  return (
    <article
      className={cn(
        "min-w-0 bg-background",
        dense
          ? "flex items-center gap-3 py-2"
          : "mb-3 break-inside-avoid border border-border p-3",
        selected && "ring-2 ring-ring",
      )}
    >
      <button
        type="button"
        aria-label={t({ id: "global_library.select_item_aria", message: `Select ${item.name}` })}
        aria-pressed={selected}
        onClick={onToggle}
        className={cn(
          "grid shrink-0 place-items-center border border-border bg-muted/30",
          dense ? "size-9 rounded" : "aspect-[4/3] w-full rounded-md",
        )}
      >
        <PackageOpen className="size-5 text-muted-foreground" />
      </button>
      <div className={cn("min-w-0 flex-1", !dense && "mt-2")}>
        <button
          type="button"
          onClick={onPreview}
          className="flex max-w-full items-center gap-2 text-left"
        >
          <h3 className="truncate text-sm font-medium">{item.name}</h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            v{item.version}
          </span>
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{visualAssetCategory(item)}</span>
          <span className={cn(failed && "text-destructive")}>
            <BadgeCheck className="mr-1 inline size-3" />
            {t({ id: "global_library.passed_count", message: plural(passed, { one: "# passed", other: "# passed" }) })}
          </span>
          {duplicateCount > 1 ? (
            <Badge variant="outline">
              {t({ id: "global_library.exact_duplicates_count", message: plural(duplicateCount, { one: "# exact duplicate", other: "# exact duplicates" }) })}
            </Badge>
          ) : null}
          {relatedCount ? (
            <Badge variant="secondary">
              {t({ id: "global_library.lineage_results_count", message: plural(relatedCount, { one: "# lineage result", other: "# lineage results" }) })}
            </Badge>
          ) : null}
          {reference ? (
            <Badge variant="secondary">
              {reference.updatePolicy === "locked"
                ? t({ id: "global_library.reference_locked", message: "Locked" })
                : t({ id: "global_library.reference_following", message: "Following" })}
            </Badge>
          ) : null}
        </div>
      </div>
      {projectId && !reference ? (
        <select
          aria-label={t({ id: "global_library.use_in_project_aria", message: `Use ${item.name} in project` })}
          defaultValue=""
          disabled={pending === item.id}
          onChange={(event) => {
            const policy = event.target
              .value as ProjectLibraryReference["updatePolicy"];
            if (policy) void onAttach(item, policy);
            event.currentTarget.value = "";
          }}
          className="h-8 max-w-36 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="" disabled>
            {t({ id: "global_library.use_in_project_placeholder", message: "Use in project…" })}
          </option>
          <option value="locked">{t({ id: "global_library.policy_lock_version", message: "Lock version" })}</option>
          <option value="notify">{t({ id: "global_library.policy_follow_updates", message: "Follow updates" })}</option>
          <option value="auto-compatible">{t({ id: "global_library.policy_auto_compatible", message: "Auto compatible" })}</option>
        </select>
      ) : null}
    </article>
  );
}

function AssetPreview({
  item,
  items,
  onClose,
}: {
  readonly item: GlobalLibraryItem | null;
  readonly items: readonly GlobalLibraryItem[];
  readonly onClose: () => void;
}) {
  const related = item ? lineageResults(item, items) : [];
  const motion = item ? isMotionAsset(item) : false;
  const [track, setTrack] = useState<MotionTrack>(() =>
    defaultMotionTrack(item?.id ?? "asset"),
  );
  const [registryInput,setRegistryInput]=useState<RegistryInstallInput|null>(null),[registryError,setRegistryError]=useState<string|null>(null)
  useEffect(()=>{setRegistryInput(null);setRegistryError(null);if(!item||item.kind!=='component-library-item'||!blobStore)return;let current=true;void import('@/registry/projections').then(({globalLibraryComponentToRegistry})=>globalLibraryComponentToRegistry(item,(sha)=>blobStore.get(sha))).then((value)=>{if(current)setRegistryInput(value)}).catch((error)=>{if(current)setRegistryError(message(error))});return()=>{current=false}},[item])
  const { t } = useLingui();
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", motion && "max-w-3xl")}>
        <DialogHeader>
          <DialogTitle>{item?.name}</DialogTitle>
          <DialogDescription>
            <Trans id="global_library.asset_preview_description">
              Verified local preview, provenance, and capability-aware asset
              actions.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {item ? (
          <div className="space-y-3 text-xs">
            <AssetBlobPreview item={item} />
            <CapabilityActions item={item} />
            {registryInput?<Suspense fallback={<p className="text-xs text-muted-foreground">{t({ id: "global_library.loading_registry_installer", message: "Loading Registry installer…" })}</p>}><RegistryInstallPanel item={registryInput.item} files={registryInput.files}/></Suspense>:item.kind==='component-library-item'?<p role="status" className="text-xs text-destructive">{registryError??t({ id: "global_library.verifying_component_blobs", message: "Verifying component source blobs…" })}</p>:null}
            {motion ? (
              <MotionTimelineEditor track={track} onChange={setTrack} />
            ) : null}
            <dl className="grid grid-cols-2 gap-2">
              <Meta label={t({ id: "global_library.meta_type", message: "Type" })} value={visualAssetCategory(item)} />
              <Meta label={t({ id: "global_library.meta_version", message: "Version" })} value={item.version} />
              <Meta label={t({ id: "global_library.meta_license", message: "License" })} value={item.license.kind} />
              <Meta label={t({ id: "global_library.meta_content_hash", message: "Content hash" })} value={item.contentSha256} />
            </dl>
            <details>
              <summary className="cursor-pointer font-medium">
                <Trans id="global_library.provenance_and_files">Provenance and files</Trans>
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border border-border p-2 text-[10px]">
                {JSON.stringify(
                  {
                    origin: item.origin,
                    lineage: item.lineage,
                    artifacts: item.content.artifacts,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            {related.length ? (
              <section>
                <p className="font-medium">
                  <Trans id="global_library.lineage_results_heading">More-like-this lineage results</Trans>
                </p>
                <ul className="mt-1 divide-y divide-border">
                  {related.map((child) => (
                    <li key={key(child)} className="py-1">
                      {child.name} · v{child.version}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
function CapabilityActions({ item }: { readonly item: GlobalLibraryItem }) {
  const { t } = useLingui();
  const video = item.content.artifacts.some(({ mediaType }) =>
    mediaType.startsWith("video/"),
  );
  return (
    <section
      aria-label={t({ id: "global_library.capabilities_aria", message: "Asset capabilities" })}
      className="flex flex-wrap items-center gap-2 border-y border-border py-2"
    >
      <Button
        size="sm"
        variant="outline"
        disabled
        title={t({ id: "global_library.discover_references_title", message: "Configure an authorized reference-discovery provider host to enable this action." })}
      >
        <Trans id="global_library.discover_references">Discover references</Trans>
      </Button>
      {video ? (
        <Button
          size="sm"
          variant="outline"
          disabled
          title={t({ id: "global_library.analyze_video_title", message: "Configure an authorized video executor host to enable frame and shot analysis." })}
        >
          <Trans id="global_library.analyze_video">Analyze video</Trans>
        </Button>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {video
          ? t({ id: "global_library.hosts_not_configured_video", message: "Video executor and reference provider hosts are not configured." })
          : t({ id: "global_library.hosts_not_configured", message: "Reference provider host is not configured." })}
      </span>
    </section>
  );
}
function isMotionAsset(item: GlobalLibraryItem) {
  return (
    item.tags.includes("motion") ||
    item.content.artifacts.some(
      ({ path, mediaType }) =>
        /(?:motion|timeline|lottie)/i.test(path) ||
        mediaType === "application/lottie+json",
    )
  );
}
function defaultMotionTrack(targetId: string): MotionTrack {
  return {
    id: `motion.${targetId}`,
    targetId,
    trigger: "load",
    reducedMotion: "simplify",
    keyframes: [
      {
        id: "keyframe.start",
        atMs: 0,
        property: "opacity",
        value: "0",
        easing: "ease-out",
      },
      {
        id: "keyframe.end",
        atMs: 240,
        property: "opacity",
        value: "1",
        easing: "ease-out",
      },
    ],
  };
}
function AssetBlobPreview({ item }: { readonly item: GlobalLibraryItem }) {
  const artifact = item.content.artifacts.find(
    (entry) =>
      entry.mediaType.startsWith("image/") ||
      entry.mediaType.startsWith("video/"),
  );
  const [resolved, setResolved] = useState<{
    readonly url: string;
    readonly mediaType: string;
    readonly path: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!artifact || !blobStore) {
      setResolved(null);
      return;
    }
    void blobStore
      .get(artifact.sha256)
      .then(async (record) => {
        if (!record) return;
        await validateMediaBlob(record);
        if (!active) return;
        objectUrl = URL.createObjectURL(
          new Blob([record.bytes as BlobPart], { type: record.mediaType }),
        );
        setResolved({
          url: objectUrl,
          mediaType: record.mediaType,
          path: artifact.path,
        });
      })
      .catch(() => {
        if (active) setResolved(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact]);

  const download = () => {
    if (!resolved) return;
    const anchor = document.createElement("a");
    anchor.href = resolved.url;
    anchor.download = resolved.path.split("/").pop() || item.name;
    anchor.click();
  };

  return (
    <section className="space-y-2">
      <div className="flex min-h-40 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
        {resolved?.mediaType.startsWith("image/") ? (
          <img
            src={resolved.url}
            alt={item.name}
            className="max-h-72 w-full object-contain"
          />
        ) : null}
        {resolved?.mediaType.startsWith("video/") ? (
          <video src={resolved.url} controls className="max-h-72 w-full" />
        ) : null}
        {!resolved ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <PackageOpen className="size-8" />
            <span>
              <Trans id="global_library.bytes_not_available">Verified bytes are not available locally.</Trans>
            </span>
          </div>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!resolved}
        onClick={download}
      >
        <Trans id="global_library.export_verified_asset">Export verified asset</Trans>
      </Button>
    </section>
  );
}
function Meta({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
function EmptyLibrary({ label }: { readonly label: string }) {
  return (
    <div className="grid min-h-64 place-items-center border-y border-border">
      <div className="max-w-sm text-center">
        <PackageOpen className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">
          <Trans id="global_library.empty_title">No {label} yet</Trans>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans id="global_library.empty_description">
            Approved project results and imported packages appear here with
            immutable version and provenance.
          </Trans>
        </p>
      </div>
    </div>
  );
}
function toggle(values: ReadonlySet<string>, value: string) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
function key(item: GlobalLibraryItem) {
  return `${item.id}@${item.version}`;
}
function safeTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function nextVersion(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match
    ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
    : `${version}.1`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
