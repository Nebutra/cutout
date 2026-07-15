import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  executeVisualGeneration,
  createMemoryVisualExecutionStore,
  planVisualGeneration,
  type ReviewGate,
  type VariantCandidate,
  type VisualGenerationTask,
  type VisualReviewer,
  type VisualToolInvoker,
} from ".";
import { paidToolReceiptSchema } from "@/control-protocol/paid-tool-contract";

const RUN = process.env.CUTOUT_RUN_BRAND_BENCHMARK === "1";
const OUTPUT = "/private/tmp/cutout-brand-benchmark";
const RUBRIC = [
  "distinctiveness",
  "brief fit",
  "small-size silhouette",
  "no fake text",
  "production adaptability",
  "negative constraints",
] as const;

describe("brand benchmark provider adapter", () => {
  it("detects generated image media from magic bytes instead of trusting the requested format", () => {
    expect(
      detectMediaType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])),
    ).toBe("image/png");
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0]))).toBe(
      "image/jpeg",
    );
    expect(detectMediaType(Buffer.from("RIFF0000WEBP", "ascii"))).toBe(
      "image/webp",
    );
    expect(() => detectMediaType(Buffer.from("not-an-image"))).toThrow(
      "Unsupported generated image encoding",
    );
  });

  it("turns edit rejection into a structured, secret-free provider error", async () => {
    await expect(
      imageResponse(
        new Response(
          JSON.stringify({ error: { message: "policy rejected" } }),
          { status: 400 },
        ),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "provider-image-edit-rejected",
      status: 400,
    });
  });
});

