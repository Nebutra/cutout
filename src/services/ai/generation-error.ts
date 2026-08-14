export type GenerationErrorKind =
  | "cancelled"
  | "credential"
  | "material"
  | "policy"
  | "configuration"
  | "transient"
  | "unknown";

export interface GenerationErrorClassification {
  readonly kind: GenerationErrorKind;
  readonly displayMessage: string;
  readonly retryable: boolean;
}

const STRUCTURED_GENERATION_ATTEMPTS = [
  "native-schema",
  "forced-tool",
  "text-json",
  "repair-json",
] as const;

const STRUCTURED_GENERATION_FAILURE_CATEGORIES = [
  "aborted",
  "authentication",
  "policy",
  "rate-limited",
  "endpoint-misconfigured",
  "transport",
  "unsupported",
  "output-missing",
  "invalid-json",
  "schema-mismatch",
  "provider-rejected",
  "unknown",
] as const;

export type StructuredGenerationAttempt =
  (typeof STRUCTURED_GENERATION_ATTEMPTS)[number];

export type StructuredGenerationFailureCategory =
  (typeof STRUCTURED_GENERATION_FAILURE_CATEGORIES)[number];

export interface StructuredGenerationAttemptFailure {
  readonly attempt: StructuredGenerationAttempt;
  readonly category: StructuredGenerationFailureCategory;
}

export interface TransientGenerationRetryInput<T> {
  readonly maxRetries: number;
  readonly signal?: AbortSignal;
  readonly run: (attempt: number) => Promise<T>;
}

const CANCELLATION_PATTERNS = [
  /aborterror/i,
  /operation aborted/i,
  /\b(?:generation|operation|run|request) (?:was )?(?:cancelled|canceled|aborted|stopped)\b/i,
  /request (?:was )?cancelled/i,
  /request (?:was )?canceled/i,
  /stopped by user/i,
];

const CREDENTIAL_PATTERNS = [
  /api[_ -]?key/i,
  /invalid key/i,
  /invalid credential/i,
  /missing credential/i,
  /expired credential/i,
  /authentication (?:failed|required|error)/i,
  /not authenticated/i,
  /unauthorized/i,
  /\b401\b/,
];

const MATERIAL_PATTERNS = [
  /selected material/i,
  /no material selected/i,
  /missing material/i,
  /material (?:is )?(?:missing|unavailable)/i,
  /material (?:reference|asset).*(?:missing|unavailable|not found|could not be loaded)/i,
];

const POLICY_PATTERNS = [
  /policy (?:denied|denial|blocked|rejected)/i,
  /denied by policy/i,
  /content policy/i,
  /safety policy/i,
  /policy violation/i,
  /content moderation/i,
  /safety filter/i,
  /blocked by safety/i,
  /permission denied/i,
  /forbidden/i,
  /\b403\b/,
];

const CONFIGURATION_PATTERNS = [
  /invalid configuration/i,
  /bad request/i,
  /invalid request/i,
  /invalid (?:provider )?base url/i,
  /base url (?:is )?invalid/i,
  /unsupported (?:api )?protocol/i,
  /planning runtime protocol is unsupported/i,
  /unsupported model/i,
  /(?:unknown|invalid) model/i,
  /model .*not found/i,
  /unknown provider/i,
  /provider (?:is )?not configured/i,
  /model (?:is )?not configured/i,
  /(?:http|status(?: code)?)\s*(?:400|404|422)\b/i,
  /validation (?:failed|error)/i,
  /schema/i,
  /structured output/i,
  /invalid json/i,
  /json (?:parse|parsing|decode|decoding|response|syntax)/i,
  /capability-required/i,
];

// These are closed native Codex turn failures whose authority is the current
// request, not Provider configuration. Keep the match exact so protocol,
// version, authentication, context-limit, and unavailable-tool failures remain
// non-retryable.
const RETRYABLE_PLANNING_RUNTIME_PATTERNS = [
  /^another planning turn is already active$/i,
  /^planning runtime transport failed$/i,
  /^planning runtime timed out$/i,
  /^planning runtime upstream is unavailable$/i,
  /^the saved planning conversation is stale$/i,
  /^planning runtime output did not match the required schema$/i,
  // This is Cutout's own fixed presentation of a closed native transient
  // result. It is not provider prose and lets restored workspace state retain
  // the original retry eligibility after a renderer restart.
  /^the planning agent could not finish this turn\. try again to continue\.$/i,
  // The progressive Planner intentionally removes raw Provider prose at its
  // streaming boundary. Preserve that closed transport classification so the
  // workspace can offer the same bounded run-level recovery as a direct
  // native runtime failure.
  /^progressive planner (?:outline|design-foundation|design-exploration|page|closure) transport failed\.?$/i,
];

