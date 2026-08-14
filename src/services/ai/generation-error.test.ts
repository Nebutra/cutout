import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  isRouteWideGenerationFailure,
  runWithTransientGenerationRetry,
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
    "HTTP 429: quota for this API key is temporarily exhausted",
    "Request failed with status code 429: API key quota reached",
    "Another planning turn is already active",
    "Planning runtime transport failed",
    "Planning runtime timed out",
    "Planning runtime upstream is unavailable",
    "The saved planning conversation is stale",
    "Planning runtime output did not match the required schema",
    "The planning Agent could not finish this turn. Try again to continue.",
    "Progressive planner outline transport failed.",
  ])("marks transient provider failures as retryable: %s", (message) => {
    expect(classifyGenerationError(message)).toMatchObject({
      kind: "transient",
      retryable: true,
    });
  });

  it("keeps a generic native turn failure non-retryable without reviewed transient evidence", () => {
    expect(classifyGenerationError("Planning runtime turn failed")).toMatchObject({
      kind: "unknown",
      retryable: false,
    });
  });

  it.each([408, 500, 502, 503, 504])(
    "lets explicit HTTP %s transport status override arbitrary response prose",
    (status) => {
      expect(classifyGenerationError(
        `HTTP ${status}: this API key and schema are mentioned only in upstream prose`,
      )).toMatchObject({
        kind: "transient",
        retryable: true,
      });
    },
  );

  it("does not accept prose appended to the closed structured failure grammar", () => {
    expect(classifyGenerationError(
      "Structured output failed: native-schema=transport. upstream prose",
    )).toMatchObject({
      kind: "configuration",
      retryable: false,
    });
  });

  it.each([
    ["Structured output failed: native-schema=transport.", "transient", true],
    ["Structured output failed: native-schema=rate-limited.", "transient", true],
    ["Structured output failed: native-schema=authentication.", "credential", false],
    ["Structured output failed: native-schema=policy.", "policy", false],
    ["Structured output failed: native-schema=aborted.", "cancelled", false],
    ["Structured output failed: native-schema=schema-mismatch.", "configuration", false],
    ["Structured output failed: native-schema=schema-mismatch; forced-tool=transport.", "transient", true],
    ["Structured output failed: native-schema=authentication; forced-tool=transport.", "credential", false],
    ["Structured output failed: native-schema=policy; forced-tool=transport.", "policy", false],
    ["Structured output failed: native-schema=transport; forced-tool=aborted.", "cancelled", false],
  ] as const)(
    "classifies the closed structured-attempt signal without reading Provider prose: %s",
    (message, kind, retryable) => {
      expect(classifyGenerationError(message)).toMatchObject({ kind, retryable });
    },
  );

  it.each([
    ["HTTP 401: this API key is invalid", "credential"],
    ["HTTP 403: this API key is blocked by policy", "policy"],
  ] as const)(
    "lets explicit HTTP auth/policy status override overlapping prose: %s",
    (message, kind) => {
      expect(classifyGenerationError(message)).toMatchObject({
        kind,
        retryable: false,
      });
    },
  );

  it("keeps invalid Planner graph details private and offers a bounded new attempt", () => {
    for (const message of [
      'Progressive planner produced an invalid prototype plan: Flow "checkout" step references unknown interaction "submit-secret-id" on page "landing".',
      'Progressive planner page repair remained invalid: Interaction "submit-secret-id" references an unknown page.',
      'Progressive planner closure repair remained invalid: Flow "checkout" step references unknown interaction "submit-secret-id" on page "landing".',
    ]) {
      expect(classifyGenerationError(message)).toEqual({
        kind: "configuration",
        displayMessage:
          "The Agent could not finish a valid page navigation plan. Retry to continue.",
        retryable: true,
      });
    }
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

describe("runWithTransientGenerationRetry", () => {
  it("retries one transient failure with a fresh attempt number", async () => {
    const attempts: number[] = [];
    await expect(runWithTransientGenerationRetry({
      maxRetries: 1,
      run: async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) throw new Error("HTTP 502 bad gateway");
        return "ready";
      },
    })).resolves.toBe("ready");
    expect(attempts).toEqual([1, 2]);
  });

  it("retries an explicit 429 even when the Provider body mentions an API key", async () => {
    let calls = 0;
    await expect(runWithTransientGenerationRetry({
      maxRetries: 1,
      run: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("HTTP 429: quota for this API key is temporarily exhausted");
        }
        return "ready";
      },
    })).resolves.toBe("ready");
    expect(calls).toBe(2);
  });

  it("does not retry output, configuration, or cancellation failures", async () => {
    for (const message of [
      "The model returned no image.",
      "HTTP 400 invalid request",
      "Operation aborted",
    ]) {
      let calls = 0;
      await expect(runWithTransientGenerationRetry({
        maxRetries: 1,
        run: async () => {
          calls += 1;
          throw new Error(message);
        },
      })).rejects.toThrow(message);
      expect(calls).toBe(1);
    }
  });
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
