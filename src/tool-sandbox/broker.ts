import { capabilityLeaseSchema, type CapabilityLease, type SandboxCapabilities, type ToolAuthorizationReceipt, type ToolAuthorizationRequest } from "./contracts";

export interface PermissionBrokerOptions { readonly now?: () => number; readonly id?: () => string; readonly capabilities: SandboxCapabilities }

export class PermissionBroker {
  readonly #leases = new Map<string, CapabilityLease>();
  readonly #revoked = new Set<string>();
  readonly #usedApprovals = new Map<string, string>();
  readonly #now: () => number;
  readonly #id: () => string;
  readonly capabilities: SandboxCapabilities;
  constructor(options: PermissionBrokerOptions) { this.#now = options.now ?? Date.now; this.#id = options.id ?? (() => crypto.randomUUID()); this.capabilities = Object.freeze({ ...options.capabilities }); }
  issue(input: unknown): CapabilityLease {
    const lease = capabilityLeaseSchema.parse(input);
    if (lease.expiresAt <= lease.issuedAt || lease.expiresAt <= this.#now()) throw new Error("lease-expired: Capability lease must be short-lived and current.");
    const prior = this.#usedApprovals.get(lease.approvalId);
    if (prior) throw new Error("approval-replay: Approval was already consumed by a capability lease.");
    if (this.#leases.has(lease.leaseId)) throw new Error("lease-conflict: Lease id already exists.");
    this.#usedApprovals.set(lease.approvalId, lease.requestDigest);
    const frozen = deepFreeze({ ...lease, scopes: [...new Set(lease.scopes)], allowedPaths: [...lease.allowedPaths], allowedCommands: [...lease.allowedCommands], allowedHosts: [...lease.allowedHosts], limits: { ...lease.limits } });
    this.#leases.set(frozen.leaseId, frozen);
    return frozen;
  }
  revoke(leaseId: string) { this.#revoked.add(leaseId); }
  authorize(leaseId: string, request: ToolAuthorizationRequest): ToolAuthorizationReceipt {
    const at = this.#now(), lease = this.#leases.get(leaseId);
    const denied = (decision: ToolAuthorizationReceipt["decision"], reason: string, source?: CapabilityLease) => receipt(this.#id(), source, request, decision, reason, at);
    if (!lease) return denied("denied", "Unknown capability lease.");
    if (this.#revoked.has(leaseId)) return denied("denied", "Capability lease was revoked.", lease);
    if (at >= lease.expiresAt) return denied("denied", "Capability lease expired.", lease);
    if (lease.subject !== request.subject || lease.requestDigest !== request.requestDigest) return denied("denied", "Lease is bound to another subject or request.", lease);
    if (request.requiredScopes.some((scope) => !lease.scopes.includes(scope))) return denied("denied", "Required scope was not approved.", lease);
    if (request.command && !lease.allowedCommands.includes(request.command)) return denied("denied", "Command was not allowlisted.", lease);
    if (request.path && !pathAllowed(request.path, lease.allowedPaths)) return denied("denied", "Path is outside approved paths.", lease);
    const requestedHost = request.host;
    if (requestedHost && !lease.allowedHosts.some((host) => requestedHost === host || requestedHost.endsWith(`.${host}`))) return denied("denied", "Network host was not approved.", lease);
    if ((request.estimatedBytes ?? 0) > lease.limits.maxBytes) return denied("denied", "Byte limit exceeded.", lease);
    if (request.requiredScopes.includes("network") && this.capabilities.networkIsolation === "capability-required") return denied("capability-required", "This host cannot enforce network isolation.", lease);
    return receipt(this.#id(), lease, request, "allowed", undefined, at);
  }
}

function pathAllowed(path: string, roots: readonly string[]) { const normalized = path.replaceAll("\\", "/"); return !normalized.startsWith("/") && !/(^|\/)\.\.(\/|$)/.test(normalized) && roots.some((root) => normalized === root || normalized.startsWith(`${root.replace(/\/$/, "")}/`)); }
function receipt(id: string, lease: CapabilityLease | undefined, request: ToolAuthorizationRequest, decision: ToolAuthorizationReceipt["decision"], reason: string | undefined, at: number): ToolAuthorizationReceipt { return deepFreeze({ version: "cutout.tool-authorization-receipt.v1", receiptId: `authorization:${id}`, leaseId: lease?.leaseId ?? "unknown", approvalId: lease?.approvalId ?? "unknown", requestDigest: request.requestDigest, decision, scopes: [...request.requiredScopes], ...(reason ? { reason } : {}), at }); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
