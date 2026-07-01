# Asset Cutout Studio — SOTA Refactor Architecture Spec (Tauri 2 + React 19)

**Status:** v1 buildable spec · **Target:** macOS-first (arm64 + x64 DMG), cross-platform-ready · **Source:** port of Electron `asset-cutout-studio`

### Locked tooling versions (user-mandated)

| Tool | Version | Note |
|---|---|---|
| **Vite** | **7.x (latest major)** | Explicit user requirement — do NOT accept scaffold default if older. Node 22.22 present (satisfies Vite 7's 20.19+/22.12+). |
| React | 19.x | |
| TypeScript | 5.x latest | |
| Tailwind CSS | v4 (latest) | CSS-first `@theme`; verify shadcn compatibility (§9.8) |
| shadcn/ui CLI | `shadcn@latest` | copy-in components |
| Tauri | 2.x + CLI v2 | |
| @tanstack/react-query | v5 | |
| Zustand | v5 | |
| `@vitejs/plugin-react` | latest | |

---

## 1. Overview & Goals

Asset Cutout Studio is a single-purpose desktop tool: drop a sprite/asset sheet with a white background, auto-segment it into individual transparent PNG slices via a 6-stage pixel pipeline, then rename and export those slices. The current Electron build runs the entire pipeline (`floodBackground → alpha cut → featherEdges → findComponents → mergeBoxes → padBox/cropCanvas`) **synchronously on the UI thread**, freezing the window on large sheets, and exposes exactly one IPC seam (`save-assets`) that base64-decodes PNGs and writes them to a chosen folder. The value is entirely in the pipeline; the shell is thin.

The refactor keeps that value intact and re-homes it for performance and productization. The pixel pipeline moves **verbatim** (same thresholds, same output) into a **Web Worker + OffscreenCanvas**, unblocking the UI and enabling live parameter preview. The shell moves from Electron to **Tauri 2 + Rust**, shrinking the native surface to one typed `save_assets` command with least-privilege filesystem scope. The UI becomes a **React 19** split-view (left source + params / center transparent preview / right slice grid + inspector) built on **shadcn/ui** over Radix. Crucially, every I/O-shaped operation (export now; accounts, cloud library, cloud cutout, sharing later) is funneled through a **services/api interface layer** wrapped by **TanStack Query**, so the future backend is a file-swap, not a refactor — **we build the seams, not the server.**

The stack is chosen to fit *this* app: a compute-heavy, offline-first image tool that will grow server features. Rust/Tauri gives a tiny, secure, fast-launching native shell without the pipeline rewrite (JS pixel code ports as-is to the worker). React 19 + shadcn gives a dense, keyboard-first, themeable UI we own the source of. Zustand owns synchronous ephemeral state (params at 60fps, selection); TanStack Query owns the I/O boundary even when today it points at local stubs.

### Technology roles

| Technology | Role in this app |
|---|---|
| **Tauri 2 (Rust)** | Native shell: window, one `save_assets` command, runtime fs-scope, DMG bundling. Replaces Electron main/preload. |
| **React 19** | UI runtime for the 3-pane split-view. |
| **Vite 7** | Dev server + build; worker bundling via `new Worker(new URL(...))`. |
| **TypeScript** | End-to-end types across UI, worker protocol, service interfaces. |
| **TailwindCSS v4** | Utility styling + theme tokens (checkerboard, dark mode). |
| **shadcn/ui (Radix)** | Copy-in component source (Slider, Card, Resizable, Tabs, Sonner, etc.); owns a11y. |
| **Zustand** | Synchronous client state: source ref, 4 params, slices, selection, worker status. |
| **TanStack Query v5** | I/O boundary: export mutations now; asset-library/session/cloud queries later. |
| **Web Worker + OffscreenCanvas** | Off-thread 6-stage pixel pipeline; live preview; PNG blob encoding. |
| **services/api layer** | Interface seam (`CutoutService`, `AssetRepository`, `SessionService`); local impls in v1, remote impls later. |

### Explicitly rejected

| Rejected | Why |
|---|---|
| **react-aria** | shadcn/Radix already covers a11y (focus, roving tabindex, ARIA); a second a11y layer is redundant and fights the aesthetic. |
| **cmdk / command palette (v1)** | Deferred. Keyboard shortcuts + TopBar tooltips cover discoverability for v1's small action set. |
| **Rust pixel rewrite (v1)** | The JS pipeline is battle-tested; porting to a worker preserves output and ships faster. Rust is a later perf option behind the same `CutoutService` seam. |
| **Undo/redo, multi-sheet, manual box editing** | Pipeline is deterministic from 4 params ("undo" = move slider back); multi-sheet/library is the future server's job. Out of "port + productize" scope. |
| **Building the backend** | Locked: seams only. No server code in v1. |

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              TAURI 2 NATIVE SHELL (Rust)                                │
│  src-tauri/                                                                             │
│   • window (declarative, tauri.conf.json)   • capabilities/ (least-privilege ACL)      │
│   • #[command] save_assets(assets) -> {canceled,outputDir,count,failed[]}              │
│       ↳ folder picker (plugin-dialog) → fs_scope().allow_directory(chosen) → write PNG  │
│  Payload: raw PNG bytes (Uint8Array→Vec<u8>), base64 dataURL fallback                   │
└───────────────────────────────▲────────────────────────────────────────────────────────┘
                                 │ invoke('save_assets')  [ONLY Tauri import: platform/native.ts]
                                 │
┌────────────────────────────────┴───────────────────────────────────────────────────────┐
│                                REACT 19 UI (main thread)                                  │
│                                                                                          │
│   components/ (shadcn split-view)          store/ (Zustand)          hooks/queries/       │
│   ┌─────────┬──────────────┬──────────┐    • source(ImageBitmap)     • useExportAll  ─┐   │
│   │ Source  │  Preview     │ RightRail│    • params (4)              • useExportOne  ─┤   │
│   │ +Params │  (center)    │ Grid+Insp│    • analysis(runId,slices)  • useAssets(stub)│   │
│   └────┬────┴──────▲───────┴────┬─────┘    • selection               • useSession(stub)│   │
│        │           │            │                  ▲                         │          │   │
│        │           │            │                  │                         ▼          │   │
│        │      useAnalysisBridge │          ┌───────┴────────────────────────────────┐  │   │
│        │      (store ⇄ worker)  │          │      services/  (SWAP SEAM)             │  │   │
│        └───────────┼────────────┘          │  ServiceRegistry:                       │  │   │
│                    │ postMessage           │   CutoutService  → local/worker  ▸ HTTP │  │   │
│                    │ (runId, bitmap,       │   AssetRepository→ local/Tauri fs ▸ HTTP │  │   │
│                    ▼  params)              │   SessionService → local/stub    ▸ HTTP │  │   │
│   ┌────────────────────────────────┐       └─────────────────────────────────────────┘  │   │
└───┤                                ├──────────────────────────────────────────────────────┘
    │      WEB WORKER (OffscreenCanvas)                                                       │
    │  algorithm/  (pure, testable TS modules)                                                │
    │   floodBackground → applyAlphaCut → featherEdges → findComponents → mergeBoxes → padBox │
    │  render.worker-side: transferToImageBitmap (preview) · convertToBlob (per-slice PNG)    │
    │  ← postMessage {preview: ImageBitmap, slices: [{box, png Blob}]}  (transferables)        │
    └────────────────────────────────────────────────────────────────────────────────────────┘

  Future server: replace services/local/*.ts with services/remote/*.ts + flip createXRegistry().
  Query keys (assetKeys/sessionKeys) + interfaces already defined → components untouched.
```

---

## 3. Target File Tree

```
asset-cutout-studio/
├── package.json                      # deps: react19, vite7, @tanstack/react-query, zustand, tauri plugins
├── vite.config.ts                    # worker bundling, @ alias, tauri dev port 1420
├── tsconfig.json
├── tailwind.config.ts                # (or @theme CSS-first if Tailwind v4 — verify §9)
├── index.html
├── components.json                   # shadcn CLI config
│
├── src-tauri/
│   ├── Cargo.toml                    # tauri 2, plugin-dialog, plugin-fs, serde, thiserror, base64, tokio
│   ├── build.rs                      # tauri_build::build()
│   ├── tauri.conf.json               # window 1280x860/min1040x720, dmg bundle, CSP, plugins
│   ├── capabilities/
│   │   └── default.json              # core:default + dialog open + fs write-file (no static path)
│   ├── icons/                        # 32/128/@2x/icns/ico (tauri icon)
│   └── src/
│       ├── main.rs                   # fn main() { app_lib::run() }
│       ├── lib.rs                    # Builder: plugins + generate_handler![save_assets]
│       └── commands/
│           ├── mod.rs                # pub mod save_assets; pub use ...
│           └── save_assets.rs        # command, AssetInput/Result, SaveError, sanitize_filename, is_within
│
└── src/
    ├── main.tsx                      # root: Providers + ServiceProvider(createLocalRegistry(worker))
    ├── App.tsx                       # AppShell mount
    ├── globals.css                   # tailwind + shadcn tokens (light/.dark), bg-checker utility
    │
    ├── platform/
    │   └── native.ts                 # ONLY file importing @tauri-apps/api. NativeBridge.saveAssets()
    │
    ├── components/
    │   ├── AppShell.tsx              # root layout, providers, global hotkeys, theme class
    │   ├── Providers.tsx            # QueryClientProvider + Theme + Tooltip + Toaster
    │   ├── topbar/
    │   │   ├── TopBar.tsx           # brand + actions + theme/settings
    │   │   ├── TopBarActions.tsx    # Import/Rerun/ExportAll buttons + Tooltips
    │   │   ├── ThemeToggle.tsx
    │   │   └── SettingsMenu.tsx     # DropdownMenu: reset params, about
    │   ├── workspace/
    │   │   └── WorkspaceLayout.tsx  # ResizablePanelGroup (horizontal, autoSaveId)
    │   ├── source/
    │   │   ├── SourcePanel.tsx
    │   │   ├── DropZone.tsx         # drag-drop + hidden file input
    │   │   ├── SourceCanvas.tsx     # draws source bitmap, fit-to-pane
    │   │   ├── SourceMeta.tsx       # W×H · filename · N MB
    │   │   ├── ParameterControls.tsx
    │   │   └── ParameterSlider.tsx  # label+value+Slider (onValueChange live, onValueCommit debounced)
    │   ├── preview/
    │   │   ├── PreviewPanel.tsx
    │   │   ├── PreviewCanvas.tsx    # result bitmap blit + selected-bbox overlay
    │   │   ├── PreviewToolbar.tsx   # zoom fit/1:1, checkerboard toggle
    │   │   ├── PreviewMeta.tsx      # "N regions"
    │   │   └── ProcessingOverlay.tsx
    │   ├── slices/
    │   │   ├── RightRail.tsx
    │   │   ├── RightRailTabs.tsx    # Tabs (narrow) OR nested vertical group (wide)
    │   │   ├── SliceGrid.tsx
    │   │   ├── SliceCard.tsx
    │   │   ├── SliceThumb.tsx
    │   │   ├── SliceCardActions.tsx # hover: Export/Rename/Copy
    │   │   ├── SliceGridEmpty.tsx   # zero-regions guidance + quick-fix buttons
    │   │   └── SliceGridSkeleton.tsx
    │   ├── inspector/
    │   │   ├── InspectorPanel.tsx
    │   │   ├── SliceNameField.tsx   # inline rename (Enter commit / Esc revert)
    │   │   ├── SliceDimensions.tsx
    │   │   └── ExportBar.tsx        # per-slice export + export-all mirror
    │   ├── status/
    │   │   └── StatusBar.tsx        # count · bytes · active param summary
    │   └── ui/                       # shadcn copy-in (button, slider, card, resizable, tabs,
    │                                 #   tooltip, dropdown-menu, input, badge, skeleton,
    │                                 #   sonner, alert-dialog, separator, label)
    │
    ├── algorithm/                    # PURE pipeline modules (no DOM) — unit-test target
    │   ├── types.ts                  # CutoutParams, Box, ComponentBox, PixelFrame, BackgroundMask
    │   ├── constants.ts              # thresholds: 8, 235, 90, 246 (verbatim from renderer.js)
    │   ├── isBackgroundPixel.ts
    │   ├── floodBackground.ts        # BFS, Int32Array ring queue (perf fix §4b)
    │   ├── applyAlphaCut.ts          # in-place alpha=0 (worker-owned buffer)
    │   ├── featherEdges.ts           # 1px anti-halo dilation
    │   ├── findComponents.ts         # connected-components, inline neighbor checks (no per-pixel array)
    │   ├── boxGeometry.ts            # boxesNear / unionBox / padBox
    │   ├── mergeBoxes.ts             # union-find + spatial grid + fixed-point (perf fix §4b)
    │   ├── sortBoxes.ts              # reading-order (y then x), immutable
    │   └── runPipeline.ts            # orchestrates 1–5, checks signal.aborted between stages
    │
    ├── workers/
    │   ├── pipeline.worker.ts        # worker entry: onmessage, loadImage/analyze, render, postMessage
    │   ├── protocol.ts               # WorkerRequest/WorkerResponse/SliceOut/PipelineStage
    │   └── render.worker-side.ts     # OffscreenCanvas: transferToImageBitmap, cropSlicePng(convertToBlob)
    │
    ├── services/
    │   ├── types.ts                  # Result<T>, interfaces + DTOs (the contract)
    │   ├── context.ts               # ServiceRegistry, ServiceProvider, useServices, createLocalRegistry
    │   ├── local/
    │   │   ├── cutout-service.local.ts    # wraps the worker via store bridge
    │   │   ├── asset-repository.local.ts  # Tauri fs export via platform/native
    │   │   └── session.local.ts           # stub: {userId:'local', isAuthenticated:false}
    │   └── remote/
    │       └── .gitkeep              # EMPTY in v1 — future http impls land here
    │
    ├── hooks/
    │   ├── useAnalysisBridge.ts      # store ⇄ worker glue; runId stale-drop; bitmap.close()
    │   ├── useParamAutoRun.ts        # debounced setParam → beginAnalysis (~120ms)
    │   ├── useHotkeys.ts             # ⌘O/⌘R/⌘⇧E/⌘E/[ ]/arrows/Enter/Esc
    │   └── queries/
    │       ├── keys.ts               # queryKeys factory (assetKeys, sessionKeys)
    │       ├── assets.ts             # assetsListOptions, useAssets/useAsset (stub)
    │       ├── cutout.ts             # useExportOne / useExportAll mutations
    │       └── session.ts            # useSession (stub)
    │
    ├── store/
    │   ├── index.ts                  # create() + slice composition + actions
    │   ├── types.ts                  # Store, Params, Slice, SourceState, AnalysisState, WorkerStatus
    │   ├── selectors.ts              # selectParams/selectSlices/selectSelectedSlice/selectExportPayload
    │   └── slices/
    │       ├── source.ts   params.ts   analysis.ts   selection.ts
    │
    └── lib/
        ├── utils.ts                  # cn() (shadcn), clsx/tailwind-merge
        ├── image.ts                  # createImageBitmap helpers, blob↔bytes
        ├── filename.ts               # default name gen, sanitize (mirror Rust for parity)
        └── constants.ts              # PARAM_RANGES (table below), MAX_LIVE_PREVIEW_MP
```

---

## 4. The Three Tiers in Detail

### 4a. Tauri Shell + Rust `save_assets` + typed TS bridge

**Payload decision:** send **raw PNG bytes** (`Uint8Array` → `Vec<u8>`), not base64 dataURLs. The worker's `OffscreenCanvas.convertToBlob()` → `arrayBuffer()` already yields raw PNG; Rust just writes bytes (no decode). Base64 dataURL kept only as a documented fallback.

**Command signature (`src-tauri/src/commands/save_assets.rs`):**
```rust
#[derive(Deserialize)] #[serde(rename_all="camelCase")]
pub struct AssetInput { pub name: String, pub bytes: Option<Vec<u8>>, pub data_url: Option<String> }

#[derive(Serialize)] #[serde(rename_all="camelCase")]
pub struct SaveAssetsResult {
  pub canceled: bool, pub output_dir: Option<String>,
  pub count: usize, pub failed: Vec<FailedWrite>,   // partial-success (Electron was all-or-nothing)
}

#[tauri::command]
pub async fn save_assets<R: Runtime>(app: AppHandle<R>, assets: Vec<AssetInput>)
  -> Result<SaveAssetsResult, SaveError>;
```

**Flow:** validate non-empty → `app.dialog().file().pick_folder(cb)` bridged to async via `oneshot` → resolve `FilePath`→`PathBuf` → `app.fs_scope().allow_directory(&dir, false)` (runtime least-privilege; static ACL has **no** write path) → per-file `sanitize_filename` (`/[^\w.-]+/g → "_"`, **run-collapsing** to match JS `+`) + `is_within` traversal guard → `tokio::fs::write` → collect `failed[]`.

**Key deltas vs Electron:**
| Concern | Electron | Tauri |
|---|---|---|
| Window | imperative `BrowserWindow` | declarative `tauri.conf.json` |
| IPC | `ipcMain.handle` + `contextBridge` global | `#[command]` + typed `NativeBridge` module |
| Payload | base64 dataURL JSON | raw PNG bytes (base64 fallback) |
| FS | unrestricted Node `fs` | command allowed, path scope granted at runtime to chosen dir only |
| Failure | `Promise.all` all-or-nothing | per-file `failed[]` → "24 of 25 saved" |

**The only Tauri import (`src/platform/native.ts`):**
```ts
import { invoke } from '@tauri-apps/api/core'
export interface NativeBridge { saveAssets(a: SaveAssetInput[]): Promise<SaveAssetsResult> }
export const tauriBridge: NativeBridge = {
  saveAssets: (assets) => invoke('save_assets', {
    assets: assets.map(a => ({ name: a.name, bytes: Array.from(a.bytes), dataUrl: a.dataUrl })),
  }),
}
```
No component/store/hook imports `@tauri-apps/*` directly — `AssetRepository` (service) → `NativeBridge` (platform) → Tauri. Tests inject a fake bridge; no Tauri runtime needed.

**`tauri.conf.json` essentials:** window `1280×860` (min `1040×720`), `identifier com.leishi.asset-cutout-studio`, `bundle.targets:["dmg"]`, `macOS.minimumSystemVersion:"11.0"`, `hardenedRuntime:false` (unsigned, matches current story). **CSP must include** `img-src 'self' data: blob:; worker-src 'self' blob:` for the OffscreenCanvas worker.

**DMG per-arch:** no universal DMG from one target — build `--target aarch64-apple-darwin` and `--target x86_64-apple-darwin` separately (`rustup target add` both).

**Capabilities (`capabilities/default.json`):** `["core:default", "dialog:allow-open", "fs:allow-write-file"]` — command allowed, **no static path scope**; runtime `allow_directory` widens to the picked folder only. ⚠️ Exact permission identifier strings drift between plugin versions — verify against `src-tauri/gen/schemas/` (§9).

### 4b. Web Worker Algorithm — modules, protocol, perf fixes

**Module decomposition (`src/algorithm/`, all pure, DOM-free, Vitest-able):**

| Module | Signature |
|---|---|
| `isBackgroundPixel.ts` | `(data, index, threshold) => boolean` — `a<8 \|\| rgb all ≥ threshold` |
| `floodBackground.ts` | `(frame, threshold) => BackgroundMask` — border-seeded BFS |
| `applyAlphaCut.ts` | `(frame, bg) => void` — in-place alpha=0 (worker owns buffer) |
| `featherEdges.ts` | `(frame, bg) => void` — 1px anti-halo, near-white→a≤90 |
| `findComponents.ts` | `(frame, minArea) => ComponentBox[]` |
| `boxGeometry.ts` | `boxesNear / unionBox / padBox` |
| `mergeBoxes.ts` | `(boxes, gap) => ComponentBox[]` |
| `sortBoxes.ts` | `(boxes) => Box[]` — y-then-x, immutable |
| `runPipeline.ts` | `(frame, params, signal?) => { frame, boxes }` — inter-stage abort checks |

Rendering (`render.worker-side.ts`) is **separate** (needs OffscreenCanvas): `renderFullBitmap(frame)→ImageBitmap`, `cropSlicePng(full, box)→Promise<Blob>`.

**Immutability note:** `applyAlphaCut`/`featherEdges` mutate the worker-owned `ArrayBuffer` in place — this is correct high-perf design (nothing else references it), **not** a violation of the app's immutability rule (which targets shared state). Flagged so no reviewer "fixes" it into per-pixel allocation.

**Message protocol (`workers/protocol.ts`):** image uploaded **once**, then each slider change transfers zero image bytes:
```ts
type WorkerRequest =
  | { type:'loadImage'; imageId:string; bitmap:ImageBitmap }        // once (transfer bitmap)
  | { type:'analyze'; runId:number; imageId:string; params:CutoutParams; wantSlices:boolean }
  | { type:'cancel'; runId:number }
type WorkerResponse =
  | { type:'preview'; runId:number; full:ImageBitmap; boxes:Box[] }  // fast path (live drag)
  | { type:'slices';  runId:number; slices:SliceOut[] }             // heavy path (commit)
  | { type:'progress'; runId:number; stage:PipelineStage; pct:number }
  | { type:'error'; runId:number; message:string }
  | { type:'canceled'; runId:number }
interface SliceOut { id:string; index:number; box:Box; png:Blob; width:number; height:number }
```
**Two-phase response:** live drag → `preview` only (`wantSlices:false`, center canvas + box outlines update at interactive rates); drag end/commit → `slices` (N PNG blobs, the expensive tail). **Transferables** everywhere: `postMessage(req,[bitmap])` in, `postMessage(res,[full])` back, Blobs cheap-cloned.

**Perf fix 1 — `mergeBoxes` O(n²–n³) → ~O(n·α(n)):** current code nested-loops with `splice`+`break`+outer-`while(changed)` restart (worst case O(n³)). Replace with **union-find (DSU, path compression + union by rank) over a uniform spatial hash grid** (cell ≈ `max(mergeGap, medianBoxDim)`; test only the box's cell + 8 neighbors). ⚠️ **Transitive-merge equivalence:** original grows A∪B then re-checks C; DSU on original boxes may diverge on chains. Preserve identical output via a **fixed-point pass** re-testing *set rectangles* (few) until stable. Must validate against golden fixtures (§8).

**Perf fix 2 — BFS queue growing `Array` → `Int32Array` head/tail cursor:** current `queue=[]` + `push` reallocates and deopts. Each pixel enqueues ≤ once, so `new Int32Array(w*h)` with monotonic `head`/`tail` needs no ring. Hoist `x=i%w`, `y=(i/w)|0`, replace `Math.floor`→`|0`, precompute row offsets. Same treatment for `findComponents`' queue. Also replace `findComponents`' per-pixel `neighbors` array-literal + `forEach` with four inline `if`s (removes millions of allocations on large sheets). **Time still O(w·h), constant-factor + memory-churn win.**

### 4c. React Component Tree + shadcn + Split-View

**Layout:** `ResizablePanelGroup` (horizontal, `autoSaveId="acs-main"`) — Source (26%, min20) / Preview (44%, min30, grows) / RightRail (30%, min26, max40). Params live **under the source image** (they describe *reading* the source), right rail is **outputs only** (grid + inspector). Below ~1040px, stack vertically. Narrow rail → `Tabs [Slices][Inspector]`; wide → stacked via nested vertical group.

**shadcn component map:**
| Need | Component |
|---|---|
| 4 param sliders | **Slider** (`onValueChange` live label / `onValueCommit` debounced analyze) |
| Import/Rerun/Export | **Button** (default/outline/ghost/icon) |
| Slice cards | **Card** |
| Rename | **Input** (Enter commit / Esc revert) |
| Split panes | **Resizable** |
| Shortcut hints | **Tooltip** |
| Export result/errors | **Sonner** (`toast.success/error`) |
| Narrow rail | **Tabs** |
| Settings | **DropdownMenu** |
| Count/dim chips | **Badge** |
| Loading grid | **Skeleton** |
| Overwrite confirm | **AlertDialog** |

**Param ranges (the contract — `lib/constants.ts`):**
| Param | min | max | step | default |
|---|---|---|---|---|
| `threshold` | 220 | 255 | 1 | **246** |
| `minArea` | 80 | 5000 | 20 | **900** |
| `mergeGap` | 0 | 80 | 1 | **18** |
| `padding` | 0 | 40 | 1 | **10** |

**Productization (each earns its place):** selected-slice **bbox overlay** on preview (closes card↔sheet loop); **remembered output dir** within a session; per-card **hover actions** (export/rename/copy-PNG); **dark mode**; **zero-regions quick-fix** buttons ("−10 threshold" / "−50% min-area" nudge + rerun); count/dims/bytes readouts.

**Keyboard (`useHotkeys`, no cmdk):** ⌘O import · ⌘R rerun · ⌘⇧E export all · ⌘E export selected · `[`/`]` prev/next · arrows grid nav · Enter rename · Esc clear. Discoverable via TopBar tooltips.

---

## 5. State + Services Layer

**Boundary rule:** Zustand owns anything (a) synchronous and (b) never leaving the process. TanStack Query owns anything crossing an I/O boundary — even a fake one — because that's where loading/error/retry/invalidation (and later network semantics) live.

**Zustand store (`store/`, single store, sliced):**
```ts
interface Params { threshold:246; minArea:900; mergeGap:18; padding:10 }  // ranges §4c
interface SourceState { bitmap:ImageBitmap|null; name:string; width:number; height:number }
interface Slice { id:string /*uuid*/; index:number; name:string; box:Box; blob:Blob;
                  objectUrl:string; selected:boolean }
