export type UpdateChannel = "stable" | "beta";
export type UpdateRetryAction = "check" | "download" | "install";

export interface UpdateChannelCapability {
  readonly available: boolean;
  readonly reason?: string;
}

export interface UpdateRelease {
  readonly version: string;
  readonly notes?: string;
  readonly publishedAt?: string;
}

export interface UpdateCapability {
  readonly available: boolean;
  readonly currentVersion: string;
  readonly reason?: string;
  readonly endpointConfigured: boolean;
  readonly pubkeyConfigured: boolean;
  readonly channels: Readonly<Record<UpdateChannel, UpdateChannelCapability>>;
}

export class UpdateOperationError extends Error {
  readonly retryAction: UpdateRetryAction;

  constructor(
    message: string,
    retryAction: UpdateRetryAction,
  ) {
    super(message);
    this.name = "UpdateOperationError";
    this.retryAction = retryAction;
  }
}

export interface UpdateBackend {
  capability(): Promise<UpdateCapability>;
  check(channel: UpdateChannel): Promise<UpdateRelease | undefined>;
  download(
    release: UpdateRelease,
    onProgress: (downloaded: number, total?: number) => void,
  ): Promise<void>;
  cancel(): Promise<void>;
  installAndRestart(release: UpdateRelease): Promise<void>;
}

export interface UpdateInstallSafety {
  hasActiveAgentRun(): Promise<boolean>;
  createRecoverySnapshot(): Promise<void>;
  shutdownDurableHost(): Promise<void>;
}

export interface UpdatePreferences {
  readonly channel: UpdateChannel;
  readonly autoCheck: boolean;
  readonly lastCheckedAt?: string;
}

export interface UpdatePreferenceStore {
  read(): UpdatePreferences;
  write(value: UpdatePreferences): void;
}

export type UpdatePhase =
  | "loading"
  | "unavailable"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdateState {
  readonly phase: UpdatePhase;
  readonly capability?: UpdateCapability;
  readonly preferences: UpdatePreferences;
  readonly release?: UpdateRelease;
  readonly downloaded: number;
  readonly total?: number;
  readonly error?: string;
  readonly retryAction?: UpdateRetryAction;
}
