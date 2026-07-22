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
- Desktop UI state owner: `createDesktopUpdateOrchestrator(...)` in `AppShell`.
  Home and Settings receive that controller; they do not construct another one.

### 3. Contracts

- Release tags are `v<semver>`; prerelease identifiers select the beta channel.
- `package.json`, `src-tauri/tauri.conf.json`, and the root package in
  `src-tauri/Cargo.toml` must contain the same version and match the tag.
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
  `contents: write`.
- Required protected environment values:
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and
  `CUTOUT_UPDATER_PUBKEY`. The updater private key must be password-protected.
  The private key and password are step-scoped only to the pinned Tauri build
  actions that create updater signatures. Setup, tests, artifact upload, and
  the publish job receive neither signing secret.
  GitHub distribution defaults the stable endpoint to the repository's
  `releases/latest/download/latest.json` and the allowlist to `github.com`.
  `CUTOUT_UPDATER_STABLE_ENDPOINTS`, `CUTOUT_UPDATER_ALLOWED_HOSTS`, and
  `CUTOUT_UPDATER_BETA_ENDPOINTS` are optional approved-host overrides.
- The protected `release` environment also owns `APPLE_CERTIFICATE` (base64
  PKCS#12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_API_KEY`, `APPLE_API_ISSUER`, and `APPLE_API_PRIVATE_KEY`. These Apple
  secrets are scoped only to macOS preparation and build steps; Windows and
  Linux Tauri steps receive none of them.
- The macOS preparation step hard-fails when any Apple input is absent, writes
  `APPLE_API_PRIVATE_KEY` to `$RUNNER_TEMP/AuthKey_<key-id>.p8` with mode
  `0600`, and exports only `APPLE_API_KEY_PATH` for the Tauri process. The
  temporary key is removed after packaging, including failed builds.
- macOS artifacts are uploadable only after the generated `.app` and `.dmg`
  both pass Developer ID signature verification, Gatekeeper assessment, and
  stapled-ticket validation. Tauri's macOS build waits for app notarization and
  stapling; because the DMG is created afterward, release CI must separately
  submit the signed DMG with `notarytool --wait` and staple it before these
  checks run.
- Private keys remain CI secrets. Public endpoint/key configuration remains CI
  variables and is compiled into release builds.
- Each matrix job requires exactly one platform updater artifact and sibling
  sidecar, then uses the repository-owned `verify-updater-signature` binary to
  verify that archive against `CUTOUT_UPDATER_PUBKEY` before workflow-artifact
  upload. The publish job consumes only these verified sidecars; metadata
  generation never receives or simulates presence of the updater private key.
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
| Any matrix job fails | Do not start `publish` |
| Required platform/bundle is absent | Collector fails before Release creation |
| Symlink or duplicate output is found | Collector fails closed |
| Any platform's updater artifact/signature is absent | Collector and metadata generation fail closed |
| Public key is empty or malformed | Stop before invoking the Tauri bundler |
| Updater key or password is absent | Tauri signing fails and no platform artifact is uploaded |
| Updater sidecar does not verify against the release public key | Do not upload the platform workflow artifact |
| More than one updater artifact or sidecar exists for a platform | Fail before metadata generation |
| Any Apple signing/notarization secret is absent on macOS | Stop before invoking the macOS Tauri build |
| App or DMG signature, Gatekeeper, or stapler validation fails | Do not upload that macOS workflow artifact |
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
- Good: the delayed desktop check discovers a newer signed GitHub release; one
  compact Home action appears and opens the existing update controls.
- Base: a manual build selects an existing version tag and uses the exact same
  gates as a tag push.
- Base: current version is latest or runtime configuration is absent; the Home
  header has no empty update placeholder.
- Bad: each matrix entry runs `gh release create`, uploads its own
  `latest.json`, or has repository write permission.
- Bad: CI edits version manifests after checkout to make a mismatched tag pass.

### 6. Tests Required

- `scripts/validate-release-version.test.ts`: synchronized, drift, tag mismatch,
  and malformed semantic versions.
- `scripts/collect-release-assets.test.ts`: architecture-qualified duplicate
  basenames, required outputs (including per-platform updater bundles + `.sig`),
  symlink rejection, directory boundaries, and deterministic SHA-256 output.
- `scripts/release-workflow.test.ts`: four-entry matrix, validate/build/publish
  dependency graph, least-privilege permissions, isolated macOS/non-macOS Tauri
  actions pinned to a reviewed commit, Apple and updater secret scoping,
  temporary key handling, updater sidecar verification, macOS
  signature/notarization verification, draft promotion, and the multi-platform
  manifest generation step.
- `scripts/ci-platform-contracts.test.ts`: browser installation ordering,
  platform-specific executable selection, and LF/CRLF frontmatter parsing.
- `scripts/update-artifacts.test.ts`: signature, HTTPS/allowlist, rollback,
  rollout, SBOM, provenance, multi-platform manifest generation (all four
  platform keys, non-primary fail-closed), and generated-manifest validation.
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
  needs: validate
  permissions:
    contents: read

publish:
  needs: [validate, build]
  permissions:
    contents: write
```

Build jobs produce isolated workflow artifacts. One final owner validates the
complete set, creates a draft, uploads once, and only then publishes.

Do not create a second updater controller inside the Home sidebar or implement
a direct `fetch()` against GitHub there. That would duplicate the persisted
check interval and bypass the Rust signature/allowlist boundary. Subscribe to
the AppShell-owned controller and route the user to Updates & Support instead.

## Distribution Claim Boundary

A Tauri updater signature proves updater artifact authenticity. It does not
prove Apple notarization, Windows Authenticode, Linux repository publication,
or clean-machine installation. Those claims require separate credentials and
verification evidence under `docs/RELEASE_CHECKLIST.md`.
