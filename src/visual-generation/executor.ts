import { createRunEvent, type AgentRunEvent } from "@/agent-runtime/run-events";
import type {
  MoneyEstimate,
  PaidToolCapability,
  PaidToolReceipt,
} from "@/control-protocol/paid-tool-contract";
import {
  promotionReceiptSchema,
  reviewGateSchema,
  type PromotionReceipt,
  type ReviewGate,
  type VariantCandidate,
  type VisualGenerationPlan,
} from "./contracts";
import { validateVisualGenerationPlan } from "./validate";

export interface VisualToolInvocation {
  readonly runId: string;
  readonly taskId: string;
  readonly nodeId: string;
  readonly requestId: string;
  readonly capability: Extract<
    PaidToolCapability,
    "generate-image" | "edit-image"
  >;
  readonly preferredModel: string;
  readonly allowCompatibleFallback: boolean;
  readonly requiredCapabilities: readonly string[];
  readonly prompt: string;
  readonly inputArtifactIds: readonly string[];
  readonly references: readonly string[];
  readonly budgetCeiling: MoneyEstimate;
  readonly approvalPolicy: "explicit" | "auto-within-budget";
  readonly signal?: AbortSignal;
}
export interface VisualToolResult {
  readonly candidate: VariantCandidate;
  readonly receipt: PaidToolReceipt;
}
export interface VisualToolInvoker {
  invoke(input: VisualToolInvocation): Promise<VisualToolResult>;
}
export interface VisualReviewer {
  review(input: {
    readonly taskId: string;
    readonly gate: ReviewGate;
    readonly candidates: readonly VariantCandidate[];
    readonly signal?: AbortSignal;
  }): Promise<ReviewGate>;
}
export interface VisualExecutionStore {
  get(key: string): VisualExecutionResult | undefined;
  put(key: string, result: VisualExecutionResult): void;
  getAttempt(requestId: string): VisualToolResult | undefined;
  putAttempt(requestId: string, result: VisualToolResult): void;
}
export interface VisualExecutionDeps {
  readonly tools: VisualToolInvoker;
  readonly reviewer: VisualReviewer;
  readonly store: VisualExecutionStore;
  readonly append: (events: readonly AgentRunEvent[]) => void;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}
export interface VisualExecutionResult {
  readonly planId: string;
  readonly candidates: readonly VariantCandidate[];
  readonly gates: readonly ReviewGate[];
  readonly promotion?: PromotionReceipt;
  readonly receipts: readonly PaidToolReceipt[];
  readonly idempotent: boolean;
}

