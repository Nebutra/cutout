import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LocalAgentInventoryRow } from "@/services/ai/local-agent-inventory";
import { LocalAgentInventoryView } from "./LocalAgentInventoryPanel";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function row(
  id: LocalAgentInventoryRow["id"],
  input: Partial<LocalAgentInventoryRow>,
): LocalAgentInventoryRow {
  return {
    id,
    displayName: id,
    cliAliases: [id],
    provenance: {
      catalog: "Paseo 39-Agent catalog",
      slug: id,
      reviewedAt: "2026-07-27",
    },
    installation: { status: "not-installed" },
    configRoots: [],
    capabilities: {
      credentialAdapter: "unsupported",
      sessionDelegation: "unsupported",
    },
    ...input,
  };
}

function renderInventory(rows: readonly LocalAgentInventoryRow[]) {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(
        I18nProvider,
        { i18n },
        createElement(LocalAgentInventoryView, {
          rows,
          loading: false,
          error: false,
          refreshing: false,
          onRetry: vi.fn(),
        }),
      ),
    ),
  );
}

describe("LocalAgentInventoryView", () => {
  it("shows installed, configured, unsupported, and permission states", () => {
    const html = renderInventory([
      row("codex", {
        displayName: "Codex",
        installation: { status: "installed", executableAlias: "codex" },
        configRoots: [
          { label: "~/.codex", status: "found", markers: ["~/.codex/auth.json"] },
        ],
        capabilities: {
          credentialAdapter: "supported",
          sessionDelegation: "unsupported",
        },
      }),
      row("cursor", {
        displayName: "Cursor",
        configRoots: [
          { label: "~/Library/Application Support/Cursor", status: "permission-required", markers: [] },
        ],
      }),
    ]);

    expect(html).toContain("1 installed");
    expect(html).toContain("View all 39 agents");
    expect(html).toContain("~/.codex");
    expect(html).toContain("API key import supported");
    expect(html).toContain("Permission required");
    expect(html).toContain("Allow access if your system asks");
    expect(html).toContain("No reviewed API key import");
  });

  it("keeps scan failure actionable without exposing native errors", () => {
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(
          I18nProvider,
          { i18n },
          createElement(LocalAgentInventoryView, {
            loading: false,
            error: true,
            refreshing: false,
            onRetry: vi.fn(),
          }),
        ),
      ),
    );

    expect(html).toContain("Could not scan local Agent locations.");
    expect(html).toContain("Scan again");
    expect(html).not.toContain("/Users/");
  });
});
