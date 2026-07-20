export function resolveNodeCommand(command, platform = process.platform) {
  if (platform !== 'win32' || /\.(?:bat|cmd|com|exe)$/i.test(command)) return command
  return `${command}.cmd`
}
