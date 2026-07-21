import { describe, expect, it } from "vitest";
import { classifyGenerationError } from "./generation-error";

describe("classifyGenerationError", () => {
  it.each([
    "Provider timed out while generating the page.",
    "TypeError: Failed to fetch",
    "network error",
    "Service temporarily unavailable",
    "Upstream request failed",
    "HTTP 500 from provider",
    "HTTP 503 from provider",
  ])("marks transient provider failures as retryable: %s", (message) => {
    expect(classifyGenerationError(message)).toMatchObject({
      kind: "transient",
      retryable: true,
    });
  });

  it.each([
    ["Operation aborted", "cancelled"],
    ["HTTP 401 unauthorized", "credential"],
    ["The selected material is no longer available.", "material"],
    ["Request denied by policy", "policy"],
    ["Invalid configuration for provider", "configuration"],
    ["Request failed: invalid provider base URL", "configuration"],
    ["Structured output schema validation failed", "configuration"],
  ] as const)("excludes non-retryable failure: %s", (message, kind) => {
    expect(classifyGenerationError(message)).toMatchObject({
      kind,
      retryable: false,
    });
  });

  it.each([
    ["Request failed: generation cancelled by user", "cancelled"],
    ["Request failed: authentication failed", "credential"],
    ["Request failed: material reference not found", "material"],
    ["Request failed: content moderation blocked output", "policy"],
    ["Request failed: HTTP 400 bad request", "configuration"],
    ["Request failed: model endpoint returned HTTP 404", "configuration"],
    ["Request failed: validation error for HTTP 422", "configuration"],
  ] as const)(
    "lets explicit exclusion %s win over generic request wording",
    (message, kind) => {
      expect(classifyGenerationError(message)).toMatchObject({
        kind,
        retryable: false,
      });
    },
  );
});
