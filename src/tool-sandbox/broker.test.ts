import { describe, expect, it } from "vitest";
import { PermissionBroker } from "./broker";
import { controlledEnvironment } from "./environment";

const digest = "a".repeat(64);
const capabilities = { canonicalWorkspaceRoot: true, symlinkBoundary: true, commandAllowlist: true, environmentAllowlist: true, wallClockTimeout: true, byteLimit: true, processTreeCancellation: "supported", cpuLimit: "capability-required", networkIsolation: "supported" } as const;
const lease = (overrides: Record<string, unknown> = {}) => ({ version: "cutout.capability-lease.v1", leaseId: "lease:one", approvalId: "approval:one", subject: "coding:one", requestDigest: digest, scopes: ["read", "write", "execute"], workspaceRoot: "/workspace", allowedPaths: ["src"], allowedCommands: ["test"], allowedHosts: [], limits: { maxDurationMs: 1000, maxBytes: 100, maxProcesses: 2 }, issuedAt: 10, expiresAt: 20, ...overrides });

describe("PermissionBroker", () => {
  it("binds approvals, rejects replay, expiry, revocation and request substitution", () => {
    let now = 11; const broker = new PermissionBroker({ now: () => now, id: () => "id", capabilities });
    broker.issue(lease());
    expect(broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["execute"], command: "test" }).decision).toBe("allowed");
    expect(broker.authorize("lease:one", { subject: "coding:other", requestDigest: digest, requiredScopes: ["execute"] }).decision).toBe("denied");
    expect(() => broker.issue(lease({ leaseId: "lease:same-request" }))).toThrow("approval-replay");
    expect(() => broker.issue(lease({ leaseId: "lease:two", requestDigest: "b".repeat(64) }))).toThrow("approval-replay");
    broker.revoke("lease:one"); expect(broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["read"] }).reason).toMatch(/revoked/);
    const expiring = new PermissionBroker({ now: () => now, capabilities }); expiring.issue(lease()); now = 20;
    expect(expiring.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["read"] }).reason).toMatch(/expired/);
  });
  it("denies traversal, absolute paths, commands, bytes, host suffix tricks and unapproved scopes", () => {
    const broker = new PermissionBroker({ now: () => 11, capabilities }); broker.issue(lease({ scopes: ["read", "network"], allowedHosts: ["api.example.com"] }));
    for (const path of ["../secret", "/etc/passwd", "src/../../secret"]) expect(broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["read"], path }).decision).toBe("denied");
    expect(broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["execute"], command: "build" }).decision).toBe("denied");
    expect(broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["read"], estimatedBytes: 101 }).decision).toBe("denied");
    expect(broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["network"], host: "api.example.com.evil.test" }).decision).toBe("denied");
  });
  it("returns immutable receipts and truthful capability-required decisions", () => {
    const broker = new PermissionBroker({ now: () => 11, capabilities: { ...capabilities, networkIsolation: "capability-required" } }); broker.issue(lease({ scopes: ["network"], allowedHosts: ["example.com"] }));
    const receipt = broker.authorize("lease:one", { subject: "coding:one", requestDigest: digest, requiredScopes: ["network"], host: "example.com" });
    expect(receipt.decision).toBe("capability-required"); expect(Object.isFrozen(receipt)).toBe(true); expect(Object.isFrozen(receipt.scopes)).toBe(true);
  });
});

describe("controlledEnvironment", () => {
  it("copies only explicit non-secret names", () => { expect(controlledEnvironment({ PATH: "/bin", HOME: "/home", API_KEY: "secret" }, ["PATH"])).toEqual({ PATH: "/bin" }); expect(() => controlledEnvironment({ API_KEY: "secret" }, ["API_KEY"])).toThrow("Secret-shaped"); });
});
