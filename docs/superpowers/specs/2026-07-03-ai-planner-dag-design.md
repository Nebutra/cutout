# Cutout — 垫图 (image-to-image) + AI-Planner DAG Design

**Status:** decided (user-approved) · **Extends:** `2026-07-02-pipeline-canvas-design.md` (the React Flow pipeline canvas, P1–P3 shipped) with **P5 (垫图 / image edit)** and **P6 (AI-generated DAG)**. · **Depends on:** the shipped canvas + store pipeline slice, `GenerationService` (generateImages / generateObject), the Rust BYOK proxy, the Settings image + chat slots, the prompt catalog. · **Scope:** (P5) reference-image-conditioned generation via OpenAI `/v1/images/edits`; (P6) an LLM **Planner** that emits a validated **GraphSpec** which an in-app topological **Executor** runs on the canvas with fan-out and a small reusable node vocabulary. **Not** in scope: LangGraph/server orchestration, dynamic mid-run replanning (static-first; manual re-run of a subtree covers V1 dynamism).

---

## 1. Intent & locked decisions

The product becomes a **DAG for organizing mockups + asset libraries**, where **AI heuristically generates the node graph** and every chain is flexible, reusable, adjustable, and structured. Two model roles (user-chosen):
- **Chat/vision model** (GPT-5.5-class, the Settings **chat slot**) = **Planner** + image-reader + slice-namer (structured output).
- **Image model** (GPT-Image-2, the Settings **image slot**) = generator + **垫图 editor** (`/v1/images/edits`).