interface AnalysisState { status:'idle'|'running'|'done'|'error'; runId:number; error:string|null;
                          previewBitmap:ImageBitmap|null; slices:Slice[] }
// actions: loadImage(file) · setParam(k,v) · beginAnalysis()->runId ·
//          applyAnalysisResult(runId,r) [drops if stale] · failAnalysis · selectSlice · renameSlice · clearSelection
```
`ImageBitmap` is the transfer unit both ways (not `HTMLImageElement`, not `dataUrl` — those bloat snapshots). Selectors are co-located, `useShallow` for arrays. `selectExportPayload` feeds the export mutation with default names `${name}-01.png` (2-pad). **Memory correctness:** `bitmap.close()` on stale/superseded results and on replacement — real GPU-leak guard, not optional.

**Service interfaces (`services/types.ts`):**
```ts
type Result<T> = { ok:true; data:T } | { ok:false; error:string }
interface CutoutService  { run(i:{bitmap,params,signal?}): Promise<Result<CutoutResult>> }      // worker now, HTTP later
interface AssetRepository{ list(f?):Promise<Result<AssetRef[]>>; load(id):Promise<Result<Blob>>;
                           saveOne(i,opts?):Promise<Result<AssetRef>>;
                           saveMany(i[],opts?):Promise<Result<AssetRef[]>> }                     // Tauri fs now, HTTP later
