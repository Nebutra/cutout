# Cutout Release Checklist

## Version and source

- Treat `package.json` as the product display/handshake version source and synchronize `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the Agent capability manifest, and the Codex plugin manifest through `node scripts/validate-release-version.mjs`.
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
- Issue a `Developer ID Application` certificate from the reviewed CSR, install it with the matching private key, and record the certificate's team identifier in the release evidence. Export the identity as a password-protected PKCS#12 payload outside the repository.
- Configure the protected GitHub `release` environment with `APPLE_CERTIFICATE` (base64 PKCS#12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY` (App Store Connect key ID), `APPLE_API_ISSUER`, and `APPLE_API_PRIVATE_KEY` (complete `.p8` content). Do not store `APPLE_API_KEY_PATH`; the workflow creates it under `$RUNNER_TEMP` with mode `0600` and removes it after the macOS build.
- Confirm Apple secrets appear only on the macOS credential-preparation, Tauri app notarization build, and explicit DMG notarization steps. Windows and Linux jobs receive no Apple certificate, identity, issuer, key ID, private-key content, or private-key path.
- Obtain SignPath Foundation approval and configure the protected `release` environment with `SIGNPATH_API_TOKEN`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`, and `SIGNPATH_WINDOWS_CERTIFICATE_THUMBPRINT`. Do not store or import a Windows certificate or private key in GitHub.
- Upload the fixed-name unsigned NSIS/MSI workflow artifact, sign it through the immutable pinned SignPath action, restore exactly one returned installer of each type, then regenerate and verify the Tauri updater sidecar for the final signed NSIS bytes.
- Require a `Valid` `Get-AuthenticodeSignature` result, the configured signer thumbprint, code-signing EKU, and a trusted timestamp for both NSIS and MSI before Windows artifacts are uploaded.
- Run `scripts/release-macos.sh --distribute`; missing signing or notarization prerequisites must hard fail.
- Require the GitHub macOS build to wait for Tauri's app notarization and stapling, submit the subsequently created DMG separately with `xcrun notarytool submit --wait`, staple the accepted DMG ticket, then validate both the `.app` and `.dmg` with `codesign --verify --deep --strict --verbose=2`, Gatekeeper (`spctl`), and `xcrun stapler validate` before artifact upload.
- Inspect release evidence with `codesign -dvvv --entitlements :-` and re-run Gatekeeper assessment on a clean machine.

## DMG and updater policy

- Ship `.app` and `.dmg` from this macOS gate.
- Verify `CI=true npm run tauri build -- --bundles app,dmg` succeeds headlessly without requiring Finder automation or a globally installed package manager.
- Release builds expose the desktop updater only when a public key, stable HTTPS endpoints, and an exact endpoint host allowlist are compiled in. Process-environment overrides are limited to debug/test builds. Never commit the private signing key.
- Inject `CUTOUT_UPDATER_PUBKEY` as the complete two-line minisign public-key file content, including its `untrusted comment:` line. Release CI validates it and generates the ignored Tauri CLI override; never populate the committed fail-closed updater config. GitHub releases default the stable endpoint to `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` and the exact host allowlist to `github.com`; override `CUTOUT_UPDATER_STABLE_ENDPOINTS` or `CUTOUT_UPDATER_ALLOWED_HOSTS` only for an approved HTTPS distribution host. `CUTOUT_UPDATER_BETA_ENDPOINTS` remains optional and must point to separately published beta metadata. The runtime rejects non-HTTPS and non-allowlisted manifest or artifact hosts.
- Exercise check, verified download, Agent Host checkpoint, install, and relaunch against a staged signed release. Signature verification remains mandatory in the official Tauri updater plugin.
- Keep `bundle.createUpdaterArtifacts` enabled and require the macOS `.app.tar.gz` plus sibling `.sig`; the static manifest embeds signature content, never a path or URL.
- Generate a dedicated password-protected Tauri updater signing key pair. Store `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only as protected `release` environment secrets, and store the complete public key as the `CUTOUT_UPDATER_PUBKEY` environment variable. Missing signing material must hard fail.
- Scope the updater private key and password only to the exact commit-pinned Tauri build actions that sign bundles. Do not expose them to checkout, package installation, tests, caches, artifact upload, metadata generation, or Release publication.
- Before uploading each platform workflow artifact, require exactly one updater artifact and sibling `.sig`, then cryptographically verify the sidecar against `CUTOUT_UPDATER_PUBKEY` with the repository-owned Rust verifier. Metadata generation must consume verified sidecars without receiving the private key.
- Generate and validate separate stable/beta manifests with SHA-256, SPDX SBOM, local provenance metadata, and GitHub build-provenance attestations. Rollout and rollback metadata are not published because the desktop updater does not consume those policies.
- Run `pnpm test:update-artifacts` for update, 204/no-update, downgrade rejection, bad signature, bad URL, SBOM, provenance, and all-platform manifest cases.

