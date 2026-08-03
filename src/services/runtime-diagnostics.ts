export type RuntimeDiagnosticLevel = 'info' | 'warn' | 'error'

export interface RuntimeDiagnostic {
  readonly id: string
  readonly at: number
  readonly level: RuntimeDiagnosticLevel
  readonly scope: string
  readonly message: string
  readonly details?: unknown
}

const MAX_DIAGNOSTICS = 80
const diagnostics: RuntimeDiagnostic[] = []

export function recordRuntimeDiagnostic(input: {
  readonly level: RuntimeDiagnosticLevel
  readonly scope: string
  readonly message: string
  readonly details?: unknown
}): RuntimeDiagnostic {
  const diagnostic: RuntimeDiagnostic = {
    id: crypto.randomUUID(),
    at: Date.now(),
    level: input.level,
    scope: input.scope,
    message: input.message,
    details: input.details,
  }

  diagnostics.unshift(diagnostic)
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.length = MAX_DIAGNOSTICS
  return diagnostic
}

export function getRuntimeDiagnostics(): readonly RuntimeDiagnostic[] {
  return diagnostics
}

export function clearRuntimeDiagnostics(): void {
  diagnostics.length = 0
}
