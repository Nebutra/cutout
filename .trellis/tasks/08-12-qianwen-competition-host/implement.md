# Qianwen competition host package - implementation plan

## Order

- [x] Freeze competition schemas, legal sample subset, held-out fixtures and A1-A7 scorecard.
- [x] Build local evaluator/container/package harness before the entrypoint.
- [x] Assemble canonical Kernel/Profile dependencies with source/hash checks.
- [x] Add bounded filesystem, prompt, policy, logging, checkpoint and target ports.
- [x] Bind verified text/image/video Host adapters and benchmark authorization.
- [x] Implement root entrypoint, manifest, atomic output projection and failure semantics.
- [x] Prove public/held-out mocked runs, then one sanitized real rehearsal.
- [x] Record benchmark feedback through the promotion gate and reject leakage.
- [x] Add general category-lineage retrieval, exact-first attribute evidence,
      deterministic market localization and a repository-only public benchmark
      with source-category-free and title-only counterfactuals.
- [ ] Execute one fresh package-native real DashScope rehearsal for `1.0.3`.
- [x] Build the `1.0.3` submission candidate and validate its exact closure,
      version, package validator and tests from a standalone read-only extraction.

## Validation

- [x] Run package validator, clean Debian/Node container, network/path attack,
      failure/recovery, public/held-out evaluator and contact-sheet/video checks.
- [x] Run cross-host conformance, Kernel/Profile regressions, type-check, lint,
      full relevant tests, `pnpm agent:validate` and `rtk git diff --check`.
- [x] Run the reviewed public sample benchmark without model or network access;
      do not count it as a real Provider run or official competition score.

## Dependency And Rollback

Depends on Kernel, Commerce Profile and the minimum Wan/text/image Host routes.
It does not depend on Project Change Management or Desktop Workbench. Removing
the package leaves current Desktop/CLI/MCP behavior and capability claims intact.
