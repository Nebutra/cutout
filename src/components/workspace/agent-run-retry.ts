import {
  classifyGenerationError,
  userFacingGenerationError,
} from "@/services/ai/generation-error";

export type AgentRunRetryMode = "create" | "repair";
export type RetryPlanningRuntime = "codex-system" | "direct-provider";

export function retryPlanningRuntimeAfterFailure(
  failedRuntime: RetryPlanningRuntime,
  directFallbackReady: boolean,
): RetryPlanningRuntime {
  return failedRuntime === "codex-system" && directFallbackReady
    ? "direct-provider"
    : failedRuntime;
}

export interface AgentRunRetryControl {
  readonly label?: "Continue" | "Retry";
  readonly onRetry?: () => void;
}

type CreateAssets = (
  mode: AgentRunRetryMode,
  options?: {
    readonly briefOverride?: string;
    readonly skipToolGate?: boolean;
    readonly ignoreSelectedMaterial?: boolean;
    readonly retryPlanningRuntime?: RetryPlanningRuntime;
  },
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
    /**
     * A transient failure can occur before any durable artifact exists. In
     * that state the projected outcome is necessarily incomplete, but it is
     * not a material repair and must not replace the run-level Retry action.
     */
    readonly retryableRunFailure?: boolean;
    readonly retryableBrief: string | null;
    readonly retryPlanningRuntime?: RetryPlanningRuntime;
    readonly currentError: string | null;
    readonly projectBrief: string;
  },
  createAssets: CreateAssets,
): AgentRunRetryControl {
  if (input.working) return {};

  if (input.hasRepairPlan && !input.retryableRunFailure) {
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
      void createAssets("create", {
        briefOverride: retryableBrief,
        skipToolGate: input.retryPlanningRuntime === undefined,
        ignoreSelectedMaterial: true,
        retryPlanningRuntime: input.retryPlanningRuntime,
      }),
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
