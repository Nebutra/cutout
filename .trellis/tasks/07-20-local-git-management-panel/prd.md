# Local Git management panel

## Goal

Give Cutout users a focused, local-first Git workspace for the work they
actually need while designing and coding: understand repository changes and
history, manage branches, and review pull requests without leaving the project.
The product should borrow the clarity of Fork and JetBrains rather than copy the
full GitKraken feature set.

## Background

- Cutout is a desktop, repo-native design workspace. Git context belongs beside
  project work, not in Settings or in a separate developer-only inspector.
- The current repository contains a GitHub connector declaration and local
  design-review branch concepts, but no real repository Git management panel.
- Local Git operations can work without an account or network. Pull requests
  require a verified, authenticated GitHub host session and must not appear
  connected when one is absent.
- `.cutout` remains authoritative for Cutout Design IR. Git is the source of
  truth only for repository state; the panel must not rewrite generated exports
  or bypass Cutout approval policy.

## Requirements

### Information architecture

- Add one project-level Git surface with four focused views: `Changes`,
  `History`, `Branches`, and `Pull Requests`.
- Keep the default view outcome-oriented: show the current branch, sync state,
  working-tree summary, and the next relevant action without a dense dashboard.
- Use progressive disclosure for commit metadata, file diffs, branch topology,
  remote details, and diagnostics.
- The Git surface must fit the existing Cutout project shell and remain usable
  when the Agent panel is expanded, collapsed, or resized.

### Changes

- Show staged, unstaged, untracked, renamed, conflicted, and ignored-relevant
  repository state using one normalized desktop-host contract.
- Show a text or binary-aware file diff with additions/deletions and safe empty,
  loading, large-file, and error states.
- Never silently stage, discard, commit, push, or overwrite work.

### History

- Show commit history with subject, author, timestamp, abbreviated hash, parent
  relationship, and decorations for the current branch, tags, and remotes.
- Selecting a commit shows its metadata and changed files; selecting a changed
  file shows that commit's diff.
- Pagination or incremental loading must prevent large histories from freezing
  the desktop UI.

### Branches

- Show local and remote branches, current/upstream state, ahead/behind counts,
  and last commit.
- Support creating and switching local branches. Additional mutating branch
  actions follow the explicit product decision recorded during planning.
- Dirty-worktree and conflict preconditions must fail visibly without losing
  user changes.

### Pull requests

- When a verified GitHub host session is available, show pull-request list,
  status, base/head branches, checks/review summary, commits, and changed files.
- Without such a session, show a truthful unavailable state and a path to the
  existing Integrations surface. Do not claim generic Git hosting or OAuth is
  implemented.
- Any remote mutation must be previewed and explicitly confirmed, and its
  success/failure must be read back from the host rather than inferred.

### Safety and Agent boundary

- Reads are automatic and scoped to the currently authorized project root.
- Mutations use typed operations rather than arbitrary shell strings and reject
  absolute paths, path traversal, symlink escapes, unknown repositories, and
  stale repository snapshots.
- The Agent may read Git context and propose typed actions, but it cannot invent
  approval or silently commit, push, merge, close, delete, or discard.
- Secrets and authentication material remain in the desktop host/keychain and
  never enter React state, `.cutout`, logs, receipts, or prompts.

## Out of Scope

- Reimplementing the full GitKraken graph editor, interactive rebase studio,
  submodule manager, LFS administration, stash browser, reflog recovery, or
  multi-host account manager in the first phase.
- Bundling OAuth credentials, creating cloud accounts, or claiming live GitHub
  connectivity without an installed authenticated host.
- Generic arbitrary command execution or exposing a terminal through the panel.

## Acceptance Criteria

- [ ] A repository opens one Git surface containing Changes, History, Branches,
      and Pull Requests, with responsive project-shell navigation.
- [ ] A non-repository project gets a concise empty state and no Git commands are
      attempted.
- [ ] Working-tree status and commit history are read from the authorized local
      repository and remain responsive on large histories.
- [ ] Commit and working-tree file diffs distinguish text, binary, missing, and
      oversized content without rendering unsafe HTML.
- [ ] Local and remote branch state includes current/upstream and ahead/behind
      information; dirty/conflicted preconditions are explicit.
- [ ] Pull Requests never appear available without a verified authenticated
      GitHub host session.
- [ ] Every enabled mutation has a typed preview, an explicit confirmation when
      required, stale-state protection, and a verified result/error receipt.
- [ ] Agent-facing Git context contains normalized metadata and bounded diffs,
      never credentials or unrestricted filesystem access.
- [ ] Rust command tests, TypeScript service tests, component interaction tests,
      and desktop visual/responsive checks cover success, empty, conflict,
      unavailable-host, stale-state, and failure cases.
- [ ] Existing Cutout Agent contract validation remains green; any new external
      Agent operation is synchronized across manifest, protocol, CLI, MCP, docs,
      and product Skills in the same change.

## Notes

- This is a complex cross-layer task and requires `design.md` and `implement.md`
  before activation.
