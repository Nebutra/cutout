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
- macOS DMG notarization command:
  `xcrun notarytool submit <dmg> --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait`, followed by
  `xcrun stapler staple <dmg>`.
- Desktop UI state owner: `createDesktopUpdateOrchestrator(...)` in `AppShell`.
  Home and Settings receive that controller; they do not construct another one.

### 3. Contracts

- Release tags are `v<semver>`; prerelease identifiers select the beta channel.
- `package.json`, `src-tauri/tauri.conf.json`, and the root package in
  `src-tauri/Cargo.toml` must contain the same version and match the tag.
- Required workflow artifact ids:
  `release-macos-aarch64`, `release-macos-x86_64`,
  `release-windows-x86_64`, and `release-linux-x86_64`.
- Matrix jobs receive `contents: read`; only the final publish job receives
  `contents: write`.
- Required protected environment values:
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and
  `CUTOUT_UPDATER_PUBKEY`. The updater private key must be password-protected.
  The private key and password are scoped only to the fail-fast signing-input
  check and the commit-pinned Tauri build actions; checkout, dependency install,
  tests, artifact upload, metadata generation, and publication do not receive
  them.
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
- Tauri 2.11.4 notarizes and staples the `.app` before creating the DMG. Signing
  the later DMG does not notarize that container. Release CI must therefore
  submit the finished DMG separately with `notarytool --wait`, staple the
  accepted ticket, and only then allow the generated `.app` and `.dmg` to pass
  Developer ID signature verification, Gatekeeper assessment, and
  stapled-ticket validation.
- Both Tauri build actions are pinned to the reviewed commit SHA. A mutable tag
  such as `tauri-apps/tauri-action@v1` is forbidden because those actions receive
  updater signing material and the macOS action also receives Apple credentials.
- Private keys remain CI secrets. Public endpoint/key configuration remains CI
  variables and is compiled into release builds.
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
| Updater archive/signature is absent | Metadata generation fails |
| Public key is empty or malformed | Stop before invoking the Tauri bundler |
| Updater key password is absent | Stop before invoking the Tauri bundler |
| Any Apple signing/notarization secret is absent on macOS | Stop before invoking the macOS Tauri build |
| App notarization or explicit DMG notarization is not accepted | Do not run artifact upload or publication |
| App or DMG signature, Gatekeeper, or stapler validation fails | Do not upload that macOS workflow artifact |
| Release tag already has a Release | Refuse immutable asset replacement |
| Upload is incomplete | Release remains a draft, not a public success |
| Browser/dev build has no updater config | Home action remains absent |
| Check returns no newer release | Home action remains absent |
| Download fails after discovery | Keep Home action so retry remains reachable |
| Active Agent run exists at install | Existing orchestrator blocks restart |

### 5. Good/Base/Bad Cases

- Good: all four matrix entries finish, collected names include their platform
  and architecture, updater evidence validates, and one draft is promoted.
- Good: Tauri receives an Apple `Accepted` result for the app, the workflow
  receives a separate `Accepted` result for the DMG, and both artifacts report
  `source=Notarized Developer ID` before upload.
- Good: the delayed desktop check discovers a newer signed GitHub release; one
  compact Home action appears and opens the existing update controls.
- Base: a manual build selects an existing version tag and uses the exact same
  gates as a tag push.
- Base: current version is latest or runtime configuration is absent; the Home
  header has no empty update placeholder.
- Bad: each matrix entry runs `gh release create`, uploads its own
  `latest.json`, or has repository write permission.
- Bad: the workflow treats Tauri's app notarization as proof that the
  subsequently created DMG is notarized, or verifies the DMG before separately
  submitting and stapling it.
- Bad: CI edits version manifests after checkout to make a mismatched tag pass.

### 6. Tests Required

- `scripts/validate-release-version.test.ts`: synchronized, drift, tag mismatch,
  and malformed semantic versions.
- `scripts/collect-release-assets.test.ts`: architecture-qualified duplicate
  basenames, required outputs, symlink rejection, directory boundaries, and
  deterministic SHA-256 output.
- `scripts/release-workflow.test.ts`: four-entry matrix, validate/build/publish
  dependency graph, least-privilege permissions, isolated macOS/non-macOS Tauri
  actions, immutable Tauri action pinning, updater and Apple secret scoping,
  temporary key handling, app-before-DMG notarization ordering, macOS
  signature/notarization verification, and draft promotion.
- `scripts/ci-platform-contracts.test.ts`: browser installation ordering,
  platform-specific executable selection, and LF/CRLF frontmatter parsing.
- `scripts/update-artifacts.test.ts`: signature, HTTPS/allowlist, rollback,
  rollout, SBOM, provenance, and generated-manifest validation.
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
