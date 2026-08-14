# Run 050 cold-route and shared-quota retrospective

Date: 2026-08-10

## Outcome

The fresh signed packaged run failed truthfully at the one-hour outer deadline.
It produced no `result.json`, no ready suite, and no resource pack:

```text
harness.status: failed
harness.reason: outer-timeout
smokeExitCode: 1
foreground activations: 0 / 3620 samples
```

Retained evidence is under:

```text
/private/tmp/cutout-vm-evidence/run-050-health-fallback/final-evidence
```

The standalone success validator rejects it with `result.json-missing`, as
required. The retained harness, progress, foreground and capture hashes match
the guest copies.

## Failure chronology

| Elapsed | Evidence |
| ---: | --- |
| 3m 24s | Planner completed. |
| 6m 17s | Three Design System candidates were ready. |
| 8m 35s | Suite 1 failed at `0/8` pages. |
| 10m 49s | Suite 3 reached its first passing page. |
| 16m 31s | Suite 3 failed while retaining `2/7` pages. |
| 17m 56s | Suite 2 failed at `0/7` pages. |
| 17m 56s | One visible Retry acknowledged every failed suite frontier. |
| 26m 59s | Retry produced suite 1's first passing page. |
| 57m 40s | Retry produced suite 2's first passing page. |
| 60m | Outer deadline failed with all resources still `0`. |

Automatic discovery imported one verified MOX Provider. Its authenticated
catalog exposed exact `gpt-image-2`, `gpt-image-1.5`, and `gpt-image-1`
generation/edit descriptors, so model-level failover existed without a second
credential. Native sockets and WebContent CPU remained active, and a very late
page passed QA. This disproves a renderer deadlock; the defect is unusable
admission and quota behavior around a slow exact route.

## Bug Analysis: Cold edit fan-out and hidden same-Provider QA amplification

### 1. Root Cause Category

- **Category: B - Cross-Layer Contract.** Capability assessment, route health,
  page scheduling, Vision review, and Retry each represented only part of the
  Provider capacity contract.
- **Category: D - Test Coverage Gap.** Scheduler tests covered timeout circuits
  and inline review order independently, but never asserted one combined
  Provider ceiling for cold image edits plus same-Provider Vision QA.
- **Category: E - Implicit Assumption.** A catalog-verified edit route with no
  successful execution sample was treated as safe for immediate fan-out, and
  `inline` review was assumed to mean shared-quota admission even though the
  review request bypassed the production limiter.

### 2. Why earlier fixes failed

1. **Exact timeout circuit:** it rejected work only after repeated full native
   timeouts. Three cold edit requests could already be in flight before the
   first sample existed.
2. **Adaptive shared ceiling:** it lived in one scheduler instance. A fresh
   Retry scheduler started at maximum concurrency even though process-local
   route evidence retained prior pressure.
3. **Model failover:** health preserved caller order. Descriptor alternatives
   were supplied in catalog order, so an unhealthy recommended model could
   fall directly to a weaker compatible model before the next recommended
   exact model.
4. **Inline QA:** it serialized generation and review inside one page, but QA
   did not consume the shared Provider limiter. Other suites could still fill
   every image slot while the same Provider handled Vision reviews.
5. **Frontier-preserving Retry:** it correctly avoided replay, but preserving
   work cannot compensate for admitting the continuation with the same hidden
   quota amplification.

### 3. Prevention mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Admit at most one request for an exact image route until its first execution settles; share the process-local route state with fresh Retry schedulers. | Done |
| P0 | Architecture | Put same-Provider Vision review in the same fair Provider queue as image generation/editing. | Done |
| P0 | Routing | Re-resolve an exact healthy edit route for every transient attempt and rank supported alternatives by fidelity recommendation before health. | Done |
| P0 | Tests | Prove cold-route canary admission, warm expansion, retry-pressure carry, combined image/QA ceiling, and recommended fallback ordering. | Done |
| P0 | E2E | Require a fresh packaged VM to complete the unchanged Agent-authored plan and resource packs inside the existing one-hour bound. | Pending |
| P1 | Evidence | Retain bounded per-operation success/failure latency so another slow success cannot be mistaken for complete delivery. | Existing; extend only if the fresh run disproves the P0 fix |

### 4. Systematic expansion

- **Similar issues:** direct assets and region boards use the same image plus
  Vision pattern and must share the same admission contract. A page-only fix
  would move the bottleneck to Asset Production.
- **Design improvement:** support, cold execution, warm production health and
  quota admission are distinct evidence classes. A scheduler may consume the
  latter two; it must not derive them from model names or catalog presence.
- **Process improvement:** every throughput regression must simulate a cold
  route and a same-Provider reviewer. Fast mocked calls with separate fake
  Providers do not exercise the production quota topology.

### 5. Knowledge capture

- [x] Retain run-050 terminal evidence and exact hashes.
- [x] Record this retrospective under the active task.
- [x] Update prototype, Provider, pipeline, and cross-layer specs after the
      implementation and review stabilize.
- [x] Add focused regressions.
- [ ] Complete the fresh packaged falsification run.

## Bayesian diagnosis

Before terminal evidence, plausible causes were Provider route health (45%),
orchestration/state loss (30%), and QA/context quality (25%). Monotonic
planning, three ready Design Systems, retained retry frontiers, active native
sockets, zero foreground activation, and a passing page at 57 minutes reduce a
deadlock/state-loss explanation below 5%. Exact fallback descriptors reduce
"no executable route" below 5%. The observed topology raises cold-route and
same-Provider quota admission above 80%; upstream slowness remains a real input,
but an orchestrator that multiplies an unproven route and hides QA outside its
quota owns the product failure. The fresh run must falsify this diagnosis
without reducing pages, resources, fidelity gates, or the outer bound.
