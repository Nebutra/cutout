# Cutout Release Checklist

## Version and source

- Synchronize `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- Require the pushed `v<semver>` tag to equal that synchronized source version; the release workflow never rewrites reviewed source after tagging.
- Record user-visible changes in `CHANGELOG.md` and review generated diffs.
- Run `scripts/release-macos.sh --local` for the provider-free local gate.

## Quality and performance

- Require zero lint warnings, all tests, production frontend build, Rust tests, and `cargo check`.
- Keep the frontend entry at or below 450 KiB and total JS within the repository bundle gate.
- Run Design OS/Governance desktop and mobile Playwright suites.
- Launch a local app bundle and verify startup, project creation, Design OS opening, and clean shutdown before distribution.

## Data safety

- Quit Cutout, then run `scripts/macos-data-drill.sh <controlled-output-dir>`.
- Restore into a disposable macOS user/profile and verify IndexedDB projects, Global Library blobs, settings, Registry receipts, and workflow catalog.
- Keychain secrets are excluded and must be re-authorized. Never restore over a running app or non-empty production directory.

## Signing and notarization

- Keep hardened runtime enabled and entitlements minimal.
- Require a Developer ID Application identity and App Store Connect API credentials.
- Run `scripts/release-macos.sh --distribute`; missing signing or notarization prerequisites must hard fail.
- Validate with `codesign -dvvv --entitlements :-`, `codesign --verify --deep --strict --verbose=2`, and `spctl -a -vv`.
- Notarize the DMG, staple the ticket, and re-run Gatekeeper assessment on a clean machine.

## DMG and updater policy

- Ship `.app` and `.dmg` from this macOS gate.
- Verify `CI=true npm run tauri build -- --bundles app,dmg` succeeds headlessly without requiring Finder automation or a globally installed package manager.
- The desktop updater runtime is unavailable unless a release public key, stable/beta HTTPS endpoints, and an exact endpoint host allowlist are injected at build or process launch. Never commit the private signing key.
- Inject `CUTOUT_UPDATER_PUBKEY`. GitHub releases default the stable endpoint to `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` and the exact host allowlist to `github.com`; override `CUTOUT_UPDATER_STABLE_ENDPOINTS` or `CUTOUT_UPDATER_ALLOWED_HOSTS` only for an approved HTTPS distribution host. `CUTOUT_UPDATER_BETA_ENDPOINTS` remains optional and must point to separately published beta metadata. The runtime rejects non-HTTPS and non-allowlisted manifest or artifact hosts.
- Exercise check, verified download, Agent Host checkpoint, install, and relaunch against a staged signed release before enabling rollout. Signature verification remains mandatory in the official Tauri updater plugin.
- Keep `bundle.createUpdaterArtifacts` enabled and require the macOS `.app.tar.gz` plus sibling `.sig`; the static manifest embeds signature content, never a path or URL.
- Inject `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only through release CI secrets. Missing signing material must hard fail.
- Generate and validate separate stable/beta manifests with SHA-256, SPDX SBOM, provenance, rollback metadata and previous-version compatibility. Deterministic rollout metadata must not modify the signed artifact or its signature.
- Run `pnpm test:update-artifacts` for update, 204/no-update, bad signature, bad URL, unauthorized rollback and staged cohort cases.

## Cross-platform GitHub Release

- Require all four native build artifacts before publication: Apple Silicon macOS, Intel macOS, x64 Windows, and x64 Linux.
- Use explicit bundle targets per platform (`app,dmg`, `nsis,msi`, and `appimage,deb`); do not reuse the macOS defaults on Windows or Linux.
- Matrix jobs have read-only repository access and upload uniquely named workflow artifacts. Only the final job receives `contents: write`.
- Collect platform outputs under collision-free names, require expected installer/updater files, reject symlinks, and publish `SHA256SUMS` with the release.
- Create the GitHub Release as a draft, upload and validate the complete asset set, then make it public. Never publish a partial matrix as a successful release.
- The current static updater manifest is validated for the signed Apple Silicon macOS archive. Windows and Linux installers are downloadable assets, not a claim that automatic updates were validated on those platforms.
- The packaged desktop app checks after an 8-second startup delay and at most once per 24 hours by default. Home shows the Update action only after a newer signed release is discovered; the action opens Updates & Support for download and verified install/restart.
- The Tauri updater signature is not Apple notarization or Windows Authenticode. Keep those distribution claims blocked until their independent credentials and verification evidence exist.

## Truthful status

- A local gate proves compilation and tests only.
- A signed build is not notarized until Apple accepts it and the ticket is stapled.
- With no certificate, report `distribution-blocked`, never `released`.
- Without a protected updater key, published HTTPS manifest and real rollback evidence, report `updates-unavailable`, never `automatic updates enabled`.
# Local recovery and supportability

- [ ] Verify an authorized opaque workspace handle is required before `agent_host_status` or `agent_host_recover` becomes available.
- [ ] Confirm no caller-controlled path is accepted or displayed and recovery remains fixed to the authorized `.cutout` host state.
- [ ] Exercise clean exit, one unclean startup, repeated-crash safe mode, snapshot hash failure, quota failure, restore collision, partial migration, and orphan blob collection.
- [ ] Verify Reset UI state preserves projects, `.cutout` state, IndexedDB project records, and Global Library content.
- [ ] Preview and export a diagnostic bundle; confirm prompts, content, messages, paths, credentials, provider secrets, and raw host payloads are absent.
- [ ] Confirm UI/Tauri/host events share correlation ids while durable runs/receipts/checkpoints remain authoritative.
- [ ] Confirm host-unavailable UI is truthful in browser-only mode and no remote telemetry, OAuth, or cloud recovery path is implied.
