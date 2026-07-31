# Design: packaged GUI journey and repair loop

## First-Principles Model

The user is not asking whether isolated functions work. The invariant is that
an already AI-enabled developer can express an idea, obtain coherent design
materials, and turn those materials into matching code without learning or
repairing Cutout's internal pipeline.

The observable journey is:

```text
installed desktop app
  -> discover and authorize local AI source
  -> prove task-capability coverage
  -> conversational intent refinement
  -> preview and approve creative plan
  -> generate/compare Design System candidates
  -> generate complete prototype route suites
  -> deconstruct pages into attributable assets
  -> preview and export independently attributable resource packs
```

Each arrow is a contract boundary. A downstream artifact is accepted only when
its authority and provenance can be traced to the prior boundary.

## Test Isolation

- The final result gate runs in a Tart macOS guest cloned from the pinned
  `ghcr.io/cirruslabs/macos-tahoe-base` image. Tart uses Apple
  Virtualization.framework and the guest is launched with no graphics so the
  host desktop remains untouched.
- Provisioning has three trust zones: a read-only application/build input
  mount, a writable sanitized evidence mount, and guest-local credential state.
  Agent configuration is copied over SSH directly into the guest home with
  owner-only permissions; it is never mounted or returned as evidence.
- Snapshot layering is `public base -> toolchain/Agent premise -> pristine
  Cutout run`. Failed journeys are diagnosed in a disposable clone. The final
  full rerun starts from a fresh clone of the pristine layer so local storage,
  Keychain entries, approvals, artifacts, and Coding workspaces cannot leak
  between attempts.
- Release installation is validated in `/Applications/Cutout.app` while the old
  bundle is moved recoverably to Trash.
- Repository changes live in
  `/tmp/cutout-e2e-complete-user-journey-20260728` on branch
  `test/e2e-complete-user-journey` based on `github/main`.
- Generated benchmark projects and exports use a task-specific directory under
  `/tmp`; no arbitrary workspace path is authorized.
- Existing provider credentials and user data are read through supported native
  discovery/authorization flows and are never copied into evidence.

## GUI Evidence Model

For each journey step record:

- timestamp, app/window, user action, visible result, and elapsed time;
- screenshot path with credential values redacted or absent;
- expected artifact/state and actual artifact/state;
- diagnostic classification and owning code path when the result diverges;
- rerun evidence after a fix.

Computer Use drives Cursor and Cutout. Terminal commands are allowed only for
release validation, repository inspection/fixes, test execution, and inspecting
artifacts already produced through GUI actions. They must not invoke Cutout or
provider generation APIs to skip the user journey.

## Capability Readiness

Readiness is task-based, not inventory-based:

```text
source discovered
  -> credential reusable/authorized
  -> provider route configured
  -> model evidence supports required capability
  -> assignment covers task
  -> one visible non-destructive verification succeeds
```

The required task set is text/reasoning, vision
for material understanding, image generation, and image editing when the
selected slicing/deconstruction path requires it. An image model name is not
hard-coded; the route must have verified image-generation evidence.

## Native Capability Plane

The four missing capabilities are one host boundary, not four unrelated test
exceptions:

```text
reviewed local credential source
  -> native import transaction -> OS credential vault + provider config
  -> Rust-bound authenticated Provider transport
       -> desktop paid-tool executor -> content-addressed visual artifacts
  -> hidden packaged WebView -> normal approval/orchestration/UI state
```

Only opaque provider ids, model ids, statuses, revisions, hashes, receipts, and
sanitized errors cross native IPC. Secret resolution and auth-header assembly
remain native. A legacy plaintext store is migration input only and is removed
after every entry has been committed to the credential vault.

Automatic setup is a native transaction over one exact candidate fingerprint:
rediscover, resolve, authenticated catalog check, store under a new Cutout
provider id, persist the non-secret provider record, and return discovered
models. The renderer chooses assignments only from that verified result; it
does not handle the credential.

## Delivery Boundary

This release ends at previewable, content-addressed UI/UX resource packs.
Coding backends are neither invoked nor represented as evidence of delivery.
Reusable local Agent API credentials feed the normal Cutout Provider route,
while OAuth-only sessions remain isolated until their vendor runtime can be
sandboxed independently.

## Background Packaged Harness

The macOS harness is compiled only for a dedicated packaged-E2E build. The app
creates its normal main WebView hidden, does not activate the process, and the
in-WebView driver dispatches the same DOM events a user would. The scenario is
a fixed versioned fixture, not caller-supplied JavaScript. Results are written
under a host-selected test output root and contain no provider response body,
prompt transcript, local credential location, or secret-bearing error.