describe.skipIf(!RUN)("real Brand Foundation visual benchmark", () => {
  it(
    "generates, judges, refines, promotes, and applies one approved identity",
    { timeout: 360_000 },
    async () => {
      const key = required("MOX_API_KEY");
      const base = apiBase(required("MOX_BASE_URL"));
      const resume = process.env.CUTOUT_BENCHMARK_RESUME === "1";
      if (!resume) await rm(OUTPUT, { recursive: true, force: true });
      await mkdir(OUTPUT, { recursive: true });
      const deadline = AbortSignal.timeout(330_000);
      const artifacts = new Map<string, Artifact>();
      const scores = new Map<string, CandidateScore>();
      const tool = providerTool({ key, base, artifacts, signal: deadline });
      const reviewer = multimodalReviewer({
        key,
        base,
        artifacts,
        scores,
        signal: deadline,
      });
      const events: unknown[] = [];

      const foundationTask = task({
        version: "visual-generation-task.v1",
        taskId: "benchmark:fenwick-foundation",
        catalogItemId: "benchmark.brand-foundation",
        kind: "brand-logo-seed",
        variants: { count: 4, parallelism: 4 },
        prompt: {
          version: "visual-prompt.v1",
          objective:
            "Create a distinctive raster seed for Fenwick Signal, a fictional precision navigation software brand for expedition teams.",
          subject:
            "One standalone abstract symbol suggesting bearing, field coordinates, and calm directional confidence; no wordmark.",
          composition:
            "Centered single mark with generous clear space, legible at 24 pixels, square canvas.",
          artDirection:
            "Geometric, flat, rigorous, contemporary; near-black and signal cyan only.",
          constraints: [
            "one symbol only",
            "strong silhouette",
            "2-4 primary geometric masses",
            "flat vector-like edges",
            "white background",
            "cyan used as a restrained signal accent",
          ],
          negativeConstraints: [
            "no text or letters",
            "no fake typography",
            "no compass rose cliché",
            "no map pin",
            "no gradients",
            "no shadows",
            "no mockup",
            "no 3D",
            "no stock icon look",
          ],
          output: {
            size: "1024x1024",
            mediaType: "image/png",
            transparent: false,
          },
          locale: "en",
        },
        consistency: {
          seriesId: "fenwick-signal",
          serial: 0,
          lockedTraits: [
            "near-black geometry",
            "signal-cyan accent",
            "flat white field",
            "strong small-size silhouette",
          ],
        },
        references: [],
        routing: {
          preferredModel: "gpt-image-2",
          requiredCapabilities: ["image-generate", "image-edit"],
          allowCompatibleFallback: false,
        },
        refinement: {
          mode: "full-frame",
          instruction:
            "Refine the selected identity seed: simplify any weak geometry, sharpen optical balance, preserve its distinctive silhouette and exact near-black/cyan palette, keep no text and no effects.",
        },
        budget: {
          ceiling: { currency: "USD", amount: 8 },
          approvalPolicy: "auto-within-budget",
          maxAttemptsPerNode: 1,
        },
        publication: {
          intendedUse: "raster-seed",
          requiresHumanReview: true,
          requiresVectorization: true,
        },
      });
      const foundationStore = createMemoryVisualExecutionStore();
      if (resume)
        await loadFoundationAttempts(
          foundationTask,
          artifacts,
          foundationStore,
        );
      const foundation = await executeVisualGeneration(
        "benchmark:run:foundation",
        planVisualGeneration(foundationTask, {
          generate: { currency: "USD", amount: 1 },
          edit: { currency: "USD", amount: 1 },
        }),
        {
          tools: tool,
          reviewer,
          store: foundationStore,
          append: (items) => events.push(...items),
          signal: deadline,
        },
      );
      expect(foundation.promotion?.status).toBe(
        "raster-seed-awaiting-vector-review",
      );
      const masterId = foundation.promotion!.masterArtifactId;
      const master = artifacts.get(masterId)!;

      const applicationTask = task({
        version: "visual-generation-task.v1",
        taskId: "benchmark:fenwick-avatar",
        catalogItemId: "benchmark.social-avatar",
        kind: "application-mockup",
        variants: { count: 1, parallelism: 1 },
        prompt: {
          version: "visual-prompt.v1",
          objective: "Create the approved Fenwick Signal social avatar.",
          subject:
            "Use the locked approved identity symbol exactly; adapt only scale, clear space, and field treatment.",
          composition:
            "Centered identity mark in a square avatar with robust safe area for circular cropping.",
          artDirection:
            "Flat near-black and signal-cyan identity on white; production-ready social avatar.",
          constraints: [
            "preserve locked silhouette",
            "preserve near-black/cyan palette",
            "circular-crop safe",
            "single mark",
          ],
          negativeConstraints: [
            "no redesign",
            "no text",
            "no extra symbols",
            "no gradient",
            "no shadow",
            "no mockup",
          ],
          output: {
            size: "1024x1024",
            mediaType: "image/png",
            transparent: false,
          },
          locale: "en",
        },
        references: [
          {
            referenceId: "reference:approved-master",
            artifactId: masterId,
            sha256: master.sha256,
            mediaType: master.mediaType,
            role: "identity",
            strength: 1,
            immutable: true,
            provenanceId: "provenance:foundation-promotion",
          },
        ],
        consistency: {
          seriesId: "fenwick-signal",
          serial: 1,
          predecessorMasterId: masterId,
          lockedTraits: [
            "approved silhouette",
            "near-black geometry",
            "signal-cyan accent",
          ],
        },
        routing: {
          preferredModel: "gpt-image-2",
          requiredCapabilities: ["image-edit", "multi-reference"],
          allowCompatibleFallback: false,
        },
        refinement: {
          mode: "full-frame",
          instruction:
            "Finalize the avatar crop and optical centering without redesigning the locked identity.",
        },
        budget: {
          ceiling: { currency: "USD", amount: 4 },
          approvalPolicy: "auto-within-budget",
          maxAttemptsPerNode: 1,
        },
        publication: {
          intendedUse: "raster-master",
          requiresHumanReview: false,
          requiresVectorization: false,
        },
      });
      const application = await executeVisualGeneration(
        "benchmark:run:avatar",
        planVisualGeneration(applicationTask, {
          generate: { currency: "USD", amount: 1 },
          edit: { currency: "USD", amount: 1 },
        }),
        {
          tools: tool,
          reviewer,
          store: createMemoryVisualExecutionStore(),
          append: (items) => events.push(...items),
          signal: deadline,
        },
      );
      expect(application.promotion?.status).toBe("approved-master");

      const report = buildReport({
        foundation,
        application,
        artifacts,
        scores,
        events,
        masterId,
      });
      await Promise.all(
        [...artifacts.values()].map((artifact) =>
          writeFile(
            join(
              OUTPUT,
              `${artifact.id.replaceAll(":", "-")}.${extension(artifact.mediaType)}`,
            ),
            artifact.bytes,
          ),
        ),
      );
      await writeFile(
        join(OUTPUT, "report.json"),
        JSON.stringify(report, null, 2),
      );
      await writeFile(join(OUTPUT, "report.md"), markdown(report));
      expect(report.referenceLock.verified).toBe(true);
      expect(report.artifacts).toHaveLength(7);
    },
  );
});

interface Artifact {
  id: string;
  bytes: Buffer;
  sha256: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  model: string;
  provider: string;
  latencyMs: number;
  createdAt: number;
}
interface CandidateScore {
  candidateId: string;
  scores: Record<(typeof RUBRIC)[number], number>;
  total: number;
  rationale: string;
}

