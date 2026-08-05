# Verification: Cutout v0.1.19

Verified on 2026-08-05 (Asia/Shanghai).

## Source and publication

- Reviewed candidate: `fcb52ab617a8fcdca2d76c63603e9f4355f23507`.
- Protected PR: <https://github.com/Nebutra/cutout/pull/59>.
- Remote `main` merge: `2e3f4403746827a2384018d22834f8d65a3ace18`.
- Annotated tag object: `f07030e8d03321764347fb937fa6d651ff80e38a`.
- `v0.1.19^{}` resolves to the exact remote-main merge and was not moved.
- Release workflow: <https://github.com/Nebutra/cutout/actions/runs/30969705634>,
  completed successfully for tag `v0.1.19` and source `2e3f440`.
- Stable Release: <https://github.com/Nebutra/cutout/releases/tag/v0.1.19>,
  published as non-draft and non-prerelease.

## Candidate and public evidence

- Local candidate gates passed: Agent validation, lint, TypeScript, i18n,
  production build, version/catalog checks, release authority/contracts,
  2,038 Vitest tests (15 skipped), 214 Rust tests (1 ignored), and the local
  provider-free macOS release build. Two load-sensitive Playwright timeouts
  passed all four isolated desktop/mobile reruns; both GitHub tag and PR
  quality gates passed on their required matrices.
- The Release contains 17 assets. All 16 entries in `SHA256SUMS` matched their
  downloaded bytes.
- Repository signature verification passed for updater targets
  `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and `linux-x86_64`.
- `latest.json` contains those four signed platform entries, readable English
  updater notes, and the matching five-locale `cutoutReleaseNotes` projection.
- Release metadata, SPDX 2.3 SBOM, and provenance validated. Provenance records
  source `2e3f4403746827a2384018d22834f8d65a3ace18`.
- GitHub build-provenance attestations validated for all 17 assets.

## Apple artifact and local installation

- Public Apple Silicon DMG SHA-256:
  `537d9246699a893a1af631a0969a4d866e418ef32464021b910f3ca912030c1b`.
- The downloaded DMG passed `hdiutil verify`. Its read-only-mounted app and
  the final installed app both passed strict deep `codesign`, Gatekeeper, and
  stapler validation.
- Installed bundle: `/Applications/Cutout.app`, version/build `0.1.19`,
  architecture `arm64`, identifier `com.nebutra.cutout`.
- Identity: `Developer ID Application: ZiXian Tang (2L5YC85FQ7)`; Gatekeeper
  source: `Notarized Developer ID`; Team ID: `2L5YC85FQ7`.
- The launched process resolved to
  `/Applications/Cutout.app/Contents/MacOS/app`.
- Prior version `0.1.18` remains recoverable at
  `/Users/tseka_luk/.Trash/Cutout-0.1.18-before-0.1.19-20260805-111627.app`.
