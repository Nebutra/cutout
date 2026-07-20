# Technical Design

## Product Shape

Git is a project-level tool, not an integration settings page or developer
inspector. Add a `Git` rail item beside Agent and Files. Opening it uses the
existing mutually exclusive, resizable workspace dock. The dock contains four
compact views: Changes, History, Branches, and Pull Requests.

The dock is for scanning, filtering, and selecting. The main workspace renders
the selected file diff, commit review, branch comparison, or pull-request review.
This preserves Cutout's result-oriented hierarchy and avoids a dense Git client
inside a narrow sidebar.

## Architecture

```text
Git rail + dock                 main workspace review
       |                               ^
       +---- typed Git service --------+
                       |
              Tauri Git commands
                       |
      authorized workspace handle -> repository root
                       |
        constrained system Git adapter

Pull Requests -> verified GitHub host interface -> GitHub API
```

Local Git and GitHub are separate capabilities. Local status, history, diffs,
branches, stage, commit, and push use the authorized repository root. Pull
requests require an injected authenticated GitHub host; the UI remains truthful
and unavailable when it is absent.

## Native Git Boundary

Use the installed `git` executable behind a constrained Rust adapter for phase
one. This preserves the user's existing Git configuration, credential helpers,
hooks, commit signing, and remote behavior. The adapter is not a terminal:

- every operation is a Rust enum mapped to a fixed executable and fixed argument
  template;
- arguments are passed directly to `std::process::Command`, never through a shell;
- repository roots come only from `RegistryDesktopState` authorization handles;
- relative paths reject traversal, absolute paths, NUL, option-like path values,
  and escapes after canonicalization;
- commands use `--literal-pathspecs`, `--` separators, controlled locale, bounded
  output, timeouts, and cancellation;
- non-interactive reads disable prompts; push may use the user's existing helper
  but credentials are never returned to the WebView;
- capability probing reports missing/unsupported Git rather than attempting an
  install or silently falling back.

## Contracts

### Repository snapshot

Every read returns a snapshot token derived from repository identity, HEAD OID,
index metadata/checksum, and normalized worktree status. Mutating previews bind
to this token. Apply rejects stale tokens and requires the caller to refresh.

```ts
interface GitRepositorySnapshot {
  repositoryId: string;
  snapshotToken: string;
  branch: GitBranchSummary | null;
  upstream: GitUpstreamSummary | null;
  files: readonly GitFileStatus[];
  conflicted: boolean;
}
```

Paths exposed to React are repository-relative display values only. Native roots,
credentials, raw environment values, and credential-helper output never cross IPC.

### Read operations

- `git_capability(workspaceHandle)`
- `git_status(workspaceHandle)`
- `git_diff(workspaceHandle, snapshotToken, target, path, options)`
- `git_log(workspaceHandle, cursor, limit)`
- `git_commit_detail(workspaceHandle, oid)`
- `git_branches(workspaceHandle)`

Diff responses distinguish text, binary, missing, oversized, truncated, and
unsupported encodings. Text is rendered as data, never unsafe HTML. Log and diff
responses have hard item/byte limits and cursors.

### Preview/apply mutations

Mutations use the existing Cutout preview/apply/receipt pattern:

```ts
type GitMutation =
  | { kind: 'stage'; paths: readonly string[] }
  | { kind: 'unstage'; paths: readonly string[] }
  | { kind: 'commit'; message: string }
  | { kind: 'create-branch'; name: string; startPoint?: string }
  | { kind: 'switch-branch'; name: string }
  | { kind: 'push'; remote: string; branch: string; setUpstream: boolean };
```

`git_preview_mutation` returns effects, preconditions, warnings, snapshot token,
and a short-lived opaque plan id. `git_apply_mutation` accepts only the plan id,
snapshot token, and an explicit approval id when required. Stage/unstage may use a
lightweight inline confirmation; commit, branch switch with dirty state, push, and
PR merge require an explicit preview confirmation. The result is read back from
Git and returned as a receipt, never inferred from process exit alone.

Discard, force-push, branch deletion, history rewriting, and PR close are absent
from the contract in phase one.

## GitHub Pull Requests

Extend the existing injected `GitHubIntegrationHost` only when a real host can
provide typed PR list/detail/check/review/merge operations. The merge plan binds
repository, PR number, expected head SHA, merge method, and approval. Apply verifies
the resulting merge state and SHA. Without the host, the Pull Requests view offers
the existing Integrations route and does not render fake data or enabled controls.

OAuth, account creation, and credential persistence remain roadmap work. No GitHub
contract is registered as available merely because a local Git remote exists.

## Frontend State

Create a small Git workspace controller with independent query state per view and
one shared selected review target. Reads are abortable and refresh after focus,
repository file-system events, or successful mutation, with debounce and request
identity protection so stale responses cannot replace newer state.

```text
unavailable | non-repository | loading | ready | refreshing | error
                                      |
                              previewing mutation
                                      |
                           awaiting confirmation
                                      |
                             applying -> receipt
```

The default Changes view shows branch/sync summary, grouped files, and one contextual
primary action. Commit composition appears only when staged changes exist. Diagnostic
details, raw hashes, topology, and command failures use progressive disclosure.

## Agent Boundary

The first product slice does not add public MCP or CLI Git mutations. This avoids
expanding the external Agent contract before the UI/native safety model is proven.
Internal Agent context may consume bounded normalized Git metadata only after a
separate contract review. Any future external operation must update CLI, MCP,
protocol, capability manifest, docs, and Skills together and pass
`pnpm agent:validate`.

## Testing Strategy

- Rust fixture repositories cover unborn HEAD, detached HEAD, staged/unstaged,
  rename, binary, conflict, large diff, branches, ahead/behind, stale preview,
  hooks/signing failure, timeout, missing Git, and hostile paths.
- TypeScript service contract tests cover serialization, error normalization,
  cancellation, cursor behavior, and no native path/secret leakage.
- Component tests cover all dock states, view switching, selection, confirmation,
  unavailable GitHub host, and keyboard/focus behavior.
- Playwright desktop-size and narrow-window checks verify the rail/dock/main review
  layout without overlap or clipped controls.

## Rollback and Compatibility

All native commands and UI entry points are additive. If Git is unavailable or the
project is not a repository, existing Agent, Files, Canvas, and Delivery behavior is
unchanged. No repository metadata is persisted into `.cutout`; only ephemeral UI
selection may be stored. Removing the Git rail item cleanly disables the feature
without migrating user project data.
