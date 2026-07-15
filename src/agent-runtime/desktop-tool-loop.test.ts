import { describe, expect, it, vi } from "vitest";
import {
  createDesktopToolLoop,
  type DesktopToolLoopRequest,
} from "./desktop-tool-loop";
import type { AgentRunEvent } from "./run-events";
import { createMemoryToolDurabilityStore, type ToolDurabilityStore } from './tool-durability'
import type {
  ToolExecutor,
  ToolExecutorRegistry,
} from "@/services/desktop-tool-executor";

const capability = {
  capability: "generate-image" as const,
  providerId: "p",
  model: "m",
  available: true,
  estimatedCost: { currency: "USD", amount: 0.08 },
};

function input(
  overrides: Partial<DesktopToolLoopRequest> = {},
): DesktopToolLoopRequest {
  return {
    runId: "run",
    toolCallId: "tool",
    requestId: "request",
    label: "Generate",
    expectedRevision: 3,
    request: {
      capability: "generate-image",
      providerId: "p",
      model: "m",
      intent: "hero",
      inputArtifactIds: [],
      budgetCeiling: { currency: "USD", amount: 0.2 },
      approvalPolicy: "auto-within-budget",
    },
    ...overrides,
  };
}

function harness(
  result?: Awaited<ReturnType<ToolExecutor["execute"]>>,
  options: { timeoutMs?: number; durability?: ToolDurabilityStore } = {},
) {
  const batches: AgentRunEvent[][] = [];
  const execute = vi.fn(
    async (execution) =>
      result ?? {
        ok: true as const,
        receipt: {
          receiptId: "receipt",
          requestId: execution.requestId,
          capability: "generate-image" as const,
          providerId: "p",
          model: "m",
          status: "succeeded" as const,
          charged: { currency: "USD", amount: 0.08 },
          outputArtifactIds: ["artifact"],
          startedAt: 2,
          completedAt: 3,
        },
        events: [],
      },
  );
  const executor: ToolExecutor = {
    capabilities: async () => [capability],
    execute,
  };
  const registry: ToolExecutorRegistry = {
    executor: async () => executor,
    execute,
  };
  let revision = 3;
  let nextId = 0;
  const loop = createDesktopToolLoop({
    executors: registry,
    currentRevision: () => revision,
    policy: () => ({ allowPaid: true }),
    append: (events) => batches.push([...events]),
    now: () => 1,
    id: () => `retry-${++nextId}`,
    timeoutMs: options.timeoutMs,
    durability: options.durability,
  });
  return {
    loop,
    batches,
    execute,
    setRevision: (value: number) => {
      revision = value;
    },
  };
}

