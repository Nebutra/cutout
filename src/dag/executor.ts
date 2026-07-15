/**
 * Executor (spec §5/§D) — an in-app, topological, fan-out runner over a
 * validated {@link GraphSpec}.
 *
 * We run inside the Tauri webview (no LangGraph / server orchestration), so this
 * is a small, PURE client-side scheduler:
 *   - a node is READY once every one of its `inputs` has a `done` output;
 *   - independent ready nodes run CONCURRENTLY (fan-out — e.g. N mockup edits in
 *     parallel), capped by a bounded pool (default {@link DEFAULT_CONCURRENCY})
 *     so we respect provider rate limits;
 *   - each node dispatches through the injected `runNode` (which maps the op to a
 *     service — see `hooks/queries/dag.ts`), reading upstream outputs by id;
 *   - a failure LOCALIZES to its node (`error`) and marks every transitive
 *     descendant `blocked` — siblings keep running.
 *
 * The scheduler owns no store/service imports (they are injected via `runNode` /
 * `onStatus`), which keeps it deterministic and unit-testable with mocks. The
 * app wires the real dispatch + writes each `NodeRunState` into the pipeline
 * store slice through `onStatus`. Adjust-and-re-run is `reRunSubtree`, which
 * re-executes only a node and its descendants, reusing prior outputs for the
 * rest.
 */
import type { GraphNodeSpec, GraphSpec } from "./graph-spec";
import { validateGraph } from "./validate";

/** Default fan-out width — independent nodes run at most this many at a time. */
export const DEFAULT_CONCURRENCY = 3;

/**
 * Per-node execution status:
 *  - `idle` not started · `running` in flight · `done` produced its output ·
 *  - `error` its runner threw · `blocked` an upstream failed so it can't run.
 */
export type NodeRunStatus =
  "idle" | "running" | "done" | "error" | "blocked" | "cancelled";

/** A node's execution state — status plus (on success) its output / (on failure) the reason. */
export interface NodeRunState<TOut> {
  readonly status: NodeRunStatus;
  /** Present only when `status === 'done'`. */
  readonly output?: TOut;
  /** Present only when `status === 'error'`. */
  readonly error?: string;
}

/** The final states of every node after a scheduled run. */
export interface RunResult<TOut> {
  readonly states: ReadonlyMap<string, NodeRunState<TOut>>;
  readonly snapshot: RunSnapshot<TOut>;
}

export interface RunSnapshot<TOut> {
  readonly graphFingerprint: string;
  readonly baseRevision: number;
  readonly states: ReadonlyMap<string, NodeRunState<TOut>>;
  readonly receipts: ReadonlyMap<string, { readonly outputHash: string }>;
}

/**
 * Injected dependencies for a run. `runNode` performs one node's work given its
 * upstream outputs (keyed by input node id); `onStatus` is notified on every
 * state change (the store uses it to drive the canvas). `concurrency` caps the
 * fan-out width.
 */
export interface RunDeps<TOut> {
  /** Run one node; resolve with its output, or reject to mark it `error`. */
  runNode(
    node: GraphNodeSpec,
    inputs: ReadonlyMap<string, TOut>,
    signal?: AbortSignal,
  ): Promise<TOut>;
  /** Bounded pool width (default {@link DEFAULT_CONCURRENCY}). */
  readonly concurrency?: number;
  /** Stops new dispatches and is forwarded to in-flight node runners. */
  readonly signal?: AbortSignal;
  /** Authoritative Design IR/workspace revision this execution targets. */
  readonly baseRevision?: number;
  /** Notified on every node state transition (never for the seeded `done` set). */
  onStatus?(nodeId: string, state: NodeRunState<TOut>): void;
}

/** Adjacency `from → [to, …]` built from the spec's edges. */
function buildChildren(
  spec: GraphSpec,
): ReadonlyMap<string, readonly string[]> {
  const children = new Map<string, string[]>();
  for (const node of spec.nodes) children.set(node.id, []);
  for (const edge of spec.edges) children.get(edge.from)?.push(edge.to);
  return children;
}

/**
 * The ids of `nodeId` plus every transitive descendant (BFS over edges). Used by
 * {@link reRunSubtree} (what to re-run) and by the store (what to reset stale).
 */
