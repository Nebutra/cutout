import { describe, expect, it, vi } from "vitest";
import {
  createMemoryVisualExecutionStore,
  executeVisualGeneration,
  isRetryableVisualToolError,
  planVisualGeneration,
  visualGenerationTaskSchema,
  type ReviewGate,
  type VariantCandidate,
  type VisualGenerationTask,
  type VisualToolInvocation,
} from ".";
import type { PaidToolReceipt } from "@/control-protocol/paid-tool-contract";

const hash = "a".repeat(64);
function task(
  overrides: Partial<VisualGenerationTask> = {},
): VisualGenerationTask {
  return visualGenerationTaskSchema.parse({
    version: "visual-generation-task.v1",
    taskId: "task-1",
    catalogItemId: "A5.pattern",
    kind: "brand-pattern",
    prompt: {
      version: "visual-prompt.v1",
      objective: "Create a repeatable supporting pattern.",
      subject: "Geometric pattern",
      composition: "Seamless tile",
      artDirection: "Precise and restrained",
      constraints: ["No text"],
      negativeConstraints: ["watermark"],
      output: { size: "1024x1024", mediaType: "image/png", transparent: true },
      locale: "zh-CN",
    },
    references: [
      {
        referenceId: "ref-1",
        artifactId: "brand-master",
        sha256: hash,
        mediaType: "image/png",
        role: "identity",
        strength: 1,
        immutable: true,
        provenanceId: "prov-ref",
      },
    ],
    variants: { count: 4, parallelism: 2 },
    consistency: {
      seriesId: "brand-series",
      serial: 1,
      lockedTraits: ["stroke rhythm"],
    },
    routing: {
      preferredModel: "gpt-image-2",
      requiredCapabilities: ["image-generate", "image-edit", "multi-reference"],
      allowCompatibleFallback: true,
    },
    budget: {
      ceiling: { currency: "USD", amount: 1 },
      approvalPolicy: "auto-within-budget",
      maxAttemptsPerNode: 2,
    },
    publication: {
      intendedUse: "raster-master",
      requiresHumanReview: false,
      requiresVectorization: false,
    },
    ...overrides,
  });
}
function receipt(input: VisualToolInvocation, output: string): PaidToolReceipt {
  return {
    receiptId: `receipt:${input.requestId}`,
    requestId: input.requestId,
    capability: input.capability,
    providerId: "openai",
    model: input.preferredModel,
    status: "succeeded",
    charged: { currency: "USD", amount: 0.02 },
    outputArtifactIds: [output],
    startedAt: 1,
    completedAt: 2,
  };
}
function candidate(input: VisualToolInvocation): VariantCandidate {
  const artifactId = `artifact:${input.nodeId}`;
  return {
    variantId: `candidate:${input.nodeId}`,
    artifactId,
    sha256: hash,
    mediaType: "image/png",
    requestId: input.requestId,
    model: input.preferredModel,
    providerId: "openai",
    attempt: Number(input.requestId.match(/:attempt:(\d+)$/)?.[1] ?? 1),
    provenanceId: `prov:${input.nodeId}`,
  };
}
function approve(
  gate: ReviewGate,
  candidates: readonly VariantCandidate[],
): ReviewGate {
  return {
    ...gate,
    status: "approved",
    selectedCandidateId: candidates[0].variantId,
    decidedAt: 5,
  };
}

