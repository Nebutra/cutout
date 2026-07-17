/**
 * Pipeline constants.
 *
 * `BACKGROUND_ALPHA_MAX` and `DEFAULT_THRESHOLD` are ported verbatim from the
 * original Electron renderer — do NOT tweak those two, the port's contract is
 * byte-identical detection output.
 *
 * The `MATTE_*` constants are NEW, deliberate edge behavior (soft white-matting
 * pass, see `softenMaskEdges.ts`) that supersedes the original 1px near-white
 * feather hack. They are LayerForge-inspired smoothstep bounds over RGB
 * Euclidean distance to white.
 */

/** A pixel with alpha strictly below this is treated as background. */
export const BACKGROUND_ALPHA_MAX = 8

/**
 * Matte: boundary pixels within this RGB distance of white are pure fringe —
 * the smoothstep ramp bottoms out here (alpha floor still applies).
 */
export const MATTE_FULL_TRANSPARENT_DIST = 24

/** Matte: boundary pixels beyond this RGB distance of white keep full alpha. */
export const MATTE_FULL_OPAQUE_DIST = 96

/**
 * Matte: boundary foreground pixels never drop to alpha 0, so `findComponents`
 * still classifies them as foreground (detection invariance).
 */
export const MATTE_ALPHA_FLOOR = 1

/** Default white-background RGB threshold (user default). */
export const DEFAULT_THRESHOLD = 246

/**
 * Board compliance: minimum fraction of border-band pixels that must be
 * background-white for a generated region board to count as compliant with the
 * pure-white-background instruction (see `boardDiagnostics.ts`). NEW, tunable —
 * NOT part of the verbatim-port contract.
 */
export const BOARD_BORDER_WHITE_MIN_RATIO = 0.55
