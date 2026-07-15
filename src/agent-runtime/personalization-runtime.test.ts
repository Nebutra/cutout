import { describe, expect, it, vi } from "vitest";
import { defaultPersonalizationSettings } from "@/personalization";
import {
  createPersonalizationRuntimeContext,
  personalizeGenerationService,
} from "./personalization-runtime";
describe("personalization runtime", () => {
  it("injects tone/instructions as structured system context without leaking them to receipt", async () => {
    const secret = "Prefer terse executive summaries.",
      context = await createPersonalizationRuntimeContext({
        ...defaultPersonalizationSettings,
        personality: "custom",
        customInstructions: secret,
      });
    expect(context.systemContext).toContain(
      `<custom_instructions>${secret}</custom_instructions>`,
    );
    expect(JSON.stringify(context.receipt)).not.toContain(secret);
    expect(context.receipt).toMatchObject({
      policyVersion: 1,
      customInstructions: true,
      memoryEnabled: false,
    });
  });
  it("keeps memory off by default and includes only bounded summaries when enabled", async () => {
    const read = vi.fn(async () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: `m${i}`,
        summary: "x".repeat(700),
        sourceRef: `ref.${i}`,
      })),
    );
    expect(
      (
        await createPersonalizationRuntimeContext(
          defaultPersonalizationSettings,
          { read },
        )
      ).systemContext,
    ).toBe("");
    expect(read).not.toHaveBeenCalled();
    const context = await createPersonalizationRuntimeContext(
      { ...defaultPersonalizationSettings, memoryEnabled: true },
      { read },
    );
    expect(context.systemContext.match(/<memory id=/g) ?? []).toHaveLength(8);
    expect(context.systemContext).not.toContain("x".repeat(501));
    expect(context.receipt).toMatchObject({
      memoryEnabled: true,
      memoryIncluded: true,
      toolAssistedMemory: false,
    });
  });
  it("requires separate tool-memory permission and reset context injects nothing", async () => {
    expect(
      (
        await createPersonalizationRuntimeContext({
          ...defaultPersonalizationSettings,
          memoryEnabled: true,
          toolAssistedMemory: true,
        })
      ).receipt.toolAssistedMemory,
    ).toBe(true);
    expect(
      (
        await createPersonalizationRuntimeContext(
          defaultPersonalizationSettings,
        )
      ).receipt.toolAssistedMemory,
    ).toBe(false);
  });
  it("adds context through systemContext, never user prompt text, and tools receive flags only", async () => {
    const generateText = vi.fn(async (_input: Record<string, unknown>) => ({ ok: true as const, data: "ok" })),
      generateWithTools = vi.fn(async (_input: Record<string, unknown>) => ({
        ok: true as const,
        data: { text: "ok", toolCalls: [] },
      })),
      base: any = {
        generateText,
        streamText: vi.fn(),
        generateImages: vi.fn(),
        editImage: vi.fn(),
        research: vi.fn(),
        generateObject: vi.fn(),
        generateWithTools,
      },
      context = await createPersonalizationRuntimeContext({
        ...defaultPersonalizationSettings,
        personality: "direct",
        customInstructions: "Private instruction",
      }),
      service = personalizeGenerationService(base, context);
    await service.generateText({ providerId: "p", prompt: "user request" });
    expect(generateText).toHaveBeenCalledWith({
      providerId: "p",
      prompt: "user request",
      systemContext: expect.stringContaining("<tone>direct</tone>"),
    });
    await service.generateWithTools({
      providerId: "p",
      prompt: "tool request",
      tools: [],
      maxSteps: 1,
    });
    const toolInput = generateWithTools.mock.calls[0][0];
    expect(toolInput.personalizationReceipt).toEqual(context.receipt);
    expect(JSON.stringify(toolInput.personalizationReceipt)).not.toContain(
      "Private instruction",
    );
  });
});
