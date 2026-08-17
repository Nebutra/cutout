import { afterEach, describe, expect, it, vi } from "vitest";
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
import { DESKTOP_IMAGE_TOOL_TIMEOUT_MS } from './provider-tool-timeouts'
import { tauriBridge } from '@/platform/native'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const capability = {
  capability: "generate-image" as const,
  providerId: "p",
  model: "m",
  available: true,
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
      prompt: "Render the approved hero.",
      inputArtifactIds: [],
      approvalPolicy: "auto",
    },
    ...overrides,
  };
}

function harness(
  result?: Awaited<ReturnType<ToolExecutor["execute"]>>,
  options: {
    timeoutMs?: Parameters<typeof createDesktopToolLoop>[0]["timeoutMs"];
    durability?: ToolDurabilityStore;
    authorize?: Parameters<typeof createDesktopToolLoop>[0]["authorize"];
  } = {},
) {
  const batches: AgentRunEvent[][] = [];
  const execute = vi.fn(
    async (execution) => {
      execution.onStarted?.({
        eventId: `event:${execution.requestId}:tool-started`,
        runId: execution.runId,
        at: 2,
        type: "tool-started",
        toolCallId: execution.toolCallId,
        tool: execution.request.capability,
        label: execution.label,
      });
      return result ?? {
        ok: true as const,
        receipt: {
          receiptId: "receipt",
          requestId: execution.requestId,
          capability: "generate-image" as const,
          providerId: "p",
          model: "m",
          status: "succeeded" as const,
                    outputArtifactIds: ["artifact"],
          startedAt: 2,
          completedAt: 3,
        },
        events: [],
      };
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
    policy: () => ({ allowProviderExecution: true }),
    append: (events) => batches.push([...events]),
    now: () => 1,
    id: () => `retry-${++nextId}`,
    timeoutMs: options.timeoutMs,
    durability: options.durability,
    authorize: options.authorize,
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
  it("issues request-bound authority only after a real approval event", async () => {
    const authorize = vi.fn(async (request, approvalId) => ({
      capabilityLeaseId: `lease:${request.requestId}`,
      requestDigest: `digest:${request.requestId}:${approvalId}`,
    }));
    const h = harness(undefined, { authorize });
    await h.loop.request(
      input({ request: { ...input().request, approvalPolicy: "explicit" } }),
    );
    expect(authorize).not.toHaveBeenCalled();

    await h.loop.approve("tool", "request");
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request" }),
      "event:request:tool-approved",
    );
    expect(h.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityLeaseId: "lease:request",
        requestDigest: "digest:request:event:request:tool-approved",
      }),
    );
  });

  it("waits for explicit approval and executes once", async () => {
    const h = harness();
    await h.loop.request(
      input({ request: { ...input().request, approvalPolicy: "explicit" } }),
    );
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.batches.flat().map((e) => e.type)).toEqual([
      "tool-approval-requested",
    ]);
    expect(h.batches.flat()[0]).toMatchObject({
      type: "tool-approval-requested",
      approvalPolicy: "explicit",
    });
    await h.loop.approve("tool", "request");
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.batches.flat().map((event) => event.type)).toContain("tool-started");
    expect(h.batches.flat().map((e) => e.type)).toContain(
      "tool-receipt-recorded",
    );
  });

  it("publishes execution start only after approval and before the executor settles", async () => {
    let settle!: (value: Awaited<ReturnType<ToolExecutor["execute"]>>) => void;
    const pending = new Promise<Awaited<ReturnType<ToolExecutor["execute"]>>>((resolve) => {
      settle = resolve;
    });
    const h = harness();
    h.execute.mockImplementation(async (execution) => {
      execution.onStarted?.({
        eventId: `event:${execution.requestId}:tool-started`,
        runId: execution.runId,
        at: 2,
        type: "tool-started",
        toolCallId: execution.toolCallId,
        tool: execution.request.capability,
        label: execution.label,
      });
      return pending;
    });

    await h.loop.request(input({ request: { ...input().request, approvalPolicy: "explicit" } }));
    expect(h.batches.flat().map((event) => event.type)).toEqual(["tool-approval-requested"]);

    const approval = h.loop.approve("tool", "request");
    await vi.waitFor(() => expect(h.batches.flat().map((event) => event.type)).toEqual([
      "tool-approval-requested",
      "tool-approved",
      "tool-started",
    ]));
    settle({
      ok: true,
      receipt: {
        receiptId: "receipt",
        requestId: "request",
        capability: "generate-image",
        providerId: "p",
        model: "m",
        status: "succeeded",
                outputArtifactIds: ["artifact"],
        startedAt: 2,
        completedAt: 3,
      },
      events: [],
    });
    await approval;
  });

  it("executes BYOK directly and is idempotent by request id", async () => {
    const h = harness();
    await h.loop.request(input());
    await h.loop.request(input());
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.batches.flat().map((e) => e.type)).toEqual([
      "tool-approval-requested",
      "tool-approved",
      "tool-started",
      "tool-succeeded",
      "tool-receipt-recorded",
    ]);
  });

  it("fails a missing BYOK capability without inventing a pending approval", async () => {
    const h = harness();
    await h.loop.request(input({
      request: { ...input().request, providerId: "missing" },
    }));

    await expect(h.loop.settled("tool", "request")).resolves.toMatchObject({
      ok: false,
      error: "No host executor is available for this capability.",
    });
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.batches.flat()).toContainEqual(expect.objectContaining({
      type: "tool-approval-requested",
      pendingApproval: false,
    }));
  });

  it("fails a colliding tool call without replacing the pending request", async () => {
    const h = harness();
    const explicit = {
      ...input().request,
      approvalPolicy: "explicit" as const,
    };
    await h.loop.request(input({ request: explicit }));
    await h.loop.request(input({ requestId: "request-2", request: explicit }));

    await expect(h.loop.settled("tool", "request-2")).resolves.toMatchObject({
      ok: false,
      error: "The tool call is unavailable.",
    });
    expect(h.batches.flat()).toContainEqual(expect.objectContaining({
      type: "tool-failed",
      detail: "Tool call tool is already bound to another request.",
    }));

    await h.loop.approve("tool", "request");
    await expect(h.loop.settled("tool", "request")).resolves.toMatchObject({
      ok: true,
      receipt: { requestId: "request" },
    });
    expect(h.execute).toHaveBeenCalledOnce();
  });

  it('does not execute the Provider again after a durable successful request', async () => {
    const durability = createMemoryToolDurabilityStore()
    const first = harness(undefined, { durability })
    await first.loop.request(input())
    expect(first.execute).toHaveBeenCalledOnce()
    const restarted = harness(undefined, { durability })
    await restarted.loop.request(input())
    expect(restarted.execute).not.toHaveBeenCalled()
    expect(await restarted.loop.settled('tool', 'request')).toMatchObject({ ok: true, receipt: { receiptId: 'receipt', } })
  })

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

  it("propagates the owning run signal through approval and execution", async () => {
    const waitingController = new AbortController();
    const waiting = harness();
    await waiting.loop.request(input({
      signal: waitingController.signal,
      request: { ...input().request, approvalPolicy: "explicit" },
    }));
    waitingController.abort();
    await expect(waiting.loop.settled("tool", "request")).resolves.toMatchObject({
      ok: false,
      error: "Cancelled by user.",
    });
    expect(waiting.execute).not.toHaveBeenCalled();

    const runningController = new AbortController();
    const running = harness();
    running.execute.mockImplementation(async (execution) => {
      await new Promise<void>((resolve) =>
        execution.signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
      return { ok: false, error: "cancelled", events: [] };
    });
    const run = running.loop.request(input({ signal: runningController.signal }));
    await vi.waitFor(() => expect(running.execute).toHaveBeenCalledOnce());
    runningController.abort();
    await run;
    expect(running.execute.mock.calls[0]?.[0].signal?.aborted).toBe(true);
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
    expect(h.execute).toHaveBeenCalledTimes(2);
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

  it("discards stale provider results after execution and records the Provider receipt", async () => {
    const h = harness();
    h.execute.mockImplementation(async (execution) => {
      h.setRevision(4);
      return {
        ok: true,
        receipt: {
          receiptId: "provider",
          requestId: execution.requestId,
          capability: "generate-image",
          providerId: "p",
          model: "m",
          status: "succeeded",
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

  it("rejects mismatched receipts and enforces a provider deadline", async () => {
    const mismatched = harness({
      ok: true,
      receipt: {
        receiptId: "bad",
        requestId: "other",
        capability: "generate-image",
        providerId: "p",
        model: "m",
        status: "succeeded",
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
    const timed = harness(undefined, { timeoutMs: 1 });
    timed.execute.mockImplementation(async () => new Promise(() => undefined));
    await timed.loop.request(input());
    expect(await timed.loop.settled("tool")).toMatchObject({
      ok: false,
      error: "Provider deadline exceeded.",
    });
  });

  it("resolves the deadline from the current Provider capability", async () => {
    const timeoutMs = vi.fn(() => 1);
    const timed = harness(undefined, { timeoutMs });
    timed.execute.mockImplementation(async () => new Promise(() => undefined));

    await timed.loop.request(input());

    expect(await timed.loop.settled("tool")).toMatchObject({
      ok: false,
      error: "Provider deadline exceeded.",
    });
    expect(timeoutMs).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ capability: "generate-image" }),
      }),
    );
  });

  it("aborts the desktop image executor from the native deadline when renderer timers stop", async () => {
    let settleNative!: () => void;
    const native = new Promise<void>((resolve) => {
      settleNative = resolve;
    });
    const waitForMonotonicDeadline = vi
      .spyOn(tauriBridge, "waitForMonotonicDeadline")
      .mockReturnValue(native);
    vi.spyOn(tauriBridge, "cancelMonotonicDeadline").mockResolvedValue(undefined);
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke: vi.fn() });
    vi.spyOn(globalThis, "setTimeout").mockImplementation(() => 0 as never);

    let executorStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      executorStarted = resolve;
    });
    let executorAborted = false;
    const timed = harness(undefined, { timeoutMs: DESKTOP_IMAGE_TOOL_TIMEOUT_MS });
    timed.execute.mockImplementation(
      async (execution) =>
        new Promise((resolve) => {
          executorStarted();
          execution.signal.addEventListener(
            "abort",
            () => {
              executorAborted = true;
              resolve({ ok: false, error: "aborted", events: [] });
            },
            { once: true },
          );
        }),
    );

    const request = timed.loop.request(input());
    await started;
    settleNative();
    await request;

    expect(executorAborted).toBe(true);
    expect(await timed.loop.settled("tool")).toMatchObject({
      ok: false,
      error: "Provider deadline exceeded.",
    });
    expect(waitForMonotonicDeadline).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      DESKTOP_IMAGE_TOOL_TIMEOUT_MS,
    );
    expect(globalThis.setTimeout).not.toHaveBeenCalled();
  });
});
