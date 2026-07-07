export type AiNativeDiagnosticLevel = 'info' | 'warn' | 'error'

export interface AiNativeDiagnostic {
  readonly id: string
  readonly at: number
  readonly level: AiNativeDiagnosticLevel
  readonly scope: string
  readonly message: string
  readonly details?: unknown
}

const MAX_DIAGNOSTICS = 80
const diagnostics: AiNativeDiagnostic[] = []

export function recordAiNativeDiagnostic(input: {
  readonly level: AiNativeDiagnosticLevel
  readonly scope: string
  readonly message: string
  readonly details?: unknown
}): AiNativeDiagnostic {
  const diagnostic: AiNativeDiagnostic = {
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

export function getAiNativeDiagnostics(): readonly AiNativeDiagnostic[] {
  return diagnostics
}

export function clearAiNativeDiagnostics(): void {
  diagnostics.length = 0
}