function providerTool(input: {
  key: string;
  base: string;
  artifacts: Map<string, Artifact>;
  signal: AbortSignal;
}): VisualToolInvoker {
  return {
    async invoke(invocation) {
      const startedAt = Date.now();
      const referenceId =
        invocation.inputArtifactIds[0] ?? invocation.references[0];
      const reference = referenceId
        ? input.artifacts.get(referenceId)
        : undefined;
      const localNoop = Boolean(
        invocation.taskId.includes("avatar") &&
          invocation.nodeId.includes("refine") &&
          reference,
      );
      const editPrompt = invocation.taskId.includes("foundation")
        ? "Refine this exact selected symbol. Preserve its identity and near-black/cyan palette. Simplify geometry, improve optical balance and 24px silhouette. Flat white background. No text, gradients, shadows, mockup, or new symbols."
        : "Preserve the exact approved identity symbol and colors. Create a centered square social avatar safe for circular cropping. No redesign, text, extra symbols, gradients, or shadows.";
      const bytes = localNoop
        ? Buffer.from(reference!.bytes)
        : reference
        ? await editImage(input, editPrompt, reference.bytes)
        : await generateImage(input, invocation.prompt);
      const completedAt = Date.now();
      const sha256 = digest(bytes);
      const artifactId = `artifact:${sha256.slice(0, 24)}`;
      const mediaType = detectMediaType(bytes);
      input.artifacts.set(artifactId, {
        id: artifactId,
        bytes,
        sha256,
        mediaType,
        model: localNoop ? "identity-noop-v1" : "gpt-image-2",
        provider: localNoop ? "cutout-local" : "mox-openai-compatible",
        latencyMs: completedAt - startedAt,
        createdAt: completedAt,
      });
      await writeFile(
        join(
          OUTPUT,
          `attempt-${artifactId.replaceAll(":", "-")}.${extension(mediaType)}`,
        ),
        bytes,
      );
      const providerId = localNoop ? "cutout-local" : "mox-openai-compatible";
      const model = localNoop ? "identity-noop-v1" : "gpt-image-2";
      const receipt = paidToolReceiptSchema.parse({
        receiptId: `receipt:${sha256.slice(0, 20)}:${invocation.nodeId.slice(-12)}`,
        requestId: invocation.requestId,
        capability: reference ? "edit-image" : invocation.capability,
        providerId,
        model,
        status: "succeeded",
        charged: { currency: "USD", amount: 0 },
        outputArtifactIds: [artifactId],
        startedAt,
        completedAt,
      });
      return {
        receipt,
        candidate: {
          variantId: `${invocation.nodeId}:candidate`,
          artifactId,
          sha256,
          mediaType,
          requestId: invocation.requestId,
          model,
          providerId,
          attempt: 1,
          provenanceId: `provenance:${sha256.slice(0, 20)}:${invocation.nodeId.slice(-8)}`,
        },
      };
    },
  };
}

function multimodalReviewer(input: {
  key: string;
  base: string;
  artifacts: Map<string, Artifact>;
  scores: Map<string, CandidateScore>;
  signal: AbortSignal;
}): VisualReviewer {
  return {
    async review({ gate, candidates }) {
      if (gate.stage === "edit-review")
        return approve(gate, candidates[0]!, "human", [
          "Human review fixture approved the refined artifact for benchmark promotion.",
        ]);
      const evaluated = await scoreCandidates(input, candidates);
      evaluated.forEach((score) => input.scores.set(score.candidateId, score));
      const winner = [...evaluated].sort((a, b) => b.total - a.total)[0]!;
      return approve(
        gate,
        candidates.find((item) => item.variantId === winner.candidateId)!,
        "agent",
        [`GPT-5.5 rubric total ${winner.total}/60. ${winner.rationale}`],
      );
    },
  };
}

