import { describe, expect, it, vi } from "vitest";
import type { DesktopToolLoop } from "@/agent-runtime/desktop-tool-loop";
import { createDesktopVisualToolInvoker } from "./desktop-tool-bridge";

describe("desktop visual tool bridge", () => {
  it("cancels the active desktop tool when its visual run is stopped", async () => {
    let finishRequest!: () => void;
    const request = vi.fn(
      () => new Promise<void>((resolve) => (finishRequest = resolve)),
    );
    const cancel = vi.fn(() => finishRequest());
    const loop: DesktopToolLoop = {
      request,
      cancel,
      settled: vi.fn(async () => ({
        ok: false as const,
        error: "Tool execution was cancelled.",
        events: [],
      })),
      approve: vi.fn(),
      deny: vi.fn(),
      retry: vi.fn(),
    };
    const controller = new AbortController();
    const invoker = createDesktopVisualToolInvoker({
      loop,
      expectedRevision: () => 1,
      resolveArtifact: vi.fn(),
    });
    const result = invoker.invoke({
      runId: "run:1",
      taskId: "task:1",
      nodeId: "edit:1",
      requestId: "request:1",
      capability: "edit-image",
      preferredModel: "image-model",
      allowCompatibleFallback: true,
      requiredCapabilities: ["image-edit"],
      prompt: "Refine the page",
      inputArtifactIds: ["artifact:1"],
      references: [],
      approvalPolicy: "auto",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    controller.abort();

    await expect(result).rejects.toThrow("cancelled");
    expect(cancel).toHaveBeenCalledWith(
      "visual-tool:task:1:edit:1",
      "request:1",
    );
  });

  it("keeps each BYOK request observable without a per-call confirmation", async () => {
    let requested: Parameters<DesktopToolLoop["request"]>[0] | undefined;
    const loop: DesktopToolLoop = {
      request: vi.fn(async (input) => { requested = input }),
      settled: vi.fn(async () => ({ ok: false as const, error: "stop", events: [] })),
      cancel: vi.fn(),
      approve: vi.fn(),
      deny: vi.fn(),
      retry: vi.fn(),
    };
    const invoker = createDesktopVisualToolInvoker({
      loop,
      expectedRevision: () => 1,
      resolveArtifact: vi.fn(),
    });

    await expect(invoker.invoke({
      runId: "run:1",
      taskId: "task:1",
      nodeId: "edit:1",
      requestId: "request:1",
      capability: "edit-image",
      preferredModel: "image-model",
      allowCompatibleFallback: true,
      requiredCapabilities: ["image-edit"],
      prompt: "Refine the page",
      inputArtifactIds: ["artifact:1"],
      references: [],
      approvalPolicy: "auto",
    })).rejects.toThrow("stop");

    expect(requested?.request).toMatchObject({
      approvalPolicy: "auto",
    });
  });
});
