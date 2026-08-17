# Qianwen competition host package

## Goal

Deliver a small, independently runnable Qianwen cross-border material Agent
that proves the canonical Design OS Kernel and Commerce Profile under the real
benchmark constraints without forking product semantics or weakening safety.

## Requirements

- Package canonical Kernel/Profile contracts and recipes by import or verified
  generated projection with source version/hash. Host-local copies and stale
  projections fail packaging.
- Provide root `agent.js`, `agent.json`, `--prompt`, `--version`, log and exit-code
  behavior exactly required by the competition. Write only the requested
  allowlisted output root and read only supplied inputs/environment.
- Run on Debian 12 x86_64/Node 22 with no dependency install, within 100 MB ZIP,
  4 GB and 30 minutes. Use bounded concurrency, deadlines, checkpoint reuse,
  adaptive 429 backoff and terminal completeness checks.
- Authorize unattended execution only through a benchmark Host policy bound to
  exact Contract, Plan, model/origin allowlist, budget and target. It is not
  Agent self-approval and cannot change Desktop/public defaults.
- Use only allowed DashScope endpoints/models and reviewed result origins. Keep
  secrets out of inputs, logs, manifests and artifacts.
- Emit exactly three localized descriptions, one main image, five detail images,
  one playable video and one strategy document with required physical names and
  parseable content. Exit zero only on complete validated success.
- Build the evaluator/package harness before optimization and retain public plus
  held-out fixtures. Classify every benchmark improvement as Kernel, Profile or
  Host before promotion; block sample-specific values and score gaming.
- Keep public-sample gold labels and dataset fingerprints in a repository-only
  evaluator that is excluded from the submitted package. Require category
  retrieval to retain its result when source-category, attributes and SKU axes
  are removed, so the score cannot depend on copied labels or product ids.
- Do not expose benchmark video/headless support through CLI/MCP/manifest unless
  the same public surface is separately implemented and validated.

## Acceptance Criteria

- [x] B1: Clean Debian/Node execution with installation disabled passes entry,
      version, logging, path, network, ZIP, memory and deadline checks.
- [x] B2: A fixture run writes exactly the required parseable files and every
      media artifact passes hash, decode/playback, size and physical validation.
- [x] B3: Simulated 429/5xx/timeout/cancellation/restart cases complete without
      duplicate logical spend, late publication or loss of valid siblings.
- [x] B4: Path traversal, symlink, oversized input/output, malformed response,
      bad download origin and credential-shaped data fail closed and redact logs.
- [x] B5: Canonical cross-host fixture matches Kernel semantics and packaging
      fails when contract/recipe/evaluator source hashes are stale or duplicated.
- [x] B6: All public and held-out fixtures satisfy commerce fact/catalog/policy
      gates, at least 80% image usability and required video playability.
- [x] B7: A real pre-submission DashScope rehearsal on unseen data produces a
      sanitized evidence bundle; `pnpm agent:validate`, project checks and the
      package validator pass without changing unsupported public claims.
- [x] B8: The reviewed eleven-product public sample reports category Top-1,
      Recall@5 and Recall@30 at `11/11`, including `11/11` Top-1 both without
      the source category and from title-only facts. All `176/176` explicitly
      supported measurement facts localize deterministically, while public gold
      stays outside the runtime package.
- [ ] B9: Package version `1.0.3` completes a fresh package-native real
      DashScope Run and validates the resulting eleven files. This remains
      separate from official hidden-set or leaderboard evidence.
- [x] B10: A fresh `1.0.3` submission ZIP contains the exact reviewed 18-file
      closure and passes version, package validation and all package tests from
      a standalone read-only extraction without repository source access.

## Out Of Scope

- Desktop commerce UI, seller publication, arbitrary web/network access, MCP,
  memory, retrieval, local-model upload or general tool execution.
- Benchmark-specific logic entering canonical Kernel reducers.
