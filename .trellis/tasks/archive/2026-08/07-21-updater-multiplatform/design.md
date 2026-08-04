# Design — Multi-platform updater manifest

## Current shape (single platform)

```
buildReleaseDocuments({ artifactUrl, signature, artifactDigest, signatureFile, ... })
  -> manifest.platforms = { 'darwin-aarch64': { url, signature } }
validateUpdateManifest(manifest)
  -> hard-requires platforms['darwin-aarch64']; validates only that entry
update-artifacts.mjs generate --artifact <path> --artifact-url <url>
  -> single signed artifact
release-update.yml: find macos-aarch64-*.app.tar.gz -> single --artifact
```

Everything downstream of the manifest (rollout, rollback, SBOM, provenance,
metadata) is keyed off a single artifact.

## Target shape (four platforms)

The manifest becomes:

```json
{
  "version": "0.1.2",
  "pub_date": "...",
  "notes": "",
  "platforms": {
    "darwin-aarch64": { "url": ".../macos-aarch64-Cutout.app.tar.gz", "signature": "..." },
    "darwin-x86_64":  { "url": ".../macos-x86_64-Cutout.app.tar.gz",  "signature": "..." },
    "windows-x86_64": { "url": ".../windows-x86_64-Cutout_..._x64-setup.nsis.zip", "signature": "..." },
    "linux-x86_64":   { "url": ".../linux-x86_64-Cutout_..._amd64.AppImage.tar.gz", "signature": "..." }
  }
}
```

## Shared platform contract

Add one authoritative mapping so the workflow, the collector, and the generator
agree on keys and suffixes. Put it in `scripts/lib/update-artifacts.mjs` (the
manifest is the natural owner of the platform vocabulary):

```js
export const updaterPlatforms = Object.freeze({
  'darwin-aarch64': { asset: 'macos-aarch64',  updaterSuffix: '.app.tar.gz' },
  'darwin-x86_64':  { asset: 'macos-x86_64',   updaterSuffix: '.app.tar.gz' },
  'windows-x86_64': { asset: 'windows-x86_64', updaterSuffix: '.nsis.zip' },
  'linux-x86_64':   { asset: 'linux-x86_64',   updaterSuffix: '.AppImage.tar.gz' },
})
```

`darwin-aarch64` stays the **primary** platform (first key) — it remains the
mandatory anchor of the manifest and the subject used for the single-artifact
SBOM/provenance/metadata fields, preserving backward compatibility.

## Component changes

### 1. `scripts/lib/update-artifacts.mjs`

- `buildReleaseDocuments(input)` — accept `input.platforms` as an ordered array
  of `{ key, artifactUrl, signature, artifactDigest, signatureFile }`. The
  first entry MUST be `darwin-aarch64` (throw otherwise). Build
  `manifest.platforms` by reducing that array. Validate each `artifactUrl`
  (HTTPS + allowlist) and each signature.
  - Backward compat: keep accepting the legacy single-artifact fields
    (`artifactUrl`, `signature`, `artifactDigest`, `signatureFile`) by
    normalizing them into a one-element `platforms` array for `darwin-aarch64`
    when `input.platforms` is absent. This keeps the existing unit test and any
    other caller working.
  - `metadata.artifact` and SBOM/provenance continue to describe the primary
    (`darwin-aarch64`) artifact. Additionally emit `metadata.platforms` — an
    array of `{ key, url, sha256, signatureFile }` for all platforms — and list
    every platform artifact in `sbom.packages` and `provenance.subject` so the
    supply-chain documents are no longer half-blind.

- `validateUpdateManifest(manifest, options)` — still hard-require
  `platforms['darwin-aarch64']` (unchanged failure message, preserves the
  backward-compat criterion). Then iterate **every** entry in
  `manifest.platforms` and apply the existing per-platform checks (object
  shape, HTTPS, allowlist, signature present + ≤ 16 KiB). `expectedSignature`,
  when supplied, continues to be matched against the `darwin-aarch64` entry
  (that is the artifact the workflow's `update:validate` step passes a sidecar
  for). Extract the per-entry checks into a small local helper to avoid
  duplication.

### 2. `scripts/update-artifacts.mjs` (CLI)

- Extend the arg parser to collect repeated `--platform` flags into an array
  (the current `Object.fromEntries` reducer silently drops duplicates). Keep
  the rest of the parser intact.
- New `generate` input form:
  `--platform <key>=<artifactPath>` (repeatable) plus `--artifact-base-url <base>`.
  For each: `signaturePath = <artifactPath>.sig`, `url = <base>/<basename(artifactPath)>`.
  Read + digest each artifact via `readSignedArtifact`.
- Preserve the legacy single form (`--artifact` + `--artifact-url`) so the
  existing production-CLI unit test keeps passing; internally normalize it to a
  single `darwin-aarch64` platform entry.
- Order platforms per `updaterPlatforms` key order, with `darwin-aarch64` first.

### 3. `scripts/lib/collect-release-assets.mjs`

