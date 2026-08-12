# Run 049 packaged production-health retrospective

Date: 2026-08-10

## Outcome

`cutout-e2e-run-049-seed-contract` failed truthfully at the outer one-hour
deadline. It did not produce `result.json`, resource packs, or a terminal
delivery. The retained harness reports:

```text
harness.status: failed
harness.reason: outer-timeout
smokeExitCode: 1
foreground activations: 0 / 3620 samples
```

The final page frontier was approximately `4/7`, `4/7`, and `1/7` across the
three suites. Resource production never started.

## What the run proved

- Automatic local credential discovery and native import succeeded.
- The planning turn completed through an independent `planner-complete`
  checkpoint.
- The Agent selected three Design Systems and all three became ready.
- The Agent selected seven pages for each suite from the business intent.
- Reusable asset plans were semantic and variable: `11`, `4`, and `13`.
- Retry retained completed sibling work and resumed missing page frontiers.
- Background execution never made Cutout frontmost.

This closes the former seed/candidate-owner defect. It does not prove complete
asset delivery.

## Failure chronology

The retained `progress.json` records these elapsed milestones:

| Elapsed | Evidence |
| ---: | --- |
| 4m 06s | planner complete |
| 5m 52s | all Design Systems ready |
| 13m 29s | suite 1 reached 1/7 |
| 15m 13s | suite 1 failed at 1/7 |
| 16m 48s | suite 2 reached its first-page checkpoint |
| 17m 57s | suite 2 failed at 2/7 |
| 20m 35s | suite 3 failed at 0/7 |
| 25m 51s | retry resumed suite 2 to 4/7 |
| 40m 13s | retry resumed suite 1 to 4/7 |
| 54m 36s | retry resumed suite 3 to 1/7 |
| 60m | harness outer timeout |

The selected CC Switch Codex upstream advertised and executed `gpt-image-2`.
Design System image calls succeeded, but page-image calls repeatedly consumed
the 300-second native timeout and the bounded transient retry. Route support was
therefore true while sustained batch-production health was false.

## Root cause class

Provider routing currently treats these different facts too similarly:

1. the exact model appears in an authenticated catalog;
2. an executable typed transport exists;
3. one request has succeeded;
4. the exact provider/model/operation route is healthy enough for a fan-out.

Only the first three were represented. Once the page fan-out exposed repeated
route-wide timeouts, queued siblings continued to enter the unhealthy route.
The global workflow eventually made progress, but at a rate that could not
finish the Agent-authored plan inside a reasonable product session.

This is an orchestration and route-health ownership defect, not justification
to reduce page or asset counts, hardcode counts, or extend the outer timeout.

## Bug analysis: route support mistaken for production health

### 1. Root cause category

- **B - Cross-layer contract:** catalog discovery, exact capability evidence,
  native transport, renderer scheduling, Retry, and packaged evidence had no
  shared definition of sustained route health.
- **D - Test coverage gap:** transport and scheduler tests exercised bounded
  single failures, but no test opened a circuit from repeated timeouts while a
  sibling paid request remained in flight and queued work still existed.
- **E - Implicit assumption:** one successful Design System call was treated as
  evidence that the same provider/model route could sustain the later page-edit
  fan-out.

### 2. Why earlier fixes failed

1. Raising and ordering native/desktop/watchdog deadlines stopped duplicate
   paid calls caused by an outer owner expiring first, but did not classify a
   route that repeatedly consumed the full inner timeout.
2. Per-node transient retry recovered isolated 502/503 failures, but repeated
   route-wide timeouts caused every sibling to spend the same retry budget.
3. Adaptive concurrency reduced pressure from three calls to one, but one
   unhealthy 300-second call at a time is still an unusable production route.
4. Frontier-preserving Retry prevented replay, but it selected the same route
   again because transport support and production health were the same routing
   input.

### 3. Prevention mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Key bounded health by exact provider/model/operation and open a shared circuit after repeated native timeouts. | In progress |
| P0 | Runtime | Reject queued work after the circuit opens while allowing already in-flight paid requests to settle. | In progress |
| P0 | Retry | Preserve completed logical nodes and never replay their paid executions. | Done |
| P0 | Evidence | Project only sanitized outcome/latency samples and retain no Provider id, URL, error body, prompt, or secret. | In progress |
| P0 | E2E | Require a fresh packaged VM to complete the full Agent plan; a fast circuit-open failure is still a failure. | Pending run 050 |
| P1 | Routing | Use another route only when its exact model capability, executable transport, credential verification, and production health all pass. | Pending when an alternative exists |
| P1 | Harness | Detach remote terminal pipes before launching GUI descendants and terminate the complete test-owned process tree. | Done |

