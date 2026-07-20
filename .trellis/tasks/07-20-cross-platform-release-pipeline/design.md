# Cross-platform release pipeline design

## Architecture

The release workflow has three ownership boundaries:

1. `validate` checks the synchronized repository version against the selected
   release tag and runs release metadata tests. It has read-only permissions.
2. `build` is a four-entry native matrix. Each entry builds explicit bundle
   formats and uploads a uniquely named workflow artifact. It never receives
   `contents: write` and never creates a release.
3. `publish` depends on the complete matrix, downloads every artifact, collects
   files under platform-qualified names, generates checksums and updater
   evidence, validates the final set, then creates exactly one GitHub Release.

This structure makes GitHub's `needs` graph the transaction boundary: release
publication is impossible when any required platform fails.

## Version contract

`scripts/validate-release-version.mjs` remains the single version-drift check.
It will accept an optional `--expected <version>` argument. CI strips the
leading `v` from the selected tag and passes it as the expected version. The
script validates semantic-version shape and equality across `package.json`,
`tauri.conf.json`, and the root package in `Cargo.toml`.

The workflow does not rewrite versions during a release. A release tag is an
immutable assertion about already-reviewed source, so drift fails closed.

## Build matrix

| Artifact id | Runner | Target | Bundles |
| --- | --- | --- | --- |
| `macos-aarch64` | `macos-14` | `aarch64-apple-darwin` | `app,dmg` |
| `macos-x86_64` | `macos-14` | `x86_64-apple-darwin` | `app,dmg` |
| `windows-x86_64` | `windows-2022` | native x64 | `nsis,msi` |
| `linux-x86_64` | `ubuntu-22.04` | native x64 | `appimage,deb` |

The official `tauri-apps/tauri-action` is used only as the native build and
workflow-artifact producer. Release inputs are deliberately omitted to avoid
concurrent Release mutation and updater JSON overwrite races.

## Artifact collection

A repository script collects downloaded workflow artifacts rather than relying
on shell-specific glob and rename behavior. Every file is prefixed with its
top-level matrix artifact id. Symlinks and non-files are rejected, duplicate
destination names fail, and the script emits a sorted `SHA256SUMS` file.

The macOS Apple Silicon updater archive and sidecar are selected from the
collected output. Existing `update-artifacts.mjs` generates the Cutout-specific
stable/beta manifest, SBOM, provenance, rollout, and rollback documents. Those
documents are validated before GitHub publication.

## Permissions and secrets

- Workflow default: `contents: read`.
- Publish job only: `contents: write`.
- `TAURI_SIGNING_PRIVATE_KEY` and its password remain GitHub secrets and are
  available only to protected release jobs.
- Updater public configuration remains GitHub variables.
- No new secret value or private key is committed.

Platform code signing/notarization is separate from the Tauri updater
signature. This task preserves that truth rather than treating an updater
signature as Apple notarization or Windows Authenticode.

## Compatibility and rollback

The existing macOS updater remains compatible because the published static
manifest still targets its signed `.app.tar.gz`. Windows and Linux installers
become downloadable release assets, but automatic updater support is not
claimed until the manifest generator and runtime are explicitly validated for
those platform keys.

Rollback is operational: delete a draft/failed Release and tag, correct the
source version or workflow, then recreate the tag. Published immutable assets
are never silently replaced by a partial matrix job.

## Desktop update discovery

`AppShell` already owns one `DesktopUpdateController`, initializes it, and
performs the delayed 24-hour-gated automatic check. That same controller is
passed through `ProjectHome` and `WorkspaceSidebar` to `SidebarAccount`.

`SidebarAccount` subscribes to controller state. It renders no placeholder and
reserves no visible control when no update exists. For `available`,
`downloading`, `ready`, and `installing`, it renders a compact update action
between the account menu and notification bell. Selecting it calls the existing
Settings UI context with `{ section: 'updates-support', anchor: 'updates' }`.

The indicator never invokes GitHub directly and never downloads by itself.
`UpdatesSection` remains the sole user control surface for download, progress,
cancel/retry, recovery snapshot, Agent Host shutdown, install, and relaunch.
