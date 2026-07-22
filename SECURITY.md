# Security Policy

## Supported releases

Security fixes are provided for the latest published stable Cutout release.
Prereleases and source builds are supported only until a newer build on the same
channel is published.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include credentials,
private project data, signing material, or exploit details in logs or screenshots.
Use GitHub's private vulnerability reporting for this repository:

`https://github.com/Nebutra/cutout/security/advisories/new`

Include the affected version and platform, impact, reproduction steps, and the
minimum evidence needed to validate the report. The maintainers will acknowledge
the report, coordinate validation and remediation privately, and publish an
advisory when users have an actionable fix.

## Release verification

The current desktop release path is `.github/workflows/release-update.yml`. For
releases produced from a revision containing this policy, the workflow requires
a tag reachable from `main`, the complete CI gate, all four native platform
builds, updater signatures, platform signing checks, SHA-256 checksums, and
GitHub build-provenance attestations before publication. Older releases may not
carry every current attestation or platform-signing check.

Verify downloaded assets against `SHA256SUMS` and the GitHub attestation. A Tauri
updater signature proves updater artifact authenticity; Apple notarization and
Windows Authenticode are independent distribution checks and must also be valid.