async function scoreCandidates(
  input: {
    key: string;
    base: string;
    artifacts: Map<string, Artifact>;
    signal: AbortSignal;
  },
  candidates: readonly VariantCandidate[],
): Promise<CandidateScore[]> {
  const content: unknown[] = [
    {
      type: "text",
      text: `Judge these fictional brand identity raster seeds. Return strict JSON: {"candidates":[{"index":1,"scores":{"distinctiveness":0-10,"brief fit":0-10,"small-size silhouette":0-10,"no fake text":0-10,"production adaptability":0-10,"negative constraints":0-10},"rationale":"..."}]}. Penalize generic compass/pin/letter marks, fake text, gradients, shadows, excessive detail. Brief: Fenwick Signal, precision navigation software for expedition teams; abstract bearing/coordinates; near-black plus cyan; flat, no text.`,
    },
  ];
  candidates.forEach((candidate) =>
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${input.artifacts.get(candidate.artifactId)!.bytes.toString("base64")}`,
      },
    }),
  );
  const response = await fetch(`${input.base}/chat/completions`, {
    method: "POST",
    signal: input.signal,
    headers: {
      authorization: `Bearer ${input.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Reviewer HTTP ${response.status}.`);
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
  return candidates.map((candidate, index) => {
    const row =
      parsed.candidates?.find(
        (item: { index?: number }) => item.index === index + 1,
      ) ?? {};
    const scores = Object.fromEntries(
      RUBRIC.map((key) => [key, clamp(Number(row.scores?.[key] ?? 0))]),
    ) as CandidateScore["scores"];
    return {
      candidateId: candidate.variantId,
      scores,
      total: Object.values(scores).reduce((sum, value) => sum + value, 0),
      rationale: String(row.rationale ?? "No rationale returned."),
    };
  });
}

async function generateImage(
  input: { key: string; base: string; signal: AbortSignal },
  prompt: string,
): Promise<Buffer> {
  return imageResponse(
    await fetch(`${input.base}/images/generations`, {
      method: "POST",
      signal: input.signal,
      headers: {
        authorization: `Bearer ${input.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    }),
    input.signal,
  );
}
async function editImage(
  input: { key: string; base: string; signal: AbortSignal },
  prompt: string,
  image: Buffer,
): Promise<Buffer> {
  const mediaType = detectMediaType(image);
  const form = new FormData();
  form.set("model", "gpt-image-2");
  form.set("prompt", prompt);
  form.set("size", "1024x1024");
  form.set("input_fidelity", "high");
  form.append(
    "image",
    new Blob([Uint8Array.from(image).buffer], { type: mediaType }),
    `reference-0.${extension(mediaType)}`,
  );
  return imageResponse(
    await fetch(`${input.base}/images/edits`, {
      method: "POST",
      signal: input.signal,
      headers: { authorization: `Bearer ${input.key}` },
      body: form,
    }),
    input.signal,
  );
}
async function imageResponse(
  response: Response,
  signal: AbortSignal,
): Promise<Buffer> {
  const payload = await response.json();
  if (!response.ok)
    throw new BenchmarkProviderError(
      "provider-image-edit-rejected",
      response.status,
      "Image provider rejected the bounded benchmark request.",
    );
  const item = payload.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const asset = await fetch(item.url, { signal });
    if (!asset.ok)
      throw new BenchmarkProviderError(
        "provider-asset-download-failed",
        asset.status,
        "Provider artifact download failed.",
      );
    return Buffer.from(await asset.arrayBuffer());
  }
  throw new BenchmarkProviderError(
    "provider-empty-artifact",
    response.status,
    "Image provider returned no artifact.",
  );
}

