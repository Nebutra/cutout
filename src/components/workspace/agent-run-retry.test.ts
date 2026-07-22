import { describe, expect, it, vi } from "vitest";
import {
  createAgentRunRetryControl,
  resolveAgentRunError,
} from "./agent-run-retry";

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
