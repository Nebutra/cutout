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
- Release-note validation/rendering is owned by
  `pnpm release-notes:validate` and `pnpm release-notes:render`, using the
  repository catalog at `src/release-notes/catalog.json`. Rendering writes
  standard updater text to `updater-notes.txt`; metadata generation has no
  manual notes fallback.
- macOS DMG notarization uses
  `xcrun notarytool submit <dmg> --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait`, followed by
  `xcrun stapler staple <dmg>`.
- Desktop UI state owner: `createDesktopUpdateOrchestrator(...)` in `AppShell`.
  Home and Settings receive that controller; they do not construct another one.

### 3. Contracts

- Release tags are `v<semver>`; prerelease identifiers select the beta channel.
- A pushed version tag is immutable even when its workflow never promoted a
  public Release. If that tag is obsolete or failed, leave it at its original
  commit and prepare the next patch version from the newly reviewed `main` SHA.
- Before the reusable quality gate or any native build, the `validate` job must
  require one catalog entry for the exact unprefixed tag version and all five
  shipped locales (`en`, `zh-CN`, `ja`, `fr`, and `es`). Missing, mismatched,
  partial, or invalid reviewed notes fail the release.
- `package.json` is the display/handshake version source. Its value,
  `src-tauri/tauri.conf.json`, the root package in `src-tauri/Cargo.toml`, the
  Agent capability manifest, and the Codex plugin manifest must match the tag.
- Required workflow artifact ids:
  `release-macos-aarch64`, `release-macos-x86_64`,
  `release-windows-x86_64`, and `release-linux-x86_64`.
- The generated `latest.json` advertises every built platform. Its `platforms`
  map carries `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and
  `linux-x86_64`, each with its own HTTPS updater URL and signature. The Windows
  auto-update target is the Tauri-signed NSIS installer (`.exe`); the MSI ships
  only as a downloadable installer. The Linux target is the Tauri-signed
  `.AppImage`.
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
  actions. Setup, tests, artifact upload, and the publish job receive neither
  signing secret.
  GitHub distribution defaults the stable endpoint to the repository's
  `releases/latest/download/latest.json` and the allowlist to `github.com`.
  `CUTOUT_UPDATER_STABLE_ENDPOINTS`, `CUTOUT_UPDATER_ALLOWED_HOSTS`, and
  `CUTOUT_UPDATER_BETA_ENDPOINTS` are optional approved-host overrides.
- The protected `release` environment also owns `APPLE_CERTIFICATE` (base64
  PKCS#12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_API_KEY`, `APPLE_API_ISSUER`, and `APPLE_API_PRIVATE_KEY`. These Apple
  secrets are scoped only to macOS preparation, Tauri build, and explicit DMG
  notarization steps; Windows and Linux Tauri steps receive none of them.
- Windows NSIS and MSI installers are intentionally published without
  Authenticode. The Windows job requires exactly one installer of each type and
  verifies `Get-AuthenticodeSignature` status `NotSigned` so the release cannot
  accidentally claim a signer or timestamp that does not exist. Windows users
  may receive Microsoft Defender SmartScreen warnings.
- The Windows NSIS updater artifact still requires the independent Tauri
  updater signature produced by the pinned build action. That sidecar is
  cryptographically verified before workflow-artifact upload, alongside the
  checksums and GitHub provenance generated for every release asset.
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
- The publish job renders the GitHub body to
  `dist/release-notes/github-release.md`, feeds the same exact catalog and
  version into updater generation, and validates the resulting manifest with
  `--require-release-notes` plus `--require-all-locales`. Standard
  `latest.json.notes` remains readable English for existing clients, while
  `cutoutReleaseNotes` carries the matching bounded localized projection.
  GitHub publication uses `gh release create --notes-file`; generated PR notes
  and shell-interpolated multiline release copy are forbidden.
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
  An ESM module imported by Vitest must remain shebang-free; executable command
  entrypoints use a separate wrapper so transforms cannot reinterpret a shebang
  after generated imports on Windows.
  Tests that launch real compilers, browsers, packagers, or other child
  processes declare an explicit per-test timeout sized for the slowest supported
  CI platform. Do not rely on the framework's short default timeout, raise the
  global timeout, or skip a platform to hide normal process startup variance.
  Screenshot baselines run on macOS Chrome, while platform-neutral contract
  tests remain matrixed across macOS, Linux, and Windows.