- Add the updater artifact + `.sig` to `requiredBundles` so a missing updater
  bundle hard-fails (per the confirmed decision):
  - `release-windows-x86_64`: add `.nsis.zip`, `.nsis.zip.sig`
  - `release-linux-x86_64`: add `.AppImage.tar.gz`, `.AppImage.tar.gz.sig`
  - macOS entries already require `.app.tar.gz` + `.app.tar.gz.sig`.
- `allowedSuffixes` already includes all of these — no change there.

### 4. `.github/workflows/release-update.yml`

Rewrite the "Generate and validate updater metadata" step to discover one
updater artifact per platform from `dist/release-assets/` and pass them all:

```bash
declare -A want=(
  [darwin-aarch64]='macos-aarch64-*.app.tar.gz'
  [darwin-x86_64]='macos-x86_64-*.app.tar.gz'
  [windows-x86_64]='windows-x86_64-*.nsis.zip'
  [linux-x86_64]='linux-x86_64-*.AppImage.tar.gz'
)
platform_args=()
for key in darwin-aarch64 darwin-x86_64 windows-x86_64 linux-x86_64; do
  f="$(find dist/release-assets -maxdepth 1 -name "${want[$key]}" -type f -print -quit)"
  test -n "$f" && test -f "$f.sig" || { echo "Missing updater artifact for $key" >&2; exit 1; }
  platform_args+=(--platform "$key=$f")
done
base="https://github.com/${GITHUB_REPOSITORY}/releases/download/${RELEASE_TAG}"
pnpm update:generate -- "${platform_args[@]}" --artifact-base-url "$base" \
  --version "$RELEASE_VERSION" --channel "$CHANNEL" --rollout "$ROLLOUT" \
  --allowed-hosts "$CUTOUT_UPDATER_ALLOWED_HOSTS" --revision "$GITHUB_SHA" \
  --output dist/update "${rollback_args[@]}"
pnpm update:validate -- --manifest "dist/update/$CHANNEL/latest.json" \
  --signature "$darwin_aarch64_sig" --allowed-hosts "$CUTOUT_UPDATER_ALLOWED_HOSTS"
```

The primary macOS `.sig` is still passed to `update:validate` as the
`expectedSignature` anchor. Hard-fail on any missing platform is enforced both
here (the `find` guard) and upstream in `collectReleaseAssets`.

### 5. Tests

- `scripts/update-artifacts.test.ts`
  - Extend the `fixture` helper to build a 4-platform manifest, or add a
    dedicated multi-platform fixture.
  - New assertions: `buildReleaseDocuments` emits all four `platforms` keys;
    `validateUpdateManifest` throws when a **non-primary** platform (e.g.
    `windows-x86_64`) has an http url / bad signature; the production-CLI test
    drives the new `--platform ...=... --artifact-base-url` form and asserts the
    generated `latest.json` has four platforms.
  - Keep at least one assertion on the legacy single-artifact path to prove
    backward compatibility.
- `scripts/collect-release-assets.test.ts`
  - Extend the fixture `files` map to include the updater bundles + `.sig` for
    windows (`.nsis.zip` + `.sig`) and linux (`.AppImage.tar.gz` + `.sig`).
  - Add a "missing updater sig hard-fails" case for windows/linux.
- `scripts/release-workflow.test.ts`
  - Update the assertion on the publish step so it no longer hardcodes a single
    `macos-aarch64` find; assert the step references all four platform keys /
    passes `--platform` and `--artifact-base-url`.

## Data flow (after change)

```
tauri-action (x4 targets, createUpdaterArtifacts) 
  -> per-platform bundle dirs (upload-artifact)
  -> collectReleaseAssets (hard-fail if any updater bundle/.sig missing)
  -> platform-prefixed assets in dist/release-assets/
  -> workflow discovers 4 updater artifacts + .sig
  -> update:generate --platform x4 --artifact-base-url
  -> buildReleaseDocuments -> latest.json.platforms {4 keys}
  -> update:validate (per-platform checks, darwin-aarch64 sidecar anchor)
  -> gh release create (latest.json + assets)
  -> Tauri clients on every platform resolve their own signed artifact
```

## Compatibility / rollback

- The manifest schema is additive: existing `darwin-aarch64` consumers see the
  same entry plus siblings they ignore if unsupported. No client change needed.
- `validateUpdateManifest` keeps the exact `darwin-aarch64` mandatory check, so
  older single-platform manifests (and the legacy CLI form) still validate.
- Rollback: revert the five files; the previous single-platform manifest
  generation is fully restored. No persisted state migration is involved.

## Risks

- **Linux updater suffix.** The repo's `allowedSuffixes` commits to
  `.AppImage.tar.gz` (+ `.sig`); this design follows that contract. If a Tauri
  upgrade later emits `.AppImage` + `.AppImage.sig` instead, the `find` guard
  will hard-fail loudly (correct fail-closed behavior) — update the mapping in
  one place (`updaterPlatforms`) plus `requiredBundles` if that happens.
- **Windows NSIS filename.** Discovery globs on `*.nsis.zip`, not an exact
  name, so version/arch suffix churn is tolerated.
