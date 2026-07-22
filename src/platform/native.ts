/**
 * Native platform bridge — the ONLY module allowed to import `@tauri-apps/api`.
 *
 * Everything above (services, hooks, components) depends on the `NativeBridge`
 * interface, so tests inject a fake and no Tauri runtime is required. See spec §4a.
 */
import { invoke } from '@tauri-apps/api/core'

/** One asset to persist. `bytes` is primary; `dataUrl` is a fallback. */
export interface SaveAssetInput {
  name: string
  bytes?: Uint8Array
  dataUrl?: string
}

/** A single file that failed to write, mirrored from the Rust `FailedWrite`. */
export interface FailedWrite {
  name: string
  error: string
}

/** Result of a save operation, mirrored from the Rust `SaveAssetsResult`. */
export interface SaveAssetsResult {
  canceled: boolean
  outputDir: string | null
  count: number
  failed: FailedWrite[]
}

export interface SaveBundleFileInput {
  path: string
  bytes: Uint8Array
}

export interface SaveBundleInput {
  name: string
  files: SaveBundleFileInput[]
}

export interface SaveBundleFileReceipt {
  path: string
  size: number
  sha256: string
}

export interface SaveBundleResult {
  canceled: boolean
  outputDir: string | null
  bundleDir: string | null
  fileCount: number
  totalBytes: number
  files: SaveBundleFileReceipt[]
}

export interface NativeRepositoryScanResult {
  canceled: boolean
  label: string | null
  entries: { path: string; bytes: number; mediaType: string; sha256: string }[]
  frameworkHints: { framework: string; evidence: string[]; confidence: 'medium' | 'high' }[]
  excluded: Record<'symbolicLink' | 'secretPath' | 'secretContent' | 'ignoredDirectory' | 'binary' | 'oversized' | 'unsupported', number>
}

export interface WorkspaceAuthorizationResult {
  canceled: boolean
  handle: string | null
  label: string | null
}

export interface NativeRunEventStoreSnapshot {
  store: unknown
  sha256: string | null
  exists: boolean
}

export interface GitCapability {
  available: boolean
  repository: boolean
  gitVersion: string | null
  repositoryId: string | null
  message: string | null
}

export interface GitFileStatus {
  path: string
  originalPath: string | null
  indexStatus: string
  worktreeStatus: string
  conflicted: boolean
}

export interface GitStatusSnapshot {
  repositoryId: string
  snapshotToken: string
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  detached: boolean
  files: GitFileStatus[]
}

export interface GitCommitSummary {
  oid: string
  shortOid: string
  parents: string[]
  author: string
  authoredAt: string
  decorations: string[]
  subject: string
}
export interface GitCommitFile { path: string; originalPath: string | null; status: string }
export interface GitBranchComparison { base: string; compare: string; baseOnly: number; compareOnly: number; files: GitCommitFile[] }
export type GitMutation = { kind: 'commit'; message: string } | { kind: 'create-branch'; name: string } | { kind: 'switch-branch'; name: string }
export interface GitMutationPreview { planId: string; repositoryId: string; snapshotToken: string; mutation: GitMutation; warnings: string[] }
export interface GitMutationReceipt { planId: string; operation: string; status: GitStatusSnapshot }

export interface GitBranchSummary {
  name: string
  oid: string
  upstream: string | null
  ahead: number
  behind: number
  lastCommitSubject: string
  lastCommittedAt: string
  current: boolean
  remote: boolean
}

export interface GitDiffResult {
  path: string
  target: 'worktree' | 'staged'
  kind: 'text' | 'binary' | 'oversized' | 'unsupported-encoding'
  patch: string
  truncated: boolean
}

export interface GitPushPreview {
  planId: string
  repositoryId: string
  branch: string
  remote: string
  upstream: string | null
  setUpstream: boolean
}

export type VectorizerAiMode =
  | 'production'
  | 'preview'
  | 'test'
  | 'test_preview'

export interface VectorizeSvgResult {
  svg: string
}