- AppShell initializes once, delays automatic checking for 8 seconds, and starts
  the shared lifecycle scheduler. Successful automatic checks are gated for six
  hours; periodic scheduling adds 0-30 minutes of jitter and focus, visible,
  and online recovery triggers may retry eligible checks.
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
| Exact-version catalog entry is absent, invalid, or missing a shipped locale | Stop in `validate`; run no quality or native build |
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
| Windows NSIS or MSI count differs from one | Do not upload the Windows workflow artifact |
| NSIS or MSI unexpectedly carries an Authenticode signature | Fail until the signing policy and verification contract are deliberately updated |
| GitHub provenance attestation fails | Keep the Release unpublished |
| Catalog-backed updater projection or deterministic GitHub body generation fails | Keep the Release unpublished |
| Release tag already exists, with or without a public Release | Refuse tag movement or reuse; prepare a new patch version |
| Upload is incomplete | Release remains a draft, not a public success |
| Browser/dev build has no updater config | Home action remains absent |
| Check returns no newer release | Home action remains absent |
| Download fails after discovery | Keep Home action so retry remains reachable |
| Active Agent run exists at install | Existing orchestrator blocks restart |

### 5. Good/Base/Bad Cases

- Good: all four matrix entries finish, collected names include their platform
  and architecture, `latest.json` carries all four platform entries, updater
  evidence validates for each, and one draft is promoted.
- Good: one reviewed catalog entry produces readable English updater
  notes, the matching five-locale extension, and a deterministic GitHub body
  consumed through `--notes-file`.
- Good: Tauri receives an Apple `Accepted` result for the app, the workflow
  receives a separate `Accepted` result for the DMG, and both artifacts report
  `source=Notarized Developer ID` before upload.
- Good: the Windows job proves the NSIS and MSI are intentionally unsigned,
  verifies the independent Tauri updater signature for NSIS, and publishes the
  same checksums and GitHub provenance evidence as every other platform.
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
- Bad: an unpublished or failed tag is force-moved to a newer commit and reused
  because GitHub has no public Release for it yet.
- Bad: release CI uses `--generate-notes`, accepts a partial locale set, or
  supplies multiline/structured release notes through shell interpolation.

### 6. Tests Required

- `scripts/validate-release-version.test.ts`: synchronized, drift, tag mismatch,
  and malformed semantic versions.
- `scripts/collect-release-assets.test.ts`: architecture-qualified duplicate
  basenames, required outputs (including per-platform updater bundles + `.sig`),
  symlink rejection, directory boundaries, and deterministic SHA-256 output.
- `scripts/release-workflow.test.ts`: four-entry matrix, validate/build/publish
  dependency graph, least-privilege permissions, isolated macOS/non-macOS Tauri
  actions pinned to a reviewed commit, all Action SHA pins, Apple/updater secret
  scoping, temporary key handling, app-before-DMG notarization ordering, macOS
  signature/notarization verification, explicit unsigned Windows validation,
  exact-version/all-locale release-note validation, catalog-backed updater
  generation and strict validation, deterministic notes-file publication,
  attestation, single-authority publication, draft promotion, and multi-platform
  manifest generation.
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
- `src/updater/{runtime,service,orchestrator,auto-check-scheduler,update-notifications}.test.ts`:
  narrow Tauri commands, current package version, six-hour eligibility,
  single-flight checks, lifecycle scheduling, notification dedupe/deferral,
  permission opt-in, progress, cancellation, recovery gates, and
  install/restart ordering.

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

