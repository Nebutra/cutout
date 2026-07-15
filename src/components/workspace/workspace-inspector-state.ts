export function shouldShowDesignInspector({
  explicitlyOpen,
  dismissed,
  hasContent,
}: {
  readonly explicitlyOpen: boolean
  readonly dismissed: boolean
  readonly hasContent: boolean
}): boolean {
  // Outcome-first: generated metadata must never open an overlay on its own.
  // Content availability affects the Details affordance, not visibility.
  void dismissed
  void hasContent
  return explicitlyOpen
}