export function subtreeIds(
  spec: GraphSpec,
  nodeId: string,
): ReadonlySet<string> {
  const children = buildChildren(spec);
  const seen = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const child of children.get(id) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  return seen;
}

/**
 * The shared scheduler. Seeds each node's state from `initial` (nodes seeded
 * `done` are treated as already-satisfied inputs and never re-run), then pumps a
 * bounded pool: pick ready idle nodes, run them, and on completion either unblock
 * their children (`done`) or block their descendants (`error`).
 */
async function schedule<TOut>(
  spec: GraphSpec,
  deps: RunDeps<TOut>,
  initial: ReadonlyMap<string, NodeRunState<TOut>>,
): Promise<RunResult<TOut>> {
  const requestedConcurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.floor(requestedConcurrency))
    : DEFAULT_CONCURRENCY;
  const children = buildChildren(spec);
  const state = new Map<string, NodeRunState<TOut>>();
  for (const node of spec.nodes) {
    state.set(node.id, initial.get(node.id) ?? { status: "idle" });
  }

  const statusOf = (id: string): NodeRunStatus =>
    state.get(id)?.status ?? "idle";

  const setState = (id: string, next: NodeRunState<TOut>): void => {
    state.set(id, next);
    deps.onStatus?.(id, next);
  };

  /** Mark every still-idle transitive descendant of a failed node `blocked`. */
  const blockDescendants = (id: string): void => {
    const stack = [...(children.get(id) ?? [])];
    while (stack.length > 0) {
      const child = stack.pop() as string;
      if (statusOf(child) === "idle") {
        setState(child, { status: "blocked" });
        stack.push(...(children.get(child) ?? []));
      }
    }
  };

  const inFlight = new Map<string, Promise<void>>();

  const cancelIdleNodes = (): void => {
    for (const node of spec.nodes) {
      if (statusOf(node.id) === "idle")
        setState(node.id, { status: "cancelled" });
    }
  };

  /** Idle nodes whose inputs are all `done` (and none failed/blocked). */
  const pickReady = (): GraphNodeSpec[] => {
    const ready: GraphNodeSpec[] = [];
    for (const node of spec.nodes) {
      if (statusOf(node.id) !== "idle" || inFlight.has(node.id)) continue;
      let runnable = true;
      for (const input of node.inputs) {
        const s = statusOf(input);
        if (s !== "done") {
          runnable = false;
          break;
        }
      }
      if (runnable) ready.push(node);
    }
    return ready;
  };

  const run = async (node: GraphNodeSpec): Promise<void> => {
    setState(node.id, { status: "running" });
    try {
      const inputs = new Map<string, TOut>();
      for (const input of node.inputs) {
        const output = state.get(input)?.output;
        if (output !== undefined) inputs.set(input, output);
      }
      const output = await deps.runNode(node, inputs, deps.signal);
      if (deps.signal?.aborted) {
        setState(node.id, { status: "cancelled" });
        return;
      }
      setState(node.id, { status: "done", output });
    } catch (error) {
      if (deps.signal?.aborted || isAbortError(error)) {
        setState(node.id, { status: "cancelled" });
        return;
      }
      setState(node.id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      blockDescendants(node.id);
    }
  };

  while (true) {
    if (deps.signal?.aborted) {
      cancelIdleNodes();
      if (inFlight.size === 0) break;
      await Promise.race(inFlight.values());
      continue;
    }
    for (const node of pickReady()) {
      if (inFlight.size >= concurrency) break;
      const promise = run(node).finally(() => inFlight.delete(node.id));
      inFlight.set(node.id, promise);
    }
    if (inFlight.size === 0) break;
    await Promise.race(inFlight.values());
  }

  return {
    states: state,
    snapshot: createRunSnapshot(spec, deps.baseRevision ?? 0, state),
  };
}

function assertExecutableGraph(spec: GraphSpec): void {
  const validation = validateGraph(spec);
  if (!validation.ok) {
    throw new Error(`Invalid graph: ${validation.error}`);
  }
}

/**
 * Run a whole graph from scratch — every node starts `idle`. Structural graph
 * errors reject before any node is dispatched; runtime node failures are captured
 * as per-node `error` states in the resolved {@link RunResult}.
 */