#### Correct

```yaml
- name: Verify updater artifact signature
  run: verify-updater-signature <nsis> <nsis.sig>
- name: Verify intentionally unsigned Windows installers
  run: require-authenticode-status NotSigned <nsis> <msi>
```

The updater signature authenticates the exact NSIS bytes while the explicit
`NotSigned` check keeps the separate Authenticode distribution claim truthful.

Do not create a second updater controller inside the Home sidebar or implement
a direct `fetch()` against GitHub there. That would duplicate the persisted
check interval and bypass the Rust signature/allowlist boundary. Subscribe to
the AppShell-owned controller and route the user to Updates & Support instead.

## Distribution Claim Boundary

A Tauri updater signature proves updater artifact authenticity. It does not
prove Apple notarization, Windows Authenticode, Linux repository publication,
or clean-machine installation. Those claims require separate credentials and
verification evidence under `docs/RELEASE_CHECKLIST.md`.

## Scenario: Lifecycle-aware update discovery and notifications

### 1. Scope / Trigger

Apply whenever the updater controller, automatic-check scheduling, persisted
update preferences, notification bell projection, native notification plugin,
or update Settings/Home UI changes.

### 2. Signatures

```ts
startUpdateAutoCheckScheduler(
  controller: { autoCheck(delayElapsed: boolean): Promise<void> },
  options?: UpdateAutoCheckSchedulerOptions,
): () => void

createDesktopUpdateOrchestrator(input: {
  prepareRecoverySnapshot(): Promise<boolean>
  storage?: Pick<Storage, "getItem" | "setItem">
  getAppVersion?: () => Promise<string>
}): DesktopUpdateController

DesktopUpdateController.setSystemNotificationsEnabled(
  enabled: boolean,
): Promise<boolean>

DesktopUpdateController.deferUpdateNotification(
  notificationId: string,
): readonly LocalNotification[]
```

### 3. Contracts

- `createUpdateOrchestrator` owns updater state, the successful-check timestamp,
  and one shared in-flight check promise for manual and automatic callers.
- `startUpdateAutoCheckScheduler` waits 8 seconds before any trigger can check,
  then schedules 6 hours plus 0-30 minutes of jitter. Focus, `online`, and
  visible-document recovery call only `controller.autoCheck(true)`.
- Failed checks do not write `lastCheckedAt`; successful checks do. Cleanup
  removes the startup/periodic timers and every lifecycle listener.
- Release identity is `update:<channel>:<version>`. The separate
  `cutout.updates.notifications.v1` ledger survives bell clearing, replaces an
  older update row, and records a 24-hour `deferredUntil` reminder.
- The Home update action remains visible from updater state while bell clearing
  or deferral affects only the projected notification row.
- Native notifications are opt-in. Only the Settings toggle may request OS
  permission, denial leaves the preference off, and delivery occurs only while
  the app is not both visible and focused.
- JavaScript receives only `notification:allow-is-permission-granted`,
  `notification:allow-request-permission`, and `notification:allow-notify`.
  Release discovery/download/install remains behind Cutout's Rust updater
  commands and signature/allowlist policy.
- Every new visible updater string, notification body, action label, status,
  and accessibility label must have a Lingui ID and non-empty translation in
  all shipped catalogs. Before locale activation, notification text falls back
  to English instead of blocking update projection.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Startup delay has not elapsed | Ignore timer and lifecycle triggers |
| Successful check is less than six hours old | Skip the automatic backend check |
| Manual and automatic checks overlap | Reuse one in-flight operation |
| Backend check fails | Publish retryable error; do not advance eligibility |
| Same channel/version is rediscovered | Do not add or resend a notification |
| Newer channel/version is discovered | Replace the prior update notification |
| Reminder is less than 24 hours old | Keep the bell row hidden |
| Reminder has expired and check is eligible | Recreate one unread row and re-alert |
| Permission is denied or revoked | Keep bell alert; disable native preference |
| App is visible and focused | Suppress native delivery; keep bell alert |
| Lingui locale is not active yet | Use English notification fallback |

