# General Design OS desktop workbench - verification

## Outcome

The desktop product now uses one Project lifecycle across Product UI/UX, Brand,
Commerce, Game Asset, and Motion. Profiles are contextual Create lanes; Review,
Deliver, and Inspect retain separate evidence and authority semantics.

## Contract Evidence

- `workbench-navigation` owns the six lifecycle sections, five Profile ids,
  exhaustive legacy route mapping, Product UI/UX default, and remembered
  contextual destinations.
- `AppShell` no longer special-cases a direct Game page. It forwards the exact
  `gameAssetLaunch` request into the shared Workbench.
- Designer/Builder changes presentation only. Component coverage proves the
  selected lifecycle, Profile, revision, and generation callback remain stable.
- Brand Create readiness navigates to Deliver/Kits and cannot call export from
  Create.
- Commerce Project and Inspect/Labs render isolated scopes. No Benchmark control
  exists in normal Project production.
- Review renders only current blockers, governance, and existing receipts and
  has an explicit no-evidence state.
- The workspace rail now labels its narrow system drawer Design and has no
  duplicate Deliver drawer. Deliver opens the shared inline Workbench directly.
- Product UI/UX Create defaults to Canvas while exact legacy Specimen/Figma
  destinations remain mapped.
- Commerce production is retained across Create, Review, restart, and Deliver as
  a schema-validated revision-bound record. Review explicitly accepts its exact
  ordered hashes; stale records cannot be accepted or downloaded.
- Commerce delivery says Download files and emits the manifest plus retained
  artifacts. The durable state records `download-requested`, not an archive or
  verified filesystem receipt.

## Automated Verification

Passed on 2026-08-16:

```text
pnpm exec vitest run <Workbench + AppShell + Workspace + Commerce + Game paths>
39 files passed, 6 conditionally skipped
233 tests passed, 6 conditionally skipped

pnpm exec playwright test <affected Workbench journeys>
24 passed, 2 platform-inapplicable tests skipped

pnpm exec playwright test tests/visual/outcome-first.spec.ts
30 passed

pnpm lint
passed

pnpm build
Agent capability contract valid: 20 operations, 36 MCP tools
Product skills valid: 20 skills
TypeScript passed
Vite production build passed: 1417 modules
Frontend bundle gate passed: 387.3 KiB entry / 3499.3 KiB across 79 chunks
```

The six skipped Vitest cases are `.real.test` Provider/Host rehearsals whose
external prerequisites were not present. They are not counted as live production
or maturity evidence.

Focused convergence verification on 2026-08-17:

```text
pnpm exec vitest run <Commerce lifecycle + Workbench + workspace + persistence paths>
8 files passed
79 tests passed

pnpm lint
passed

pnpm build
Agent capability contract valid: 20 operations, 36 MCP tools
Product skills valid: 20 skills
TypeScript passed
Vite production build passed: 1422 modules
Frontend bundle gate passed: 388.4 KiB entry / 3529.1 KiB across 81 chunks

pnpm exec playwright test <Commerce + Deliver + workspace navigation journeys>
10 passed, 2 mobile-inapplicable tests skipped

git diff --check
passed
```

The deterministic Commerce contract Host used by the new lifecycle tests proves
schema, orchestration, persistence, and rejection behavior only. It is not real
Provider quality, hidden-set performance, production maturity, or SOTA evidence.

Remaining UI/UX redundancy verification on 2026-08-17:

```text
pnpm exec vitest run <Workbench + AppShell + workspace + Commerce persistence paths>
8 files passed
80 tests passed

pnpm lint
passed

pnpm build
Agent capability contract valid: 20 operations, 36 MCP tools
Product skills valid: 20 skills
TypeScript and Vite production build passed: 1432 modules
Frontend bundle gate passed: 388.3 KiB entry / 3556.3 KiB across 81 chunks

pnpm exec playwright test <Commerce + inline Deliver journeys>
4 passed across desktop and mobile

git diff --check <changed Workbench files>
passed
```

The focused component coverage proves direct Canvas routing, single Design
drawer entry, Product UI/UX lifecycle action ownership, inline retained Commerce
previews/receipt evidence, explicit acceptance and stale blocking. Product
Figma, Commerce Labs, and Deliver labels no longer repeat a neighboring
lifecycle responsibility. Deterministic retained artifacts remain contract
fixtures and make no live-quality claim.

## Visual Evidence

Headless Chromium covered desktop and mobile geometry, active lifecycle/Profile
visibility, dialog close/revision non-overlap, Designer/Builder stability,
Commerce Project versus Labs isolation, Deliver return, and horizontal overflow.
Representative baselines are retained under:

```text
tests/visual/__screenshots__/commerce-production-panel.spec.ts/
tests/visual/__screenshots__/deliver-inline-main.spec.ts/
tests/visual/__screenshots__/deliver-back-navigation.spec.ts/
tests/visual/__screenshots__/deliver-visual-consistency.spec.ts/
```

## Residual Boundaries

- Motion remains capability-required until an authorized temporal Host exists.
- Real Commerce/Game production maturity still requires its owning real-Host
  evidence; this UI refactor creates no new maturity claim.
- No public CLI, MCP, protocol, manifest, or headless Provider surface changed.
- Changes remain uncommitted pending explicit user approval.
