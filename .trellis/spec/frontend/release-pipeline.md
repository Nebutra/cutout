# Desktop Release Pipeline

## Scenario: Atomic cross-platform GitHub release

### 1. Scope / Trigger

Use this contract whenever `.github/workflows/release-update.yml`, native bundle
targets, version files, updater metadata, or release asset publication changes.
It prevents partial public releases, architecture collisions, and tags whose
installer version differs from their release version.

### 2. Signatures

- Version CLI:
  `node scripts/validate-release-version.mjs [--expected <semver>]`
- Asset collection CLI:
  `node scripts/collect-release-assets.mjs collect --input <dir> --output <dir>`
- Checksum CLI:
  `node scripts/collect-release-assets.mjs checksums --directory <dir>`
- Updater generation/validation remains owned by `pnpm update:generate` and
  `pnpm update:validate`.
- macOS DMG notarization uses
  `xcrun notarytool submit <dmg> --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait`, followed by
  `xcrun stapler staple <dmg>`.
- Desktop UI state owner: `createDesktopUpdateOrchestrator(...)` in `AppShell`.
  Home and Settings receive that controller; they do not construct another one.

### 3. Contracts

- Release tags are `v<semver>`; prerelease identifiers select the beta channel.
- `package.json` is the display/handshake version source. Its value,
  `src-tauri/tauri.conf.json`, the root package in `src-tauri/Cargo.toml`, the
  Agent capability manifest, and the Codex plugin manifest must match the tag.
- Required workflow artifact ids:
  `release-macos-aarch64`, `release-macos-x86_64`,
  `release-windows-x86_64`, and `release-linux-x86_64`.
- The generated `latest.json` advertises every built platform. Its `platforms`
  map carries `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and
  `linux-x86_64`, each with its own HTTPS updater URL and signature. The Windows
  auto-update target is the signed NSIS installer (`.exe`); the MSI ships only
  as a downloadable installer. The Linux target is the signed `.AppImage`.
  `darwin-aarch64` is the mandatory primary anchor —
  validation still fails closed if it is absent, and every other present
  platform is validated with the same HTTPS/allowlist/signature checks.
- The collector treats each platform's updater artifact and `.sig` as required
  (`.app.tar.gz(.sig)` on macOS, `.exe(.sig)` on Windows, and
  `.AppImage(.sig)` on Linux). A missing updater bundle for any platform
  fails the release rather than publishing a partial manifest.
- Matrix jobs receive `contents: read`; only the final publish job receives
  `contents: write`. `scripts/validate-release-authority.mjs` rejects any other
  workflow writer or GitHub Release mutator.
- `.github/workflows/ci.yml` is callable and is the exact release quality gate.
  Native release builds require that full native, contract, build, lint, unit,
  and release-critical browser workflow to pass first.
- Release callers pass the validated tag commit as `source_sha`; every checkout
  in the reusable workflow uses that exact revision. A manual dispatch must not
  test `main` while packaging a different input tag.
- The workflow ends in one stable `Quality gate` job that depends on native,
  contract, and browser boundaries and fails unless all three results are
  `success`. Branch rules require this aggregate context instead of enumerating
  matrix-generated check names.
- Every Action and toolchain action is pinned to a reviewed 40-character commit
  SHA. Repository settings must also require SHA pinning and restrict allowed
  actions to the reviewed set.
- Required protected environment values:
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and
  `CUTOUT_UPDATER_PUBKEY`. The updater private key must be password-protected.
  The private key and password are step-scoped only to the pinned Tauri build
  actions and the Windows step that regenerates the updater sidecar after
  SignPath modifies the NSIS installer. Setup, tests, artifact upload, and the
  publish job receive neither signing secret.
  GitHub distribution defaults the stable endpoint to the repository's
  `releases/latest/download/latest.json` and the allowlist to `github.com`.
  `CUTOUT_UPDATER_STABLE_ENDPOINTS`, `CUTOUT_UPDATER_ALLOWED_HOSTS`, and
  `CUTOUT_UPDATER_BETA_ENDPOINTS` are optional approved-host overrides.
- The protected `release` environment also owns `APPLE_CERTIFICATE` (base64
  PKCS#12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_API_KEY`, `APPLE_API_ISSUER`, and `APPLE_API_PRIVATE_KEY`. These Apple
  secrets are scoped only to macOS preparation, Tauri build, and explicit DMG
  notarization steps; Windows and Linux Tauri steps receive none of them.
