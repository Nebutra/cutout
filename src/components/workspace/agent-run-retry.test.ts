import { describe, expect, it, vi } from "vitest";
import { createAgentRunRetryControl } from "./agent-run-retry";

describe("createAgentRunRetryControl", () => {
  it("retries a transient failure as a new create run with the original brief", () => {
    const createAssets = vi.fn();
    const control = createAgentRunRetryControl(
      {
        working: false,
        hasRepairPlan: false,
        retryableBrief: "Create a checkout flow",
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
        retryableBrief: "Create a checkout flow",
      },
      createAssets,
    );

    expect(control.label).toBe("Continue");
    control.onRetry?.();
    expect(createAssets).toHaveBeenCalledWith("repair");
  });

  it.each([
    { working: true, hasRepairPlan: false, retryableBrief: "Brief" },
    { working: false, hasRepairPlan: false, retryableBrief: null },
  ])("hides retry when unavailable: %o", (input) => {
    const control = createAgentRunRetryControl(input, vi.fn());
    expect(control.onRetry).toBeUndefined();
    expect(control.label).toBeUndefined();
  });
});
