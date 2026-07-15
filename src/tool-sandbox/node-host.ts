import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { SandboxCommand, ToolLimits } from "./contracts";
import { controlledEnvironment } from "./environment";

export async function canonicalWorkspaceRoot(root: string): Promise<string> {
  return realpath(root);
}

export async function resolveSandboxPath(root: string, requested = "."): Promise<string> {
  if (isAbsolute(requested)) throw new Error("absolute-path: Sandbox paths must be workspace-relative.");
  const normalized = requested.replaceAll("\\", "/");
  if (/(^|\/)\.\.(\/|$)/.test(normalized)) throw new Error("path-traversal: Parent traversal is not allowed.");
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  const candidate = resolve(canonicalRoot, requested);
  const rel = relative(canonicalRoot, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("path-escape: Path is outside the workspace.");

  let cursor = canonicalRoot;
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    const stat = await lstat(cursor).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (stat?.isSymbolicLink()) throw new Error("symlink-escape: Symbolic links are not allowed in sandbox paths.");
  }
  return candidate;
}

export interface ControlledCommandSpec { readonly file: string; readonly args: readonly string[] }
export type ControlledCommandMap = Readonly<Record<SandboxCommand, ControlledCommandSpec>>;
export interface ControlledRunResult { readonly command: SandboxCommand; readonly exitCode: number | null; readonly stdout: string; readonly stderr: string; readonly durationMs: number }

export async function runControlledCommand(input: {
  readonly root: string;
  readonly cwd?: string;
  readonly command: SandboxCommand;
  readonly commands: ControlledCommandMap;
  readonly limits: ToolLimits;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
}): Promise<ControlledRunResult> {
  const spec = input.commands[input.command];
  if (!spec) throw new Error("command-denied: Command is not configured by the host.");
  if (process.platform === "win32") throw new Error("capability-required: Reliable process-tree cancellation requires a Windows job-object host adapter.");
  const cwd = await resolveSandboxPath(input.root, input.cwd);
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const sourceEnv = input.env ?? process.env;
    const child = spawn(spec.file, [...spec.args], { cwd, env: controlledEnvironment(sourceEnv, ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"]), shell: false, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0, settled = false;
    const stopTree = (signal: NodeJS.Signals) => { if (child.pid) { try { process.kill(-child.pid, signal); } catch { child.kill(signal); } } };
    const finishError = (error: Error) => { if (settled) return; settled = true; cleanup(); stopTree("SIGKILL"); reject(error); };
    const collect = (kind: "stdout" | "stderr", chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > input.limits.maxBytes) return finishError(new Error("byte-limit: Command output exceeded its approved byte limit."));
      if (kind === "stdout") stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.once("error", finishError);
    child.once("close", (exitCode) => { if (settled) return; settled = true; cleanup(); resolvePromise({ command: input.command, exitCode, stdout, stderr, durationMs: Date.now() - started }); });
    const timeout = setTimeout(() => finishError(new Error("time-limit: Command exceeded its approved wall-clock duration.")), input.limits.maxDurationMs);
    const abort = () => finishError(new DOMException("Command cancelled.", "AbortError"));
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
    function cleanup() { clearTimeout(timeout); input.signal?.removeEventListener("abort", abort); }
  });
}