export async function executeVisualGeneration(
  runId: string,
  input: VisualGenerationPlan,
  deps: VisualExecutionDeps,
): Promise<VisualExecutionResult> {
  const plan = validateVisualGenerationPlan(input);
  const prior = deps.store.get(plan.idempotencyKey);
  if (prior) return { ...prior, idempotent: true };
  if (
    plan.estimatedCost.currency !== plan.task.budget.ceiling.currency ||
    plan.estimatedCost.amount > plan.task.budget.ceiling.amount
  )
    throw new Error("Visual generation plan exceeds the task budget ceiling.");
  const now = deps.now ?? Date.now;
  assertNotAborted(deps.signal);
  deps.append([
    createRunEvent(
      runId,
      {
        type: "step-started",
        stepId: plan.planId,
        label: `Visual generation: ${plan.task.catalogItemId}`,
      },
      { eventId: `event:${plan.planId}:started`, at: now() },
    ),
  ]);
  const generateNodes = plan.nodes.filter(
    (node) => node.operation === "generate",
  );
  const generated: VariantCandidate[] = [];
  const receipts: PaidToolReceipt[] = [];
  try {
    for (
      let offset = 0;
      offset < generateNodes.length;
      offset += plan.task.variants.parallelism
    ) {
      assertNotAborted(deps.signal);
      const batch = generateNodes.slice(
        offset,
        offset + plan.task.variants.parallelism,
      );
      const settled = await Promise.allSettled(
        batch.map((node) =>
          invokeWithRetry(plan, runId, node.id, "generate-image", [], deps),
        ),
      );
      for (const result of settled)
        if (result.status === "fulfilled") {
          generated.push(result.value.candidate);
          receipts.push(result.value.receipt);
        }
      const failed = settled.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) throw failed.reason;
    }
    const selection = await decide(
      deps.reviewer,
      {
        version: "visual-review-gate.v1",
        gateId: `${plan.task.taskId}:variant-selection`,
        taskId: plan.task.taskId,
        stage: "variant-selection",
        status: "pending",
        candidateIds: generated.map((item) => item.variantId),
        reviewer: "agent",
        criteria: [
          "brief alignment",
          "brand consistency",
          "composition quality",
          "absence of visual defects",
        ],
        evidence: [],
      },
      generated,
      deps.signal,
    );
    const selected = approvedCandidate(selection, generated);
    const editNode = plan.nodes.find((node) => node.operation === "edit");
    if (!editNode || editNode.operation !== "edit")
      throw new Error("Visual plan has no refinement node.");
    const refinedResult = await refineOrRegenerate(
      plan,
      runId,
      editNode.id,
      selected,
      deps,
    );
    generated.push(refinedResult.candidate);
    receipts.push(refinedResult.receipt);
    const editReview = await decide(
      deps.reviewer,
      {
        version: "visual-review-gate.v1",
        gateId: `${plan.task.taskId}:edit-review`,
        taskId: plan.task.taskId,
        stage: "edit-review",
        status: "pending",
        candidateIds: [refinedResult.candidate.variantId],
        reviewer: "agent",
        criteria: [
          "reference fidelity",
          "locked trait consistency",
          "production fitness",
          "absence of visual defects",
        ],
        evidence: [],
      },
      [refinedResult.candidate],
      deps.signal,
    );
    const master = approvedCandidate(editReview, [refinedResult.candidate]);
    if (
      plan.task.publication.requiresHumanReview &&
      editReview.reviewer !== "human"
    )
      throw new Error(
        "Master promotion is blocked until a human review gate approves the candidate.",
      );
    const status = plan.task.publication.requiresVectorization
      ? "raster-seed-awaiting-vector-review"
      : "approved-master";
    const promotion = promotionReceiptSchema.parse({
      version: "visual-promotion-receipt.v1",
      receiptId: `promotion:${plan.task.taskId}`,
      taskId: plan.task.taskId,
      catalogItemId: plan.task.catalogItemId,
      masterArtifactId: master.artifactId,
      sourceCandidateId: master.variantId,
      gateIds: [selection.gateId, editReview.gateId],
      status,
      promotedAt: now(),
      provenanceIds: generated.map((item) => item.provenanceId),
    });
    const result: VisualExecutionResult = {
      planId: plan.planId,
      candidates: generated,
      gates: [selection, editReview],
      promotion,
      receipts,
      idempotent: false,
    };
    deps.store.put(plan.idempotencyKey, result);
    deps.append([
      createRunEvent(
        runId,
        {
          type: "material-recorded",
          material: {
            id: promotion.masterArtifactId,
            kind: "prototype-page",
            label: plan.task.catalogItemId,
            source: "agent",
            evidenceKey: promotion.receiptId,
          },
        },
        { eventId: `event:${plan.task.taskId}:material`, at: now() },
      ),
      createRunEvent(
        runId,
        {
          type: "step-succeeded",
          stepId: plan.planId,
          label: `Visual generation: ${plan.task.catalogItemId}`,
          detail: status,
        },
        { eventId: `event:${plan.planId}:succeeded`, at: now() },
      ),
    ]);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.append([
      createRunEvent(
        runId,
        {
          type: deps.signal?.aborted ? "step-cancelled" : "step-failed",
          stepId: plan.planId,
          label: `Visual generation: ${plan.task.catalogItemId}`,
          detail,
        },
        { eventId: `event:${plan.planId}:failed`, at: now() },
      ),
    ]);
    throw error;
  }
}