## Cross-platform GitHub Release

- Require all four native build artifacts before publication: Apple Silicon macOS, Intel macOS, x64 Windows, and x64 Linux.
- Use explicit bundle targets per platform (`app,dmg`, `nsis,msi`, and `appimage,deb`); do not reuse the macOS defaults on Windows or Linux.
- Matrix jobs have read-only repository access and upload uniquely named workflow artifacts. Only the final job receives `contents: write`.
- Pin every Action and toolchain action to a reviewed 40-character commit SHA. Configure repository Actions policy to require SHA pinning and allow only reviewed actions.
- Make `.github/workflows/ci.yml` the reusable release quality gate; native builds cannot start until its native, contract, build, lint, test, and browser jobs pass against the exact validated tag commit. Require its stable `Quality gate` aggregate context on `main` instead of matrix-generated check names.
- Protect the `release` environment with required reviewers and admin bypass disabled, and restrict deployments to `main` plus protected release tags. Enable self-review prevention as soon as an independent trusted reviewer exists; until then, record the personnel prerequisite instead of claiming independent approval. Protect `main` and `v*` through repository rulesets.
- Collect platform outputs under collision-free names, require expected installer/updater files, reject symlinks, and publish `SHA256SUMS` with the release.
- Reject multiple updater artifacts or signature sidecars for one platform; never select the first filesystem match.
- Create the GitHub Release as a draft, upload and validate the complete asset set, then make it public. Never publish a partial matrix as a successful release.
- Require `scripts/validate-release-authority.mjs` to prove that only the final `publish` job can mutate Releases or receive `contents: write`.
- Attest every collected release asset with `actions/attest-build-provenance` after checksums are finalized and before the draft Release is created.
- The generated updater manifest must include and verify the signed updater artifact for Apple Silicon macOS, Intel macOS, Windows x64, and Linux x64 before publication. Native installer availability alone is not update evidence.
- The packaged desktop app checks after an 8-second startup delay and at most once per 24 hours by default. Home shows the Update action only after a newer signed release is discovered; the action opens Updates & Support for download and verified install/restart.
- The Tauri updater signature is not Apple notarization or Windows Authenticode. Keep those distribution claims blocked until their independent credentials and verification evidence exist.

## Truthful status

- A local gate proves compilation and tests only.
- A signed build is not notarized until Apple accepts it and the ticket is stapled.
- Without active SignPath approval and protected configuration, report `distribution-blocked`, never `released`.
- Without a protected updater key, published HTTPS manifest, platform signing evidence, and a GitHub attestation, report `updates-unavailable`, never `automatic updates enabled`.
# Local recovery and supportability

- [ ] Verify an authorized opaque workspace handle is required before `agent_host_status` or `agent_host_recover` becomes available.
- [ ] Confirm no caller-controlled path is accepted or displayed and recovery remains fixed to the authorized `.cutout` host state.
- [ ] Exercise clean exit, one unclean startup, repeated-crash safe mode, snapshot hash failure, quota failure, restore collision, partial migration, and orphan blob collection.
- [ ] Verify Reset UI state preserves projects, `.cutout` state, IndexedDB project records, and Global Library content.
- [ ] Preview and export a diagnostic bundle; confirm prompts, content, messages, paths, credentials, provider secrets, and raw host payloads are absent.
- [ ] Confirm UI/Tauri/host events share correlation ids while durable runs/receipts/checkpoints remain authoritative.
- [ ] Confirm host-unavailable UI is truthful in browser-only mode and no remote telemetry, OAuth, or cloud recovery path is implied.