describe("visual generation contracts and planning", () => {
  it("does not retry timeouts or cancelled provider calls", () => {
    expect(isRetryableVisualToolError(new Error("Provider deadline exceeded."))).toBe(false);
    expect(isRetryableVisualToolError(new DOMException("Stopped", "AbortError"))).toBe(false);
  });
  it("builds parallel variants followed by selection, edit, review and promotion", () => {
    const plan = planVisualGeneration(task(), {
      generate: { currency: "USD", amount: 0.05 },
      edit: { currency: "USD", amount: 0.08 },
    });
    expect(plan.nodes.map((node) => node.operation)).toEqual([
      "generate",
      "generate",
      "generate",
      "generate",
      "select",
      "edit",
      "review",
      "promote",
    ]);
    expect(plan.estimatedCost.amount).toBeCloseTo(0.28);
  });
  it("forces generated logos and icons through raster seed, vectorization and human review", () => {
    expect(() =>
      task({
        kind: "brand-logo-seed",
        publication: {
          intendedUse: "raster-master",
          requiresHumanReview: false,
          requiresVectorization: false,
        },
      }),
    ).toThrow(/raster seed/);
    expect(
      task({
        kind: "brand-logo-seed",
        publication: {
          intendedUse: "raster-seed",
          requiresHumanReview: true,
          requiresVectorization: true,
        },
      }).publication,
    ).toMatchObject({ requiresVectorization: true });
  });
  it("requires an immutable mask for local repaint", () => {
    expect(() =>
      task({
        refinement: {
          mode: "local-mask",
          instruction: "Replace only the badge.",
        },
      }),
    ).toThrow(/mask reference/);
    expect(
      task({
        refinement: {
          mode: "local-mask",
          instruction: "Replace only the badge.",
        },
        references: [
          {
            referenceId: "mask",
            artifactId: "mask-artifact",
            sha256: hash,
            mediaType: "image/png",
            role: "mask",
            strength: 1,
            immutable: true,
            provenanceId: "prov-mask",
          },
        ],
      }).refinement.mode,
    ).toBe("local-mask");
  });
  it("rejects malformed executable topology before invoking paid tools", async () => {
    const valid = planVisualGeneration(
      task({ variants: { count: 1, parallelism: 1 } }),
      {
        generate: { currency: "USD", amount: 0.05 },
        edit: { currency: "USD", amount: 0.08 },
      },
    );
    const invoke = vi.fn();
    const deps = {
      store: createMemoryVisualExecutionStore(),
      append: vi.fn(),
      tools: { invoke },
      reviewer: { review: vi.fn() },
    };
    await expect(
      executeVisualGeneration(
        "run",
        { ...valid, nodes: [...valid.nodes, valid.nodes[0]] },
        deps,
      ),
    ).rejects.toThrow(/Duplicate visual node/);
    await expect(
      executeVisualGeneration(
        "run",
        {
          ...valid,
          nodes: valid.nodes.map((node) =>
            node.operation === "edit" ? { ...node, inputs: ["missing"] } : node,
          ),
        },
        deps,
      ),
    ).rejects.toThrow(/unknown input/);
    await expect(
      executeVisualGeneration(
        "run",
        {
          ...valid,
          nodes: valid.nodes.map((node) =>
            node.operation === "select"
              ? {
                  ...node,
                  inputs: [
                    valid.nodes.find((item) => item.operation === "edit")!.id,
                  ],
                }
              : node,
          ),
        },
        deps,
      ),
    ).rejects.toThrow(/cycle/);
    await expect(
      executeVisualGeneration(
        "run",
        {
          ...valid,
          nodes: [
            ...valid.nodes,
            {
              id: "decorative",
              operation: "generate" as const,
              inputs: [],
              variantIndex: 9,
            },
          ],
        },
        deps,
      ),
    ).rejects.toThrow(/generate count/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("visual generation executor", () => {
  it("fans out in bounded batches, preserves references, refines the winner and promotes only after review", async () => {
    const active: number[] = [];
    let inFlight = 0;
    let peak = 0;
    const invocations: VisualToolInvocation[] = [];
    const plan = planVisualGeneration(task(), {
      generate: { currency: "USD", amount: 0.05 },
      edit: { currency: "USD", amount: 0.08 },
    });
    const result = await executeVisualGeneration("run-1", plan, {
      store: createMemoryVisualExecutionStore(),
      append: vi.fn(),
      tools: {
        invoke: async (input) => {
          invocations.push(input);
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          active.push(inFlight);
          await Promise.resolve();
          inFlight -= 1;
          const c = candidate(input);
          return { candidate: c, receipt: receipt(input, c.artifactId) };
        },
      },
      reviewer: {
        review: async ({ gate, candidates }) => approve(gate, candidates),
      },
      now: () => 10,
    });
    expect(peak).toBe(2);
    expect(
      invocations.filter((item) => item.capability === "generate-image"),
    ).toHaveLength(4);
    expect(
      invocations.every((item) => item.references.includes("brand-master")),
    ).toBe(true);
    expect(invocations.at(-1)?.inputArtifactIds).toHaveLength(1);
    expect(result.promotion?.status).toBe("approved-master");
  });
  it("blocks dependent edit and promotion when variant review rejects", async () => {
    const invoke = vi.fn(async (input: VisualToolInvocation) => {
      const c = candidate(input);
      return { candidate: c, receipt: receipt(input, c.artifactId) };
    });
    await expect(
      executeVisualGeneration(
        "run-1",
        planVisualGeneration(task({ variants: { count: 2, parallelism: 2 } }), {
          generate: { currency: "USD", amount: 0.05 },
          edit: { currency: "USD", amount: 0.08 },
        }),
        {
          store: createMemoryVisualExecutionStore(),
          append: vi.fn(),
          tools: { invoke },
          reviewer: {
            review: async ({ gate }) => ({
              ...gate,
              status: "rejected",
              evidence: ["identity mismatch"],
              decidedAt: 4,
            }),
          },
        },
      ),
    ).rejects.toThrow(/did not approve/);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("retries with stable node identity, supports cancellation and caches only completed plans", async () => {
    const store = createMemoryVisualExecutionStore();
    let attempts = 0;
    const invoke = vi.fn(async (input: VisualToolInvocation) => {
      attempts += 1;
      if (attempts === 1) throw new Error("rate limited");
      const c = candidate(input);
      return { candidate: c, receipt: receipt(input, c.artifactId) };
    });
    const plan = planVisualGeneration(
      task({ variants: { count: 1, parallelism: 1 } }),
      {
        generate: { currency: "USD", amount: 0.05 },
        edit: { currency: "USD", amount: 0.08 },
      },
    );
    const deps = {
      store,
      append: vi.fn(),
      tools: { invoke },
      reviewer: {
        review: async ({
          gate,
          candidates,
        }: {
          gate: ReviewGate;
          candidates: readonly VariantCandidate[];
        }) => approve(gate, candidates),
      },
    };
    const first = await executeVisualGeneration("run-1", plan, deps);
    const second = await executeVisualGeneration("run-1", plan, deps);
    expect(invoke.mock.calls[0][0].requestId).toContain(":attempt:1");
    expect(invoke.mock.calls[1][0].requestId).toContain(":attempt:2");
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeVisualGeneration(
        "run-2",
        { ...plan, idempotencyKey: "new-key" },
        { ...deps, signal: controller.signal },
      ),
    ).rejects.toThrow(/cancelled/);
  });
  it("does not retry a rejected edit and uses one receipted regeneration fallback", async () => {
    const invocations: VisualToolInvocation[] = [];
    const plan = planVisualGeneration(
      task({ variants: { count: 1, parallelism: 1 } }),
      {
        generate: { currency: "USD", amount: 0.05 },
        edit: { currency: "USD", amount: 0.08 },
      },
    );
    const result = await executeVisualGeneration("run-compat", plan, {
      store: createMemoryVisualExecutionStore(),
      append: vi.fn(),
      tools: {
        invoke: async (input) => {
          invocations.push(input);
          if (input.capability === "edit-image")
            throw new Error("images/edits failed: HTTP 400");
          const c = candidate(input);
          return { candidate: c, receipt: receipt(input, c.artifactId) };
        },
      },
      reviewer: {
        review: async ({ gate, candidates }) => approve(gate, candidates),
      },
      now: () => 10,
    });
    expect(invocations.filter((item) => item.capability === "edit-image")).toHaveLength(1);
    expect(invocations.filter((item) => item.capability === "generate-image")).toHaveLength(2);
    expect(invocations.at(-1)?.nodeId).toContain("regenerate-fallback");
    expect(invocations.at(-1)?.inputArtifactIds).toHaveLength(1);
    expect(result.promotion?.status).toBe("approved-master");
  });
  it("persists successful paid attempts from a partially failed fan-out and reuses them on resume", async () => {
    const store = createMemoryVisualExecutionStore();
    const plan = planVisualGeneration(
      task({
        variants: { count: 2, parallelism: 2 },
        budget: {
          ceiling: { currency: "USD", amount: 1 },
          approvalPolicy: "auto-within-budget",
          maxAttemptsPerNode: 1,
        },
      }),
      {
        generate: { currency: "USD", amount: 0.05 },
        edit: { currency: "USD", amount: 0.08 },
      },
    );
    let failSecond = true;
    const invoke = vi.fn(async (input: VisualToolInvocation) => {
      if (input.nodeId.endsWith("variant:2") && failSecond)
        throw new Error("terminal provider failure");
      const c = candidate(input);
      return { candidate: c, receipt: receipt(input, c.artifactId) };
    });
    const deps = {
      store,
      append: vi.fn(),
      tools: { invoke },
      reviewer: {
        review: async ({
          gate,
          candidates,
        }: {
          gate: ReviewGate;
          candidates: readonly VariantCandidate[];
        }) => approve(gate, candidates),
      },
    };
    await expect(
      executeVisualGeneration("run-partial", plan, deps),
    ).rejects.toThrow(/terminal provider failure/);
    failSecond = false;
    await executeVisualGeneration("run-resume", plan, deps);
    expect(
      invoke.mock.calls.filter(([input]) => input.nodeId.endsWith("variant:1")),
    ).toHaveLength(1);
    expect(
      invoke.mock.calls.filter(([input]) => input.nodeId.endsWith("variant:2")),
    ).toHaveLength(2);
  });
  it("requires human approval before promoting protected brand seed material", async () => {
    const protectedTask = task({
      kind: "brand-logo-seed",
      variants: { count: 1, parallelism: 1 },
      publication: {
        intendedUse: "raster-seed",
        requiresHumanReview: true,
        requiresVectorization: true,
      },
    });
    const plan = planVisualGeneration(protectedTask, {
      generate: { currency: "USD", amount: 0.05 },
      edit: { currency: "USD", amount: 0.08 },
    });
    await expect(
      executeVisualGeneration("run-1", plan, {
        store: createMemoryVisualExecutionStore(),
        append: vi.fn(),
        tools: {
          invoke: async (input) => {
            const c = candidate(input);
            return { candidate: c, receipt: receipt(input, c.artifactId) };
          },
        },
        reviewer: {
          review: async ({ gate, candidates }) => approve(gate, candidates),
        },
      }),
    ).rejects.toThrow(/human review/);
  });
  it("rejects a plan whose aggregate estimate exceeds the approved ceiling before paid work", async () => {
    const invoke = vi.fn();
    const plan = planVisualGeneration(
      task({
        budget: {
          ceiling: { currency: "USD", amount: 0.01 },
          approvalPolicy: "auto-within-budget",
          maxAttemptsPerNode: 2,
        },
      }),
      {
        generate: { currency: "USD", amount: 0.05 },
        edit: { currency: "USD", amount: 0.08 },
      },
    );
    await expect(
      executeVisualGeneration("run-1", plan, {
        store: createMemoryVisualExecutionStore(),
        append: vi.fn(),
        tools: { invoke },
        reviewer: { review: vi.fn() },
      }),
    ).rejects.toThrow(/budget ceiling/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