describe("desktop tool loop", () => {
  it("waits for explicit approval and executes once", async () => {
    const h = harness();
    await h.loop.request(
      input({ request: { ...input().request, approvalPolicy: "explicit" } }),
    );
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.batches.flat().map((e) => e.type)).toEqual([
      "tool-approval-requested",
    ]);
    await h.loop.approve("tool", "request");
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.batches.flat().map((e) => e.type)).toContain(
      "tool-receipt-recorded",
    );
  });

  it("auto approves within budget and is idempotent by request id", async () => {
    const h = harness();
    await h.loop.request(input());
    await h.loop.request(input());
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.batches.flat().map((e) => e.type)).toEqual([
      "tool-approval-requested",
      "tool-approved",
      "tool-succeeded",
      "tool-receipt-recorded",
    ]);
  });

  it('does not execute or charge again after a durable successful request', async () => {
    const durability = createMemoryToolDurabilityStore()
    const first = harness(undefined, { durability })
    await first.loop.request(input())
    expect(first.execute).toHaveBeenCalledOnce()
    const restarted = harness(undefined, { durability })
    await restarted.loop.request(input())
    expect(restarted.execute).not.toHaveBeenCalled()
    expect(await restarted.loop.settled('tool', 'request')).toMatchObject({ ok: true, receipt: { receiptId: 'receipt', charged: { amount: 0.08 } } })
  })

  it("does not execute over budget even after an invalid approval", async () => {
    const h = harness();
    await h.loop.request(
      input({
        request: {
          ...input().request,
          budgetCeiling: { currency: "USD", amount: 0.01 },
        },
      }),
    );
    expect(h.execute).not.toHaveBeenCalled();
    await h.loop.approve("tool", "request");
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.batches.flat().at(-1)).toMatchObject({
      type: "tool-failed",
      detail: expect.stringContaining("budget"),
    });
  });

  it("cancels a running executor cooperatively", async () => {
    let resolve!: (value: never) => void;
    const pending = new Promise<never>((done) => {
      resolve = done;
    });
    const h = harness();
    h.execute.mockImplementation(async (execution) => {
      await Promise.race([
        pending,
        new Promise((done) =>
          execution.signal?.addEventListener("abort", done),
        ),
      ]);
      return { ok: false, error: "cancelled", events: [] };
    });
    const run = h.loop.request(input());
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalledOnce());
    h.loop.cancel("tool", "request");
    await run;
    expect(h.execute.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    resolve(undefined as never);
  });

  it("records failure, retries with a new linked id, and rejects stale revisions", async () => {
    const failed = {
      ok: false as const,
      error: "boom",
      events: [] as AgentRunEvent[],
    };
    const h = harness(failed);
    await h.loop.request(input());
    expect(h.batches.flat().some((event) => event.type === "tool-failed")).toBe(
      true,
    );
    const retryId = await h.loop.retry("tool", "request");
    expect(retryId).toBe("retry-1");
    expect(
      h.batches.flat().find((e) => e.type === "tool-retry-linked"),
    ).toMatchObject({ previousRequestId: "request", requestId: "retry-1" });
    h.setRevision(4);
    await h.loop.request(input({ toolCallId: "stale", requestId: "stale" }));
    expect(h.batches.flat().at(-1)).toMatchObject({
      type: "tool-failed",
      detail: expect.stringContaining("Expected revision 3"),
    });
  });

  it("never serializes secrets into observable events", async () => {
    const h = harness();
    await h.loop.request(input());
    expect(JSON.stringify(h.batches)).not.toMatch(/apiKey|Bearer|sk-/i);
  });

  it("discards stale provider results after execution and records the paid receipt", async () => {
    const h = harness();
    h.execute.mockImplementation(async (execution) => {
      h.setRevision(4);
      return {
        ok: true,
        receipt: {
          receiptId: "paid",
          requestId: execution.requestId,
          capability: "generate-image",
          providerId: "p",
          model: "m",
          status: "succeeded",
          charged: { currency: "USD", amount: 0.08 },
          outputArtifactIds: ["stale-artifact"],
          startedAt: 1,
          completedAt: 2,
        },
        events: [],
      };
    });
    await h.loop.request(input());
    expect((await h.loop.settled("tool", "request")).ok).toBe(false);
    expect(
      h.batches.flat().some((event) => event.type === "tool-receipt-recorded"),
    ).toBe(true);
    expect(
      h.batches.flat().some((event) => event.type === "tool-succeeded"),
    ).toBe(false);
  });

  it("rejects mismatched or over-budget receipts and enforces a provider deadline", async () => {
    const mismatched = harness({
      ok: true,
      receipt: {
        receiptId: "bad",
        requestId: "other",
        capability: "generate-image",
        providerId: "p",
        model: "m",
        status: "succeeded",
        charged: { currency: "USD", amount: 0.08 },
        outputArtifactIds: [],
        startedAt: 1,
        completedAt: 2,
      },
      events: [],
    });
    await mismatched.loop.request(input());
    expect(await mismatched.loop.settled("tool")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/different request/),
    });
    const over = harness({
      ok: true,
      receipt: {
        receiptId: "over",
        requestId: "request",
        capability: "generate-image",
        providerId: "p",
        model: "m",
        status: "succeeded",
        charged: { currency: "USD", amount: 1 },
        outputArtifactIds: [],
        startedAt: 1,
        completedAt: 2,
      },
      events: [],
    });
    await over.loop.request(input());
    expect(await over.loop.settled("tool")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/budget ceiling/),
    });
    const timed = harness(undefined, { timeoutMs: 1 });
    timed.execute.mockImplementation(async () => new Promise(() => undefined));
    await timed.loop.request(input());
    expect(await timed.loop.settled("tool")).toMatchObject({
      ok: false,
      error: "Provider deadline exceeded.",
    });
  });
});