export interface NativeBridge {
  /** Persist assets under a fresh native folder-picker grant. */
  saveAssets(assets: SaveAssetInput[]): Promise<SaveAssetsResult>
  /** Atomically write a nested multi-file bundle under a native-picked root. */
  saveBundle(bundle: SaveBundleInput): Promise<SaveBundleResult>
  /** Opens a native folder picker and returns a metadata-only safe inventory. */
  scanRepository?(): Promise<NativeRepositoryScanResult>
  /** Optional local Git capability, available in the desktop host only. */
  authorizeWorkspace?(): Promise<WorkspaceAuthorizationResult>
  readRunEventStore?(workspaceHandle: string): Promise<NativeRunEventStoreSnapshot>
  writeRunEventStore?(
    workspaceHandle: string,
    expectedSha256: string | null,
    store: unknown,
  ): Promise<NativeRunEventStoreSnapshot>
  gitCapability?(workspaceHandle: string): Promise<GitCapability>
  gitStatus?(workspaceHandle: string): Promise<GitStatusSnapshot>
  gitLog?(workspaceHandle: string, limit?: number, skip?: number): Promise<GitCommitSummary[]>
  gitCommitFiles?(workspaceHandle: string, oid: string): Promise<GitCommitFile[]>
  gitCommitDiff?(workspaceHandle: string, oid: string, path: string): Promise<GitDiffResult>
  gitBranches?(workspaceHandle: string): Promise<GitBranchSummary[]>
  gitBranchCompare?(workspaceHandle: string, base: string, compare: string): Promise<GitBranchComparison>
  gitDiff?(workspaceHandle: string, path: string, target: 'worktree' | 'staged'): Promise<GitDiffResult>
  gitStage?(workspaceHandle: string, expectedSnapshotToken: string, paths: string[]): Promise<GitStatusSnapshot>
  gitUnstage?(workspaceHandle: string, expectedSnapshotToken: string, paths: string[]): Promise<GitStatusSnapshot>
  gitPreviewMutation?(workspaceHandle: string, expectedSnapshotToken: string, mutation: GitMutation): Promise<GitMutationPreview>
  gitApplyMutation?(workspaceHandle: string, planId: string): Promise<GitMutationReceipt>
  gitCommit?(workspaceHandle: string, expectedSnapshotToken: string, message: string): Promise<GitStatusSnapshot>
  gitCreateBranch?(workspaceHandle: string, expectedSnapshotToken: string, name: string): Promise<GitStatusSnapshot>
  gitSwitchBranch?(workspaceHandle: string, expectedSnapshotToken: string, name: string): Promise<GitStatusSnapshot>
  gitPushPreview?(workspaceHandle: string, expectedSnapshotToken: string): Promise<GitPushPreview>
  gitPush?(workspaceHandle: string, planId: string): Promise<GitStatusSnapshot>
  setVectorizerApiKey(apiId: string, apiSecret: string): Promise<void>
  vectorizerKeyStatus(apiId: string): Promise<boolean>
  deleteVectorizerApiKey(apiId: string): Promise<void>
  vectorizeLocalVTracer(bytes: Uint8Array): Promise<VectorizeSvgResult>
  vectorizeVectorizerAi(input: {
    apiId: string
    bytes: Uint8Array
    mode?: VectorizerAiMode
  }): Promise<VectorizeSvgResult>
}

/**
 * Transport shape: `Uint8Array` is converted to a plain `number[]` because
 * `invoke` serializes arguments as JSON. Rust deserializes `Vec<u8>` from it.
 */
interface SaveAssetPayload {
  name: string
  bytes: number[] | null
  dataUrl: string | null
}

interface SaveBundlePayload {
  name: string
  files: { path: string; bytes: number[] }[]
}

function toPayload(asset: SaveAssetInput): SaveAssetPayload {
  return {
    name: asset.name,
    bytes: asset.bytes ? Array.from(asset.bytes) : null,
    dataUrl: asset.dataUrl ?? null,
  }
}

