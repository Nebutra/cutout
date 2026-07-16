import type { DesktopToolLoop } from "@/agent-runtime/desktop-tool-loop";
import type { MoneyEstimate, PaidToolRequest } from "@/control-protocol/paid-tool-contract";
import type {
  VisualToolInvoker,
  VisualToolInvocation,
  VisualToolResult,
} from "./executor";
import { variantCandidateSchema } from "./contracts";

export interface VisualArtifactMetadata {
  readonly artifactId: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly provenanceId: string;
}

/**
 * Bridges the visual DAG to the existing approval/budget/cancel/idempotency tool
 * loop. The loop remains the only paid-action authority; this adapter never
 * invokes a provider or reads a credential itself.
 */
export function createDesktopVisualToolInvoker(input: {
  readonly loop: DesktopToolLoop;
  readonly expectedRevision: () => number;
  readonly resolveArtifact: (
    artifactId: string,
  ) => Promise<VisualArtifactMetadata>;
  readonly estimateFor: (
    capability: "generate-image" | "edit-image",
  ) => MoneyEstimate;
  readonly authorize?: (input: { readonly runId: string; readonly requestId: string; readonly request: PaidToolRequest }) => Promise<{ readonly capabilityLeaseId: string; readonly requestDigest: string }>;
}): VisualToolInvoker {
  return {
    async invoke(invocation: VisualToolInvocation): Promise<VisualToolResult> {
      const toolCallId = `visual-tool:${invocation.taskId}:${invocation.nodeId}`;
      const request: PaidToolRequest = {
        capability: invocation.capability,
        model: invocation.allowCompatibleFallback ? undefined : invocation.preferredModel,
        intent: invocation.prompt,
        inputArtifactIds: [...invocation.inputArtifactIds, ...invocation.references],
        budgetCeiling: invocation.budgetCeiling,
        approvalPolicy: invocation.approvalPolicy,
      };
      const authorization = input.authorize ? await input.authorize({ runId: invocation.runId, requestId: invocation.requestId, request }) : {};
      await input.loop.request({
        runId: invocation.runId,
        toolCallId,
        requestId: invocation.requestId,
        stepId: invocation.nodeId,
        label:
          invocation.capability === "generate-image"
            ? "Generate visual variant"
            : "Refine selected visual",
        expectedRevision: input.expectedRevision(),
        request,
        ...authorization,
      });
      const result = await input.loop.settled(toolCallId, invocation.requestId);
      if (!result.ok) throw new Error(result.error);
      const artifactId = result.receipt.outputArtifactIds[0];
      if (!artifactId)
        throw new Error("The image tool returned no output artifact.");
      const artifact = await input.resolveArtifact(artifactId);
      return {
        receipt: result.receipt,
        candidate: variantCandidateSchema.parse({
          variantId: `${invocation.nodeId}:candidate`,
          artifactId: artifact.artifactId,
          sha256: artifact.sha256,
          mediaType: artifact.mediaType,
          requestId: invocation.requestId,
          model: result.receipt.model,
          providerId: result.receipt.providerId,
          attempt: Number(
            invocation.requestId.match(/:attempt:(\d+)$/)?.[1] ?? 1,
          ),
          provenanceId: artifact.provenanceId,
        }),
      };
    },
  };
}
