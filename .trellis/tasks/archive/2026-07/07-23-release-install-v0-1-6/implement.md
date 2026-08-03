# Implementation plan

1. Bump `0.1.5` to `0.1.6` in synchronized source manifests, README links/plugin
   examples, and add the `0.1.6` changelog entry for transient regenerate
   activity bubbles.
2. Regenerate Codex plugin runtime outputs and review generated diffs.
3. Run release-version, focused release, full frontend, Rust, Agent, plugin,
   bundle, and diff validation gates.
4. Commit release preparation, archive the task, push `release/v0.1.6`, open a
   PR, monitor CI/CodeQL, and merge to `main`.
5. Tag the reviewed merge commit as `v0.1.6`, push the tag, and monitor the
   protected release workflow through public publication.
6. Verify the complete release asset inventory and updater metadata.
7. Download and verify the arm64 DMG, quit Cutout, replace the `0.1.5` app with
   `0.1.6`, then verify version, signature, Gatekeeper, and notarization ticket.

## Completion evidence

- Release commit: `ca28859b8a9a25e73fa9fb7c3cc703b4489f2091`
- Reviewed PR: `https://github.com/Nebutra/cutout/pull/29`
- Main merge and tag target: `7c0c50f99d1e2161392dba8cb672cdb3696d9652`
- Release workflow: `https://github.com/Nebutra/cutout/actions/runs/29994562885`
- Public release: `https://github.com/Nebutra/cutout/releases/tag/v0.1.6`
- Apple Silicon DMG SHA-256:
  `2e129e776f28648f2fe2243ffee7406656932d92d5e070629349f0031e0717cd`
- Installed bundle: `/Applications/Cutout.app`, version/build `0.1.6`, ARM64,
  Developer ID team `2L5YC85FQ7`, Gatekeeper accepted, notarization ticket valid.

## Risk And Rollback Points

- Never tag a branch commit that is not the reviewed `main` merge commit.
- Never install from a workflow artifact or draft release; use the final public
  DMG and published checksums.
- Validate the new DMG before moving the old app and retain the old bundle until
  the installed replacement passes every macOS verification command.
- Do not delete or migrate local user data.