interface SessionService { current():Promise<Session>; signIn?; signOut? }                        // stub now, auth later
interface ServiceRegistry { session:SessionService; cutout:CutoutService; assets:AssetRepository }
```
**Single swap point (`services/context.ts`):** `createLocalRegistry(worker)` wires local impls; future `createRemoteRegistry(httpClient)` swaps in `main.tsx` — hooks call `useServices().assets.saveMany(...)`, components untouched.

**TanStack Query (`hooks/queries/`) — where it earns its place in v1:**
| Concern | Owner | Why |
|---|---|---|
| 4 params, slider drag | Zustand | sync, 60×/sec |
| selection / rename | Zustand | ephemeral, no I/O |
| worker status / preview | Zustand | push-based local compute, not a cache |
| **exportOne / exportAll** | **Query mutation** | async, can fail (disk/cancel), needs `isPending/isError` — replaces manual `导出中...` DOM juggling |
| asset library list/load | Query (stub) | exact shape a remote library needs; nearly free; proves seam |
| session | Query (stub) | auth/staleness is Query's home turf later |

```ts
export const assetKeys = { all:['assets'], list:(q?)=>['assets','list',q??''], one:(id)=>['assets','one',id] }
export function useExportAll() {
  const { assets } = useServices(); const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts?:{destDir?:string}) => run(selectExportPayload(useStore.getState()), assets, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetKeys.all }),
  })
}
```

**Extension seams (nothing built — wires left hanging):**
| Future feature | Seam | Changes | Unchanged |
|---|---|---|---|
| Accounts/auth | `SessionService` + `sessionKeys` | `local/session` → `remote/session` | `useSession()`, all components |
| Cloud asset library | `AssetRepository` + `assetKeys` | `local/asset-repository` → `remote/` | `useAssets`, `useExportAll` (already invalidates), grid |
| Cloud cutout API | `CutoutService` + `cutoutKeys` | `local/cutout` → `remote/`; preview may become debounced `useQuery` using `signal` already in interface | `CutoutResult` shape, `applyAnalysisResult`, panels |
| Team sharing | `AssetRepository.list({scope})` + key branch | add `scope`/`share()` | interface identity |

---

## 6. Data Flow Walkthrough — drop → tweak → rename → export

```
1. DROP IMAGE  (UI → Store → Worker)
   DropZone.onFile(file) ─▶ store.loadImage(file):
     createImageBitmap(file) → set source{bitmap,name,w,h}; reset analysis; revoke old objectUrls
   useParamAutoRun sees new source ─▶ worker.postMessage({type:'loadImage', imageId, bitmap}, [bitmap])
   store.beginAnalysis() → runId=1 ─▶ postMessage({type:'analyze', runId:1, imageId, params, wantSlices:true})