- Windows Authenticode uses SignPath's GitHub Actions connector. The protected
  environment owns `SIGNPATH_API_TOKEN` plus the public configuration variables
  `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
  `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`, and
  `SIGNPATH_WINDOWS_CERTIFICATE_THUMBPRINT`. The job uploads fixed-name NSIS and
  MSI workflow artifacts, submits them through the immutable pinned SignPath
  action, restores only the returned signed files, and never imports or stores a
  Windows certificate private key in GitHub.
- Because Authenticode changes the NSIS bytes after Tauri's build, the Windows
  job deletes the stale updater sidecar, regenerates it with the protected Tauri
  updater key, verifies that sidecar against `CUTOUT_UPDATER_PUBKEY`, then
  requires `Get-AuthenticodeSignature` status `Valid`, the configured signer
  thumbprint, code-signing EKU, and a trusted timestamp for both NSIS and MSI.
- The macOS preparation step hard-fails when any Apple input is absent, writes
  `APPLE_API_PRIVATE_KEY` to `$RUNNER_TEMP/AuthKey_<key-id>.p8` with mode
  `0600`, and exports only `APPLE_API_KEY_PATH` for the Tauri process. The
  temporary key is removed after packaging, including failed builds.
- macOS artifacts are uploadable only after the generated `.app` and `.dmg`
  both pass Developer ID signature verification, Gatekeeper assessment, and
  stapled-ticket validation. Tauri 2.11.4 notarizes and staples the `.app`
  before creating the DMG; signing that later container does not notarize it.
  Release CI must therefore submit the finished DMG separately with
  `notarytool --wait`, staple the accepted ticket, and only then run both
  artifacts through the verification gate.
- Private keys remain CI secrets. Public endpoint/key configuration remains CI
  variables and is compiled into release builds.
- Each matrix job requires exactly one platform updater artifact and sibling
  sidecar, then uses the repository-owned `verify-updater-signature` binary to
  verify that archive against `CUTOUT_UPDATER_PUBKEY` before workflow-artifact
  upload. The publish job consumes only these verified sidecars; metadata
  generation never receives or simulates presence of the updater private key.
- The publish job creates a GitHub build-provenance attestation for every final
  release asset after `SHA256SUMS` is generated and before the draft Release is
  created. It alone receives `id-token: write` and `attestations: write`.
- Release metadata contains updater manifest, checksums, SPDX SBOM, and
  provenance. It does not claim rollout or rollback policy because the desktop
  updater has no consumer for those metadata files.
- The committed Tauri updater config remains fail-closed. Before packaging,
  release CI validates the complete two-line minisign public key, writes an
  ignored merge-only config, and passes it to the Tauri CLI with `--config`.
  Exporting `CUTOUT_UPDATER_PUBKEY` alone is insufficient because the Tauri
  bundler reads `plugins.updater.pubkey` from CLI configuration.
- Every CI contract runner installs Playwright Chromium before `pnpm test`;
  Linux also installs its browser system dependencies. Browser configuration
  uses the bundled executable outside macOS unless an explicit executable path
  is provided. Text validators accept both LF and CRLF repository checkouts;
  plugin source fingerprints and mirrored text trees normalize both forms.
  Cross-platform tests use native path parsing and Windows `.cmd` shims for
  package executables; unsupported Windows process-tree control fails closed.
  Tests that launch real compilers, browsers, packagers, or other child
  processes declare an explicit per-test timeout sized for the slowest supported
  CI platform. Do not rely on the framework's short default timeout, raise the
  global timeout, or skip a platform to hide normal process startup variance.
  Screenshot baselines run on macOS Chrome, while platform-neutral contract
  tests remain matrixed across macOS, Linux, and Windows.
- AppShell initializes once, delays automatic checking for 8 seconds, and uses
  the persisted 24-hour preference gate. The Home action subscribes to this
  state; it does not call GitHub or the native updater directly.
- The Home action exists only when `state.release` is present and phase is one
  of `available`, `downloading`, `ready`, `installing`, or `error`. An error
  without a known release remains hidden.
- Selecting the action opens `{ section: 'updates-support', anchor: 'updates' }`.
  Download, recovery snapshot, durable-host shutdown, install, and restart stay
  in the existing updater controller and Settings surface.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Tag is not `v<semver>` | Stop in `validate`; run no native build |
| Source versions differ | Stop in `validate` with all three observed versions |
| Tag and source differ | Stop in `validate`; never rewrite source in CI |
| Tag commit is not reachable from `main` | Stop before the reusable quality gate |
| Another workflow can write contents or mutate a Release | Stop in `validate` |
| Any matrix job fails | Do not start `publish` |
| Required platform/bundle is absent | Collector fails before Release creation |
| Symlink or duplicate output is found | Collector fails closed |
| Any platform's updater artifact/signature is absent | Collector and metadata generation fail closed |
| Public key is empty or malformed | Stop before invoking the Tauri bundler |
| Updater key or password is absent | Tauri signing fails and no platform artifact is uploaded |
| Updater sidecar does not verify against the release public key | Do not upload the platform workflow artifact |
| More than one updater artifact or sidecar exists for a platform | Fail before metadata generation |
| Any Apple signing/notarization secret is absent on macOS | Stop before invoking the macOS Tauri build |
| App notarization or explicit DMG notarization is not accepted | Do not run artifact upload or publication |
| App or DMG signature, Gatekeeper, or stapler validation fails | Do not upload that macOS workflow artifact |
| SignPath token, organization/project/policy/configuration, or expected signer thumbprint is absent | Stop without uploading a Windows release artifact |
| SignPath does not return exactly one fixed-name NSIS and MSI | Reject the signing result and preserve the unpublished release |
| Authenticode changes NSIS but the Tauri updater sidecar is not regenerated and verified | Do not upload the Windows workflow artifact |
| NSIS or MSI Authenticode signer/status/timestamp is invalid | Do not upload the Windows workflow artifact |
| GitHub provenance attestation fails | Keep the Release unpublished |
| Release tag already has a Release | Refuse immutable asset replacement |
| Upload is incomplete | Release remains a draft, not a public success |
| Browser/dev build has no updater config | Home action remains absent |
| Check returns no newer release | Home action remains absent |
| Download fails after discovery | Keep Home action so retry remains reachable |
| Active Agent run exists at install | Existing orchestrator blocks restart |

### 5. Good/Base/Bad Cases

- Good: all four matrix entries finish, collected names include their platform
  and architecture, `latest.json` carries all four platform entries, updater
  evidence validates for each, and one draft is promoted.
- Good: Tauri receives an Apple `Accepted` result for the app, the workflow
  receives a separate `Accepted` result for the DMG, and both artifacts report
  `source=Notarized Developer ID` before upload.
- Good: SignPath signs the fixed-name Windows installer artifact from the exact
  GitHub-hosted build, the job restores those bytes, regenerates the NSIS
  updater sidecar, and validates both Authenticode signatures and timestamps.
- Good: the delayed desktop check discovers a newer signed GitHub release; one
  compact Home action appears and opens the existing update controls.
- Base: a manual build selects an existing version tag reachable from `main`
  and uses the exact same gates as a tag push; it cannot set rollout or rollback
  policy.
- Base: current version is latest or runtime configuration is absent; the Home
  header has no empty update placeholder.
- Bad: each matrix entry runs `gh release create`, uploads its own
  `latest.json`, or has repository write permission.
- Bad: the workflow treats Tauri's app notarization as proof that the
  subsequently created DMG is notarized, or validates the DMG before separately
  submitting and stapling it.
- Bad: CI edits version manifests after checkout to make a mismatched tag pass.

### 6. Tests Required

- `scripts/validate-release-version.test.ts`: synchronized, drift, tag mismatch,
  and malformed semantic versions.
- `scripts/collect-release-assets.test.ts`: architecture-qualified duplicate
  basenames, required outputs (including per-platform updater bundles + `.sig`),
  symlink rejection, directory boundaries, and deterministic SHA-256 output.
- `scripts/release-workflow.test.ts`: four-entry matrix, validate/build/publish
  dependency graph, least-privilege permissions, isolated macOS/non-macOS Tauri
  actions pinned to a reviewed commit, all Action SHA pins, Apple/SignPath/updater
  secret scoping, temporary key handling, post-SignPath updater sidecar renewal,
  app-before-DMG notarization ordering, macOS signature/notarization
  verification, Windows Authenticode, attestation, single-authority
  publication, draft promotion, and multi-platform manifest generation.
- `scripts/ci-platform-contracts.test.ts`: browser installation ordering,
  platform-specific executable selection, and LF/CRLF frontmatter parsing.
- Child-process integration tests: explicit per-test timeout budgets that still
  fail closed on a stuck compiler/browser/packager and cover the slowest CI
  platform without platform skips.
- `scripts/update-artifacts.test.ts`: signature, HTTPS/allowlist, downgrade
  rejection, unsupported rollout/rollback flags, SBOM, provenance,
  multi-platform manifest generation (all four platform keys, non-primary
  fail-closed), and generated-manifest validation.
- `src/components/home/SidebarAccount.test.tsx`: hidden idle/checking/error
  states, visible actionable phases, version label, and Settings target.
- `src/updater/{runtime,service,orchestrator}.test.ts`: narrow Tauri commands,
  current package version, auto-check interval, progress, cancellation, recovery
  gates, and install/restart ordering.

### 7. Wrong vs Correct

#### Wrong

```yaml
strategy:
  matrix:
    os: [macos-latest, windows-latest, ubuntu-latest]
