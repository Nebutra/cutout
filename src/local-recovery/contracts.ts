export const LOCAL_DATA_CONTRACT = {
  authoritative: '.cutout',
  projection: 'indexeddb',
  projectionRebuildable: true,
  remoteSync: false,
} as const

export interface RecoverySnapshot {
  readonly id: string
  readonly projectId: string
  readonly revision: number
  readonly createdAt: string
  readonly sha256: string
  readonly bytes: Uint8Array
}

export interface RecoveryBlob { readonly id: string; readonly bytes: Uint8Array; readonly referencedBy: readonly string[] }
export interface RecoveryQuota { readonly availableBytes: number; readonly requiredBytes: number; readonly ok: boolean }
export interface RecoveryRepairReport { readonly removedCorruptSnapshots: readonly string[]; readonly removedOrphanBlobs: readonly string[]; readonly rebuiltProjection: boolean }

export interface RecoveryBackend {
  listSnapshots(projectId: string): Promise<readonly RecoverySnapshot[]>
  putSnapshot(snapshot: RecoverySnapshot): Promise<void>
  removeSnapshot(id: string): Promise<void>
  listBlobs(): Promise<readonly RecoveryBlob[]>
  removeBlob(id: string): Promise<void>
  projectionExists(projectId: string): Promise<boolean>
  rebuildProjection(projectId: string, bytes: Uint8Array): Promise<void>
  availableBytes(): Promise<number>
}

export interface CrashMarker { readonly sessionId: string; readonly startedAt: string; readonly cleanExit: boolean; readonly crashCount: number }
export interface CrashMarkerStore { read(): CrashMarker | undefined; write(marker: CrashMarker): void; clear(): void }

export interface DiagnosticEvent {
  readonly at: string
  readonly level: 'info' | 'warn' | 'error'
  readonly scope: 'ui' | 'tauri' | 'host' | 'provider' | 'storage'
  readonly code: string
  readonly correlationId: string
  readonly details?: unknown
}

export interface DiagnosticBundle {
  readonly protocol: 'cutout.diagnostics.v1'
  readonly generatedAt: string
  readonly app: { readonly version: string; readonly safeMode: boolean }
  readonly storage: typeof LOCAL_DATA_CONTRACT
  readonly events: readonly DiagnosticEvent[]
}
