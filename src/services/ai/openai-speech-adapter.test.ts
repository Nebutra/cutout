// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "js-sha256";
import { speechRequestSchema } from "./speech-contract";
import { OpenAICompatibleSpeechAdapter } from "./openai-speech-adapter";
const hash = "a".repeat(64),
  at = () => new Date("2026-07-12T00:00:00.000Z");
describe("OpenAI-compatible speech adapter", () => {
  it("sends bounded multipart ASR and records a receipt", async () => {
    const fetch = vi.fn(async (request: Request) => {
        expect(request.url).toBe("http://mock/v1/audio/transcriptions");
        const form = await request.formData();
        expect(form.get("model")).toBe("whisper-1");
        expect(form.get("file")).toBeInstanceOf(Blob);
        return new Response(
          JSON.stringify({
            text: "hello",
            language: "en",
            segments: [{ start: 0, end: 1.25, text: "hello" }],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
      adapter = new OpenAICompatibleSpeechAdapter({
        providerId: "openai",
        baseUrl: "http://mock/v1",
        transport: { fetch },
        now: at,
      });
    const result = await adapter.execute(
      speechRequestSchema.parse({
        protocol: "cutout.speech-request.v1",
        requestId: "r",
        capability: "asr",
        providerId: "openai",
        model: "whisper-1",
        audio: {
          mediaType: "audio/wav",
          sha256: hash,
          bytes: new Uint8Array([1, 2]),
        },
      }),
    );
    expect(result.ok,result.ok?'':result.error).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        response: { text: "hello", segments: [{ startMs: 0, endMs: 1250 }] },
        receipt: { status: "succeeded", inputSha256: hash },
      },
    });
  });
  it("sends TTS JSON, hashes bytes and maps media format", async () => {
    const bytes = new Uint8Array([1, 2, 3]),
      fetch = vi.fn(async (request: Request) => {
        expect(await request.json()).toEqual({
          model: "tts-1",
          input: "hello",
          voice: "alloy",
          response_format: "mp3",
        });
        return new Response(bytes, {
          headers: { "content-type": "audio/mpeg" },
        });
      }),
      adapter = new OpenAICompatibleSpeechAdapter({
        providerId: "openai-compatible",
        baseUrl: "http://mock/v1/",
        transport: { fetch },
        now: at,
      });
    const result = await adapter.execute(
      speechRequestSchema.parse({
        protocol: "cutout.speech-request.v1",
        requestId: "r",
        capability: "tts",
        providerId: "openai-compatible",
        model: "tts-1",
        text: "hello",
        voice: "alloy",
        outputMediaType: "audio/mpeg",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        response: { audio: { sha256: sha256(bytes) } },
        receipt: { outputSha256: sha256(bytes) },
      },
    });
  });
  it("enforces cancellation, timeout, provider errors and response limits without paid calls", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const hanging = new OpenAICompatibleSpeechAdapter({
        providerId: "p",
        baseUrl: "http://mock",
        timeoutMs: 5,
        transport: {
          fetch: (_r, signal) =>
            new Promise((_resolve, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason)),
            ),
        },
      }),
      request = speechRequestSchema.parse({
        protocol: "cutout.speech-request.v1",
        requestId: "r",
        capability: "tts",
        providerId: "p",
        model: "m",
        text: "hello",
        voice: "v",
        outputMediaType: "audio/mpeg",
      });
    expect(await hanging.execute(request, cancelled.signal)).toEqual({
      ok: false,
      error: "Speech request cancelled.",
    });
    expect((await hanging.execute(request)).ok).toBe(false);
    const oversized = new OpenAICompatibleSpeechAdapter({
      providerId: "p",
      baseUrl: "http://mock",
      transport: {
        fetch: async () =>
          new Response(new Uint8Array([1]), {
            headers: { "content-length": String(101 * 1024 * 1024) },
          }),
      },
    });
    expect(await oversized.execute(request)).toEqual({
      ok: false,
      error: "Speech response exceeds size limit.",
    });
  });
});