async function invokeWithRetry(
  plan: VisualGenerationPlan,
  runId: string,
  nodeId: string,
  capability: "generate-image" | "edit-image",
  inputs: readonly string[],
  deps: VisualExecutionDeps,
): Promise<VisualToolResult> {
  let last: unknown;
  for (
    let attempt = 1;
    attempt <= plan.task.budget.maxAttemptsPerNode;
    attempt += 1
  ) {
    assertNotAborted(deps.signal);
    try {
      const requestId = `${plan.task.taskId}:${nodeId}:attempt:${attempt}`;
      const recovered = deps.store.getAttempt(requestId);
      if (recovered) return recovered;
      const result = await deps.tools.invoke({
        runId,
        taskId: plan.task.taskId,
        nodeId,
        requestId: `${plan.task.taskId}:${nodeId}:attempt:${attempt}`,
        capability,
        preferredModel: plan.task.routing.preferredModel,
        allowCompatibleFallback: plan.task.routing.allowCompatibleFallback,
        requiredCapabilities: plan.task.routing.requiredCapabilities,
        prompt: renderPrompt(plan, nodeId),
        inputArtifactIds: inputs,
        references: [
          ...plan.task.references.map((ref) => ref.artifactId),
          ...(plan.task.consistency.predecessorMasterId
            ? [plan.task.consistency.predecessorMasterId]
            : []),
        ],
        budgetCeiling: plan.task.budget.ceiling,
        approvalPolicy: plan.task.budget.approvalPolicy,
        signal: deps.signal,
      });
      if (
        result.receipt.requestId !== requestId ||
        result.candidate.requestId !== requestId
      )
        throw new Error(
          "Visual tool returned evidence for a different request.",
        );
      deps.store.putAttempt(requestId, result);
      return result;
    } catch (error) {
      last = error;
      if (deps.signal?.aborted) throw error;
      if (!isRetryableVisualToolError(error)) throw error;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function refineOrRegenerate(
  plan: VisualGenerationPlan,
  runId: string,
  nodeId: string,
  selected: VariantCandidate,
  deps: VisualExecutionDeps,
): Promise<VisualToolResult> {
  try {
    return await invokeWithRetry(
      plan,
      runId,
      nodeId,
      "edit-image",
      [selected.artifactId],
      deps,
    );
  } catch (error) {
    if (
      !plan.task.routing.allowCompatibleFallback ||
      !isImageEditCompatibilityError(error)
    )
      throw error;
    // Some OpenAI-compatible providers expose generation but not image edits.
    // Preserve the selected candidate as an immutable reference and perform one
    // separately receipted regeneration instead of retrying a rejected edit.
    return invokeWithRetry(
      { ...plan, task: { ...plan.task, budget: { ...plan.task.budget, maxAttemptsPerNode: 1 } } },
      runId,
      `${nodeId}:regenerate-fallback`,
      "generate-image",
      [selected.artifactId],
      deps,
    );
  }
}

export function isImageEditCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:images\/edits|image edit).*(?:HTTP\s*(?:400|404|405|415|422)|unsupported|not supported|capability-required)/i.test(
    message,
  );
}

export function isRetryableVisualToolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (isImageEditCompatibilityError(error)) return false;
  if (/HTTP\s*(?:400|401|403|404|405|409|415|422)\b/i.test(message)) return false;
  return true;
}

function renderPrompt(plan: VisualGenerationPlan, nodeId: string): string {
  const p = plan.task.prompt;
  return [
    p.objective,
    `Subject: ${p.subject}`,
    `Composition: ${p.composition}`,
    `Art direction: ${p.artDirection}`,
    `Constraints: ${p.constraints.join("; ")}`,
    plan.task.consistency.lockedTraits.length
      ? `Serial consistency locks: ${plan.task.consistency.lockedTraits.join("; ")}`
      : "",
    plan.task.refinement.mode === "local-mask"
      ? `Local repaint only: ${plan.task.refinement.instruction}`
      : "",
    p.negativeConstraints.length
      ? `Avoid: ${p.negativeConstraints.join("; ")}`
      : "",
    `Task node: ${nodeId}`,
  ]
    .filter(Boolean)
    .join("\n");
}
async function decide(
  reviewer: VisualReviewer,
  gate: ReviewGate,
  candidates: readonly VariantCandidate[],
  signal?: AbortSignal,
): Promise<ReviewGate> {
  const result = reviewGateSchema.parse(
    await reviewer.review({ taskId: gate.taskId, gate, candidates, signal }),
  );
  if (result.gateId !== gate.gateId || result.taskId !== gate.taskId)
    throw new Error("Reviewer returned a gate for a different task.");
  return result;
}
function approvedCandidate(
  gate: ReviewGate,
  candidates: readonly VariantCandidate[],
): VariantCandidate {
  if (gate.status !== "approved" || !gate.selectedCandidateId)
    throw new Error(`Review gate ${gate.gateId} did not approve a candidate.`);
  const candidate = candidates.find(
    (item) => item.variantId === gate.selectedCandidateId,
  );
  if (!candidate)
    throw new Error(
      `Review gate ${gate.gateId} selected an unknown candidate.`,
    );
  return candidate;
}
function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("Visual generation cancelled.", "AbortError");
}

export function createMemoryVisualExecutionStore(): VisualExecutionStore {
  const results = new Map<string, VisualExecutionResult>();
  const attempts = new Map<string, VisualToolResult>();
  return {
    get: (key) => results.get(key),
    put: (key, result) => {
      results.set(key, result);
    },
    getAttempt: (requestId) => attempts.get(requestId),
    putAttempt: (requestId, result) => {
      attempts.set(requestId, result);
    },
  };
}
