import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Updates settings contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/settings/sections/UpdatesSection.tsx"),
    "utf8",
  );
  it("keeps restart explicit and exposes accessible progress/status", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('message: "Update download progress"');
    expect(source).toContain("Install & restart");
    expect(source).toMatch(/Active\s+Agent\s+work\s+blocks\s+installation/);
    expect(source).not.toMatch(/force.{0,12}restart/i);
  });

  it("renders channel choices only when native capability exposes them", () => {
    expect(source).toContain("state.capability?.channels[channel].available");
    expect(source).toContain("visibleChannels.length > 1");
    expect(source).toContain("visibleChannels.map((channel)");
    expect(source).not.toContain('(["stable", "beta"] as const).map');
  });

  it("keeps system notifications an explicit permission-backed opt-in", () => {
    expect(source).toContain("controller.getSystemNotificationsEnabled()");
    expect(source).toContain("controller.setSystemNotificationsEnabled(enabled)");
    expect(source).toContain("System notifications remain off because permission was not granted.");
    expect(source).toContain("Notify when an update is found while Cutout is in the background.");
    expect(source).not.toContain("requestPermission");
  });

  it("uses the shared lifecycle scheduler for the fallback controller", () => {
    expect(source).toContain("startUpdateAutoCheckScheduler(controller)");
    expect(source).not.toContain("window.setTimeout");
  });
});