The harness exposes phase/result events only. Provider work still passes
through production approval, budget, proxy, artifact, and workspace contracts.
A harness cannot mint approvals: the test fixture carries an
explicit approved budget and the native test build issues the same short-lived
leases used by the product.

The VM controller is infrastructure only: it may boot/stop/clone the guest,
copy the packaged application and reviewed Agent premise, launch the fixed E2E
build, and retrieve sanitized files. It must not call Cutout business commands,
Provider endpoints, or mutate in-app state. A green result is accepted only
when the guest-produced artifact graph proves three Design Systems, three
distinct Agent-authored route suites and attributable resource packs whose
selected visible asset count matches production authority.

## Alternative Suites

Design System candidates already use a generic candidate-set contract, but the
shipped scope truthfully stops at one selected system feeding one prototype
suite. The E2E first exercises the existing contract. If the requested three
corresponding route suites cannot be represented, the fix should extend the
generic candidate-set/promotion model to `prototype-plan` or `prototype-suite`
rather than duplicating state in the React component.

Every suite candidate must bind:

- one Design System candidate and its validated `DESIGN.md`;
- one Agent-authored route graph;
- a complete page set generated from that graph;
- page-level production bindings and resulting slices;
- one export/resource-pack manifest;
- one complete resource-pack manifest and preview projection.

Selection and comparison are explicit. No suite silently becomes authoritative
because it completed first.

## Resource Pack Contract

The user receives a bounded, content-addressed delivery bundle rather than an
oversized chat transcript:

- selected Design System identity, `DESIGN.md`, tokens, and provenance;
- route graph with page purposes, navigation, and interactions;
- prototype page references and dimensions;
- asset manifest grouped by route/region with hashes and intended use;
- page/region attribution, media metadata, preview state, and export receipt.

The context must omit credentials, hidden local paths outside the authorized
workspace, rejected candidates unless explicitly requested, and unsupported
capability claims.

## Throughput Contract

The production DAG is budgeted in paid image invocations, not only logical
artifacts. The Agent resolves page and asset scope from the user's outcome,
business domain, content model, platform conventions, and complete journeys;
Cutout owns no fixed production count, and a user-mentioned number is only
planning evidence until reconciled with that topology. Every resolved graph is
compiled with the same formula:

```text
actual Design System references
  + actual reference-conditioned page attempts
  + actual board-cutout regions
  + actual direct-generate materials
  = resolved baseline image calls
```

A page attempt is one image edit conditioned by the selected Design System and,
for non-anchor pages, one stable suite anchor. The desktop executor preserves
all ordered references and fails closed if any required artifact is missing.
Visual QA remains on the path as evidence but has no default paid re-roll.

Resource extraction follows the Agent-authored material plan. Pages with no
reusable non-UI visuals create no production board; authored board groups use
exact layouts, and standalone artwork remains direct generation. Production
uses bounded Design System and stable-anchor context, does not synthesize a
text-free page first, and schedules independent boards with bounded
concurrency. The page pool owns the board concurrency budget and each active
page runs its groups serially, preventing nested pools from multiplying the
Provider request ceiling. Completion order cannot determine identity or
authority; task ids, provenance, CAS publication, and suite selection retain
their contracts.

The live packaged VM run uses the same formula with each Agent-authored suite's
actual page, board, and standalone-asset counts; it requires no fixed page or
per-page material count. Concurrency is
applied only after removing redundant nodes and bounding
context. Heterogeneous source-level fixtures, including zero-material pages,
protect graph shape without defining a product quota. Focused tests protect
ordered reference delivery and exact page-call counts, and the fresh VM run
measures actual calls, concurrency, and wall-clock phase durations.

## Repair Strategy

When a step fails:

1. preserve the visible failure and artifact state;
2. identify the earliest broken contract boundary;
3. separate provider/model output quality from deterministic orchestration;
4. add a regression at that boundary;
5. fix source and synchronize Agent surfaces when applicable;
6. run focused checks, package a local candidate if needed, and repeat the GUI
   segment from a clean relevant state;
7. repeat the full critical path after all severe defects are resolved.

## Rollback

Repository changes are isolated and can be abandoned without touching the
dirty primary workspace. Application rollback is recoverable by restoring the
previous bundle from Trash. Generated benchmark outputs are non-authoritative
test artifacts and can be removed after evidence review.
