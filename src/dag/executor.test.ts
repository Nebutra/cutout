import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CONCURRENCY,
  createRunSnapshot,
  runGraph,
  reRunSubtree,
  subtreeIds,
  type RunDeps,
} from "./executor";
import type { GraphNodeSpec, GraphSpec } from "./graph-spec";

/** Build an executable node whose declared inputs mirror its incoming edges. */
function node(id: string, inputs: string[] = []): GraphNodeSpec {
  return {
    id,
    op: inputs.length === 0 ? "generate-image" : "edit-image",
    label: id,
    inputs,
  };
}

/** Derive the edge list from every node's `inputs` (kept consistent). */
function graphFrom(nodes: GraphNodeSpec[]): GraphSpec {
  const edges = nodes.flatMap((n) =>
    n.inputs.map((from) => ({ from, to: n.id })),
  );
  return { nodes, edges };
}

/** A resolved-promise microtask yield. */
const tick = (): Promise<void> => Promise.resolve();

/** All-`done` prior states (each node's output is its own id), for re-run tests. */
function priorAllDone(spec: GraphSpec) {
  const states = new Map(
    spec.nodes.map((n) => [n.id, { status: "done", output: n.id } as const]),
  );
  return createRunSnapshot(spec, 0, states);
}

describe("executor.runGraph", () => {
  it("rejects an invalid graph before dispatching any side effects", async () => {
    const runNode = vi.fn(async (n: GraphNodeSpec) => n.id);
    const malformed: GraphSpec = {
      nodes: [node("a"), node("b")],
      edges: [{ from: "a", to: "b" }],
    };

    await expect(runGraph(malformed, { runNode })).rejects.toThrow(
      "Invalid graph",
    );
    expect(runNode).not.toHaveBeenCalled();
  });

  it("respects topological order (upstream completes before downstream starts)", async () => {
    // ds → a → b, and ds → c (a fan-out with a chain).
    const spec = graphFrom([
      node("ds"),
      node("a", ["ds"]),
      node("b", ["a"]),
      node("c", ["ds"]),
    ]);
    const started: string[] = [];

    const deps: RunDeps<string> = {
      runNode: async (n, inputs) => {
        started.push(n.id);
        // Every declared input must already be present as an upstream output.
        for (const input of n.inputs) expect(inputs.has(input)).toBe(true);
        await tick();
        return n.id;
      },
    };

    const result = await runGraph(spec, deps);

    const rank = new Map(started.map((id, i) => [id, i]));
    expect(rank.get("ds")!).toBeLessThan(rank.get("a")!);
    expect(rank.get("a")!).toBeLessThan(rank.get("b")!);
    expect(rank.get("ds")!).toBeLessThan(rank.get("c")!);
    for (const n of spec.nodes) {
      expect(result.states.get(n.id)?.status).toBe("done");
    }
  });

  it("runs independent ready nodes concurrently (fan-out readiness)", async () => {
    // ds fans out to a + b; a and b are independent once ds is done.
    const spec = graphFrom([node("ds"), node("a", ["ds"]), node("b", ["ds"])]);

    let active = 0;
    let peak = 0;
    // Barrier so a + b must BOTH enter before either is allowed to finish.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered = 0;

    const deps: RunDeps<string> = {
      runNode: async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        if (n.id === "a" || n.id === "b") {
          entered += 1;
          if (entered === 2) release();
          await gate;
        }
        active -= 1;
        return n.id;
      },
    };

    await runGraph(spec, deps);
    expect(peak).toBe(2); // a and b overlapped
  });

  it("honours the bounded concurrency cap", async () => {
    // Four independent roots, pool of 2 → never more than 2 in flight.
    const spec = graphFrom([node("a"), node("b"), node("c"), node("d")]);

    let active = 0;
    let peak = 0;
    const deps: RunDeps<string> = {
      concurrency: 2,
      runNode: async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return n.id;
      },
    };

    await runGraph(spec, deps);
    expect(peak).toBe(2);
  });

  it("normalizes invalid concurrency instead of creating an unbounded pool", async () => {
    const spec = graphFrom([node("a"), node("b"), node("c"), node("d")]);
    let active = 0;
    let peak = 0;

    await runGraph(spec, {
      concurrency: Number.NaN,
      runNode: async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return n.id;
      },
    });

    expect(peak).toBe(DEFAULT_CONCURRENCY);
  });

  it("does not dispatch queued work after the run is aborted", async () => {
    const spec = graphFrom([node("a"), node("b")]);
    const controller = new AbortController();
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = runGraph(spec, {
      concurrency: 1,
      signal: controller.signal,
      runNode: async (n, _inputs, signal) => {
        started.push(n.id);
        expect(signal).toBe(controller.signal);
        await gate;
        return n.id;
      },
    });

    await tick();
    controller.abort();
    release();

    const result = await pending;
    expect(started).toEqual(["a"]);
    expect(result.states.get("a")?.status).toBe("cancelled");
    expect(result.states.get("b")?.status).toBe("cancelled");
  });

  it("localizes a failure: only descendants are blocked, siblings still run", async () => {
    // ds → a → x  and  ds → b → y. `a` fails → x blocked; b + y still complete.
    const spec = graphFrom([
      node("ds"),
      node("a", ["ds"]),
      node("x", ["a"]),
      node("b", ["ds"]),
      node("y", ["b"]),
    ]);
    const ran = new Set<string>();

    const deps: RunDeps<string> = {
      runNode: async (n) => {
        ran.add(n.id);
        if (n.id === "a") throw new Error("a exploded");
        return n.id;
      },
    };

    const result = await runGraph(spec, deps);

    expect(result.states.get("a")?.status).toBe("error");
    expect(result.states.get("a")?.error).toContain("exploded");
    expect(result.states.get("x")?.status).toBe("blocked");
    expect(result.states.get("b")?.status).toBe("done");
    expect(result.states.get("y")?.status).toBe("done");
    expect(ran.has("x")).toBe(false); // blocked node never dispatched
  });
});

