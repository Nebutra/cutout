export function resolveNodeCommand(command, platform = process.platform) {
  if (platform !== 'win32' || /\.(?:bat|cmd|com|exe)$/i.test(command)) return command
  return `${command}.cmd`
}

export function nodeCommandNeedsShell(command, platform = process.platform) {
  return platform === 'win32' && /(?:^|[\\/])(?:npm|npx|pnpm|yarn)\.cmd$/i.test(command)
}