/** Concrete Tauri implementation of {@link NativeBridge}. */
export const tauriBridge: NativeBridge = {
  saveAssets: (assets) =>
    invoke<SaveAssetsResult>('save_assets', {
      assets: assets.map(toPayload),
    }),
  saveBundle: (bundle) => {
    const payload: SaveBundlePayload = {
      name: bundle.name,
      files: bundle.files.map((file) => ({
        path: file.path,
        bytes: Array.from(file.bytes),
      })),
    }
    return invoke<SaveBundleResult>('save_bundle', { bundle: payload })
  },
  scanRepository: () => invoke<NativeRepositoryScanResult>('scan_repository'),
  authorizeWorkspace: () => invoke<WorkspaceAuthorizationResult>('registry_authorize_workspace'),
  readRunEventStore: (workspaceHandle) =>
    invoke<NativeRunEventStoreSnapshot>('workspace_run_events_read', { workspaceHandle }),
  writeRunEventStore: (workspaceHandle, expectedSha256, store) =>
    invoke<NativeRunEventStoreSnapshot>('workspace_run_events_write', {
      workspaceHandle,
      expectedSha256,
      store,
    }),
  gitCapability: (workspaceHandle) => invoke<GitCapability>('git_capability', { workspaceHandle }),
  gitStatus: (workspaceHandle) => invoke<GitStatusSnapshot>('git_status', { workspaceHandle }),
  gitLog: (workspaceHandle, limit, skip) => invoke<GitCommitSummary[]>('git_log', { workspaceHandle, limit: limit ?? null, skip: skip ?? null }),
  gitCommitFiles: (workspaceHandle, oid) => invoke<GitCommitFile[]>('git_commit_files', { workspaceHandle, oid }),
  gitCommitDiff: (workspaceHandle, oid, path) => invoke<GitDiffResult>('git_commit_diff', { workspaceHandle, oid, path }),
  gitBranches: (workspaceHandle) => invoke<GitBranchSummary[]>('git_branches', { workspaceHandle }),
  gitBranchCompare: (workspaceHandle, base, compare) => invoke<GitBranchComparison>('git_branch_compare', { workspaceHandle, base, compare }),
  gitDiff: (workspaceHandle, path, target) => invoke<GitDiffResult>('git_diff', { workspaceHandle, path, target }),
  gitStage: (workspaceHandle, expectedSnapshotToken, paths) => invoke<GitStatusSnapshot>('git_stage', { workspaceHandle, expectedSnapshotToken, paths }),
  gitUnstage: (workspaceHandle, expectedSnapshotToken, paths) => invoke<GitStatusSnapshot>('git_unstage', { workspaceHandle, expectedSnapshotToken, paths }),
  gitPreviewMutation: (workspaceHandle, expectedSnapshotToken, mutation) => invoke<GitMutationPreview>('git_preview_mutation', { workspaceHandle, expectedSnapshotToken, mutation }),
  gitApplyMutation: (workspaceHandle, planId) => invoke<GitMutationReceipt>('git_apply_mutation', { workspaceHandle, planId }),
  gitCommit: (workspaceHandle, expectedSnapshotToken, message) => invoke<GitStatusSnapshot>('git_commit', { workspaceHandle, expectedSnapshotToken, message }),
  gitCreateBranch: (workspaceHandle, expectedSnapshotToken, name) => invoke<GitStatusSnapshot>('git_create_branch', { workspaceHandle, expectedSnapshotToken, name }),
  gitSwitchBranch: (workspaceHandle, expectedSnapshotToken, name) => invoke<GitStatusSnapshot>('git_switch_branch', { workspaceHandle, expectedSnapshotToken, name }),
  gitPushPreview: (workspaceHandle, expectedSnapshotToken) => invoke<GitPushPreview>('git_push_preview', { workspaceHandle, expectedSnapshotToken }),
  gitPush: (workspaceHandle, planId) => invoke<GitStatusSnapshot>('git_push', { workspaceHandle, planId }),
  setVectorizerApiKey: (apiId, apiSecret) =>
    invoke('set_vectorizer_api_key', { apiId, apiSecret }),
  vectorizerKeyStatus: (apiId) =>
    invoke<boolean>('vectorizer_key_status', { apiId }),
  deleteVectorizerApiKey: (apiId) =>
    invoke('delete_vectorizer_api_key', { apiId }),
  vectorizeLocalVTracer: (bytes) =>
    invoke<VectorizeSvgResult>('vectorize_local_vtracer', {
      bytes: Array.from(bytes),
    }),
  vectorizeVectorizerAi: ({ apiId, bytes, mode }) =>
    invoke<VectorizeSvgResult>('vectorize_vectorizer_ai', {
      apiId,
      bytes: Array.from(bytes),
      mode: mode ?? null,
    }),
}
