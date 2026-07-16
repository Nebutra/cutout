import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) =>
  readFileSync(join(process.cwd(), "src/components/settings", name), "utf8");

describe("settings section grouping", () => {
  it("keeps routine preferences separate from governance and support controls", () => {
    const general = source("sections/GeneralSection.tsx");
    const ai = source("sections/AiSection.tsx");
    const advanced = source("sections/AdvancedSection.tsx");
    const support = source("sections/UpdatesSupportSection.tsx");
    const sidebar = source("SettingsSidebar.tsx");

    expect(general).not.toMatch(/Developer mode|Paid actions|Local recovery/);
    expect(ai).toContain("PaidActionsSection");
    expect(advanced).toContain("Developer mode");
    expect(support).toContain("UpdatesSection");
    expect(support).toContain("RecoverySection");
    expect(sidebar).toContain("settings.section_advanced");
    expect(sidebar).toContain("settings.section_updates_support");
  });
});
