# Grant ACL permissions for provider-draft and git commands

## Problem

Clicking "检查连接并加载模型" in the provider form fails with
`Command create_provider_draft not allowed by ACL`. Root cause: 22 commands are
registered in `invoke_handler` (`lib.rs`) but appear in **no** ACL permission
set, so Tauri v2's capability system denies them:

- Provider discovery/draft (5): `discover_provider_candidates`,
  `create_provider_draft`, `check_provider_draft`, `import_provider_draft`,
  `cancel_provider_draft`.
- Git (17): `git_capability`, `git_status`, `git_log`, `git_commit_files`,
  `git_commit_diff`, `git_branches`, `git_branch_compare`, `git_diff`,
  `git_stage`, `git_unstage`, `git_preview_mutation`, `git_apply_mutation`,
  `git_commit`, `git_create_branch`, `git_switch_branch`, `git_push_preview`,
  `git_push`.

Pre-existing (present in released 0.1.1); the provider-discovery path was simply
never exercised in-app. The git commands would fail the same way when used.

## Fix

- Add the 5 provider discovery/draft commands to the existing
  `provider-secrets-network` permission set (they probe endpoints and read keys,
  same trust domain).
- Add a new `git-version-control` permission set for the 17 git commands and
  reference it from the main-window capability that already carries the app
  command sets (`capabilities/updater.json`).

## Acceptance criteria

- [ ] Every command registered in `invoke_handler` is present in some ACL
      permission set (0 gaps in the registered-vs-allowed diff).
- [ ] "检查连接并加载模型" runs without the "not allowed by ACL" error.
- [ ] `cargo build` regenerates ACL manifests without unknown-permission errors.
- [ ] No command is granted that isn't registered (no phantom permissions).
