# Cross-platform release pipeline

## Goal

Turn Cutout's tag workflow into an atomic cross-platform release pipeline: build
installable desktop artifacts for supported macOS, Windows, and Linux targets,
then publish one GitHub Release only after every required build and release
validation succeeds.

## Background

- `.github/workflows/ci.yml:9-29` tests the JavaScript application on three
  operating systems, but does not compile or package the Tauri desktop app.
- `.github/workflows/release-update.yml:32-83` builds only macOS and uploads
  temporary workflow artifacts. It neither creates a GitHub Release nor ships
  Windows or Linux installers.
- `.github/workflows/release-update.yml:27-29` grants `contents: read`, which is
  insufficient to publish release assets.
- `package.json:5`, `src-tauri/tauri.conf.json:4`, and
  `src-tauri/Cargo.toml:3` are the three release version authorities and must
  agree with the pushed tag.
- Cutout has no Nexus release service. GitHub Release assets plus the existing
  static updater metadata are the repository-supported distribution boundary.

## Requirements

- **R1 Atomic release:** A `v<semver>` tag builds all required targets before a
  release is created. A failed or missing matrix artifact must prevent release.
- **R2 Target matrix:** Build Apple Silicon macOS, Intel macOS, x64 Windows, and
  x64 Linux bundles with explicit platform-appropriate bundle targets.
- **R3 Version invariant:** Fail before native builds when the tag does not
  exactly match the synchronized package, Tauri, and Cargo versions.
- **R4 Isolated builds:** Matrix jobs upload uniquely named intermediate
  artifacts and do not independently create or mutate a GitHub Release.
- **R5 Deterministic collection:** The publish job flattens build outputs into
  collision-free, platform-qualified names and emits `SHA256SUMS`.
- **R6 Signed updater evidence:** Require the protected Tauri updater key,
  preserve signature sidecars, generate the existing stable/beta metadata for
  the supported macOS updater artifact, and validate it before publication.
- **R7 Release publication:** Grant write permission only to the publish job,
  create one GitHub Release for the existing tag, upload all collected assets,
  and mark prerelease semantic versions as prereleases.
- **R8 Honest platform status:** Do not claim Nexus sync, Apple notarization,
  Windows Authenticode, or Linux repository publication without their real
  credentials and verification evidence.
- **R9 Manual safety:** Manual dispatch may validate/build a selected existing
  `v<semver>` ref, but must obey the same version and artifact gates.
- **R10 Desktop discovery:** The packaged desktop app silently checks its
  configured GitHub Release manifest after startup and exposes one update entry
  in the Home sidebar account row only while a release is actionable. Browser
  mode, unavailable configuration, no-update, checking, and check errors with
  no release must render no entry.
- **R11 Reuse verified flow:** The Home entry must use the single AppShell-owned
  update controller and open the existing Updates & Support controls. It must
  not create a second checker, download outside the Rust updater, or bypass the
  recovery/Agent-run installation gates.

## Acceptance Criteria

- [x] Workflow structure visibly resolves to validate -> build matrix ->
  publish, with `needs` enforcing atomicity.
- [x] The build matrix contains `macos-aarch64`, `macos-x86_64`,
  `windows-x86_64`, and `linux-x86_64` entries.
- [x] Tag/package drift fails in a tested release-version validator.
- [x] Collection tests prove duplicate basenames cannot overwrite each other,
  nested inputs cannot escape the output directory, and checksums are stable.
- [x] The publish job validates updater metadata and refuses missing artifacts
  or signature sidecars.
- [x] The GitHub Release receives installers, updater archives/signatures,
  update metadata, and `SHA256SUMS` only after all build jobs pass.
- [x] `pnpm lint`, focused release tests, `pnpm build`, and
  `pnpm agent:validate` pass locally.
- [x] A Home sidebar regression proves the update entry is absent at idle and
  visible for available, downloading, ready, and installing states.
- [x] Selecting the Home update entry opens Settings at Updates & Support using
  the existing controller state and download/install actions.

## Out of Scope

- Nexus or another vendor-specific release mirror.
- Acquiring or storing Apple, Microsoft, Linux repository, or updater private
  keys in the repository.
- Claiming notarization or platform trust when the corresponding protected CI
  credentials and verification steps have not been configured.
- Mobile packages, Linux ARM packages, package-manager feeds, and automatic
  promotion between beta and stable channels.

## Notes

- The requested reference pipeline's final "Sync Nexus Release" stage maps to
  Cutout's GitHub Release and static updater metadata publication, not a
  fictional Nexus integration.
- Focused updater/release tests pass (37 tests). Full lint, type-check,
  production build, bundle gate, `pnpm agent:validate`, and the full test suite
  pass (314 files / 1463 tests).
- A read-only GitHub configuration audit on 2026-07-20 found no Actions secrets,
  variables, or `release` environment in `Nebutra/cutout`. The code is ready,
  but real signed releases remain operationally blocked until an owner creates
  and backs up the Tauri updater keypair, stores `TAURI_SIGNING_PRIVATE_KEY` as
  an Actions secret, and stores `CUTOUT_UPDATER_PUBKEY` as an Actions variable.
