# Qianwen competition host package - technical design

## Host Boundary

The package supplies filesystem inventory/projection, benchmark authorization,
DashScope capability adapters, deadline/resource policy and logs. It imports the
same compiled Kernel and Commerce Profile consumed by Desktop. A canonicalizer
removes only declared Host bindings when comparing cross-host semantics.

The root runner validates the prompt and paths, normalizes input through the
Profile, compiles/freeze-authorizes a bounded plan, executes with checkpointed
nodes, evaluates, performs bounded repair and atomically projects the exact
target manifest. Partial output stays non-authoritative and exit status is
nonzero unless the complete manifest validates.

## Packaging And Safety

Tree-shake a Node 22 artifact with vendored dependencies and no install step.
All file paths resolve below validated roots without symlink escape. Network is
an explicit DashScope allowlist; redirects and unreviewed result origins fail.
Logs are structured, secret-redacted and sent to the provided log directory.

## Feedback Promotion

Each score/evaluator finding produces a promotion record with reproducible
fixture, ownership class and evidence. Kernel changes need prototype plus
commerce proof; Profile changes remain removable; filenames, authorization and
evaluator plumbing stay Host-owned.
