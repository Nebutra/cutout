import { describe, expect, it, vi } from "vitest";
import {
  createAgentRunRetryControl,
  retryPlanningRuntimeAfterFailure,
  resolveAgentRunError,
} from "./agent-run-retry";

describe("retryPlanningRuntimeAfterFailure", () => {
  it("moves a failed Codex retry to a verified direct fallback", () => {
    expect(retryPlanningRuntimeAfterFailure("codex-system", true)).toBe(
      "direct-provider",
    );
  });

  it("keeps the failed route when no healthier alternative exists", () => {
    expect(retryPlanningRuntimeAfterFailure("codex-system", false)).toBe(
      "codex-system",
    );
    expect(retryPlanningRuntimeAfterFailure("direct-provider", true)).toBe(
      "direct-provider",
    );
  });
});

describe("resolveAgentRunError", () => {
  it("uses the persisted run error before the generation fallback", () => {
    expect(
      resolveAgentRunError("Persisted run failure", "HTTP 503 from provider"),
    ).toBe("Persisted run failure");
  });

  it("normalizes the generation fallback through the displayed error path", () => {
    expect(resolveAgentRunError(null, "HTTP 503 from provider")).toBe(
      "The connection to the AI provider was interrupted. Try again to continue.",
    );
    expect(resolveAgentRunError(null, null)).toBeNull();
  });
});

describe("createAgentRunRetryControl", () => {
  it("retries a transient failure as a new create run with the original brief", () => {
    const createAssets = vi.fn();
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: "Create a checkout flow",
        currentError: "Authentication failed",
        projectBrief: "A newer project brief",
      },
      createAssets,
    );

    expect(control.label).toBe("Retry");
    control.onRetry?.();
    expect(createAssets).toHaveBeenCalledWith("create", {
      briefOverride: "Create a checkout flow",
      skipToolGate: true,
      ignoreSelectedMaterial: true,
      retryPlanningRuntime: undefined,
    });
  });

  it("restarts the planning runtime when that boundary failed", () => {
    const createAssets = vi.fn();
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: "Create a restaurant site",
        retryPlanningRuntime: "codex-system",
        currentError: "The planning Agent could not finish this turn.",
        projectBrief: "Create a restaurant site",
      },
      createAssets,
    );

    control.onRetry?.();
    expect(createAssets).toHaveBeenCalledWith("create", {
      briefOverride: "Create a restaurant site",
      skipToolGate: false,
      ignoreSelectedMaterial: true,
      retryPlanningRuntime: "codex-system",
    });
  });

  it("keeps a transient Planner failure as Retry instead of projecting incomplete output as repair", () => {
    const createAssets = vi.fn();
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: true,
        retryableRunFailure: true,
        retryableBrief: "Create a restaurant site",
        retryPlanningRuntime: "codex-system",
        currentError: "The planning Agent could not finish this turn.",
        projectBrief: "Create a restaurant site",
      },
      createAssets,
    );

    expect(control.label).toBe("Retry");
    control.onRetry?.();
    expect(createAssets).toHaveBeenCalledWith("create", {
      briefOverride: "Create a restaurant site",
      skipToolGate: false,
      ignoreSelectedMaterial: true,
      retryPlanningRuntime: "codex-system",
    });
  });

  it("keeps repair-plan retries labeled Continue and in repair mode", () => {
    const createAssets = vi.fn();
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: true,
        retryableBrief: null,
        currentError: "Authentication failed",
        projectBrief: "A newer project brief",
      },
      createAssets,
    );

    expect(control.label).toBe("Continue");
    control.onRetry?.();
    expect(createAssets).toHaveBeenCalledWith("repair");
  });

  it.each([
    "Service temporarily unavailable",
    "The connection to the AI provider was interrupted. Try again to continue.",
    "The planning Agent could not finish this turn. Try again to continue.",
  ])("restores Retry for a persisted transient error: %s", (currentError) => {
    const createAssets = vi.fn();
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: null,
        currentError,
        projectBrief: "Restore the checkout flow",
      },
      createAssets,
    );

    expect(control.label).toBe("Retry");
    control.onRetry?.();
    expect(createAssets).toHaveBeenCalledWith("create", {
      briefOverride: "Restore the checkout flow",
      skipToolGate: true,
      ignoreSelectedMaterial: true,
      retryPlanningRuntime: undefined,
    });
  });

  it.each([
    "Run stopped by user",
    "Authentication failed",
    "The selected material is unavailable",
    "Request denied by policy",
    "Unsupported model",
    "An unexplained provider failure",
  ])("does not restore Retry for an excluded failure: %s", (currentError) => {
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: null,
        currentError,
        projectBrief: "Brief",
      },
      vi.fn(),
    );

    expect(control.onRetry).toBeUndefined();
    expect(control.label).toBeUndefined();
  });

  it("suppresses restored retry while another run is active", () => {
    const control = createAgentRunRetryControl(
      {
        working: true,
        hasRepairPlan: false,
        retryableBrief: null,
        currentError: "Service temporarily unavailable",
        projectBrief: "Brief",
      },
      vi.fn(),
    );

    expect(control.onRetry).toBeUndefined();
    expect(control.label).toBeUndefined();
  });

  it("suppresses repair Continue while another run is active", () => {
    const control = createAgentRunRetryControl(
      {
        working: true,
        hasRepairPlan: true,
        retryableBrief: "Brief",
        currentError: "Service temporarily unavailable",
        projectBrief: "Brief",
      },
      vi.fn(),
    );

    expect(control.onRetry).toBeUndefined();
    expect(control.label).toBeUndefined();
  });

  it("does not replace an explicit empty retry brief with restored state", () => {
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: "  ",
        currentError: "Service temporarily unavailable",
        projectBrief: "Fallback brief",
      },
      vi.fn(),
    );

    expect(control.onRetry).toBeUndefined();
    expect(control.label).toBeUndefined();
  });

  it.each([
    { currentError: null, projectBrief: "Brief" },
    { currentError: "Service temporarily unavailable", projectBrief: "  " },
  ])("hides restored retry without complete fallback input: %o", (fallback) => {
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: null,
        ...fallback,
      },
      vi.fn(),
    );

    expect(control.onRetry).toBeUndefined();
    expect(control.label).toBeUndefined();
  });
});