const RETRYABLE_PLANNER_OUTPUT_PATTERNS = [
  /^Progressive planner produced an invalid prototype plan:/i,
  /^Progressive planner merge did not match the prototype schema:/i,
  /^Progressive planner page (?:details|repair) remained invalid:/i,
  /^Progressive planner closure repair remained invalid:/i,
];

const TRANSIENT_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /deadline exceeded/i,
  /request failed/i,
  /failed to fetch/i,
  /fetch failed/i,
  /network\s?error/i,
  /network connectivity/i,
  /could not reach/i,
  /connection\b.*\b(?:refused|reset|closed|interrupted)\b/i,
  /econn(?:refused|reset|aborted)/i,
  /dns error/i,
  /temporarily unavailable/i,
  /temporary service/i,
  /service unavailable/i,
  /upstream (?:request )?(?:failed|unavailable|timeout)/i,
  /provider (?:is )?overloaded/i,
  /(?:http|status(?: code)?)\s*(?:408|429|500|502|503|504)\b/i,
  /\b(?:408|429|500|502|503|504)\b.*(?:internal server error|too many requests|bad gateway|service unavailable|gateway timeout)/i,
];

const TIMEOUT_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /deadline exceeded/i,
  /gateway timeout/i,
];

const EXPLICIT_HTTP_STATUS_PATTERN =
  /\b(?:http(?:\s+status)?(?:\s+code)?|status(?:\s+code)?)\s*(?:[:=]\s*)?(401|403|408|429|500|502|503|504)\b/i;

