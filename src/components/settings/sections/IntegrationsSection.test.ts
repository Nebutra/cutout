import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { IntegrationsSection } from "./IntegrationsSection";

i18n.loadAndActivate({ locale: "en", messages: {} });

describe("Integrations settings production state", () => {
  it("does not offer OAuth when no desktop host is injected", () => {
    const html = renderToStaticMarkup(
      createElement(I18nProvider, { i18n }, createElement(IntegrationsSection)),
    );
    expect(html).not.toContain("WIP");
    expect(html).toContain('disabled=""');
    expect(html).toContain("GitHub requires an installed host session");
    expect(html).toContain("host handshake is verified");
  });
});
