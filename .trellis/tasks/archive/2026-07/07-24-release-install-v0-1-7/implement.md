# Implementation plan

1. Verify `github/main`, the `v0.1.6` public release, the local installed app,
   protected release environment configuration, and the absence of `v0.1.7`.
2. Bump `0.1.6` to `0.1.7` in synchronized source manifests, README links/plugin
   examples, and add the `0.1.7` changelog entry for the preparation projection
   fix.
3. Regenerate Codex plugin runtime outputs and review generated diffs.
4. Run release-version, focused release, full frontend, Rust, Agent, plugin,
   bundle, local macOS release, and diff validation gates.
5. Commit release preparation, archive the task, push `release/v0.1.7`, open a
   PR, monitor CI/CodeQL, and merge to `main`.
6. Tag the reviewed merge commit as `v0.1.7`, push the tag, and monitor the
   protected release workflow through public publication.
7. Verify the complete release asset inventory and updater metadata.
8. Download and verify the arm64 DMG, quit Cutout, replace the `0.1.6` app with
   `0.1.7`, then verify version, architecture, signature, Gatekeeper, and
   notarization ticket.

## Validation commands

- `node scripts/validate-release-version.mjs --expected 0.1.7`
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

- Never tag a branch commit that is not the reviewed `main` merge commit.
- Never install from a workflow artifact or draft release; use the final public
  DMG and published checksums.
- Validate the new DMG before moving the old app and retain the old bundle until
  the installed replacement passes every macOS verification command.
- Do not delete or migrate local user data.

## Completion evidence

- Release preparation commit: `13d4eda18f3131d783e88408e8ec0684ec8889f7`
- Reviewed PR: `https://github.com/Nebutra/cutout/pull/32`
- Main merge and tag target: `be0f152d5145dc94b05fb2b8765f1366793163de`
- Release workflow: `https://github.com/Nebutra/cutout/actions/runs/30073760589`
- Public release: `https://github.com/Nebutra/cutout/releases/tag/v0.1.7`
- Apple Silicon DMG SHA-256:
  `2be7c20799504a282ce53b3d2bfa49e6db536a4aa55cac8cbcd6c2e15c82b91c`
- Installed bundle: `/Applications/Cutout.app`, version/build `0.1.7`, ARM64,
  Developer ID team `2L5YC85FQ7`, Gatekeeper accepted, notarization ticket
  valid.
- Previous ad-hoc `0.1.6` bundle moved to
  `/Users/tseka_luk/.Trash/Cutout.app.v0.1.6-backup` after the verified
  replacement succeeded.
