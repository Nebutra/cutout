# Technical Design

## Dependency waves

1. **Durable execution safety (#2, #7):** require a successful node claim before an effect and a live lease at terminal transitions.
2. **Authorization and transactions (#1, #3):** issue request-digest-bound capability leases and persist reservation/pending/completed state under a cross-process transaction boundary.
3. **Host boundaries (#4, #5):** reduce native permissions and make controlled reads/execs resistant to path replacement.
4. **Evidence and gates (#6, #9):** attribute browser evidence to scenarios and enforce native/package checks in CI.
5. **Execution spine (#8, #10):** bind all generated and coding deliverables to one versioned composite receipt and injected bounded adapters.
6. **Outcome UX (#11):** build the Creative Board over the verified material, provenance, approval, and receipt primitives.

## Invariants

- Absence, expiry, mismatch, replay, takeover, cancellation, and stale revisions fail before side effects.
- Paid/external effects have one durable owner and one immutable receipt.
- No caller-controlled arbitrary path, command, provider, or approval object crosses a trust boundary.
- User-facing progress reports outcomes and actionable blockers; diagnostics remain available without exposing secrets.
