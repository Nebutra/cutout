# Design - macOS notarization and GitHub release signing

## Credential Boundaries

The repository contains only references to protected configuration. Apple and
Tauri private material lives in the GitHub `release` environment:

| Name | GitHub type | Consumer |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | secret | macOS Tauri build, base64 PKCS#12 |
| `APPLE_CERTIFICATE_PASSWORD` | secret | macOS Tauri build |
| `APPLE_SIGNING_IDENTITY` | secret | macOS Tauri build |
| `APPLE_API_KEY` | secret | macOS notarization |
| `APPLE_API_ISSUER` | secret | macOS notarization |
| `APPLE_API_PRIVATE_KEY` | secret | temporary `.p8` file on macOS runner |
| `TAURI_SIGNING_PRIVATE_KEY` | secret | all updater artifact builds |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | all updater artifact builds |
| `CUTOUT_UPDATER_PUBKEY` | variable | release-only Tauri config |

`CUTOUT_UPDATER_ALLOWED_HOSTS` and stable/beta endpoints remain environment
variables with the existing GitHub defaults.

## Workflow Shape

The build matrix remains unchanged. A macOS-only preparation step validates the
Apple inputs and writes `APPLE_API_PRIVATE_KEY` to
`$RUNNER_TEMP/AuthKey_<key-id>.p8` with mode `0600`, exporting only its path via
`GITHUB_ENV`.

The current Tauri action is split into a macOS invocation and a non-macOS
invocation. The macOS invocation receives Apple secrets and relies on Tauri
2.11.4's built-in signing, notarization wait, and stapling behavior. The
non-macOS invocation receives no Apple credential values.

After the macOS build, a verification step resolves the generated `.app` and
`.dmg`, checks the Developer ID signature with `codesign`, checks Gatekeeper
acceptance with `spctl`, and validates stapled tickets with `xcrun stapler`.
Artifacts are uploaded only after these checks pass.

## Operational Flow

1. Issue and install the Developer ID certificate from the supplied CSR.
2. Export the matching identity to a password-protected PKCS#12 file.
3. Create or select an App Store Connect API key and retain its key ID, issuer
   ID, and one-time-downloaded `.p8` content.
4. Generate a dedicated Tauri updater signing key pair.
5. Re-authenticate `gh`, create/confirm the `release` environment, and populate
   environment secrets and variables.
6. Run repository validation locally.
7. Push the reviewed workflow change and exercise it only from an existing
   version-matched tag or after a separate release-version review.

## Rollback

Workflow changes can be reverted without invalidating credentials. If a secret
is exposed outside GitHub masking, revoke the App Store Connect key, revoke and
replace the Developer ID certificate when necessary, and rotate the Tauri
updater key before publishing any artifact. Rotating the updater key also
requires shipping the new public key in a trusted application build.