2. WORKER RUNS  (Worker)
   loadImage: draw bitmap → OffscreenCanvas → ImageData → keep frame keyed by imageId
   analyze:   runPipeline(frame, params, signal): flood→alpha→feather→components→merge→pad→sort
              render: transferToImageBitmap(preview); per box → cropSlicePng → PNG Blob
   postMessage({type:'preview', runId:1, full, boxes}, [full])   then
   postMessage({type:'slices',  runId:1, slices:[{id,index,box,png,w,h}]})

3. RESULTS INTO STATE  (Worker → Bridge → Store)
   useAnalysisBridge.onmessage: if runId !== store.runId → close() bitmaps, DROP (no tear)
     preview → store.previewBitmap = full  (PreviewCanvas blits; PreviewMeta "N regions")
     slices  → store.applyAnalysisResult: map to Slice[] (uuid, name `${name}-01.png`, objectUrl)
   Grid fills (SliceCard thumbnails); StatusBar "12 slices · 3.2 MB · threshold 246"

4. TWEAK SLIDER  (UI → Store → Worker, debounced, stale-dropped)
   ParameterSlider.onValueChange(v) → store.setParam (label updates 0ms)
   ParameterSlider.onValueCommit(v) → useParamAutoRun debounce ~120ms → beginAnalysis() runId=2
     postMessage({type:'analyze', runId:2, imageId, params, wantSlices:false})  // preview-only during drag
   Worker's newer runId supersedes: runPipeline inter-stage `if(signal.aborted) return`
   Late runId=1 reply arrives after runId=2 → bridge drops it + close() bitmaps (no GPU leak)
   Guard: source >~4MP → commit-only (skip live preview) to stay smooth

