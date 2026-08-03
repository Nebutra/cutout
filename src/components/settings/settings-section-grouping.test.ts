import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) =>
  readFileSync(join(process.cwd(), "src/components/settings", name), "utf8");

describe("settings section grouping", () => {
  it("keeps General limited to theme and language", () => {
    const general = source("sections/GeneralSection.tsx");
    const ai = source("sections/AiSection.tsx");
    const support = source("sections/UpdatesSupportSection.tsx");
    const sidebar = source("SettingsSidebar.tsx");
    const dialog = source("SettingsDialog.tsx");

    expect(general).not.toMatch(/Paid actions|Local recovery/);
    expect(ai).toContain("ModelAssignments");
    expect(general).not.toContain("settings.developer_mode");
    expect(support).toContain("UpdatesSection");
    expect(support).toContain("RecoverySection");
    expect(sidebar).not.toMatch(/section_advanced|'advanced'/);
    expect(dialog).not.toMatch(/AdvancedSection|section === 'advanced'/);
    expect(sidebar).toContain("settings.section_updates_support");
  });
});
