export function resolveVitestMaxWorkers(platform: NodeJS.Platform): number | undefined {
  return platform === 'win32' ? 2 : undefined
}
