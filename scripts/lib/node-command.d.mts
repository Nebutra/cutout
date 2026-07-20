export function resolveNodeCommand(
  command: string,
  platform?: NodeJS.Platform,
): string

export function nodeCommandNeedsShell(
  command: string,
  platform?: NodeJS.Platform,
): boolean