describe("executor.reRunSubtree", () => {
  it("rejects a re-run request for a node outside the graph", async () => {
    const spec = graphFrom([node("a")]);
    const runNode = vi.fn(async (n: GraphNodeSpec) => n.id);

    await expect(
      reRunSubtree(spec, "missing", { runNode }, priorAllDone(spec)),
    ).rejects.toThrow("Unknown node");
    expect(runNode).not.toHaveBeenCalled();
  });

  it("re-runs exactly the node and its descendants", async () => {
    // ds → a → b, ds → c. Re-run from `a` → a + b only (ds, c untouched).
    const spec = graphFrom([
      node("ds"),
      node("a", ["ds"]),
      node("b", ["a"]),
      node("c", ["ds"]),
    ]);
    const runNode = vi.fn(async (n: GraphNodeSpec) => n.id);

    const result = await reRunSubtree(
      spec,
      "a",
      { runNode },
      priorAllDone(spec),
    );

    const ran = runNode.mock.calls.map(([n]) => n.id).sort();
    expect(ran).toEqual(["a", "b"]);
    // ds and c keep their prior done outputs; a and b are freshly done.
    for (const id of ["ds", "a", "b", "c"]) {
      expect(result.states.get(id)?.status).toBe("done");
    }
  });

  it("rejects prior outputs from another graph, revision or a tampered receipt", async () => {
    const spec = graphFrom([node("a"), node("b", ["a"])]);
    const prior = priorAllDone(spec);
    const changed = graphFrom([node("a"), node("b", ["a"]), node("c")]);
    await expect(
      reRunSubtree(changed, "b", { runNode: async (n) => n.id }, prior),
    ).rejects.toThrow(/graph fingerprint/);
    await expect(
      reRunSubtree(
        spec,
        "b",
        { runNode: async (n) => n.id, baseRevision: 1 },
        prior,
      ),
    ).rejects.toThrow(/snapshot revision/);
    const tampered = {
      ...prior,
      states: new Map(prior.states).set("a", {
        status: "done" as const,
        output: "changed",
      }),
    };
    await expect(
      reRunSubtree(spec, "b", { runNode: async (n) => n.id }, tampered),
    ).rejects.toThrow(/output receipt/);
  });

  it("subtreeIds returns the node plus every transitive descendant", () => {
    const spec = graphFrom([
      node("ds"),
      node("a", ["ds"]),
      node("b", ["a"]),
      node("c", ["ds"]),
    ]);
    expect([...subtreeIds(spec, "a")].sort()).toEqual(["a", "b"]);
    expect([...subtreeIds(spec, "ds")].sort()).toEqual(["a", "b", "c", "ds"]);
  });
});
