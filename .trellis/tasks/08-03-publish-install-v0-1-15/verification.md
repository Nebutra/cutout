# Release verification

## Source and publication

- Release PR: `https://github.com/Nebutra/cutout/pull/53`
- Reviewed merge commit: `53cb17134fbad182efbdc6f13909879737b9f477`
- Annotated tag: `v0.1.15`, dereferencing to the reviewed merge commit
- Release workflow: `https://github.com/Nebutra/cutout/actions/runs/30777179570`
- Public Release: `https://github.com/Nebutra/cutout/releases/tag/v0.1.15`
- Workflow result: validate, complete quality gate, all four platform builds,
  publication, and provenance succeeded.
- Release state: stable, non-draft, non-prerelease, with 17 uploaded assets.

## Public artifact evidence

- `latest.json` reports `0.1.15` and carries non-empty updater signatures for
  `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and `linux-x86_64`.
- Every updater URL is an HTTPS URL under the approved `github.com` host.
- `provenance.json` identifies GitHub Actions, stable channel, and source
  `53cb17134fbad182efbdc6f13909879737b9f477`.
- `release-metadata.json` covers the same four platforms and references the
  published SPDX SBOM and provenance digests.
- Apple Silicon DMG SHA-256:
  `143462e7ddfbe633ca04afd8ca5d4feee5b74410bfec8a83069d09c09130232d`.
  The downloaded bytes match `SHA256SUMS`, and `hdiutil verify` succeeds.
- The mounted app and DMG both pass stapler validation. The app passes strict
  deep codesign verification and Gatekeeper assessment with source
  `Notarized Developer ID`.
- Signing identity is `Developer ID Application: ZiXian Tang (2L5YC85FQ7)`;
  hardened runtime is enabled and the app executable is native `arm64`.

## Local installation evidence

- `/Applications/Cutout.app` reports bundle versions `0.1.15` / `0.1.15`.
- The installed copy repeats strict codesign, Gatekeeper, and stapler success.
- A background launch succeeds and the running executable resolves to
  `/Applications/Cutout.app/Contents/MacOS/app`.
- The previous `0.1.14` bundle remains recoverable at
  `/Users/tseka_luk/.Trash/Cutout-0.1.14-before-v0.1.15.app`.