5. RENAME SLICE  (UI → Store)
   SliceNameField Enter → store.renameSlice(id, name):
     slices.map(s => s.id===id ? {...s, name} : s)   // immutable
     Zod-validate non-empty; sanitize [^\w.-]→_ (mirrors Rust); ensure .png
   (No worker, no I/O — pure Zustand)

6. EXPORT ALL  (UI → Query → Service → Platform → Rust → disk)
   ExportBar/TopBar → useExportAll().mutate()  (button reads isPending → "导出中…")
     mutationFn: payload = selectExportPayload(store.getState())  // snapshot, immune to mid-export drag
       → assets.saveMany(payload)                                 // AssetRepository (service)
         → for each: bytes = new Uint8Array(await slice.blob.arrayBuffer())
         → nativeBridge.saveAssets([{name, bytes}])               // platform/native (ONLY Tauri import)
           → invoke('save_assets', {assets})                      // → Rust
             Rust: pick_folder → fs_scope.allow_directory → sanitize+guard → tokio::fs::write → {count, failed[]}
   onSuccess → invalidateQueries(assetKeys.all); toast.success("Exported 12 → /path")
   onError/cancel → toast.error / silent reset
```

---

## 7. Phased Implementation Plan

**Phase 0 — Scaffold (blocks all; do first, solo)**
- [ ] `pnpm create vite@latest` (react-ts) — **pin Vite to 7.x**; add Tailwind v4, path alias `@`, TanStack Query, Zustand
- [ ] `pnpm dlx shadcn@latest init`; add: button slider card resizable tabs tooltip dropdown-menu input badge skeleton sonner alert-dialog separator label
- [ ] `pnpm dlx @tauri-apps/cli init`; `tauri.conf.json` (window/CSP/bundle), `capabilities/default.json`, `Cargo.toml` deps
- [ ] `globals.css` tokens (light/.dark) + `bg-checker`; `lib/utils.ts` `cn()`; `lib/constants.ts` PARAM_RANGES
- [ ] Empty `AppShell` + `Providers` renders; `pnpm tauri dev` boots a window

**Phase 1 — Tauri shell + save (parallelizable with Phase 2)**
- [ ] `commands/save_assets.rs` (AssetInput/Result/SaveError, `sanitize_filename` run-collapse, `is_within`)
- [ ] `lib.rs` register plugins + `generate_handler![save_assets]`
- [ ] `platform/native.ts` `tauriBridge.saveAssets`; verify permission strings against `gen/schemas/`
- [ ] Manual test: invoke with 1 fake PNG → folder picker → file on disk; verify `failed[]` on bad name

**Phase 2 — Worker algorithm + tests (parallelizable with Phase 1; HIGH-VALUE)**
- [ ] `algorithm/` modules ported verbatim (constants: 8/235/90/246)
- [ ] Perf fixes: `mergeBoxes` DSU+grid+fixed-point; `floodBackground`/`findComponents` Int32Array queues
- [ ] Vitest golden fixtures: **assert new mergeBoxes == original output** on representative sheets (§8)
- [ ] `render.worker-side.ts` (OffscreenCanvas); `pipeline.worker.ts` + `protocol.ts`
- [ ] Smoke-test OffscreenCanvas/`convertToBlob`/ImageBitmap-transfer in WKWebView on min macOS

**Phase 3 — State + services (needs Phase 2 protocol; parallel with Phase 1)**
- [ ] `store/` slices + selectors + `bitmap.close()` lifecycle
- [ ] `services/types.ts` interfaces; `local/` impls; `context.ts` `createLocalRegistry`
- [ ] `hooks/`: `useAnalysisBridge` (runId stale-drop), `useParamAutoRun` (debounce), `queries/` (keys, export mutations, stubs)

**Phase 4 — UI split-view (needs Phase 0 shadcn + Phase 3 store)**
- [ ] `WorkspaceLayout` Resizable 3-pane; SourcePanel+DropZone+SourceCanvas+ParameterControls
- [ ] PreviewPanel+PreviewCanvas (blit + bbox overlay); RightRail Tabs/stacked; SliceGrid/Card/Thumb
- [ ] InspectorPanel+SliceNameField+ExportBar; TopBar+actions+ThemeToggle; StatusBar
- [ ] Wire `useHotkeys`; empty/loading/error/zero-region states

**Phase 5 — Productization (needs Phase 4)**
- [ ] bbox overlay, remembered output dir, hover card actions, copy-PNG, zero-region quick-fix, dark mode polish, count/bytes readouts, Sonner toasts

**Phase 6 — Packaging (last, solo)**
- [ ] `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- [ ] Build both DMGs; verify unsigned first-launch (right-click Open / `xattr -dr`)
- [ ] README: Gatekeeper story, build commands

