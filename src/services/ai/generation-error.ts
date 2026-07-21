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
  /connection (?:refused|reset|closed|interrupted)/i,
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

function matchesAny(message: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
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

export function userFacingGenerationError(message: string): string {
  return classifyGenerationError(message).displayMessage;
}
