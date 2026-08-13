# Commerce evidence and production profile - implementation plan

## Order

- [x] Freeze legal public sample fixture schemas plus held-out variants.
- [x] Add bounded input inventory, parsers and `product-facts.v1` lineage.
- [x] Add deterministic category/attribute index and closure validation.
- [x] Add versioned AliExpress/en-US/ko-KR/pt-BR offline policy packages,
      compilers and validators.
- [x] Define declarative commerce Outcome roles, recipe DAG and evaluator card.
- [x] Implement localized copy/strategy document schemas and fact citations.
- [x] Integrate mocked image/video/text receipts, identity locks, quality gates
      and targeted repair.
- [x] Prove profile isolation and hand the frozen Profile to the benchmark Host.
- [x] Add the versioned P1-P8 benchmark runner, evidence-tier readiness report,
      compatible snapshot diff and committed current capability snapshot.

## Validation

- [x] Run parser path/size/HTML tests and all public/held-out fixtures.
- [x] Run catalog, locale, fact-lineage, Profile isolation, DAG and evaluator tests.
- [x] Run benchmark truth-tier, readiness, delta and regression tests.
- [x] Run Kernel conformance, type-check, lint and `rtk git diff --check`.

## Dependency And Rollback

Depends on Kernel schemas and registries, but can develop against frozen
interfaces with mocked Host capabilities. It must not import Competition Host
filenames, authorization or score-specific branching.