**Parallelization:** Phase 1 (Tauri/Rust) ‖ Phase 2 (worker/algorithm) after Phase 0. Phase 3 starts once Phase 2's `protocol.ts` lands. Phase 4 needs Phase 0 (shadcn) + Phase 3 (store). Phases 5–6 sequential.

---

## 8. Testing Strategy

**High-value target: the pure `algorithm/` modules** (DOM-free, deterministic, hand-built `Uint8ClampedArray` fixtures in Vitest — no browser, no Tauri).

| Module | Test |
|---|---|
| `isBackgroundPixel` | truth table around `a<8`, `rgb ≥ threshold` boundaries (255, 246, 245) |
| `floodBackground` | synthetic frames: solid white → full mask; object-on-white → object unmasked; enclosed-hole background NOT flooded (border-seeded); **queue correctness = old impl** |
| `applyAlphaCut` | masked pixels α=0, others untouched |
| `featherEdges` | near-white (>235) foreground border → α≤90; interior untouched |
| `findComponents` | N separated blobs → N boxes; `< minArea` dropped; exact bbox x/y/w/h; inline-neighbor == old `forEach` |
| `mergeBoxes` | **GOLDEN: DSU+grid+fixed-point output == original algorithm** across overlap/near/chain/disjoint fixtures (the correctness-critical test); `gap=0` behavior |
| `boxGeometry` | `padBox` clamps to image bounds; `boxesNear` gap math; `unionBox` associativity |
| `sortBoxes` | y-then-x reading order; immutability (input unmutated) |
| `runPipeline` | end-to-end golden: fixture sheet → expected box count + geometry; `signal.aborted` bails mid-run |

