import { sha256 } from "js-sha256";
import { err, ok, type Result } from "@/services/types";
import {
  speechRequestSchema,
  speechResponseSchema,
  speechReceiptSchema,
  type SpeechAdapter,
  type SpeechReceipt,
  type SpeechRequest,
  type SpeechResponse,
} from "./speech-contract";
export interface AuthorizedSpeechTransport {
  fetch(input: Request, signal: AbortSignal): Promise<Response>;
}
export interface OpenAISpeechAdapterOptions {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly transport: AuthorizedSpeechTransport;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
export class OpenAICompatibleSpeechAdapter implements SpeechAdapter {
  readonly providerId: string;
  readonly capabilities = ["asr", "tts"] as const;
  readonly #base: string;
  readonly #transport: AuthorizedSpeechTransport;
  readonly #timeout: number;
  readonly #now: () => Date;
  constructor(options: OpenAISpeechAdapterOptions) {
    this.providerId = options.providerId;
    this.#base = options.baseUrl.replace(/\/$/, "");
    this.#transport = options.transport;
    this.#timeout = options.timeoutMs ?? 60_000;
    this.#now = options.now ?? (() => new Date());
  }
  async execute(
    raw: SpeechRequest,
    signal?: AbortSignal,
  ): Promise<Result<{ response: SpeechResponse; receipt: SpeechReceipt }>> {
    const parsed = speechRequestSchema.safeParse(raw);
    if (!parsed.success) return err("Invalid speech request.");
    const request = parsed.data,
      started = this.#now(),
      controller = new AbortController(),
      timeout = setTimeout(
        () => controller.abort(new Error("Speech request timed out.")),
        this.#timeout,
      ),
      abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted) controller.abort(signal.reason);
      if (controller.signal.aborted) throw controller.signal.reason;
      const response =
          request.capability === "asr"
            ? await this.#asr(request, controller.signal)
            : await this.#tts(request, controller.signal),
        completed = this.#now(),
        receipt = speechReceiptSchema.parse({
          protocol: "cutout.speech-receipt.v1",
          requestId: request.requestId,
          capability: request.capability,
          providerId: this.providerId,
          model: request.model,
          status: "succeeded",
          inputSha256:
            request.capability === "asr"
              ? request.audio.sha256
              : sha256(request.text),
          outputSha256:
            response.capability === "tts"
              ? response.audio.sha256
              : sha256(response.text),
          startedAt: started.toISOString(),
          completedAt: completed.toISOString(),
        });
      return ok({ response, receipt });
    } catch (error) {
      return err(
        controller.signal.aborted
          ? signal?.aborted
            ? "Speech request cancelled."
            : "Speech request timed out."
          : safeError(error),
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  async #asr(
    request: Extract<SpeechRequest, { capability: "asr" }>,
    signal: AbortSignal,
  ) {
    const body = new FormData();
    body.set("model", request.model);
    body.set("response_format", "verbose_json");
    if (request.language) body.set("language", request.language);
    body.set(
      "file",
      new Blob([request.audio.bytes as BlobPart], {
        type: request.audio.mediaType,
      }),
      "recording",
    );
    const response = await this.#transport.fetch(
      new Request(`${this.#base}/audio/transcriptions`, {
        method: "POST",
        body,
      }),
      signal,
    );
    await assertOk(response);
    const data = (await response.json()) as {
      text?: unknown;
      language?: unknown;
      segments?: unknown;
    };
    return speechResponseSchema.parse({
      protocol: "cutout.speech-response.v1",
      requestId: request.requestId,
      capability: "asr",
      text: data.text,
      ...(typeof data.language === "string" ? { language: data.language } : {}),
      segments: Array.isArray(data.segments)
        ? data.segments.map((item: any) => ({
            startMs: Math.round(Number(item.start) * 1000),
            endMs: Math.round(Number(item.end) * 1000),
            text: item.text,
          }))
        : [],
    });
  }
  async #tts(
    request: Extract<SpeechRequest, { capability: "tts" }>,
    signal: AbortSignal,
  ) {
    const format = mediaFormat(request.outputMediaType),
      response = await this.#transport.fetch(
        new Request(`${this.#base}/audio/speech`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: request.model,
            input: request.text,
            voice: request.voice,
            response_format: format,
          }),
        }),
        signal,
      );
    await assertOk(response);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_RESPONSE_BYTES)
      throw new Error("Speech response exceeds size limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_RESPONSE_BYTES)
      throw new Error("Speech response size is invalid.");
    return speechResponseSchema.parse({
      protocol: "cutout.speech-response.v1",
      requestId: request.requestId,
      capability: "tts",
      audio: {
        mediaType: request.outputMediaType,
        sha256: sha256(bytes),
        bytes,
      },
    });
  }
}
async function assertOk(response: Response) {
  if (response.ok) return;
  const text = (await response.text()).slice(0, 500);
  throw new Error(
    `Speech provider returned HTTP ${response.status}${text ? `: ${text}` : ""}`,
  );
}
function safeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Speech provider request failed.";
}
function mediaFormat(type: string) {
  const formats: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "opus",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/pcm": "pcm",
  };
  const value = formats[type];
  if (!value) throw new Error(`Unsupported speech output media type: ${type}`);
  return value;
}
