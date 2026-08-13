import type { PaidToolCapability } from '@/control-protocol/paid-tool-contract'

/** Native image transports own a 300-second request failsafe. */
export const NATIVE_IMAGE_TRANSPORT_TIMEOUT_MS = 300_000

/**
 * The desktop owner settles after the native image transport, never before it.
 * This avoids cancelling a valid slow response and replaying a paid request.
 */
export const DESKTOP_IMAGE_TOOL_TIMEOUT_MS =
  NATIVE_IMAGE_TRANSPORT_TIMEOUT_MS + 15_000

export const DESKTOP_LOCAL_TOOL_TIMEOUT_MS = 180_000

export function desktopPaidToolTimeoutMs(
  capability: PaidToolCapability,
): number {
  return capability === 'generate-image' || capability === 'edit-image'
    ? DESKTOP_IMAGE_TOOL_TIMEOUT_MS
    : DESKTOP_LOCAL_TOOL_TIMEOUT_MS
}
