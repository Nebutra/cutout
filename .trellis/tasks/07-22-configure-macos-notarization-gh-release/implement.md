# Implementation Plan

- [x] Update the release workflow with macOS-only Apple credential preparation.
- [x] Split Tauri build execution so Apple secrets are unavailable to Windows
  and Linux jobs.
- [x] Add signed/notarized app and DMG verification before upload.
- [x] Extend release workflow tests for missing-secret gates, credential scope,
  notarization key handling, and ticket verification.
- [x] Update the release checklist with the exact protected secret contract.
- [x] Run focused workflow tests, `pnpm agent:validate`, and relevant release
  validation.
- [x] Re-authenticate GitHub CLI and confirm write/admin access to
  `Nebutra/cutout`.
- [x] Issue, install, export, and CI-import-test the Developer ID identity.
- [x] Obtain and upload the App Store Connect notarization API key, issuer ID,
  and `.p8` content.
- [x] Generate and upload the Tauri updater key pair configuration.
- [x] List protected environment configuration by name and verify no secret
  files were added to git.
- [ ] Exercise a protected release workflow without publishing an unreviewed
  version.

## Validation Commands

```bash
pnpm exec vitest run scripts/release-workflow.test.ts
pnpm agent:validate
pnpm test:update-artifacts
security find-identity -v -p codesigning
gh secret list --env release --repo Nebutra/cutout
gh variable list --env release --repo Nebutra/cutout
```

## Risk and Rollback Points

- Do not generate or overwrite production updater keys until GitHub upload is
  ready; losing the private key prevents signing future updates for installed
  clients that trust its public key.
- Do not publish a release from the setup workflow. Publication remains gated by
  a reviewed, version-matched `v<semver>` tag.
- Keep generated PKCS#12, `.p8`, and updater private-key files outside the repo
  and delete temporary copies after protected upload succeeds.
