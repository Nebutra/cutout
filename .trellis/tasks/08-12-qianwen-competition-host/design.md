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

The dependency-free HTTP transport supports direct TLS and a platform-provided
`HTTPS_PROXY` through native CONNECT. The final DashScope authority remains
allowlisted, TLS verification remains enabled after tunnel establishment,
credential-bearing or unsafe proxy URLs fail closed, and cancellation closes
both pending requests and accepted tunnels.

Multimodal QA binds each review to the retained pixel identity anchor and the
fixed semantic role. A failed review may schedule only the bounded repair for
that node; valid siblings and their checkpoints remain reusable. Localization
aliases are compiled through the shared document validator, while ambiguous or
unsupported aliases fail during structured-plan validation before media spend.

## Feedback Promotion

Each score/evaluator finding produces a promotion record with reproducible
fixture, ownership class and evidence. Kernel changes need prototype plus
commerce proof; Profile changes remain removable; filenames, authorization and
evaluator plumbing stay Host-owned.