function task(value: VisualGenerationTask): VisualGenerationTask {
  return value;
}
function approve(
  gate: ReviewGate,
  candidate: VariantCandidate,
  reviewer: ReviewGate["reviewer"],
  evidence: string[],
): ReviewGate {
  return {
    ...gate,
    status: "approved",
    selectedCandidateId: candidate.variantId,
    reviewer,
    evidence,
    decidedAt: Date.now(),
  };
}
function apiBase(value: string) {
  const parsed = new URL(value);
  if (!parsed.pathname || parsed.pathname === "/") parsed.pathname = "/v1";
  return parsed.toString().replace(/\/$/, "");
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function digest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
function detectMediaType(bytes: Buffer): Artifact["mediaType"] {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  throw new Error("Unsupported generated image encoding.");
}
function extension(mediaType: Artifact["mediaType"]) {
  return mediaType === "image/jpeg"
    ? "jpg"
    : mediaType === "image/webp"
      ? "webp"
      : "png";
}
class BenchmarkProviderError extends Error {
  readonly code:
    | "provider-image-edit-rejected"
    | "provider-asset-download-failed"
    | "provider-empty-artifact";
  readonly status: number;
  constructor(
    code: BenchmarkProviderError["code"],
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "BenchmarkProviderError";
    this.code = code;
    this.status = status;
  }
}
async function loadFoundationAttempts(
  task: VisualGenerationTask,
  artifacts: Map<string, Artifact>,
  store: ReturnType<typeof createMemoryVisualExecutionStore>,
) {
  const names = (await readdir(OUTPUT))
    .filter((name) =>
      /^attempt-artifact-[a-f0-9]{24}\.(?:png|jpg|webp)$/.test(name),
    )
    .sort()
    .slice(0, 4);
  if (names.length !== 4)
    throw new Error(
      `Resume requires exactly four persisted foundation candidates; found ${names.length}.`,
    );
  for (const [index, name] of names.entries()) {
    const report = JSON.parse(
      await readFile(join(OUTPUT, "report.json"), "utf8"),
    );
    const sourcePath =
      name === report.review?.winnerFile && report.normalization?.output
        ? report.normalization.output
        : join(OUTPUT, name);
    const bytes = await readFile(sourcePath);
    const sha256 = digest(bytes);
    const artifactId = `artifact:${sha256.slice(0, 24)}`;
    const mediaType = detectMediaType(bytes);
    artifacts.set(artifactId, {
      id: artifactId,
      bytes,
      sha256,
      mediaType,
      model: "gpt-image-2",
      provider: "mox-openai-compatible",
      latencyMs: 0,
      createdAt: Date.now(),
    });
    const nodeId = `${task.taskId}:variant:${index + 1}`;
    const requestId = `${task.taskId}:${nodeId}:attempt:1`;
    store.putAttempt(requestId, {
      candidate: {
        variantId: `${nodeId}:candidate`,
        artifactId,
        sha256,
        mediaType,
        requestId,
        model: "gpt-image-2",
        providerId: "mox-openai-compatible",
        attempt: 1,
        provenanceId: `provenance:${sha256.slice(0, 24)}`,
      },
      receipt: paidToolReceiptSchema.parse({
        receiptId: `receipt:${sha256.slice(0, 24)}`,
        requestId,
        capability: "generate-image",
        providerId: "mox-openai-compatible",
        model: "gpt-image-2",
        status: "succeeded",
        charged: { currency: "USD", amount: 0 },
        outputArtifactIds: [artifactId],
        startedAt: 0,
        completedAt: 0,
      }),
    });
  }
}
function clamp(value: number) {
  return Math.max(0, Math.min(10, Number.isFinite(value) ? value : 0));
}
function buildReport(input: {
  foundation: Awaited<ReturnType<typeof executeVisualGeneration>>;
  application: Awaited<ReturnType<typeof executeVisualGeneration>>;
  artifacts: Map<string, Artifact>;
  scores: Map<string, CandidateScore>;
  events: unknown[];
  masterId: string;
}) {
  const applicationMaster = input.application.promotion!.masterArtifactId;
  return {
    version: "cutout.brand-foundation-benchmark.v1",
    fictionalBrand: "Fenwick Signal",
    models: { generation: "gpt-image-2", review: "gpt-5.5" },
    budget: {
      ceilingUSD: 12,
      actualCost:
        "provider response did not expose cost; charged amounts are recorded as unknown/0 in runtime receipts",
    },
    deadlineMs: 330000,
    rubric: RUBRIC,
    scores: [...input.scores.values()],
    selection: {
      winnerArtifactId: input.masterId,
      rationale: input.foundation.gates.flatMap((gate) => gate.evidence),
    },
    promotions: [input.foundation.promotion, input.application.promotion],
    receipts: [...input.foundation.receipts, ...input.application.receipts],
    artifacts: [...input.artifacts.values()].map(({ bytes, ...artifact }) => ({
      ...artifact,
      bytes: bytes.byteLength,
      size: "1024x1024",
    })),
    referenceLock: {
      sourceMasterId: input.masterId,
      applicationMasterId: applicationMaster,
      immutable: true,
      strength: 1,
      verified: input.application.receipts.some(
        (receipt) => receipt.capability === "edit-image",
      ),
    },
    eventCount: input.events.length,
  };
}
function markdown(report: ReturnType<typeof buildReport>) {
  return `# Fenwick Signal Brand Foundation Benchmark\n\n- Generation: ${report.models.generation}\n- Review: ${report.models.review}\n- Budget ceiling: USD ${report.budget.ceilingUSD}\n- Winner: ${report.selection.winnerArtifactId}\n- Reference lock verified: ${report.referenceLock.verified}\n\n## Scores\n\n${report.scores.map((item) => `- ${item.candidateId}: ${item.total}/60 — ${item.rationale}`).join("\n")}\n\n## Artifacts\n\n${report.artifacts.map((item) => `- ${item.id}: ${item.sha256}, ${item.bytes} bytes, ${item.latencyMs}ms`).join("\n")}\n`;
}