**Property tests:** pixel-count invariants (sum of slice foreground α > 0 pixels ≈ source foreground within tolerance); box counts monotonic in params (higher `minArea` ⇒ ≤ boxes; higher `mergeGap` ⇒ ≤ boxes).

**Other tiers (lighter):**
- **Rust:** unit-test `sanitize_filename` (run-collapse, dotfile guard, empty→"asset") + `is_within` traversal against Electron's regex outputs.
- **Store:** `applyAnalysisResult` drops stale runId; `renameSlice` immutable; `selectExportPayload` default names.
- **Services:** inject fake `NativeBridge` → assert `saveMany` maps blobs→bytes correctly; no Tauri runtime.
- **E2E (Playwright, critical flows only):** drop → slice count > 0; rename persists; export mutation `isPending`→success toast (stub the bridge).

---

## 9. Open Assumptions to Verify Against Docs

| # | Assumption | Where |
|---|---|---|
| 1 | **Tauri v2 permission identifier strings** (`dialog:allow-open` vs `dialog:default`; `fs:allow-write-file` vs `fs:allow-write`) | `src-tauri/gen/schemas/*.json` for installed plugin versions |
| 2 | **`pick_folder` return type** `FilePath` → `PathBuf` conversion method name | tauri-plugin-dialog v2 docs |
| 3 | **`invoke` raw `ArrayBuffer`/`Uint8Array` body** support (else keep `number[]`) | installed `@tauri-apps/api` version |
| 4 | **`fs_scope().allow_directory` runtime API** name/signature | tauri-plugin-fs v2 |
| 5 | **OffscreenCanvas + `convertToBlob` + `createImageBitmap` + ImageBitmap transfer** in WKWebView on min macOS (Safari 16.4+ / macOS 13.3+) | smoke test on target OS; fallback: worker `ImageData` → main-thread `canvas.toBlob` |
| 6 | **CSP** must allow `worker-src 'self' blob:`, `img-src 'self' data: blob:` | `tauri.conf.json` |
| 7 | **shadcn CLI** `pnpm dlx shadcn@latest` (renamed from `shadcn-ui`); Resizable `autoSaveId`/`withHandle`; Sonner is current toast; Slider `onValueCommit` fires on release | shadcn/ui docs |
| 8 | **Tailwind v4** (`@theme` CSS-first, `@tailwindcss/vite` plugin) vs v3 config file — changes init + token declaration | scaffold; Tailwind v4 + Vite 7 |
| 9 | **React 19 peer-dep** support across Radix packages | pin versions |
| 10 | **TanStack Query v5** `queryOptions`, `gcTime` (not `cacheTime`), `signal` in `queryFn` ctx, `cancelQueries`/`invalidateQueries`; Zustand v5 `useShallow` from `zustand/react/shallow` | confirmed via Context7; re-confirm on install |
| 11 | **`backgroundColor` window prop** reliability across Tauri patch versions | mitigate with `html,body{background}` CSS fallback |

