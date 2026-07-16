import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tauri package-manager portability", () => {
  it("runs lifecycle hooks through npm scripts available with Node", async () => {
    const config = JSON.parse(
      await readFile(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    );

    expect(config.build.beforeDevCommand).toBe("npm run dev --");
    expect(config.build.beforeBuildCommand).toBe("npm run build");
    expect(JSON.stringify(config.build)).not.toMatch(/\b(?:pnpm|yarn|bun)\b/);
  });

  it("declares a fail-closed updater plugin baseline for local builds", async () => {
    const config = JSON.parse(
      await readFile(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    );

    expect(config.plugins?.updater).toEqual({
      pubkey: "",
      endpoints: [],
    });
    expect(config.capabilities).toBeUndefined();
  });
});
