import {
  classifyGenerationError,
  userFacingGenerationError,
} from "@/services/ai/generation-error";

export type AgentRunRetryMode = "create" | "repair";

export interface AgentRunRetryControl {
  readonly label?: "Continue" | "Retry";
  readonly onRetry?: () => void;
}

type CreateAssets = (
  mode: AgentRunRetryMode,
  options?: { readonly briefOverride?: string },
) => void | Promise<void>;

export function resolveAgentRunError(
  runError: string | null,
  generationError: string | null,
): string | null {
  return runError ??
    (generationError ? userFacingGenerationError(generationError) : null);
}

export function createAgentRunRetryControl(
  input: {
    readonly working: boolean;
    readonly hasRepairPlan: boolean;
    readonly retryableBrief: string | null;
    readonly currentError: string | null;
    readonly projectBrief: string;
  },
  createAssets: CreateAssets,
): AgentRunRetryControl {
  if (input.working) return {};

  if (input.hasRepairPlan) {
    return {
      label: "Continue",
      onRetry: () => void createAssets("repair"),
    };
  }

  const retryableBrief = resolveRetryableBrief(input);
  if (!retryableBrief) return {};
  return {
    label: "Retry",
    onRetry: () =>
      void createAssets("create", { briefOverride: retryableBrief }),
  };
}

function resolveRetryableBrief(input: {
  readonly retryableBrief: string | null;
  readonly currentError: string | null;
  readonly projectBrief: string;
}): string | null {
  if (input.retryableBrief !== null) {
    return input.retryableBrief.trim() || null;
  }

  const projectBrief = input.projectBrief.trim();
  if (!input.currentError || !projectBrief) return null;

  return classifyGenerationError(input.currentError).retryable
    ? projectBrief
    : null;
}
