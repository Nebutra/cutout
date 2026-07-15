import { z } from "zod";

export const toolScopeSchema = z.enum(["read", "write", "execute", "network", "paid", "credential"]);
export type ToolScope = z.infer<typeof toolScopeSchema>;

export const sandboxCommandSchema = z.enum(["typecheck", "test", "build", "lint", "visual-test"]);
export type SandboxCommand = z.infer<typeof sandboxCommandSchema>;

export const toolLimitsSchema = z.object({
  maxDurationMs: z.number().int().min(1).max(3_600_000),
  maxBytes: z.number().int().min(1).max(100_000_000),
  maxProcesses: z.number().int().min(1).max(64),
  maxCpuMs: z.number().int().min(1).max(3_600_000).optional(),
}).strict();
export type ToolLimits = z.infer<typeof toolLimitsSchema>;

export const capabilityLeaseSchema = z.object({
  version: z.literal("cutout.capability-lease.v1"),
  leaseId: z.string().regex(/^lease:[a-zA-Z0-9._:-]+$/),
  approvalId: z.string().min(1).max(200),
  subject: z.string().min(1).max(200),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: z.array(toolScopeSchema).min(1),
  workspaceRoot: z.string().min(1),
  allowedPaths: z.array(z.string().min(1)).max(100),
  allowedCommands: z.array(sandboxCommandSchema).max(5),
  allowedHosts: z.array(z.string().min(1)).max(100),
  limits: toolLimitsSchema,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();
export type CapabilityLease = z.infer<typeof capabilityLeaseSchema>;

export interface ToolAuthorizationRequest {
  readonly subject: string;
  readonly requestDigest: string;
  readonly requiredScopes: readonly ToolScope[];
  readonly path?: string;
  readonly command?: SandboxCommand;
  readonly host?: string;
  readonly estimatedBytes?: number;
}

export interface ToolAuthorizationReceipt {
  readonly version: "cutout.tool-authorization-receipt.v1";
  readonly receiptId: string;
  readonly leaseId: string;
  readonly approvalId: string;
  readonly requestDigest: string;
  readonly decision: "allowed" | "denied" | "capability-required";
  readonly scopes: readonly ToolScope[];
  readonly reason?: string;
  readonly at: number;
}

export interface SandboxCapabilities {
  readonly canonicalWorkspaceRoot: true;
  readonly symlinkBoundary: true;
  readonly commandAllowlist: true;
  readonly environmentAllowlist: true;
  readonly wallClockTimeout: true;
  readonly byteLimit: true;
  readonly processTreeCancellation: "supported" | "capability-required";
  readonly cpuLimit: "supported" | "capability-required";
  readonly networkIsolation: "supported" | "capability-required";
}

export const commandRisk: Record<SandboxCommand, "read-like" | "build" | "browser"> = {
  typecheck: "read-like",
  lint: "read-like",
  test: "build",
  build: "build",
  "visual-test": "browser",
};