### 5. Good / Base / Bad Cases

- Good: a long-running background app regains network after six hours, finds a
  signed release, creates one localized bell row, and sends one opted-in native
  notification.
- Base: the app checks at startup, remains current, and lifecycle triggers inside
  six hours cause no backend request.
- Bad: each component owns a timer or fetch, clearing the bell resets dedupe, or
  enabling automatic checks implicitly requests native notification permission.

### 6. Tests Required

- Scheduler tests assert startup gating, both jitter bounds, periodic recursion,
  focus/visibility/online triggers, rejected checks, and complete cleanup.
- Orchestrator tests assert six-hour boundary, invalid timestamp recovery,
  manual/automatic single-flight behavior, and failure timestamp semantics.
- Notification tests assert per-version dedupe, stale replacement, clear-safe
  ledger persistence, exact 24-hour deferral, expired re-alert, permission
  grant/denial/revocation, foreground suppression, and English fallback.
- UI tests assert Settings navigation, explicit permission-backed toggle,
  localized clear/reminder actions, and persistent Home update visibility.
- `pnpm i18n:ci`, catalog parity tests, TypeScript/build, Rust tests, Agent/plugin
  validation, and updater release-contract tests are release blocking.

### 7. Wrong vs Correct

#### Wrong

```ts
window.setInterval(() => fetch("https://github.com/.../latest.json"), 60_000)
clearLocalNotifications() // also clears update-version dedupe
requestPermission() // during startup
```

#### Correct

```ts
const stop = startUpdateAutoCheckScheduler(appShellUpdateController)
controller.subscribe(projectAvailableReleaseOnce)
await controller.setSystemNotificationsEnabled(true) // explicit user toggle
```

The scheduler coordinates eligibility through the existing controller, the
notification ledger is independent from bell history, and the Rust updater
remains the only release trust boundary.

## Scenario: Localized release notes across updater and installed-app state

### 1. Scope / Trigger

Apply whenever release copy, updater manifest generation, the native updater
snapshot, the Updates & Support surface, or post-upgrade read state changes.
This is one cross-layer contract: editorial data must not become a second
network or trust path.

### 2. Signatures

```ts
interface LocalizedReleaseNotes {
  readonly protocol: "cutout.release-notes.v1"
  readonly version: string
  readonly releasedOn: string
  readonly locales: Readonly<Record<string, LocalizedReleaseNotesLocale>>
}

interface ReleaseNotesReadStateV1 {
  readonly protocol: "cutout.release-notes.read-state.v1"
  readonly observedVersion: string
  readonly pendingVersion?: string
  readonly dismissedVersion?: string
}

validateLocalizedReleaseNotes(value: unknown, expectedVersion?: string):
  LocalizedReleaseNotes | undefined
initializeReleaseNotesLifecycle(input: ReleaseNotesLifecycleInput):
  ReleaseNotesLifecycleDecision
```

Release tooling accepts an exact unprefixed `--version`, a repository catalog,
and optional `--require-all-locales`. Updater generation writes readable
English to standard `notes` and the typed projection to
`cutoutReleaseNotes`.

### 3. Contracts

- `src/release-notes/catalog.json` is the single reviewed source. The release
  validator, updater manifest, GitHub notes file, and installed-version bundle
  select the same exact entry.
- Standard `latest.json.notes` remains bounded English plain text for old
  clients. Multilingual data is additive and must never be serialized into
  `notes`.
- Rust reads `cutoutReleaseNotes` only from the updater plugin's existing
  `Update.raw_json`, validates it against the discovered version, and exposes
  an optional typed snapshot field. TypeScript validates that projection again
  at its service boundary. Neither layer performs another manifest request.
