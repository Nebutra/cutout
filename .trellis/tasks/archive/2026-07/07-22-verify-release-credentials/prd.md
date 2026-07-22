# Verify release credentials

## Goal

Verify local Developer ID identity plus GitHub updater and Apple release credential presence without exposing secret values.

## Requirements

- Verify whether the local macOS Keychain exposes a valid Developer ID
  Application signing identity.
- Verify whether the `Nebutra/cutout` GitHub repository exposes the Secret and
  Variable names required by `.github/workflows/release-update.yml`.
- Report only credential names and presence status. Never read, print, rotate,
  create, import, or replace secret values during this task.
- Preserve all unrelated release/notarization work already present in the
  working tree.

## Acceptance Criteria

- [x] `security find-identity -p codesigning -v` confirms whether a usable
  Developer ID Application identity exists locally.
- [x] Repository Secret presence is checked for updater signing and Apple
  signing/notarization inputs.
- [x] Repository Variable presence is checked for updater public configuration.
- [x] Missing inputs are identified without exposing secret material.

## Out of Scope

- Generating, importing, exporting, or uploading credentials.
- Running a release build or publishing a GitHub Release.
- Editing release workflow or application source files.

## Notes

- This is a lightweight, read-only verification task.
- Local Keychain exposes `Developer ID Application: ZiXian Tang (2L5YC85FQ7)`.
- The GitHub `release` Environment exposes all workflow-required Apple and
  updater Secret names plus the required updater Variable names.
- Secret value validity remains intentionally unverified until a release
  preflight or release workflow is explicitly authorized.
