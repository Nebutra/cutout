# Configure macOS notarization and GitHub release signing

## Goal

Make the existing Cutout GitHub release workflow capable of producing Apple-signed,
Apple-notarized, stapled macOS bundles and Tauri-signed updater artifacts without
committing private credentials.

## Background

- The supplied CSR is valid and belongs to `Tseka Luk <2548698430@qq.com>`.
- The current macOS login keychain has no valid code-signing identity, so a
  `Developer ID Application` certificate still needs to be issued and installed.
- `.github/workflows/release-update.yml` already creates updater artifacts for
  four platforms and publishes a GitHub Release through the protected `release`
  environment.
- The workflow currently supplies Tauri updater signing inputs but does not
  supply Apple certificate or App Store Connect API inputs to the macOS build.
- `gh auth status` reports that the saved GitHub token for `TsekaLuk` is invalid.
- Tauri CLI 2.11.4 requires `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY`,
  `APPLE_API_ISSUER`, and `APPLE_API_KEY_PATH` for certificate signing and
  API-key notarization.

## Requirements

- Use the supplied CSR to issue a `Developer ID Application` certificate in an
  active Apple Developer team and install it with its matching private key.
- Export the identity as a password-protected PKCS#12 payload for GitHub Actions.
- Use an App Store Connect API key with permission to submit notarization jobs;
  keep the `.p8` content in a GitHub environment secret and materialize it only
  under the runner temporary directory.
- Generate a password-protected Tauri updater signing key pair. Store the private
  key and password only in GitHub environment secrets and store the complete
  public key as the existing `CUTOUT_UPDATER_PUBKEY` environment variable.
- Limit Apple secrets to macOS workflow steps. Windows and Linux builds must not
  receive the certificate or notarization private key.
- Make macOS release builds hard-fail when Apple signing or notarization inputs
  are absent.
- Verify the resulting app and DMG with `codesign`, Gatekeeper, and `stapler`
  before uploading release artifacts.
- Preserve the current fail-closed updater config and four-platform release
  matrix.
- Never commit certificate, `.p8`, PKCS#12, updater private-key, or password
  material.

## Acceptance Criteria

- [x] A valid `Developer ID Application` identity is present locally and its
  team identifier is recorded without exposing private material.
- [x] The `release` GitHub environment contains all Apple and Tauri updater
  secrets/variables required by the workflow.
- [x] macOS jobs receive Apple credentials; Windows and Linux jobs do not.
- [x] The workflow creates the App Store Connect `.p8` file with owner-only
  permissions under `$RUNNER_TEMP` and removes it when the job ends with the
  runner.
- [x] The macOS build waits for notarization and stapling, then validates the
  app and DMG before artifact upload.
- [x] Release workflow contract tests cover the Apple secret boundary and
  verification steps.
- [x] `pnpm agent:validate` and release workflow tests pass.
- [ ] A protected workflow run reaches signed/notarized build execution, or any
  remaining external account prerequisite is reported precisely without
  claiming a successful notarization.

## Out of Scope

- Mac App Store distribution or provisioning profiles.
- Windows Authenticode signing.
- Publishing a new production version without an explicitly reviewed version
  bump, changelog, and tag.
- Storing reusable private credentials anywhere in the repository.

## Notes

- The CSR alone cannot sign or notarize an app; Apple must issue the matching
  certificate and the private key generated with the CSR must remain available
  in the local keychain.