function matchesAny(message: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function isStructuredGenerationAttempt(
  value: string,
): value is StructuredGenerationAttempt {
  return (STRUCTURED_GENERATION_ATTEMPTS as readonly string[]).includes(value);
}

function isStructuredGenerationFailureCategory(
  value: string,
): value is StructuredGenerationFailureCategory {
  return (STRUCTURED_GENERATION_FAILURE_CATEGORIES as readonly string[]).includes(value);
}

function closedStructuredFailureCategory(
  message: string,
): StructuredGenerationFailureCategory | null {
  const prefix = "Structured output failed: ";
  if (!message.startsWith(prefix) || !message.endsWith(".")) return null;
  const body = message.slice(prefix.length, -1);
  if (body.length === 0) return null;
  const categories: StructuredGenerationFailureCategory[] = [];
  for (const entry of body.split("; ")) {
    const parts = entry.split("=");
    if (
      parts.length !== 2 ||
      !isStructuredGenerationAttempt(parts[0]!) ||
      !isStructuredGenerationFailureCategory(parts[1]!)
    ) return null;
    categories.push(parts[1]);
  }
  if (categories.includes("aborted")) return "aborted";
  const terminal = categories.find((category) =>
    category === "authentication" ||
    category === "policy" ||
    category === "rate-limited" ||
    category === "endpoint-misconfigured" ||
    category === "transport" ||
    category === "provider-rejected"
  );
  return terminal ?? categories.at(-1) ?? null;
}

export function structuredGenerationFailureText(
  failures: readonly StructuredGenerationAttemptFailure[],
): string {
  return `Structured output failed: ${failures
    .map(({ attempt, category }) => `${attempt}=${category}`)
    .join("; ")}.`;
}

export function classifyGenerationError(
  message: string,
): GenerationErrorClassification {
  const normalized = message.trim();

  if (matchesAny(normalized, CANCELLATION_PATTERNS)) {
    return {
      kind: "cancelled",
      displayMessage: normalized || "Generation stopped.",
      retryable: false,
    };
  }

  // A typed HTTP status is stronger evidence than free-form Provider prose.
  // In particular, rate-limit bodies often mention the affected API key or
  // quota; that wording must not turn an explicit 429 into an auth failure.
  const explicitHttpStatus = normalized.match(EXPLICIT_HTTP_STATUS_PATTERN)?.[1];
  if (explicitHttpStatus === "401") {
    return {
      kind: "credential",
      displayMessage:
        "The selected AI provider needs a valid API key. Open Settings and update the provider.",
      retryable: false,
    };
  }
  if (explicitHttpStatus === "403") {
    return {
      kind: "policy",
      displayMessage: normalized || "The request was denied by policy.",
      retryable: false,
    };
  }
  if (explicitHttpStatus === "429") {
    return {
      kind: "transient",
      displayMessage:
        "The connection to the AI provider was interrupted. Try again to continue.",
      retryable: true,
    };
  }
  if (
    explicitHttpStatus === "408" ||
    explicitHttpStatus === "500" ||
    explicitHttpStatus === "502" ||
    explicitHttpStatus === "503" ||
    explicitHttpStatus === "504"
  ) {
    return {
      kind: "transient",
      displayMessage:
        "The connection to the AI provider was interrupted. Try again to continue.",
      retryable: true,
    };
  }

  const structuredFailure = closedStructuredFailureCategory(normalized);
  if (structuredFailure === "aborted") {
    return {
      kind: "cancelled",
      displayMessage: "Generation stopped.",
      retryable: false,
    };
  }
  if (structuredFailure === "authentication") {
    return {
      kind: "credential",
      displayMessage:
        "The selected AI provider needs a valid API key. Open Settings and update the provider.",
      retryable: false,
    };
  }
  if (structuredFailure === "policy") {
    return {
      kind: "policy",
      displayMessage: "The request was denied by policy.",
      retryable: false,
    };
  }
  if (structuredFailure === "rate-limited" || structuredFailure === "transport") {
    return {
      kind: "transient",
      displayMessage:
        "The connection to the AI provider was interrupted. Try again to continue.",
      retryable: true,
    };
  }
  if (structuredFailure !== null) {
    return {
      kind: "configuration",
      displayMessage: "The AI response could not be processed. Try again to continue.",
      retryable: false,
    };
  }

  if (matchesAny(normalized, CREDENTIAL_PATTERNS)) {
    return {
      kind: "credential",
      displayMessage:
        "The selected AI provider needs a valid API key. Open Settings and update the provider.",
      retryable: false,
    };
  }

  if (matchesAny(normalized, MATERIAL_PATTERNS)) {
    return {
      kind: "material",
      displayMessage: normalized || "The selected material is unavailable.",
      retryable: false,
    };
  }

  if (matchesAny(normalized, POLICY_PATTERNS)) {
    return {
      kind: "policy",
      displayMessage: normalized || "The request was denied by policy.",
      retryable: false,
    };
  }

  if (matchesAny(normalized, RETRYABLE_PLANNING_RUNTIME_PATTERNS)) {
    return {
      kind: "transient",
      displayMessage:
        "The planning Agent could not finish this turn. Try again to continue.",
      retryable: true,
    };
  }

  if (matchesAny(normalized, RETRYABLE_PLANNER_OUTPUT_PATTERNS)) {
    return {
      kind: "configuration",
      displayMessage:
        "The Agent could not finish a valid page navigation plan. Retry to continue.",
      retryable: true,
    };
  }

  if (matchesAny(normalized, CONFIGURATION_PATTERNS)) {
    return {
      kind: "configuration",
      displayMessage:
        normalized.toLowerCase().includes("schema") ||
        normalized.toLowerCase().includes("json") ||
        normalized.toLowerCase().includes("structured")
          ? "The AI response could not be processed. Try again to continue."
          : normalized || "The AI provider configuration is invalid.",
      retryable: false,
    };
  }

  if (matchesAny(normalized, TRANSIENT_PATTERNS)) {
    return {
      kind: "transient",
      displayMessage:
        "The connection to the AI provider was interrupted. Try again to continue.",
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    displayMessage:
      normalized.length === 0
        ? "Generation stopped."
        : normalized.length > 180
          ? "Generation stopped. Try again to continue."
          : normalized,
    retryable: false,
  };
}

/** Execute one logical remote generation node with a finite transient-only retry budget. */
export async function runWithTransientGenerationRetry<T>(
  input: TransientGenerationRetryInput<T>,
): Promise<T> {
  if (!Number.isInteger(input.maxRetries) || input.maxRetries < 0) {
    throw new Error("Transient generation retry count must be a non-negative integer.");
  }
  for (let attempt = 1; attempt <= input.maxRetries + 1; attempt += 1) {
    input.signal?.throwIfAborted();
    try {
      return await input.run(attempt);
    } catch (error) {
      input.signal?.throwIfAborted();
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt > input.maxRetries ||
        classifyGenerationError(message).kind !== "transient"
      ) {
        throw error;
      }
    }
  }
  throw new Error("Transient generation retry exhausted without a terminal result.");
}

export function userFacingGenerationError(message: string): string {
  return classifyGenerationError(message).displayMessage;
}

/** Exact timeout evidence used by bulk-route health; other transient pressure stays distinct. */
export function isGenerationTimeoutFailure(message: string): boolean {
  return matchesAny(message.trim(), TIMEOUT_PATTERNS);
}

/** Failures that apply to the selected Provider route, not one candidate prompt. */
export function isRouteWideGenerationFailure(message: string): boolean {
  const kind = classifyGenerationError(message).kind;
  return kind === "credential" || kind === "configuration" || kind === "transient";
}