### 4. Systematic expansion

- **Similar issues:** vision review and direct/board generation must not share
  one Provider lane accidentally; generation and edit health must remain
  separate because a route may support one operation reliably and not the
  other.
- **Design improvement:** eligibility, first execution, and production health
  are separate monotonic evidence classes. No layer may collapse them into one
  boolean named `available`.
- **Process improvement:** real packaged runs must retain stage timing and
  frontier evidence so throughput regressions have an owning route and
  operation rather than appearing only as an outer timeout.

### 5. Knowledge capture

- [x] Record this retrospective under the active task.
- [ ] Synchronize the exact-route health and circuit contract into Provider,
      prototype-generation, pipeline, and cross-layer specs after code review.
- [ ] Add focused route-health, in-flight settlement, queued-work rejection,
      Retry preservation, and external evidence tests.
- [ ] Pass run 050 before changing any public capability or release state.

## Bayesian diagnosis

Before reviewing run-049 evidence, the plausible causes were Provider route
health (45%), scheduler starvation/state loss (30%), and planner/context drift
(25%). Independent `planner-complete`, three ready Design Systems, semantic
`7/7/7` page plans, variable `11/4/13` asset plans, and monotonic Retry
frontiers reduced planner/context drift below 5%. Round-robin progress across
all three suites and retained `4/7`, `4/7`, `1/7` outputs reduced state loss
below 10%. Repeated full native timeouts on the same exact edit route raise the
route-health diagnosis above 90%. The fix should therefore proceed with a
route-health circuit and a fresh packaged falsification run; it must still keep
state/frontier assertions because those lower-probability explanations are not
assumed impossible.

## Required prevention contracts

### Exact production-health key

Record bounded rolling evidence by exact provider, model, operation, and
transport strategy. Catalog support and a single successful execution remain
separate facts from bulk-production health. Renderer-visible diagnostics must
use an opaque/sanitized route identity.

### Route-wide circuit state

Classify authentication, configuration, rate limit, native timeout, and
repeated transient transport failure before scheduling more queued siblings.
After the bounded threshold, open the route circuit for the current production
run. Do not cancel already in-flight paid requests solely because the circuit
opened.

### Failover ownership

If another enabled, exact-capability, typed route has already passed its own
health checks, reschedule only unstarted or failed logical nodes onto that
route. A different route requires a fresh paid attempt identity and explicit
planned/actual execution evidence. Never interpret model naming or a
recommendation rank as authorization to fail over.

### Frontier preservation

Settled pages, Design Systems, slices, and resources are immutable inputs to
Retry. Recovery schedules only missing or failed logical frontiers. It must not
replay a successful paid node, even when its original route later becomes
unhealthy.

### Harness process ownership

Evidence finalization and remote-command exit are separate lifecycle edges.
The host runner must close or redirect inherited stdout/stderr for spawned GUI
helpers and terminate the complete test-owned process group after evidence is
finalized. A remote smoke command must exit without relying on VM shutdown to
break an inherited pipe.

## Retained evidence

Evidence root:

```text
/private/tmp/cutout-vm-evidence/run-049-seed-contract/final-evidence
```

Independent SHA-256 values:

```text
491271a952fdf443ed7c0708b5021c0875ce79a77eb4a48702c3765e67deddd7  captures/design-systems.png
726821fb9cb4526c3a124babc948fd6d442bb5545cf4da3bbe2fc9560fd07da6  foreground.json
01d18331812f8fe2ad84228e81259cbcc919aa436b8997d6c7ce4d7801553926  harness.json
7846e4d01bbc80764c393f3a28ff5840edd24edfc5466e17eab67d2bb152e03f  progress.json
4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865  smoke.exit
```

After verification, the VM was stopped and the test-owned residual
`expect`/SSH processes were terminated. No run-049 host process remains.

## Next proof

Run 050 must use a fresh VM and a newly packaged candidate. It passes only when
all four terminal facts agree:

```text
harness.status == passed
harness.reason == passed
smokeExitCode == 0
result.status == passed
```

The external validator must independently re-read retained media objects,
recompute hashes and dimensions, verify the complete Agent plan, and confirm
zero foreground activation.