export async function runGraph<TOut>(
  spec: GraphSpec,
  deps: RunDeps<TOut>,
): Promise<RunResult<TOut>> {
  assertExecutableGraph(spec);
  const initial = new Map<string, NodeRunState<TOut>>(
    spec.nodes.map((node) => [node.id, { status: "idle" }]),
  );
  return schedule(spec, deps, initial);
}

/**
 * Re-run a node and its descendants (spec §5 "adjust + re-run"). Everything in
 * the subtree is reset to `idle`; every other node keeps its `prior` state, so
 * already-`done` upstream outputs feed the re-run without recomputation.
 */
export async function reRunSubtree<TOut>(
  spec: GraphSpec,
  nodeId: string,
  deps: RunDeps<TOut>,
  prior: RunSnapshot<TOut>,
): Promise<RunResult<TOut>> {
  assertExecutableGraph(spec);
  if (!spec.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Unknown node: "${nodeId}".`);
  }
  assertReusableSnapshot(spec, deps.baseRevision ?? 0, prior);
  const subtree = subtreeIds(spec, nodeId);
  const initial = new Map<string, NodeRunState<TOut>>();
  for (const node of spec.nodes) {
    initial.set(
      node.id,
      subtree.has(node.id)
        ? { status: "idle" }
        : (prior.states.get(node.id) ?? { status: "idle" }),
    );
  }
  return schedule(spec, deps, initial);
}

export function createRunSnapshot<TOut>(
  spec: GraphSpec,
  baseRevision: number,
  states: ReadonlyMap<string, NodeRunState<TOut>>,
): RunSnapshot<TOut> {
  assertExecutableGraph(spec);
  const receipts = new Map<string, { outputHash: string }>();
  for (const node of spec.nodes) {
    const state = states.get(node.id);
    if (state?.status === "done") {
      if (state.output === undefined)
        throw new Error(`Completed node "${node.id}" has no reusable output.`);
      receipts.set(node.id, { outputHash: stableFingerprint(state.output) });
    }
  }
  return {
    graphFingerprint: graphFingerprint(spec),
    baseRevision,
    states: new Map(states),
    receipts,
  };
}

function assertReusableSnapshot<TOut>(
  spec: GraphSpec,
  baseRevision: number,
  snapshot: RunSnapshot<TOut>,
): void {
  if (snapshot.graphFingerprint !== graphFingerprint(spec))
    throw new Error("Stale run snapshot: graph fingerprint does not match.");
  if (snapshot.baseRevision !== baseRevision)
    throw new Error(
      `Stale run snapshot revision ${snapshot.baseRevision}; current revision is ${baseRevision}.`,
    );
  for (const node of spec.nodes) {
    const state = snapshot.states.get(node.id);
    if (state?.status !== "done") continue;
    const receipt = snapshot.receipts.get(node.id);
    if (
      state.output === undefined ||
      !receipt ||
      receipt.outputHash !== stableFingerprint(state.output)
    )
      throw new Error(
        `Stale run snapshot: output receipt for "${node.id}" is missing or invalid.`,
      );
  }
}

function graphFingerprint(spec: GraphSpec): string {
  return stableFingerprint({
    nodes: spec.nodes.map((node) => ({ ...node, inputs: [...node.inputs] })),
    edges: spec.edges.map((edge) => ({ ...edge })),
  });
}

function stableFingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  const feed = (byte: number) => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  const visit = (item: unknown): void => {
    if (item instanceof Uint8Array) {
      feed(1);
      for (const byte of item) feed(byte);
      return;
    }
    if (Array.isArray(item)) {
      feed(2);
      for (const entry of item) visit(entry);
      return;
    }
    if (item && typeof item === "object") {
      feed(3);
      for (const key of Object.keys(item as object).sort()) {
        visit(key);
        visit((item as Record<string, unknown>)[key]);
      }
      return;
    }
    const text = `${typeof item}:${String(item)}`;
    for (let index = 0; index < text.length; index++)
      feed(text.charCodeAt(index) & 0xff);
  };
  visit(value);
  return hash.toString(16).padStart(8, "0");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
