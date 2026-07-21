export type AgentRunRetryMode = "create" | "repair";

export interface AgentRunRetryControl {
  readonly label?: "Continue" | "Retry";
  readonly onRetry?: () => void;
}

type CreateAssets = (
  mode: AgentRunRetryMode,
  options?: { readonly briefOverride?: string },
) => void | Promise<void>;

export function createAgentRunRetryControl(
  input: {
    readonly working: boolean;
    readonly hasRepairPlan: boolean;
    readonly retryableBrief: string | null;
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

  const retryableBrief = input.retryableBrief;
  if (!retryableBrief) return {};
  return {
    label: "Retry",
    onRetry: () =>
      void createAssets("create", { briefOverride: retryableBrief }),
  };
}
