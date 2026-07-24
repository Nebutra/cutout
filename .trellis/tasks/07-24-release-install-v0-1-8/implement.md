# Implementation plan

1. Verify the local `0.1.7` installation, the `v0.1.7` public release, release
   environment readiness, and absence of `v0.1.8`.
2. Push the troubleshooting UX branch, open a PR, monitor CI/CodeQL, and merge
   it to `main`.
3. Rebase the release branch onto `github/main`.
4. Bump `0.1.7` to `0.1.8` in synchronized manifests, README links/plugin
   examples, and add the `0.1.8` changelog entry.
5. Regenerate Codex plugin runtime outputs and review generated diffs.
6. Run version, release-authority, focused release, full frontend, Rust, Agent,
   plugin, bundle, local macOS release, and diff validation gates.
7. Commit release preparation, push `release/v0.1.8`, open a PR, monitor all
   checks, and merge to `main`.
8. Tag the reviewed release merge commit as `v0.1.8`, push the tag, and monitor
   the protected workflow through public publication.
9. Verify complete release assets and updater metadata.
10. Download and verify the public arm64 DMG, quit Cutout, replace `0.1.7` with
    `0.1.8`, and verify version, architecture, signature, Gatekeeper, and
    notarization ticket.

## Validation commands

- `node scripts/validate-release-version.mjs --expected 0.1.8`
- `node scripts/validate-release-authority.mjs`
- `pnpm agent:validate`
- `node scripts/validate-product-skills.mjs`
- `pnpm plugin:validate`
- `pnpm lint`
- `pnpm exec tsc -b --pretty false`
- focused release and plugin Vitest suites
- `pnpm test`
- `pnpm build`
- `pnpm bundle:gate`
- release-critical Playwright tests
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`
- `scripts/release-macos.sh --local`
- `git diff --check`

## Risk And Rollback Points

- Never tag a branch commit that is not the reviewed `main` release merge.
- Never install from a workflow artifact or draft release.
- Validate the new DMG before moving the old app and retain the old bundle until
  the replacement passes every macOS verification command.
- Do not delete or migrate local user data.
