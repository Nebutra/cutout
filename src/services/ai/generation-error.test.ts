import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  isRouteWideGenerationFailure,
} from "./generation-error";

describe("classifyGenerationError", () => {
  it.each([
    "Provider timed out while generating the page.",
    "TypeError: Failed to fetch",
    "network error",
    "Service temporarily unavailable",
    "The connection to the AI provider was interrupted. Try again to continue.",
    "Upstream request failed",
    "HTTP 500 from provider",
    "HTTP 503 from provider",
    "Another planning turn is already active",
    "Planning runtime transport failed",
    "Planning runtime timed out",
    "Planning runtime upstream is unavailable",
    "The saved planning conversation is stale",
    "Planning runtime output did not match the required schema",
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
    ["Planning runtime protocol is unsupported", "configuration"],
    ["Codex runtime is not ready", "unknown"],
    ["Planning context is too large", "unknown"],
    ["Planning runtime output exceeded its limit", "unknown"],
    ["Planning runtime attempted an unavailable tool", "unknown"],
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

describe("isRouteWideGenerationFailure", () => {
  it.each([
    "HTTP 401 unauthorized",
    "Request failed: model endpoint returned HTTP 404",
    "Provider deadline exceeded.",
    "HTTP 429 from provider",
  ])("stops launching sibling requests after a route-wide failure: %s", (message) => {
    expect(isRouteWideGenerationFailure(message)).toBe(true);
  });

  it.each([
    "Operation aborted",
    "The selected material is no longer available.",
    "Request denied by policy",
    "One candidate returned no image.",
  ])("keeps candidate-local failures isolated: %s", (message) => {
    expect(isRouteWideGenerationFailure(message)).toBe(false);
  });
});
