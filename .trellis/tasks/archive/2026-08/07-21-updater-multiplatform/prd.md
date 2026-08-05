# PRD — Wire all platforms into the updater manifest

## Problem

`latest.json` (the Tauri updater manifest) currently advertises only the
`darwin-aarch64` platform. Intel macOS, Windows, and Linux already ship
installable bundles in every release, and the build already produces signed
updater artifacts for all four platforms (`createUpdaterArtifacts: true`), but
those artifacts are never written into the manifest's `platforms` map. As a
result, only Apple-silicon Macs receive auto-updates; every other platform is
stranded on whatever version the user manually installed.

The updater artifacts and their `.sig` sidecars are already collected into the
release asset directory with platform-prefixed names — the material is present.
The gap is purely in the manifest generation / validation logic and the release
workflow step that feeds it.

## Goal

Every platform that has a release build (`darwin-aarch64`, `darwin-x86_64`,
`windows-x86_64`, `linux-x86_64`) appears in `latest.json` with its own signed
updater URL, so the Tauri updater serves the correct artifact to each host.

## Scope

In scope:
- Multi-platform `platforms` map in the generated `latest.json`.
- Manifest generation CLI (`update:generate`) accepts one updater artifact per
  platform and derives per-platform url + signature.
- Manifest validation (`update:validate` / `validateUpdateManifest`) checks
  every present platform, not just `darwin-aarch64`.
- Release workflow discovers all four platform updater artifacts and passes
  them to the generator.
- Release asset collection treats each platform's updater artifact + `.sig` as
  required (hard-fail) so a missing platform blocks the release.
- Tests updated to cover the multi-platform contract.

Out of scope:
- Adding new build targets (arm Windows, arm Linux, etc.).
- Changing rollout / rollback / SBOM / provenance semantics beyond extending
  them to enumerate all platform artifacts.
- Changing the endpoint URLs or channel structure.

## Decisions (confirmed with requester)

- **Windows updater target = NSIS** (`.nsis.zip`). The MSI bundle stays in the
  release as a downloadable installer but is not the auto-update target.
- **Missing updater artifact = hard-fail.** If any of the four platforms is
  missing its updater artifact or `.sig`, the release fails rather than
  publishing a partial manifest.

## Platform → updater artifact mapping

| Manifest key     | Collected asset prefix | Updater suffix     |
| ---------------- | ---------------------- | ------------------ |
| `darwin-aarch64` | `macos-aarch64-`       | `.app.tar.gz`      |
| `darwin-x86_64`  | `macos-x86_64-`        | `.app.tar.gz`      |
| `windows-x86_64` | `windows-x86_64-`      | `.nsis.zip`        |
| `linux-x86_64`   | `linux-x86_64-`        | `.AppImage.tar.gz` |

Each has a matching `<artifact>.sig` sidecar.

## Acceptance criteria

- [ ] `update:generate` produces a `latest.json` whose `platforms` object
      contains all four keys, each with an HTTPS `url` and a non-empty
      `signature`.
- [ ] `validateUpdateManifest` fails closed if any present platform has a
      non-HTTPS / non-allowlisted url or an empty/oversized signature — verified
      for every platform, not only `darwin-aarch64`.
- [ ] `collectReleaseAssets` hard-fails when any platform's updater artifact or
      `.sig` is missing.
- [ ] The release workflow's "Generate and validate updater metadata" step
      feeds all four platform artifacts (Windows = NSIS) into the generator.
- [ ] `pnpm test:update-artifacts` and the release/collect workflow tests pass,
      including new assertions for the multi-platform manifest.
- [ ] Backward compatibility: a manifest carrying only `darwin-aarch64` still
      validates (the updater key remains mandatory), so no consumer regresses.
