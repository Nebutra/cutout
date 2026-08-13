# Commerce evidence and production profile - technical design

## Data Flow

Bounded input inventory -> structural parsers -> `product-facts.v1` with
JSON-pointer/source lineage -> catalog resolver -> market/channel policy compiler
-> declarative commerce Outcome fragments -> Kernel Plan -> capability receipts
-> commerce evaluators -> typed deliverable materials.

Text, image and video instructions all consume the same fact and identity-lock
closure. The Profile owns commerce vocabulary and role labels; the Kernel sees
typed artifacts, dependencies, constraints and evaluation gates. Competition
output naming is an outer target projection.

## Trust And Compatibility

HTML, URLs and free text never become trusted instructions. URL media stays a
validated descriptor unless the authorized Host provides reviewed bytes. Policy
packs carry source/version metadata and work offline. The Profile is a strict,
content-addressed declarative package locked by exact version/hash.

The first integration uses mocked capability receipts so normalization and
evaluation can land before external spend. Removing the Profile must leave the
prototype Kernel fixtures unchanged.

## Benchmark

The Profile owns a host-neutral `commerce.profile-benchmark.v1` report. Stable
capability metrics are grouped by evidence tier: deterministic contract and
policy checks, mocked-Host production, and real-Host byte/execution evidence.
The runner derives metric state from decoded Profile artifacts and evaluations;
it does not accept a caller-authored aggregate score. Reports expose passed,
failed and blocked counts per tier, plus a production frontier. Real production
is ready only when every required real-Host metric passes.

Snapshot comparison requires the same benchmark id/version and metric closure.
It reports exact status transitions, newly passed metrics and regressions. The
Competition Host may add an outer official-score projection, but competition
weights, filenames and sample-specific rules do not enter this benchmark.

Version 1 has no trusted real-Host verifier. Consequently, a caller-authored
receipt kind, hash or artifact-byte label can never produce a passing real-Host
metric: report creation and decoding fail closed on such a claim. Real metrics
remain blocked until a later Host supplies a reviewed verification contract
that recomputes receipt and artifact-byte bindings from authoritative evidence.
The committed current snapshot lives under `src/commerce-profile/benchmarks/`
so normal task archival cannot remove the product benchmark history.

## Rollback

Facts, catalogs and policies are additive modules. Provider integration and the
competition projection can be removed without migrating Design IR or changing
the prototype workflow.