Locked (approved):
1. **垫图 via a new Rust `ai_image_edit` command** using reqwest `multipart` (the edits endpoint is multipart/form-data, not JSON — the existing string-body proxy can't carry it). Key stays in Rust.
2. **DAG = Planner → GraphSpec (zod-validated) → in-app topological Executor**, over a **small reusable, typed node vocabulary** (avoids ComfyUI's flat-one-off trap). **Static-first**: plan the whole graph, run it, let the user adjust a node and re-run just its subtree. Replan loops later.
3. Reuse everything shipped: canvas nodes, cutout worker, generateImages/generateObject, prompt catalog, BYOK proxy.

---

## 2. §A — 垫图 / image edit (`/v1/images/edits`)

**API (verified):** `POST {baseUrl}/images/edits`, **multipart/form-data**: `model`, `prompt` (required), repeated `image` fields (1..N reference images; PNG/WEBP/JPG; gpt-image supports multiple), optional `mask`, `size`, `input_fidelity` (`high` preserves the reference's style/features — use `high` for 垫图), `n`. Do not use the non-standard `image[]` spelling: some OpenAI-compatible relays reject it. gpt-image responses are **always base64** (`data[].b64_json`). Sources: OpenAI Create-image-edit reference.

**Rust command** `src-tauri/src/commands/ai/ai_proxy.rs` (or a sibling `image_edit.rs`):
```rust
#[tauri::command]
pub async fn ai_image_edit(
  provider_id: String, kind: String, base_url: String, model: String,
  prompt: String, images: Vec<Vec<u8>>, // reference image bytes (垫图)
  size: Option<String>, input_fidelity: Option<String>,
) -> Result<ImageEditResult, ProxyError> // { b64: String } or bytes
```
- Enable reqwest `multipart` feature in `Cargo.toml`.
- Build `multipart::Form`: `model`, `prompt`, `size?`, `input_fidelity` (default `"high"`), and one repeated `image` part per reference with a filename + PNG mime. Inject the auth header (reuse `build_method_and_headers` / `read_secret`); host must pass `enforce_host`. Buffered client with a timeout (reuse `build_client(Some(120))`).
- Parse `{ data: [{ b64_json }] }` → return base64 (decode to bytes in JS via existing helpers). Only for `kind` `openai` / `openai-compatible` (edits is an OpenAI-shaped endpoint).

**Service:** extend `GenerationService` (`src/services/ai/types.ts` + `generation-service.local.ts`):
```ts
editImage(input: {
  providerId: string; model?: string; prompt: string;
  images: Uint8Array[]; size?: string; inputFidelity?: 'high'|'low'; signal?: AbortSignal
}): Promise<Result<GeneratedAsset[]>>
```
Implemented by `invoke('ai_image_edit', …)` (NOT the AI SDK — generateImage can't do edits). Returns `GeneratedAsset[]` (mediaType image/png, bytes).

**Wiring:** the mockup-generation transition gains a 垫图 mode — when an upstream reference image exists (e.g. the design-system image), generate the mockup via `editImage({ images:[reference], prompt: screenBrief })` instead of `generateImages`. Screenshot-based deconstruction with gpt-image can likewise use `editImage`. Gemini-style models still use the chat+files multimodal path.

---

## 3. §B — GraphSpec (the AI-emitted contract)

A zod-validated graph the Planner outputs and the Executor runs. `src/dag/graph-spec.ts`:
```ts
type NodeOp = 'generate-image' | 'edit-image' | 'deconstruct' | 'cutout' | 'name'
interface GraphNodeSpec {
  id: string                       // planner-assigned, unique
  op: NodeOp
  label: string                    // human label (e.g. "原型图·购物车")
  prompt?: string                  // per-node instruction (screen brief, style spec…)
  inputs: string[]                 // ids of upstream nodes whose output feeds this one (data deps)
  // op-specific hints (model slot is resolved from Settings, not embedded):
  fidelity?: 'high' | 'low'        // edit-image
}
interface GraphSpec { nodes: GraphNodeSpec[]; edges: { from: string; to: string }[] }
```
Validation (`src/dag/validate.ts`): non-empty, unique ids/edges/inputs, edges reference existing nodes, incoming edges exactly equal node inputs, op-specific input arity, and **acyclic** (topological sort succeeds). Invalid → reject with a clear error (the Planner is re-promptable).

**Node vocabulary (reusable, typed):**
| op | reads | produces | via |
|---|---|---|---|
| `generate-image` | prompt | image | image slot + generateImages |
| `edit-image` (垫图) | prompt + input image(s) | image | image slot + **editImage** |
| `deconstruct` | mockup image | asset board image | image slot (asset-deconstruction prompt) |
| `cutout` | board image | slices | existing worker (deterministic) |
| `name` | board image + slice boxes | slice names | chat slot + generateObject |

## 4. §C — Planner

`src/prompts/catalog/ui-graph-planner.ts` (chat/vision, scenario `planning`): given a requirement, emit a GraphSpec that typically = a `generate-image` design-system node → fan-out of `edit-image` mockup nodes (each 垫图=design-system, prompt=its screen brief) → each `deconstruct`→`cutout`→`name`. The planner DECIDES how many screens + their briefs + the 垫图 wiring (AI-generated topology), constrained to the node vocabulary + GraphSpec schema.

`src/dag/planner.ts`: `planGraph(generation, { providerId, model, brief }) → Result<GraphSpec>` via `generateObject(promptRef=ui-graph-planner, input=[{text:brief}], schema=graphSpecSchema)` on the chat slot. Validate before returning.

## 5. §D — Executor (in-app, topological, fan-out)

`src/dag/executor.ts` — a small client-side runner (no LangGraph; we run in the Tauri webview):
- Topologically order the GraphSpec; a node is **ready** when all its `inputs` have `done` outputs.
- Run ready nodes; **independent nodes run concurrently** (fan-out — e.g. N mockup edits in parallel, bounded concurrency ~3 to respect rate limits). Each node's runner dispatches to the matching service (`generateImages` / `editImage` / deconstruct / cutout worker / `name`), reading upstream outputs by id.
- Store node outputs + status in the pipeline store (extend the slice to hold an arbitrary node set + a `runNode`/`runGraph`/`reRunSubtree(id)` action). Failure localizes to the node (status `error` + message); downstream stays `blocked`.
- **Adjust + re-run**: editing a node's `prompt`/inputs marks it + its descendants stale; `reRunSubtree` re-executes only those.

## 6. §E — Canvas materialization

`src/components/canvas/` — map GraphSpec nodes → React Flow nodes by `op` (reuse BriefNode/MockupNode/BoardNode/SlicesNode; add a `DesignSystemNode` for `generate-image` style specs and a generic typed node for others), edges → dependency edges. Auto-layout (layered/topological via a small layered layout or `dagre` if warranted). The Planner’s graph replaces the fixed linear chain when a requirement is planned; importing a board still drops you at the `board` node (P1 path preserved). Calm/opaque nodes (project UI rule).

## 7. Phased plan

- **P5 — 垫图**: reqwest `multipart` feature; `ai_image_edit` Rust command (+ Rust test of the multipart form / host guard where testable); `GenerationService.editImage`; wire the mockup transition to prefer `editImage` when a reference image is present. Unit-test the service mapping (mock invoke). **Live /images/edits call is verified by the user** (needs their key). 
- **P6a — Planner + GraphSpec**: `graph-spec.ts` (+ zod) + `validate.ts` (+ tests: acyclic, dangling edges, topo order); `ui-graph-planner` prompt (+ test); `planner.ts` (+ test with a mocked generateObject).
- **P6b — Executor + materialization**: `executor.ts` (+ tests: topo order, fan-out readiness, subtree re-run, failure localization — with mocked services); pipeline store extended to an arbitrary node set; canvas materializes a GraphSpec; a "规划并生成" action on the brief entry runs planGraph → runGraph.

## 8. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | 垫图 live call can't be unit-tested (needs key + relay) | agent implements + unit-tests the mapping; user verifies the live call; surface HTTP status like the other proxy paths |
| 2 | Multipart in Rust proxy (new shape) | dedicated `ai_image_edit` command with `reqwest::multipart`; don't overload the string-body proxy |
| 3 | AI-emitted GraphSpec may be invalid/cyclic | zod + explicit validate (acyclic, dangling-edge, id-unique) before execution; re-promptable; clear error |
| 4 | Executor complexity / rate limits | small bounded-concurrency topo runner; per-node status; static plan (no mid-run replan in V1) |
| 5 | Model availability (planner needs vision chat model; 垫图 needs gpt-image) | gate each op on its Settings slot; clear CTA when unset; Gemini path remains for chat-image |
| 6 | Canvas node explosion | typed reusable node kit + layered auto-layout; reuse existing nodes; calm/opaque |
