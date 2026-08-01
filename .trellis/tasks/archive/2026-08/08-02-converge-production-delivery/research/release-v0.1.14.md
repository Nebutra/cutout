# Cutout v0.1.14 release evidence

## Integration

- Pull request: `Nebutra/cutout#50`
- Required `Quality gate`: passed, including the real Windows native runner
- Merge commit on GitHub `main`: `40274e5caf20068493cc15f00f51b69b4ee8e614`
- Annotated tag: `v0.1.14`

The first PR run exposed two Windows-only test failures because Rust test
thread names containing `:` were embedded in temporary paths. The tests now
use `tempfile::tempdir()`. Focused packaged-E2E tests, full local Rust tests,
Agent contract validation, the rerun Windows native job, and the aggregate
Quality gate all passed.

## Publication

- Workflow: `Build and Release Cutout`, run `30717428829`
- Result: passed
- GitHub Release: `https://github.com/Nebutra/cutout/releases/tag/v0.1.14`
- Release state: published, stable, not a draft or prerelease
- Release source: merge commit `40274e5caf20068493cc15f00f51b69b4ee8e614`

The release-only full quality gate passed before four isolated platform builds.
The macOS aarch64 and x86_64 jobs passed Developer ID signing, app
notarization, explicit DMG notarization, Gatekeeper, stapler, and updater
signature verification. Windows and Linux updater signatures passed, and the
single publish job emitted `latest.json`, `SHA256SUMS`, SBOM, release metadata,
and provenance before publishing.

## Independent artifact verification

The downloaded aarch64 release assets matched `SHA256SUMS`. `latest.json`
reported version `0.1.14` with distinct `darwin-aarch64`, `darwin-x86_64`,
`windows-x86_64`, and `linux-x86_64` updater entries. Release provenance bound
all four updater artifacts to the merge commit.

The downloaded updater archive was verified twice against the protected
environment public key: once with the repository verifier and once with the
verifier shipped inside the installed app. The downloaded DMG and its app both
passed strict code-sign verification, Gatekeeper with
`source=Notarized Developer ID`, and stapled-ticket validation. The signer was
`Developer ID Application: ZiXian Tang (2L5YC85FQ7)`.

## Local replacement

- Previous installed version: `0.1.13`
- Installed version after replacement: `0.1.14`
- Installed architecture: arm64
- Bundle identifier: `com.nebutra.cutout`
- Previous app recovery location:
  `/Users/tseka_luk/.Trash/Cutout.app-v0.1.13-before-v0.1.14`

The new app was launched hidden with `open -gj`; it remained running without
changing the foreground application. The compiled stable updater endpoint was
present and its public `releases/latest/download/latest.json` URL resolved with
HTTP 200. The mounted release DMG was detached after installation.
