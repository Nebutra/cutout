# Reinstall local Cutout app

## Goal

Remove the currently installed Cutout application bundle and reinstall the
current signed, notarized stable macOS release without deleting user data.

## Requirements

- Resolve the current public stable release from the official GitHub repository.
- Download the native Apple Silicon DMG and published checksum manifest.
- Verify the DMG digest before changing the installed application.
- Quit only the installed Cutout process and move the existing app bundle to a
  unique recoverable Trash location.
- Do not delete application support, preferences, projects, credentials, or
  other user data.
- Install the verified app into `/Applications/Cutout.app` and launch it.

## Acceptance Criteria

- [x] The downloaded DMG matches the published SHA-256 checksum.
- [x] The prior app bundle is preserved in a unique Trash backup directory.
- [x] The installed bundle version matches the current stable release.
- [x] Code signature, Gatekeeper assessment, and stapled notarization validate.
- [x] Cutout launches from `/Applications/Cutout.app/Contents/MacOS/app`.

## Notes

- This is a local operational task; no source-code or product-contract changes
  are expected.
