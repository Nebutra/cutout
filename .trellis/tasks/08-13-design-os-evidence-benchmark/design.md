# Design OS evidence benchmark - technical design

## Architecture

`src/design-os-benchmark/` owns a Profile-neutral, versioned progress report.
It does not evaluate a design domain directly. Each Profile adapter must first
strictly decode its owning report, then project fixed metric definitions and
statuses into the general protocol. This keeps Commerce policy in Commerce and
prevents the benchmark core from becoming a collection of scenario branches.

The v1 ruler has one Profile, `commerce`, and seventeen fixed metrics. Existing
Commerce P1-P5 metrics map to `contract`, mocked P6-P7 metrics map to
`conformance`, real P6-P7 metrics map to `real-host`, and a Profile-owned
`production-rehearsal` blocker makes the final boundary explicit. Every metric
binds the source report identity and canonical SHA-256.

The report derives:

- exact counts for every stage;
- coverage as passed metrics over the version-frozen closure;
- maturity as the last contiguous fully passed stage, or `unproven`;
- the first non-ready stage and all non-passing critical metrics;
- release readiness only when every metric and every stage passes.

Coverage is descriptive, not an authority override. Readiness and release
regression stay hard-gated.

## Trust Boundary

The generic decoder validates exact v1 definitions, source bindings and every
derived field. The Commerce adapter calls `decodeCommerceProfileBenchmarkReport`
before projection. The durable Design OS snapshot can therefore be regenerated
from the durable Commerce report without Provider access.

Real-host Commerce reports remain a separate stronger boundary. The partially
implemented trusted helper is not admitted because native receipt authenticity
alone does not prove exact semantic role closure or Commerce evaluation. V1
keeps those metrics blocked until a re-verifiable bundle can reconstruct the
eleven publications, capability receipts, graph/Plan bindings, semantic QA and
playback proof and call `evaluateCommerceProduction` internally.

## Compatibility And Rollback

Benchmark comparisons require equal id and version. Adding another Profile or
changing mappings creates v2; v1 historical snapshots remain decodable. The
new module is observational and does not mutate Design IR, execute Providers or
change public Agent capability claims. Rollback removes the projection and
command without changing Commerce evidence.
