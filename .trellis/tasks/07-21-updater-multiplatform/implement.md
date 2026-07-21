# Implementation plan — Multi-platform updater manifest

Ordered so each step is independently testable; unit tests before the workflow
wiring that depends on them.

## Step 1 — Shared platform contract + generator core
- [ ] Add `export const updaterPlatforms` to `scripts/lib/update-artifacts.mjs`
      (keys in canonical order, `darwin-aarch64` first).
- [ ] Rework `buildReleaseDocuments`:
  - Accept `input.platforms` (ordered array of
    `{ key, artifactUrl, signature, artifactDigest, signatureFile }`).
  - Normalize the legacy single-artifact fields into a one-element
    `darwin-aarch64` array when `input.platforms` is absent.
  - Require the first/primary entry to be `darwin-aarch64`; throw otherwise.
  - Build `manifest.platforms` from the array; validate each url + signature.
  - Emit `metadata.platforms[]`; extend `sbom.packages` + `provenance.subject`
    to list every platform artifact. Keep `metadata.artifact`, primary SBOM
    package, and provenance anchor on `darwin-aarch64`.
- [ ] Rework `validateUpdateManifest`: keep the mandatory `darwin-aarch64`
      check verbatim, then loop all `manifest.platforms` entries through a
      shared per-entry validator (shape, HTTPS, allowlist, signature bounds).
      `expectedSignature` still matches the `darwin-aarch64` entry.

Validation: `pnpm exec vitest run scripts/update-artifacts.test.ts`
(expect edits in step 4 to green fully; core throw/emit behavior checked here).

## Step 2 — CLI (`scripts/update-artifacts.mjs`)
- [ ] Extend arg parsing to collect repeated `--platform` into an array while
      leaving other flags on the existing key/value map.
- [ ] `generate`: if `--platform` present, build the platforms array from
      `<key>=<path>` + `--artifact-base-url` (url = base + `/` + basename;
      sig = `<path>.sig`; digest via `readSignedArtifact`). Else fall back to
      the legacy `--artifact`/`--artifact-url` single form.
- [ ] Order entries per `updaterPlatforms`; ensure `darwin-aarch64` is first.

Validation: `node scripts/update-artifacts.mjs generate ...` smoke via the
updated production-CLI test in step 4.

## Step 3 — Collector hard-fail (`scripts/lib/collect-release-assets.mjs`)
- [ ] Extend `requiredBundles`:
  - `release-windows-x86_64`: add `.nsis.zip`, `.nsis.zip.sig`.
  - `release-linux-x86_64`: add `.AppImage.tar.gz`, `.AppImage.tar.gz.sig`.

Validation: `pnpm exec vitest run scripts/collect-release-assets.test.ts`
(green after step 4 fixture update).

## Step 4 — Tests
- [ ] `scripts/update-artifacts.test.ts`: multi-platform fixture; assert 4
      `platforms` keys; assert a bad **non-primary** platform (windows http url
      / empty sig) throws; drive CLI with `--platform ...=... --artifact-base-url`
      and assert 4 platforms in `latest.json`; retain one legacy-path assertion.
- [ ] `scripts/collect-release-assets.test.ts`: add updater bundles + `.sig` to
      fixture; add a windows/linux "missing updater sig hard-fails" case.
- [ ] `scripts/release-workflow.test.ts`: replace the single-`macos-aarch64`
      publish-step assertion with one that checks all four platform keys and the
      `--platform` / `--artifact-base-url` invocation.

Validation: `pnpm test:update-artifacts` and
`pnpm exec vitest run scripts/collect-release-assets.test.ts scripts/release-workflow.test.ts`.

## Step 5 — Workflow (`.github/workflows/release-update.yml`)
- [ ] Rewrite the "Generate and validate updater metadata" step to discover all
      four platform updater artifacts (Windows = `*.nsis.zip`), hard-fail on any
      missing artifact/`.sig`, and invoke `update:generate` with repeated
      `--platform` + `--artifact-base-url`. Keep the `darwin-aarch64` `.sig` as
      the `update:validate` anchor. Preserve the rollback-args wiring.

Validation: `pnpm exec vitest run scripts/release-workflow.test.ts`; YAML lint
via the workflow parse in that test.

## Step 6 — Full-scope check + finish
- [ ] Run the whole updater/release test group + typecheck
      (`tsc -p tsconfig.app.json` — note: `-p .` is a no-op in this repo).
- [ ] `trellis-check`; then spec update + commit.

## Rollback points
- Each step is a self-contained edit; revert the touched file to restore prior
  behavior. Full rollback = revert the five source/test files + the workflow.

## Validation command summary
```
pnpm test:update-artifacts
pnpm exec vitest run scripts/collect-release-assets.test.ts scripts/release-workflow.test.ts
node scripts/tsc-... (tsc -p tsconfig.app.json)
```