steps:
  - uses: tauri-apps/tauri-action@v1
    with:
      tagName: ${{ github.ref_name }}
```

Every matrix job races to mutate one Release and may overwrite shared updater
metadata.

#### Correct

```yaml
build:
  needs: [validate, quality]
  permissions:
    contents: read

publish:
  needs: [validate, quality, build]
  permissions:
    contents: write
```

Build jobs produce isolated workflow artifacts. One final owner validates the
complete set, creates a draft, uploads once, and only then publishes.

#### Wrong

```yaml
- name: Sign Windows installers remotely
  uses: SignPath/github-action-submit-signing-request@<sha>
- name: Upload platform release artifacts
```

The NSIS updater sidecar still authenticates the pre-Authenticode bytes and is
invalid for the installer returned by SignPath.

#### Correct

```yaml
- name: Sign Windows installers remotely
  uses: SignPath/github-action-submit-signing-request@<sha>
- name: Re-sign final NSIS updater artifact
  run: pnpm tauri signer sign <signed-nsis-path>
- name: Verify updater artifact signature
```

Remote Authenticode signing completes first. The stale `.sig` is removed, the
final NSIS bytes receive a new Tauri updater signature, and both signature
layers are verified before workflow-artifact upload.

Do not create a second updater controller inside the Home sidebar or implement
a direct `fetch()` against GitHub there. That would duplicate the persisted
check interval and bypass the Rust signature/allowlist boundary. Subscribe to
the AppShell-owned controller and route the user to Updates & Support instead.

## Distribution Claim Boundary

A Tauri updater signature proves updater artifact authenticity. It does not
prove Apple notarization, Windows Authenticode, Linux repository publication,
or clean-machine installation. Those claims require separate credentials and
verification evidence under `docs/RELEASE_CHECKLIST.md`.