- Only `en`, `zh-CN`, `ja`, `fr`, and `es` are accepted. Locale records preserve
  English highlight ids and order. Content is bounded plain text; remote URLs,
  markup, arbitrary fields, and unregistered media ids are rejected.
- Vite embeds only the catalog entry whose version equals the package version.
  A normal development build may embed no note; a release build may not pass
  the exact-version catalog gate without one.
- `cutout.release-notes.read-state.v1` is independent from update preferences,
  notification presentation, signature trust, and install eligibility.
  `pendingVersion` survives until dismissal, while manual reopen never changes
  updater state.
- Missing state means clean install, except in the first feature release when
  an existing update-notification ledger contains the exact installed version.
  That read-only evidence seeds one pending note; later releases use semantic
  comparison with `observedVersion`.
- AppShell owns the updater controller and dialog. Settings passes the actual
  trigger element for focus restoration and never creates a second production
  updater owner or fetches release content.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Exact catalog version or reviewed English is absent during release | Stop before quality/native builds |
| Localized extension is missing, malformed, oversized, or version-mismatched | Keep update available; use readable English or hide details |
| Remote locale is unsupported or highlight shape differs | Drop the localized projection without changing install eligibility |
| Installed bundle has no exact current-version entry | Keep the permanent row disabled; do not auto-open |
| Read state is absent on clean install | Store current observed version; do not auto-open |
| First-release notification evidence equals installed version | Store current as observed and pending; auto-open |
| Current semantic version is newer and has bundled notes | Store current as observed and pending; auto-open |
| Process exits before dismissal | Preserve pending; reopen on next launch |
| Dialog is dismissed | Clear matching pending and record matching dismissed version |
| Same version, downgrade, invalid version, or corrupt/unavailable storage | Do not manufacture an upgrade; never block startup |

### 5. Good / Base / Bad Cases

- Good: one reviewed five-locale entry produces old-client English, a bounded
  localized extension, a deterministic GitHub body, and an offline installed
  note; an OTA upgrade opens it once and Settings can always reopen it.
- Base: a current or clean installation has no matching bundled entry, so the
  row is disabled and no dialog appears while update checks continue normally.
- Bad: the frontend fetches GitHub, `notes` contains JSON, malformed localized
  content blocks a signed update, or closing a dialog permanently suppresses a
  future version.

### 6. Tests Required

- Catalog/tooling tests assert exact versions, five-locale parity, bounds,
  unsafe-content rejection, English fallback, deterministic updater text, and
  deterministic GitHub Markdown.
- Manifest and Rust tests assert old-client readable `notes`, raw-response
  projection, strict optional validation, and non-interference with download
  and install state.
- TypeScript tests assert boundary revalidation, clean install, first-release
  migration, semantic/skipped upgrade, crash retry, dismissal, manual reopen,
  downgrade, corrupt storage, storage exceptions, and future-version
  independence.
- Component and Playwright tests assert available/current Settings entries,
  compact and desktop geometry, light and dark themes, long translations,
  Escape, connected-trigger focus restoration, scrolling, and reduced motion.
- Release contract tests assert catalog validation precedes builds and
  publication uses `--notes-file` without weakening single-publisher,
  signatures, allowlists, attestation, or immutable-release checks.

### 7. Wrong vs Correct

#### Wrong

```ts
const notes = await fetch(githubReleaseUrl).then((response) => response.text())
localStorage.setItem("update-dismissed", currentVersion) // before the dialog closes
```

#### Correct

```ts
const release = appShellUpdateController.getState().release
const note = release?.localizedNotes ?? release?.notes
const decision = initializeReleaseNotesLifecycle({
  storage: localStorage,
  currentVersion: PRODUCT_VERSION,
  bundledNotes: BUNDLED_CURRENT_RELEASE_NOTES,
})
```

The updater remains the only network/trust boundary, and the independent local
state controls presentation only.