---

## 10. Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **`mergeBoxes` DSU diverges from original** (transitive grow-then-recheck) → different slices than Electron | HIGH | Fixed-point pass on set rectangles; golden-fixture tests gate the port (§8); fall back to iterating set-rect merges (provably equivalent) if divergence found |
| 2 | **OffscreenCanvas/`convertToBlob` missing/buggy on target WKWebView** | HIGH | Smoke-test Phase 2 on min macOS; fallback = pure pipeline in worker + `ImageData`→main-thread `canvas.toBlob` (pixel math still off-thread) |
| 3 | **Tauri v2 API drift** (permission strings, dialog return, fs-scope API) | MED | §9 verify-list before coding Phase 1; single `platform/native.ts` + `capabilities/default.json` localize all churn |
| 4 | **GPU memory leak** from un-closed `ImageBitmap`s on rapid slider drags | MED | `bitmap.close()` wired into stale-drop + replacement in `useAnalysisBridge`/`applyAnalysisResult`; test drag-storm |
| 5 | **Live preview jank on large (>4MP) sheets** | MED | Pixel-count guard → commit-only re-run above threshold; `wantSlices:false` during drag (preview-only); debounce 120ms |
| 6 | **Filename parity** Rust sanitize ≠ JS `/[^\w.-]+/g` (run-collapse; ASCII `\w`) | MED | Replicate `+` collapse in `sanitize_filename`; or `regex` crate with `unicode(false)`; unit-test against JS outputs; mirror in `lib/filename.ts` |
| 7 | **Unsigned DMG Gatekeeper friction** | LOW | Document right-click-Open / `xattr -dr com.apple.quarantine`; leave `signingIdentity`/notarization seams for later |
| 8 | **Double file-drop handling** (Tauri window event + DOM handler) | LOW | Tauri window drop event is source of truth in desktop build; DOM handler only for web fallback |
| 9 | **`autoSaveId` panel persistence** prop name drift | LOW | Verify in shadcn/react-resizable-panels; localize to `WorkspaceLayout` |
| 10 | **Worker bundling under Tauri CSP** (blob worker URL) | LOW | Vite `new Worker(new URL(...), {type:'module'})` + CSP `worker-src 'self' blob:` (risk 6 CSP) |
