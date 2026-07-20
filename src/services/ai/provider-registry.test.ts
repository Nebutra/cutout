import { describe, expect, it } from "vitest";
import {
  createBuiltinProviderRegistry,
  ProviderDefinitionRegistry,
} from "./provider-registry";
describe("provider definition registry", () => {
  it("ships executable compatible profiles without overstating blocked providers", () => {
    const registry = createBuiltinProviderRegistry();
    for (const id of [
      "openai",
      "anthropic",
      "google",
      "openai-compatible",
      "gateway",
      "dashscope",
      "deepseek",
      "zhipu",
      "moonshot",
      "volcengine",
      "tencent-hunyuan",
      "minimax",
      "siliconflow",
      "openrouter",
      "together",
      "groq",
      "fireworks",
      "xai",
      "mistral",
      "ollama",
      "vllm",
      "lm-studio",
      "elevenlabs",
      "deepgram",
      "assemblyai",
      "replicate",
      "fal",
    ])
      expect(registry.definition(id)?.id).toBe(id);
    expect(
      registry.adaptersFor("openai").map((value) => value.capabilities),
    ).toEqual([
      expect.arrayContaining(["text", "image-generation", "image-edit"]),
    ]);
    expect(registry.adaptersFor("deepseek")).toEqual([
      expect.objectContaining({
        protocol: "openai-compatible",
        capabilities: ["text", "reasoning", "tools"],
      }),
    ]);
    expect(registry.adaptersFor("ollama")).toEqual([
      expect.objectContaining({
        protocol: "openai-compatible",
        capabilities: ["text", "vision", "tools"],
      }),
    ]);
    for (const blocked of [
      "tencent-hunyuan",
      "minimax",
      "elevenlabs",
      "replicate",
      "fal",
    ])
      expect(registry.adaptersFor(blocked)).toEqual([]);
  });
  it("supports dynamic registration and preserves unknown provider configs", () => {
    const registry = new ProviderDefinitionRegistry();
    registry.registerDefinition({
      id: "custom.vendor",
      label: "Custom",
      authMethods: ["oauth2"],
      configurableBaseUrl: true,
      adapterIds: [],
    });
    expect(registry.definition("custom.vendor")?.authMethods).toEqual([
      "oauth2",
    ]);
    expect(
      registry.parseConfig({
        id: "p",
        kind: "future-provider",
        label: "Future",
        defaultModel: "m",
        enabled: false,
      }),
    ).toMatchObject({ kind: "future-provider" });
    expect(() =>
      registry.registerDefinition({
        id: "custom.vendor",
        label: "Again",
        authMethods: ["api-key"],
      }),
    ).toThrow("already registered");
  });
});

describe("provider brand assets", () => {
  it("gives every builtin definition an auditable local icon reference", () => {
    const registry = createBuiltinProviderRegistry();
    for (const definition of registry.catalog()) {
      expect(definition.icon?.id).toMatch(/^(openai:logo|fal:logo|simple-icons:[a-z0-9-]+|cutout:(?:provider|gateway|compatible|local))$/);
      expect(definition.icon?.sourceUrl).toMatch(/^https:\/\//);
      expect(definition.icon?.license).toBeTruthy();
    }
  });
  it("uses verified brands where available and neutral Cutout marks otherwise", () => {
    const registry = createBuiltinProviderRegistry();
    expect(registry.definition("openai")?.icon).toMatchObject({
      id: "openai:logo",
      source: "openai",
      sourceUrl: "https://openai.com/brand/",
    });
    expect(registry.definition("openai")?.icon?.id).not.toBe("cutout:provider");
    expect(registry.definition("fal")?.icon).toMatchObject({
      id: "fal:logo",
      source: "fal",
      sourceUrl: "https://fal.ai",
      license: "fal.ai brand guidelines and trademark terms",
    });
    expect(registry.definition("fal")?.icon?.id).not.toBe("cutout:provider");
    expect(registry.definition("anthropic")?.icon).toMatchObject({
      id: "simple-icons:anthropic",
      source: "simple-icons",
      license: "CC0-1.0",
    });
    expect(registry.definition("groq")?.icon).toMatchObject({
      id: "cutout:provider",
      source: "cutout",
    });
    expect(registry.definition("gateway")?.icon?.id).toBe("cutout:gateway");
    expect(registry.definition("openai-compatible")?.icon?.id).toBe(
      "cutout:compatible",
    );
    expect(registry.definition('openai')?.openAIWireProtocols).toEqual(['responses', 'chat-completions'])
    expect(registry.definition('deepseek')?.openAIWireProtocols).toEqual(['chat-completions'])
    expect(registry.definition('openai-compatible')?.openAIWireProtocols).toEqual(['responses', 'chat-completions'])
    expect(registry.definition("ollama")?.icon?.id).toBe("simple-icons:ollama");
  });
});
